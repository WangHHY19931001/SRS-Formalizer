import { describe, it, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { SRSIR } from '../types/srs-ir.js';
import { TlaGraphEmitter } from '../lib/emitters/tla-graph-emitter.js';

const TMP = path.join(os.tmpdir(), `srs-tla-${Date.now()}`);

function makeIR(): SRSIR {
  return {
    version: '2.0.0',
    meta: {
      sourcePath: '/test', sourceHash: 'abc', language: 'en',
      totalChars: 100, totalShards: 1, totalNodes: 0, totalEdges: 0,
      buildTimestamp: new Date().toISOString(),
    },
    nodes: [], edges: [], crossRefs: [],
    nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] },
    gaps: [], glossary: [],
  };
}

function setup(tlaContent: string): string {
  const wd = path.join(TMP, '.srs_formalizer');
  fs.mkdirSync(path.join(wd, 'outputs', 'tlaplus', 'verified'), { recursive: true });
  fs.mkdirSync(path.join(wd, 'outputs', 'graphs'), { recursive: true });
  fs.writeFileSync(path.join(wd, 'outputs', 'tlaplus', 'verified', 'Test.tla'), tlaContent, 'utf-8');
  return wd;
}

const BASIC_TLA = `---- MODULE Test ----
CONSTANTS Server
VARIABLES x, y

Init == x = 0

Increment == x' = x + 1

Decrement == x' = x - 1

InvPositive == x >= 0

INVARIANT InvPositive
====
`;

const TLA_WITH_HIERARCHY = `---- MODULE PaymentSystem ----
\\* 上级: CoreSystem
\\* 同级: AuthSystem ReportingSystem
\\* 下级: PaymentGateway
CONSTANTS Gateway

Init == x = 0
Next == x' = x + 1
====
`;

describe('TlaGraphEmitter', () => {
  const emitter = new TlaGraphEmitter();
  after(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it('errors gracefully when specs dir is missing', () => {
    const wd = path.join(TMP, '.srs_formalizer_missing');
    fs.mkdirSync(wd, { recursive: true });
    const result = emitter.emit(makeIR(), wd);
    assert.equal(result.fileCount, 0);
    fs.rmSync(wd, { recursive: true, force: true });
  });

  it('produces JSON and Cypher output', () => {
    const wd = setup(BASIC_TLA);
    const result = emitter.emit(makeIR(), wd);
    assert.equal(result.fileCount, 2);
    assert.ok(result.files.some(f => f.endsWith('.json')));
    assert.ok(result.files.some(f => f.endsWith('.cypher')));
  });

  it('JSON contains System node', () => {
    const wd = setup(BASIC_TLA);
    const result = emitter.emit(makeIR(), wd);
    const jsonFile = result.files.find(f => f.endsWith('.json'))!;
    const json = JSON.parse(fs.readFileSync(jsonFile, 'utf-8')) as Record<string, unknown>;
    const nodes = json.nodes as Array<Record<string, unknown>>;
    const sysNode = nodes.find(n => (n.labels as string[]).includes('System'));
    assert.ok(sysNode);
    assert.equal((sysNode.properties as Record<string, unknown>).name, 'Test');
  });

  it('JSON contains Action nodes', () => {
    const wd = setup(BASIC_TLA);
    const result = emitter.emit(makeIR(), wd);
    const jsonFile = result.files.find(f => f.endsWith('.json'))!;
    const json = JSON.parse(fs.readFileSync(jsonFile, 'utf-8')) as Record<string, unknown>;
    const nodes = json.nodes as Array<Record<string, unknown>>;
    const actions = nodes.filter(n => (n.labels as string[]).includes('Action'));
    assert.ok(actions.length >= 2, `Expected >=2 actions, got ${actions.length}`);
  });

  it('JSON contains Invariant node', () => {
    const wd = setup(BASIC_TLA);
    const result = emitter.emit(makeIR(), wd);
    const jsonFile = result.files.find(f => f.endsWith('.json'))!;
    const json = JSON.parse(fs.readFileSync(jsonFile, 'utf-8')) as Record<string, unknown>;
    const nodes = json.nodes as Array<Record<string, unknown>>;
    const invariants = nodes.filter(n => (n.labels as string[]).includes('Invariant'));
    assert.ok(invariants.length >= 1, `Expected >=1 invariant, got ${invariants.length}`);
  });

  it('JSON contains ExternalActor node for CONSTANTS', () => {
    const wd = setup(BASIC_TLA);
    const result = emitter.emit(makeIR(), wd);
    const jsonFile = result.files.find(f => f.endsWith('.json'))!;
    const json = JSON.parse(fs.readFileSync(jsonFile, 'utf-8')) as Record<string, unknown>;
    const nodes = json.nodes as Array<Record<string, unknown>>;
    const actors = nodes.filter(n => (n.labels as string[]).includes('ExternalActor'));
    assert.ok(actors.length >= 1, `Expected >=1 ExternalActor, got ${actors.length}`);
  });

  it('JSON contains hierarchy edges from parent/child annotations', () => {
    const wd = setup(TLA_WITH_HIERARCHY);
    const result = emitter.emit(makeIR(), wd);
    const jsonFile = result.files.find(f => f.endsWith('.json'))!;
    const json = JSON.parse(fs.readFileSync(jsonFile, 'utf-8')) as Record<string, unknown>;
    const edges = json.edges as Array<Record<string, unknown>>;
    const decEdges = edges.filter(e => e.type === 'DECOMPOSES_INTO' || e.type === 'INTERACTS_WITH');
    assert.ok(decEdges.length >= 2, `Expected >=2 hierarchy edges, got ${decEdges.length}`);
  });

  it('Cypher output contains CREATE statements', () => {
    const wd = setup(BASIC_TLA);
    const result = emitter.emit(makeIR(), wd);
    const cypherFile = result.files.find(f => f.endsWith('.cypher'))!;
    const content = fs.readFileSync(cypherFile, 'utf-8');
    assert.ok(content.includes('CREATE ('));
    assert.ok(content.includes('TLA+ System Interaction Graph'));
  });
});
