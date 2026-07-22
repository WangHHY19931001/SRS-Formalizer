import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TMP = path.join(os.tmpdir(), `srs-formalizer-jsonl-test-${Date.now()}`);

describe('jsonl lib', () => {
  before(() => {
    fs.mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('readJsonl parses valid JSONL', async () => {
    const { writeJsonl, readJsonl } = await import('../lib/jsonl.js');
    const records = [
      { id: 'R1-S001-0001', category: 'explicit', statement: 'test1', source_file: 's1.md', confidence: 'high' },
      { id: 'R1-S001-0002', category: 'explicit', statement: 'test2', source_file: 's1.md', confidence: 'medium' },
    ];
    const f = path.join(TMP, 'test.jsonl');
    writeJsonl(f, records as any, TMP);
    const parsed = readJsonl(f, TMP);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0]!.id, 'R1-S001-0001');
  });

  it('readJsonl skips empty lines', async () => {
    const { readJsonl } = await import('../lib/jsonl.js');
    const f = path.join(TMP, 'empty.jsonl');
    fs.writeFileSync(f, '\n\n{"id":"R1-S001-0001","category":"explicit","statement":"x","source_file":"a.md","confidence":"high"}\n\n', 'utf-8');
    const parsed = readJsonl(f, TMP);
    assert.equal(parsed.length, 1);
  });

  it('readJsonl throws on invalid JSON', async () => {
    const { readJsonl } = await import('../lib/jsonl.js');
    const f = path.join(TMP, 'bad.jsonl');
    fs.writeFileSync(f, '{not json}', 'utf-8');
    assert.throws(() => readJsonl(f, TMP), /JSONL parse error/);
  });

  it('writeJsonl creates parent directories', async () => {
    const { writeJsonl } = await import('../lib/jsonl.js');
    const f = path.join(TMP, 'deep/nested/out.jsonl');
    writeJsonl(f, [], TMP);
    assert.ok(fs.existsSync(f));
  });

  it('readJsonl rejects paths outside workdir', async () => {
    const { readJsonl } = await import('../lib/jsonl.js');
    assert.throws(
      () => readJsonl('/etc/passwd', TMP),
      /SecurityError/
    );
  });

  it('P1-4: accepts numeric confidence in [0, 1]', async () => {
    const { validateJsonlRecord } = await import('../lib/jsonl.js');
    const errors = validateJsonlRecord({
      id: 'R1-S001-0001', category: 'explicit', confidence: 0.95,
      statement: 'x', source_file: '/tmp/x.md',
    } as any, 0);
    assert.equal(errors.length, 0, JSON.stringify(errors));
  });

  it('P1-4: rejects numeric confidence > 1', async () => {
    const { validateJsonlRecord } = await import('../lib/jsonl.js');
    const errors = validateJsonlRecord({
      id: 'R1-S001-0001', category: 'explicit', confidence: 1.5,
      statement: 'x', source_file: '/tmp/x.md',
    } as any, 0);
    assert.ok(errors.some(e => e.includes('confidence')));
  });

  it('P1-5: R3 relational record without metadata.relation fails', async () => {
    const { validateJsonlRecord } = await import('../lib/jsonl.js');
    const errors = validateJsonlRecord({
      id: 'R3-S015-0001', category: 'relational', confidence: 'high',
      statement: 'x', source_file: '/tmp/x.md',
      metadata: { collaborates_with: 'X' },
    } as any, 0);
    assert.ok(errors.some(e => e.includes('metadata.relation')));
    assert.ok(errors.some(e => e.includes('source_id')));
    assert.ok(errors.some(e => e.includes('target_id')));
  });

  it('P1-5: R3 relational record with valid relation/source_id/target_id passes', async () => {
    const { validateJsonlRecord } = await import('../lib/jsonl.js');
    const errors = validateJsonlRecord({
      id: 'R3-S015-0001', category: 'relational', confidence: 'high',
      statement: 'x', source_file: '/tmp/x.md',
      metadata: { relation: 'DEPENDS_ON', source_id: 'R1-S001-0001', target_id: 'R1-S002-0001' },
    } as any, 0);
    assert.equal(errors.length, 0, JSON.stringify(errors));
  });

  it('P1-5: R3 record with invalid relation enum fails', async () => {
    const { validateJsonlRecord } = await import('../lib/jsonl.js');
    const errors = validateJsonlRecord({
      id: 'R3-S015-0001', category: 'relational', confidence: 'high',
      statement: 'x', source_file: '/tmp/x.md',
      metadata: { relation: 'SAMENESS_AS', source_id: 'R1-S001-0001', target_id: 'R1-S002-0001' },
    } as any, 0);
    assert.ok(errors.some(e => e.includes('metadata.relation')));
  });
});
