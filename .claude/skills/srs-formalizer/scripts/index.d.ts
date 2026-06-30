#!/usr/bin/env node
/**
 * SRS-Formalizer CLI 入口。
 * 子命令模式：node index.ts <command> [options]
 */
declare const USAGE = "Usage: npx tsx index.ts <command> [options]\n\nCommands:\n  init               Initialize .srs_formalizer working directory\n  manifest           Shard SRS and recognize chapters\n  inject-prompt      Inject params into a template and output result\n  validate-jsonl     Validate JSONL file (6 checks)\n  build-graph        Build requirement knowledge graph from JSONL files\n  analyze-structure  Analyze graph for structural defects\n  merge-structure    Merge sub-agent completion suggestions into graph\n  analyze-graph      Analyze graph for semantic issues (duplicates, conflicts, aspects)\n  merge-analysis     Merge sub-agent analysis verdicts into graph\n  export-cypher      Export knowledge graph as Cypher script\n  verify-gate        Run verification gate checks (--stage S1|R3|FINAL)\n  generate-bdd       Generate Gherkin BDD skeleton from requirement graph\n  validate-bdd       Validate .feature files in the workdir\n  query-graph        Graph query and traversal interface (--query <type> --params '<json>')\n\nOptions:\n  --help    Show this help message\n";
declare function printUsage(): void;
declare function main(): Promise<void>;
