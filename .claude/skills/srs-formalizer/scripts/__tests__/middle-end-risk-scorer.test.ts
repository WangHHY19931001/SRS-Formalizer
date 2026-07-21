import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreRisk } from '../lib/middle-end/risk-scorer.js';
import type { SRSIR, IRNode, IREdge, IRGap } from '../types/srs-ir.js';

// 辅助函数：构造最小 SRSIR
function makeIR(nodes: SRSIR['nodes'], edges: SRSIR['edges'] = [], gaps: SRSIR['gaps'] = []): SRSIR {
  return {
    version: '2.1.0',
    meta: { sourcePath: '', sourceHash: '', language: 'zh', totalChars: 0, totalShards: 0, totalNodes: nodes.length, totalEdges: edges.length, buildTimestamp: '' },
    nodes, edges, crossRefs: [],
    nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] },
    gaps, glossary: [],
  };
}

function req(id: string, statement: string, module = 'S001', filePath = 'a.md', shardId = 'S001'): IRNode {
  return {
    id, type: 'requirement', module, labels: [':Requirement'],
    properties: { statement },
    source: { filePath, startLine: 1, endLine: 2, shardId, chapter: '' },
  };
}

function edge(id: string, source: string, target: string): IREdge {
  return { id, source, target, type: 'depends_on', properties: {} };
}

function gap(desc: string): IRGap {
  return { priority: 'P1', type: 'unsolved_issue', description: desc, sourceChapter: 'ch1' };
}

describe('M6 Risk Scorer', () => {
  it('should produce riskScore > 0 when orphan nodes exist', () => {
    // 2 nodes, 0 edges → both orphans, orphanRate=1.0
    const ir = makeIR([
      req('R1', '系统必须支持登录', 'S001', 'a.md', 'S001'),
      req('R2', '系统必须支持导出', 'S001', 'a.md', 'S001'),
    ]);
    const result = scoreRisk(ir);
    assert.ok(result.meta.riskScore !== undefined);
    assert.ok(result.meta.riskScore! > 0, 'riskScore should be > 0 with orphans');
  });

  it('should increase riskScore with cross-file edges', () => {
    // 2 nodes from different files, 1 cross-file edge, 0 orphans
    // orphanRate=0, crossFileCoverage=1.0, nfrCoverage=0, gapWeight=0
    // riskScore = 0*0.2 + 1.0*0.3 + 0*0.3 + 0*0.2 = 0.3
    const ir = makeIR([
      req('R1', '系统必须支持登录', 'S001', 'a.md', 'S001'),
      req('R2', '系统必须支持导出', 'S002', 'b.md', 'S002'),
    ], [edge('e1', 'R1', 'R2')]);
    const result = scoreRisk(ir);
    assert.ok(result.meta.riskScore !== undefined);
    assert.ok(result.meta.riskScore! > 0, 'cross-file edge should increase riskScore');
  });

  it('should populate meta.riskScore and meta.highRiskShards with orphan shard IDs', () => {
    // 3 nodes, 1 edge connecting R1-R2 (same file), R3 is orphan from shard S002
    const ir = makeIR([
      req('R1', '系统必须支持登录', 'S001', 'a.md', 'S001'),
      req('R2', '系统必须支持导出', 'S001', 'a.md', 'S001'),
      req('R3', '系统必须支持审计', 'S002', 'b.md', 'S002'),
    ], [edge('e1', 'R1', 'R2')]);
    const result = scoreRisk(ir);
    assert.ok(result.meta.riskScore !== undefined, 'riskScore should be defined');
    assert.ok(result.meta.highRiskShards !== undefined, 'highRiskShards should be defined');
    assert.ok(result.meta.highRiskShards!.includes('S002'), 'highRiskShards should contain S002');
  });

  it('should handle empty IR gracefully (riskScore=0)', () => {
    const ir = makeIR([]);
    const result = scoreRisk(ir);
    assert.ok(result.meta.riskScore !== undefined);
    assert.equal(result.meta.riskScore, 0);
    assert.ok(result.meta.highRiskShards !== undefined);
    assert.equal(result.meta.highRiskShards!.length, 0);
  });

  it('should compute exact riskScore formula with all four factors', () => {
    // 4 nodes from 4 different files, 2 cross-file edges, 0 orphans
    // orphanRate = 0, crossFileCoverage = 2/2 = 1.0
    // nfrCoverage = 0.5 (set in profile), gapWeight = 2/4 = 0.5
    // riskScore = 0*0.2 + 1.0*0.3 + 0.5*0.3 + 0.5*0.2
    const ir = makeIR([
      req('R1', '系统必须支持登录', 'S001', 'a.md', 'S001'),
      req('R2', '系统必须支持导出', 'S002', 'b.md', 'S002'),
      req('R3', '系统必须支持审计', 'S003', 'c.md', 'S003'),
      req('R4', '系统必须支持备份', 'S004', 'd.md', 'S004'),
    ], [
      edge('e1', 'R1', 'R2'),
      edge('e2', 'R3', 'R4'),
    ], [gap('gap1'), gap('gap2')]);
    ir.nfrProfile.overallCoverage = 0.5;

    const result = scoreRisk(ir);
    const expected = 0 * 0.2 + 1.0 * 0.3 + 0.5 * 0.3 + 0.5 * 0.2;
    assert.ok(result.meta.riskScore !== undefined);
    assert.ok(Math.abs(result.meta.riskScore! - expected) < 1e-9,
      `riskScore ${result.meta.riskScore} should equal ${expected}`);
  });
});
