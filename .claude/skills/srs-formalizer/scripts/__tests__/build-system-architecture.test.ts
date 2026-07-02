import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TMP = path.join(os.tmpdir(), `srs-formalizer-build-system-architecture-test-${Date.now()}`);

/**
 * Create a temporary .srs_formalizer workdir with all subdirs needed.
 */
function createWorkDir(name: string): string {
  const workDir = path.join(TMP, name, '.srs_formalizer');
  fs.mkdirSync(path.join(workDir, '3_graph', 'graph'), { recursive: true });
  fs.mkdirSync(path.join(workDir, '4_bdd'), { recursive: true });
  fs.mkdirSync(path.join(workDir, '5_formal'), { recursive: true });
  return workDir;
}

/**
 * Write graph.merged.json for the requirement graph.
 * The requirement graph node must use labels that include 'Requirement' or the
 * consistency check will see 0 requirement nodes.
 */
function writeReqGraph(workDir: string, nodes: unknown[], edges: unknown[]): void {
  fs.writeFileSync(
    path.join(workDir, '3_graph', 'graph', 'graph.merged.json'),
    JSON.stringify({ nodes, edges }, null, 2),
    'utf-8',
  );
}

/**
 * Write a behavior graph with the BehaviorGraph shape (version, nodes, edges, metadata).
 */
function writeBehaviorGraph(workDir: string, nodes: unknown[], edges: unknown[]): void {
  fs.writeFileSync(
    path.join(workDir, '4_bdd', 'behavior-graph.json'),
    JSON.stringify({
      version: '1.0',
      nodes,
      edges,
      metadata: { generated_at: new Date().toISOString(), feature_count: 0, scenario_count: 0, action_count: 0, source_workdir: workDir },
    }, null, 2),
    'utf-8',
  );
}

/**
 * Write a TLA interaction graph.
 */
function writeTlaGraph(workDir: string, nodes: unknown[], edges: unknown[]): void {
  fs.writeFileSync(
    path.join(workDir, '5_formal', 'tla-interaction-graph.json'),
    JSON.stringify({
      version: '1.0',
      nodes,
      edges,
      metadata: { generated_at: new Date().toISOString(), spec_count: 0, total_actions: 0, total_invariants: 0, max_hierarchy_depth: 0, source_workdir: workDir },
    }, null, 2),
    'utf-8',
  );
}

/**
 * Write a Lean proof graph.
 */
function writeLeanGraph(workDir: string, nodes: unknown[], edges: unknown[]): void {
  fs.writeFileSync(
    path.join(workDir, '5_formal', 'lean-proof-graph.json'),
    JSON.stringify({
      version: '1.0',
      nodes,
      edges,
      metadata: { generated_at: new Date().toISOString(), file_count: 0, theorem_count: 0, lemma_count: 0, axiom_count: 0, sorry_count: 0, import_count: 0, max_proof_depth: 0, source_workdir: workDir },
    }, null, 2),
    'utf-8',
  );
}

describe('build-system-architecture command', () => {
  before(() => {
    fs.mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('builds system architecture from all layer graphs', async () => {
    const workDir = createWorkDir('all-layers');

    // Requirement graph with one requirement node
    writeReqGraph(workDir, [
      { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: 'User can login', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
    ], []);

    // Behavior graph with a scenario node that VERIFIES the requirement
    writeBehaviorGraph(workDir, [
      { id: 'Scenario-Auth-001', labels: ['Scenario'], properties: { name: 'Successful login' } },
    ], [
      { source: 'Scenario-Auth-001', target: 'R1-REQ-0001', type: 'VERIFIES' },
    ]);

    // TLA graph
    writeTlaGraph(workDir, [
      { id: 'System-Auth', labels: ['System'], properties: { module: 'AuthSpec', name: 'AuthSpec' } },
    ], []);

    // Lean graph
    writeLeanGraph(workDir, [], []);

    const { main } = await import('../commands/build-system-architecture.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.iteration, 1);
    assert.ok(typeof data.total_cross_edges === 'number');

    // Verify output files
    assert.ok(fs.existsSync(path.join(workDir, '6_outputs', 'system-architecture.json')));
    assert.ok(fs.existsSync(path.join(workDir, '6_outputs', 'knowledge_graph', 'system-architecture.cypher')));
    assert.ok(fs.existsSync(path.join(workDir, '6_outputs', 'convergence-log.jsonl')));
  });

  it('returns error when missing --workdir argument', async () => {
    const { main } = await import('../commands/build-system-architecture.js');
    const result = await main([]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('Missing required argument'));
  });

  it('returns error for --iteration with negative value', async () => {
    const workDir = createWorkDir('negative-iter');
    writeReqGraph(workDir, [], []);

    const { main } = await import('../commands/build-system-architecture.js');
    const result = await main(['--workdir', workDir, '--iteration', '-1']);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('positive integer'));
  });

  it('returns error for --iteration with zero value', async () => {
    const workDir = createWorkDir('zero-iter');
    writeReqGraph(workDir, [], []);

    const { main } = await import('../commands/build-system-architecture.js');
    const result = await main(['--workdir', workDir, '--iteration', '0']);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('positive integer'));
  });

  it('returns error for non-numeric --iteration', async () => {
    const workDir = createWorkDir('nan-iter');
    writeReqGraph(workDir, [], []);

    const { main } = await import('../commands/build-system-architecture.js');
    const result = await main(['--workdir', workDir, '--iteration', 'abc']);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('positive integer'));
  });

  it('rejects non-.srs_formalizer workdir', async () => {
    const badDir = path.join(TMP, 'bad_workdir');
    fs.mkdirSync(badDir, { recursive: true });

    const { main } = await import('../commands/build-system-architecture.js');
    const result = await main(['--workdir', badDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('.srs_formalizer'));
  });
});
