import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { nonTrivialityErrors, nonTrivialityWarnings } from '../commands/validate-tla.js';

const HEADER = '---- MODULE M ----\nEXTENDS Naturals\nVARIABLES gateState, stepCount\n';

describe('validate-tla nonTrivialityErrors — invariant non-triviality (proposal §2.3)', () => {
  it('flags a `var \\in TypeSet` tautology invariant', () => {
    const src = `${HEADER}SecurityInv == gateState \\in GateState\n====`;
    const errors = nonTrivialityErrors(src);
    assert.ok(errors.some(e => e.includes('SecurityInv') && e.includes('tautology')));
  });

  it('flags duplicated NFR invariant bodies (template copy)', () => {
    const src = `${HEADER}PerfLatencyInv == stepCount <= MaxSteps\nAvailInv == stepCount <= MaxSteps\n====`;
    const errors = nonTrivialityErrors(src);
    assert.ok(errors.some(e => e.includes('template duplication') && e.includes('PerfLatencyInv') && e.includes('AvailInv')));
  });

  it('accepts distinct, non-tautological NFR invariants', () => {
    const src = `${HEADER}` +
      'SecurityInv == (gateState = "Accepted") => (prevState = "Checking")\n' +
      'ComplianceInv == (gateState = "Accepted") => auditChainComplete\n' +
      'PerfLatencyInv == latency <= 200\n' +
      '====';
    const errors = nonTrivialityErrors(src);
    assert.deepEqual(errors, []);
  });

  it('does not flag TypeOK membership form (only NFR invariants are checked)', () => {
    const src = `${HEADER}TypeOK == gateState \\in GateState\n====`;
    const errors = nonTrivialityErrors(src);
    assert.deepEqual(errors, []);
  });

  it('ignores True/membership appearing only in comments', () => {
    const src = `${HEADER}(* SecurityInv == gateState \\in GateState is what we avoid *)\nSecurityInv == (gateState = "Accepted") => (prevState = "Checking")\n====`;
    const errors = nonTrivialityErrors(src);
    assert.deepEqual(errors, []);
  });

  it('flags three identical NFR bodies as one duplication group', () => {
    const src = `${HEADER}` +
      'PerfLatencyInv == stepCount <= MaxSteps\n' +
      'AvailInv == stepCount <= MaxSteps\n' +
      'MaintInv == stepCount <= MaxSteps\n' +
      '====';
    const errors = nonTrivialityErrors(src);
    const dup = errors.filter(e => e.includes('template duplication'));
    assert.equal(dup.length, 1);
    assert.ok(dup[0]!.includes('PerfLatencyInv') && dup[0]!.includes('AvailInv') && dup[0]!.includes('MaintInv'));
  });

  it('flags a `\\/ TRUE` disjunct as a tautology (§P0-2)', () => {
    const src = `${HEADER}AvailInv == health = "up" \\/ TRUE\n====`;
    const errors = nonTrivialityErrors(src);
    assert.ok(errors.some(e => e.includes('AvailInv') && e.includes('tautology') && e.includes('\\/ TRUE')));
  });

  it('flags an implication with TRUE consequent as a tautology (§P0-2)', () => {
    const src = `${HEADER}SecurityInv == (gateState = "blocked") => TRUE\n====`;
    const errors = nonTrivialityErrors(src);
    assert.ok(errors.some(e => e.includes('SecurityInv') && e.includes('tautology')));
  });

  it('flags a literal TRUE body as a tautology (§P0-2)', () => {
    const src = `${HEADER}MaintInv == TRUE\n====`;
    const errors = nonTrivialityErrors(src);
    assert.ok(errors.some(e => e.includes('MaintInv') && e.includes('tautology')));
  });

  it('flags normalized-equivalent bodies as duplication (§P0-2)', () => {
    const src = `${HEADER}` +
      'PerfLatencyInv == latency <= MaxLatency\n' +
      'AvailInv == ( latency =< MaxLatency )\n' +
      '====';
    const errors = nonTrivialityErrors(src);
    assert.ok(errors.some(e => e.includes('template duplication') && e.includes('PerfLatencyInv') && e.includes('AvailInv')));
  });
});

describe('validate-tla nonTrivialityWarnings — naming/content consistency (§P0-2)', () => {
  it('warns when PerfLatencyInv references no latency/time term', () => {
    const src = `${HEADER}PerfLatencyInv == budgetUsed <= MaxBudget\n====`;
    const warnings = nonTrivialityWarnings(src);
    assert.ok(warnings.some(w => w.includes('PerfLatencyInv') && w.includes('naming/content mismatch')));
  });

  it('does not warn when PerfLatencyInv references latency', () => {
    const src = `${HEADER}PerfLatencyInv == latency <= 200\n====`;
    const warnings = nonTrivialityWarnings(src);
    assert.deepEqual(warnings, []);
  });
});
