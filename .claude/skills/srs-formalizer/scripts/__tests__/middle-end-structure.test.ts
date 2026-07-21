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
