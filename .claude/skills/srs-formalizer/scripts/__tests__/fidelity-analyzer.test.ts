import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  analyzeReqToBdd, analyzeReqBddToTla, analyzeToLean, buildFidelityReport, extractNumbers,
  type BddScenario, type TlaModule, type LeanTheorem, type NodeScenarioIndex,
} from '../lib/fidelity/analyzer.js';
import type { SRSIR, IRNode } from '../types/srs-ir.js';

function ir(nodes: Partial<IRNode>[], detected: string[] = []): SRSIR {
  return {
    version: '2.0.0',
    meta: { sourcePath: '', sourceHash: '', language: 'zh', totalChars: 0, totalShards: 0, totalNodes: nodes.length, totalEdges: 0, buildTimestamp: '' },
    nodes: nodes.map((n, i) => ({ id: n.id ?? `R1-S001-${i}`, type: n.type ?? 'requirement', module: 'm', labels: [], properties: n.properties ?? {}, source: { filePath: 'f', startLine: 1, endLine: 1, shardId: 'S001', chapter: '' }, ...n })) as IRNode[],
    edges: [], crossRefs: [],
    nfrProfile: { detectedCategories: detected.map(c => ({ category: c as never, keywordHits: 1, shardIds: [], nodeIds: [] })), weightedShards: [], overallCoverage: 0, blindSpots: [] },
    gaps: [], glossary: [],
  };
}

function scenario(text: string, over: Partial<BddScenario> = {}): BddScenario {
  return { feature: 'f', name: 's', rids: [], text, hasNegation: false, numbers: extractNumbers(text), ...over };
}

describe('fidelity Q1 — 需求 → BDD', () => {
  it('flags a coverage gap as error for safety-critical requirements', () => {
    const model = ir([{ id: 'R1-S001-1', properties: { statement: '用户登录鉴权', formalizationPriority: 'safety-critical' } }]);
    const findings = analyzeReqToBdd(model, new Map());
    assert.ok(findings.some(f => f.kind === 'coverage-gap' && f.severity === 'error' && f.subject === 'R1-S001-1'));
  });

  it('flags negation-drop when a prohibition has no negative scenario', () => {
    const model = ir([{ id: 'R1-S001-1', properties: { statement: '未授权用户不得访问资源' } }]);
    const index: NodeScenarioIndex = new Map([['R1-S001-1', [scenario('Given a user\nWhen access\nThen 返回数据')]]]);
    const findings = analyzeReqToBdd(model, index);
    assert.ok(findings.some(f => f.kind === 'negation-drop' && f.severity === 'error'));
  });

  it('does not flag negation-drop when a negative assertion exists', () => {
    const model = ir([{ id: 'R1-S001-1', properties: { statement: '未授权用户不得访问资源' } }]);
    const index: NodeScenarioIndex = new Map([['R1-S001-1', [scenario('Then 请求返回 403\nAnd 资源内容 does not appear', { hasNegation: true })]]]);
    const findings = analyzeReqToBdd(model, index);
    assert.ok(!findings.some(f => f.kind === 'negation-drop'));
  });

  it('flags threshold-drop when an NFR threshold is absent from scenarios', () => {
    const model = ir([{ id: 'R1-S001-1', type: 'nfr', properties: { statement: '响应时间约束', nfrThreshold: { metric: 'latency', value: 200, unit: 'ms', operator: '<=' } } }]);
    const index: NodeScenarioIndex = new Map([['R1-S001-1', [scenario('Then 响应正常')]]]);
    const findings = analyzeReqToBdd(model, index);
    assert.ok(findings.some(f => f.kind === 'threshold-drop'));
  });

  it('passes when the threshold value appears in a scenario', () => {
    const model = ir([{ id: 'R1-S001-1', type: 'nfr', properties: { statement: '响应时间约束延迟', nfrThreshold: { metric: 'latency', value: 200, unit: 'ms', operator: '<=' } } }]);
    const index: NodeScenarioIndex = new Map([['R1-S001-1', [scenario('Then 响应时间约束延迟 <= 200 ms')]]]);
    const findings = analyzeReqToBdd(model, index);
    assert.ok(!findings.some(f => f.kind === 'threshold-drop'));
  });
});

