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

  it('canonical 1_shard checklist passes integrity', async () => {
    const content = `# S1 预处理 — 验收清单

- [x] init 成功创建目录结构
- [x] manifest 成功生成索引化分片
- [x] _ctx/shard_index.json 存在且 total_shards >= 1
- [x] 每个 shard 含 locator（{file_abspath}-{start}-{end}-{chunk_id}）
- [x] 每个 shard 的 source_path 指向的源文件存在
- [x] GAPS.md 已生成，缺口已标注优先级
- [x] CONTEXT.md 含术语表和切片索引
- [x] STATE.md 当前阶段标记为 S1 完成
`;
    const fp = path.join(TMP, '1_shard', 'CHECKLIST.md');
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
    const content = `# S1 预处理 — 验收清单

- [x] init 成功创建目录结构
- [x] manifest 成功生成分片文件
`;
    const fp = path.join(TMP, '1_shard', 'CHECKLIST.md');
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
- [x] _ctx/shard_index.json 存在且 total_shards ≥ 1
- [x] 1_shard/ 下分片文件数 == total_shards
- [x] 每个分片头部含 # shard_id: # source: # total_shards:
- [x] GAPS.md 已生成，缺口已标注优先级
- [x] CONTEXT.md 含术语表和切片索引
- [x] STATE.md 当前阶段标记为 S1 完成
`;
    const fp = path.join(TMP, '1_shard', 'CHECKLIST.md');
    fs.writeFileSync(fp, content, 'utf-8');
    const { main } = await import('../commands/validate-checklist.js');
    const result = await main(['--file', fp]);
    const data = result.data as Record<string, unknown>;
    assert.equal(data.valid, false);
    const errors = data.integrity_errors as string[];
    assert.ok(errors.some(e => e.includes('Missing required header')), `Expected header error, got: ${errors.join('; ')}`);
  });

  it('detects missing key phrases', async () => {
    const content = `# S1 预处理 — 验收清单

- [x] done
- [x] done
- [x] done
- [x] done
- [x] done
- [x] done
- [x] done
- [x] done
`;
    const fp = path.join(TMP, '1_shard', 'CHECKLIST.md');
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
    const fp = path.join(TMP, '1_shard', 'CHECKLIST.md');
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
    const tampered = `# S1 预处理 — 验收清单

- [x] only 2 items left, rest deleted
- [x] done
`;
    const fp = path.join(TMP, '1_shard', 'CHECKLIST.md');
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
    const valid = `# S1 预处理 — 验收清单

- [x] init 成功创建目录结构
- [x] manifest 成功生成索引化分片
- [x] _ctx/shard_index.json 存在且 total_shards >= 1
- [x] 每个 shard 含 locator（{file_abspath}-{start}-{end}-{chunk_id}）
- [x] 每个 shard 的 source_path 指向的源文件存在
- [x] GAPS.md 已生成，缺口已标注优先级
- [x] CONTEXT.md 含术语表和切片索引
- [x] STATE.md 当前阶段标记为 S1 完成
`;
    const fp = path.join(TMP, '1_shard', 'CHECKLIST.md');
    fs.writeFileSync(fp, valid, 'utf-8');
    const { main } = await import('../commands/validate-checklist.js');
    const result = await main(['--file', fp, '--repair']);
    const data = result.data as Record<string, unknown>;
    assert.equal(data.valid, true);
    assert.equal(data.total, 8);
    assert.equal(data.checked, 8);
    assert.notEqual(data.repaired, true); // no repair needed
  });
});
