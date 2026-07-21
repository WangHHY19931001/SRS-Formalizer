import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { checkConnectivity, analyzeHierarchy } from '../lib/middle-end/connectivity-checker.js';
import { checkHierarchyDepth, checkOrphanAdjudication } from '../lib/verify-gate/checks-r3.js';
import type { SRSIR } from '../types/srs-ir.js';

interface ValidationResultData {
  valid: boolean;
  errors: string[];
  warnings: string[];
  record_count: number;
}

function tmpWorkdir(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const wd = path.join(root, '.srs_formalizer');
  fs.mkdirSync(wd, { recursive: true });
  return wd;
}

function writeJsonl(wd: string, name: string, lines: object[]): string {
  const fp = path.join(wd, name);
  fs.writeFileSync(fp, lines.map(l => JSON.stringify(l)).join('\n') + '\n', 'utf-8');
  return fp;
}

describe('validate-jsonl provenance tri-state', () => {
  it('accepts explicit-located on an explicit record', async () => {
    const wd = tmpWorkdir('srs-prov-ok-');
    const fp = writeJsonl(wd, 'r1.jsonl', [
      { id: 'R1-S001-0001', category: 'explicit', statement: 'x', source_file: 'srs.md', confidence: 'high', metadata: { provenance: 'explicit-located' } },
    ]);
    const { main } = await import('../commands/validate-jsonl.js');
    const result = await main(['--file', fp, '--workdir', wd]);
    assert.equal((result.data as ValidationResultData).valid, true);
    fs.rmSync(path.dirname(wd), { recursive: true, force: true });
  });

  it('accepts doc-derived on an implicit medium/low record', async () => {
    const wd = tmpWorkdir('srs-prov-derived-');
    const fp = writeJsonl(wd, 'r2.jsonl', [
      { id: 'R2-S001-0001', category: 'implicit', statement: 'x', source_file: 'srs.md', confidence: 'medium', metadata: { derived_from: 'R1-S001-0001', provenance: 'doc-derived' } },
    ]);
    const { main } = await import('../commands/validate-jsonl.js');
    const result = await main(['--file', fp, '--workdir', wd]);
    assert.equal((result.data as ValidationResultData).valid, true);
    fs.rmSync(path.dirname(wd), { recursive: true, force: true });
  });

  it('rejects an unknown provenance value', async () => {
    const wd = tmpWorkdir('srs-prov-bad-');
    const fp = writeJsonl(wd, 'r1.jsonl', [
      { id: 'R1-S001-0001', category: 'explicit', statement: 'x', source_file: 'srs.md', confidence: 'high', metadata: { provenance: 'guessed' } },
    ]);
    const { main } = await import('../commands/validate-jsonl.js');
    const result = await main(['--file', fp, '--workdir', wd]);
    const data = result.data as ValidationResultData;
    assert.equal(data.valid, false);
    assert.ok(data.errors.some(e => e.includes('provenance')));
    fs.rmSync(path.dirname(wd), { recursive: true, force: true });
  });

  it('rejects needs-clarification in r*/architecture JSONL', async () => {
    const wd = tmpWorkdir('srs-prov-needs-');
    const fp = writeJsonl(wd, 'r2.jsonl', [
      { id: 'R2-S001-0001', category: 'implicit', statement: 'x', source_file: 'srs.md', confidence: 'low', metadata: { derived_from: 'R1-S001-0001', provenance: 'needs-clarification' } },
    ]);
    const { main } = await import('../commands/validate-jsonl.js');
    const result = await main(['--file', fp, '--workdir', wd]);
    const data = result.data as ValidationResultData;
    assert.equal(data.valid, false);
    assert.ok(data.errors.some(e => e.includes('needs-clarification')));
    fs.rmSync(path.dirname(wd), { recursive: true, force: true });
  });

  it('rejects doc-derived on an explicit/high record', async () => {
    const wd = tmpWorkdir('srs-prov-mismatch-');
    const fp = writeJsonl(wd, 'r1.jsonl', [
      { id: 'R1-S001-0001', category: 'explicit', statement: 'x', source_file: 'srs.md', confidence: 'high', metadata: { provenance: 'doc-derived' } },
    ]);
    const { main } = await import('../commands/validate-jsonl.js');
    const result = await main(['--file', fp, '--workdir', wd]);
    assert.equal((result.data as ValidationResultData).valid, false);
    fs.rmSync(path.dirname(wd), { recursive: true, force: true });
  });
});
describe('validate-architecture arch_version', () => {
  const base = { name: 'M', reasoning: 'a base module for the system', source_shard: 'S001' };

  it('accepts arch_version 2 consistent with ARCH2- prefix', async () => {
    const wd = tmpWorkdir('srs-av-ok-');
    const fp = writeJsonl(wd, 'arch2.jsonl', [
      { id: 'ARCH2-S001-0001', action: 'reparent', reasoning: 'reparent under core module', arch_version: 2 },
    ]);
    const { main } = await import('../commands/validate-architecture.js');
    const result = await main(['--file', fp, '--workdir', wd]);
    assert.equal((result.data as ValidationResultData).valid, true);
    fs.rmSync(path.dirname(wd), { recursive: true, force: true });
  });

  it('rejects arch_version inconsistent with id prefix', async () => {
    const wd = tmpWorkdir('srs-av-mismatch-');
    const fp = writeJsonl(wd, 'arch1.jsonl', [
      { id: 'ARCH-S001-0001', type: 'module', ...base, arch_version: 3 },
    ]);
    const { main } = await import('../commands/validate-architecture.js');
    const result = await main(['--file', fp, '--workdir', wd]);
    const data = result.data as ValidationResultData;
    assert.equal(data.valid, false);
    assert.ok(data.errors.some(e => e.includes('arch_version')));
    fs.rmSync(path.dirname(wd), { recursive: true, force: true });
  });

  it('rejects an out-of-range arch_version value', async () => {
    const wd = tmpWorkdir('srs-av-range-');
    const fp = writeJsonl(wd, 'arch1.jsonl', [
      { id: 'ARCH-S001-0001', type: 'module', ...base, arch_version: 4 },
    ]);
    const { main } = await import('../commands/validate-architecture.js');
    const result = await main(['--file', fp, '--workdir', wd]);
    assert.equal((result.data as ValidationResultData).valid, false);
    fs.rmSync(path.dirname(wd), { recursive: true, force: true });
  });
});
function archNode(id: string, shardId: string): SRSIR['nodes'][number] {
  return {
    id, type: 'architecture', module: 'm', labels: [':Architecture'],
    properties: { statement: id, archType: 'Module' },
    source: { filePath: 'srs.md', startLine: 1, endLine: 2, shardId, chapter: 'c' },
  };
}
function reqNode(id: string, shardId: string): SRSIR['nodes'][number] {
  return {
    id, type: 'requirement', module: 'm', labels: [':Requirement'],
    properties: { statement: id, category: 'explicit', confidence: 'high' },
    source: { filePath: 'srs.md', startLine: 1, endLine: 2, shardId, chapter: 'c' },
  };
}
function containsEdge(src: string, tgt: string): SRSIR['edges'][number] {
  return { id: `E-${src}-${tgt}`, source: src, target: tgt, type: 'contains', properties: {} };
}
function emptyIR(nodes: SRSIR['nodes'], edges: SRSIR['edges']): SRSIR {
  return {
    version: '2.0.0',
    meta: { sourcePath: '', sourceHash: '', language: 'zh', totalChars: 0, totalShards: 0, totalNodes: nodes.length, totalEdges: edges.length, buildTimestamp: '2026-01-01T00:00:00.000Z' },
    nodes, edges, crossRefs: [],
    nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] },
    gaps: [], glossary: [],
  };
}

