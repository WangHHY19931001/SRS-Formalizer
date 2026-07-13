import { describe, it, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { SRSIR } from '../types/srs-ir.js';
import { LeanGraphEmitter } from '../lib/emitters/lean-graph-emitter.js';

const TMP = path.join(os.tmpdir(), `srs-lean-${Date.now()}`);

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

function setup(leanContent: string): string {
  const wd = path.join(TMP, '.srs_formalizer');
  fs.mkdirSync(path.join(wd, 'outputs', 'lean4', 'verified'), { recursive: true });
  fs.mkdirSync(path.join(wd, 'outputs', 'graphs'), { recursive: true });
  fs.writeFileSync(path.join(wd, 'outputs', 'lean4', 'verified', 'defs.lean'), leanContent, 'utf-8');
  return wd;
}

const BASIC_LEAN = `import Mathlib.Data.Nat.Basic
import Mathlib.Tactic

lemma add_zero (n : Nat) : n + 0 = n := by
  simp

lemma zero_add (n : Nat) : 0 + n = n := by
  simp

theorem add_comm (n m : Nat) : n + m = m + n :=
  calc
    n + m = m + n := sorry
`;

const LEAN_WITH_AXIOMS = `import Mathlib.Data.Real.Basic

axiom excluded_middle (p : Prop) : p ∨ ¬p :=

lemma foo (x : Nat) : x = x := by
  rfl
`;

describe('LeanGraphEmitter', () => {
  const emitter = new LeanGraphEmitter();
  after(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it('errors gracefully when proofs dir is missing', () => {
    const wd = path.join(TMP, '.srs_formalizer_missing');
    fs.mkdirSync(wd, { recursive: true });
    const result = emitter.emit(makeIR(), wd);
    assert.equal(result.fileCount, 0);
    fs.rmSync(wd, { recursive: true, force: true });
  });

  it('produces JSON and Cypher output', () => {
    const wd = setup(BASIC_LEAN);
    const result = emitter.emit(makeIR(), wd);
    assert.equal(result.fileCount, 2);
    assert.ok(result.files.some(f => f.endsWith('.json')));
    assert.ok(result.files.some(f => f.endsWith('.cypher')));
  });

  it('JSON contains Theorem node', () => {
    const wd = setup(BASIC_LEAN);
    const result = emitter.emit(makeIR(), wd);
    const jsonFile = result.files.find(f => f.endsWith('.json'))!;
    const json = JSON.parse(fs.readFileSync(jsonFile, 'utf-8')) as Record<string, unknown>;
    const nodes = json.nodes as Array<Record<string, unknown>>;
    const theorems = nodes.filter(n => (n.labels as string[]).includes('Theorem'));
    assert.equal(theorems.length, 1);
    assert.equal((theorems[0]!.properties as Record<string, unknown>).name, 'add_comm');
  });

  it('JSON contains Lemma nodes', () => {
    const wd = setup(BASIC_LEAN);
    const result = emitter.emit(makeIR(), wd);
    const jsonFile = result.files.find(f => f.endsWith('.json'))!;
    const json = JSON.parse(fs.readFileSync(jsonFile, 'utf-8')) as Record<string, unknown>;
    const nodes = json.nodes as Array<Record<string, unknown>>;
    const lemmas = nodes.filter(n => (n.labels as string[]).includes('Lemma'));
    assert.equal(lemmas.length, 2);
  });

  it('JSON contains Import nodes', () => {
    const wd = setup(BASIC_LEAN);
    const result = emitter.emit(makeIR(), wd);
    const jsonFile = result.files.find(f => f.endsWith('.json'))!;
    const json = JSON.parse(fs.readFileSync(jsonFile, 'utf-8')) as Record<string, unknown>;
    const nodes = json.nodes as Array<Record<string, unknown>>;
    const imports = nodes.filter(n => (n.labels as string[]).includes('Import'));
    assert.equal(imports.length, 2);
  });

  it('JSON contains DEPENDS_ON edges for theorem-lemma relations', () => {
    const wd = setup(BASIC_LEAN);
    const result = emitter.emit(makeIR(), wd);
    const jsonFile = result.files.find(f => f.endsWith('.json'))!;
    const json = JSON.parse(fs.readFileSync(jsonFile, 'utf-8')) as Record<string, unknown>;
    const edges = json.edges as Array<Record<string, unknown>>;
    const importsEdges = edges.filter(e => e.type === 'IMPORTS');
    assert.ok(importsEdges.length >= 2, `Expected >=2 IMPORTS edges, got ${importsEdges.length}`);
  });

  it('JSON contains Axiom nodes when axioms present', () => {
    const wd = setup(LEAN_WITH_AXIOMS);
    const result = emitter.emit(makeIR(), wd);
    const jsonFile = result.files.find(f => f.endsWith('.json'))!;
    const json = JSON.parse(fs.readFileSync(jsonFile, 'utf-8')) as Record<string, unknown>;
    const nodes = json.nodes as Array<Record<string, unknown>>;
    const axioms = nodes.filter(n => (n.labels as string[]).includes('Axiom'));
    assert.equal(axioms.length, 1);
  });

  it('detects sorry in source', () => {
    const wd = setup(BASIC_LEAN);
    const result = emitter.emit(makeIR(), wd);
    assert.equal(result.metadata.sorry_count, 1);
  });

  it('Cypher output contains CREATE statements', () => {
    const wd = setup(BASIC_LEAN);
    const result = emitter.emit(makeIR(), wd);
    const cypherFile = result.files.find(f => f.endsWith('.cypher'))!;
    const content = fs.readFileSync(cypherFile, 'utf-8');
    assert.ok(content.includes('CREATE ('));
    assert.ok(content.includes('Lean 4 Proof Dependency Graph'));
  });
});
