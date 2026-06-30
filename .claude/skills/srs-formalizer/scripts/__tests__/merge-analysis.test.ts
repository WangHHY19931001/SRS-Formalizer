import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { GraphData } from '../lib/graph.js';

const TMP = path.join(os.tmpdir(), `srs-formalizer-merge-analysis-test-${Date.now()}`);

/**
 * Create a temporary .srs_formalizer workdir with graph/ and analysis/ subdirs.
 */
function createWorkDir(name: string): string {
  const workDir = path.join(TMP, name, '.srs_formalizer');
  fs.mkdirSync(path.join(workDir, '3_graph', 'graph'), { recursive: true });
  fs.mkdirSync(path.join(workDir, '3_graph', 'analysis'), { recursive: true });
  return workDir;
}

/**
 * Write graph/graph.json in the workdir.
 */
function writeGraph(workDir: string, data: GraphData): void {
  const graphPath = path.join(workDir, '3_graph', 'graph', 'graph.json');
  fs.writeFileSync(graphPath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Write graph/graph.structure_fixed.json in the workdir.
 */
function writeFixedGraph(workDir: string, data: GraphData): void {
  const graphPath = path.join(workDir, '3_graph', 'graph', 'graph.structure_fixed.json');
  fs.writeFileSync(graphPath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Write a JSONL file.
 */
function writeJsonl(dir: string, filename: string, records: unknown[]): void {
  const content = records.map(r => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(path.join(dir, filename), content, 'utf-8');
}

/**
 * Read a JSONL file and return parsed records.
 */
function readJsonlRecords<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as T);
}

describe('merge-analysis command', () => {
  before(() => {
    fs.mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  it('applies duplicate verdict — merges nodeB into nodeA', async () => {
    const workDir = createWorkDir('dup-merge');

    writeGraph(workDir, {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: '用户可以通过邮箱登录', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R1-REQ-0002', labels: [':Requirement'], properties: { statement: '用户可用邮箱登录', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R1-REQ-0003', labels: [':Requirement'], properties: { statement: '支付功能', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
      ],
      edges: [
        { id: 'E1', source: 'R1-REQ-0002', target: 'R1-REQ-0003', type: ':DEPENDS_ON' },
        { id: 'E2', source: 'R1-REQ-0003', target: 'R1-REQ-0002', type: ':REFINES' },
      ],
    });

    // Write analysis context files
    writeJsonl(path.join(workDir, '3_graph', 'analysis'), 'suspected_duplicates.jsonl', [
      { pairId: 'DUP-001', nodeA: 'R1-REQ-0001', nodeB: 'R1-REQ-0002', similarity: 0.85, statementA: '用户可以通过邮箱登录', statementB: '用户可用邮箱登录' },
    ]);

    // Write verdict file
    writeJsonl(path.join(workDir, '3_graph', 'analysis'), 'duplicate_verdicts.jsonl', [
      { pair_id: 'DUP-001', verdict: 'duplicate', reasoning: '两者描述同一登录功能', recommended_action: 'merge' },
    ]);

    const { main } = await import('../commands/merge-analysis.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.verdicts_processed, 1);
    assert.equal(data.applied, 1);

    // Verify the merged graph
    const mergedPath = path.join(workDir, '3_graph', 'graph', 'graph.merged.json');
    assert.ok(fs.existsSync(mergedPath));
    const mergedGraph = JSON.parse(fs.readFileSync(mergedPath, 'utf-8')) as GraphData;

    // R1-REQ-0002 should be removed, R1-REQ-0001 kept
    assert.equal(mergedGraph.nodes.length, 2);
    assert.ok(mergedGraph.nodes.some(n => n.id === 'R1-REQ-0001'));
    assert.ok(!mergedGraph.nodes.some(n => n.id === 'R1-REQ-0002'));
    assert.ok(mergedGraph.nodes.some(n => n.id === 'R1-REQ-0003'));

    // Edges from R1-REQ-0002 should be rewired to R1-REQ-0001
    assert.equal(mergedGraph.edges.length, 2);
    const edgeTo3 = mergedGraph.edges.find(e => e.source === 'R1-REQ-0001' && e.target === 'R1-REQ-0003');
    assert.ok(edgeTo3, 'Edge from merged node to R1-REQ-0003 should exist');
    const edgeFrom3 = mergedGraph.edges.find(e => e.source === 'R1-REQ-0003' && e.target === 'R1-REQ-0001');
    assert.ok(edgeFrom3, 'Edge from R1-REQ-0003 to merged node should exist');

    // Verify merge log
    const logPath = path.join(workDir, '3_graph', 'graph', 'merge_log.jsonl');
    assert.ok(fs.existsSync(logPath));
    const log = readJsonlRecords<{ pair_id: string; action: string }>(logPath);
    assert.equal(log.length, 1);
    assert.equal(log[0]!.pair_id, 'DUP-001');
    assert.equal(log[0]!.action, 'applied');
  });

  // -----------------------------------------------------------------------
  it('applies conflict verdict — adds :CONFLICTS_WITH edge', async () => {
    const workDir = createWorkDir('conflict-edge');

    writeGraph(workDir, {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: '系统应记录操作日志', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R1-REQ-0002', labels: [':Requirement'], properties: { statement: '系统不应记录操作日志', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
      ],
      edges: [],
    });

    writeJsonl(path.join(workDir, '3_graph', 'analysis'), 'suspected_conflicts.jsonl', [
      { pairId: 'CON-001', nodeA: 'R1-REQ-0001', nodeB: 'R1-REQ-0002', similarity: 0.8, statementA: '系统应记录操作日志', statementB: '系统不应记录操作日志', negationInA: false, negationInB: true },
    ]);

    writeJsonl(path.join(workDir, '3_graph', 'analysis'), 'conflict_verdicts.jsonl', [
      { pair_id: 'CON-001', verdict: 'conflict', reasoning: '一个要求记录日志，一个禁止记录', recommended_action: 'add_conflict_edge' },
    ]);

    const { main } = await import('../commands/merge-analysis.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.applied, 1);

    const mergedPath = path.join(workDir, '3_graph', 'graph', 'graph.merged.json');
    const mergedGraph = JSON.parse(fs.readFileSync(mergedPath, 'utf-8')) as GraphData;

    const conflictEdge = mergedGraph.edges.find(e => e.type === ':CONFLICTS_WITH');
    assert.ok(conflictEdge, ':CONFLICTS_WITH edge should exist');
    assert.ok(
      (conflictEdge!.source === 'R1-REQ-0001' && conflictEdge!.target === 'R1-REQ-0002') ||
      (conflictEdge!.source === 'R1-REQ-0002' && conflictEdge!.target === 'R1-REQ-0001'),
      'Conflict edge should connect R1-REQ-0001 and R1-REQ-0002'
    );
  });

  // -----------------------------------------------------------------------
  it('applies same_aspect verdict — adds :SAME_ASPECT edges between cluster nodes', async () => {
    const workDir = createWorkDir('same-aspect-edge');

    writeGraph(workDir, {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: '用户可以通过邮箱登录', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R1-REQ-0002', labels: [':Requirement'], properties: { statement: '用户需要实名认证', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R1-REQ-0003', labels: [':Requirement'], properties: { statement: '支付功能', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
      ],
      edges: [],
    });

    writeJsonl(path.join(workDir, '3_graph', 'analysis'), 'same_aspect_clusters.jsonl', [
      { clusterId: 'ASP-001', object: '用户', nodes: ['R1-REQ-0001', 'R1-REQ-0002'], statements: ['用户可以通过邮箱登录', '用户需要实名认证'] },
    ]);

    writeJsonl(path.join(workDir, '3_graph', 'analysis'), 'aspect_verdicts.jsonl', [
      { pair_id: 'ASP-001', verdict: 'same_aspect', reasoning: '同为用户相关但不同侧面', recommended_action: 'add_same_aspect_edge' },
    ]);

    const { main } = await import('../commands/merge-analysis.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.applied, 1);

    const mergedPath = path.join(workDir, '3_graph', 'graph', 'graph.merged.json');
    const mergedGraph = JSON.parse(fs.readFileSync(mergedPath, 'utf-8')) as GraphData;

    const aspectEdge = mergedGraph.edges.find(e => e.type === ':SAME_ASPECT');
    assert.ok(aspectEdge, ':SAME_ASPECT edge should exist');
    assert.ok(
      (aspectEdge!.source === 'R1-REQ-0001' && aspectEdge!.target === 'R1-REQ-0002') ||
      (aspectEdge!.source === 'R1-REQ-0002' && aspectEdge!.target === 'R1-REQ-0001'),
      'Same-aspect edge should connect R1-REQ-0001 and R1-REQ-0002'
    );
  });

  // -----------------------------------------------------------------------
  it('skips duplicate verdict when recommended_action is "skip"', async () => {
    const workDir = createWorkDir('dup-skip');

    writeGraph(workDir, {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: '用户登录', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
      ],
      edges: [],
    });

    writeJsonl(path.join(workDir, '3_graph', 'analysis'), 'suspected_duplicates.jsonl', [
      { pairId: 'DUP-001', nodeA: 'R1-REQ-0001', nodeB: 'R1-REQ-0002', similarity: 0.8, statementA: '用户登录', statementB: '用户登录系统' },
    ]);

    writeJsonl(path.join(workDir, '3_graph', 'analysis'), 'duplicate_verdicts.jsonl', [
      { pair_id: 'DUP-001', verdict: 'duplicate', reasoning: '虽然相似但语义不同', recommended_action: 'skip' },
    ]);

    const { main } = await import('../commands/merge-analysis.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.skipped, 1);

    // Graph should remain unmodified (same nodes)
    const mergedPath = path.join(workDir, '3_graph', 'graph', 'graph.merged.json');
    const mergedGraph = JSON.parse(fs.readFileSync(mergedPath, 'utf-8')) as GraphData;
    assert.equal(mergedGraph.nodes.length, 1);
    assert.equal(mergedGraph.nodes[0]!.id, 'R1-REQ-0001');

    // Log should show skip
    const logPath = path.join(workDir, '3_graph', 'graph', 'merge_log.jsonl');
    const log = readJsonlRecords<{ action: string; details: string }>(logPath);
    assert.equal(log[0]!.action, 'skipped');
    assert.ok(log[0]!.details.includes('skip'));
  });

  // -----------------------------------------------------------------------
  it('skips verdict when pair_id is not found in analysis lookup tables', async () => {
    const workDir = createWorkDir('missing-pair');

    writeGraph(workDir, {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: '用户登录', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
      ],
      edges: [],
    });

    // Don't write suspected_duplicates.jsonl
    writeJsonl(path.join(workDir, '3_graph', 'analysis'), 'duplicate_verdicts.jsonl', [
      { pair_id: 'DUP-999', verdict: 'duplicate', reasoning: 'Test', recommended_action: 'merge' },
    ]);

    const { main } = await import('../commands/merge-analysis.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.skipped, 1);

    const logPath = path.join(workDir, '3_graph', 'graph', 'merge_log.jsonl');
    const log = readJsonlRecords<{ action: string; details: string }>(logPath);
    assert.equal(log[0]!.action, 'skipped');
    assert.ok(log[0]!.details.includes('Pair not found'));
  });

  // -----------------------------------------------------------------------
  it('prefers graph.structure_fixed.json over graph.json', async () => {
    const workDir = createWorkDir('prefer-fixed');

    // Write both graphs
    writeGraph(workDir, {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: '旧版需求', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
      ],
      edges: [],
    });

    writeFixedGraph(workDir, {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: '新版需求', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R1-REQ-0002', labels: [':Requirement'], properties: { statement: '用户登录', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
      ],
      edges: [],
    });

    writeJsonl(path.join(workDir, '3_graph', 'analysis'), 'suspected_duplicates.jsonl', [
      { pairId: 'DUP-001', nodeA: 'R1-REQ-0001', nodeB: 'R1-REQ-0002', similarity: 0.3, statementA: '新版需求', statementB: '用户登录' },
    ]);

    // This verdict references nodes from the fixed graph
    writeJsonl(path.join(workDir, '3_graph', 'analysis'), 'verdicts.jsonl', [
      { pair_id: 'DUP-001', verdict: 'duplicate', reasoning: '测试', recommended_action: 'merge' },
    ]);

    const { main } = await import('../commands/merge-analysis.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.verdicts_processed, 1);

    // The merged graph should have 1 node after merge (R1-REQ-0002 merged into R1-REQ-0001)
    const mergedPath = path.join(workDir, '3_graph', 'graph', 'graph.merged.json');
    const mergedGraph = JSON.parse(fs.readFileSync(mergedPath, 'utf-8')) as GraphData;
    assert.equal(mergedGraph.nodes.length, 1);
    assert.ok(mergedGraph.nodes.some(n => n.id === 'R1-REQ-0001'));
    assert.ok(!mergedGraph.nodes.some(n => n.id === 'R1-REQ-0002'));
  });

  // -----------------------------------------------------------------------
  it('rejects non-.srs_formalizer workdir', async () => {
    const badDir = path.join(TMP, 'bad_dir');
    fs.mkdirSync(badDir, { recursive: true });

    const { main } = await import('../commands/merge-analysis.js');
    const result = await main(['--workdir', badDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('.srs_formalizer'));
  });

  // -----------------------------------------------------------------------
  it('handles missing graph file gracefully', async () => {
    const workDir = createWorkDir('no-graph');
    // Don't write graph.json

    const { main } = await import('../commands/merge-analysis.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('Graph file not found'));
  });

  // -----------------------------------------------------------------------
  it('handles empty verdicts (noop — graph passes through)', async () => {
    const workDir = createWorkDir('empty-verdicts');

    writeGraph(workDir, {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: '用户登录', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
      ],
      edges: [],
    });

    // No verdict files in analysis/

    const { main } = await import('../commands/merge-analysis.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.verdicts_processed, 0);
    assert.equal(data.applied, 0);
    assert.equal(data.skipped, 0);

    // Output graph should mirror input
    const mergedPath = path.join(workDir, '3_graph', 'graph', 'graph.merged.json');
    assert.ok(fs.existsSync(mergedPath));
    const mergedGraph = JSON.parse(fs.readFileSync(mergedPath, 'utf-8')) as GraphData;
    assert.equal(mergedGraph.nodes.length, 1);
    assert.equal(mergedGraph.nodes[0]!.id, 'R1-REQ-0001');

    // Merge log should exist (empty)
    const logPath = path.join(workDir, '3_graph', 'graph', 'merge_log.jsonl');
    assert.ok(fs.existsSync(logPath));
    const logContent = fs.readFileSync(logPath, 'utf-8').trim();
    assert.equal(logContent, '');
  });
});
