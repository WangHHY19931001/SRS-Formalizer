#!/usr/bin/env node
/**
 * SRS-Formalizer CLI 入口。
 * 子命令模式：node index.ts <command> [options]
 */

interface CommandHelp {
  name: string;
  desc: string;
  usage?: string;
}

interface CommandGroup {
  title: string;
  commands: CommandHelp[];
}

const COMMAND_GROUPS: CommandGroup[] = [
  {
    title: "Gate Validators (门禁校验器，只做确定性校验)",
    commands: [
      { name: "validate-jsonl", desc: "校验 JSONL 记录格式 (6 项)", usage: "validate-jsonl --file <path> --workdir .srs_formalizer" },
      { name: "validate-semantics", desc: "校验 srs-ir.json 语义一致性 [--strict]", usage: "validate-semantics --workdir .srs_formalizer [--strict]" },
      { name: "validate-architecture", desc: "校验架构 JSONL (6 项)", usage: "validate-architecture --workdir .srs_formalizer" },
      { name: "validate-cypher", desc: "校验 .cypher 语法 (4 项)", usage: "validate-cypher --file <path> --workdir .srs_formalizer" },
      { name: "validate-bdd", desc: "校验 .feature (Phase1-4) [--strict --promote]", usage: "validate-bdd [--strict --promote] --workdir .srs_formalizer" },
      { name: "validate-tla", desc: "校验 .tla + .cfg (SANY+TLC) [--strict --promote]", usage: "validate-tla --name <module> [--strict --promote] --workdir .srs_formalizer" },
      { name: "validate-lean", desc: "校验 Lake 项目 (lake build) [--strict --promote]", usage: "validate-lean [--strict --promote] --workdir .srs_formalizer" },
      { name: "validate-glossary", desc: "校验术语 JSON (8 项)", usage: "validate-glossary --file <path> --workdir .srs_formalizer" },
      { name: "validate-checklist", desc: "校验 CHECKLIST.md 完整性", usage: "validate-checklist --workdir .srs_formalizer" },
      { name: "validate-dataflow", desc: "校验数据流抽取 JSONL (entity/flow)", usage: "validate-dataflow --file <path> --workdir .srs_formalizer" },
      { name: "verify-gate", desc: "三级门禁 (S1|R3|FINAL)", usage: "verify-gate --stage <S1|R3|FINAL> --workdir .srs_formalizer" },
    ],
  },
  {
    title: "Independent Tools (独立工具，处理 LLM 不便操作的数据结构/算法)",
    commands: [
      { name: "assemble-ir", desc: "JSONL → srs-ir.json 装配 + 完整性校验", usage: "assemble-ir --workdir .srs_formalizer" },
      { name: "check-connectivity", desc: "图连通性/SCC/孤岛检测", usage: "check-connectivity --workdir .srs_formalizer" },
      { name: "analyze-dataflow", desc: "数据流审视提示 (死点/边界/gap/环路，恒warning) [--assess 评估注入门控]", usage: "analyze-dataflow --workdir .srs_formalizer [--assess --fp-rate <0~1> --sample-size <n> --assessed-by <name>]" },
      { name: "build-rid-mapping", desc: "构建 RID↔IR 映射契约 (§P1-2)", usage: "build-rid-mapping --frozen <dir> --workdir .srs_formalizer [--strict]" },
      { name: "analyze-fidelity", desc: "跨产物反弱化分析 (需求→BDD→TLA→Lean)", usage: "analyze-fidelity --workdir .srs_formalizer [--strict]" },
      { name: "validate-convergence-log", desc: "收敛日志校验/记录弱化动作 (§P2-2)", usage: "validate-convergence-log --workdir .srs_formalizer [--append '<json>']" },
      { name: "query-graph", desc: "IR 查询接口 (node/neighbors/module/path)", usage: "query-graph --query <type> --params '<json>' --workdir .srs_formalizer" },
      { name: "hash-compute", desc: "计算/比对 SHA-256 sourceHash", usage: "hash-compute --file <path> [--compare <hash>] --workdir .srs_formalizer" },
      { name: "tlc-trace-parse", desc: "解析 TLC 反例 trace 为状态序列", usage: "tlc-trace-parse --trace <path> --workdir .srs_formalizer" },
      { name: "verify-skill-integrity", desc: "技能完整性校验 [--repair]", usage: "verify-skill-integrity --skill-dir <path> [--repair]" },
      { name: "pack-skill", desc: "加密备份 (仅人类 --force)", usage: "pack-skill --skill-dir <path> --output <backup.tar.gz> --force" },
    ],
  },
];

