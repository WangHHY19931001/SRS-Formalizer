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
    title: "Project Setup",
    commands: [
      { name: "init", desc: "Initialize .srs_formalizer working directory", usage: "init --output .srs_formalizer" },
      { name: "health-check", desc: "Environment verification and capability self-report", usage: "health-check [--workdir .srs_formalizer]" },
    ],
  },
  {
    title: "Agent Integration (Issue #14)",
    commands: [
      { name: "tools-schema", desc: "Output OpenAI/Anthropic Tool Calling schemas for agent integration", usage: "tools-schema [--format openai|anthropic] [--output <file>]" },
      { name: "status", desc: "Show workdir status dashboard (stage, artifacts, next actions)", usage: "status --workdir .srs_formalizer [--format json|text]" },
    ],
  },
  {
    title: "Frontend (SRS → IR)",
    commands: [
      { name: "manifest", desc: "Shard SRS and recognize chapters", usage: "manifest --src <srs-file> --lang zh|en --workdir .srs_formalizer" },
      { name: "guided-extract", desc: "Interactive line-by-line JSONL extraction with validation", usage: "guided-extract --workdir .srs_formalizer" },
      { name: "build-ir", desc: "Build SRS IR graph from extracted JSONL files", usage: "build-ir --workdir .srs_formalizer" },
      { name: "inject-prompt", desc: "Inject params into a template and output result", usage: "inject-prompt --template <path> --params '<json>'" },
    ],
  },
  {
    title: "Middle-end (IR Analysis)",
    commands: [
      { name: "analyze-structure", desc: "Analyze graph for structural defects", usage: "analyze-structure --workdir .srs_formalizer" },
      { name: "merge-structure", desc: "Merge sub-agent completion suggestions into graph", usage: "merge-structure --workdir .srs_formalizer" },
      { name: "analyze-graph", desc: "Analyze graph for semantic issues (duplicates, conflicts)", usage: "analyze-graph --workdir .srs_formalizer" },
      { name: "merge-analysis", desc: "Merge sub-agent analysis verdicts into graph", usage: "merge-analysis --workdir .srs_formalizer" },
      { name: "tag-nfr", desc: "Detect and tag NFR nodes in srs-ir.json", usage: "tag-nfr --workdir .srs_formalizer" },
      { name: "check-connectivity", desc: "Check cross-shard connectivity in srs-ir.json", usage: "check-connectivity --workdir .srs_formalizer" },
      { name: "score-risk", desc: "Compute risk score from srs-ir.json", usage: "score-risk --workdir .srs_formalizer" },
    ],
  },
  {
    title: "Backend (Emit Artifacts)",
    commands: [
      { name: "emit", desc: "Emit artifacts from IR (--group graphs|bdd|formal|vmodel|verify|all)", usage: "emit --group all --workdir .srs_formalizer" },
    ],
  },
  {
    title: "Validation & Promotion",
    commands: [
      { name: "validate-jsonl", desc: "Validate JSONL file (6 checks)", usage: "validate-jsonl --file <path> --workdir .srs_formalizer" },
      { name: "validate-architecture", desc: "Validate architecture JSONL records (6 checks)", usage: "validate-architecture --workdir .srs_formalizer" },
      { name: "validate-cypher", desc: "Validate .cypher script file (4 checks)", usage: "validate-cypher --file <path> --workdir .srs_formalizer" },
      { name: "validate-bdd", desc: "Validate .feature files (add --strict --promote to verify and promote)", usage: "validate-bdd --strict --promote --workdir .srs_formalizer" },
      { name: "validate-glossary", desc: "Validate glossary JSON file (8 checks + gate)", usage: "validate-glossary --file <path> --workdir .srs_formalizer" },
      { name: "validate-tla", desc: "Validate .tla file with SANY + TLC (--strict --promote)", usage: "validate-tla --name <module> --strict --promote --workdir .srs_formalizer" },
      { name: "validate-lean", desc: "Validate .lean file with lake build (--strict --promote)", usage: "validate-lean --strict --promote --workdir .srs_formalizer" },
      { name: "validate-checklist", desc: "Validate CHECKLIST.md file", usage: "validate-checklist --stage <S0-S6> --workdir .srs_formalizer" },
      { name: "verify-gate", desc: "Run verification gate checks (--stage S1|R3|FINAL)", usage: "verify-gate --stage FINAL --workdir .srs_formalizer" },
    ],
  },
  {
    title: "One-Shot Pipeline",
    commands: [
      { name: "pipeline", desc: "Complete SRS formalization pipeline with progress reporting and session persistence", usage: "pipeline --src <srs-file> --lang zh|en --workdir .srs_formalizer [--strict] [--full] [--auto-validate] [--skip-init] [--verbose]" },
    ],
  },
  {
    title: "Audit & Reporting (Issue #15)",
    commands: [
      { name: "export-audit", desc: "Export audit package with traceability, validation reports, hash chains", usage: "export-audit --workdir .srs_formalizer --output <audit-dir>" },
    ],
  },
  {
    title: "Graph & Architecture",
    commands: [
      { name: "query-graph", desc: "Graph query and traversal interface", usage: "query-graph --query <type> --params '<json>' --workdir .srs_formalizer" },
      { name: "build-architecture", desc: "Build architecture graph from JSONL files", usage: "build-architecture --workdir .srs_formalizer" },
    ],
  },
  {
    title: "Test Fixtures",
    commands: [
      { name: "generate-test-fixtures", desc: "Generate test fixtures from verified artifacts", usage: "generate-test-fixtures --level unit|integration|e2e --framework <fw> --workdir .srs_formalizer" },
      { name: "generate-counterexample-fixtures", desc: "Generate counterexample fixtures from TLC trace", usage: "generate-counterexample-fixtures --trace <path> --framework <fw> --workdir .srs_formalizer" },
      { name: "fixture-coverage", desc: "Compute fixture coverage report", usage: "fixture-coverage --workdir .srs_formalizer" },
      { name: "generate-vmodel-matrix", desc: "Build V-Model traceability matrix", usage: "generate-vmodel-matrix --format markdown|cypher [--output <path>] --workdir .srs_formalizer" },
    ],
  },
  {
    title: "Skill Development",
    commands: [
      { name: "compile", desc: "Compile SKILL.md into SkIR, inject safety constraints, emit artifacts", usage: "compile --skill-dir <path> --workdir .srs_formalizer" },
      { name: "pack-skill", desc: "Pack skill directory into hash manifest + tar.gz backup", usage: "pack-skill --skill-dir <path> --output <backup.tar.gz>" },
      { name: "verify-skill-integrity", desc: "Verify skill file integrity (--repair to auto-restore)", usage: "verify-skill-integrity --skill-dir <path> [--repair]" },
      { name: "capability-probe", desc: "LLM capability probe evaluation (--mode generate|score)", usage: "capability-probe --mode generate|score [--file <path>]" },
      { name: "stability-test", desc: "Cross-LLM stability test", usage: "stability-test --config <path> [--passes 3] [--score <dir>]" },
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
SRS-Formalizer — ${cmd.name}
${"─".repeat(60)}
${cmd.desc}

Usage:
  npx tsx index.ts ${cmd.usage ?? cmd.name}

Common Options:
  --workdir <path>      Working directory (must be .srs_formalizer)
  --src <path>          Source SRS file
  --lang zh|en          SRS language
  --strict              Enable strict validation mode
  --promote             Promote draft artifacts to verified after successful validation
  --full                Full pipeline mode (auto-enables --strict + --auto-validate)
  --auto-validate       Auto-run BDD validation after emit
  --verbose             Enable verbose output with memory usage stats
  --format fmt          Output format (json|text|openai|anthropic)
  --output <path>       Output file/directory path
  --skip-init           Skip initialization (resume existing workdir)

Environment Variables:
  NO_COLOR=1            Disable colored output
  VERBOSE=1             Same as --verbose

Run "npx tsx index.ts --help" for a list of all commands.
Run "npx tsx index.ts tools-schema" for agent tool-calling integration.
Run "npx tsx index.ts health-check" to verify your environment first.
`);
      return;
    }
    console.error(`Unknown command for help: ${command}`);
  }

  console.log(`
SRS-Formalizer v1.1.0 — AI Agent Skill for SRS Formalization
${"═".repeat(60)}
Compiler architecture: SRS → Frontend → Middle-end → Backend → Verified Artifacts

Usage: npx tsx index.ts <command> [options]
       npx tsx index.ts --help              Show this help message
       npx tsx index.ts --help <command>    Show help for a specific command

Global Options:
  --help     Show help (add command name for detailed help)
`);

  for (const group of COMMAND_GROUPS) {
    console.log(`\n${group.title}:`);
    console.log("─".repeat(50));
    for (const cmd of group.commands) {
      const padding = " ".repeat(Math.max(0, 28 - cmd.name.length));
      console.log(`  ${cmd.name}${padding}${cmd.desc}`);
    }
  }

  console.log(`
Quick Start (Complete Pipeline):
${"─".repeat(50)}
  # 1. Check environment first
  npx tsx index.ts health-check

  # 2. Run full pipeline (pauses at guided-extract for AI agent)
  npx tsx index.ts pipeline --src ../examples/online-store-srs.md --lang zh --workdir .srs_formalizer --full

  # 3. After guided-extract completes, resume with validation
  npx tsx index.ts pipeline --skip-init --workdir .srs_formalizer --strict

  # 4. Check status and next actions at any time
  npx tsx index.ts status --workdir .srs_formalizer --format text

  # 5. Export audit package when done
  npx tsx index.ts export-audit --workdir .srs_formalizer --output ./audit-report

Agent Integration (Tool Calling):
${"─".repeat(50)}
  # Generate OpenAI-compatible tool schemas
  npx tsx index.ts tools-schema --format openai --output ./tools.json

  # Generate Anthropic-compatible tool schemas
  npx tsx index.ts tools-schema --format anthropic

For more information, see:
  docs/DESIGN.md     - Complete design specification (SSOT)
  README.md          - Project overview and quick start
  SKILL.md           - Skill usage guide for AI agents
  AGENTS.md          - Repository guide for contributors
`);
}

// ── Command registry (data-driven dispatch) ──────────────────────────────
const COMMANDS: Record<
  string,
  () => Promise<{ main: (args: string[]) => Promise<{ status: string; message?: string; data?: unknown }> }>
> = {
  init: () => import("./commands/init.js"),
  "health-check": () => import("./commands/health-check.js"),
  manifest: () => import("./commands/manifest.js"),
  "inject-prompt": () => import("./commands/inject-prompt.js"),
  "guided-extract": () => import("./commands/guided-extract.js"),
  "validate-jsonl": () => import("./commands/validate-jsonl.js"),
  "analyze-structure": () => import("./commands/analyze-structure.js"),
  "merge-structure": () => import("./commands/merge-structure.js"),
  "analyze-graph": () => import("./commands/analyze-graph.js"),
  "merge-analysis": () => import("./commands/merge-analysis.js"),
  "verify-gate": () => import("./commands/verify-gate.js"),
  "validate-bdd": () => import("./commands/validate-bdd.js"),
  "query-graph": () => import("./commands/query-graph.js"),
  "build-architecture": () => import("./commands/build-architecture.js"),
  "validate-architecture": () => import("./commands/validate-architecture.js"),
  "validate-cypher": () => import("./commands/validate-cypher.js"),
  "validate-glossary": () => import("./commands/validate-glossary.js"),
  "validate-tla": () => import("./commands/validate-tla.js"),
  "validate-lean": () => import("./commands/validate-lean.js"),
  "validate-checklist": () => import("./commands/validate-checklist.js"),
  "capability-probe": () => import("./commands/capability-probe.js"),
  "stability-test": () => import("./commands/stability-test.js"),
  pipeline: () => import("./commands/pipeline.js"),
  "pack-skill": () => import("./commands/pack-skill.js"),
  "verify-skill-integrity": () => import("./commands/verify-skill-integrity.js"),
  compile: () => import("./commands/compile.js"),
  "generate-test-fixtures": () => import("./commands/generate-test-fixtures.js"),
  "generate-counterexample-fixtures": () => import("./commands/generate-counterexample-fixtures.js"),
  "fixture-coverage": () => import("./commands/fixture-coverage.js"),
  "generate-vmodel-matrix": () => import("./commands/generate-vmodel-matrix.js"),
  "build-ir": () => import("./commands/build-ir.js"),
  "tag-nfr": () => import("./commands/tag-nfr.js"),
  "check-connectivity": () => import("./commands/check-connectivity.js"),
  "score-risk": () => import("./commands/score-risk.js"),
  emit: () => import("./commands/emit.js"),
  "tools-schema": () => import("./commands/tools-schema.js"),
  status: () => import("./commands/status.js"),
  "export-audit": () => import("./commands/export-audit.js"),
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
