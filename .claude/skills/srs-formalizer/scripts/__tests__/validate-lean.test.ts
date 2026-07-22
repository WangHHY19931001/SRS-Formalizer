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
    const src = '-- this theorem returns True when done\ntheorem t (n : Nat) : n + 0 = n := by rw [Nat.add_zero]';
    const errors = auditLean(src);
    assert.deepEqual(errors, []);
  });

  // P0-2: tautology detection (assumption-as-conclusion)
  it('flags := h tautology (assumption-as-conclusion)', () => {
    const src = 'theorem eq_refl (h : a = a) : a = a := h';
    const errors = auditLean(src);
    assert.ok(errors.some(e => e.includes('assumption-as-conclusion')), `expected tautology flag, got: ${JSON.stringify(errors)}`);
  });

  it('flags := by exact h tautology', () => {
    const src = 'theorem eq_refl (h : a = a) : a = a := by exact h';
    const errors = auditLean(src);
    assert.ok(errors.some(e => e.includes('assumption-as-conclusion')), `expected tautology flag, got: ${JSON.stringify(errors)}`);
  });

  // P1-8: over-simplified proof detection
  it('flags := by simp oversimplified', () => {
    const src = 'theorem add_zero (n : Nat) : n + 0 = n := by simp';
    const errors = auditLean(src);
    assert.ok(errors.some(e => e.includes('over-simplified')), `expected over-simplified flag, got: ${JSON.stringify(errors)}`);
  });

  it('flags := trivial oversimplified', () => {
    const src = 'theorem trivial_proof : True := trivial';
    const errors = auditLean(src);
    assert.ok(errors.some(e => e.includes('over-simplified')), `expected over-simplified flag, got: ${JSON.stringify(errors)}`);
  });

  it('flags := rfl as suspicious', () => {
    const src = 'theorem eq_refl (n : Nat) : n = n := rfl';
    const errors = auditLean(src);
    assert.ok(errors.some(e => e.includes('rfl')), `expected rfl flag, got: ${JSON.stringify(errors)}`);
  });

  it('does NOT flag multi-line proof with induction', () => {
    const src = 'theorem add_comm (n m : Nat) : n + m = m + n := by\n  induction n with\n  | zero => simp\n  | succ _ _ => simp';
    const errors = auditLean(src);
    // multi-line proof with induction is NOT a bare `by simp`
    assert.ok(!errors.some(e => e.includes('over-simplified')), `should not flag multi-line proof: ${JSON.stringify(errors)}`);
  });

  it('does NOT flag := h.val (method call, not bare hypothesis)', () => {
    const src = 'theorem foo (h : Nat) : Nat := h.val';
    const errors = auditLean(src);
    assert.ok(!errors.some(e => e.includes('assumption-as-conclusion')), `should not flag method access: ${JSON.stringify(errors)}`);
  });
});