function getCommandHelp(name: string): CommandHelp | undefined {
  for (const group of COMMAND_GROUPS) {
    const cmd = group.commands.find(c => c.name === name);
    if (cmd) return cmd;
  }
  return undefined;
}

function printUsage(command?: string): void {
  if (command && command !== "--help") {
    const cmd = getCommandHelp(command);
    if (cmd) {
      console.log(`
SRS-Formalizer v2.0.0 — ${cmd.name}
${"─".repeat(60)}
${cmd.desc}

Usage:
  npx tsx index.ts ${cmd.usage ?? cmd.name}

All commands output JSON { status, message?, data? }.

For full spec see: docs/DESIGN.md
`);
      return;
    }
    console.error(`Unknown command for help: ${command}`);
  }

  console.log(`
SRS-Formalizer CLI v2.1.0 — Agent-driven SRS formalization skill
脚本只做门禁校验与专用算法，语义工作由 Agent 经 SKILL.md + prompts 完成。
`);

  for (const group of COMMAND_GROUPS) {
    console.log(`\n${group.title}:`);
    for (const cmd of group.commands) {
      const padding = " ".repeat(Math.max(1, 24 - cmd.name.length));
      console.log(`  ${cmd.name}${padding}${cmd.desc}`);
    }
  }

  console.log(`

Usage: npx tsx index.ts <command> [options]
       npx tsx index.ts --help              Show this help message
       npx tsx index.ts --help <command>    Show help for a specific command

All commands output JSON { status, message?, data? }.

For full spec see: docs/DESIGN.md
`);
}

// ── Command registry (data-driven dispatch) ──────────────────────────────
const COMMANDS: Record<
  string,
  () => Promise<{ main: (args: string[]) => Promise<{ status: string; message?: string; data?: unknown }> }>
> = {
  "validate-jsonl": () => import("./commands/validate-jsonl.js"),
  "validate-semantics": () => import("./commands/validate-semantics.js"),
  "verify-gate": () => import("./commands/verify-gate.js"),
  "validate-bdd": () => import("./commands/validate-bdd.js"),
  "query-graph": () => import("./commands/query-graph.js"),
  "validate-architecture": () => import("./commands/validate-architecture.js"),
  "validate-cypher": () => import("./commands/validate-cypher.js"),
  "validate-glossary": () => import("./commands/validate-glossary.js"),
  "validate-tla": () => import("./commands/validate-tla.js"),
  "validate-lean": () => import("./commands/validate-lean.js"),
  "validate-checklist": () => import("./commands/validate-checklist.js"),
  "validate-dataflow": () => import("./commands/validate-dataflow.js"),
  "pack-skill": () => import("./commands/pack-skill.js"),
  "verify-skill-integrity": () => import("./commands/verify-skill-integrity.js"),
  "assemble-ir": () => import("./commands/assemble-ir.js"),
  "check-connectivity": () => import("./commands/check-connectivity.js"),
  "analyze-dataflow": () => import("./commands/analyze-dataflow.js"),
  "build-rid-mapping": () => import("./commands/build-rid-mapping.js"),
  "analyze-fidelity": () => import("./commands/analyze-fidelity.js"),
  "validate-convergence-log": () => import("./commands/validate-convergence-log.js"),
  "hash-compute": () => import("./commands/hash-compute.js"),
  "tlc-trace-parse": () => import("./commands/tlc-trace-parse.js"),
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { validateNoPoisonArgs } = await import("./lib/cli.js");
  try { validateNoPoisonArgs(args); } catch (err) {
    console.error(JSON.stringify({ status: "error", message: (err as Error).message }));
    process.exit(1);
  }

  if (args.length === 0 || args[0] === "--help") {
    printUsage(args.length >= 2 ? args[1] : undefined);
    process.exit(0);
  }

  const command = args[0] as string;
  const loader = COMMANDS[command];
  if (!loader) {
    const hint = command.includes('-') ? '' : ` Did you mean "${command}-xxx"?`;
    console.error(JSON.stringify({ status: "error", message: `Unknown command: ${command}. Run --help for usage.${hint}` }));
    process.exit(1);
  }

  let mod;
  try { mod = await loader(); } catch (err) {
    console.error(JSON.stringify({ status: "error", message: `Failed to load "${command}": ${(err as Error).message}` }));
    process.exit(1);
  }
  const result = await mod.main(args.slice(1));
  console.log(JSON.stringify(result));
  process.exit(result.status === "ok" || result.status === "warn" ? 0 : 1);
}

main().catch((err) => {
  console.error(JSON.stringify({ status: "error", message: `Fatal error: ${(err as Error).message}` }));
  process.exit(1);
});
