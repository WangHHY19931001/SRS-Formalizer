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
  compile           Compile SKILL.md into SkIR, inject safety constraints, emit artifacts
  pack-skill        Pack skill directory into hash manifest + tar.gz backup
  verify-skill-integrity Verify skill file integrity (--repair to auto-restore)

Options:
  --help    Show this help message
`;

function printUsage(): void {
  console.log(USAGE);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Block poison values (undefined, null, NaN, etc.) in any position
  const { validateNoPoisonArgs } = await import('./lib/cli.js');
  try {
    validateNoPoisonArgs(args);
  } catch (err) {
    console.error(JSON.stringify({ status: 'error', message: (err as Error).message }));
    process.exit(1);
  }

  if (args.length === 0 || args[0] === '--help') {
    printUsage();
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case 'init': {
      const { main: initMain } = await import('./commands/init.js');
      const result = await initMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'manifest': {
      const { main: manifestMain } = await import('./commands/manifest.js');
      const result = await manifestMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'inject-prompt': {
      const { main: injectMain } = await import('./commands/inject-prompt.js');
      const result = await injectMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'guided-extract': {
      const { main: guidedExtractMain } = await import('./commands/guided-extract.js');
      const result = await guidedExtractMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'validate-jsonl': {
      const { main: validateMain } = await import('./commands/validate-jsonl.js');
      const result = await validateMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'build-graph': {
      const { main: buildGraphMain } = await import('./commands/build-graph.js');
      const result = await buildGraphMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'analyze-structure': {
      const { main: analyzeMain } = await import('./commands/analyze-structure.js');
      const result = await analyzeMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'merge-structure': {
      const { main: mergeMain } = await import('./commands/merge-structure.js');
      const result = await mergeMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'analyze-graph': {
      const { main: analyzeGraphMain } = await import('./commands/analyze-graph.js');
      const result = await analyzeGraphMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'merge-analysis': {
      const { main: mergeAnalysisMain } = await import('./commands/merge-analysis.js');
      const result = await mergeAnalysisMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'export-cypher': {
      const { main: exportCypherMain } = await import('./commands/export-cypher.js');
      const result = await exportCypherMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'verify-gate': {
      const { main: verifyGateMain } = await import('./commands/verify-gate.js');
      const result = await verifyGateMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'generate-bdd': {
      const { main: generateBddMain } = await import('./commands/generate-bdd.js');
      const result = await generateBddMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'validate-bdd': {
      const { main: validateBddMain } = await import('./commands/validate-bdd.js');
      const result = await validateBddMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'query-graph': {
      const { main: queryGraphMain } = await import('./commands/query-graph.js');
      const result = await queryGraphMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'build-architecture': {
      const { main: buildArchMain } = await import('./commands/build-architecture.js');
      const result = await buildArchMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'build-behavior-graph': {
      const { main: buildBehaviorMain } = await import('./commands/build-behavior-graph.js');
      const result = await buildBehaviorMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'build-tla-graph': {
      const { main: buildTlaMain } = await import('./commands/build-tla-graph.js');
      const result = await buildTlaMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'build-lean-graph': {
      const { main: buildLeanMain } = await import('./commands/build-lean-graph.js');
      const result = await buildLeanMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'build-system-architecture': {
      const { main: buildSysArchMain } = await import('./commands/build-system-architecture.js');
      const result = await buildSysArchMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'validate-architecture': {
      const { main: validateArchMain } = await import('./commands/validate-architecture.js');
      const result = await validateArchMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'validate-cypher': {
      const { main: validateCypherMain } = await import('./commands/validate-cypher.js');
      const result = await validateCypherMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'validate-glossary': {
      const { main: validateGlossaryMain } = await import('./commands/validate-glossary.js');
      const result = await validateGlossaryMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'validate-tla': {
      const { main: validateTlaMain } = await import('./commands/validate-tla.js');
      result = await validateTlaMain(positional);
      break;
    }
    case 'validate-lean': {
      const { main: validateLeanMain } = await import('./commands/validate-lean.js');
      result = await validateLeanMain(positional);
      break;
    }
    case 'validate-checklist': {
      const { main: validateChecklistMain } = await import('./commands/validate-checklist.js');
      const result = await validateChecklistMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'capability-probe': {
      const { main: probeMain } = await import('./commands/capability-probe.js');
      const result = await probeMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'pack-skill': {
      const { main: packMain } = await import('./commands/pack-skill.js');
      const result = await packMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'verify-skill-integrity': {
      const { main: verifyIntegrityMain } = await import('./commands/verify-skill-integrity.js');
      const result = await verifyIntegrityMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'compile': {
      const { main: compileMain } = await import('./commands/compile.js');
      const result = await compileMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
