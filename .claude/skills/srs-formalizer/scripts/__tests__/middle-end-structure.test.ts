import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeStructure } from '../lib/middle-end/structure-analyzer.js';
import type { SRSIR } from '../types/srs-ir.js';

describe('M1 Structure Analyzer', () => {
  it('should detect orphan nodes', () => {
    const ir: SRSIR = {
      version: '2.1.0',
      meta: { sourcePath: '', sourceHash: '', language: 'zh', totalChars: 0, totalShards: 0, totalNodes: 3, totalEdges: 1, buildTimestamp: '' },
      nodes: [
        { id: 'N1', type: 'requirement', module: 'S001', labels: [':Requirement'], properties: {}, source: { filePath: 'a.md', startLine: 1, endLine: 2, shardId: 'S001', chapter: '' } },
        { id: 'N2', type: 'requirement', module: 'S001', labels: [':Requirement'], properties: {}, source: { filePath: 'a.md', startLine: 3, endLine: 4, shardId: 'S001', chapter: '' } },
        { id: 'N3', type: 'requirement', module: 'S002', labels: [':Requirement'], properties: {}, source: { filePath: 'b.md', startLine: 1, endLine: 2, shardId: 'S002', chapter: '' } },
      ],
      edges: [{ id: 'e1', source: 'N1', target: 'N2', type: 'depends_on', properties: {} }],
      crossRefs: [], nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] }, gaps: [], glossary: [],
    };
    const report = analyzeStructure(ir);
    assert.ok(report.orphans.includes('N3'), 'N3 should be orphan');
    assert.equal(report.stats.orphanRate, 1 / 3);
  });

  it('should detect dangling edges', () => {
    const ir: SRSIR = {
      version: '2.1.0',
      meta: { sourcePath: '', sourceHash: '', language: 'zh', totalChars: 0, totalShards: 0, totalNodes: 1, totalEdges: 1, buildTimestamp: '' },
      nodes: [
        { id: 'N1', type: 'requirement', module: 'S001', labels: [':Requirement'], properties: {}, source: { filePath: 'a.md', startLine: 1, endLine: 2, shardId: 'S001', chapter: '' } },
      ],
      edges: [{ id: 'e1', source: 'N1', target: 'N2', type: 'depends_on', properties: {} }],  // N2 不存在
      crossRefs: [], nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] }, gaps: [], glossary: [],
    };
    const report = analyzeStructure(ir);
    assert.ok(report.danglingEdges.includes('e1'), 'e1 should be dangling');
  });

  it('should detect concept islands (<3 nodes)', () => {
    const ir: SRSIR = {
      version: '2.1.0',
      meta: { sourcePath: '', sourceHash: '', language: 'zh', totalChars: 0, totalShards: 0, totalNodes: 3, totalEdges: 1, buildTimestamp: '' },
      nodes: [
        { id: 'N1', type: 'requirement', module: 'S001', labels: [':Requirement'], properties: {}, source: { filePath: 'a.md', startLine: 1, endLine: 2, shardId: 'S001', chapter: '' } },
        { id: 'N2', type: 'requirement', module: 'S001', labels: [':Requirement'], properties: {}, source: { filePath: 'b.md', startLine: 3, endLine: 4, shardId: 'S001', chapter: '' } },
        { id: 'N3', type: 'requirement', module: 'S002', labels: [':Requirement'], properties: {}, source: { filePath: 'c.md', startLine: 1, endLine: 2, shardId: 'S002', chapter: '' } },
      ],
      edges: [{ id: 'e1', source: 'N1', target: 'N2', type: 'depends_on', properties: {} }],
      crossRefs: [], nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] }, gaps: [], glossary: [],
    };
    const report = analyzeStructure(ir);
    // 2 个连通分量：{N1,N2} 和 {N3}，均 <3
    assert.equal(report.conceptIslands.length, 2, 'should have 2 islands');
  });

  it('should detect cross-file islands (all nodes from same file)', () => {
    const ir: SRSIR = {
      version: '2.1.0',
      meta: { sourcePath: '', sourceHash: '', language: 'zh', totalChars: 0, totalShards: 0, totalNodes: 2, totalEdges: 1, buildTimestamp: '' },
      nodes: [
        { id: 'N1', type: 'requirement', module: 'S001', labels: [':Requirement'], properties: {}, source: { filePath: 'same.md', startLine: 1, endLine: 2, shardId: 'S001', chapter: '' } },
        { id: 'N2', type: 'requirement', module: 'S001', labels: [':Requirement'], properties: {}, source: { filePath: 'same.md', startLine: 3, endLine: 4, shardId: 'S001', chapter: '' } },
      ],
      edges: [{ id: 'e1', source: 'N1', target: 'N2', type: 'depends_on', properties: {} }],
      crossRefs: [], nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] }, gaps: [], glossary: [],
    };
    const report = analyzeStructure(ir);
    // {N1,N2} 都来自 same.md → crossFileIsland
    assert.ok(report.crossFileIslands.length >= 1, 'should detect cross-file island');
  });

  it('should treat ≥3-node connected component as neither concept nor cross-file island', () => {
    // 3 节点三角连通，来自 3 个不同文件 → 不是 conceptIsland (3 不<3)，不是 crossFileIsland (多文件)
    const ir: SRSIR = {
      version: '2.1.0',
      meta: { sourcePath: '', sourceHash: '', language: 'zh', totalChars: 0, totalShards: 0, totalNodes: 3, totalEdges: 3, buildTimestamp: '' },
      nodes: [
        { id: 'N1', type: 'requirement', module: 'S001', labels: [':Requirement'], properties: {}, source: { filePath: 'a.md', startLine: 1, endLine: 2, shardId: 'S001', chapter: '' } },
        { id: 'N2', type: 'requirement', module: 'S002', labels: [':Requirement'], properties: {}, source: { filePath: 'b.md', startLine: 1, endLine: 2, shardId: 'S002', chapter: '' } },
        { id: 'N3', type: 'requirement', module: 'S003', labels: [':Requirement'], properties: {}, source: { filePath: 'c.md', startLine: 1, endLine: 2, shardId: 'S003', chapter: '' } },
      ],
      edges: [
        { id: 'e1', source: 'N1', target: 'N2', type: 'depends_on', properties: {} },
        { id: 'e2', source: 'N2', target: 'N3', type: 'depends_on', properties: {} },
        { id: 'e3', source: 'N3', target: 'N1', type: 'depends_on', properties: {} },
      ],
      crossRefs: [], nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] }, gaps: [], glossary: [],
    };
    const report = analyzeStructure(ir);
    assert.equal(report.stats.connectedComponents, 1, '3-node triangle should be 1 component');
    assert.equal(report.conceptIslands.length, 0, '3-node component is not a concept island');
    assert.equal(report.crossFileIslands.length, 0, 'multi-file component is not a cross-file island');
    assert.equal(report.orphans.length, 0, 'no orphans in fully connected graph');
  });

  it('should not let dangling edge endpoints pollute connected components', () => {
    // 1 真实节点 N1 + dangling edge N1->N4 (N4 不存在)
    // 修复前: N4 会被推入 queue 污染连通分量；修复后: 仅 N1 一个节点
    const ir: SRSIR = {
      version: '2.1.0',
      meta: { sourcePath: '', sourceHash: '', language: 'zh', totalChars: 0, totalShards: 0, totalNodes: 1, totalEdges: 1, buildTimestamp: '' },
      nodes: [
        { id: 'N1', type: 'requirement', module: 'S001', labels: [':Requirement'], properties: {}, source: { filePath: 'a.md', startLine: 1, endLine: 2, shardId: 'S001', chapter: '' } },
      ],
      edges: [{ id: 'e1', source: 'N1', target: 'N4', type: 'depends_on', properties: {} }], // N4 dangling
      crossRefs: [], nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] }, gaps: [], glossary: [],
    };
    const report = analyzeStructure(ir);
    assert.ok(report.danglingEdges.includes('e1'), 'e1 should be dangling');
    assert.equal(report.stats.connectedComponents, 1, 'only N1 forms 1 component');
    // 关键断言：连通分量内容只有 N1，不含 N4
    const allComponentNodes = new Set(report.conceptIslands.flat());
    assert.ok(!allComponentNodes.has('N4'), 'dangling endpoint N4 must not pollute components');
  });

  it('should handle empty graph', () => {
    const ir: SRSIR = {
      version: '2.1.0',
      meta: { sourcePath: '', sourceHash: '', language: 'zh', totalChars: 0, totalShards: 0, totalNodes: 0, totalEdges: 0, buildTimestamp: '' },
      nodes: [],
      edges: [],
      crossRefs: [], nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] }, gaps: [], glossary: [],
    };
    const report = analyzeStructure(ir);
    assert.equal(report.stats.totalNodes, 0);
    assert.equal(report.stats.orphanRate, 0);
    assert.equal(report.orphans.length, 0);
  });
});
