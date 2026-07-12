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

  it('extracts violated invariant', () => {
    const trace = parseTlcTrace(SAMPLE_TRACE);
    const s1 = trace[1];
    assert.ok(s1);
    assert.equal(s1.violatedInvariant, 'TypeInvariant');
  });

  it('handles empty trace', () => {
    const trace = parseTlcTrace('');
    assert.equal(trace.length, 0);
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
});
