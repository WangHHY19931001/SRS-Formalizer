#!/usr/bin/env node
import { createAgent } from "./agent.js";
import { ToolRegistry } from "./tool-registry.js";
import { AgentDirectory } from "./agent-directory.js";
import * as fs from "node:fs";
import * as path from "node:path";

function parseArg(args: string[], name: string): string | null {
  const idx = args.indexOf(name);
  return (idx !== -1 && idx + 1 < args.length) ? args[idx + 1]! : null;
}

async function main() {
  const args = process.argv.slice(2);
  const llmConfig = parseArg(args, "--llm-config");
  const taskPath = parseArg(args, "--task");
  const taskPrompt = parseArg(args, "--task-prompt");
  const logDir = parseArg(args, "--log-dir") || process.env.AGENT_LOG_DIR || "/tmp/srs-agent-traces";
  const projectRoot = parseArg(args, "--project-root") || process.env.PROJECT_ROOT || process.cwd();
  const skillsDir = parseArg(args, "--skills-dir") || process.env.SKILLS_DIR || path.join(projectRoot, ".claude", "skills");
  const workDir = parseArg(args, "--work-dir") || process.env.WORK_DIR || path.join("/tmp", `srs-debug-${Date.now()}`, ".srs_formalizer");

  if (!llmConfig || (!taskPath && !taskPrompt)) {
    console.error("Usage: npx tsx agent/index.ts --llm-config <path> (--task <path> | --task-prompt \"...\")");
    console.error("  --log-dir, --project-root, --skills-dir, --work-dir");
    process.exit(1);
  }

  process.env.SKILL_SCRIPTS_DIR = skillsDir;
  process.env.WORK_DIR = workDir;
  fs.mkdirSync(logDir, { recursive: true });

  const task = taskPath ? fs.readFileSync(taskPath, "utf-8") : taskPrompt!;
  const registry = new ToolRegistry();
  const directory = new AgentDirectory();

  const { agent, id } = await createAgent({ configPath: llmConfig, role: "orchestrator", registry, directory });

  console.log(`Agent: ${id}`);
  console.log(`Logs: ${logDir}`);
  const result = await agent.invoke({ messages: [{ role: "user", content: task }] });
  const msgs = result.messages || [];
  const finalMsg = msgs.length > 0 ? (msgs[msgs.length - 1] as any).content?.toString() || "" : "";
  console.log(finalMsg.slice(0, 800));
  console.log(`\nAgents spawned: ${directory.size}`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
