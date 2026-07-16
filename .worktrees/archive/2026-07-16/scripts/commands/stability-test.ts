/**
 * stability-test.ts — Cross-LLM Stability Test CLI command
 *
 * CLI: npx tsx index.ts stability-test --config <path> [--passes 3] [--output <dir>] [--score <results-dir>]
 *
 * Phase 1 (no --score):
 *   Read LLM provider config → generate 50 probes → emit prompt manifests for orchestrator
 *
 * Phase 2 (with --score):
 *   Read collected answers → score probes → compute intra-model σ / inter-model Δ
 *   → write stability report (Markdown)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { safeParseArg } from '../lib/cli.js';
import { loadStabilityConfig } from '../lib/llm/config.js';
import {
  generatePromptManifests,
  writePromptManifests,
  runStabilityEval,
  generateStabilityReport,
} from '../lib/llm/stability.js';
import { generateProbes } from '../lib/probe/questions.js';

export async function main(args: string[]): Promise<CliResult> {
  let configPath: string | null;
  let scoreDir: string | null;
  let outputDir: string;
  let passes: number;

  try {
    configPath = safeParseArg(args, '--config');
    scoreDir = safeParseArg(args, '--score');

    const rawPasses = safeParseArg(args, '--passes');
    passes = rawPasses !== null ? Number.parseInt(rawPasses, 10) : 3;

    const rawOutput = safeParseArg(args, '--output');
    outputDir = rawOutput ?? '.srs_formalizer/stability/';
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!configPath) {
    return {
      status: 'error',
      message: 'Missing required argument: --config <path>',
    };
  }

  // Load provider config
  let config;
  try {
    config = loadStabilityConfig(configPath);
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  // Apply CLI overrides
  if (Number.isFinite(passes) && passes > 0) {
    config.passes = passes;
  }

  // ── Phase 1: Generate prompt manifests ─────────────────────────────
  if (scoreDir === null) {
    const probes = generateProbes();
    const manifests = generatePromptManifests(config, probes);

    // Write manifests to output directory
    const manifestDir = writePromptManifests(manifests, outputDir);

    // Write summary for orchestrator
    const summary = {
      phase: 'generate',
      config_path: configPath,
      providers: config.providers.map((p) => ({ id: p.id, name: p.name, model: p.model })),
      passes: config.passes,
      total_manifests: manifests.length,
      total_probes: probes.length,
      manifest_directory: manifestDir,
      instructions: [
        `For each manifest file in ${manifestDir},`,
        `1. Send the prompts to the LLM provider specified in the manifest.`,
        `2. Collect answers in the format: { "answers": { "<probe_id>": "<answer_text>" } }`,
        `3. Save as: ${outputDir}answers/{providerId}-pass-{N}.json`,
        `4. Run scoring: npx tsx index.ts stability-test --config ${configPath} --score ${outputDir}answers/`,
      ],
    };

    fs.mkdirSync(path.dirname(path.join(outputDir, '.gitkeep')), { recursive: true });

    return {
      status: 'ok',
      data: summary,
    };
  }

  // ── Phase 2: Score collected answers ───────────────────────────────
  if (!fs.existsSync(scoreDir)) {
    return {
      status: 'error',
      message: `Score directory not found: ${scoreDir}`,
    };
  }

  const dirStats = fs.statSync(scoreDir);
  if (!dirStats.isDirectory()) {
    return {
      status: 'error',
      message: `Score path is not a directory: ${scoreDir}`,
    };
  }

  const results = runStabilityEval(config, scoreDir);
  const report = generateStabilityReport(results, config);

  // Write report
  fs.mkdirSync(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, 'stability-report.md');
  fs.writeFileSync(reportPath, report, 'utf-8');

  // Write machine-readable results alongside report
  const resultsPath = path.join(outputDir, 'stability-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), 'utf-8');

  return {
    status: 'ok',
    data: {
      phase: 'score',
      report_path: reportPath,
      results_path: resultsPath,
      overall_score: results.overallScore,
      provider_count: config.providers.length,
      inter_model_deltas: results.interModelDelta,
    },
  };
}

// Guard: refuse direct invocation (must go through index.ts)
import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
