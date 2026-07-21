import { describe, it } from 'node:test';
import assert from 'node:assert';
import { checkConnectivity, analyzeAtomicTree } from '../lib/middle-end/connectivity-checker.js';
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
): SRSIR['nodes'][number] {
  return {
    id,
    type: 'requirement',
    module: 'm',
    labels: ['Requirement'],
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

describe('checkConnectivity', () => {
  it('empty IR → zero shards, zero components', () => {
    const ir = emptyIR();
    const report = checkConnectivity(ir);
    assert.strictEqual(report.totalShards, 0);
    assert.strictEqual(report.connectedComponents, 0);
    assert.strictEqual(report.bridges.length, 0);
    assert.strictEqual(report.orphanShards.length, 0);
  });

  it('single shard → one component, no orphans', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [
        makeNode('R1', 'shard-a', '用户登录'),
        makeNode('R2', 'shard-a', '用户登出'),
      ],
      edges: [
        {
          id: 'E1',
          source: 'R1',
          target: 'R2',
          type: 'depends_on',
          properties: {},
        },
      ],
    };
    const report = checkConnectivity(ir);
    assert.strictEqual(report.totalShards, 1);
    assert.strictEqual(report.connectedComponents, 1);
    assert.strictEqual(report.orphanShards.length, 0);
    assert.strictEqual(report.bridges.length, 0);
  });

  it('two disconnected shards → two components, both orphan', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [
        makeNode('R1', 'shard-a', '用户登录'),
        makeNode('R2', 'shard-b', '支付功能'),
      ],
      edges: [],
    };
    const report = checkConnectivity(ir);
    assert.strictEqual(report.totalShards, 2);
    assert.strictEqual(report.connectedComponents, 2);
    assert.deepStrictEqual(
      [...report.orphanShards].sort(),
      ['shard-a', 'shard-b'],
    );
  });

  it('crossRefs connect two shards → one component', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [
        makeNode('R1', 'shard-a', '用户登录'),
        makeNode('R2', 'shard-b', '密码重置时验证用户'),
      ],
      edges: [],
      crossRefs: [
        {
          sourceShard: 'shard-a',
          targetShard: 'shard-b',
          refType: 'explicit_see',
          anchorText: 'see §2 password reset',
          confidence: 0.9,
        },
      ],
    };
    const report = checkConnectivity(ir);
    assert.strictEqual(report.totalShards, 2);
    assert.strictEqual(report.connectedComponents, 1);
    assert.strictEqual(report.orphanShards.length, 0);
  });

  it('edge connecting nodes in different shards → one component', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [
        makeNode('R1', 'shard-a', '用户认证'),
        makeNode('R2', 'shard-b', '会话管理依赖认证'),
      ],
      edges: [
        {
          id: 'E1',
          source: 'R1',
          target: 'R2',
          type: 'depends_on',
          properties: {},
        },
      ],
    };
    const report = checkConnectivity(ir);
    assert.strictEqual(report.totalShards, 2);
    assert.strictEqual(report.connectedComponents, 1);
    assert.strictEqual(report.orphanShards.length, 0);
  });

  it('three shards, two connected via edge, one isolated → two components', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [
        makeNode('R1', 'shard-a', '用户登录'),
        makeNode('R2', 'shard-b', '登录后创建会话'),
        makeNode('R3', 'shard-c', '性能要求'),
      ],
      edges: [
        {
          id: 'E1',
          source: 'R1',
          target: 'R2',
          type: 'depends_on',
          properties: {},
        },
      ],
    };
    const report = checkConnectivity(ir);
    assert.strictEqual(report.totalShards, 3);
    assert.strictEqual(report.connectedComponents, 2);
    assert.ok(report.orphanShards.includes('shard-c'));
  });

  it('bridge proposal when shards share keywords', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [
        makeNode('R1', 'shard-a', '用户认证系统需要支持双因子'),
        makeNode('R2', 'shard-b', '认证服务必须高可用'),
      ],
      edges: [],
    };
    const report = checkConnectivity(ir);
    assert.strictEqual(report.connectedComponents, 2);
    assert.ok(report.bridges.length > 0);
    const bridge = report.bridges[0]!;
    assert.strictEqual(bridge.sourceNode, 'R1');
    assert.strictEqual(bridge.targetNode, 'R2');
    assert.ok(bridge.confidence > 0);
    assert.ok(bridge.reason.includes('Shared keywords'));
  });

  it('bridge not proposed when no keyword overlap', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [
        makeNode('R1', 'shard-a', 'abcxyz'),
        makeNode('R2', 'shard-b', 'defghi'),
      ],
      edges: [],
    };
    const report = checkConnectivity(ir);
    assert.strictEqual(report.connectedComponents, 2);
    assert.strictEqual(report.bridges.length, 0);
  });

  it('ignores edges with missing node references', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [makeNode('R1', 'shard-a', '用户登录')],
      edges: [
        {
          id: 'E1',
          source: 'R1',
          target: 'NONEXISTENT',
          type: 'depends_on',
          properties: {},
        },
      ],
    };
    const report = checkConnectivity(ir);
    assert.strictEqual(report.totalShards, 1);
    assert.strictEqual(report.connectedComponents, 1);
  });
});

