/**
 * Scoring functions for stability evaluation — intra-model sigma,
 * inter-model delta, and overall stability score.
 */

import type { CapabilityProfile, Dimension } from '../../probe/types.js';
import type { StabilityResults } from './types.js';
import { ALL_DIMENSIONS, getDim, setDim, toDimRecord } from './types.js';

export function computeIntraModelSigma(
  profiles: CapabilityProfile[],
): Record<Dimension, number> {
  const result: Record<string, number> = {};

  for (const dim of ALL_DIMENSIONS) {
    const scores: number[] = [];
    for (const p of profiles) {
      scores.push(getDim(p, dim));
    }

    if (scores.length < 2) { setDim(result, dim, 0); continue; }

    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((acc, s) => acc + (s - mean) ** 2, 0) / (scores.length - 1);
    setDim(result, dim, Math.round(Math.sqrt(variance) * 100) / 100);
  }

  return toDimRecord(result);
}

export function computeInterModelDelta(
  profileA: CapabilityProfile,
  profileB: CapabilityProfile,
): Record<Dimension, number> {
  const deltas: Record<string, number> = {};
  for (const dim of ALL_DIMENSIONS) {
    setDim(deltas, dim, Math.abs(getDim(profileA, dim) - getDim(profileB, dim)));
  }
  return toDimRecord(deltas);
}

export function averageProfiles(profiles: CapabilityProfile[]): CapabilityProfile {
  if (profiles.length === 0) {
    return {
      instruction_following: 0, structured_output: 0, precision: 0,
      hierarchical_reasoning: 0, logical_reasoning: 0, creative_reasoning: 0,
      formal_tlaplus: 0, formal_lean4: 0,
    };
  }

  const avg: Record<string, number> = {};
  for (const dim of ALL_DIMENSIONS) {
    const sum = profiles.reduce((acc, p) => acc + getDim(p, dim), 0);
    avg[dim] = Math.round((sum / profiles.length) * 100) / 100;
  }

  return avg as unknown as CapabilityProfile;
}

export function computeOverallScore(
  intraModelSigma: Record<string, Record<Dimension, number>>,
  interModelDelta: StabilityResults['interModelDelta'],
): number {
  const allSigmas: number[] = [];
  for (const sigmas of Object.values(intraModelSigma)) {
    for (const dim of ALL_DIMENSIONS) {
      allSigmas.push((sigmas as Record<Dimension, number>)[dim] ?? 0);
    }
  }

  const allDeltas: number[] = interModelDelta.map((e) => e.avgDelta);

  const avgSigma = allSigmas.length > 0 ? allSigmas.reduce((a, b) => a + b, 0) / allSigmas.length : 0;
  const avgDelta = allDeltas.length > 0 ? allDeltas.reduce((a, b) => a + b, 0) / allDeltas.length : 0;

  const combined = avgSigma + avgDelta;
  const raw = Math.max(0, 10 - combined);
  return Math.round(raw * 10) / 10;
}
