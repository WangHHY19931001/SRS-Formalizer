import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TMP = path.join(os.tmpdir(), `srs-formalizer-validate-test-${Date.now()}`);
const WORKDIR = path.join(TMP, '.srs_formalizer');

describe('validate-jsonl command', () => {
  before(() => {
    fs.mkdirSync(path.join(WORKDIR, 'r1-explicit'), { recursive: true });
    fs.mkdirSync(path.join(WORKDIR, 'r2-implicit'), { recursive: true });
    fs.mkdirSync(path.join(WORKDIR, 'r3-relational'), { recursive: true });
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  function writeJsonl(subDir: string, fileName: string, lines: string[]): string {
    const filePath = path.join(WORKDIR, subDir, fileName);
    fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
    return filePath;
  }

  it('validates correct JSONL as valid', async () => {
    const fp = writeJsonl('r1-explicit', 'valid.jsonl', [
      '{"id":"R1-S001-0001","category":"explicit","statement":"系统应支持注册","source_file":"s1.md","confidence":"high"}',
      '{"id":"R1-S001-0002","category":"explicit","statement":"系统应支持登录","source_file":"s1.md","confidence":"medium"}',
    ]);
    const { main } = await import('../commands/validate-jsonl.js');
    const result = await main(['--file', fp, '--workdir', WORKDIR]);
    assert.equal(result.status, 'ok');
    assert.equal(result.data.valid, true);
    assert.equal(result.data.record_count, 2);
  });

  it('rejects invalid JSON lines', async () => {
    const fp = writeJsonl('r1-explicit', 'bad.jsonl', [
      '{"id":"R1-S001-0001","category":"explicit","statement":"ok","source_file":"s1.md","confidence":"high"}',
      '{this is not json}',
    ]);
    const { main } = await import('../commands/validate-jsonl.js');
    const result = await main(['--file', fp, '--workdir', WORKDIR]);
    assert.equal(result.data.valid, false);
    assert.ok(result.data.errors.length > 0);
  });

  it('rejects missing required fields', async () => {
    const fp = writeJsonl('r1-explicit', 'missing.jsonl', [
      '{"id":"R1-S001-0001","category":"explicit","source_file":"s1.md","confidence":"high"}',
    ]);
    const { main } = await import('../commands/validate-jsonl.js');
    const result = await main(['--file', fp, '--workdir', WORKDIR]);
    assert.equal(result.data.valid, false);
  });

  it('rejects invalid id format', async () => {
    const fp = writeJsonl('r1-explicit', 'bad_id.jsonl', [
      '{"id":"bad-format","category":"explicit","statement":"test","source_file":"s1.md","confidence":"high"}',
    ]);
    const { main } = await import('../commands/validate-jsonl.js');
    const result = await main(['--file', fp, '--workdir', WORKDIR]);
    assert.equal(result.data.valid, false);
  });

  it('rejects invalid category enum', async () => {
    const fp = writeJsonl('r1-explicit', 'bad_cat.jsonl', [
      '{"id":"R1-S001-0001","category":"unknown_type","statement":"test","source_file":"s1.md","confidence":"high"}',
    ]);
    const { main } = await import('../commands/validate-jsonl.js');
    const result = await main(['--file', fp, '--workdir', WORKDIR]);
    assert.equal(result.data.valid, false);
  });

  it('rejects empty statement', async () => {
    const fp = writeJsonl('r1-explicit', 'empty.jsonl', [
      '{"id":"R1-S001-0001","category":"explicit","statement":"  ","source_file":"s1.md","confidence":"high"}',
    ]);
    const { main } = await import('../commands/validate-jsonl.js');
    const result = await main(['--file', fp, '--workdir', WORKDIR]);
    assert.equal(result.data.valid, false);
  });

  it('detects duplicate ids', async () => {
    const fp = writeJsonl('r1-explicit', 'dupes.jsonl', [
      '{"id":"R1-S001-0001","category":"explicit","statement":"first","source_file":"s1.md","confidence":"high"}',
      '{"id":"R1-S001-0001","category":"explicit","statement":"second","source_file":"s2.md","confidence":"high"}',
    ]);
    const { main } = await import('../commands/validate-jsonl.js');
    const result = await main(['--file', fp, '--workdir', WORKDIR]);
    assert.equal(result.data.valid, false);
  });

  it('rejects file path outside .srs_formalizer', async () => {
    const { main } = await import('../commands/validate-jsonl.js');
    const result = await main(['--file', '/tmp/outside.jsonl', '--workdir', WORKDIR]);
    assert.equal(result.status, 'error');
  });

  it('returns structured JSON with errors/warnings/record_count', async () => {
    const fp = writeJsonl('r1-explicit', 'mixed.jsonl', [
      '{"id":"R1-S001-0001","category":"explicit","statement":"valid","source_file":"s1.md","confidence":"high"}',
      '{"id":"bad-id","category":"explicit","statement":"bad","source_file":"s1.md","confidence":"high"}',
    ]);
    const { main } = await import('../commands/validate-jsonl.js');
    const result = await main(['--file', fp, '--workdir', WORKDIR]);
    assert.equal(result.status, 'ok');
    assert.equal(typeof result.data.valid, 'boolean');
    assert.ok(Array.isArray(result.data.errors));
    assert.ok(Array.isArray(result.data.warnings));
    assert.equal(result.data.record_count, 2);
  });

  it('handles missing --file argument', async () => {
    const { main } = await import('../commands/validate-jsonl.js');
    const result = await main(['--workdir', WORKDIR]);
    assert.equal(result.status, 'error');
  });
});
