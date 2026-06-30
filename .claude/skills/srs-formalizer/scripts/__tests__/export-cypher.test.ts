import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { GraphData } from '../lib/graph.js';

const TMP = path.join(os.tmpdir(), `srs-formalizer-export-cypher-test-${Date.now()}`);

/**
 * Create a temporary .srs_formalizer workdir with graph/ subdir.
 */
function createWorkDir(name: string): string {
  const workDir = path.join(TMP, name, '.srs_formalizer');
  fs.mkdirSync(path.join(workDir, '3_graph', 'graph'), { recursive: true });
  return workDir;
}

/**
 * Write a graph JSON file to the workdir's graph/ subdirectory.
 */
function writeGraphFile(workDir: string, filename: string, data: GraphData): void {
  const filePath = path.join(workDir, '3_graph', 'graph', filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

describe('export-cypher command', () => {
  before(() => {
    fs.mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  it('reads graph.merged.json and generates schema.cypher', async () => {
    const workDir = createWorkDir('merged');

    writeGraphFile(workDir, 'graph.merged.json', {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: '用户登录', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R1-REQ-0002', labels: [':Requirement'], properties: { statement: '用户注册', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
      ],
      edges: [
        { id: 'E1', source: 'R1-REQ-0001', target: 'R1-REQ-0002', type: ':DEPENDS_ON' },
      ],
    });

    const { main } = await import('../commands/export-cypher.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.node_count, 2);
    assert.equal(data.edge_count, 1);

    // Verify output file exists
    const cypherPath = path.join(workDir, '6_outputs', 'knowledge_graph', 'schema.cypher');
    assert.ok(fs.existsSync(cypherPath), 'schema.cypher should exist');

    const content = fs.readFileSync(cypherPath, 'utf-8');
    assert.ok(content.includes('SRS-Formalizer Knowledge Graph'));
    assert.ok(content.includes('CREATE CONSTRAINT'));
    assert.ok(content.includes('R1-REQ-0001'));
    assert.ok(content.includes('R1-REQ-0002'));
    assert.ok(content.includes(':DEPENDS_ON'));
  });

  // ---------------------------------------------------------------------------
  it('falls back to graph.structure_fixed.json when graph.merged.json is absent', async () => {
    const workDir = createWorkDir('fallback-fixed');

    writeGraphFile(workDir, 'graph.structure_fixed.json', {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: '登录', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
      ],
      edges: [],
    });

    const { main } = await import('../commands/export-cypher.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.node_count, 1);

    const cypherPath = path.join(workDir, '6_outputs', 'knowledge_graph', 'schema.cypher');
    assert.ok(fs.existsSync(cypherPath));
    const content = fs.readFileSync(cypherPath, 'utf-8');
    // Node id appears in edge MATCH statements; since there are no edges,
    // check that the statement value is present
    assert.ok(content.includes('登录'));
  });

  // ---------------------------------------------------------------------------
  it('falls back to graph.json when neither merged nor fixed exist', async () => {
    const workDir = createWorkDir('fallback-base');

    writeGraphFile(workDir, 'graph.json', {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: '登录', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
      ],
      edges: [],
    });

    const { main } = await import('../commands/export-cypher.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.node_count, 1);

    const cypherPath = path.join(workDir, '6_outputs', 'knowledge_graph', 'schema.cypher');
    assert.ok(fs.existsSync(cypherPath));
  });

  // ---------------------------------------------------------------------------
  it('returns error when no graph file exists', async () => {
    const workDir = createWorkDir('no-graph');
    // Don't write any graph files

    const { main } = await import('../commands/export-cypher.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('Graph file not found'));
  });

  // ---------------------------------------------------------------------------
  it('returns error when --workdir is missing', async () => {
    const { main } = await import('../commands/export-cypher.js');
    const result = await main([]);

    assert.equal(result.status, 'error');
    assert.equal(result.message, 'Missing required argument: --workdir');
  });

  // ---------------------------------------------------------------------------
  it('produces deterministic output for identical graphs', async () => {
    const workDirA = createWorkDir('det-a');
    const workDirB = createWorkDir('det-b');

    const graphData: GraphData = {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: '登录', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R1-REQ-0002', labels: [':Requirement'], properties: { statement: '支付', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R3-REL-0001', labels: [':RelationalRequirement'], properties: { statement: '登录依赖支付', source_file: 'srs.md', confidence: 'medium', category: 'relational' } },
      ],
      edges: [
        { id: 'E1', source: 'R3-REL-0001', target: 'R1-REQ-0001', type: ':DEPENDS_ON' },
      ],
    };

    for (const wd of [workDirA, workDirB]) {
      writeGraphFile(wd, 'graph.json', graphData);
    }

    const { main } = await import('../commands/export-cypher.js');
    const resultA = await main(['--workdir', workDirA]);
    const resultB = await main(['--workdir', workDirB]);

    assert.equal(resultA.status, 'ok');
    assert.equal(resultB.status, 'ok');

    const outputA = path.join(workDirA, '6_outputs', 'knowledge_graph', 'schema.cypher');
    const outputB = path.join(workDirB, '6_outputs', 'knowledge_graph', 'schema.cypher');
    const contentA = fs.readFileSync(outputA, 'utf-8');
    const contentB = fs.readFileSync(outputB, 'utf-8');

    assert.equal(contentA, contentB, 'Same graph should produce identical Cypher output');
  });

  // ---------------------------------------------------------------------------
  it('handles empty graph (no nodes, no edges)', async () => {
    const workDir = createWorkDir('empty-graph');

    writeGraphFile(workDir, 'graph.json', { nodes: [], edges: [] });

    const { main } = await import('../commands/export-cypher.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.node_count, 0);
    assert.equal(data.edge_count, 0);

    const cypherPath = path.join(workDir, '6_outputs', 'knowledge_graph', 'schema.cypher');
    assert.ok(fs.existsSync(cypherPath));
    const content = fs.readFileSync(cypherPath, 'utf-8');
    // Should still have constraints and header
    assert.ok(content.includes('SRS-Formalizer Knowledge Graph'));
    assert.ok(content.includes('CREATE CONSTRAINT'));
  });

  // ---------------------------------------------------------------------------
  it('rejects non-.srs_formalizer workdir', async () => {
    const badDir = path.join(TMP, 'bad_workdir');
    fs.mkdirSync(badDir, { recursive: true });

    const { main } = await import('../commands/export-cypher.js');
    const result = await main(['--workdir', badDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('.srs_formalizer'));
  });
});
