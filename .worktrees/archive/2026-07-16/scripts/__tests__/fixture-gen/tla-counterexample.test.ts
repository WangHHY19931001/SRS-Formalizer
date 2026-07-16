import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  parseTlcTrace,
  generateCounterexampleFixtures,
} from '../../lib/fixture-gen/tla-counterexample.js';

const SAMPLE_TRACE = `State 1: <Initial predicate>
vars_0 = "foo"
x_0 = 42

State 2: <Next predicate>
vars_0 = "bar"
x_0 = 99

Error: Invariant TypeInvariant is violated.`;

describe('parseTlcTrace', () => {
  it('parses states and variable assignments', () => {
    const trace = parseTlcTrace(SAMPLE_TRACE);
    assert.equal(trace.length, 2);
    const s0 = trace[0];
    const s1 = trace[1];
    assert.ok(s0);
    assert.ok(s1);
    assert.equal(s0.step, 1);
    assert.equal(s0.state['vars_0'], '"foo"');
    assert.equal(s0.state['x_0'], '42');
    assert.equal(s1.step, 2);
    assert.equal(s1.state['vars_0'], '"bar"');
  });

  it('extracts violated invariant only on last entry', () => {
    const trace = parseTlcTrace(SAMPLE_TRACE);
    assert.equal(trace.length, 2);
    const s0 = trace[0];
    const s1 = trace[1];
    assert.ok(s0);
    assert.ok(s1);
    assert.equal(s0.violatedInvariant, undefined);
    assert.equal(s1.violatedInvariant, 'TypeInvariant');
  });

  it('handles empty trace', () => {
    const trace = parseTlcTrace('');
    assert.equal(trace.length, 0);
  });

  it('returns empty array for garbage text', () => {
    const trace = parseTlcTrace('not a trace at all\njust random text');
    assert.equal(trace.length, 0);
  });

  it('handles trace with no violated invariant', () => {
    const traceText = `State 1: <Initial predicate>
x = 1
y = 2`;
    const trace = parseTlcTrace(traceText);
    assert.equal(trace.length, 1);
    const s0 = trace[0];
    assert.ok(s0);
    assert.equal(s0.violatedInvariant, undefined);
    assert.equal(s0.state['x'], '1');
    assert.equal(s0.state['y'], '2');
  });

  it('handles single state trace', () => {
    const traceText = `State 1: <Initial predicate>
flag = true

Error: Invariant SafetyCheck is violated.`;
    const trace = parseTlcTrace(traceText);
    assert.equal(trace.length, 1);
    const s0 = trace[0];
    assert.ok(s0);
    assert.equal(s0.step, 1);
    assert.equal(s0.state['flag'], 'true');
    assert.equal(s0.violatedInvariant, 'SafetyCheck');
  });
});

describe('generateCounterexampleFixtures', () => {
  it('generates TLA+ counterexample test', () => {
    const trace = parseTlcTrace(SAMPLE_TRACE);
    const result = generateCounterexampleFixtures(trace, 'tla');
    assert.ok(result.includes('CounterexampleTrace'));
    assert.ok(result.includes('foo'));
    assert.ok(result.includes('99'));
  });

  it('generates Lean counterexample test', () => {
    const trace = parseTlcTrace(SAMPLE_TRACE);
    const result = generateCounterexampleFixtures(trace, 'lean');
    assert.ok(result.includes('example'));
    assert.ok(result.includes('foo'));
  });

  it('generates pytest counterexample test', () => {
    const trace = parseTlcTrace(SAMPLE_TRACE);
    const result = generateCounterexampleFixtures(trace, 'pytest');
    assert.ok(result.includes('test_counterexample'));
    assert.ok(result.includes('foo'));
  });

  it('returns empty trace message for empty input', () => {
    const result = generateCounterexampleFixtures([], 'tla');
    assert.ok(result.includes('Empty trace'));
  });
});
