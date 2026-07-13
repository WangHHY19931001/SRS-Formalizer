import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildIR, validateIR } from '../lib/frontend/builder.js';

const TMP = '/tmp/srs-formalizer-test-build-ir';
const WORKDIR = path.join(TMP, '.srs_formalizer');

describe('buildIR', () => {
  before(() => {
    fs.mkdirSync(path.join(WORKDIR, '2_extract', 'r1-explicit'), { recursive: true });
    fs.mkdirSync(path.join(WORKDIR, '2_extract', 'r2-implicit'), { recursive: true });
    fs.mkdirSync(path.join(WORKDIR, '2_extract', 'r3-relational'), { recursive: true });
    fs.mkdirSync(path.join(WORKDIR, '1_input'), { recursive: true });

    fs.writeFileSync(path.join(WORKDIR, '2_extract', 'r1-explicit', 'shard-1.jsonl'), [
      '{"id":"R1-USER-0001","category":"explicit","statement":"用户登录","source_file":"srs.md","confidence":"high"}',
      '{"id":"R1-USER-0002","category":"explicit","statement":"用户注册","source_file":"srs.md","confidence":"high"}',
    ].join('\n'), 'utf-8');

    fs.writeFileSync(path.join(WORKDIR, '2_extract', 'r2-implicit', 'shard-1.jsonl'), [
      '{"id":"R2-USER-0001","category":"implicit","statement":"会话管理","source_file":"srs.md","confidence":"medium"}',
    ].join('\n'), 'utf-8');

    fs.writeFileSync(path.join(WORKDIR, '2_extract', 'r3-relational', 'shard-1.jsonl'), [
      '{"id":"R3-USER-0001","category":"relational","statement":"登录依赖认证","source_file":"srs.md","confidence":"high","metadata":{"relation":{"type":"DEPENDS_ON","target":"R1-AUTH-0001"},"source_id":"R3-USER-0001","target_id":"R1-AUTH-0001"}}',
    ].join('\n'), 'utf-8');

    fs.writeFileSync(path.join(WORKDIR, '1_input', 'shard_index.json'), JSON.stringify({
      version: '1.1',
      cross_references: [],
      nfr_profile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: ['performance','security','availability','compatibility','maintainability','compliance'] },
    }, null, 2), 'utf-8');
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('builds IR from JSONL files', () => {
    const ir = buildIR(WORKDIR);
    assert.strictEqual(ir.version, '2.0.0');
    assert.ok(ir.nodes.length >= 3);
    assert.ok(ir.meta.totalNodes >= 3);
  });

  it('creates explicit requirement nodes', () => {
    const ir = buildIR(WORKDIR);
    const explicit = ir.nodes.filter(n => n.properties.category === 'explicit');
    assert.ok(explicit.length >= 2);
    assert.ok(explicit[0]!.labels.includes(':Requirement'));
  });

  it('creates implicit requirement nodes', () => {
    const ir = buildIR(WORKDIR);
    const implicit = ir.nodes.filter(n => n.properties.category === 'implicit');
    assert.ok(implicit.length >= 1);
    assert.ok(implicit[0]!.labels.includes(':ImplicitRequirement'));
  });

  it('builds edges from metadata relations', () => {
    const ir = buildIR(WORKDIR);
    assert.ok(ir.edges.length >= 1);
    const depEdge = ir.edges.find(e => e.type === 'depends_on');
    assert.ok(depEdge);
  });

  it('deduplicates by id', () => {
    fs.writeFileSync(path.join(WORKDIR, '2_extract', 'r1-explicit', 'shard-2.jsonl'), [
      '{"id":"R1-USER-0001","category":"explicit","statement":"用户登录-DUP","source_file":"srs.md","confidence":"high"}',
    ].join('\n'), 'utf-8');

    const ir = buildIR(WORKDIR);
    const dupNodes = ir.nodes.filter(n => n.id === 'R1-USER-0001');
    assert.strictEqual(dupNodes.length, 1);
  });

  it('IR has crossRefs from shard_index', () => {
    const ir = buildIR(WORKDIR);
    assert.ok(Array.isArray(ir.crossRefs));
  });

  it('IR has nfrProfile', () => {
    const ir = buildIR(WORKDIR);
    assert.ok(typeof ir.nfrProfile === 'object');
    assert.ok(typeof ir.nfrProfile.overallCoverage === 'number');
  });
});

describe('validateIR', () => {
  before(() => {
    fs.mkdirSync(path.join(WORKDIR, '2_extract', 'r1-explicit'), { recursive: true });
    fs.mkdirSync(path.join(WORKDIR, '1_input'), { recursive: true });

    fs.writeFileSync(path.join(WORKDIR, '2_extract', 'r1-explicit', 'shard-1.jsonl'), [
      '{"id":"R1-USER-0001","category":"explicit","statement":"用户登录","source_file":"srs.md","confidence":"high"}',
    ].join('\n'), 'utf-8');

    fs.writeFileSync(path.join(WORKDIR, '1_input', 'shard_index.json'), JSON.stringify({
      version: '1.1',
      cross_references: [],
      nfr_profile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] },
    }, null, 2), 'utf-8');
  });

  it('passes for valid IR', () => {
    const ir = buildIR(WORKDIR);
    const result = validateIR(ir);
    assert.ok(result.valid, result.errors.join('; '));
  });

  it('rejects wrong version', () => {
    const ir = buildIR(WORKDIR);
    const bad = { ...ir, version: '1.0.0' as const };
    const result = validateIR(bad as unknown as typeof ir);
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e: string) => e.includes('version')));
  });

  it('rejects dangling edge', () => {
    const ir = buildIR(WORKDIR);
    ir.edges.push({ id: 'bad', source: 'R1-USER-0001', target: 'NONEXISTENT', type: 'depends_on' as const, properties: {} });
    const result = validateIR(ir);
    assert.ok(!result.valid);
    assert.ok(result.errors.some((e: string) => e.includes('NONEXISTENT')));
  });
});
