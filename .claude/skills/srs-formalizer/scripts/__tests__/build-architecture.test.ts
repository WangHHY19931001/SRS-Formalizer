import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { GraphData } from '../lib/graph.js';

const TMP = path.join(os.tmpdir(), `srs-formalizer-build-architecture-test-${Date.now()}`);

/**
 * Create a temporary .srs_formalizer workdir with architecture and graph subdirs.
 * The basename is always ".srs_formalizer" to satisfy validateWorkDir().
 */
function createWorkDir(name: string): string {
  const workDir = path.join(TMP, name, '.srs_formalizer');
  fs.mkdirSync(path.join(workDir, '2_extract', 'architecture'), { recursive: true });
  fs.mkdirSync(path.join(workDir, '3_graph', 'graph'), { recursive: true });
  return workDir;
}

/**
 * Write a graph file at 3_graph/graph/graph.json in the workdir.
 */
function writeGraph(workDir: string, data: GraphData): void {
  const graphPath = path.join(workDir, '3_graph', 'graph', 'graph.json');
  fs.writeFileSync(graphPath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Write an architecture JSONL file to 2_extract/architecture/.
 */
function writeArchJsonl(workDir: string, filename: string, records: unknown[]): void {
  const content = records.map(r => JSON.stringify(r)).join('\n') + '\n';
  const filePath = path.join(workDir, '2_extract', 'architecture', filename);
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Read the output graph file as GraphData.
 */
function readOutputGraph(workDir: string): GraphData {
  const outputPath = path.join(workDir, '3_graph', 'graph', 'graph.with_architecture.json');
  return JSON.parse(fs.readFileSync(outputPath, 'utf-8')) as GraphData;
}

describe('build-architecture command', () => {
  before(() => {
    fs.mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Test 1: arch-1 creates Module nodes and CONTAINS edges
  // -------------------------------------------------------------------------
  it('arch-1 creates Module nodes and CONTAINS edges', async () => {
    const workDir = createWorkDir('arch1-module-contains');

    // Existing graph with requirement nodes
    writeGraph(workDir, {
      nodes: [
        {
          id: 'R1-REQ-0001',
          labels: [':Requirement'],
          properties: { statement: '用户登录', source_file: 'srs.md', confidence: 'high', category: 'explicit' },
        },
        {
          id: 'R1-REQ-0002',
          labels: [':Requirement'],
          properties: { statement: '用户注册', source_file: 'srs.md', confidence: 'high', category: 'explicit' },
        },
      ],
      edges: [],
    });

    // arch-1 with a module that contains both requirements
    writeArchJsonl(workDir, 'arch-1.jsonl', [
      {
        id: 'ARCH-S001-0001',
        type: 'module',
        name: '用户管理',
        parent: null,
        contains: ['R1-REQ-0001', 'R1-REQ-0002'],
        reasoning: '用户管理模块包含登录和注册功能',
      },
    ]);

    const { main } = await import('../commands/build-architecture.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.modules, 1);
    assert.equal(data.actors, 0);
    assert.equal(data.constraints, 0);
    assert.equal(data.contains_edges, 2);

    // Verify output graph
    const output = readOutputGraph(workDir);
    assert.equal(output.nodes.length, 3); // 2 existing + 1 new module
    assert.equal(output.edges.length, 2);

    // Module node should exist
    const moduleNode = output.nodes.find(n => n.id === 'ARCH-S001-0001');
    assert.ok(moduleNode, 'Module node should exist');
    assert.ok(moduleNode!.labels.includes(':Module'), 'Should have :Module label');
    assert.equal(moduleNode!.properties.name, '用户管理');

    // CONTAINS edges should exist
    const contains1 = output.edges.find(e => e.source === 'ARCH-S001-0001' && e.target === 'R1-REQ-0001');
    const contains2 = output.edges.find(e => e.source === 'ARCH-S001-0001' && e.target === 'R1-REQ-0002');
    assert.ok(contains1, 'CONTAINS edge to R1-REQ-0001 should exist');
    assert.ok(contains2, 'CONTAINS edge to R1-REQ-0002 should exist');
    assert.equal(contains1!.type, ':CONTAINS');
    assert.equal(contains2!.type, ':CONTAINS');
  });

  // -------------------------------------------------------------------------
  // Test 2: arch-1 creates Actor nodes
  // -------------------------------------------------------------------------
  it('arch-1 creates Actor nodes', async () => {
    const workDir = createWorkDir('arch1-actor');

    // Empty existing graph
    writeGraph(workDir, { nodes: [], edges: [] });

    writeArchJsonl(workDir, 'arch-1.jsonl', [
      {
        id: 'ARCH-S001-0002',
        type: 'actor',
        name: '用户',
        parent: null,
        contains: [],
        reasoning: '系统的最终用户',
      },
    ]);

    const { main } = await import('../commands/build-architecture.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.actors, 1);

    const output = readOutputGraph(workDir);
    const actorNode = output.nodes.find(n => n.id === 'ARCH-S001-0002');
    assert.ok(actorNode, 'Actor node should exist');
    assert.ok(actorNode!.labels.includes(':Actor'), 'Should have :Actor label');
    assert.equal(actorNode!.properties.name, '用户');
  });

  // -------------------------------------------------------------------------
  // Test 3: arch-1 creates Constraint nodes
  // -------------------------------------------------------------------------
  it('arch-1 creates Constraint nodes', async () => {
    const workDir = createWorkDir('arch1-constraint');

    writeGraph(workDir, {
      nodes: [
        {
          id: 'R1-REQ-0001',
          labels: [':Requirement'],
          properties: { statement: '冻结功能', source_file: 'srs.md', confidence: 'high', category: 'explicit' },
        },
      ],
      edges: [],
    });

    writeArchJsonl(workDir, 'arch-1.jsonl', [
      {
        id: 'ARCH-S001-0003',
        type: 'constraint',
        name: '执行器冻结',
        parent: null,
        contains: ['R1-REQ-0001'],
        reasoning: '执行器在更新期间必须冻结',
      },
    ]);

    const { main } = await import('../commands/build-architecture.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.constraints, 1);
    assert.equal(data.contains_edges, 1);

    const output = readOutputGraph(workDir);
    const constraintNode = output.nodes.find(n => n.id === 'ARCH-S001-0003');
    assert.ok(constraintNode, 'Constraint node should exist');
    assert.ok(constraintNode!.labels.includes(':Constraint'), 'Should have :Constraint label');
    assert.equal(constraintNode!.properties.name, '执行器冻结');

    // CONTAINS edge from constraint to requirement
    const containsEdge = output.edges.find(
      e => e.source === 'ARCH-S001-0003' && e.target === 'R1-REQ-0001',
    );
    assert.ok(containsEdge, 'CONTAINS edge from constraint to requirement should exist');
    assert.equal(containsEdge!.type, ':CONTAINS');
  });

  // -------------------------------------------------------------------------
  // Test 4: arch-1 PARENT_OF hierarchy
  // -------------------------------------------------------------------------
  it('arch-1 creates PARENT_OF hierarchy edges', async () => {
    const workDir = createWorkDir('arch1-parent-of');

    writeGraph(workDir, { nodes: [], edges: [] });

    // Two modules: 决策器 (top-level) and 执行器 (child of 决策器)
    writeArchJsonl(workDir, 'arch-1.jsonl', [
      {
        id: 'ARCH-S001-0010',
        type: 'module',
        name: '决策器',
        parent: null,
        contains: [],
        reasoning: '顶层决策模块',
      },
      {
        id: 'ARCH-S001-0011',
        type: 'module',
        name: '执行器',
        parent: '决策器',
        contains: [],
        reasoning: '执行决策的子模块',
      },
    ]);

    const { main } = await import('../commands/build-architecture.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.modules, 2);

    const output = readOutputGraph(workDir);

    // Verify PARENT_OF edge
    const parentEdge = output.edges.find(
      e => e.type === ':PARENT_OF' && e.target === 'ARCH-S001-0011',
    );
    assert.ok(parentEdge, 'PARENT_OF edge should exist from parent to child');
    assert.equal(parentEdge!.source, 'ARCH-S001-0010');
    assert.equal(parentEdge!.target, 'ARCH-S001-0011');

    // Verify both module nodes exist
    const parentNode = output.nodes.find(n => n.id === 'ARCH-S001-0010');
    const childNode = output.nodes.find(n => n.id === 'ARCH-S001-0011');
    assert.ok(parentNode, 'Parent module should exist');
    assert.ok(childNode, 'Child module should exist');
    assert.equal(parentNode!.properties.name, '决策器');
    assert.equal(childNode!.properties.name, '执行器');
  });

  // -------------------------------------------------------------------------
  // Test 5: arch-2 add_module operation
  // -------------------------------------------------------------------------
  it('arch-2 add_module creates a new module with parent and CONTAINS edges', async () => {
    const workDir = createWorkDir('arch2-add-module');

    writeGraph(workDir, {
      nodes: [
        {
          id: 'R2-REQ-0001',
          labels: [':Requirement'],
          properties: { statement: '数据加密', source_file: 'srs.md', confidence: 'high', category: 'explicit' },
        },
      ],
      edges: [],
    });

    // arch-1 defines parent module
    writeArchJsonl(workDir, 'arch-1.jsonl', [
      {
        id: 'ARCH-S001-0020',
        type: 'module',
        name: '安全',
        parent: null,
        contains: [],
        reasoning: '安全模块',
      },
    ]);

    // arch-2 adds a sub-module
    writeArchJsonl(workDir, 'arch-2.jsonl', [
      {
        id: 'ARCH2-S001-0001',
        action: 'add_module',
        name: '加密模块',
        parent: '安全',
        contains: ['R2-REQ-0001'],
        reasoning: '加密功能子模块',
      },
    ]);

    const { main } = await import('../commands/build-architecture.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    // arch-1 created 1 module, arch-2 created 1 module
    assert.equal(data.modules, 2);
    assert.equal(data.contains_edges, 1);

    const output = readOutputGraph(workDir);

    // New module from arch-2
    const newModule = output.nodes.find(n => n.id === 'ARCH2-S001-0001');
    assert.ok(newModule, 'arch-2 module node should exist');
    assert.equal(newModule!.properties.name, '加密模块');

    // PARENT_OF edge from 安全 to 加密模块
    const parentEdge = output.edges.find(
      e => e.type === ':PARENT_OF' && e.target === 'ARCH2-S001-0001',
    );
    assert.ok(parentEdge, 'PARENT_OF edge should exist');
    assert.equal(parentEdge!.source, 'ARCH-S001-0020');

    // CONTAINS edge
    const containsEdge = output.edges.find(
      e => e.source === 'ARCH2-S001-0001' && e.target === 'R2-REQ-0001',
    );
    assert.ok(containsEdge, 'CONTAINS edge should exist');
  });

  // -------------------------------------------------------------------------
  // Test 6: arch-2 reparent operation
  // -------------------------------------------------------------------------
  it('arch-2 reparent changes the parent of an existing module', async () => {
    const workDir = createWorkDir('arch2-reparent');

    writeGraph(workDir, { nodes: [], edges: [] });

    // arch-1 defines three modules: 系统, 旧模块, 决策器
    writeArchJsonl(workDir, 'arch-1.jsonl', [
      {
        id: 'ARCH-S001-0030',
        type: 'module',
        name: '系统',
        parent: null,
        contains: [],
        reasoning: '根模块',
      },
      {
        id: 'ARCH-S001-0031',
        type: 'module',
        name: '旧模块',
        parent: '系统',
        contains: [],
        reasoning: '最初挂在系统下',
      },
      {
        id: 'ARCH-S001-0032',
        type: 'module',
        name: '决策器',
        parent: '系统',
        contains: [],
        reasoning: '另一个子模块',
      },
    ]);

    // arch-2 reparents 旧模块 from 系统 to 决策器
    writeArchJsonl(workDir, 'arch-2.jsonl', [
      {
        id: 'ARCH2-S001-0002',
        action: 'reparent',
        target: '旧模块',
        name: null,
        parent: '决策器',
        contains: [],
        reasoning: '旧模块应该挂在决策器下',
      },
    ]);

    const { main } = await import('../commands/build-architecture.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');

    const output = readOutputGraph(workDir);

    // Should have exactly one PARENT_OF edge where 旧模块 is the target
    const parentEdgesForModule = output.edges.filter(
      e => e.type === ':PARENT_OF' && e.target === 'ARCH-S001-0031',
    );
    assert.equal(parentEdgesForModule.length, 1, '旧模块 should have exactly one parent');

    // Now the parent should be 决策器 (ARCH-S001-0032), not 系统
    const oldParentEdge = output.edges.find(
      e => e.type === ':PARENT_OF' && e.source === 'ARCH-S001-0030' && e.target === 'ARCH-S001-0031',
    );
    assert.ok(!oldParentEdge, '旧模块 should no longer be under 系统');

    const newParentEdge = output.edges.find(
      e => e.type === ':PARENT_OF' && e.source === 'ARCH-S001-0032' && e.target === 'ARCH-S001-0031',
    );
    assert.ok(newParentEdge, '旧模块 should now be under 决策器');
  });

  // -------------------------------------------------------------------------
  // Test 7: path safety rejection
  // -------------------------------------------------------------------------
  it('rejects non-.srs_formalizer workdir', async () => {
    const badDir = path.join(TMP, 'bad_workdir');
    fs.mkdirSync(badDir, { recursive: true });

    const { main } = await import('../commands/build-architecture.js');
    const result = await main(['--workdir', badDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('.srs_formalizer'), 'Error message should mention .srs_formalizer');
  });
});
