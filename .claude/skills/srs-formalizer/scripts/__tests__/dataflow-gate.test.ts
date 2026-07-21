import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  assessInjectionGate,
  defaultGate,
  DEFAULT_FALSE_POSITIVE_THRESHOLD,
} from '../lib/dataflow-gate.js';

describe('dataflow injection gate', () => {
  it('defaultGate is shadow mode (injection disabled)', () => {
    const g = defaultGate();
    assert.strictEqual(g.injectionEnabled, false);
    assert.strictEqual(g.threshold, DEFAULT_FALSE_POSITIVE_THRESHOLD);
  });

  it('enables injection when fp-rate within threshold, signed, enough samples', () => {
    const { gate, errors } = assessInjectionGate({
      falsePositiveRate: 0.10, sampleSize: 40, assessedBy: 'reviewer-A',
    });
    assert.deepStrictEqual(errors, []);
    assert.strictEqual(gate.injectionEnabled, true);
    assert.strictEqual(gate.assessedBy, 'reviewer-A');
    assert.ok(gate.assessedAt);
  });

  it('keeps shadow mode when fp-rate exceeds threshold', () => {
    const { gate, errors } = assessInjectionGate({
      falsePositiveRate: 0.30, sampleSize: 40, assessedBy: 'reviewer-A',
    });
    assert.strictEqual(gate.injectionEnabled, false);
    assert.ok(errors.some(e => e.includes('exceeds threshold')));
  });

  it('keeps shadow mode when unsigned', () => {
    const { gate, errors } = assessInjectionGate({
      falsePositiveRate: 0.05, sampleSize: 40, assessedBy: '',
    });
    assert.strictEqual(gate.injectionEnabled, false);
    assert.ok(errors.some(e => e.includes('assessedBy is required')));
  });

  it('keeps shadow mode when sample size too small', () => {
    const { gate, errors } = assessInjectionGate({
      falsePositiveRate: 0.05, sampleSize: 3, assessedBy: 'reviewer-A',
    });
    assert.strictEqual(gate.injectionEnabled, false);
    assert.ok(errors.some(e => e.includes('below minimum')));
  });

  it('rejects out-of-range fp-rate', () => {
    const { gate, errors } = assessInjectionGate({
      falsePositiveRate: 1.5, sampleSize: 40, assessedBy: 'reviewer-A',
    });
    assert.strictEqual(gate.injectionEnabled, false);
    assert.ok(errors.some(e => e.includes('falsePositiveRate must be in [0,1]')));
  });

  it('honors a custom threshold', () => {
    const { gate } = assessInjectionGate({
      falsePositiveRate: 0.25, sampleSize: 40, assessedBy: 'reviewer-A', threshold: 0.30,
    });
    assert.strictEqual(gate.injectionEnabled, true);
    assert.strictEqual(gate.threshold, 0.30);
  });
});
