import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { extractFrozenRids, buildRidMapping } from '../lib/rid-mapping.js';
import type { SRSIR, IRNode } from '../types/srs-ir.js';

function ir(nodes: Partial<IRNode>[]): SRSIR {
  return {
    version: '2.0.0',
    meta: { sourcePath: '', sourceHash: '', language: 'zh', totalChars: 0, totalShards: 0, totalNodes: nodes.length, totalEdges: 0, buildTimestamp: '' },
    nodes: nodes.map((n, i) => ({ id: n.id ?? `R1-S001-${i}`, type: n.type ?? 'requirement', module: 'm', labels: [], properties: n.properties ?? {}, source: { filePath: 'f', startLine: 1, endLine: 1, shardId: 'S001', chapter: '' } })) as IRNode[],
    edges: [], crossRefs: [],
    nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] },
    gaps: [], glossary: [],
  };
}

describe('rid-mapping extractFrozenRids', () => {
  it('extracts @RID tags from feature text', () => {
    const text = '@RID-BDD-LOOP-001\nScenario: loop does not fabricate intent RID-BDD-LOOP-001';
    const rids = extractFrozenRids(text);
    assert.equal(rids.length, 1);
    assert.equal(rids[0]!.rid, 'RID-BDD-LOOP-001');
  });

  it('captures multiple distinct RIDs', () => {
    const rids = extractFrozenRids('@RID-BDD-GOV-001\n@RID-BDD-GOV-002');
    assert.deepEqual(rids.map(r => r.rid).sort(), ['RID-BDD-GOV-001', 'RID-BDD-GOV-002']);
  });
});

describe('rid-mapping buildRidMapping', () => {
  it('prefers an explicit ridRef link (confidence 1)', () => {
    const model = ir([{ id: 'R1-S001-1', properties: { statement: 'loop', ridRef: 'RID-BDD-LOOP-001' } }]);
    const map = buildRidMapping([{ rid: 'RID-BDD-LOOP-001', text: 'anything' }], model, 'frozen');
    const entry = map.entries.find(e => e.rid === 'RID-BDD-LOOP-001');
    assert.equal(entry?.matchType, 'explicit-tag');
    assert.deepEqual(entry?.irNodeIds, ['R1-S001-1']);
  });

  it('falls back to statement similarity', () => {
    const model = ir([{ id: 'R1-S001-1', properties: { statement: '循环不得编造缺失的用户意图 fabricate intent' } }]);
    const map = buildRidMapping([{ rid: 'RID-BDD-LOOP-005', text: 'loop does not fabricate missing user intent 编造 意图' }], model, 'frozen');
    const entry = map.entries.find(e => e.rid === 'RID-BDD-LOOP-005');
    assert.equal(entry?.matchType, 'statement-similarity');
    assert.ok((entry?.confidence ?? 0) > 0);
  });

  it('records unmapped RIDs and unmapped node ids', () => {
    const model = ir([{ id: 'R1-S001-1', properties: { statement: 'completely unrelated topic zzz' } }]);
    const map = buildRidMapping([{ rid: 'RID-BDD-X-001', text: 'qqq wholly different vocabulary' }], model, 'frozen');
    assert.ok(map.unmappedRids.includes('RID-BDD-X-001'));
    assert.ok(map.unmappedNodeIds.includes('R1-S001-1'));
  });
});
