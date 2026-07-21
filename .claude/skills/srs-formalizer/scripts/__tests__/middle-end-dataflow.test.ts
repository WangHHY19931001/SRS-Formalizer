import { describe, it } from 'node:test';
import assert from 'node:assert';
import { analyzeDataFlow } from '../lib/middle-end/dataflow-analyzer.js';
import type { SRSIR, IRNode, IREdge, IRNodeType, IREdgeType } from '../types/srs-ir.js';

function emptyIR(): SRSIR {
  return {
    version: '2.1.0',
    meta: {
      sourcePath: '/t', sourceHash: '', language: 'zh',
      totalChars: 0, totalShards: 0, totalNodes: 0, totalEdges: 0,
      buildTimestamp: new Date().toISOString(),
    },
    nodes: [], edges: [], crossRefs: [],
    nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] },
    gaps: [], glossary: [],
  };
}

function node(id: string, type: IRNodeType, module = id): IRNode {
  return {
    id, type, module, labels: [],
    properties: type === 'requirement' ? { statement: `${id} statement` } : {},
    source: { filePath: '/t', startLine: 1, endLine: 1, shardId: `shard-${id}`, chapter: '§1' },
  };
}

function edge(id: string, source: string, target: string, type: IREdgeType): IREdge {
  return { id, source, target, type, properties: {} };
}

describe('analyzeDataFlow', () => {
  it('1. 无数据流问题 → findings 为空', () => {
    // R1 produces D1, R2 consumes D1 → 完整链路，无问题
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [node('R1', 'requirement'), node('R2', 'requirement'), node('D1', 'data_entity', '订单')],
      edges: [edge('E1', 'R1', 'D1', 'produces'), edge('E2', 'R2', 'D1', 'consumes')],
    };
    const r = analyzeDataFlow(ir);
    assert.strictEqual(r.findings.length, 0);
  });

  it('2. dead_data：仅 produce、无 consume', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [node('R1', 'requirement'), node('D1', 'data_entity', '日志')],
      edges: [edge('E1', 'R1', 'D1', 'produces')],
    };
    const r = analyzeDataFlow(ir);
    assert.ok(r.findings.some(f => f.findingType === 'dead_data' && f.entityId === 'D1'));
  });

  it('3. gap：被 consume 但无 produce', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [node('R1', 'requirement'), node('D1', 'data_entity', '库存余额')],
      edges: [edge('E1', 'R1', 'D1', 'consumes')],
    };
    const r = analyzeDataFlow(ir);
    assert.ok(r.findings.some(f => f.findingType === 'gap' && f.entityId === 'D1'));
  });

  it('4. boundary（入）：无 producer/mutator 的外部输入', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [node('R1', 'requirement'), node('D1', 'data_entity', '外部行情')],
      edges: [edge('E1', 'R1', 'D1', 'consumes')],
    };
    const r = analyzeDataFlow(ir);
    const b = r.findings.find(f => f.findingType === 'boundary' && f.entityId === 'D1');
    assert.ok(b);
    assert.ok(b.evidence.includes('入边界'));
  });

  it('5. boundary（出）：无 consumer 的最终输出', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [node('R1', 'requirement'), node('D1', 'data_entity', '归档报表')],
      edges: [edge('E1', 'R1', 'D1', 'produces')],
    };
    const r = analyzeDataFlow(ir);
    const b = r.findings.find(f => f.findingType === 'boundary' && f.entityId === 'D1');
    assert.ok(b);
    assert.ok(b.evidence.includes('出边界'));
  });

  it('6. cycle：R1→D1→R2→D2→R1 循环数据依赖', () => {
    // R1 produces D1; R2 consumes D1 且 produces D2; R1 consumes D2 → 成环
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [
        node('R1', 'requirement'), node('R2', 'requirement'),
        node('D1', 'data_entity', 'A'), node('D2', 'data_entity', 'B'),
      ],
      edges: [
        edge('E1', 'R1', 'D1', 'produces'),
        edge('E2', 'R2', 'D1', 'consumes'),
        edge('E3', 'R2', 'D2', 'produces'),
        edge('E4', 'R1', 'D2', 'consumes'),
      ],
    };
    const r = analyzeDataFlow(ir);
    assert.ok(r.findings.some(f => f.findingType === 'cycle'));
  });

  it('7. 旧 IR（无 data_entity）→ 降级为空 findings，不报错', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      version: '2.0.0',
      nodes: [node('R1', 'requirement'), node('R2', 'requirement')],
      edges: [edge('E1', 'R1', 'R2', 'depends_on')],
    };
    const r = analyzeDataFlow(ir);
    assert.strictEqual(r.entities.length, 0);
    assert.strictEqual(r.findings.length, 0);
  });

  it('8. severity 恒为 warning', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [node('R1', 'requirement'), node('D1', 'data_entity', 'X')],
      edges: [edge('E1', 'R1', 'D1', 'produces')],
    };
    const r = analyzeDataFlow(ir);
    assert.ok(r.findings.length > 0);
    assert.ok(r.findings.every(f => f.severity === 'warning'));
  });

  it('9. reviewActions 非空（强提示不可为空标签）', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [node('R1', 'requirement'), node('D1', 'data_entity', 'X')],
      edges: [edge('E1', 'R1', 'D1', 'consumes')],
    };
    const r = analyzeDataFlow(ir);
    assert.ok(r.findings.every(f => f.reviewActions.length > 0));
  });

  it('10. relatedNodes 引用真实 requirement 节点', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [node('R1', 'requirement'), node('D1', 'data_entity', 'X')],
      edges: [edge('E1', 'R1', 'D1', 'consumes')],
    };
    const r = analyzeDataFlow(ir);
    const gap = r.findings.find(f => f.findingType === 'gap');
    assert.ok(gap);
    assert.deepStrictEqual(gap.relatedNodes, ['R1']);
  });

  it('11. entities 聚合 produce/consume/mutate 来源', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      nodes: [
        node('R1', 'requirement'), node('R2', 'requirement'), node('R3', 'requirement'),
        node('D1', 'data_entity', '账户'),
      ],
      edges: [
        edge('E1', 'R1', 'D1', 'produces'),
        edge('E2', 'R2', 'D1', 'consumes'),
        edge('E3', 'R3', 'D1', 'mutates'),
      ],
    };
    const r = analyzeDataFlow(ir);
    const ent = r.entities.find(e => e.entityId === 'D1');
    assert.ok(ent);
    assert.deepStrictEqual(ent.producedBy, ['R1']);
    assert.deepStrictEqual(ent.consumedBy, ['R2']);
    assert.deepStrictEqual(ent.mutatedBy, ['R3']);
  });
});
