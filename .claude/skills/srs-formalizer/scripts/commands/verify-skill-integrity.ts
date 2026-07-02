/**
 * verify-skill-integrity.ts - 逐文件校验 hash，检测篡改，可选自动恢复
 *
 * CLI: npx tsx index.ts verify-skill-integrity --skill-dir <path> [--repair]
 *
 * 纯 Node.js 内置模块实现（无 execSync / tar / openssl 外部依赖）。
 *
 * 校验逻辑：
 *   1. 读取 MANIFEST.json
 *   2. 逐文件计算当前 SHA256 vs manifest hash
 *   3. 标注 matched / mismatched / missing / extra
 *   4. 输出 JSON 结果
 *
 * --repair 模式：
 *   1. 从 srs-formalizer-backup.enc 解密 → zlib 解压 → 提取 JSON
 *   2. 覆盖不匹配 / 缺失的文件
 *   3. 解密失败 → 报错
 *   4. 恢复后重新校验
 *   5. .enc 不存在 → 报错提示先运行 pack-skill
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as zlib from 'node:zlib';
import type { CliResult } from '../types/index.js';
import { safeParseArg } from '../lib/cli.js';

/** AES-256-GCM 密钥（必须与 pack-skill.ts 一致） */
const ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update('srs-formalizer-skill-integrity-v1')
  .digest();

interface Manifest {
  skill_name: string;
  packed_at: string;
  total_files: number;
  files: Record<string, string>;
}

interface VerifyResult {
  valid: boolean;
  total: number;
  matched: number;
  mismatched: Array<{
    file: string;
    expected: string;
    actual: string;
    risk: 'high' | 'low';
  }>;
  missing: Array<{
    file: string;
    risk: 'high' | 'low';
  }>;
  extra: Array<{
    file: string;
    risk: 'low';
  }>;
}

/** 高风险文件模式（修改可能影响行为规则） */
const HIGH_RISK_PATTERNS = [
  /^SKILL\.md$/,
  /^prompts\/.*\.md$/,
  /^templates\/.*/,
  /^references\/.*/,
];

function classifyRisk(relPath: string): 'high' | 'low' {
  for (const pattern of HIGH_RISK_PATTERNS) {
    if (pattern.test(relPath)) return 'high';
  }
  return 'low';
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

/**
 * 计算文件的 SHA256 hash（hex 格式）。
 * 如果文件不存在返回 null。
 */
function sha256Of(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

/**
 * 读取并解析 MANIFEST.json。
 */
function readManifest(skillDir: string): Manifest {
  const manifestPath = path.join(skillDir, 'MANIFEST.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`MANIFEST.json not found in: ${skillDir}`);
  }
  const raw = fs.readFileSync(manifestPath, 'utf-8');
  return JSON.parse(raw) as Manifest;
}

/**
 * 收集当前目录下所有文件（排除排除目录和模式）。
 * 排除规则必须与 pack-skill.ts 的 collectFiles 一致。
 */
function collectCurrentFiles(skillDir: string): Set<string> {
  const EXCLUDED_DIRS = new Set(['node_modules', '.srs_formalizer', 'dist']);
  const files = new Set<string>();

  function walk(dir: string, relPrefix: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        walk(fullPath, relPath);
      } else if (entry.isFile()) {
        // 排除 *.enc 和 MANIFEST.json
        if (relPath.endsWith('.enc')) continue;
        if (relPath === 'MANIFEST.json') continue;
        files.add(relPath);
      }
    }
  }

  walk(skillDir, '');
  return files;
}

/**
 * 执行校验主逻辑，返回校验结果。
 */
function verify(skillDir: string): VerifyResult {
  const manifest = readManifest(skillDir);
  const manifestFiles = manifest.files;
  const currentFiles = collectCurrentFiles(skillDir);

  const result: VerifyResult = {
    valid: true,
    total: Object.keys(manifestFiles).length,
    matched: 0,
    mismatched: [],
    missing: [],
    extra: [],
  };

  // 检查 manifest 中的每个文件
  for (const [relFile, expectedHash] of Object.entries(manifestFiles)) {
    const fullPath = path.join(skillDir, relFile);
    const actualHash = sha256Of(fullPath);

    if (actualHash === null) {
      // 文件缺失
      result.missing.push({ file: relFile, risk: classifyRisk(relFile) });
      result.valid = false;
    } else if (actualHash !== expectedHash) {
      // hash 不匹配
      result.mismatched.push({
        file: relFile,
        expected: expectedHash,
        actual: actualHash,
        risk: classifyRisk(relFile),
      });
      result.valid = false;
    } else {
      result.matched++;
    }
  }

  // 检查新增文件
  for (const relFile of currentFiles) {
    if (!(relFile in manifestFiles)) {
      result.extra.push({ file: relFile, risk: 'low' });
      result.valid = false;
    }
  }

  return result;
}

