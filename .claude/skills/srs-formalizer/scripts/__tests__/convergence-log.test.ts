import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { validateEntry, isWeakeningAction, parseConvergenceLog } from '../lib/convergence-log.js';

describe('convergence-log validateEntry', () => {
  it('accepts a well-formed pass entry without diff', () => {
    const errors = validateEntry({ timestamp: 't', stage: 'B3', action: 'pass', subject: 'AutonomousTaskLoop' });
    assert.deepEqual(errors, []);
  });

  it('rejects a weakening action without before/after diff', () => {
    const errors = validateEntry({ timestamp: 't', stage: 'B3', action: 'invariant_weakened', subject: 'AvailInv', reason: 'because' });
    assert.ok(errors.some(e => e.includes('before/after diff')));
  });

  it('rejects a weakening action without a substantive reason', () => {
    const errors = validateEntry({ timestamp: 't', stage: 'B3', action: 'invariant_weakened', subject: 'AvailInv', before: 'A', after: 'B' });
    assert.ok(errors.some(e => e.includes('reason')));
  });

  it('accepts a fully documented weakening action', () => {
    const errors = validateEntry({ timestamp: 't', stage: 'B3', action: 'invariant_weakened', subject: 'AvailInv', before: 'health = up', after: 'health = up \\/ TRUE', reason: 'relaxed to clear deadlock' });
    assert.deepEqual(errors, []);
  });

  it('flags missing required fields', () => {
    const errors = validateEntry({ action: 'pass' });
    assert.ok(errors.includes('missing timestamp'));
    assert.ok(errors.includes('missing stage'));
    assert.ok(errors.includes('missing subject'));
  });
});

describe('convergence-log isWeakeningAction', () => {
  it('classifies weakening actions', () => {
    assert.equal(isWeakeningAction('invariant_weakened'), true);
    assert.equal(isWeakeningAction('threshold_relaxed'), true);
    assert.equal(isWeakeningAction('proof_simplified'), true);
    assert.equal(isWeakeningAction('pass'), false);
    assert.equal(isWeakeningAction('skip'), false);
  });
});

describe('convergence-log parseConvergenceLog', () => {
  it('parses JSONL tolerating blank lines', () => {
    const content = '{"timestamp":"t","stage":"B3","action":"pass","subject":"x"}\n\n{"timestamp":"t2","stage":"B4","action":"skip","subject":"y"}\n';
    const entries = parseConvergenceLog(content);
    assert.equal(entries.length, 2);
    assert.equal(entries[1]!.action, 'skip');
  });
});
