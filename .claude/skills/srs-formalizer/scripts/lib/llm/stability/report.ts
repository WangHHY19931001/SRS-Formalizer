/**
 * Markdown stability report generator.
 */

import type { StabilityResults } from './types.js';
import type { StabilityTestConfig } from '../config.js';
import { ALL_DIMENSIONS, getDim } from './types.js';
import { averageProfiles } from './scoring.js';

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

  lines.push('## Interpretation');
  lines.push('');
  lines.push('| Metric | Stable | Moderate | Unstable |');
  lines.push('|--------|--------|----------|----------|');
  lines.push('| Intra-model σ (per dimension) | < 1.0 | 1.0 – 2.5 | > 2.5 |');
  lines.push('| Inter-model Δ (avg per dimension) | < 1.5 | 1.5 – 3.0 | > 3.0 |');
  lines.push('| Overall stability score | > 7.0 | 4.0 – 7.0 | < 4.0 |');
  lines.push('');

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
      lines.push(`| ${dim} | ${(entry.deltas[dim] ?? 0).toFixed(1)} |`);
    }
    lines.push(`| **Avg Δ** | **${entry.avgDelta.toFixed(2)}** |`);
    lines.push('');
  }

  lines.push('## Most Variable Dimensions');
  lines.push('');
  const dimVariability: Array<{ dim: string; avgSigma: number; maxDelta: number }> = [];
  for (const dim of ALL_DIMENSIONS) {
    let avgSigma = 0; let count = 0;
    for (const provider of config.providers) {
      const sigma = results.intraModelSigma[provider.id];
      if (sigma && sigma[dim] !== undefined) { avgSigma += sigma[dim] as number; count++; }
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
