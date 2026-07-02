#!/usr/bin/env node
/**
 * agent/index.ts — srs-formalizer skill debugging entry point
 *
 * Usage: npx tsx agent/index.ts --llm-config <path>
 *
 * Launches a unified Agent that acts as both orchestrator and worker.
 * It reads SKILL.md, follows prompts, spawns sub-agents for LLM tasks,
 * and records everything via Tracer.
 */

import { Agent } from './agent.js';
import { Tracer } from './tracer.js';
import * as fs from 'node:fs';

async function main() {
  const args = process.argv.slice(2);
  const configIdx = args.indexOf('--llm-config');

  if (configIdx === -1) {
    console.error('Usage: npx tsx agent/index.ts --llm-config <path>');
    process.exit(1);
  }

  const configPath = args[configIdx + 1]!;
  if (!fs.existsSync(configPath)) {
    console.error(`Config file not found: ${configPath}`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const tracer = new Tracer();

  const agent = new Agent({
    model: config.name,
    baseURL: config.baseURL,
    apiKey: config.key,
    role: 'orchestrator',
    tracer,
  });

  console.log(`🚀 Agent starting (${config.name})`);
  console.log(`   Role: orchestrator + recursive worker`);
  console.log(`   Traces: /tmp/srs-agent-traces/`);
  console.log();

  const result = await agent.run();
  console.log(result.slice(0, 500));

  const report = tracer.report();
  console.log(`\n📊 ${report.summary.total_events} events, ${report.summary.error_count} errors`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
