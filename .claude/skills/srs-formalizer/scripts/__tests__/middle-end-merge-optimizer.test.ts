import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { optimizeMerges } from '../lib/middle-end/merge-optimizer.js';
import type { SRSIR, IRNode } from '../types/srs-ir.js';

// 辅助函数：构造最小 SRSIR
function makeIR(nodes: SRSIR['nodes'], edges: SRSIR['edges'] = []): SRSIR {
  return {
    version: '2.1.0',
    meta: { sourcePath: '', sourceHash: '', language: 'zh', totalChars: 0, totalShards: 0, totalNodes: nodes.length, totalEdges: edges.length, buildTimestamp: '' },
    nodes, edges, crossRefs: [],
    nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] },
    gaps: [], glossary: [],
  };
}

function req(id: string, statement: string, module = 'S001'): IRNode {
  return {
    id, type: 'requirement', module, labels: [':Requirement'],
    properties: { statement },
    source: { filePath: 'a.md', startLine: 1, endLine: 2, shardId: 'S001', chapter: '' },
  };
}

describe('M5 Merge Optimizer', () => {
  it('should generate conflicts_with edges for antonym conflict pairs', () => {
    // "必须" vs "不得" → antonym conflict
    const ir = makeIR([
      req('R1', '系统必须支持用户登录'),
      req('R2', '系统不得支持游客访问'),
    ]);
    const result = optimizeMerges(ir);
    const conflictEdges = result.edges.filter(e => e.type === 'conflicts_with');
    assert.equal(conflictEdges.length, 1);
    assert.equal(conflictEdges[0]!.source, 'R1');
    assert.equal(conflictEdges[0]!.target, 'R2');
  });

  it('should generate same_aspect edges for same-module clusters (>=3 nodes)', () => {
    const ir = makeIR([
      req('R1', '系统必须支持用户登录', 'M-auth'),
      req('R2', '系统必须支持密码重置', 'M-auth'),
      req('R3', '系统必须支持会话超时', 'M-auth'),
    ]);
    const result = optimizeMerges(ir);
    const sameAspectEdges = result.edges.filter(e => e.type === 'same_aspect');
    assert.equal(sameAspectEdges.length, 2, 'should have 2 same_aspect edges (R1->R2, R1->R3)');
    assert.equal(sameAspectEdges[0]!.source, 'R1');
  });

  it('should not duplicate edges on idempotent re-run', () => {
    const ir = makeIR([
      req('R1', '系统必须支持用户登录', 'M-auth'),
      req('R2', '系统必须支持密码重置', 'M-auth'),
      req('R3', '系统必须支持会话超时', 'M-auth'),
      req('R4', '系统不得支持游客访问'),
    ]);
    const firstRun = optimizeMerges(ir);
    const secondRun = optimizeMerges(firstRun);
    assert.equal(secondRun.edges.length, firstRun.edges.length,
      'second run should not add duplicate edges');
  });

  it('should leave edges unchanged when no conflicts or clusters exist', () => {
    const ir = makeIR([
      req('R1', '系统必须支持用户登录', 'M-auth'),
      req('R2', '系统必须支持数据导出', 'M-data'),
    ]);
    const result = optimizeMerges(ir);
    assert.equal(result.edges.length, 0, 'no new edges should be added');
  });

  it('should handle empty IR gracefully', () => {
    const ir = makeIR([]);
    const result = optimizeMerges(ir);
    assert.equal(result.edges.length, 0);
  });
});
