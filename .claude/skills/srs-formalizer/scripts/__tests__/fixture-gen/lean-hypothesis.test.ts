import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseTheorem } from '../../lib/fixture-gen/lean.js';

const HYPOTHESIS_THEOREM = `
theorem reverse_preserves_length (xs : List α) : (xs.reverse).length = xs.length := by
  induction xs with
  | nil => rfl
  | cons h t ih =>
    simp [List.reverse, List.length]
    exact ih
`;

describe('parseTheorem - Hypothesis pattern', () => {
  it('detects induction pattern', () => {
    const result = parseTheorem(HYPOTHESIS_THEOREM);
    assert.ok(result.tactics.some(t => t.toLowerCase().includes('induction')));
  });

  it('extracts hypothesis variables', () => {
    const result = parseTheorem(HYPOTHESIS_THEOREM);
    assert.ok(result.hypothesisVars.length > 0);
    assert.ok(result.hypothesisVars.some(h => h.includes('xs')));
  });

  it('detects List type', () => {
    const result = parseTheorem(HYPOTHESIS_THEOREM);
    assert.ok(result.hypothesisVars.some(h => h.includes('List')));
  });
});