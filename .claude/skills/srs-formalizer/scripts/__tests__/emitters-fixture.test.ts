import { describe, it, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { SRSIR } from '../types/srs-ir.js';
import { FixtureEmitter } from '../lib/emitters/fixture-emitter.js';

const TMP = path.join(os.tmpdir(), `srs-fixture-emitter-${Date.now()}`);

function makeIR(overrides?: Partial<SRSIR>): SRSIR {
  return {
    version: '2.0.0',
    meta: {
      sourcePath: '/test',
      sourceHash: 'abc',
      language: 'en',
      totalChars: 100,
      totalShards: 1,
      totalNodes: 3,
      totalEdges: 1,
      buildTimestamp: new Date().toISOString(),
    },
    nodes: [
      {
        id: 'R1',
        type: 'requirement',
        module: 'login',
        labels: [':Requirement'],
        properties: { statement: 'Login', category: 'explicit', confidence: 'high' },
        source: { filePath: 'spec.html', startLine: 1, endLine: 2, shardId: 's1', chapter: 'Intro' },
      },
      {
        id: 'N1',
        type: 'nfr',
        module: 'login',
        labels: [':NFR'],
        properties: { statement: 'Response < 200ms', nfrCategory: 'performance', nfrThreshold: { metric: 'latency', value: 200, unit: 'ms', operator: '<' } },
        source: { filePath: 'spec.html', startLine: 3, endLine: 4, shardId: 's1', chapter: 'Intro' },
      },
      {
        id: 'N2',
        type: 'nfr',
        module: 'login',
        labels: [':NFR'],
        properties: { statement: 'Must be secure', nfrCategory: 'security' },
        source: { filePath: 'spec.html', startLine: 5, endLine: 6, shardId: 's1', chapter: 'Intro' },
      },
    ],
    edges: [
      {
        id: 'e1',
        source: 'N1',
        target: 'R1',
        type: 'nfr_constrains',
        properties: {},
      },
    ],
    crossRefs: [],
    nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] },
    gaps: [],
    glossary: [],
    ...overrides,
  };
}

function setup(wd: string) {
  fs.mkdirSync(path.join(wd, 'outputs', 'bdd', 'verified'), { recursive: true });
  fs.mkdirSync(path.join(wd, 'outputs', 'tlaplus', 'verified'), { recursive: true });
  fs.mkdirSync(path.join(wd, 'outputs', 'lean4', 'verified'), { recursive: true });

  fs.writeFileSync(path.join(wd, 'outputs', 'bdd', 'verified', 'login.feature'), `Feature: Login
  Scenario: R1-01: Valid login
    Given a registered user
    When they enter correct credentials
    Then they are authenticated
`);

  fs.writeFileSync(path.join(wd, 'outputs', 'tlaplus', 'verified', 'LoginModule.tla'), `---- MODULE LoginModule ----
VARIABLES authenticated
Init == authenticated = FALSE
Next == authenticated' = TRUE
TypeOK == authenticated \in BOOLEAN
====
`);

  fs.writeFileSync(path.join(wd, 'outputs', 'lean4', 'verified', 'auth.lean'), `import Mathlib
theorem auth_invariant (b : Bool) : b || !b := by
  simp
`);
}

describe('FixtureEmitter', () => {
  const emitter = new FixtureEmitter();
  after(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it('has correct name and description', () => {
    assert.equal(emitter.name, 'fixture');
    assert.ok(emitter.description.length > 0);
  });

  it('generates BDD fixtures at unit level', () => {
    const wd = path.join(TMP, '.srs_formalizer_1');
    setup(wd);
    const ir = makeIR();
    const result = emitter.emit(ir, wd, { level: 'unit', framework: 'pytest' });
    assert.ok(result.fileCount > 0);
    assert.ok(result.files.some(f => f.includes('test_login.py')));
  });

  it('generates TLA+ fixtures at integration level', () => {
    const wd = path.join(TMP, '.srs_formalizer_2');
    setup(wd);
    const ir = makeIR();
    const result = emitter.emit(ir, wd, { level: 'integration', framework: 'pytest' });
    assert.ok(result.fileCount > 0);
    assert.ok(result.files.some(f => f.includes('LoginModule')));
  });

  it('generates Lean 4 fixtures at unit level', () => {
    const wd = path.join(TMP, '.srs_formalizer_3');
    setup(wd);
    const ir = makeIR();
    const result = emitter.emit(ir, wd, { level: 'unit', framework: 'pytest' });
    assert.ok(result.fileCount > 0);
    assert.ok(result.files.some(f => f.includes('properties') || f.includes('auth')));
  });

  it('generates NFR fixtures at nfr level', () => {
    const wd = path.join(TMP, '.srs_formalizer_4');
    setup(wd);
    const ir = makeIR();
    const result = emitter.emit(ir, wd, { level: 'nfr', framework: 'pytest' });
    assert.ok(result.fileCount > 0);
    assert.ok(result.files.some(f => f.includes('nfr') && f.includes('performance')));
  });

  it('respects junit framework output format', () => {
    const wd = path.join(TMP, '.srs_formalizer_5');
    setup(wd);
    const ir = makeIR();
    const result = emitter.emit(ir, wd, { level: 'nfr', framework: 'junit' });
    assert.ok(result.fileCount > 0);
    assert.ok(result.files.every(f => f.endsWith('.java')));
  });

  it('respects fast-check framework output format', () => {
    const wd = path.join(TMP, '.srs_formalizer_6');
    setup(wd);
    const ir = makeIR();
    const result = emitter.emit(ir, wd, { level: 'nfr', framework: 'fast-check' });
    assert.ok(result.fileCount > 0);
    assert.ok(result.files.every(f => f.endsWith('.ts')));
  });

  it('works with shallow SRSIR (no BDD/TLA/Lean dirs)', () => {
    const wd = path.join(TMP, '.srs_formalizer_7');
    fs.mkdirSync(wd, { recursive: true });
    const ir = makeIR({ nodes: [] });
    const result = emitter.emit(ir, wd, { level: 'unit', framework: 'pytest' });
    assert.equal(result.fileCount, 0);
  });

  it('returns metadata with level and framework', () => {
    const wd = path.join(TMP, '.srs_formalizer_8');
    setup(wd);
    const ir = makeIR();
    const result = emitter.emit(ir, wd, { level: 'nfr', framework: 'pytest' });
    assert.equal(result.metadata.level, 'nfr');
    assert.equal(result.metadata.framework, 'pytest');
  });
});
