/**
 * stability.ts — Cross-LLM Stability Test Engine
 *
 * Measures intra-model variance (same model, N passes) and inter-model delta
 * (across different providers/models) for every capability dimension.
 *
 * This module does NOT make real LLM API calls. It generates structured
 * manifests for the orchestrator and scores collected answers offline.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { StabilityTestConfig, LlmProviderConfig } from './config.js';
import type { CapabilityProfile, Dimension, ProbeItem } from '../probe/types.js';
import { generateProbes } from '../probe/questions.js';
import { scoreAllProbes, calculateProfile } from '../probe/scorer.js';

// ─── Internal helpers to work around CapabilityProfile lacking index sig ──

const ALL_DIMENSIONS: Dimension[] = [
  'instruction_following',
  'structured_output',
  'precision',
  'hierarchical_reasoning',
  'logical_reasoning',
  'creative_reasoning',
  'formal_tlaplus',
  'formal_lean4',
];

function getDim(p: CapabilityProfile, dim: Dimension): number {
  return (p as unknown as Record<string, number>)[dim] ?? 0;
}

function setDim(p: Record<string, number>, dim: Dimension, val: number): void {
  p[dim] = val;
}

function toDimRecord(source: Record<string, number>): Record<Dimension, number> {
  return source as unknown as Record<Dimension, number>;
}

// ─── Orchestrator Manifest ─────────────────────────────────────────────

export interface PromptManifest {
  /** Unique id: "{providerId}-pass-{N}" */
  manifestId: string;
  provider: LlmProviderConfig;
  /** 1-based pass number */
  pass: number;
  /** The probe prompts to send, keyed by probe_id */
  prompts: Record<string, string>;
  /** Expected output format — orchestrator must preserve probe_id → answer_text */
  outputFormat: 'json' | 'text';
}

export interface StabilityScoreManifest {
  /** Path to directory containing answer files from orchestrator */
  answersDir: string;
  /** Number of answer files expected */
  expectedFiles: number;
}

/**
 * Phase 1: Generate the full list of prompt manifests.
 * For each provider × pass, produces a PromptManifest describing what
 * probe prompts to send and what answer format is expected.
 *
 * @returns Array of PromptManifests for the orchestrator to execute.
 */
export function generatePromptManifests(
  config: StabilityTestConfig,
  probes: ProbeItem[],
): PromptManifest[] {
  const manifests: PromptManifest[] = [];
  const passes = config.passes ?? 3;

  for (const provider of config.providers) {
    for (let p = 1; p <= passes; p++) {
      const manifestId = `${provider.id}-pass-${p}`;
      const prompts: Record<string, string> = {};
      for (const probe of probes) {
        prompts[probe.probe_id] = probe.prompt;
      }
      manifests.push({
        manifestId,
        provider,
        pass: p,
        prompts,
        outputFormat: 'json',
      });
    }
  }

  return manifests;
}

/**
 * Save prompt manifests as JSON files in outputDir.
 * Each manifest is written as a separate JSON file for the orchestrator.
 *
 * @returns Path to the directory containing the manifests.
 */
