/**
 * scorer/creative.ts — Scoring for creative_reasoning dimension
 */

import type { ProbeItem, ProbeResult } from '../types.js';
import { extractJson } from './helpers.js';

export function scoreCreativeReasoning(probe: ProbeItem, answer: string): ProbeResult {
  const details: string[] = [];
  const parsed = extractJson(answer);
  let derived: { derived_statement?: string; derived_from?: string[] | string; reasoning?: string } = {};

  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    derived = parsed as Record<string, unknown>;
  }

  let score = 0;

  // Check derived_from_correct: must reference at least 2 of R1, R2, R3
  const dFrom = derived.derived_from;
  const refs: string[] = [];
  if (Array.isArray(dFrom)) {
    refs.push(...dFrom.map(String));
  } else if (typeof dFrom === 'string') {
    refs.push(dFrom);
  }

  const validRefs = refs.filter((r) => /^R\d+$/.test(r.trim()));
  if (validRefs.length >= 2) {
    details.push(`derived_from_correct: ✓ 引用了 ${validRefs.length} 个原始需求 (${validRefs.join(', ')})`);
    score += 50;
  } else {
    details.push(`derived_from_correct: 只引用了 ${validRefs.length} 个原始需求，期望至少 2 个`);
  }

  // Check reasoning_plausible: reasoning should be a meaningful string
  const reasoning = String(derived.reasoning ?? '');
  const statement = String(derived.derived_statement ?? '');
  if (reasoning.length >= 15 && statement.length >= 5) {
    details.push(`reasoning_plausible: ✓ 推导逻辑合理 (${reasoning.length} 字)`);
    score += 50;
  } else {
    details.push(`reasoning_plausible: 推导逻辑不足 (reasoning: ${reasoning.length} 字, statement: ${statement.length} 字)`);
  }

  return {
    probe_id: probe.probe_id,
    dimension: 'creative_reasoning',
    score,
    details,
    passed: score >= 70,
  };
}
