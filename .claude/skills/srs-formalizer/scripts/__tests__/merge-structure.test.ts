import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { GraphData } from '../lib/graph.js';

const TMP = path.join(os.tmpdir(), `srs-formalizer-merge-structure-test-${Date.now()}`);

/**
 * Create a temporary .srs_formalizer workdir with graph/ and analysis/ subdirs.
 * The basename is always ".srs_formalizer" to satisfy validateWorkDir().
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
 * Write a suggestion JSONL file to analysis/.
 */
function writeSuggestions(dir: string, filename: string, records: unknown[]): void {
  const content = records.map(r => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(path.join(dir, filename), content, 'utf-8');
}

describe('merge-structure command', () => {
  before(() => {
    fs.mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  it('applies add_relation suggestion — adds a new edge', async () => {
    const workDir = createWorkDir('add-rel');

    writeGraph(workDir, {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: 'Login', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R1-REQ-0002', labels: [':Requirement'], properties: { statement: 'Auth', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
      ],
      edges: [],
    });

    writeSuggestions(path.join(workDir, '3_graph', 'analysis'), 'suggestions.jsonl', [
      {
        gap_id: 'ORPHAN-001',
        suggestion_type: 'add_relation',
        suggestion: JSON.stringify({ source: 'R1-REQ-0001', target: 'R1-REQ-0002', type: 'DEPENDS_ON' }),
        reasoning: 'Login depends on auth',
        confidence: 'high',
      },
    ]);

    const { main } = await import('../commands/merge-structure.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.suggestions_processed, 1);
    assert.equal(data.applied, 1);
    assert.equal(data.skipped, 0);

    // Verify the output graph has the new edge
    const outputPath = path.join(workDir, '3_graph', 'graph', 'graph.structure_fixed.json');
    assert.ok(fs.existsSync(outputPath));
    const outputGraph = JSON.parse(fs.readFileSync(outputPath, 'utf-8')) as GraphData;
    assert.equal(outputGraph.edges.length, 1);
    assert.equal(outputGraph.edges[0]!.source, 'R1-REQ-0001');
    assert.equal(outputGraph.edges[0]!.target, 'R1-REQ-0002');
    assert.equal(outputGraph.edges[0]!.type, ':DEPENDS_ON');

    // Verify merge log
    const logPath = path.join(workDir, '3_graph', 'graph', 'structure_merge_log.jsonl');
    assert.ok(fs.existsSync(logPath));
    const logLines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    assert.equal(logLines.length, 1);
    const logEntry = JSON.parse(logLines[0]!);
    assert.equal(logEntry.action, 'applied');
    assert.equal(logEntry.gap_id, 'ORPHAN-001');
  });

  // -----------------------------------------------------------------------
  it('applies fix_dangling suggestion — corrects an edge target', async () => {
    const workDir = createWorkDir('fix-dangle');

    writeGraph(workDir, {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: 'Login', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R1-REQ-0002', labels: [':Requirement'], properties: { statement: 'Auth', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
      ],
      edges: [
        { id: 'R3-REL-0001--:DEPENDS_ON--MISSING', source: 'R3-REL-0001', target: 'MISSING', type: ':DEPENDS_ON' },
      ],
    });

    writeSuggestions(path.join(workDir, '3_graph', 'analysis'), 'suggestions.jsonl', [
      {
        gap_id: 'DANGLE-001',
        suggestion_type: 'fix_dangling',
        suggestion: JSON.stringify({ edge_id: 'R3-REL-0001--:DEPENDS_ON--MISSING', new_target: 'R1-REQ-0001' }),
        reasoning: 'Auth should depend on Login',
        confidence: 'high',
      },
    ]);

    const { main } = await import('../commands/merge-structure.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.applied, 1);

    // Verify the fixed edge target
    const outputPath = path.join(workDir, '3_graph', 'graph', 'graph.structure_fixed.json');
    const outputGraph = JSON.parse(fs.readFileSync(outputPath, 'utf-8')) as GraphData;
    const fixedEdge = outputGraph.edges.find(e => e.id === 'R3-REL-0001--:DEPENDS_ON--MISSING');
    assert.ok(fixedEdge);
    assert.equal(fixedEdge!.target, 'R1-REQ-0001');
  });

  // -----------------------------------------------------------------------
  it('applies add_requirement suggestion — adds a new node', async () => {
    const workDir = createWorkDir('add-req');

    writeGraph(workDir, {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: 'Login', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
      ],
      edges: [],
    });

    writeSuggestions(path.join(workDir, '3_graph', 'analysis'), 'suggestions.jsonl', [
      {
        gap_id: 'ORPHAN-001',
        suggestion_type: 'add_requirement',
        suggestion: JSON.stringify({
          id: 'R1-REQ-NEW-0001',
          statement: 'New supplemental requirement',
          category: 'explicit',
          confidence: 'high',
          source_file: 'srs.md',
        }),
        reasoning: 'Missing requirement identified',
        confidence: 'high',
      },
    ]);

    const { main } = await import('../commands/merge-structure.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.applied, 1);

    // Verify the new node in output graph
    const outputPath = path.join(workDir, '3_graph', 'graph', 'graph.structure_fixed.json');
    const outputGraph = JSON.parse(fs.readFileSync(outputPath, 'utf-8')) as GraphData;
    assert.equal(outputGraph.nodes.length, 2);
    const newNode = outputGraph.nodes.find(n => n.id === 'R1-REQ-NEW-0001');
    assert.ok(newNode);
    assert.equal(newNode!.properties.statement, 'New supplemental requirement');
    assert.equal(newNode!.labels[0], ':SupplementalRequirement');
  });

  // -----------------------------------------------------------------------
  it('skips unknown suggestion_type and records in merge log', async () => {
    const workDir = createWorkDir('unknown-type');

    writeGraph(workDir, {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: 'Login', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
      ],
      edges: [],
    });

    writeSuggestions(path.join(workDir, '3_graph', 'analysis'), 'bad_suggestions.jsonl', [
      {
        gap_id: 'UNKNOWN-001',
        suggestion_type: 'delete_node',
        suggestion: '{}',
        reasoning: 'Unknown operation',
        confidence: 'low',
      },
    ]);

    const { main } = await import('../commands/merge-structure.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.suggestions_processed, 1);
    assert.equal(data.applied, 0);
    assert.equal(data.skipped, 1);

    // Verify log entry
    const logPath = path.join(workDir, '3_graph', 'graph', 'structure_merge_log.jsonl');
    const logLines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    assert.equal(logLines.length, 1);
    const logEntry = JSON.parse(logLines[0]!);
    assert.equal(logEntry.action, 'skipped');
    assert.ok(logEntry.reason!.includes('Unknown suggestion_type'));
  });

  // -----------------------------------------------------------------------
  it('skips add_relation when source node does not exist in graph', async () => {
    const workDir = createWorkDir('missing-source');

    writeGraph(workDir, {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: 'Login', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
      ],
      edges: [],
    });

    writeSuggestions(path.join(workDir, '3_graph', 'analysis'), 'suggestions.jsonl', [
      {
        gap_id: 'ORPHAN-001',
        suggestion_type: 'add_relation',
        suggestion: JSON.stringify({ source: 'NONEXISTENT', target: 'R1-REQ-0001', type: 'DEPENDS_ON' }),
        reasoning: 'Test',
        confidence: 'high',
      },
    ]);

    const { main } = await import('../commands/merge-structure.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.applied, 0);
    assert.equal(data.skipped, 1);

    // Edge should not exist
    const outputPath = path.join(workDir, '3_graph', 'graph', 'graph.structure_fixed.json');
    const outputGraph = JSON.parse(fs.readFileSync(outputPath, 'utf-8')) as GraphData;
    assert.equal(outputGraph.edges.length, 0);
  });

  // -----------------------------------------------------------------------
  it('rejects non-.srs_formalizer workdir', async () => {
    const badDir = path.join(TMP, 'bad_dir');
    fs.mkdirSync(badDir, { recursive: true });

    const { main } = await import('../commands/merge-structure.js');
    const result = await main(['--workdir', badDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('.srs_formalizer'));
  });

  // -----------------------------------------------------------------------
  it('handles missing graph file gracefully', async () => {
    const workDir = createWorkDir('no-graph');
    // Don't write graph.json

    const { main } = await import('../commands/merge-structure.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('Graph file not found'));
  });

  // -----------------------------------------------------------------------
  it('handles empty suggestions (noop — copies graph as-is)', async () => {
    const workDir = createWorkDir('empty-suggestions');

    writeGraph(workDir, {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: 'Login', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
      ],
      edges: [],
    });

    // No suggestion files in analysis/

    const { main } = await import('../commands/merge-structure.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.suggestions_processed, 0);
    assert.equal(data.applied, 0);
    assert.equal(data.skipped, 0);

    // Output graph should mirror input graph
    const outputPath = path.join(workDir, '3_graph', 'graph', 'graph.structure_fixed.json');
    assert.ok(fs.existsSync(outputPath));
    const outputGraph = JSON.parse(fs.readFileSync(outputPath, 'utf-8')) as GraphData;
    assert.equal(outputGraph.nodes.length, 1);
    assert.equal(outputGraph.nodes[0]!.id, 'R1-REQ-0001');
    assert.equal(outputGraph.edges.length, 0);

    // Merge log should exist (empty)
    const logPath = path.join(workDir, '3_graph', 'graph', 'structure_merge_log.jsonl');
    assert.ok(fs.existsSync(logPath));
    const logContent = fs.readFileSync(logPath, 'utf-8').trim();
    assert.equal(logContent, '');
  });

  // -----------------------------------------------------------------------
  it('excludes analysis output JSONL files from suggestion processing', async () => {
    const workDir = createWorkDir('exclude-analysis');

    writeGraph(workDir, {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: 'Login', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
      ],
      edges: [],
    });

    // orphan_nodes.jsonl should be excluded
    writeSuggestions(path.join(workDir, '3_graph', 'analysis'), 'orphan_nodes.jsonl', [
      { id: 'R1-REQ-0001', statement: 'Login', category: 'explicit', confidence: 'high' },
    ]);

    // Real suggestion file
    writeSuggestions(path.join(workDir, '3_graph', 'analysis'), 'completions.jsonl', [
      {
        gap_id: 'ORPHAN-001',
        suggestion_type: 'add_relation',
        suggestion: JSON.stringify({ source: 'R1-REQ-0001', target: 'R1-REQ-0002', type: 'DEPENDS_ON' }),
        reasoning: 'Test',
        confidence: 'high',
      },
    ]);

    const { main } = await import('../commands/merge-structure.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    // Only the real suggestion should be processed
    // The "add_relation" will be skipped because R1-REQ-0002 doesn't exist
    assert.equal(data.suggestions_processed, 1);
  });
});