export function writePromptManifests(
  manifests: PromptManifest[],
  outputDir: string,
): string {
  const manifestDir = path.join(outputDir, 'manifests');
  fs.mkdirSync(manifestDir, { recursive: true });
  for (const manifest of manifests) {
    const filePath = path.join(manifestDir, `${manifest.manifestId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2), 'utf-8');
  }
  fs.writeFileSync(
    path.join(manifestDir, '_index.json'),
    JSON.stringify({
      total: manifests.length,
      providers: [...new Set(manifests.map((m) => m.provider.id))],
      passes: manifests.length /
        [...new Set(manifests.map((m) => m.provider.id))].length,
      generated_at: new Date().toISOString(),
    }, null, 2),
    'utf-8',
  );
  return manifestDir;
}

// ─── Scoring & Metrics ─────────────────────────────────────────────────

export interface StabilityResults {
  /** Path to answers directory */
  answersDir: string;
  /** Total probes × passes × providers evaluated */
  totalEvaluations: number;
  /** Per-provider profiles, keyed by provider id */
  providerProfiles: Record<string, CapabilityProfile[]>;
  /** Computed intra-model σ per dimension, keyed by provider id */
  intraModelSigma: Record<string, Record<Dimension, number>>;
  /** Computed inter-model Δ for every provider pair */
  interModelDelta: Array<{
    providerA: string;
    providerB: string;
    deltas: Record<Dimension, number>;
    avgDelta: number;
  }>;
  /** Overall stability score (0-10, higher = more stable) */
  overallScore: number;
}

/**
 * Compute per-dimension standard deviation from N capability profiles
 * produced by the same model. Returns σ for each dimension.
 */
export function computeIntraModelSigma(
  profiles: CapabilityProfile[],
): Record<Dimension, number> {
  const result: Record<string, number> = {};

  for (const dim of ALL_DIMENSIONS) {
    const scores: number[] = [];
    for (const p of profiles) {
      const val = getDim(p, dim);
      scores.push(val);
    }

    if (scores.length < 2) {
      setDim(result, dim, 0);
      continue;
    }

    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance =
      scores.reduce((acc, s) => acc + (s - mean) ** 2, 0) / (scores.length - 1);
    setDim(result, dim, Math.round(Math.sqrt(variance) * 100) / 100);
  }

  return toDimRecord(result);
}

/**
 * Compute per-dimension absolute difference between two capability profiles.
 */
export function computeInterModelDelta(
  profileA: CapabilityProfile,
  profileB: CapabilityProfile,
): Record<Dimension, number> {
  const deltas: Record<string, number> = {};
  for (const dim of ALL_DIMENSIONS) {
    const aVal = getDim(profileA, dim);
    const bVal = getDim(profileB, dim);
    setDim(deltas, dim, Math.abs(aVal - bVal));
  }

  return toDimRecord(deltas);
}

/**
 * Phase 2: Run stability evaluation on collected answers.
 *
 * Reads answer files from answersDir, scores each probe, computes
 * intra-model variance and inter-model delta, and returns a full
 * StabilityResults structure.
 */
export function runStabilityEval(
  config: StabilityTestConfig,
  answersDir: string,
): StabilityResults {
  const probes = generateProbes();
  const passes = config.passes ?? 3;

  // Collect answer files grouped by provider
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

  // Score each provider × pass
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

  // Intra-model σ
  const intraModelSigma: Record<string, Record<Dimension, number>> = {};
  for (const provider of config.providers) {
    const profiles = providerProfiles[provider.id] ?? [];
    intraModelSigma[provider.id] = computeIntraModelSigma(profiles);
  }

  // Inter-model Δ — compare averaged profiles across providers
  const interModelDelta: StabilityResults['interModelDelta'] = [];
  const averagedProfiles: Record<string, CapabilityProfile> = {};
  for (const provider of config.providers) {
    const profiles = providerProfiles[provider.id] ?? [];
    averagedProfiles[provider.id] = averageProfiles(profiles);
  }

  for (let i = 0; i < config.providers.length; i++) {
    for (let j = i + 1; j < config.providers.length; j++) {
      const a = config.providers[i]!;
      const b = config.providers[j]!;
      const profileA = averagedProfiles[a.id]!;
      const profileB = averagedProfiles[b.id]!;
      const deltas = computeInterModelDelta(profileA, profileB);
      const dims = Object.values(deltas) as number[];
      const avgDelta =
        Math.round(
          (dims.reduce((sum, d) => sum + d, 0) / dims.length) * 100,
        ) / 100;
      interModelDelta.push({ providerA: a.id, providerB: b.id, deltas, avgDelta });
    }
  }

  // Overall stability score (0-10 scale)
  const overallScore = computeOverallScore(intraModelSigma, interModelDelta);

  return {
    answersDir,
    totalEvaluations,
    providerProfiles,
    intraModelSigma,
    interModelDelta,
    overallScore,
  };
}

/**
 * Generate a Markdown stability report.
 */
export function generateStabilityReport(results: StabilityResults, config: StabilityTestConfig): string {
  const lines: string[] = [];

  lines.push('# Cross-LLM Stability Report');
  lines.push('');
  lines.push(`- **Generated**: ${new Date().toISOString()}`);
  lines.push(`- **Providers tested**: ${config.providers.map((p) => p.name).join(', ')}`);
  lines.push(`- **Passes per provider**: ${config.passes ?? 3}`);
  lines.push(`- **Total evaluations**: ${results.totalEvaluations}`);
  lines.push(`- **Overall stability score**: ${results.overallScore.toFixed(1)} / 10`);
  lines.push('');

  // Interpretation legend
  lines.push('## Interpretation');
  lines.push('');
  lines.push('| Metric | Stable | Moderate | Unstable |');
  lines.push('|--------|--------|----------|----------|');
  lines.push('| Intra-model σ (per dimension) | < 1.0 | 1.0 – 2.5 | > 2.5 |');
  lines.push('| Inter-model Δ (avg per dimension) | < 1.5 | 1.5 – 3.0 | > 3.0 |');
  lines.push('| Overall stability score | > 7.0 | 4.0 – 7.0 | < 4.0 |');
  lines.push('');

  // Per-model profile summary
  lines.push('## Per-Model Profile Summary');
  lines.push('');
  for (const provider of config.providers) {
    const profiles = results.providerProfiles[provider.id];
    const sigma = results.intraModelSigma[provider.id];
    if (!profiles || profiles.length === 0) {
      lines.push(`### ${provider.name} (${provider.model})`);
      lines.push('_No results collected._');
      lines.push('');
      continue;
    }

    const avgProfile = averageProfiles(profiles);
    lines.push(`### ${provider.name} (${provider.model})`);
    lines.push('');
    lines.push('| Dimension | Avg Score | σ (intra-model) |');
    lines.push('|-----------|-----------|------------------|');
    for (const dim of ALL_DIMENSIONS) {
      const avg = getDim(avgProfile, dim);
      const s = sigma?.[dim] !== undefined ? (sigma[dim] as number) : 0;
      lines.push(`| ${dim} | ${avg.toFixed(1)} | ${s.toFixed(2)} |`);
    }
    lines.push('');
  }

  // Inter-model delta matrix
  lines.push('## Inter-Model Delta Matrix');
  lines.push('');
  lines.push('Per-dimension absolute differences between averaged provider profiles.');
  lines.push('');
  for (const entry of results.interModelDelta) {
    const aName = config.providers.find((p) => p.id === entry.providerA)?.name ?? entry.providerA;
    const bName = config.providers.find((p) => p.id === entry.providerB)?.name ?? entry.providerB;
    lines.push(`### ${aName} vs ${bName}`);
    lines.push('');
    lines.push('| Dimension | Δ |');
    lines.push('|-----------|---|');
    for (const dim of ALL_DIMENSIONS) {
      const d = entry.deltas[dim] ?? 0;
      lines.push(`| ${dim} | ${d.toFixed(1)} |`);
    }
    lines.push(`| **Avg Δ** | **${entry.avgDelta.toFixed(2)}** |`);
    lines.push('');
  }

  // Dimensions ranked by instability
  lines.push('## Most Variable Dimensions');
  lines.push('');
  const dimVariability: Array<{ dim: string; avgSigma: number; maxDelta: number }> = [];
  for (const dim of ALL_DIMENSIONS) {
    let avgSigma = 0;
    let count = 0;
    for (const provider of config.providers) {
      const sigma = results.intraModelSigma[provider.id];
      if (sigma && sigma[dim] !== undefined) {
        avgSigma += sigma[dim] as number;
        count++;
      }
    }
    avgSigma = count > 0 ? avgSigma / count : 0;

    let maxDelta = 0;
    for (const entry of results.interModelDelta) {
      const d = entry.deltas[dim] ?? 0;
      if (d > maxDelta) maxDelta = d;
    }
    dimVariability.push({ dim, avgSigma: Math.round(avgSigma * 100) / 100, maxDelta });
  }

  dimVariability.sort((a, b) => b.avgSigma + b.maxDelta - (a.avgSigma + a.maxDelta));

  lines.push('| Dimension | Avg Intra-model σ | Max Inter-model Δ | Combined Variability |');
  lines.push('|-----------|-------------------|--------------------|----------------------|');
  for (const entry of dimVariability) {
    const combined = entry.avgSigma + entry.maxDelta;
    lines.push(`| ${entry.dim} | ${entry.avgSigma.toFixed(2)} | ${entry.maxDelta.toFixed(1)} | ${combined.toFixed(2)} |`);
  }
  lines.push('');

  return lines.join('\n');
}