describe('fidelity Q2 — 需求 + BDD → TLA+', () => {
  const tla = (over: Partial<TlaModule> = {}): TlaModule => ({ name: 'M', invariantNames: [], actionCount: 5, constants: [], numbers: [], body: '', ...over });

  it('flags a missing NFR invariant (anti-weakening)', () => {
    const model = ir([{ properties: { statement: 'x' } }], ['security']);
    const findings = analyzeReqBddToTla(model, [tla({ invariantNames: ['PerfLatencyInv'] })], new Set(), 1);
    assert.ok(findings.some(f => f.kind === 'nfr-invariant-missing' && f.subject === 'security'));
  });

  it('flags a threshold simplified away', () => {
    const model = ir([{ type: 'nfr', properties: { statement: 'x', nfrThreshold: { metric: 'm', value: 500, unit: 'ms', operator: '<=' } } }]);
    const findings = analyzeReqBddToTla(model, [tla({ numbers: ['3'] })], new Set(), 1);
    assert.ok(findings.some(f => f.kind === 'threshold-simplified-away' && f.subject === '500'));
  });

  it('keeps a threshold that survived into TLA constants', () => {
    const model = ir([{ type: 'nfr', properties: { statement: 'x', nfrThreshold: { metric: 'm', value: 500, unit: 'ms', operator: '<=' } } }]);
    const findings = analyzeReqBddToTla(model, [tla({ numbers: ['500'] })], new Set(), 1);
    assert.ok(!findings.some(f => f.kind === 'threshold-simplified-away'));
  });

  it('flags de-hierarchization when many layers collapse to few actions', () => {
    const model = ir([{ properties: { statement: 'x' } }]);
    const findings = analyzeReqBddToTla(model, [tla({ actionCount: 2 })], new Set(), 6);
    assert.ok(findings.some(f => f.kind === 'de-hierarchization'));
  });
});

describe('fidelity Q3 — 需求 + BDD + TLA → Lean4', () => {
  it('flags proof-missing when triggered requirements have no theorem', () => {
    const model = ir([{ properties: { statement: 'data encryption at rest' } }]);
    const findings = analyzeToLean(model, [], true);
    assert.ok(findings.some(f => f.kind === 'proof-missing'));
  });

  it('flags proof-drift when no theorem shares vocabulary', () => {
    const model = ir([{ id: 'R1-S001-1', properties: { statement: 'encryption authorization boundary' } }]);
    const thm: LeanTheorem = { file: 'A.lean', name: 't', signature: 'foo : Nat = Nat', tokens: new Set(['foo', 'nat']) };
    const findings = analyzeToLean(model, [thm], true);
    assert.ok(findings.some(f => f.kind === 'proof-drift'));
  });

  it('passes when a theorem shares vocabulary with the requirement', () => {
    const model = ir([{ id: 'R1-S001-1', properties: { statement: 'encryption authorization boundary' } }]);
    const thm: LeanTheorem = { file: 'A.lean', name: 't', signature: 'encryption : Bool', tokens: new Set(['encryption', 'bool']) };
    const findings = analyzeToLean(model, [thm], true);
    assert.ok(!findings.some(f => f.kind === 'proof-drift'));
  });

  it('is a no-op when Lean is not required', () => {
    const model = ir([{ properties: { statement: 'encryption' } }]);
    assert.deepEqual(analyzeToLean(model, [], false), []);
  });
});

describe('fidelity report aggregation', () => {
  it('marks passed=false when any error exists', () => {
    const report = buildFidelityReport([{ layer: 'req->bdd', kind: 'coverage-gap', severity: 'error', subject: 'x', detail: '' }]);
    assert.equal(report.summary.passed, false);
    assert.equal(report.summary.errors, 1);
  });

  it('marks passed=true with only warnings', () => {
    const report = buildFidelityReport([{ layer: 'req->bdd', kind: 'dilution', severity: 'warning', subject: 'x', detail: '' }]);
    assert.equal(report.summary.passed, true);
  });
});
