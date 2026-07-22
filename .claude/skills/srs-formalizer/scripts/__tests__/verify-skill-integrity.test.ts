/**
 * verify-skill-integrity.test.ts - 技能文件完整性校验测试
 *
 * 测试包（8 个用例，每个测试使用独立临时目录）：
 * 1. pack 生成 MANIFEST + .enc
 * 2. 全部匹配 → valid=true
 * 3. 文件被修改 → 检测到 mismatched
 * 4. 文件缺失 → 检测到 missing
 * 5. 新增未知文件 → 检测到 extra
 * 6. --repair 恢复被修改文件
 * 7. --repair 恢复缺失文件
 * 8. 无 MANIFEST.json → error
 */

import { describe, it, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

const SCRIPTS_DIR = path.resolve(import.meta.dirname!, '..');

function runCli(args: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`npx tsx index.ts ${args}`, {
      cwd: SCRIPTS_DIR,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { stdout: stdout.trim(), stderr: '', exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout?.trim() || '',
      stderr: err.stderr?.trim() || '',
      exitCode: err.status || 1,
    };
  }
}

const FIXTURE_SRC = path.resolve(
  import.meta.dirname!, 'fixtures', 'test-skill',
);
const TMP = path.join(os.tmpdir(), `skill-integrity-test-${Date.now()}`);

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

after(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe('pack-skill command', () => {
  const TEST_DIR = path.join(TMP, 'pack-test');

  it('1. packs skill directory and creates MANIFEST.json + .enc backup', async () => {
    copyDir(FIXTURE_SRC, TEST_DIR);

    const { main } = await import('../commands/pack-skill.js');
    const result = await main(['--skill-dir', TEST_DIR]);

    assert.equal(result.status, 'ok');
    assert.ok(result.data);
    const data = result.data as Record<string, unknown>;
    assert.equal(typeof data.total_files, 'number');
    assert.ok((data.total_files as number) > 0);

    // 验证 MANIFEST.json 存在
    const manifestPath = path.join(TEST_DIR, 'MANIFEST.json');
    assert.ok(fs.existsSync(manifestPath));

    // 验证 .enc 备份存在
    const backupPath = path.join(TEST_DIR, 'srs-formalizer-backup.enc');
    assert.ok(fs.existsSync(backupPath));

    // 验证 .enc 文件格式：<iv_hex>:<auth_tag_hex>:<ciphertext_hex>
    const encContent = fs.readFileSync(backupPath, 'utf-8').trim();
    const parts = encContent.split(':');
    assert.ok(parts.length >= 3, '.enc file should have at least 3 colon-separated parts');
    // IV 应该是 32 十六进制字符（16 bytes）
    assert.equal(parts[0]!.length, 32);
    // auth tag 应该是 32 十六进制字符（16 bytes）
    assert.equal(parts[1]!.length, 32);

    // 验证 manifest 内容格式
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    assert.equal(manifest.skill_name, 'pack-test');
    assert.ok(typeof manifest.packed_at === 'string');
    assert.equal(typeof manifest.total_files, 'number');
    assert.ok(manifest.files);

    // 所有文件都应被记录
    for (const relFile of ['SKILL.md', 'prompts/test-prompt.md', 'references/test-ref.md', 'templates/test.template']) {
      assert.ok(relFile in manifest.files, `Missing file in manifest: ${relFile}`);
    }
  });

  it('errors when --skill-dir is missing', async () => {
    const { main } = await import('../commands/pack-skill.js');
    const result = await main([]);
    assert.equal(result.status, 'error');
    assert.ok(result.message?.includes('--skill-dir'));
  });

  it('errors on non-existent directory', async () => {
    const { main } = await import('../commands/pack-skill.js');
    const result = await main(['--skill-dir', '/nonexistent/path']);
    assert.equal(result.status, 'error');
  });
});

describe('verify-skill-integrity command', () => {

  it('2. all files match => valid=true', async () => {
    const testDir = path.join(TMP, 'test-2');
    copyDir(FIXTURE_SRC, testDir);

    // 先打包
    const { main: packMain } = await import('../commands/pack-skill.js');
    const packResult = await packMain(['--skill-dir', testDir]);
    assert.equal(packResult.status, 'ok');

    // 再校验
    const { main } = await import('../commands/verify-skill-integrity.js');
    const result = await main(['--skill-dir', testDir]);

    assert.equal(result.status, 'ok');
    assert.ok(result.data);
    const data = result.data as Record<string, unknown>;
    assert.equal(data.valid, true);
    assert.ok((data.total as number) > 0);
    assert.equal(data.total, data.matched);
    assert.deepEqual(data.mismatched, []);
    assert.deepEqual(data.missing, []);
    assert.deepEqual(data.extra, []);
  });

  it('3. single file modified => detects mismatched', async () => {
    const testDir = path.join(TMP, 'test-3');
    copyDir(FIXTURE_SRC, testDir);

    const { main: packMain } = await import('../commands/pack-skill.js');
    await packMain(['--skill-dir', testDir]);

    // 修改一个文件
    fs.writeFileSync(path.join(testDir, 'SKILL.md'), '# Tampered content\n', 'utf-8');

    const { main } = await import('../commands/verify-skill-integrity.js');
    const result = await main(['--skill-dir', testDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.valid, false);
    const mismatched = data.mismatched as Array<{ file: string; risk: string }>;
    assert.ok(mismatched.length >= 1);
    assert.ok(mismatched.some((m) => m.file === 'SKILL.md'));
    // SKILL.md 应为高风险
    assert.equal(mismatched.find((m) => m.file === 'SKILL.md')?.risk, 'high');
  });

  it('4. file missing => detects missing', async () => {
    const testDir = path.join(TMP, 'test-4');
    copyDir(FIXTURE_SRC, testDir);

    const { main: packMain } = await import('../commands/pack-skill.js');
    await packMain(['--skill-dir', testDir]);

    // 删除一个文件
    fs.unlinkSync(path.join(testDir, 'prompts/test-prompt.md'));

    const { main } = await import('../commands/verify-skill-integrity.js');
    const result = await main(['--skill-dir', testDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.valid, false);
    const missing = data.missing as Array<{ file: string; risk: string }>;
    assert.ok(missing.length >= 1);
    assert.ok(missing.some((m) => m.file === 'prompts/test-prompt.md'));
    // prompts/*.md 应为高风险
    assert.equal(missing.find((m) => m.file === 'prompts/test-prompt.md')?.risk, 'high');
  });

  it('5. extra unknown file => detects extra', async () => {
    const testDir = path.join(TMP, 'test-5');
    copyDir(FIXTURE_SRC, testDir);

    const { main: packMain } = await import('../commands/pack-skill.js');
    await packMain(['--skill-dir', testDir]);

    // 添加一个未知文件
    fs.writeFileSync(path.join(testDir, 'unknown.txt'), 'unknown content\n', 'utf-8');

    const { main } = await import('../commands/verify-skill-integrity.js');
    const result = await main(['--skill-dir', testDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.valid, false);
    const extra = data.extra as Array<{ file: string }>;
    assert.ok(extra.length >= 1);
    assert.ok(extra.some((e) => e.file === 'unknown.txt'));
  });

  it('6. --repair restores modified file from backup', async () => {
    const testDir = path.join(TMP, 'test-6');
    copyDir(FIXTURE_SRC, testDir);

    const { main: packMain } = await import('../commands/pack-skill.js');
    await packMain(['--skill-dir', testDir]);

    // 修改 SKILL.md
    fs.writeFileSync(path.join(testDir, 'SKILL.md'), '# Tampered content\n', 'utf-8');

    // 执行 --repair
    const { main } = await import('../commands/verify-skill-integrity.js');
    const result = await main(['--skill-dir', testDir, '--repair']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;

    // 应该显示 repaired_ok
    assert.equal(data.repair_status, 'repaired_ok');
    assert.equal(data.valid, true);
    assert.ok(Array.isArray(data.repaired));

    // 验证文件已被恢复
    const currentContent = fs.readFileSync(path.join(testDir, 'SKILL.md'), 'utf-8');
    assert.equal(currentContent, '# Test Skill\n\nA test skill for integrity verification testing.\n');
  });

  it('7. --repair restores missing file from backup', async () => {
    const testDir = path.join(TMP, 'test-7');
    copyDir(FIXTURE_SRC, testDir);

    const { main: packMain } = await import('../commands/pack-skill.js');
    await packMain(['--skill-dir', testDir]);

    // 删除 prompts/test-prompt.md
    const missingFilePath = path.join(testDir, 'prompts/test-prompt.md');
    fs.unlinkSync(missingFilePath);
    assert.ok(!fs.existsSync(missingFilePath));

    // 执行 --repair
    const { main } = await import('../commands/verify-skill-integrity.js');
    const result = await main(['--skill-dir', testDir, '--repair']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;

    // 应该显示 repaired_ok
    assert.equal(data.repair_status, 'repaired_ok');
    assert.equal(data.valid, true);
    assert.ok(Array.isArray(data.repaired));
    assert.ok((data.repaired as string[]).some((f: string) => f === 'prompts/test-prompt.md'));

    // 验证文件已被恢复
    assert.ok(fs.existsSync(missingFilePath));
    const currentContent = fs.readFileSync(missingFilePath, 'utf-8');
    assert.ok(currentContent.includes('test prompt'));
  });

  it('6b. --repair with backup missing => error', async () => {
    const testDir = path.join(TMP, 'test-6b');
    copyDir(FIXTURE_SRC, testDir);

    const { main: packMain } = await import('../commands/pack-skill.js');
    await packMain(['--skill-dir', testDir]);

    // 删除 backup
    const backupPath = path.join(testDir, 'srs-formalizer-backup.enc');
    fs.unlinkSync(backupPath);

    // 修改文件
    fs.writeFileSync(path.join(testDir, 'SKILL.md'), '# Tampered\n', 'utf-8');

    const { main } = await import('../commands/verify-skill-integrity.js');
    const result = await main(['--skill-dir', testDir, '--repair']);

    // backup 不存在时，修复应部分失败
    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.repair_status, 'repair_partial');
    assert.equal(data.valid, false);
  });

  it('8. no MANIFEST.json => error', async () => {
    // 使用没有 MANIFEST.json 的目录
    const cleanDir = path.join(TMP, 'test-8');
    fs.mkdirSync(cleanDir, { recursive: true });
    fs.writeFileSync(path.join(cleanDir, 'some-file.md'), 'content', 'utf-8');

    const { main } = await import('../commands/verify-skill-integrity.js');
    const result = await main(['--skill-dir', cleanDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message?.includes('MANIFEST.json'));
  });

  it('MANIFEST.json matches actual skill directory (smoke test)', () => {
    // 防止 MANIFEST.json 漂移：pack-skill 后应与磁盘一致
    const skillDir = path.resolve(import.meta.dirname!, '../..');
    const { stdout } = runCli(`verify-skill-integrity --skill-dir "${skillDir}"`);
    const result = JSON.parse(stdout);
    assert.strictEqual(result.status, 'ok', `verify-skill-integrity failed: ${result.message || ''}`);
    const data = result.data as { valid: boolean; missing: unknown[]; mismatched: unknown[]; extra: unknown[] };
    assert.strictEqual(data.valid, true, `MANIFEST drift detected: missing=${data.missing.length}, mismatched=${data.mismatched.length}, extra=${data.extra.length}. Run pack-skill --force to rebuild.`);
  });
});