// ─── Helpers ───────────────────────────────────────────────────────────

function averageProfiles(profiles: CapabilityProfile[]): CapabilityProfile {
  if (profiles.length === 0) {
    return {
      instruction_following: 0,
      structured_output: 0,
      precision: 0,
      hierarchical_reasoning: 0,
      logical_reasoning: 0,
      creative_reasoning: 0,
      formal_tlaplus: 0,
      formal_lean4: 0,
    };
  }

  const avg: Record<string, number> = {};
  for (const dim of ALL_DIMENSIONS) {
    const sum = profiles.reduce(
      (acc, p) => acc + getDim(p, dim),
      0,
    );
    avg[dim] = Math.round((sum / profiles.length) * 100) / 100;
  }

  return avg as unknown as CapabilityProfile;
}

function computeOverallScore(
  intraModelSigma: Record<string, Record<Dimension, number>>,
  interModelDelta: StabilityResults['interModelDelta'],
): number {
  // Collect all sigma values
  const allSigmas: number[] = [];
  for (const sigmas of Object.values(intraModelSigma)) {
    for (const dim of ALL_DIMENSIONS) {
      allSigmas.push((sigmas as Record<Dimension, number>)[dim] ?? 0);
    }
  }

  // Collect all avg deltas
  const allDeltas: number[] = interModelDelta.map((e) => e.avgDelta);

  const avgSigma =
    allSigmas.length > 0
      ? allSigmas.reduce((a, b) => a + b, 0) / allSigmas.length
      : 0;
  const avgDelta =
    allDeltas.length > 0
      ? allDeltas.reduce((a, b) => a + b, 0) / allDeltas.length
      : 0;

  // Stability formula: inverse of average (σ + Δ), scaled to 0-10
  // avgSigma=0, avgDelta=0 → 10.0. Higher variance → lower score.
  const combined = avgSigma + avgDelta;
  const raw = Math.max(0, 10 - combined);

  // Round to 1 decimal
  return Math.round(raw * 10) / 10;
}
