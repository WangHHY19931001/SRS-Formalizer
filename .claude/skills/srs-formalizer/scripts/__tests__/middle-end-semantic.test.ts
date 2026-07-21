import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSemantics } from '../lib/middle-end/semantic-analyzer.js';
import type { SRSIR, IRNode } from '../types/srs-ir.js';

// 辅助函数：构造最小 SRSIR
function makeIR(nodes: SRSIR['nodes']): SRSIR {
  return {
    version: '2.1.0',
    meta: { sourcePath: '', sourceHash: '', language: 'zh', totalChars: 0, totalShards: 0, totalNodes: nodes.length, totalEdges: 0, buildTimestamp: '' },
    nodes,
    edges: [],
    crossRefs: [],
    nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] },
    gaps: [],
    glossary: [],
  };
}

function req(id: string, statement: string, module = 'S001'): IRNode {
  return {
    id, type: 'requirement', module, labels: [':Requirement'],
    properties: { statement },
    source: { filePath: 'a.md', startLine: 1, endLine: 2, shardId: 'S001', chapter: '' },
  };
}

describe('M2 Semantic Analyzer', () => {
  it('should detect duplicate pairs (Jaccard >= 0.8)', () => {
    const ir = makeIR([
      req('R1', '系统必须支持用户登录认证'),
      req('R2', '系统必须支持用户登录认证'),  // 完全相同
    ]);
    const report = analyzeSemantics(ir);
    assert.equal(report.duplicatePairs.length, 1);
    assert.ok(report.duplicatePairs[0]!.jaccard >= 0.8);
  });

  it('should return no duplicate pairs for fully different statements', () => {
    const ir = makeIR([
      req('R1', '用户登录认证流程'),
      req('R2', '数据库备份恢复策略'),
      req('R3', '日志审计追踪机制'),
    ]);
    const report = analyzeSemantics(ir);
    assert.equal(report.duplicatePairs.length, 0);
  });

  it('should detect conflict pairs with Chinese antonyms (必须 vs 不得)', () => {
    const ir = makeIR([
      req('R1', '系统必须支持用户登录'),
      req('R2', '系统不得支持游客访问'),
    ]);
    const report = analyzeSemantics(ir);
    assert.equal(report.conflictPairs.length, 1);
    assert.ok(report.conflictPairs[0]!.reason.includes('antonym conflict'));
  });

  it('should detect conflict pairs with English antonyms (must vs must not)', () => {
    const ir = makeIR([
      req('R1', 'The system must support user login'),
      req('R2', 'The system must not allow guest access'),
    ]);
    const report = analyzeSemantics(ir);
    assert.equal(report.conflictPairs.length, 1);
    assert.ok(report.conflictPairs[0]!.reason.includes('antonym conflict'));
  });

  it('should cluster same-module requirements (>=3 nodes)', () => {
    const ir = makeIR([
      req('R1', '系统必须支持用户登录', 'M-auth'),
      req('R2', '系统必须支持密码重置', 'M-auth'),
      req('R3', '系统必须支持会话超时', 'M-auth'),
    ]);
    const report = analyzeSemantics(ir);
    const cluster = report.sameAspectClusters.find(c => c.module === 'M-auth');
    assert.ok(cluster, 'M-auth cluster should exist');
    assert.equal(cluster!.nodes.length, 3);
  });

  it('should not cluster when fewer than 3 nodes share a module', () => {
    const ir = makeIR([
      req('R1', '系统必须支持用户登录', 'M-auth'),
      req('R2', '系统必须支持数据导出', 'M-data'),
    ]);
    const report = analyzeSemantics(ir);
    assert.equal(report.sameAspectClusters.length, 0);
  });

  it('should filter out non-requirement nodes from analysis', () => {
    const ir = makeIR([
      { id: 'A1', type: 'architecture', module: 'S001', labels: [':Architecture'], properties: { statement: '系统必须支持用户登录' }, source: { filePath: 'a.md', startLine: 1, endLine: 2, shardId: 'S001', chapter: '' } },
      req('R1', '系统必须支持用户登录'),
    ]);
    const report = analyzeSemantics(ir);
    assert.equal(report.stats.totalAnalyzed, 1);
  });

  it('should handle empty IR gracefully', () => {
    const ir = makeIR([]);
    const report = analyzeSemantics(ir);
    assert.equal(report.stats.totalAnalyzed, 0);
    assert.equal(report.stats.duplicateCount, 0);
    assert.equal(report.stats.conflictCount, 0);
    assert.equal(report.duplicatePairs.length, 0);
    assert.equal(report.conflictPairs.length, 0);
    assert.equal(report.sameAspectClusters.length, 0);
  });

  it('should not crash when statement is missing from properties', () => {
    const ir = makeIR([
      { id: 'R1', type: 'requirement', module: 'S001', labels: [':Requirement'], properties: {}, source: { filePath: 'a.md', startLine: 1, endLine: 2, shardId: 'S001', chapter: '' } },
      { id: 'R2', type: 'requirement', module: 'S001', labels: [':Requirement'], properties: {}, source: { filePath: 'a.md', startLine: 3, endLine: 4, shardId: 'S001', chapter: '' } },
    ]);
    const report = analyzeSemantics(ir);
    assert.equal(report.duplicatePairs.length, 0);
    assert.equal(report.conflictPairs.length, 0);
  });
});
