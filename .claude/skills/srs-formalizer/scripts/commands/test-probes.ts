/**
 * test-probes.ts — automated capability-probe test→score→report loop
 *
 * CLI: npx tsx index.ts test-probes --llm-config <path> [--limit N]
 *
 * Flow: generate probes → send to LLM → score answers → report
 * Uses OpenAI-compatible API via lib/llm-client.ts
 */

import * as fs from 'node:fs';
import type { CliResult } from '../types/index.js';
import { loadLlmConfig, sendProbes, toAnswerFile } from '../lib/llm-client.js';
import { safeParseArg } from '../lib/cli.js';
import { main as probeMain } from './capability-probe.js';

export async function main(args: string[]): Promise<CliResult> {
  let configPath: string | null;
  let limitStr: string | null;
  try {
    configPath = safeParseArg(args, '--llm-config');
    limitStr = safeParseArg(args, '--limit');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!configPath) {
    return { status: 'error', message: 'Missing required argument: --llm-config <path>' };
  }
  if (!fs.existsSync(configPath)) {
    return { status: 'error', message: `Config file not found: ${configPath}` };
  }

  const limit = limitStr ? parseInt(limitStr, 10) : 0;
  if (limitStr && (isNaN(limit) || limit < 1)) {
    return { status: 'error', message: '--limit must be a positive integer' };
  }

  // 1. Load config
  let config;
  try {
    config = loadLlmConfig(configPath);
  } catch (err) {
    return { status: 'error', message: `Failed to load config: ${(err as Error).message}` };
  }

  // 2. Generate probes
  const genResult = await probeMain(['--mode', 'generate']);
  if (genResult.status !== 'ok' || !Array.isArray(genResult.data)) {
    return { status: 'error', message: 'Failed to generate probes' };
  }
  let probes = genResult.data as Array<{ probe_id: string; dimension: string; prompt: string }>;
  if (limit > 0) probes = probes.slice(0, limit);

  // 3. Send to LLM
  const results = await sendProbes(config, probes, (i, total, pid, status) => {
    process.stderr.write(`[${i + 1}/${total}] ${pid}: ${status}\n`);
  });

  const errors = results.filter(r => r.error).length;
  const totalMs = results.reduce((s, r) => s + r.duration_ms, 0);

  // 4. Score
  const answerFile = toAnswerFile(results);
  const tmpPath = `/tmp/test-probes-answers-${Date.now()}.json`;
  fs.writeFileSync(tmpPath, JSON.stringify(answerFile), 'utf-8');
  const scoreResult = await probeMain(['--mode', 'score', '--file', tmpPath]);
  fs.unlinkSync(tmpPath); // cleanup

  // 5. Report
  const dimScores: Record<string, number> = {};
  if (scoreResult.status === 'ok' && scoreResult.data) {
    const profile = (scoreResult.data as Record<string, unknown>).capability_profile as Record<string, number> | undefined;
    if (profile) Object.assign(dimScores, profile);
  }

  return {
    status: 'ok',
    data: {
      model: config.name,
      probes_sent: results.length,
      errors,
      total_duration_ms: totalMs,
      avg_ms_per_probe: results.length > 0 ? Math.round(totalMs / results.length) : 0,
      capability_profile: dimScores,
      tier: scoreResult.status === 'ok' ? (scoreResult.data as Record<string, unknown>).estimated_tier : 'unknown',
      recommendations: scoreResult.status === 'ok' ? (scoreResult.data as Record<string, unknown>).recommendations : [],
    },
  };
}

// Guard
import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
