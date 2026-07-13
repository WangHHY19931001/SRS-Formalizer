import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  applyMergeNodesIR,
  applyAddConflictEdgeIR,
  applyAddSameAspectEdgeIR,
} from '../lib/graph-operations.js';
import type { SRSIR } from '../types/srs-ir.js';

const TMP = path.join(os.tmpdir(), `srs-formalizer-merge-ir-test-${Date.now()}`);

function emptyIR(): SRSIR {
  return {
    version: '2.0.0',
    meta: {
      sourcePath: '/t',
      sourceHash: '',
      language: 'zh',
      totalChars: 0,
      totalShards: 1,
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
      blindSpots: ['performance','security','availability','compatibility','maintainability','compliance'],
    },
    gaps: [],
    glossary: [],
  };
}

function makeNode(id: string, statement: string): SRSIR['nodes'][number] {
  return {
    id, type: 'requirement' as const, module: 'm', labels: ['Requirement'],
    properties: { statement },
    source: { filePath: '/t', startLine: 1, endLine: 1, shardId: 's1', chapter: '§1' },
  };
}

describe('applyMergeNodesIR', () => {
  it('deletes nodeB and keeps nodeA', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      meta: { ...emptyIR().meta, totalNodes: 2, totalEdges: 0 },
      nodes: [makeNode('A', '登录'), makeNode('B', '登录系统')],
    };
    const result = applyMergeNodesIR(ir, 'A', 'B');
    assert.strictEqual(result.nodes.length, 1);
    assert.strictEqual(result.nodes[0]!.id, 'A');
    assert.strictEqual(result.meta.totalNodes, 1);
  });

  it('rewires edges from nodeB to nodeA', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      meta: { ...emptyIR().meta, totalNodes: 3, totalEdges: 2 },
      nodes: [makeNode('A', '登录'), makeNode('B', '登录系统'), makeNode('C', '安全')],
      edges: [
        { id: 'E1', source: 'B', target: 'C', type: 'depends_on', properties: {} },
        { id: 'E2', source: 'C', target: 'B', type: 'refines', properties: {} },
      ],
    };
    const result = applyMergeNodesIR(ir, 'A', 'B');
    assert.strictEqual(result.edges.length, 2);
    assert.ok(result.edges.some(e => e.source === 'A' && e.target === 'C'));
    assert.ok(result.edges.some(e => e.source === 'C' && e.target === 'A'));
    assert.strictEqual(result.meta.totalEdges, 2);
  });

  it('removes self-loops after merge', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      meta: { ...emptyIR().meta, totalNodes: 2, totalEdges: 1 },
      nodes: [makeNode('A', '登录'), makeNode('B', '登录系统')],
      edges: [
        { id: 'E1', source: 'B', target: 'A', type: 'depends_on', properties: {} },
      ],
    };
    const result = applyMergeNodesIR(ir, 'A', 'B');
    const selfLoops = result.edges.filter(e => e.source === e.target);
    assert.strictEqual(selfLoops.length, 0);
  });
});

describe('applyAddConflictEdgeIR', () => {
  it('adds conflicts_with edge', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      meta: { ...emptyIR().meta, totalNodes: 2, totalEdges: 0 },
      nodes: [makeNode('A', '记录日志'), makeNode('B', '不记录日志')],
    };
    const result = applyAddConflictEdgeIR(ir, 'A', 'B', '语义冲突');
    const edge = result.edges.find(e => e.type === 'conflicts_with');
    assert.ok(edge);
    assert.strictEqual(edge!.source, 'A');
    assert.strictEqual(edge!.target, 'B');
    assert.strictEqual(edge!.properties.reasoning, '语义冲突');
    assert.strictEqual(result.meta.totalEdges, 1);
  });

  it('deduplicates: does not add if edge already exists', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      meta: { ...emptyIR().meta, totalNodes: 2, totalEdges: 1 },
      nodes: [makeNode('A', '记录'), makeNode('B', '不记录')],
      edges: [
        { id: 'conf-A-B', source: 'A', target: 'B', type: 'conflicts_with', properties: { reasoning: '旧理由' } },
      ],
    };
    const result = applyAddConflictEdgeIR(ir, 'A', 'B', '新理由');
    assert.strictEqual(result.edges.length, 1);
    assert.strictEqual(result.edges[0]!.properties.reasoning, '旧理由');
  });
});

