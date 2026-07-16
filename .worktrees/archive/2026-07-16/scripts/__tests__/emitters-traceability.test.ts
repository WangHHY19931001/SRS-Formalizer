import { describe, it, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { SRSIR } from '../types/srs-ir.js';
import { TraceabilityMatrixEmitter } from '../lib/emitters/traceability-emitter.js';

const TMP = path.join(os.tmpdir(), `srs-trace-emitter-${Date.now()}`);

function makeIR(): SRSIR {
  return {
    version: '2.0.0',
    meta: {
      sourcePath: '/test', sourceHash: 'abc', language: 'en',
      totalChars: 100, totalShards: 1, totalNodes: 3, totalEdges: 2,
      buildTimestamp: new Date().toISOString(),
    },
    nodes: [
      {
        id: 'R1-01',
        type: 'requirement',
        module: '用户',
        labels: [':Requirement'],
        properties: { statement: '用户应能登录', category: 'explicit', confidence: 'high' },
        source: { filePath: 'spec.html', startLine: 1, endLine: 2, shardId: 's1', chapter: 'Login' },
      },
      {
        id: 'R1-02',
        type: 'requirement',
        module: '用户',
        labels: [':Requirement'],
        properties: { statement: '用户应能注销', category: 'explicit', confidence: 'high' },
        source: { filePath: 'spec.html', startLine: 3, endLine: 4, shardId: 's1', chapter: 'Logout' },
      },
    ],
    edges: [
      { id: 'e1', source: 'R1-01', target: 'R1-02', type: 'depends_on', properties: {} },
    ],
    crossRefs: [],
    nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] },
    gaps: [],
    glossary: [],
  };
}

function setupArtifacts(wd: string) {
  fs.mkdirSync(path.join(wd, 'outputs', 'bdd', 'verified'), { recursive: true });
  fs.mkdirSync(path.join(wd, 'outputs', 'tlaplus', 'verified'), { recursive: true });
  fs.mkdirSync(path.join(wd, 'outputs', 'lean4', 'verified'), { recursive: true });
  fs.mkdirSync(path.join(wd, 'outputs', 'fixtures', 'unit', 'pytest'), { recursive: true });

  fs.writeFileSync(path.join(wd, 'outputs', 'bdd', 'verified', 'login.feature'), `Feature: Login
  Scenario: R1-01: Valid login
    Given a user
    When they log in
    Then they are authenticated
`);

  fs.writeFileSync(path.join(wd, 'outputs', 'tlaplus', 'verified', 'Login.tla'), `---- MODULE Login ----
Inv == TRUE
TypeOK == TRUE
====
`);

  fs.writeFileSync(path.join(wd, 'outputs', 'lean4', 'verified', 'auth.lean'), `theorem login_invariant : True := by trivial
`);

  fs.writeFileSync(path.join(wd, 'outputs', 'fixtures', 'unit', 'pytest', 'test_login.py'), '# fixture');
}

describe('TraceabilityMatrixEmitter', () => {
  const emitter = new TraceabilityMatrixEmitter();
  after(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it('has correct name and description', () => {
    assert.equal(emitter.name, 'traceabilityMatrix');
    assert.ok(emitter.description.length > 0);
  });

  it('generates traceability.md and traceability.cypher', () => {
    const wd = path.join(TMP, '.srs_formalizer_t1');
    fs.mkdirSync(wd, { recursive: true });
    setupArtifacts(wd);
    const ir = makeIR();
    const result = emitter.emit(ir, wd);
    assert.equal(result.fileCount, 2);
    const mdExists = result.files.some(f => f.endsWith('traceability.md'));
    const cypherExists = result.files.some(f => f.endsWith('traceability.cypher'));
    assert.ok(mdExists);
    assert.ok(cypherExists);
  });

  it('writes to outputs/reports/ directory', () => {
    const wd = path.join(TMP, '.srs_formalizer_t2');
    fs.mkdirSync(wd, { recursive: true });
    setupArtifacts(wd);
    const ir = makeIR();
    const result = emitter.emit(ir, wd);
    for (const f of result.files) {
      assert.ok(f.includes(path.join('outputs', 'reports')));
    }
  });

  it('produces valid markdown table', () => {
    const wd = path.join(TMP, '.srs_formalizer_t3');
    fs.mkdirSync(wd, { recursive: true });
    setupArtifacts(wd);
    const ir = makeIR();
    const result = emitter.emit(ir, wd);
    const mdPath = result.files.find(f => f.endsWith('.md'));
    assert.ok(mdPath);
    const content = fs.readFileSync(mdPath!, 'utf-8');
    assert.ok(content.includes('R1-01'));
    assert.ok(content.includes('需求ID'));
    assert.ok(content.includes('V-Model Traceability Matrix'));
  });

  it('produces valid Cypher with TRACES_TO edges', () => {
    const wd = path.join(TMP, '.srs_formalizer_t4');
    fs.mkdirSync(wd, { recursive: true });
    setupArtifacts(wd);
    const ir = makeIR();
    const result = emitter.emit(ir, wd);
    const cypherPath = result.files.find(f => f.endsWith('.cypher'));
    assert.ok(cypherPath);
    const content = fs.readFileSync(cypherPath!, 'utf-8');
    assert.ok(content.includes('VERIFIED_BY_BDD') || content.includes('VERIFIED_BY_TLA') || content.includes('VERIFIED_BY_LEAN'));
    assert.ok(content.includes('TESTED_BY'));
  });

  it('returns metadata with requirement count and coverage', () => {
    const wd = path.join(TMP, '.srs_formalizer_t5');
    fs.mkdirSync(wd, { recursive: true });
    setupArtifacts(wd);
    const ir = makeIR();
    const result = emitter.emit(ir, wd);
    assert.equal(result.metadata.totalRequirements, 2);
    assert.ok(typeof result.metadata.coverage === 'object');
    assert.equal(result.metadata.dimensions, 5);
  });

  it('works with empty workdir (no artifacts)', () => {
    const wd = path.join(TMP, '.srs_formalizer_t6');
    fs.mkdirSync(wd, { recursive: true });
    const ir = makeIR();
    const result = emitter.emit(ir, wd);
    assert.equal(result.fileCount, 2);
  });

  it('works with empty IR', () => {
    const wd = path.join(TMP, '.srs_formalizer_t7');
    fs.mkdirSync(wd, { recursive: true });
    const empty: SRSIR = {
      version: '2.0.0',
      meta: {
        sourcePath: '/empty', sourceHash: '', language: 'en',
        totalChars: 0, totalShards: 0, totalNodes: 0, totalEdges: 0,
        buildTimestamp: new Date().toISOString(),
      },
      nodes: [], edges: [], crossRefs: [],
      nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] },
      gaps: [], glossary: [],
    };
    const result = emitter.emit(empty, wd);
    assert.equal(result.fileCount, 2);
  });
});
