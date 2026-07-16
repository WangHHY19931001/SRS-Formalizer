/**
 * questions/lean4.ts — Probe generation for formal_lean4 dimension
 */

import type { ProbeItem } from '../types.js';

export function generateLean4Probes(): ProbeItem[] {
  return [
    // ---- probe-1 (easy) ----
    {
      probe_id: 'formal_lean4-1',
      dimension: 'formal_lean4',
      prompt: `Prove in Lean 4: For all natural numbers n, if n is even then n^2 is even.

Define "even" as: ∃ k, n = 2*k.
Do NOT use mathlib. Define everything from scratch.`,
      expected: {
        checks: ['lake_build', 'no_sorry', 'no_axiom'],
      },
    },
    // ---- probe-2 (easy) ----
    {
      probe_id: 'formal_lean4-2',
      dimension: 'formal_lean4',
      prompt: `Prove in Lean 4: The sum of natural numbers from 1 to n equals n*(n+1)/2.

Define your own sum function recursively.
Do NOT use mathlib. Define everything from scratch.`,
      expected: {
        checks: ['lake_build', 'no_sorry', 'no_axiom'],
      },
    },
    // ---- probe-3 (medium) ----
    {
      probe_id: 'formal_lean4-3',
      dimension: 'formal_lean4',
      prompt: `Prove in Lean 4: Reversing a list twice yields the original list (rev (rev l) = l).

Define your own List type (as an inductive type) and reverse function recursively.
Do NOT use mathlib or the built-in List. Define everything from scratch.`,
      expected: {
        checks: ['lake_build', 'no_sorry', 'no_axiom'],
      },
    },
    // ---- probe-4 (medium) ----
    {
      probe_id: 'formal_lean4-4',
      dimension: 'formal_lean4',
      prompt: `Prove in Lean 4 the Pigeonhole principle: Given a function f: ℕ → ℕ and n+1 distinct natural numbers as inputs, at least one output value occurs at least 2 times.

Formally: For any n:ℕ, any list xs of length n+1 of distinct ℕ's, there exist i≠j<length xs such that f(xs[i]) = f(xs[j]).
Do NOT use mathlib. Define everything from scratch.`,
      expected: {
        checks: ['lake_build', 'no_sorry', 'no_axiom'],
      },
    },
    // ---- probe-5 (medium) ----
    {
      probe_id: 'formal_lean4-5',
      dimension: 'formal_lean4',
      prompt: `Prove in Lean 4: The square root of 2 is irrational.

That is, there are no natural numbers p, q (q ≠ 0) such that (p/q)^2 = 2.
Proceed by contradiction: show that if (p/q)^2 = 2 in lowest terms, then both p and q are even.
Do NOT use mathlib. Define everything from scratch.`,
      expected: {
        checks: ['lake_build', 'no_sorry', 'no_axiom'],
      },
    },
    // ---- probe-6 (hard) ----
    {
      probe_id: 'formal_lean4-6',
      dimension: 'formal_lean4',
      prompt: `Prove in Lean 4: There is no surjection from ℕ to the set of all infinite sequences of bits (Cantor's diagonal argument).

Define infinite bit sequences as ℕ → Bool. Show that for any function f: ℕ → (ℕ → Bool), there exists a sequence s that is not in the image of f.
Do NOT use mathlib. Define everything from scratch.`,
      expected: {
        checks: ['lake_build', 'no_sorry', 'no_axiom'],
      },
    },
    // ---- probe-7 (hard) ----
    {
      probe_id: 'formal_lean4-7',
      dimension: 'formal_lean4',
      prompt: `Prove in Lean 4: The kernel of a group homomorphism is a normal subgroup.

Define from scratch:
- A Group structure (carrier set, multiplication, identity, inverse, associativity, identity, inverse axioms)
- A GroupHomomorphism (map preserving multiplication)
- The kernel of a homomorphism
- A NormalSubgroup (subgroup closed under conjugation)

Then prove: The kernel of any group homomorphism is a normal subgroup.
Do NOT use mathlib. Define everything from scratch.`,
      expected: {
        checks: ['lake_build', 'no_sorry', 'no_axiom'],
      },
    },
  ];
}