describe('applyAddSameAspectEdgeIR', () => {
  it('adds same_aspect edge', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      meta: { ...emptyIR().meta, totalNodes: 2, totalEdges: 0 },
      nodes: [makeNode('A', '邮箱登录'), makeNode('B', '手机登录')],
    };
    const result = applyAddSameAspectEdgeIR(ir, 'A', 'B', '同为登录方式');
    const edge = result.edges.find(e => e.type === 'same_aspect');
    assert.ok(edge);
    assert.strictEqual(edge!.source, 'A');
    assert.strictEqual(edge!.target, 'B');
    assert.strictEqual(result.meta.totalEdges, 1);
  });

  it('deduplicates: does not add if edge already exists', () => {
    const ir: SRSIR = {
      ...emptyIR(),
      meta: { ...emptyIR().meta, totalNodes: 2, totalEdges: 1 },
      nodes: [makeNode('A', '邮箱'), makeNode('B', '手机')],
      edges: [
        { id: 'same-A-B', source: 'A', target: 'B', type: 'same_aspect', properties: { reasoning: '旧理由' } },
      ],
    };
    const result = applyAddSameAspectEdgeIR(ir, 'A', 'B', '新理由');
    assert.strictEqual(result.edges.length, 1);
  });
});

describe('merge-analysis command (SRSIR)', () => {
  before(() => { fs.mkdirSync(TMP, { recursive: true }); });
  after(() => { fs.rmSync(TMP, { recursive: true, force: true }); });

  function createWorkDir(name: string): string {
    const wd = path.join(TMP, name, '.srs_formalizer');
    fs.mkdirSync(path.join(wd, '3_graph', 'analysis'), { recursive: true });
    return wd;
  }

  function writeJsonl(dir: string, filename: string, records: unknown[]): void {
    fs.writeFileSync(path.join(dir, filename), records.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf-8');
  }

  it('applies duplicate verdict via IR merge', async () => {
    const wd = createWorkDir('dup-ir');
    const ir: SRSIR = {
      ...emptyIR(),
      meta: { ...emptyIR().meta, totalNodes: 3, totalEdges: 2 },
      nodes: [makeNode('R1', '邮箱登录'), makeNode('R2', '邮件登录'), makeNode('R3', '支付')],
      edges: [
        { id: 'E1', source: 'R2', target: 'R3', type: 'depends_on', properties: {} },
        { id: 'E2', source: 'R3', target: 'R2', type: 'refines', properties: {} },
      ],
    };
    fs.writeFileSync(path.join(wd, 'srs-ir.json'), JSON.stringify(ir, null, 2), 'utf-8');

    writeJsonl(path.join(wd, '3_graph', 'analysis'), 'suspected_duplicates.jsonl', [
      { pairId: 'DUP-1', nodeA: 'R1', nodeB: 'R2', similarity: 0.85, statementA: '邮箱登录', statementB: '邮件登录' },
    ]);
    writeJsonl(path.join(wd, '3_graph', 'analysis'), 'verdicts.jsonl', [
      { pair_id: 'DUP-1', verdict: 'duplicate', reasoning: '同义', recommended_action: 'merge' },
    ]);

    const { main } = await import('../commands/merge-analysis.js');
    const result = await main(['--workdir', wd]);
    assert.strictEqual(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.strictEqual(data.applied, 1);
    assert.strictEqual(data.verdicts_processed, 1);

    const merged = JSON.parse(fs.readFileSync(path.join(wd, 'srs-ir.merged.json'), 'utf-8')) as SRSIR;
    assert.strictEqual(merged.nodes.length, 2);
    assert.ok(!merged.nodes.some(n => n.id === 'R2'));
    assert.ok(merged.edges.some(e => e.source === 'R1' && e.target === 'R3'));
    assert.ok(merged.edges.some(e => e.source === 'R3' && e.target === 'R1'));
  });

  it('applies conflict verdict via IR', async () => {
    const wd = createWorkDir('conflict-ir');
    const ir: SRSIR = {
      ...emptyIR(),
      meta: { ...emptyIR().meta, totalNodes: 2, totalEdges: 0 },
      nodes: [makeNode('R1', '记录日志'), makeNode('R2', '不记录日志')],
    };
    fs.writeFileSync(path.join(wd, 'srs-ir.json'), JSON.stringify(ir, null, 2), 'utf-8');

    writeJsonl(path.join(wd, '3_graph', 'analysis'), 'suspected_conflicts.jsonl', [
      { pairId: 'CON-1', nodeA: 'R1', nodeB: 'R2', similarity: 0.8, statementA: '记录日志', statementB: '不记录日志', negationInA: false, negationInB: true },
    ]);
    writeJsonl(path.join(wd, '3_graph', 'analysis'), 'verdicts.jsonl', [
      { pair_id: 'CON-1', verdict: 'conflict', reasoning: '矛盾', recommended_action: 'add_conflict_edge' },
    ]);

    const { main } = await import('../commands/merge-analysis.js');
    const result = await main(['--workdir', wd]);
    assert.strictEqual(result.status, 'ok');

    const merged = JSON.parse(fs.readFileSync(path.join(wd, 'srs-ir.merged.json'), 'utf-8')) as SRSIR;
    assert.ok(merged.edges.some(e => e.type === 'conflicts_with'));
  });
});
