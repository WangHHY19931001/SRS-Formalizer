import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { GraphData } from '../lib/graph.js';

const TMP = path.join(os.tmpdir(), `srs-formalizer-query-graph-test-${Date.now()}`);

/**
 * Create a temporary .srs_formalizer workdir with a graph file.
 */
function createWorkDir(name: string): string {
  const workDir = path.join(TMP, name, '.srs_formalizer');
  fs.mkdirSync(path.join(workDir, 'graph'), { recursive: true });
  return workDir;
}

/**
 * Write a graph JSON file.
 */
function writeGraphFile(workDir: string, filename: string, data: GraphData): void {
  const filePath = path.join(workDir, 'graph', filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Helper: build a standard test graph with 2 modules and edges.
 */
function standardGraphData(): GraphData {
  return {
    nodes: [
      {
        id: 'R1-REQ-0001',
        labels: [':Requirement'],
        properties: { statement: '用户登录', module: '用户模块', source_file: 'srs.md', confidence: 'high', category: 'explicit' },
      },
      {
        id: 'R1-REQ-0002',
        labels: [':Requirement'],
        properties: { statement: '用户注册', module: '用户模块', source_file: 'srs.md', confidence: 'high', category: 'explicit' },
      },
      {
        id: 'R2-IMPL-0001',
        labels: [':ImplicitRequirement'],
        properties: { statement: '会话过期', module: '用户模块', source_file: 'srs.md', confidence: 'medium', category: 'implicit' },
      },
      {
        id: 'R1-REQ-0003',
        labels: [':Requirement'],
        properties: { statement: '创建订单', module: '订单模块', source_file: 'srs.md', confidence: 'high', category: 'explicit' },
      },
      {
        id: 'R3-REL-0001',
        labels: [':RelationalRequirement'],
        properties: { statement: '支付依赖订单', module: '订单模块', source_file: 'srs.md', confidence: 'medium', category: 'relational' },
      },
      {
        id: 'R1-REQ-0004',
        labels: [':Requirement'],
        properties: { statement: '支付订单', module: '订单模块', source_file: 'srs.md', confidence: 'high', category: 'explicit' },
      },
    ],
    edges: [
      { id: 'E-0001', source: 'R1-REQ-0001', target: 'R2-IMPL-0001', type: 'implies' },
      { id: 'E-0002', source: 'R1-REQ-0001', target: 'R1-REQ-0002', type: 'related' },
      { id: 'E-0003', source: 'R1-REQ-0003', target: 'R1-REQ-0004', type: 'depends_on' },
      { id: 'E-0004', source: 'R3-REL-0001', target: 'R1-REQ-0003', type: 'references' },
      { id: 'E-0005', source: 'R2-IMPL-0001', target: 'R3-REL-0001', type: 'cross_module' },
    ],
  };
}

describe('query-graph command', () => {
  before(() => {
    fs.mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  // ===========================================================================
  // get-node
  // ===========================================================================

  it('get-node: returns node details for existing node', async () => {
    const workDir = createWorkDir('get-node-existing');
    writeGraphFile(workDir, 'graph.merged.json', standardGraphData());

    const { main } = await import('../commands/query-graph.js');
    const result = await main(['--workdir', workDir, '--query', 'get-node', '--params', '{"id":"R1-REQ-0001"}']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.query, 'get-node');
    const qResult = data.result as Record<string, unknown>;
    assert.equal(qResult.found, true);
    const node = qResult.node as Record<string, unknown>;
    assert.equal(node.id, 'R1-REQ-0001');
    const props = node.properties as Record<string, unknown>;
    assert.equal(props.statement, '用户登录');
    assert.equal(props.module, '用户模块');
  });

  it('get-node: returns found=false for non-existent node', async () => {
    const workDir = createWorkDir('get-node-missing');
    writeGraphFile(workDir, 'graph.json', standardGraphData());

    const { main } = await import('../commands/query-graph.js');
    const result = await main(['--workdir', workDir, '--query', 'get-node', '--params', '{"id":"NONEXISTENT"}']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    const qResult = data.result as Record<string, unknown>;
    assert.equal(qResult.found, false);
    assert.equal(qResult.id, 'NONEXISTENT');
  });

  // ===========================================================================
  // get-neighbors
  // ===========================================================================

  it('get-neighbors: returns forward and backward neighbors', async () => {
    const workDir = createWorkDir('get-neighbors');
    writeGraphFile(workDir, 'graph.merged.json', standardGraphData());

    const { main } = await import('../commands/query-graph.js');
    const result = await main(['--workdir', workDir, '--query', 'get-neighbors', '--params', '{"id":"R1-REQ-0001"}']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    const qResult = data.result as Record<string, unknown>;
    assert.equal(qResult.id, 'R1-REQ-0001');

    // R1-REQ-0001 has forward neighbors: R2-IMPL-0001, R1-REQ-0002
    const forward = qResult.forward as Array<Record<string, unknown>>;
    assert.equal(forward.length, 2);
    const forwardIds = forward.map(n => n.id).sort();
    assert.deepEqual(forwardIds, ['R1-REQ-0002', 'R2-IMPL-0001']);

    // R1-REQ-0001 has no incoming (backward) edges in this graph
    const backward = qResult.backward as Array<Record<string, unknown>>;
    assert.equal(backward.length, 0);
  });

  // ===========================================================================
  // get-module
  // ===========================================================================

  it('get-module: returns all nodes in a given module', async () => {
    const workDir = createWorkDir('get-module');
    writeGraphFile(workDir, 'graph.merged.json', standardGraphData());

    const { main } = await import('../commands/query-graph.js');
    const result = await main(['--workdir', workDir, '--query', 'get-module', '--params', '{"module":"用户模块"}']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    const qResult = data.result as Record<string, unknown>;
    assert.equal(qResult.module, '用户模块');
    assert.equal(qResult.count, 3);
    const nodes = qResult.nodes as Array<Record<string, unknown>>;
    const nodeIds = nodes.map(n => n.id).sort();
    assert.deepEqual(nodeIds, ['R1-REQ-0001', 'R1-REQ-0002', 'R2-IMPL-0001']);
  });

  // ===========================================================================
  // list-modules
  // ===========================================================================

  it('list-modules: returns all module names', async () => {
    const workDir = createWorkDir('list-modules');
    writeGraphFile(workDir, 'graph.merged.json', standardGraphData());

    const { main } = await import('../commands/query-graph.js');
    const result = await main(['--workdir', workDir, '--query', 'list-modules']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    const qResult = data.result as Record<string, unknown>;
    assert.equal(qResult.count, 2);
    const modules = qResult.modules as string[];
    assert.deepEqual(modules, ['用户模块', '订单模块']);
  });

  // ===========================================================================
  // find-path (BFS)
  // ===========================================================================

  it('find-path: finds BFS shortest path between connected nodes', async () => {
    const workDir = createWorkDir('find-path-found');
    writeGraphFile(workDir, 'graph.merged.json', standardGraphData());

    const { main } = await import('../commands/query-graph.js');
    // R1-REQ-0001 → R2-IMPL-0001 → R3-REL-0001
    const result = await main([
      '--workdir', workDir,
      '--query', 'find-path',
      '--params', '{"from":"R1-REQ-0001","to":"R3-REL-0001"}',
    ]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    const qResult = data.result as Record<string, unknown>;
    assert.equal(qResult.found, true);
    const pathIds = qResult.pathIds as string[];
    assert.ok(pathIds.length >= 2);
    assert.equal(pathIds[0], 'R1-REQ-0001');
    // Must reach R3-REL-0001 — either direct or via R2-IMPL-0001
    assert.equal(pathIds[pathIds.length - 1], 'R3-REL-0001');
    assert.equal(qResult.length, pathIds.length - 1);
  });

  it('find-path: returns not found for unreachable nodes', async () => {
    const workDir = createWorkDir('find-path-unreachable');
    // Two disconnected graphs
    writeGraphFile(workDir, 'graph.json', {
      nodes: [
        { id: 'GROUP-A-001', labels: [':Requirement'], properties: { statement: 'A1', module: 'A', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'GROUP-A-002', labels: [':Requirement'], properties: { statement: 'A2', module: 'A', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'GROUP-B-001', labels: [':Requirement'], properties: { statement: 'B1', module: 'B', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'GROUP-B-002', labels: [':Requirement'], properties: { statement: 'B2', module: 'B', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
      ],
      edges: [
        { id: 'E-A1', source: 'GROUP-A-001', target: 'GROUP-A-002', type: 'related' },
        { id: 'E-B1', source: 'GROUP-B-001', target: 'GROUP-B-002', type: 'related' },
      ],
    });

    const { main } = await import('../commands/query-graph.js');
    // No path between group A and group B
    const result = await main([
      '--workdir', workDir,
      '--query', 'find-path',
      '--params', '{"from":"GROUP-A-001","to":"GROUP-B-001"}',
    ]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    const qResult = data.result as Record<string, unknown>;
    assert.equal(qResult.found, false);
  });

  // ===========================================================================
  // get-context (2-hop neighborhood)
  // ===========================================================================

  it('get-context: returns 2-hop neighborhood for a node', async () => {
    const workDir = createWorkDir('get-context');
    writeGraphFile(workDir, 'graph.merged.json', standardGraphData());

    const { main } = await import('../commands/query-graph.js');
    // R1-REQ-0001 connects to R2-IMPL-0001 and R1-REQ-0002 (1-hop)
    // R2-IMPL-0001 connects to R3-REL-0001 (2-hop via forward)
    // R1-REQ-0002 has no further edges (2-hop via forward)
    const result = await main(['--workdir', workDir, '--query', 'get-context', '--params', '{"id":"R1-REQ-0001"}']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    const qResult = data.result as Record<string, unknown>;
    assert.equal(qResult.found, true);
    // Should include R1-REQ-0001 + its neighbors + R3-REL-0001 (2-hop via R2-IMPL-0001)
    assert.ok((qResult.nodeCount as number) >= 4);
    assert.ok((qResult.edgeCount as number) >= 3);
  });

  // ===========================================================================
  // export-brainstorm
  // ===========================================================================

  it('export-brainstorm: exports full graph to outputs/brainstorming/', async () => {
    const workDir = createWorkDir('export-brainstorm');
    writeGraphFile(workDir, 'graph.json', standardGraphData());

    const { main } = await import('../commands/query-graph.js');
    const result = await main(['--workdir', workDir, '--query', 'export-brainstorm']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    const qResult = data.result as Record<string, unknown>;
    assert.equal(qResult.exported, true);
    assert.equal(qResult.nodeCount, 6);
    assert.equal(qResult.edgeCount, 5);

    // Verify file exists
    const outputPath = qResult.path as string;
    assert.ok(fs.existsSync(outputPath), 'export file should exist');
    const exported = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    assert.equal(exported.nodes.length, 6);
    assert.equal(exported.edges.length, 5);
  });

  // ===========================================================================
  // Path safety and graph loading priority
  // ===========================================================================

  it('loads graph with correct priority: merged > structure_fixed > graph', async () => {
    const workDir = createWorkDir('graph-priority');

    // Write all three — merged should win
    writeGraphFile(workDir, 'graph.json', { nodes: [{ id: 'BASE-001', labels: [':Requirement'], properties: { statement: 'base' } }], edges: [] });
    writeGraphFile(workDir, 'graph.structure_fixed.json', { nodes: [{ id: 'FIXED-001', labels: [':Requirement'], properties: { statement: 'fixed' } }], edges: [] });
    writeGraphFile(workDir, 'graph.merged.json', { nodes: [{ id: 'MERGED-001', labels: [':Requirement'], properties: { statement: 'merged' } }], edges: [] });

    const { main } = await import('../commands/query-graph.js');
    const result = await main(['--workdir', workDir, '--query', 'list-modules']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    const qResult = data.result as Record<string, unknown>;
    // Only one node with module='Unknown' (no module property set)
    assert.equal(qResult.count, 1);
    const modules = qResult.modules as string[];
    assert.equal(modules[0], 'Unknown');
  });

  it('returns error when graph file is missing', async () => {
    const workDir = createWorkDir('no-graph');
    // Do NOT write any graph file

    const { main } = await import('../commands/query-graph.js');
    const result = await main(['--workdir', workDir, '--query', 'get-node', '--params', '{"id":"x"}']);

    assert.equal(result.status, 'error');
    assert.ok((result.message as string).includes('No graph file found'));
  });

  it('rejects invalid workdir path', async () => {
    const { main } = await import('../commands/query-graph.js');
    const result = await main(['--workdir', '/tmp/invalid-workdir', '--query', 'list-modules']);

    assert.equal(result.status, 'error');
    assert.ok((result.message as string).includes('.srs_formalizer'));
  });

  it('rejects invalid query type', async () => {
    const workDir = createWorkDir('invalid-query');
    writeGraphFile(workDir, 'graph.json', { nodes: [], edges: [] });

    const { main } = await import('../commands/query-graph.js');
    const result = await main(['--workdir', workDir, '--query', 'invalid-query']);

    assert.equal(result.status, 'error');
    assert.ok((result.message as string).includes('Invalid --query'));
  });
});
