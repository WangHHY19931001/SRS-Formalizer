/**
 * validate-checklist.test.ts — validate-checklist 命令测试
 *
 * 测试用例（6+）：
 * 1. 全部 [x] → valid=true
 * 2. 有 [ ] → valid=false，列出未完成项
 * 3. 混合 [x] 和 [ ] → 正确计数
 * 4. 文件不存在 → error
 * 5. 空文件（无 checkbox）→ total=0, valid=true
 * 6. 一行多个 checkbox 只计第一个
 */

import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TMP = path.join(os.tmpdir(), `srs-formalizer-checklist-test-${Date.now()}`);

describe('validate-checklist command', () => {
  before(() => {
    fs.mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  function writeChecklist(fileName: string, lines: string[]): string {
    const filePath = path.join(TMP, fileName);
    fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
    return filePath;
  }

  it('all [x] items → valid=true', async () => {
    const fp = writeChecklist('CHECKLIST.md', [
      '# Test Checklist',
      '',
      '- [x] Item one',
      '- [x] Item two',
      '- [x] Item three',
    ]);
    const { main } = await import('../commands/validate-checklist.js');
    const result = await main(['--file', fp]);
    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.valid, true);
    assert.equal(data.total, 3);
    assert.equal(data.checked, 3);
    assert.equal(data.unchecked, 0);
    assert.deepEqual(data.unchecked_items, []);
  });

  it('has [ ] items → valid=false, lists unchecked items', async () => {
    const fp = writeChecklist('TODO.md', [
      '# Todo',
      '',
      '- [x] Done task',
      '- [ ] Pending task A',
      '- [ ] Pending task B',
    ]);
    const { main } = await import('../commands/validate-checklist.js');
    const result = await main(['--file', fp]);
    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.valid, false);
    assert.equal(data.total, 3);
    assert.equal(data.checked, 1);
    assert.equal(data.unchecked, 2);
    assert.deepEqual(data.unchecked_items, ['Pending task A', 'Pending task B']);
  });

  it('mixed [x] and [ ] → correct counts', async () => {
    const fp = writeChecklist('MIXED.md', [
      '- [x] Alpha',
      '- [ ] Beta',
      '- [x] Gamma',
      '- [ ] Delta',
      '- [x] Epsilon',
    ]);
    const { main } = await import('../commands/validate-checklist.js');
    const result = await main(['--file', fp]);
    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.valid, false);
    assert.equal(data.total, 5);
    assert.equal(data.checked, 3);
    assert.equal(data.unchecked, 2);
    assert.deepEqual(data.unchecked_items, ['Beta', 'Delta']);
  });

  it('file not found → error', async () => {
    const { main } = await import('../commands/validate-checklist.js');
    const result = await main(['--file', '/nonexistent/CHECKLIST.md']);
    assert.equal(result.status, 'error');
    assert.ok((result.message ?? '').includes('File not found'));
  });

  it('empty file (no checkboxes) → total=0, valid=true', async () => {
    const fp = writeChecklist('EMPTY.md', [
      '# Just a heading',
      '',
      'Some description text.',
      'No checkboxes here.',
    ]);
    const { main } = await import('../commands/validate-checklist.js');
    const result = await main(['--file', fp]);
    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.valid, true);
    assert.equal(data.total, 0);
    assert.equal(data.checked, 0);
    assert.equal(data.unchecked, 0);
    assert.deepEqual(data.unchecked_items, []);
  });

  it('multiple checkboxes on one line → only first counted', async () => {
    const fp = writeChecklist('ONELINE.md', [
      '- [ ] First checkbox here - [x] Second checkbox',
      '- [x] Second line',
    ]);
    const { main } = await import('../commands/validate-checklist.js');
    const result = await main(['--file', fp]);
    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    // First line: only the first [ ] counts, so it's 1 unchecked
    // Second line: [x] counts as 1 checked
    assert.equal(data.total, 2);
    assert.equal(data.checked, 1);
    assert.equal(data.unchecked, 1);
    assert.equal(data.valid, false);
    assert.deepEqual(data.unchecked_items, ['First checkbox here - [x] Second checkbox']);
  });

  it('checklist_name is derived from filename without extension', async () => {
    const fp = writeChecklist('MY_CHECKLIST.md', ['- [x] Item']);
    const { main } = await import('../commands/validate-checklist.js');
    const result = await main(['--file', fp]);
    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.checklist_name, 'MY_CHECKLIST');
  });

  it('missing --file argument → error', async () => {
    const { main } = await import('../commands/validate-checklist.js');
    const result = await main([]);
    assert.equal(result.status, 'error');
  });

  // --- Integrity checks ---

  it('canonical S0 checklist passes integrity', async () => {
    const content = `# S0 发现与确认 — 清单

- [x] SRS 文件路径确认且可读
- [x] 文件格式识别（.md / .html / 多目录）
- [x] §7 未解决问题已扫描
- [x] 术语表检测（存在 / 缺失）
- [x] TLA+ 触发条件已检测
- [x] Lean 4 触发条件已检测
- [x] 用户已确认阶段触发方案
- [x] 用户已确认语言偏好（zh/en）
`;
    const fp = path.join(TMP, 'S0', 'CHECKLIST.md');
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, content, 'utf-8');
    const { main } = await import('../commands/validate-checklist.js');
    const result = await main(['--file', fp]);
    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.valid, true);
    assert.equal(data.total, 8);
    const integrityErrors = data.integrity_errors as string[];
    assert.equal(integrityErrors.length, 0, `Unexpected integrity errors: ${integrityErrors.join('; ')}`);
  });

  it('detects deleted items (item count < expected)', async () => {
    const content = `# S0 发现与确认 — 清单

- [x] init 成功创建目录结构
- [x] manifest 成功生成分片文件
`;
    const fp = path.join(TMP, 'S0', 'CHECKLIST.md');
    fs.writeFileSync(fp, content, 'utf-8');
    const { main } = await import('../commands/validate-checklist.js');
    const result = await main(['--file', fp]);
    const data = result.data as Record<string, unknown>;
    assert.equal(data.valid, false);
    const errors = data.integrity_errors as string[];
    assert.ok(errors.some(e => e.includes('Item count mismatch')), `Expected item count error, got: ${errors.join('; ')}`);
  });

  it('detects missing required headers', async () => {
    const content = `# Wrong Title

- [x] init 成功创建目录结构
- [x] manifest 成功生成分片文件
- [x] 1_input/shard_index.json 存在且 total_shards ≥ 1
- [x] S0/ 下分片文件数 == total_shards
- [x] 每个分片头部含 # shard_id: # source: # total_shards:
- [x] GAPS.md 已生成，缺口已标注优先级
- [x] CONTEXT.md 含术语表和切片索引
- [x] STATE.md 当前阶段标记为 S1 完成
`;
    const fp = path.join(TMP, 'S0', 'CHECKLIST.md');
    fs.writeFileSync(fp, content, 'utf-8');
    const { main } = await import('../commands/validate-checklist.js');
    const result = await main(['--file', fp]);
    const data = result.data as Record<string, unknown>;
    assert.equal(data.valid, false);
    const errors = data.integrity_errors as string[];
    assert.ok(errors.some(e => e.includes('Missing required header')), `Expected header error, got: ${errors.join('; ')}`);
  });

  it('detects missing key phrases', async () => {
    const content = `# S0 发现与确认 — 清单

- [x] done
- [x] done
- [x] done
- [x] done
- [x] done
- [x] done
- [x] done
- [x] done
`;
    const fp = path.join(TMP, 'S0', 'CHECKLIST.md');
    fs.writeFileSync(fp, content, 'utf-8');
    const { main } = await import('../commands/validate-checklist.js');
    const result = await main(['--file', fp]);
    const data = result.data as Record<string, unknown>;
    assert.equal(data.valid, false);
    const errors = data.integrity_errors as string[];
    assert.ok(errors.some(e => e.includes('Missing') && e.includes('key phrases')), `Expected key phrase error, got: ${errors.join('; ')}`);
  });

  it('integrity errors make valid=false even if all checked', async () => {
    const content = `# Wrong Title Only

- [x] a
- [x] b
`;
    const fp = path.join(TMP, 'S0', 'CHECKLIST.md');
    fs.writeFileSync(fp, content, 'utf-8');
    const { main } = await import('../commands/validate-checklist.js');
    const result = await main(['--file', fp]);
    const data = result.data as Record<string, unknown>;
    // All present items are checked, but integrity fails → valid=false
    assert.equal(data.unchecked, 0);
    assert.equal(data.valid, false);
    assert.ok((data.integrity_errors as string[]).length > 0);
  });

  // --- Repair tests ---

  it('--repair regenerates tampered checklist from template', async () => {
    const tampered = `# S0 发现与确认 — 清单

- [x] only 2 items left, rest deleted
- [x] done
`;
    const fp = path.join(TMP, 'S0', 'CHECKLIST.md');
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, tampered, 'utf-8');

    const { main } = await import('../commands/validate-checklist.js');
    const result = await main(['--file', fp, '--repair']);
    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.repaired, true);
    assert.equal(data.total, 8); // restored to full 8 items
    assert.equal(data.checked, 0); // all reset to [ ]
  });

  it('--repair on valid checklist does nothing', async () => {
    const valid = `# S0 发现与确认 — 清单

- [x] SRS 文件路径确认且可读
- [x] 文件格式识别（.md / .html / 多目录）
- [x] §7 未解决问题已扫描
- [x] 术语表检测（存在 / 缺失）
- [x] TLA+ 触发条件已检测
- [x] Lean 4 触发条件已检测
- [x] 用户已确认阶段触发方案
- [x] 用户已确认语言偏好（zh/en）
`;
    const fp = path.join(TMP, 'S0', 'CHECKLIST.md');
    fs.writeFileSync(fp, valid, 'utf-8');
    const { main } = await import('../commands/validate-checklist.js');
    const result = await main(['--file', fp, '--repair']);
    const data = result.data as Record<string, unknown>;
    assert.equal(data.valid, true);
    assert.equal(data.total, 8);
    assert.equal(data.checked, 8);
    assert.notEqual(data.repaired, true); // no repair needed
  });

  // --- P2-5: unfilled .template detection ---

  it('P2-5: detects unfilled .template with placeholders', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'srs-chk-p25-'));
    const workDir = path.join(tmpDir, '.srs_formalizer');
    fs.mkdirSync(path.join(workDir, 'S0'), { recursive: true });
    // Create a CHECKLIST.md with all items checked
    fs.writeFileSync(path.join(workDir, 'S0', 'CHECKLIST.md'), '- [x] SRS\n- [x] 文件路径\n- [x] 格式识别\n- [x] §7\n- [x] 术语表\n- [x] TLA+\n- [x] Lean\n- [x] 用户确认\n', 'utf-8');
    // Create an unfilled .template with placeholders
    fs.writeFileSync(path.join(workDir, 'GAPS.md.template'), '# GAPS\n\n{{GAP_LIST}}\n', 'utf-8');
    // Do NOT create GAPS.md (it's unfilled)

    const { main } = await import('../commands/validate-checklist.js');
    const result = await main(['--file', path.join(workDir, 'S0', 'CHECKLIST.md')]);
    const data = result.data as { integrity_errors: string[] };
    assert.ok(data.integrity_errors.some(e => e.includes('GAPS.md.template') && e.includes('not filled')));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
