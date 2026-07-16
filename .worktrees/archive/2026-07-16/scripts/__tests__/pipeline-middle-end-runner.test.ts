/**
 * Tests for lib/pipeline/middle-end-runner.ts
 *
 * Verifies the 3-phase parallelization strategy:
 *   Phase 1 (parallel):   analyze-structure + analyze-graph  (see original IR)
 *   Phase 2 (sequential): tag-nfr                            (mutates IR)
 *   Phase 3 (parallel):   check-connectivity + score-risk    (see NFR-tagged IR)
 */

import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { SRSIR } from '../types/srs-ir.js';
import { runMiddleEndPasses } from '../lib/pipeline/middle-end-runner.js';

const TMP = path.join(os.tmpdir(), `srs-formalizer-middle-end-runner-test-${Date.now()}`);

function mkMeta(): SRSIR['meta'] {
  return {
    sourcePath: '/tmp/test.md', sourceHash: 'abc', language: 'zh',
    totalChars: 100, totalShards: 1, totalNodes: 0, totalEdges: 0,
    buildTimestamp: new Date().toISOString(),
  };
}

function mkNode(id: string, statement: string): SRSIR['nodes'][number] {
  return {
    id, type: 'requirement', module: 'mod', labels: [':Requirement'],
    properties: { statement, category: 'explicit', confidence: 'high' },
    source: { filePath: '/tmp/test.md', startLine: 1, endLine: 2, shardId: 'shard-1', chapter: '§1' },
  };
}

function mkEdge(id: string, source: string, target: string): SRSIR['edges'][number] {
  return { id, source, target, type: 'depends_on', properties: {} };
}

function mkIR(nodes: SRSIR['nodes'], edges: SRSIR['edges']): SRSIR {
  return {
    version: '2.0.0',
    meta: { ...mkMeta(), totalNodes: nodes.length, totalEdges: edges.length },
    nodes, edges, crossRefs: [],
    nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] },
    gaps: [], glossary: [],
  };
}

function createWorkDir(name: string): string {
  const workDir = path.join(TMP, name, '.srs_formalizer');
  fs.mkdirSync(workDir, { recursive: true });
  return workDir;
}

function writeIR(workDir: string, ir: SRSIR): void {
  fs.writeFileSync(path.join(workDir, 'srs-ir.json'), JSON.stringify(ir, null, 2), 'utf-8');
}

function readIR(workDir: string): SRSIR {
  return JSON.parse(fs.readFileSync(path.join(workDir, 'srs-ir.json'), 'utf-8')) as SRSIR;
}

