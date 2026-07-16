import { describe, it } from 'node:test';
import assert from 'node:assert';
import { scoreRisk } from '../lib/middle-end/risk-scorer.js';
import type { SRSIR } from '../types/srs-ir.js';

function emptyIR(): SRSIR {
  return {
    version: '2.0.0',
    meta: {
      sourcePath: '/t',
      sourceHash: '',
      language: 'zh',
      totalChars: 0,
      totalShards: 0,
      totalNodes: 0,
      totalEdges: 0,
      buildTimestamp: new Date().toISOString(),
    },
    nodes: [],
    edges: [],
    crossRefs: [],
    nfrProfile: {
      detectedCategories: [],
      weightedShards: [],
      overallCoverage: 0,
      blindSpots: [
        'performance',
        'security',
        'availability',
        'compatibility',
        'maintainability',
        'compliance',
      ],
    },
    gaps: [],
    glossary: [],
  };
}

function makeNode(
  id: string,
  shardId: string,
  statement: string,
  type: SRSIR['nodes'][number]['type'] = 'requirement',
): SRSIR['nodes'][number] {
  return {
    id,
    type,
    module: 'm',
    labels: [type === 'nfr' ? 'NFRPerformance' : 'Requirement'],
    properties: { statement },
    source: {
      filePath: '/t',
      startLine: 1,
      endLine: 1,
      shardId,
      chapter: '§1',
    },
  };
}

function makeEdge(id: string, source: string, target: string, type: SRSIR['edges'][number]['type'] = 'depends_on'): SRSIR['edges'][number] {
  return { id, source, target, type, properties: {} };
}

describe('scoreRisk', () => {
  it('low risk: fully connected + high NFR coverage → riskScore < 0.3', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [
        makeNode('R1', 'shard-a', '用户登录'),
        makeNode('R2', 'shard-a', '用户登出'),
        makeNode('R3', 'shard-a', '系统响应时间 ≤ 200ms'),
        makeNode('R4', 'shard-a', '采用 AES-256 加密'),
      ],
      edges: [
        makeEdge('E1', 'R1', 'R2'),
        makeEdge('E2', 'R2', 'R3'),
        makeEdge('E3', 'R3', 'R4'),
      ],
      nfrProfile: {
        detectedCategories: [
          { category: 'performance', keywordHits: 1, shardIds: ['shard-a'], nodeIds: ['R3'] },
          { category: 'security', keywordHits: 1, shardIds: ['shard-a'], nodeIds: ['R4'] },
        ],
        weightedShards: [],
        overallCoverage: 0.67,
        blindSpots: [],
      },
      gaps: [],
    };
    const report = scoreRisk(ir);
    assert.ok(report.riskScore < 0.3, `expected riskScore < 0.3, got ${report.riskScore}`);
  });

  it('high risk: many orphans + zero NFR coverage → riskScore > 0.6', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [
        makeNode('R1', 'shard-a', '用户登录'),
        makeNode('R2', 'shard-b', '用户登出'),
        makeNode('R3', 'shard-c', '订单创建'),
      ],
      edges: [],
      nfrProfile: {
        detectedCategories: [],
        weightedShards: [],
        overallCoverage: 0,
        blindSpots: ['performance', 'security', 'availability', 'compatibility', 'maintainability', 'compliance'],
      },
      gaps: [
        { priority: 'P0', type: 'undefined_term', description: 'missing security term', sourceChapter: '§1' },
        { priority: 'P1', type: 'missing_reference', description: 'missing ref', sourceChapter: '§2' },
      ],
    };
    const report = scoreRisk(ir);
    assert.ok(report.riskScore > 0.6, `expected riskScore > 0.6, got ${report.riskScore}`);
  });

  it('riskScore is always between 0 and 1', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [
        makeNode('R1', 'shard-a', '用户登录'),
        makeNode('R2', 'shard-a', '用户登出'),
      ],
      edges: [makeEdge('E1', 'R1', 'R2')],
      nfrProfile: {
        detectedCategories: [
          { category: 'performance', keywordHits: 1, shardIds: ['shard-a'], nodeIds: [] },
        ],
        weightedShards: [],
        overallCoverage: 0.5,
        blindSpots: [],
      },
      gaps: [{ priority: 'P1', type: 'undefined_term', description: 'x', sourceChapter: '§1' }],
    };
    const report = scoreRisk(ir);
    assert.ok(report.riskScore >= 0, `riskScore should be >= 0, got ${report.riskScore}`);
    assert.ok(report.riskScore <= 1, `riskScore should be <= 1, got ${report.riskScore}`);
  });

  it('highRiskShards contains shardIds of orphan nodes', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [
        makeNode('R1', 'shard-a', '用户登录'),
        makeNode('R2', 'shard-a', '用户登出'),
        makeNode('R3', 'shard-b', '孤立节点，无任何边'),
      ],
      edges: [makeEdge('E1', 'R1', 'R2')],
    };
    const report = scoreRisk(ir);
    assert.ok(report.highRiskShards.includes('shard-b'), `highRiskShards should include shard-b, got ${JSON.stringify(report.highRiskShards)}`);
  });

  it('weight formula: all perfect → riskScore near 0', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [
        makeNode('R1', 'shard-a', '用户登录'),
        makeNode('R2', 'shard-a', '用户登出'),
      ],
      edges: [makeEdge('E1', 'R1', 'R2')],
      nfrProfile: {
        detectedCategories: [
          { category: 'performance', keywordHits: 1, shardIds: ['shard-a'], nodeIds: [] },
          { category: 'security', keywordHits: 1, shardIds: ['shard-a'], nodeIds: [] },
          { category: 'availability', keywordHits: 1, shardIds: ['shard-a'], nodeIds: [] },
          { category: 'compatibility', keywordHits: 1, shardIds: ['shard-a'], nodeIds: [] },
          { category: 'maintainability', keywordHits: 1, shardIds: ['shard-a'], nodeIds: [] },
          { category: 'compliance', keywordHits: 1, shardIds: ['shard-a'], nodeIds: [] },
        ],
        weightedShards: [],
        overallCoverage: 1,
        blindSpots: [],
      },
      gaps: [],
    };
    const report = scoreRisk(ir);
    assert.ok(report.breakdown.orphanRate === 0);
    assert.ok(report.breakdown.crossFileCoverage === 1);
    assert.ok(report.breakdown.nfrCoverage === 1);
    assert.ok(report.breakdown.gapWeight === 0);
    assert.ok(report.riskScore < 0.05, `all-perfect should have risk near 0, got ${report.riskScore}`);
  });

  it('mutates ir.meta.riskScore and ir.meta.highRiskShards', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [
        makeNode('R1', 'shard-a', '用户登录'),
        makeNode('R2', 'shard-b', '孤立节点，无任何边'),
      ],
      edges: [],
    };
    scoreRisk(ir);
    assert.strictEqual(typeof ir.meta.riskScore, 'number');
    assert.ok(ir.meta.riskScore! >= 0 && ir.meta.riskScore! <= 1);
    assert.ok(Array.isArray(ir.meta.highRiskShards));
    assert.ok(ir.meta.highRiskShards!.includes('shard-a'));
    assert.ok(ir.meta.highRiskShards!.includes('shard-b'));
  });
});
