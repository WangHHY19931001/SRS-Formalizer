import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../commands/assemble-ir.js';

function setupWorkdir(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'srs-asm-'));
  const wd = path.join(tmp, '.srs_formalizer');
  fs.mkdirSync(path.join(wd, '2_extract', 'r1-explicit'), { recursive: true });
  fs.mkdirSync(path.join(wd, '2_extract', 'r2-implicit'), { recursive: true });
  fs.mkdirSync(path.join(wd, '2_extract', 'r3-relational'), { recursive: true });
  fs.mkdirSync(path.join(wd, '2_extract', 'architecture'), { recursive: true });
  fs.mkdirSync(path.join(wd, '_ctx'), { recursive: true });
  return wd;
}

test('assemble-ir 装配 IR 并通过完整性校验', async () => {
  const wd = setupWorkdir();
  fs.writeFileSync(
    path.join(wd, '2_extract', 'r1-explicit', 'a.jsonl'),
    JSON.stringify({ id: 'R1-S001-0001', category: 'explicit', statement: '需求A', source_file: 'srs.md', confidence: 'high', metadata: { shard_id: 'S001', chapter: '1', start_line: 1, end_line: 2 } }) + '\n',
  );
  const res = await main(['--workdir', wd]);
  assert.equal(res.status, 'ok');
  const ir = JSON.parse(fs.readFileSync(path.join(wd, 'srs-ir.json'), 'utf-8'));
  assert.equal(ir.version, '2.0.0');
  assert.equal(ir.meta.totalNodes, 1);
  assert.ok(ir.meta.buildTimestamp);
});

test('assemble-ir 检测重复 ID 失败', async () => {
  const wd = setupWorkdir();
  const dup = JSON.stringify({ id: 'R1-S001-0001', category: 'explicit', statement: 'x', source_file: 'srs.md', confidence: 'high', metadata: { shard_id: 'S001', chapter: '1', start_line: 1, end_line: 1 } }) + '\n';
  fs.writeFileSync(path.join(wd, '2_extract', 'r1-explicit', 'a.jsonl'), dup);
  fs.writeFileSync(path.join(wd, '2_extract', 'r2-implicit', 'b.jsonl'), dup);
  const res = await main(['--workdir', wd]);
  assert.equal(res.status, 'error');
  assert.match(res.message ?? '', /重复 ID|duplicate/i);
});

test('assemble-ir 缺少 --workdir 报错', async () => {
  const res = await main([]);
  assert.equal(res.status, 'error');
});
