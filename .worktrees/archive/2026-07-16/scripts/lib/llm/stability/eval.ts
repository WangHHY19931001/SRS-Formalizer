/**
 * Phase 2 stability evaluation — scores collected answers against probes
 * and computes intra-model variance and inter-model delta.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { StabilityTestConfig } from '../config.js';
import type { CapabilityProfile, Dimension } from '../../probe/types.js';
import { generateProbes } from '../../probe/questions.js';
import { scoreAllProbes, calculateProfile } from '../../probe/scorer.js';
import type { StabilityResults } from './types.js';
import { computeIntraModelSigma, computeInterModelDelta, averageProfiles, computeOverallScore } from './scoring.js';

export function runStabilityEval(
  config: StabilityTestConfig,
  answersDir: string,
): StabilityResults {
  const probes = generateProbes();
  const passes = config.passes ?? 3;

  const answerFilesByProvider: Record<string, string[]> = {};
  for (const provider of config.providers) {
    answerFilesByProvider[provider.id] = [];
    for (let p = 1; p <= passes; p++) {
      const filePath = path.join(answersDir, `${provider.id}-pass-${p}.json`);
      if (fs.existsSync(filePath)) {
        answerFilesByProvider[provider.id]!.push(filePath);
      }
    }
  }

  const providerProfiles: Record<string, CapabilityProfile[]> = {};
  let totalEvaluations = 0;

  for (const provider of config.providers) {
    const profiles: CapabilityProfile[] = [];
    for (const answerFile of answerFilesByProvider[provider.id] ?? []) {
      const raw = fs.readFileSync(answerFile, 'utf-8');
      const parsed = JSON.parse(raw) as { answers?: Record<string, string> };
      const answers = parsed.answers ?? {};
      const results = scoreAllProbes(probes, answers);
      const { profile } = calculateProfile(results);
      profiles.push(profile);
      totalEvaluations += results.length;
    }
    providerProfiles[provider.id] = profiles;
  }

  const intraModelSigma: Record<string, Record<Dimension, number>> = {};
  for (const provider of config.providers) {
    const profiles = providerProfiles[provider.id] ?? [];
    intraModelSigma[provider.id] = computeIntraModelSigma(profiles);
  }

  const interModelDelta: StabilityResults['interModelDelta'] = [];
  const averagedProfiles: Record<string, CapabilityProfile> = {};
  for (const provider of config.providers) {
    averagedProfiles[provider.id] = averageProfiles(providerProfiles[provider.id] ?? []);
  }

  for (let i = 0; i < config.providers.length; i++) {
    for (let j = i + 1; j < config.providers.length; j++) {
      const a = config.providers[i]!;
      const b = config.providers[j]!;
      const deltas = computeInterModelDelta(averagedProfiles[a.id]!, averagedProfiles[b.id]!);
      const dims = Object.values(deltas) as number[];
      const avgDelta = Math.round((dims.reduce((sum, d) => sum + d, 0) / dims.length) * 100) / 100;
      interModelDelta.push({ providerA: a.id, providerB: b.id, deltas, avgDelta });
    }
  }

  const overallScore = computeOverallScore(intraModelSigma, interModelDelta);

  return { answersDir, totalEvaluations, providerProfiles, intraModelSigma, interModelDelta, overallScore };
}