describe('analyzeHierarchy + hierarchy depth gate', () => {
  it('flags a flat tree (>=3 arch nodes, no contains hierarchy)', () => {
    const ir = emptyIR([archNode('ARCH-S001-0001', 'S001'), archNode('ARCH-S002-0001', 'S002'), archNode('ARCH-S003-0001', 'S003')], []);
    const h = analyzeHierarchy(ir);
    assert.equal(h.flatTree, true);
    assert.equal(h.hierarchyDepth, 1);
  });

  it('computes depth over nested contains edges', () => {
    const ir = emptyIR(
      [archNode('ARCH-S001-0001', 'S001'), archNode('ARCH-S002-0001', 'S002'), archNode('ARCH-S003-0001', 'S003')],
      [containsEdge('ARCH-S001-0001', 'ARCH-S002-0001'), containsEdge('ARCH-S002-0001', 'ARCH-S003-0001')],
    );
    const h = analyzeHierarchy(ir);
    assert.equal(h.flatTree, false);
    assert.equal(h.hierarchyDepth, 3);
  });

  it('checkHierarchyDepth fails on a flat tree', () => {
    const wd = tmpWorkdir('srs-hier-flat-');
    const ir = emptyIR([archNode('ARCH-S001-0001', 'S001'), archNode('ARCH-S002-0001', 'S002'), archNode('ARCH-S003-0001', 'S003')], []);
    fs.writeFileSync(path.join(wd, 'srs-ir.json'), JSON.stringify(ir));
    const result = checkHierarchyDepth(wd);
    assert.equal(result.passed, false);
    assert.ok(result.detail!.includes('flat'));
    fs.rmSync(path.dirname(wd), { recursive: true, force: true });
  });

  it('checkHierarchyDepth passes with a nested tree', () => {
    const wd = tmpWorkdir('srs-hier-ok-');
    const ir = emptyIR(
      [archNode('ARCH-S001-0001', 'S001'), archNode('ARCH-S002-0001', 'S002')],
      [containsEdge('ARCH-S001-0001', 'ARCH-S002-0001')],
    );
    fs.writeFileSync(path.join(wd, 'srs-ir.json'), JSON.stringify(ir));
    const result = checkHierarchyDepth(wd);
    assert.equal(result.passed, true);
    fs.rmSync(path.dirname(wd), { recursive: true, force: true });
  });

  it('checkHierarchyDepth skips when no srs-ir.json', () => {
    const wd = tmpWorkdir('srs-hier-skip-');
    const result = checkHierarchyDepth(wd);
    assert.equal(result.passed, true);
    fs.rmSync(path.dirname(wd), { recursive: true, force: true });
  });
});
describe('checkOrphanAdjudication', () => {
  // Two requirement nodes in different shards, no cross-shard edges → both orphan shards.
  function orphanIR(): SRSIR {
    return emptyIR([reqNode('R1-S001-0001', 'S001'), reqNode('R1-S002-0001', 'S002')], []);
  }

  it('fails when orphan shards are unadjudicated', () => {
    const wd = tmpWorkdir('srs-orphan-fail-');
    fs.writeFileSync(path.join(wd, 'srs-ir.json'), JSON.stringify(orphanIR()));
    const result = checkOrphanAdjudication(wd);
    assert.equal(result.passed, false);
    assert.ok(result.detail!.includes('unadjudicated'));
    fs.rmSync(path.dirname(wd), { recursive: true, force: true });
  });

  it('passes when every orphan is declared standalone with a reason', () => {
    const wd = tmpWorkdir('srs-orphan-adj-');
    fs.writeFileSync(path.join(wd, 'srs-ir.json'), JSON.stringify(orphanIR()));
    fs.mkdirSync(path.join(wd, '_ctx'), { recursive: true });
    fs.writeFileSync(path.join(wd, '_ctx', 'orphan_adjudications.json'), JSON.stringify([
      { shardId: 'S001', standalone: true, reason: 'global compliance clause' },
      { shardId: 'S002', standalone: true, reason: 'standalone audit constraint' },
    ]));
    const result = checkOrphanAdjudication(wd);
    assert.equal(result.passed, true);
    fs.rmSync(path.dirname(wd), { recursive: true, force: true });
  });

  it('rejects adjudication with an empty reason', () => {
    const wd = tmpWorkdir('srs-orphan-noreason-');
    fs.writeFileSync(path.join(wd, 'srs-ir.json'), JSON.stringify(orphanIR()));
    fs.mkdirSync(path.join(wd, '_ctx'), { recursive: true });
    fs.writeFileSync(path.join(wd, '_ctx', 'orphan_adjudications.json'), JSON.stringify([
      { shardId: 'S001', standalone: true, reason: '' },
      { shardId: 'S002', standalone: true, reason: '  ' },
    ]));
    const result = checkOrphanAdjudication(wd);
    assert.equal(result.passed, false);
    fs.rmSync(path.dirname(wd), { recursive: true, force: true });
  });

  it('passes and reports single-component graph when connected', () => {
    const wd = tmpWorkdir('srs-orphan-connected-');
    // Two shards linked by a cross-shard contains edge → connected, no orphans.
    const ir = emptyIR(
      [reqNode('R1-S001-0001', 'S001'), reqNode('R1-S002-0001', 'S002')],
      [{ id: 'E1', source: 'R1-S001-0001', target: 'R1-S002-0001', type: 'depends_on', properties: {} }],
    );
    fs.writeFileSync(path.join(wd, 'srs-ir.json'), JSON.stringify(ir));
    const report = checkConnectivity(ir);
    assert.equal(report.connectedComponents, 1);
    const result = checkOrphanAdjudication(wd);
    assert.equal(result.passed, true);
    fs.rmSync(path.dirname(wd), { recursive: true, force: true });
  });
});
