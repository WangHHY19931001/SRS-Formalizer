#!/usr/bin/env node
/**
 * agent/index.ts — Skill debugging agent entry point
 *
 * Usage:
 *   npx tsx agent/index.ts --llm-config <path> --task <path>
 *   npx tsx agent/index.ts --llm-config <path> --task-prompt "..."
 *
 * The --task file contains the agent's work prompt (skill path, workdir, stages, rules).
 * This makes the agent portable — it can debug ANY skill, not just srs-formalizer.
 */

import { Agent } from './agent.js';
import { Tracer } from './tracer.js';
import * as fs from 'node:fs';

function parseArg(args: string[], name: string): string | null {
  const idx = args.indexOf(name);
  return (idx !== -1 && idx + 1 < args.length) ? args[idx + 1]! : null;
}

async function main() {
  const args = process.argv.slice(2);
  const configPath = parseArg(args, '--llm-config');
  const taskPath = parseArg(args, '--task');
  const taskPrompt = parseArg(args, '--task-prompt');

  if (!configPath || (!taskPath && !taskPrompt)) {
    console.error('Usage: npx tsx agent/index.ts --llm-config <path> (--task <path> | --task-prompt "...")');
    console.error('  --llm-config  LLM 配置文件路径');
    console.error('  --task        任务提示词文件路径（推荐）');
    console.error('  --task-prompt  直接传入任务提示词');
    process.exit(1);
  }

  const task = taskPath ? fs.readFileSync(taskPath, 'utf-8') : taskPrompt!;

  const tracer = new Tracer();
  const agent = new Agent({
    configPath,
    role: 'orchestrator',
    tracer,
  });

  // Read config just for the log message
  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  console.log(`🚀 Agent starting (${cfg.name})`);
  console.log(`   Task: ${task.slice(0, 100).replace(/\n/g, ' ')}...`);
  console.log();

  const result = await agent.run(task);
  console.log(result.slice(0, 800));

  const report = tracer.report();
  console.log(`\n📊 ${report.summary.total_events} events, ${report.summary.error_count} errors`);
  console.log(`   Trace: /tmp/srs-agent-traces/`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