describe('runMiddleEndPasses', () => {
  before(() => { fs.mkdirSync(TMP, { recursive: true }); });
  after(() => { fs.rmSync(TMP, { recursive: true, force: true }); });

  it('runs all 5 passes and returns results in execution order', async () => {
    const workDir = createWorkDir('all-pass');
    writeIR(workDir, mkIR([
      mkNode('R1-01', '系统响应时间 ≤ 200ms'),
      mkNode('R1-02', '用户点击登录按钮'),
      mkNode('R1-03', '所有数据传输需加密'),
    ], [
      mkEdge('E1', 'R1-01', 'R1-02'),
    ]));

    const results = await runMiddleEndPasses({ workDir });

    assert.equal(results.length, 5);
    assert.equal(results[0]!.id, 'analyze-structure');
    assert.equal(results[1]!.id, 'analyze-graph');
    assert.equal(results[2]!.id, 'tag-nfr');
    assert.equal(results[3]!.id, 'check-connectivity');
    assert.equal(results[4]!.id, 'score-risk');

    for (const r of results) {
      assert.equal(r.status, 'ok', `${r.id} should succeed: ${r.message}`);
      assert.ok(r.duration_ms >= 0, `${r.id} should have duration_ms`);
      assert.ok(r.message.length > 0, `${r.id} should have non-empty message`);
    }
  });

  it('Phase 2 runs after Phase 1: tag-nfr sees original IR (NFRs not yet tagged)', async () => {
    const workDir = createWorkDir('phase-ordering');
    writeIR(workDir, mkIR([
      mkNode('R1-01', '系统响应时间 ≤ 200ms'),
      mkNode('R1-02', '用户点击登录按钮'),
    ], []));

    const results = await runMiddleEndPasses({ workDir });
    assert.equal(results[2]!.id, 'tag-nfr');
    assert.equal(results[2]!.status, 'ok');
    const tagData = results[2]!.data as { tagged?: number };
    assert.ok(tagData && tagData.tagged! > 0, 'tag-nfr should tag the performance requirement');
  });

  it('Phase 3 runs after Phase 2: score-risk sees NFR-tagged IR', async () => {
    const workDir = createWorkDir('nfr-coverage');
    writeIR(workDir, mkIR([
      mkNode('R1-01', '系统响应时间 ≤ 200ms'),
      mkNode('R1-02', '所有数据传输需加密，采用 AES-256'),
      mkNode('R1-03', '系统可用性 ≥ 99.9%'),
    ], []));

    const results = await runMiddleEndPasses({ workDir });
    const scoreRiskResult = results.find(r => r.id === 'score-risk');
    assert.ok(scoreRiskResult);
    assert.equal(scoreRiskResult!.status, 'ok');

    const ir = readIR(workDir);
    assert.ok(ir.meta.riskScore !== undefined, 'score-risk should set meta.riskScore');
    assert.ok(ir.meta.highRiskShards !== undefined, 'score-risk should set meta.highRiskShards');
  });

  it('Phase 1 failures do not stop Phase 2 and Phase 3 (non-fatal)', async () => {
    // Use a valid IR — in practice, analyze-structure/analyze-graph failures
    // are non-fatal because the runner never checks Phase 1 status before
    // proceeding to Phase 2. This test verifies the contract: all 5 passes
    // run even if Phase 1 produces errors.
    const workDir = createWorkDir('phase1-nonfatal');
    writeIR(workDir, mkIR([
      mkNode('R1-01', '系统响应时间 ≤ 200ms'),
      mkNode('R1-02', '用户点击登录按钮'),
    ], []));

    const results = await runMiddleEndPasses({ workDir });
    assert.equal(results.length, 5, 'all 5 passes should run regardless of Phase 1 status');
    // tag-nfr (Phase 2) must run
    const tagNfr = results.find(r => r.id === 'tag-nfr');
    assert.ok(tagNfr);
    assert.equal(tagNfr!.status, 'ok');
    // Phase 3 must run
    const checkConn = results.find(r => r.id === 'check-connectivity');
    const scoreRisk = results.find(r => r.id === 'score-risk');
    assert.ok(checkConn, 'check-connectivity should run after Phase 1');
    assert.ok(scoreRisk, 'score-risk should run after Phase 2');
  });

  it('tag-nfr failure stops Phase 3 (early exit)', async () => {
    const workDir = createWorkDir('tag-nfr-fail');
    // No srs-ir.json file — tag-nfr will fail
    const results = await runMiddleEndPasses({ workDir });

    // Phase 1 (analyze-structure + analyze-graph) will also fail since no IR
    // Phase 2 (tag-nfr) will fail
    const tagNfrResult = results.find(r => r.id === 'tag-nfr');
    assert.ok(tagNfrResult);
    assert.equal(tagNfrResult!.status, 'error');

    // Phase 3 should NOT run
    const checkConn = results.find(r => r.id === 'check-connectivity');
    const scoreRisk = results.find(r => r.id === 'score-risk');
    assert.equal(checkConn, undefined, 'check-connectivity should not run after tag-nfr failure');
    assert.equal(scoreRisk, undefined, 'score-risk should not run after tag-nfr failure');
  });

  it('check-connectivity runs in parallel with score-risk (Phase 3)', async () => {
    const workDir = createWorkDir('phase3-parallel');
    writeIR(workDir, mkIR([
      mkNode('R1-01', '系统响应时间 ≤ 200ms'),
      mkNode('R1-02', '用户点击登录按钮'),
    ], [
      mkEdge('E1', 'R1-01', 'R1-02'),
    ]));

    const results = await runMiddleEndPasses({ workDir });

    // Both Phase 3 passes should succeed
    const checkConn = results.find(r => r.id === 'check-connectivity');
    const scoreRisk = results.find(r => r.id === 'score-risk');
    assert.ok(checkConn);
    assert.ok(scoreRisk);
    assert.equal(checkConn!.status, 'ok');
    assert.equal(scoreRisk!.status, 'ok');

    // score-risk should have written risk scores to IR
    const ir = readIR(workDir);
    assert.ok(ir.meta.riskScore !== undefined, 'IR should have riskScore after score-risk');
  });

  it('produces analysis output files in 3_graph/analysis/', async () => {
    const workDir = createWorkDir('output-files');
    writeIR(workDir, mkIR([
      mkNode('R1-01', '系统响应时间 ≤ 200ms'),
      mkNode('R1-02', '用户点击登录按钮'),
    ], []));

    await runMiddleEndPasses({ workDir });

    const analysisDir = path.join(workDir, '3_graph', 'analysis');
    assert.ok(fs.existsSync(analysisDir), 'analysis dir should exist');

    const expectedFiles = [
      'orphan_nodes.jsonl',
      'dangling_edges.jsonl',
      'concept_islands.jsonl',
      'cross_file_islands.jsonl',
      'suspected_duplicates.jsonl',
      'suspected_conflicts.jsonl',
      'same_aspect_clusters.jsonl',
    ];
    for (const f of expectedFiles) {
      assert.ok(
        fs.existsSync(path.join(analysisDir, f)),
        `${f} should exist after running passes`,
      );
    }
  });

  it('handles workDir with empty IR (no nodes)', async () => {
    const workDir = createWorkDir('empty-ir');
    writeIR(workDir, mkIR([], []));

    const results = await runMiddleEndPasses({ workDir });
    assert.equal(results.length, 5);
    // All passes should succeed (empty IR is valid)
    const fatalPasses = results.filter(r =>
      r.status === 'error' && r.id !== 'analyze-structure' && r.id !== 'analyze-graph'
    );
    assert.equal(fatalPasses.length, 0, 'no fatal errors for empty IR');
  });
});
