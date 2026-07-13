import { describe, it, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { SRSIR } from '../types/srs-ir.js';
import { BehaviorGraphEmitter } from '../lib/emitters/behavior-graph-emitter.js';

const TMP = path.join(os.tmpdir(), `srs-bgraph-${Date.now()}`);

function makeIR(): SRSIR {
  return {
    version: '2.0.0',
    meta: {
      sourcePath: '/test', sourceHash: 'abc123', language: 'en',
      totalChars: 1000, totalShards: 3, totalNodes: 2, totalEdges: 0,
      buildTimestamp: new Date().toISOString(),
    },
    nodes: [
      {
        id: 'REQ-login',
        type: 'requirement',
        module: 'security.html',
        labels: [':Requirement'],
        properties: { statement: 'System shall authenticate users', category: 'explicit', confidence: 'high' },
        source: { filePath: 'security.html', startLine: 5, endLine: 10, shardId: 's1', chapter: 'Security' },
      },
      {
        id: 'NFR-perf',
        type: 'nfr',
        module: 'perf.html',
        labels: [':NFR'],
        properties: { statement: 'Login < 1s', nfrCategory: 'performance' },
        source: { filePath: 'perf.html', startLine: 1, endLine: 3, shardId: 's2', chapter: 'Performance' },
      },
    ],
    edges: [
      {
        id: 'e-nfr',
        source: 'NFR-perf',
        target: 'REQ-login',
        type: 'nfr_impacts',
        properties: {},
      },
    ],
    crossRefs: [],
    nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] },
    gaps: [],
    glossary: [],
  };
}

function setup(featureContent: string): string {
  const wd = path.join(TMP, '.srs_formalizer');
  fs.mkdirSync(path.join(wd, 'outputs', 'bdd', 'verified'), { recursive: true });
  fs.mkdirSync(path.join(wd, 'outputs', 'graphs'), { recursive: true });
  fs.writeFileSync(path.join(wd, 'outputs', 'bdd', 'verified', 'login.feature'), featureContent, 'utf-8');
  return wd;
}

const FEATURE_CONTENT = `# SYSTEM: Auth
# TRACE: SEC-001
Feature: User Authentication

Scenario: Valid user logs in
  # verification: REQ-login
  Given a registered user with valid credentials
  When the user submits login form
  Then the system returns auth token

Scenario: Invalid user rejected
  Given an unregistered user
  When the user submits login form
  Then the system returns 401
`;

describe('BehaviorGraphEmitter', () => {
  const emitter = new BehaviorGraphEmitter();
  after(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it('errors gracefully when features dir is missing', () => {
    const wd = path.join(TMP, '.srs_formalizer_missing');
    fs.mkdirSync(wd, { recursive: true });
    const result = emitter.emit(makeIR(), wd);
    assert.equal(result.fileCount, 0);
    assert.ok(result.metadata);
    fs.rmSync(wd, { recursive: true, force: true });
  });

  it('produces JSON and Cypher output', () => {
    const wd = setup(FEATURE_CONTENT);
    const ir = makeIR();
    const result = emitter.emit(ir, wd);
    assert.equal(result.fileCount, 2);
    assert.ok(result.files.some(f => f.endsWith('.json')));
    assert.ok(result.files.some(f => f.endsWith('.cypher')));
  });

  it('JSON contains Feature node', () => {
    const wd = setup(FEATURE_CONTENT);
    const ir = makeIR();
    const result = emitter.emit(ir, wd);
    const jsonFile = result.files.find(f => f.endsWith('.json'))!;
    const json = JSON.parse(fs.readFileSync(jsonFile, 'utf-8')) as Record<string, unknown>;
    assert.equal(json.version, '1.0');
    const nodes = json.nodes as Array<Record<string, unknown>>;
    const featureNode = nodes.find(n => (n.labels as string[]).includes('Feature'));
    assert.ok(featureNode);
    assert.equal((featureNode.properties as Record<string, unknown>).name, 'User Authentication');
  });

  it('JSON contains Scenario nodes', () => {
    const wd = setup(FEATURE_CONTENT);
    const ir = makeIR();
    const result = emitter.emit(ir, wd);
    const jsonFile = result.files.find(f => f.endsWith('.json'))!;
    const json = JSON.parse(fs.readFileSync(jsonFile, 'utf-8')) as Record<string, unknown>;
    const nodes = json.nodes as Array<Record<string, unknown>>;
    const scenarios = nodes.filter(n => (n.labels as string[]).includes('Scenario'));
    assert.equal(scenarios.length, 2);
  });

  it('JSON contains Action nodes for Given/When/Then', () => {
    const wd = setup(FEATURE_CONTENT);
    const ir = makeIR();
    const result = emitter.emit(ir, wd);
    const jsonFile = result.files.find(f => f.endsWith('.json'))!;
    const json = JSON.parse(fs.readFileSync(jsonFile, 'utf-8')) as Record<string, unknown>;
    const nodes = json.nodes as Array<Record<string, unknown>>;
    const actions = nodes.filter(n => (n.labels as string[]).includes('Action'));
    assert.ok(actions.length >= 5, `Expected >=5 actions, got ${actions.length}`);
  });

  it('JSON contains VERIFIES edge for requirement ref', () => {
    const wd = setup(FEATURE_CONTENT);
    const ir = makeIR();
    const result = emitter.emit(ir, wd);
    const jsonFile = result.files.find(f => f.endsWith('.json'))!;
    const json = JSON.parse(fs.readFileSync(jsonFile, 'utf-8')) as Record<string, unknown>;
    const edges = json.edges as Array<Record<string, unknown>>;
    const verifies = edges.filter(e => e.type === 'VERIFIES');
    assert.ok(verifies.length >= 1);
  });

  it('JSON contains DEPENDS_ON edge between scenarios', () => {
    const wd = setup(FEATURE_CONTENT);
    const ir = makeIR();
    const result = emitter.emit(ir, wd);
    const jsonFile = result.files.find(f => f.endsWith('.json'))!;
    const json = JSON.parse(fs.readFileSync(jsonFile, 'utf-8')) as Record<string, unknown>;
    const edges = json.edges as Array<Record<string, unknown>>;
    const depends = edges.filter(e => e.type === 'DEPENDS_ON');
    assert.ok(depends.length >= 1);
  });

  it('Cypher output contains CREATE statements', () => {
    const wd = setup(FEATURE_CONTENT);
    const ir = makeIR();
    const result = emitter.emit(ir, wd);
    const cypherFile = result.files.find(f => f.endsWith('.cypher'))!;
    const content = fs.readFileSync(cypherFile, 'utf-8');
    assert.ok(content.includes('CREATE ('));
    assert.ok(content.includes('System Behavior Graph'));
  });

  it('metadata reflects feature and scenario counts', () => {
    const wd = setup(FEATURE_CONTENT);
    const ir = makeIR();
    const result = emitter.emit(ir, wd);
    assert.equal(result.metadata.feature_count, 1);
    assert.equal(result.metadata.scenario_count, 2);
  });
});
