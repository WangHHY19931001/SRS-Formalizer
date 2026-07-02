#!/usr/bin/env node
/**
 * agent/index.ts — srs-formalizer skill debugging entry point
 *
 * Usage: npx tsx agent/index.ts --llm-config <path> [--workdir <path>]
 *
 * Launches the LLM-driven orchestrator agent to test the entire skill.
 * The agent reads SKILL.md, follows prompts, uses tools, and records everything.
 */

import { OrchestratorAgent } from './orchestrator.js';
import { Tracer } from './tracer.js';
import * as fs from 'node:fs';

async function main() {
  const args = process.argv.slice(2);
  const configIdx = args.indexOf('--llm-config');
  const workdirIdx = args.indexOf('--workdir');

  if (configIdx === -1) {
    console.error('Usage: npx tsx agent/index.ts --llm-config <path> [--workdir <path>]');
    process.exit(1);
  }

  const configPath = args[configIdx + 1]!;
  if (!fs.existsSync(configPath)) {
    console.error(`Config file not found: ${configPath}`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const workdir = workdirIdx !== -1 ? args[workdirIdx + 1]! : `/tmp/srs-debug-${Date.now()}/.srs_formalizer`;

  const tracer = new Tracer();
  const orchestrator = new OrchestratorAgent(config, tracer);

  console.log(`🚀 Starting skill debug agent`);
  console.log(`   Model: ${config.name}`);
  console.log(`   Workdir: ${workdir}`);
  console.log(`   Traces: ${(tracer as unknown as { outputDir: string }).outputDir || '/tmp/srs-agent-traces/'}`);
  console.log();

  const result = await orchestrator.run(workdir);

  console.log();
  console.log(`✅ Debug complete. Observations: ${result.observations.length}`);
  for (const obs of result.observations.slice(-5)) {
    console.log(`   ${obs.slice(0, 120)}`);
  }

  const report = tracer.report();
  console.log();
  console.log(`📊 Summary: ${report.summary.total_events} events, ${report.summary.error_count} errors`);
  console.log(`   Traces saved to /tmp/srs-agent-traces/`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