/**
 * 读取 .enc 文件，解密并解压，返回文件映射。
 *
 * .enc 格式：<iv_hex>:<auth_tag_hex>:<ciphertext_hex>
 */
function decryptAndDecompress(backupPath: string): Record<string, string> {
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}. Run pack-skill first to create it.`);
  }

  const encContent = fs.readFileSync(backupPath, 'utf-8').trim();

  // 解析格式：<iv_hex>:<auth_tag_hex>:<ciphertext_hex>
  const parts = encContent.split(':');
  if (parts.length < 3) {
    throw new Error('Invalid backup file format: expected <iv_hex>:<auth_tag_hex>:<ciphertext_hex>');
  }

  const iv = Buffer.from(parts[0]!, 'hex');
  const authTag = Buffer.from(parts[1]!, 'hex');
  const ciphertext = Buffer.from(parts.slice(2).join(':'), 'hex');

  // AES-256-GCM 解密
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  // zlib 解压
  const decompressed = zlib.inflateSync(decrypted);

  // 解析 JSON
  const payload = JSON.parse(decompressed.toString('utf-8')) as { files: Record<string, string> };
  if (!payload.files || typeof payload.files !== 'object') {
    throw new Error('Invalid backup file format: missing "files" key');
  }

  return payload.files;
}

/**
 * 从备份中恢复指定文件列表。
 */
function restoreFromBackup(
  skillDir: string,
  backupFiles: Record<string, string>,
  filesToRestore: string[],
): { restored: string[]; errors: string[] } {
  const restored: string[] = [];
  const errors: string[] = [];

  for (const relFile of filesToRestore) {
    const content = backupFiles[relFile];
    if (content === undefined) {
      errors.push(`Failed to restore: ${relFile} (not found in backup)`);
      continue;
    }

    const fullPath = path.join(skillDir, relFile);
    try {
      // 确保目标目录存在
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, 'utf-8');
      restored.push(relFile);
    } catch (err: any) {
      errors.push(`Failed to restore ${relFile}: ${err.message}`);
    }
  }

  return { restored, errors };
}

/**
 * 执行修复操作。
 */
function performRepair(
  skillDir: string,
  result: VerifyResult,
): { repaired: string[]; errors: string[] } {
  // 收集需要恢复的文件
  const toRestore: string[] = [
    ...result.mismatched.map((m) => m.file),
    ...result.missing.map((m) => m.file),
  ];

  if (toRestore.length === 0) {
    return { repaired: [], errors: [] };
  }

  // 读取并解密备份
  const backupPath = path.join(skillDir, 'srs-formalizer-backup.enc');
  let backupFiles: Record<string, string>;
  try {
    backupFiles = decryptAndDecompress(backupPath);
  } catch (err: any) {
    return { repaired: [], errors: [`Backup restoration failed: ${err.message}`] };
  }

  const { restored, errors } = restoreFromBackup(skillDir, backupFiles, toRestore);
  return { repaired: restored, errors };
}

export async function main(args: string[]): Promise<CliResult> {
  let skillDirArg: string | null;
  try {
    skillDirArg = safeParseArg(args, '--skill-dir');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }
  const repairMode = hasFlag(args, '--repair');

  if (!skillDirArg) {
    return { status: 'error', message: 'Missing required argument: --skill-dir' };
  }

  const skillDir = path.resolve(skillDirArg);

  if (!fs.existsSync(skillDir)) {
    return { status: 'error', message: `Skill directory not found: ${skillDir}` };
  }

  if (!fs.statSync(skillDir).isDirectory()) {
    return { status: 'error', message: `Not a directory: ${skillDir}` };
  }

  // 执行校验
  let result: VerifyResult;
  try {
    result = verify(skillDir);
  } catch (err: any) {
    return { status: 'error', message: err.message };
  }

  // 修复模式
  if (repairMode) {
    if (result.valid) {
      return {
        status: 'ok',
        data: { ...result, repair_status: 'no_repair_needed', repaired: [], errors: [] },
      };
    }

    const { repaired, errors } = performRepair(skillDir, result);

    // 修复后重新校验
    let recheckResult: VerifyResult;
    try {
      recheckResult = verify(skillDir);
    } catch (err: any) {
      return {
        status: 'error',
        message: `Repair attempted but re-verification failed: ${err.message}`,
        data: { repaired, errors, recheck_error: err.message },
      };
    }

    return {
      status: 'ok',
      data: {
        ...recheckResult,
        repair_status: recheckResult.valid ? 'repaired_ok' : 'repair_partial',
        repaired,
        errors,
      },
    };
  }

  return {
    status: 'ok',
    data: result,
  };
}
