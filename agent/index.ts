#!/usr/bin/env node
/**
 * agent/index.ts — Skill debugging agent entry point
 *
 * Usage:
 *   npx tsx agent/index.ts --llm-config <path> --task <path>
 *                  [--project-root <path>] [--skills-dir <path>] [--work-dir <path>]
 *
 * Rewrite: uses createAgent() factory with LangGraph createReactAgent,
 * ToolRegistry, and AgentDirectory for A2A communication.
 */

import { createAgent } from './agent.js';
import { ToolRegistry } from './tool-registry.js';
import { AgentDirectory } from './agent-directory.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function parseArg(args: string[], name: string): string | null {
  const idx = args.indexOf(name);
  return (idx !== -1 && idx + 1 < args.length) ? args[idx + 1]! : null;
}

async function main() {
  const args = process.argv.slice(2);
  const llmConfig = parseArg(args, '--llm-config');
  const taskPath = parseArg(args, '--task');
  const taskPrompt = parseArg(args, '--task-prompt');

  if (!llmConfig || (!taskPath && !taskPrompt)) {
    console.error('Usage: npx tsx agent/index.ts --llm-config <path> (--task <path> | --task-prompt "...")');
    console.error('  --llm-config   LLM 配置文件路径（必填）');
    console.error('  --task         任务提示词文件路径（推荐）');
    console.error('  --task-prompt   直接传入任务提示词');
    console.error('  --log-dir       日志存储目录（默认: /tmp/srs-agent-traces）');
    console.error('  --project-root  项目根目录（默认: CWD）');
    console.error('  --skills-dir    skills 目录（默认: <project-root>/.claude/skills）');
    console.error('  --work-dir      测试工作目录（默认: /tmp/srs-debug-<timestamp>/.srs_formalizer）');
    process.exit(1);
  }

  const logDir = parseArg(args, '--log-dir')
    || process.env.AGENT_LOG_DIR
    || '/tmp/srs-agent-traces';

  const projectRoot = parseArg(args, '--project-root')
    || process.env.PROJECT_ROOT
    || process.cwd();

  const skillsDir = parseArg(args, '--skills-dir')
    || process.env.SKILLS_DIR
    || path.join(projectRoot, '.claude', 'skills');

  const workDir = parseArg(args, '--work-dir')
    || process.env.WORK_DIR
    || path.join('/tmp', `srs-debug-${Date.now()}`, '.srs_formalizer');

  process.env.SKILL_SCRIPTS_DIR = skillsDir;
  process.env.WORK_DIR = workDir;

  const task = taskPath ? fs.readFileSync(taskPath, 'utf-8') : taskPrompt!;

  const registry = new ToolRegistry();
  const directory = new AgentDirectory();

  console.log(`Agent starting...`);
  console.log(`  LLM config: ${llmConfig}`);
  console.log(`  Project root: ${projectRoot}`);
  console.log(`  Skills dir: ${skillsDir}`);
  console.log(`  Work dir: ${workDir}`);
  console.log(`  Log dir: ${logDir}`);

  const { agent, id } = await createAgent({
    configPath: llmConfig,
    role: 'orchestrator',
    registry,
    directory,
    logDir,
    skillsDir,
    projectRoot,
  });

  console.log(`Agent ID: ${id}`);

  const result = await agent.invoke(
    { messages: [{ role: 'user', content: task }] },
    { recursionLimit: 200 },
  );

  const msgs = result.messages || [];
  const lastMsg = msgs[msgs.length - 1];
  const finalContent = lastMsg ? (lastMsg.content as string) || '' : '';

  console.log('\n=== Agent Output ===');
  console.log(finalContent.slice(0, 2000));
  console.log(`\nAgents in directory: ${directory.size}`);
  console.log(`Total messages: ${msgs.length}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
