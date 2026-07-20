import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { auditLean } from '../commands/validate-lean.js';

describe('validate-lean auditLean — vacuous consequent detection', () => {
  it('accepts a theorem with a substantive consequent', () => {
    const src = 'theorem piiExclusion (e : Entry) :\n    e.hasPii = true -> isRedacted e = true := by\n  sorry';
    // still flags sorry but not the consequent
    const errors = auditLean(src.replace('sorry', 'exact proof'));
    assert.deepEqual(errors, []);
  });

  it('flags a bare : True theorem', () => {
    const errors = auditLean('theorem t (n : Nat) : True := trivial');
    assert.ok(errors.some(e => e.includes(': True')));
  });

  it('flags a -> True vacuous consequent (proposal §3.3)', () => {
    const src = 'theorem pathBoundaryInv (path : String) (boundary : String) :\n    path.startsWith boundary -> True := by intro _; trivial';
    const errors = auditLean(src);
    assert.ok(errors.some(e => e.includes('True consequent is vacuous (→ True)')));
  });

  it('flags a → True vacuous consequent (unicode arrow)', () => {
    const src = 'theorem approvalGuard (approved : Bool) (highRisk : Bool) :\n    highRisk = true → approved = true → True := by intro _ _; trivial';
    const errors = auditLean(src);
    assert.ok(errors.some(e => e.includes('True consequent is vacuous (→ True)')));
  });

  it('flags a ↔ True vacuous consequent', () => {
    const src = 'lemma foo (b : Bool) : b = true ↔ True := by simp';
    const errors = auditLean(src);
    assert.ok(errors.some(e => e.includes('True consequent is vacuous (↔ True)')));
  });

  it('flags sorry / admit / axiom', () => {
    assert.ok(auditLean('theorem t : n = n := by sorry').some(e => e.includes('unfinished')));
    assert.ok(auditLean('axiom bad : 1 = 1').some(e => e.includes('unfinished')));
  });

  it('ignores True appearing inside comments', () => {
    const src = '-- this theorem returns True when done\ntheorem t (n : Nat) : n + 0 = n := by simp';
    const errors = auditLean(src);
    assert.deepEqual(errors, []);
  });
});
