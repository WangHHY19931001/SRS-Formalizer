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
  validate-architecture Validate architecture JSONL records (6 checks)
  validate-cypher   Validate .cypher script file (4 checks)
  validate-checklist Validate CHECKLIST.md file
  capability-probe  LLM capability probe evaluation (--mode generate|score)

Options:
  --help    Show this help message
`;

function printUsage(): void {
  console.log(USAGE);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

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
