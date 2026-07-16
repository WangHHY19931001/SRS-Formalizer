/**
 * scorer/logical.ts — Scoring for logical_reasoning dimension
 */

import type { ProbeItem, ProbeResult } from '../types.js';
import { extractJson } from './helpers.js';

export function scoreLogicalReasoning(probe: ProbeItem, answer: string): ProbeResult {
  const details: string[] = [];
  const parsed = extractJson(answer);
  let relations: Array<{ source: string; target: string; relation?: string }> = [];

  if (Array.isArray(parsed)) {
    relations = parsed as Array<{ source: string; target: string; relation?: string }>;
  }

  if (relations.length === 0) {
    details.push('direction_correct: 无法解析依赖关系');
    return { probe_id: probe.probe_id, dimension: 'logical_reasoning', score: 0, details, passed: false };
  }

  let correctCount = 0;
  for (const rel of relations) {
    const src = String(rel.source ?? '').trim();
    const tgt = String(rel.target ?? '').trim();
    const found = (probe.expected.logical_expected ?? []).some((e) => e.source === src && e.target === tgt);
    if (found) {
      correctCount++;
    }
    // If reversed, it's wrong direction, so don't count
  }

  const checks = probe.expected.checks;
  const pct = Math.round((relations.length > 0 ? correctCount / relations.length : 0) * 100);
  details.push(`direction_correct: ${correctCount}/${relations.length} 条关系方向正确 (${pct}%)`);

  // Check relation_type_correct: verify answer includes expected relation types
  let relationTypeScore = 0;
  if (checks.includes('relation_type_correct')) {
    const expectedType = probe.expected.relation_type;
    if (expectedType) {
      const hasExpectedType = relations.some((r) => {
        const rel = String(r.relation ?? '').trim().toUpperCase();
        return rel === expectedType || rel.includes(expectedType);
      });
      const foundOtherType = relations.some((r) => {
        const rel = String(r.relation ?? '').trim().toUpperCase();
        return rel.length > 0;
      });
      if (hasExpectedType) {
        relationTypeScore = 100;
        details.push(`relation_type_correct: ✓ 包含期望关系类型 ${expectedType}`);
      } else if (foundOtherType) {
        relationTypeScore = 50;
        details.push(`relation_type_correct: 关系类型标记有误（期望 ${expectedType}）`);
      } else {
        relationTypeScore = 0;
        details.push(`relation_type_correct: 缺少关系类型标记`);
      }
    }
  }

  // Check transitive_detected: verify at least one DEPENDS_ON_TRANSITIVE relation
  let transitiveScore = 0;
  if (checks.includes('transitive_detected')) {
    const hasTransitive = relations.some((r) => {
      const rel = String(r.relation ?? '').trim().toUpperCase();
      return rel.includes('TRANSITIVE') || rel === 'DEPENDS_ON_TRANSITIVE';
    });
    if (hasTransitive) {
      transitiveScore = 100;
      details.push('transitive_detected: ✓ 检测到传递依赖 (DEPENDS_ON_TRANSITIVE)');
    } else {
      transitiveScore = 0;
      details.push('transitive_detected: 未检测到传递依赖');
    }
  }

  // Check cycle_detected: verify answer identifies a cycle
  let cycleScore = 0;
  if (checks.includes('cycle_detected')) {
    const answerText = answer.toLowerCase();
    const hasCycle = answerText.includes('cycle') || answerText.includes('循环');
    const hasCycleField = relations.some((r) => {
      const rel = String(r.relation ?? '').trim().toUpperCase();
      return rel.includes('CYCLE') || rel === 'SELF_REFERENCING';
    });
    const cycleDetected = hasCycle || hasCycleField || relations.some((r) => (r as Record<string, unknown>).cycle_detected === true);
    if (cycleDetected) {
      cycleScore = 100;
      details.push('cycle_detected: ✓ 检测到循环依赖');
    } else {
      cycleScore = 0;
      details.push('cycle_detected: 未检测到循环依赖');
    }
  }

  // Blend scores: direction_correct is base, new checks are averaged in
  const newCheckScores2: number[] = [];
  if (checks.includes('relation_type_correct')) newCheckScores2.push(relationTypeScore);
  if (checks.includes('transitive_detected')) newCheckScores2.push(transitiveScore);
  if (checks.includes('cycle_detected')) newCheckScores2.push(cycleScore);
  let finalScore = pct;
  if (newCheckScores2.length > 0) {
    const avgNew = newCheckScores2.reduce((a, b) => a + b, 0) / newCheckScores2.length;
    finalScore = Math.round((pct + avgNew) / 2);
  }
  finalScore = Math.max(0, Math.min(100, finalScore));

  return {
    probe_id: probe.probe_id,
    dimension: 'logical_reasoning',
    score: finalScore,
    details,
    passed: finalScore >= 70,
  };
}