function makeArch(id: string): SRSIR['nodes'][number] {
  return {
    id,
    type: 'architecture',
    module: 'm',
    labels: ['Architecture'],
    properties: { statement: id, archType: 'Module' },
    source: { filePath: '/t', startLine: 1, endLine: 1, shardId: 's', chapter: '§1' },
  };
}

function edge(id: string, source: string, target: string, type: SRSIR['edges'][number]['type']): SRSIR['edges'][number] {
  return { id, source, target, type, properties: {} };
}

describe('analyzeAtomicTree', () => {
  it('no architecture nodes → wellFormed (skipped)', () => {
    const report = analyzeAtomicTree(emptyIR());
    assert.strictEqual(report.architectureNodes, 0);
    assert.strictEqual(report.wellFormed, true);
  });

  it('single-root tree with requirements attached → wellFormed', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [
        makeArch('A-SYS'),
        makeArch('A-SUB1'),
        makeArch('A-SUB2'),
        makeNode('R1', 's', '原子操作一'),
        makeNode('R2', 's', '原子操作二'),
      ],
      edges: [
        edge('E1', 'A-SYS', 'A-SUB1', 'contains'),
        edge('E2', 'A-SYS', 'A-SUB2', 'contains'),
        edge('E3', 'A-SUB1', 'R1', 'contains'),
        edge('E4', 'A-SUB2', 'R2', 'refines'),
      ],
    };
    const report = analyzeAtomicTree(ir);
    assert.deepStrictEqual(report.roots, ['A-SYS']);
    assert.strictEqual(report.cyclicContains, false);
    assert.strictEqual(report.unreachableArchitecture.length, 0);
    assert.strictEqual(report.emptyLeafSubsystems.length, 0);
    assert.strictEqual(report.uncoveredRequirements.length, 0);
    assert.strictEqual(report.wellFormed, true);
  });

  it('multiple roots → not wellFormed', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [makeArch('A-SYS1'), makeArch('A-SYS2'), makeNode('R1', 's', 'op')],
      edges: [edge('E1', 'A-SYS1', 'R1', 'contains'), edge('E2', 'A-SYS2', 'R1', 'contains')],
    };
    const report = analyzeAtomicTree(ir);
    assert.deepStrictEqual(report.roots.sort(), ['A-SYS1', 'A-SYS2']);
    assert.strictEqual(report.wellFormed, false);
  });

  it('unreachable subsystem (floating) → detected', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [makeArch('A-SYS'), makeArch('A-SUB'), makeArch('A-FLOAT'), makeNode('R1', 's', 'op'), makeNode('R2', 's', 'op2')],
      edges: [
        edge('E1', 'A-SYS', 'A-SUB', 'contains'),
        edge('E2', 'A-SUB', 'R1', 'contains'),
        edge('E3', 'A-FLOAT', 'R2', 'contains'),
      ],
    };
    const report = analyzeAtomicTree(ir);
    assert.ok(report.roots.includes('A-FLOAT'));
    assert.strictEqual(report.wellFormed, false);
  });

  it('cyclic contains between subsystems → detected', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [makeArch('A-SYS'), makeArch('A-SUB1'), makeArch('A-SUB2')],
      edges: [
        edge('E1', 'A-SYS', 'A-SUB1', 'contains'),
        edge('E2', 'A-SUB1', 'A-SUB2', 'contains'),
        edge('E3', 'A-SUB2', 'A-SUB1', 'contains'),
      ],
    };
    const report = analyzeAtomicTree(ir);
    assert.strictEqual(report.cyclicContains, true);
    assert.strictEqual(report.wellFormed, false);
  });

  it('empty leaf subsystem (no atomic requirement) → detected', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [makeArch('A-SYS'), makeArch('A-LEAF')],
      edges: [edge('E1', 'A-SYS', 'A-LEAF', 'contains')],
    };
    const report = analyzeAtomicTree(ir);
    assert.ok(report.emptyLeafSubsystems.includes('A-LEAF'));
    assert.strictEqual(report.wellFormed, false);
  });

  it('uncovered requirement (not attached to any subsystem) → detected', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [makeArch('A-SYS'), makeNode('R1', 's', 'attached'), makeNode('R2', 's', 'floating')],
      edges: [edge('E1', 'A-SYS', 'R1', 'contains')],
    };
    const report = analyzeAtomicTree(ir);
    assert.deepStrictEqual(report.uncoveredRequirements, ['R2']);
    assert.strictEqual(report.wellFormed, false);
  });
});
