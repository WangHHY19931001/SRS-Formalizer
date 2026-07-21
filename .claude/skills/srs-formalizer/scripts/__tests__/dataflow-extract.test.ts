import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  validateDataFlowRecord,
  validateDataFlowRecords,
  toDataFlowGraph,
  type DataFlowRecord,
} from '../lib/dataflow-extract.js';

describe('validateDataFlowRecord', () => {
  it('accepts a well-formed entity record', () => {
    assert.deepStrictEqual(
      validateDataFlowRecord({ kind: 'entity', id: 'DE-order', canonical: '订单', source_shard: 'S001' }, 0),
      [],
    );
  });

  it('accepts a well-formed flow record', () => {
    assert.deepStrictEqual(
      validateDataFlowRecord({ kind: 'flow', requirement_id: 'R1-S001-0001', entity_id: 'DE-order', action: 'produces', source_shard: 'S001' }, 0),
      [],
    );
  });

  it('rejects unknown kind', () => {
    const errs = validateDataFlowRecord({ kind: 'thing' }, 0);
    assert.ok(errs[0]!.includes("kind must be 'entity' or 'flow'"));
  });

  it('rejects malformed entity id', () => {
    const errs = validateDataFlowRecord({ kind: 'entity', id: 'Order', canonical: 'x', source_shard: 'S001' }, 0);
    assert.ok(errs.some(e => e.includes('entity id must match')));
  });

  it('rejects empty canonical', () => {
    const errs = validateDataFlowRecord({ kind: 'entity', id: 'DE-x', canonical: '  ', source_shard: 'S001' }, 0);
    assert.ok(errs.some(e => e.includes('canonical is required')));
  });

  it('rejects bad shard format', () => {
    const errs = validateDataFlowRecord({ kind: 'entity', id: 'DE-x', canonical: 'x', source_shard: 'shard1' }, 0);
    assert.ok(errs.some(e => e.includes('source_shard must match SNNN')));
  });

  it('rejects flow with bad requirement_id', () => {
    const errs = validateDataFlowRecord({ kind: 'flow', requirement_id: 'X1', entity_id: 'DE-x', action: 'consumes', source_shard: 'S001' }, 0);
    assert.ok(errs.some(e => e.includes('requirement_id must match')));
  });

  it('rejects flow with bad action', () => {
    const errs = validateDataFlowRecord({ kind: 'flow', requirement_id: 'R1-S001-0001', entity_id: 'DE-x', action: 'reads', source_shard: 'S001' }, 0);
    assert.ok(errs.some(e => e.includes('action must be produces|consumes|mutates')));
  });
});

describe('validateDataFlowRecords', () => {
  it('detects duplicate entity ids', () => {
    const recs = [
      { kind: 'entity', id: 'DE-x', canonical: 'a', source_shard: 'S001' },
      { kind: 'entity', id: 'DE-x', canonical: 'b', source_shard: 'S002' },
    ];
    const r = validateDataFlowRecords(recs);
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => e.includes('duplicate entity id')));
  });

  it('detects flow referencing undeclared entity', () => {
    const recs = [
      { kind: 'entity', id: 'DE-x', canonical: 'a', source_shard: 'S001' },
      { kind: 'flow', requirement_id: 'R1-S001-0001', entity_id: 'DE-missing', action: 'produces', source_shard: 'S001' },
    ];
    const r = validateDataFlowRecords(recs);
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => e.includes('undeclared entity_id')));
  });

  it('counts entities and flows on a valid set', () => {
    const recs = [
      { kind: 'entity', id: 'DE-x', canonical: 'a', source_shard: 'S001' },
      { kind: 'flow', requirement_id: 'R1-S001-0001', entity_id: 'DE-x', action: 'produces', source_shard: 'S001' },
      { kind: 'flow', requirement_id: 'R2-S001-0002', entity_id: 'DE-x', action: 'consumes', source_shard: 'S001' },
    ];
    const r = validateDataFlowRecords(recs);
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.entityCount, 1);
    assert.strictEqual(r.flowCount, 2);
  });
});

describe('toDataFlowGraph', () => {
  it('produces a data_entity node and directed flow edges', () => {
    const recs: DataFlowRecord[] = [
      { kind: 'entity', id: 'DE-order', canonical: '订单', source_shard: 'S001' },
      { kind: 'flow', requirement_id: 'R1-S001-0001', entity_id: 'DE-order', action: 'produces', source_shard: 'S001' },
    ];
    const { nodes, edges } = toDataFlowGraph(recs);
    assert.strictEqual(nodes.length, 1);
    assert.strictEqual(nodes[0]!.type, 'data_entity');
    assert.strictEqual(nodes[0]!.id, 'DE-order');
    assert.strictEqual(edges.length, 1);
    assert.strictEqual(edges[0]!.source, 'R1-S001-0001');
    assert.strictEqual(edges[0]!.target, 'DE-order');
    assert.strictEqual(edges[0]!.type, 'produces');
  });

  it('normalizes entities sharing a canonical into one node', () => {
    const recs: DataFlowRecord[] = [
      { kind: 'entity', id: 'DE-order', canonical: '订单', aliases: ['Order'], source_shard: 'S001' },
      { kind: 'entity', id: 'DE-order-alt', canonical: '订单', aliases: ['订单实体'], source_shard: 'S002' },
      { kind: 'flow', requirement_id: 'R1-S001-0001', entity_id: 'DE-order-alt', action: 'consumes', source_shard: 'S002' },
    ];
    const { nodes, edges } = toDataFlowGraph(recs);
    assert.strictEqual(nodes.length, 1, 'same canonical merges to one node');
    assert.strictEqual(nodes[0]!.id, 'DE-order', 'first record id becomes canonical node id');
    // 别名映射后的 flow 边应指向合并后的节点 id
    assert.strictEqual(edges.length, 1);
    assert.strictEqual(edges[0]!.target, 'DE-order');
    // aliases 汇总进 labels
    assert.ok(nodes[0]!.labels.some(l => l.includes('Order')));
    assert.ok(nodes[0]!.labels.some(l => l.includes('订单实体')));
  });

  it('deduplicates identical flow edges after normalization', () => {
    const recs: DataFlowRecord[] = [
      { kind: 'entity', id: 'DE-a', canonical: 'X', source_shard: 'S001' },
      { kind: 'entity', id: 'DE-b', canonical: 'X', source_shard: 'S002' },
      { kind: 'flow', requirement_id: 'R1-S001-0001', entity_id: 'DE-a', action: 'produces', source_shard: 'S001' },
      { kind: 'flow', requirement_id: 'R1-S001-0001', entity_id: 'DE-b', action: 'produces', source_shard: 'S002' },
    ];
    const { edges } = toDataFlowGraph(recs);
    assert.strictEqual(edges.length, 1, 'same (req, action, merged-entity) collapses to one edge');
  });

  it('skips flow edges whose entity was never declared (defensive)', () => {
    const recs: DataFlowRecord[] = [
      { kind: 'flow', requirement_id: 'R1-S001-0001', entity_id: 'DE-ghost', action: 'produces', source_shard: 'S001' },
    ];
    const { nodes, edges } = toDataFlowGraph(recs);
    assert.strictEqual(nodes.length, 0);
    assert.strictEqual(edges.length, 0);
  });
});
