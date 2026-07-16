/**
 * scorer.ts — Scoring functions for the capability probe system
 *
 * This file aggregates per-dimension scorers from the scorer/ directory.
 */

import type { ProbeItem, ProbeResult, Dimension, CapabilityProfile, Tier } from './types.js';
import { scoreInstructionFollowing } from './scorer/instruction-following.js';
import { scoreStructuredOutput } from './scorer/structured-output.js';
import { scorePrecision } from './scorer/precision.js';
import { scoreCreativeReasoning } from './scorer/creative.js';
import { scoreHierarchicalReasoning } from './scorer/hierarchical.js';
import { scoreLogicalReasoning } from './scorer/logical.js';
import { scoreTlaPlus } from './scorer/tlaplus.js';
import { scoreLean4 } from './scorer/lean4.js';

// ===================== Profile Calculation =====================

export function calculateProfile(results: ProbeResult[]): {
  profile: CapabilityProfile;
  tier: Tier;
  recommendations: string[];
} {
  const profile: CapabilityProfile = {
    instruction_following: 0,
    structured_output: 0,
    precision: 0,
    hierarchical_reasoning: 0,
    logical_reasoning: 0,
    creative_reasoning: 0,
    formal_tlaplus: 0,
    formal_lean4: 0,
  };

  const dimScoreMap: Record<string, number[]> = {};
  for (const r of results) {
    if (!dimScoreMap[r.dimension]) dimScoreMap[r.dimension] = [];
    dimScoreMap[r.dimension]!.push(r.score);
  }

  // Average per dimension
  for (const [dim, scores] of Object.entries(dimScoreMap)) {
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    if (dim in profile) {
      (profile as unknown as Record<string, number>)[dim] = avg;
    }
  }

  // Tier estimation — weakest dimension determines overall tier
  const allScores = Object.values(profile);
  const minScore = Math.min(...allScores);
  let tier: Tier;
  if (minScore >= 80) {
    tier = 'high';
  } else if (minScore >= 50) {
    tier = 'medium';
  } else {
    tier = 'low';
  }

  // Recommendations
  const recs: string[] = [];
  const fullAuto: string[] = [];
  const guided: string[] = [];
  const humanLoop: string[] = [];

  for (const [dim, score] of Object.entries(profile)) {
    if (score >= 80) fullAuto.push(dim);
    else if (score >= 50) guided.push(dim);
    else humanLoop.push(dim);
  }

  if (fullAuto.length > 0) recs.push(`R1: full_auto — ${fullAuto.join(', ')}`);
  if (guided.length > 0) recs.push(`R2: guided — ${guided.join(', ')}`);
  if (humanLoop.length > 0) recs.push(`R3: human_in_loop — ${humanLoop.join(', ')}`);

  return { profile, tier, recommendations: recs };
}

// ===================== Main Scoring =====================

type ProbeScorer = (probe: ProbeItem, answer: string, tempDir?: string) => ProbeResult;

function buildScorers(): Record<string, ProbeScorer> {
  const scorers: Record<string, ProbeScorer> = {};
  const dimToScorer: Record<Dimension, ProbeScorer> = {
    instruction_following: scoreInstructionFollowing,
    structured_output: scoreStructuredOutput,
    precision: scorePrecision,
    hierarchical_reasoning: scoreHierarchicalReasoning,
    logical_reasoning: scoreLogicalReasoning,
    creative_reasoning: scoreCreativeReasoning,
    formal_tlaplus: scoreTlaPlus,
    formal_lean4: scoreLean4,
  };
  const dimCounts: Record<string, number> = {
    instruction_following: 8,
    structured_output: 7,
    precision: 6,
    hierarchical_reasoning: 5,
    logical_reasoning: 5,
    creative_reasoning: 5,
    formal_tlaplus: 7,
    formal_lean4: 7,
  };
  for (const [dim, count] of Object.entries(dimCounts)) {
    const scorer = dimToScorer[dim as Dimension];
    if (!scorer) continue;
    for (let i = 1; i <= count; i++) {
      scorers[`${dim}-${i}`] = scorer;
    }
  }
  return scorers;
}

const SCORERS: Record<string, ProbeScorer> = buildScorers();

export function scoreAllProbes(probes: ProbeItem[], answers: Record<string, string>, tempDir?: string): ProbeResult[] {
  const results: ProbeResult[] = [];
  for (const probe of probes) {
    const llmAnswer = answers[probe.probe_id];
    if (llmAnswer === undefined || llmAnswer === null) {
      results.push({
        probe_id: probe.probe_id,
        dimension: probe.dimension,
        score: 0,
        details: ['未提供答案'],
        passed: false,
      });
      continue;
    }
    const scorer = SCORERS[probe.probe_id];
    if (scorer) {
      results.push(scorer(probe, llmAnswer, tempDir));
    } else {
      results.push({
        probe_id: probe.probe_id,
        dimension: probe.dimension,
        score: 0,
        details: ['未知 probe ID'],
        passed: false,
      });
    }
  }
  return results;
}
