import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateLine } from '../commands/guided-extract.js';

const TMP = '/tmp/srs-formalizer-test-guided-extract';
const WORKDIR = path.join(TMP, '.srs_formalizer');

describe('guided-extract R3-cross validation', () => {
  it('accepts valid R3C record', () => {
    const result = validateLine(
      '{"id":"R3C-USER-0001","category":"relational","statement":"跨文件关系","source_file":"srs.md","confidence":"high","metadata":{"cross_shard_refs":["shard-1","shard-2"]}}',
      'r3-cross'
    );
    assert.strictEqual(result.valid, true);
  });
});

describe('guided-extract R4-NFR validation', () => {
  it('accepts valid R4N record', () => {
    const result = validateLine(
      '{"id":"R4N-PERF-0001","category":"explicit","statement":"响应时间 ≤ 200ms","source_file":"srs.md","confidence":"high","metadata":{"nfrCategory":"performance","nfrThreshold":{"metric":"response_time","value":200,"unit":"ms","operator":"<="}}}',
      'r4-nfr'
    );
    assert.strictEqual(result.valid, true);
  });

  it('rejects R4N without nfrCategory', () => {
    const result = validateLine(
      '{"id":"R4N-PERF-0001","category":"explicit","statement":"响应时间 ≤ 200ms","source_file":"srs.md","confidence":"high"}',
      'r4-nfr'
    );
    assert.strictEqual(result.valid, false);
  });
});

describe('guided-extract CLI', () => {
  before(() => {
    fs.mkdirSync(path.join(WORKDIR, '2_extract', 'r1-explicit'), { recursive: true });
    fs.mkdirSync(path.join(WORKDIR, '1_input', 'shards', 'shard-test'), { recursive: true });
    fs.writeFileSync(path.join(WORKDIR, '1_input', 'shards', 'shard-test', 'template.md'), '# Template\n', 'utf-8');
    fs.writeFileSync(path.join(WORKDIR, 'STATE.md'), '# STATE\n', 'utf-8');
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('processes r1 line and appends to output', async () => {
    const { main } = await import('../commands/guided-extract.js');
    const result = await main([
      '--line', '{"id":"R1-TEST-0001","category":"explicit","statement":"测试需求","source_file":"srs.md","confidence":"high"}',
      '--shard-id', 'shard-test',
      '--type', 'r1',
      '--workdir', WORKDIR,
    ]);
    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(result.data, 'OK');

    const outPath = path.join(WORKDIR, '2_extract', 'r1-explicit', 'shard-test.jsonl');
    const content = fs.readFileSync(outPath, 'utf-8');
    assert.ok(content.includes('R1-TEST-0001'));
  });

  it('processes r3-cross line and appends to output', async () => {
    const { main } = await import('../commands/guided-extract.js');
    const result = await main([
      '--line', '{"id":"R3C-CROSS-0001","category":"relational","statement":"跨文件依赖","source_file":"srs.md","confidence":"high","metadata":{"cross_shard_refs":["shard-1","shard-2"]}}',
      '--shard-id', 'shard-test',
      '--type', 'r3-cross',
      '--workdir', WORKDIR,
    ]);
    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(result.data, 'OK');
  });

  it('processes r4-nfr line and appends to output', async () => {
    const { main } = await import('../commands/guided-extract.js');
    const result = await main([
      '--line', '{"id":"R4N-PERF-0001","category":"explicit","statement":"响应时间 ≤ 200ms","source_file":"srs.md","confidence":"high","metadata":{"nfrCategory":"performance","nfrThreshold":{"metric":"response_time","value":200,"unit":"ms","operator":"<="}}}',
      '--shard-id', 'shard-test',
      '--type', 'r4-nfr',
      '--workdir', WORKDIR,
    ]);
    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(result.data, 'OK');
  });

  it('rejects invalid line', async () => {
    const { main } = await import('../commands/guided-extract.js');
    const result = await main([
      '--line', '{"id":"bad-id","invalid":true}',
      '--shard-id', 'shard-test',
      '--type', 'r1',
      '--workdir', WORKDIR,
    ]);
    assert.strictEqual(result.status, 'ok');
    assert.ok(String(result.data).startsWith('ERR'));
  });

  it('returns DONE for DONE signal', async () => {
    const { main } = await import('../commands/guided-extract.js');
    const result = await main([
      '--line', 'DONE',
      '--shard-id', 'shard-test',
      '--type', 'r1',
      '--workdir', WORKDIR,
    ]);
    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(result.data, 'DONE');
  });

  it('rejects unknown --type', async () => {
    const { main } = await import('../commands/guided-extract.js');
    const result = await main([
      '--line', '{}',
      '--shard-id', 'shard-test',
      '--type', 'r99',
      '--workdir', WORKDIR,
    ]);
    assert.strictEqual(result.status, 'error');
  });
});
