#!/usr/bin/env node
/**
 * SRS-Formalizer CLI 入口。
 * 子命令模式：node index.ts <command> [options]
 */

const USAGE = `Usage: npx tsx index.ts <command> [options]

Commands:
  init               Initialize .srs_formalizer working directory
  manifest           Shard SRS and recognize chapters
  inject-prompt      Inject params into a template and output result
  guided-extract     Interactive line-by-line JSONL extraction with validation
  validate-jsonl     Validate JSONL file (6 checks)
  build-graph        Build requirement knowledge graph from JSONL files
  analyze-structure  Analyze graph for structural defects
  merge-structure    Merge sub-agent completion suggestions into graph
  analyze-graph      Analyze graph for semantic issues (duplicates, conflicts, aspects)
  merge-analysis     Merge sub-agent analysis verdicts into graph
  export-cypher      Export knowledge graph as Cypher script
  verify-gate        Run verification gate checks (--stage S1|R3|FINAL)
  generate-bdd       Generate Gherkin BDD skeleton from requirement graph
  validate-bdd       Validate .feature files in the workdir
  query-graph        Graph query and traversal interface (--query <type> --params '<json>')
  build-architecture Build architecture graph from architecture JSONL files
  build-behavior-graph Build system behavior graph from BDD feature files
  build-tla-graph    Build system interaction graph from TLA+ specs
  build-lean-graph     Build proof dependency graph from Lean 4 proofs
  build-system-architecture Build cross-layer synthesis graph + consistency check
  validate-architecture Validate architecture JSONL records (6 checks)
  validate-cypher   Validate .cypher script file (4 checks)
  validate-glossary Validate glossary JSON file (8 checks + gate)
  validate-tla       Validate .tla file (SANY parse + TLC model check)
  validate-lean      Validate .lean file (lake build)
  validate-checklist Validate CHECKLIST.md file
  capability-probe  LLM capability probe evaluation (--mode generate|score)
  stability-test   Cross-LLM stability test (--config <path> [--passes 3] [--score <dir>])
  compile           Compile SKILL.md into SkIR, inject safety constraints, emit artifacts
  pack-skill        Pack skill directory into hash manifest + tar.gz backup
  verify-skill-integrity Verify skill file integrity (--repair to auto-restore)

Options:
  --help    Show this help message
`;

function printUsage(): void {
  console.log(USAGE);
}

// ── Command registry (data-driven dispatch) ──────────────────────────────
const COMMANDS: Record<
  string,
  () => Promise<{ main: (args: string[]) => Promise<{ status: string; message?: string; data?: unknown }> }>
> = {
  init: () => import("./commands/init.js"),
  manifest: () => import("./commands/manifest.js"),
  "inject-prompt": () => import("./commands/inject-prompt.js"),
  "guided-extract": () => import("./commands/guided-extract.js"),
  "validate-jsonl": () => import("./commands/validate-jsonl.js"),
  "build-graph": () => import("./commands/build-graph.js"),
  "analyze-structure": () => import("./commands/analyze-structure.js"),
  "merge-structure": () => import("./commands/merge-structure.js"),
  "analyze-graph": () => import("./commands/analyze-graph.js"),
  "merge-analysis": () => import("./commands/merge-analysis.js"),
  "export-cypher": () => import("./commands/export-cypher.js"),
  "verify-gate": () => import("./commands/verify-gate.js"),
  "generate-bdd": () => import("./commands/generate-bdd.js"),
  "validate-bdd": () => import("./commands/validate-bdd.js"),
  "query-graph": () => import("./commands/query-graph.js"),
  "build-architecture": () => import("./commands/build-architecture.js"),
  "build-behavior-graph": () => import("./commands/build-behavior-graph.js"),
  "build-tla-graph": () => import("./commands/build-tla-graph.js"),
  "build-lean-graph": () => import("./commands/build-lean-graph.js"),
  "build-system-architecture": () => import("./commands/build-system-architecture.js"),
  "validate-architecture": () => import("./commands/validate-architecture.js"),
  "validate-cypher": () => import("./commands/validate-cypher.js"),
  "validate-glossary": () => import("./commands/validate-glossary.js"),
  "validate-tla": () => import("./commands/validate-tla.js"),
  "validate-lean": () => import("./commands/validate-lean.js"),
  "validate-checklist": () => import("./commands/validate-checklist.js"),
  "capability-probe": () => import("./commands/capability-probe.js"),
  "stability-test": () => import("./commands/stability-test.js"),
  "pack-skill": () => import("./commands/pack-skill.js"),
  "verify-skill-integrity": () => import("./commands/verify-skill-integrity.js"),
  compile: () => import("./commands/compile.js"),
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Block poison values (undefined, null, NaN, etc.) in any position
  const { validateNoPoisonArgs } = await import("./lib/cli.js");
  try {
    validateNoPoisonArgs(args);
  } catch (err) {
    console.error(
      JSON.stringify({ status: "error", message: (err as Error).message }),
    );
    process.exit(1);
  }

  if (args.length === 0 || args[0] === "--help") {
    printUsage();
    process.exit(0);
  }

  const command = args[0] as string;
  const loader = COMMANDS[command];

  if (!loader) {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }

  const mod = await loader();
  const result = await mod.main(args.slice(1));
  console.log(JSON.stringify(result));
  process.exit(result.status === "ok" ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
