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
  fs.mkdirSync(path.join(workDir, '3_graph', 'graph'), { recursive: true });
  return workDir;
}

/**
 * Write a graph JSON file.
 */
function writeGraphFile(workDir: string, filename: string, data: GraphData): void {
  const filePath = path.join(workDir, '3_graph', 'graph', filename);
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

  it('get-node: returns node details for existing node', async () => {
    const workDir = createWorkDir('get-node-existing');
    writeGraphFile(workDir, 'graph.merged.json', standardGraphData());

    const { main } = await import('../commands/query-graph.js');
    const result = await main(['--workdir', workDir, '--query', 'node', '--params', '{"id":"R1-REQ-0001"}']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    const node = data.node as Record<string, unknown>;
    assert.ok(node);
    assert.equal(node.id, 'R1-REQ-0001');
    const props = node.properties as Record<string, unknown>;
    assert.equal(props.statement, '用户登录');
    assert.equal(props.module, '用户模块');
  });

  it('get-node: returns found=false for non-existent node', async () => {
    const workDir = createWorkDir('get-node-missing');
    writeGraphFile(workDir, 'graph.json', standardGraphData());

    const { main } = await import('../commands/query-graph.js');
    const result = await main(['--workdir', workDir, '--query', 'node', '--params', '{"id":"NONEXISTENT"}']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.ok(data.error);
    assert.ok((data.error as string).includes('NONEXISTENT'));
  });

  it('get-neighbors: returns forward and backward neighbors', async () => {
    const workDir = createWorkDir('get-neighbors');
    writeGraphFile(workDir, 'graph.merged.json', standardGraphData());

    const { main } = await import('../commands/query-graph.js');
    const result = await main(['--workdir', workDir, '--query', 'neighbors', '--params', '{"id":"R1-REQ-0001"}']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    const node = data.node as Record<string, unknown>;
    assert.equal(node.id, 'R1-REQ-0001');

    const forward = data.forward as Array<Record<string, unknown>>;
    assert.equal(forward.length, 2);
    const forwardIds = forward.map(n => n.id).sort();
    assert.deepEqual(forwardIds, ['R1-REQ-0002', 'R2-IMPL-0001']);

    const backward = data.backward as Array<Record<string, unknown>>;
    assert.equal(backward.length, 0);
  });

  it('get-module: returns all nodes in a given module', async () => {
    const workDir = createWorkDir('get-module');
    writeGraphFile(workDir, 'graph.merged.json', standardGraphData());

    const { main } = await import('../commands/query-graph.js');
    const result = await main(['--workdir', workDir, '--query', 'module', '--params', '{"name":"用户模块"}']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.module, '用户模块');
    assert.equal(data.node_count, 3);
    const nodes = data.nodes as Array<Record<string, unknown>>;
    const nodeIds = nodes.map(n => n.id).sort();
    assert.deepEqual(nodeIds, ['R1-REQ-0001', 'R1-REQ-0002', 'R2-IMPL-0001']);
  });

  it('list-modules: returns all module names', async () => {
    const workDir = createWorkDir('list-modules');
    writeGraphFile(workDir, 'graph.merged.json', standardGraphData());

    const { main } = await import('../commands/query-graph.js');
    const result = await main(['--workdir', workDir, '--query', 'modules']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    const modules = data.modules as string[];
    assert.equal(modules.length, 2);
    assert.deepEqual(modules, ['用户模块', '订单模块']);
  });

  it('find-path: finds BFS shortest path between connected nodes', async () => {
    const workDir = createWorkDir('find-path-found');
    writeGraphFile(workDir, 'graph.merged.json', standardGraphData());

    const { main } = await import('../commands/query-graph.js');
    const result = await main([
      '--workdir', workDir,
      '--query', 'path',
      '--params', '{"from":"R1-REQ-0001","to":"R3-REL-0001"}',
    ]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.reachable, true);
    const pathIds = data.path as string[];
    assert.ok(pathIds.length >= 2);
    assert.equal(pathIds[0], 'R1-REQ-0001');
    assert.equal(pathIds[pathIds.length - 1], 'R3-REL-0001');
  });

  it('find-path: returns not found for unreachable nodes', async () => {
    const workDir = createWorkDir('find-path-unreachable');
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
    const result = await main([
      '--workdir', workDir,
      '--query', 'path',
      '--params', '{"from":"GROUP-A-001","to":"GROUP-B-001"}',
    ]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.reachable, false);
  });

  it('get-context: returns 2-hop neighborhood for a node', async () => {
    const workDir = createWorkDir('get-context');
    writeGraphFile(workDir, 'graph.merged.json', standardGraphData());

    const { main } = await import('../commands/query-graph.js');
    const result = await main(['--workdir', workDir, '--query', 'context', '--params', '{"id":"R1-REQ-0001"}']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    const context = data.context as Record<string, unknown>;
    assert.ok((context.nodes as Array<unknown>).length >= 4);
    assert.ok((context.edges as Array<unknown>).length >= 3);
  });

  it('export-brainstorm: exports full graph to outputs/brainstorming/', async () => {
    const workDir = createWorkDir('export-brainstorm');
    writeGraphFile(workDir, 'graph.json', standardGraphData());

    const { main } = await import('../commands/query-graph.js');
    const result = await main(['--workdir', workDir, '--query', 'brainstorm']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.ok(data.exported);
    assert.equal(data.node_count, 6);
    assert.equal(data.edge_count, 5);

    const outputPath = data.exported as string;
    assert.ok(fs.existsSync(outputPath), 'export file should exist');
    const exported = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    assert.equal(exported.nodes.length, 6);
    assert.equal(exported.edges.length, 5);
  });

  it('loads graph with correct priority: merged > structure_fixed > graph', async () => {
    const workDir = createWorkDir('graph-priority');

    writeGraphFile(workDir, 'graph.json', { nodes: [{ id: 'BASE-001', labels: [':Requirement'], properties: { statement: 'base' } }], edges: [] });
    writeGraphFile(workDir, 'graph.structure_fixed.json', { nodes: [{ id: 'FIXED-001', labels: [':Requirement'], properties: { statement: 'fixed' } }], edges: [] });
    writeGraphFile(workDir, 'graph.merged.json', { nodes: [{ id: 'MERGED-001', labels: [':Requirement'], properties: { statement: 'merged' } }], edges: [] });

    const { main } = await import('../commands/query-graph.js');
    const result = await main(['--workdir', workDir, '--query', 'modules']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    const modules = data.modules as string[];
    assert.equal(modules.length, 1);
    assert.equal(modules[0], 'Unknown');
  });

  it('returns error when graph file is missing', async () => {
    const workDir = createWorkDir('no-graph');

    const { main } = await import('../commands/query-graph.js');
    const result = await main(['--workdir', workDir, '--query', 'node', '--params', '{"id":"x"}']);

    assert.equal(result.status, 'error');
    assert.ok((result.message as string).includes('No graph file found'));
  });

  it('rejects invalid workdir path', async () => {
    const { main } = await import('../commands/query-graph.js');
    const result = await main(['--workdir', '/tmp/invalid-workdir', '--query', 'modules']);

    assert.equal(result.status, 'error');
    assert.ok((result.message as string).includes('.srs_formalizer'));
  });

  it('rejects invalid query type', async () => {
    const workDir = createWorkDir('invalid-query');
    writeGraphFile(workDir, 'graph.json', { nodes: [], edges: [] });

    const { main } = await import('../commands/query-graph.js');
    const result = await main(['--workdir', workDir, '--query', 'invalid-query']);

    assert.equal(result.status, 'error');
    assert.ok((result.message as string).includes('Invalid query'));
  });
});
