/**
 * tools-schema.ts — Output OpenAI/Anthropic-compatible Tool/Function Calling schemas
 *
 * CLI: npx tsx index.ts tools-schema [--format openai|anthropic] [--output <file>]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { safeParseArg } from '../lib/cli.js';

interface ToolDef {
  name: string;
  description: string;
  parameters: { type: 'object'; properties: Record<string, { type: string; description: string; enum?: string[] }>; required: string[] };
}

const TOOLS: ToolDef[] = [
  { name: 'health_check', description: 'Verify environment readiness (Node.js, Java, Lean 4, dependencies)',
    parameters: { type: 'object', properties: { workdir: { type: 'string', description: '.srs_formalizer path (optional)' } }, required: [] } },
  { name: 'capability_probe', description: 'Run LLM capability evaluation probe',
    parameters: { type: 'object', properties: { mode: { type: 'string', description: 'Probe mode', enum: ['generate', 'score'] }, file: { type: 'string', description: 'Input/output file path' } }, required: ['mode'] } },
  { name: 'init', description: 'Initialize .srs_formalizer working directory',
    parameters: { type: 'object', properties: { output: { type: 'string', description: 'Output dir (must end with .srs_formalizer)' } }, required: ['output'] } },
  { name: 'pipeline', description: 'One-shot complete SRS formalization pipeline with progress reporting',
    parameters: { type: 'object', properties: {
      src: { type: 'string', description: 'Source SRS file (.md/.html)' },
      lang: { type: 'string', description: 'SRS language code', enum: ['zh', 'en'] },
      workdir: { type: 'string', description: '.srs_formalizer path' },
      strict: { type: 'string', description: 'Strict validation flag (value: "true")' },
      full: { type: 'string', description: 'Full auto-pipeline mode with recovery hints (value: "true")' },
      auto_validate: { type: 'string', description: 'Auto-run BDD validation after emit (value: "true")' },
      skip_init: { type: 'string', description: 'Skip initialization, resume existing session (value: "true")' },
      verbose: { type: 'string', description: 'Enable verbose output with memory stats (value: "true")' },
    }, required: ['workdir'] } },
  { name: 'manifest', description: 'Parse SRS and build shard index with NFR profile and cross-references',
    parameters: { type: 'object', properties: { src: { type: 'string', description: 'SRS file path' }, lang: { type: 'string', description: 'Language', enum: ['zh', 'en'] }, workdir: { type: 'string', description: '.srs_formalizer path' } }, required: ['src', 'lang', 'workdir'] } },
  { name: 'guided_extract', description: 'Interactive line-by-line JSONL extraction (requires AI agent)',
    parameters: { type: 'object', properties: { workdir: { type: 'string', description: '.srs_formalizer path' } }, required: ['workdir'] } },
  { name: 'build_ir', description: 'Build SRS-IR graph from extracted JSONL (produces srs-ir.json)',
    parameters: { type: 'object', properties: { workdir: { type: 'string', description: '.srs_formalizer path' } }, required: ['workdir'] } },
  { name: 'analyze_structure', description: 'Analyze graph for structural defects (dangling edges, missing nodes)',
    parameters: { type: 'object', properties: { workdir: { type: 'string', description: '.srs_formalizer path' } }, required: ['workdir'] } },
  { name: 'analyze_graph', description: 'Analyze graph for semantic issues (duplicates, conflicts, contradictions)',
    parameters: { type: 'object', properties: { workdir: { type: 'string', description: '.srs_formalizer path' } }, required: ['workdir'] } },
  { name: 'tag_nfr', description: 'Detect and tag Non-Functional Requirements with thresholds in SRS-IR',
    parameters: { type: 'object', properties: { workdir: { type: 'string', description: '.srs_formalizer path' } }, required: ['workdir'] } },
  { name: 'check_connectivity', description: 'Check cross-shard connectivity, detect orphan nodes and components',
    parameters: { type: 'object', properties: { workdir: { type: 'string', description: '.srs_formalizer path' } }, required: ['workdir'] } },
  { name: 'score_risk', description: 'Compute risk scores from NFR profile, connectivity, and graph analysis',
    parameters: { type: 'object', properties: { workdir: { type: 'string', description: '.srs_formalizer path' } }, required: ['workdir'] } },
  { name: 'emit', description: 'Emit artifacts (Cypher, Gherkin, TLA+, Lean, fixtures, traceability, reports)',
    parameters: { type: 'object', properties: { group: { type: 'string', description: 'Artifact group to emit', enum: ['graphs', 'bdd', 'formal', 'vmodel', 'verify', 'all'] }, workdir: { type: 'string', description: '.srs_formalizer path' } }, required: ['group', 'workdir'] } },
  { name: 'validate_bdd', description: 'Validate Gherkin .feature files with gherkin-lint + Gherklin',
    parameters: { type: 'object', properties: { workdir: { type: 'string', description: '.srs_formalizer path' }, strict: { type: 'string', description: 'Set to "true" for strict mode' }, promote: { type: 'string', description: 'Set to "true" to promote' } }, required: ['workdir'] } },
  { name: 'validate_tla', description: 'Validate TLA+ with SANY parser and TLC model checker (requires Java)',
    parameters: { type: 'object', properties: { name: { type: 'string', description: 'TLA+ module name' }, workdir: { type: 'string', description: '.srs_formalizer path' }, strict: { type: 'string', description: 'Set to "true" for strict' }, promote: { type: 'string', description: 'Set to "true" to promote' } }, required: ['name', 'workdir'] } },
  { name: 'validate_lean', description: 'Validate Lean 4 proofs with lake build (requires Lean 4 toolchain)',
    parameters: { type: 'object', properties: { workdir: { type: 'string', description: '.srs_formalizer path' }, strict: { type: 'string', description: 'Set to "true" for strict' }, promote: { type: 'string', description: 'Set to "true" to promote' } }, required: ['workdir'] } },
  { name: 'validate_cypher', description: 'Validate Cypher scripts syntax',
    parameters: { type: 'object', properties: { file: { type: 'string', description: 'Cypher file path' }, workdir: { type: 'string', description: '.srs_formalizer path' } }, required: ['file', 'workdir'] } },
  { name: 'validate_jsonl', description: 'Validate JSONL files format, schema, and duplicates',
    parameters: { type: 'object', properties: { file: { type: 'string', description: 'JSONL file path' }, workdir: { type: 'string', description: '.srs_formalizer path' } }, required: ['file', 'workdir'] } },
  { name: 'verify_gate', description: 'Run verification gate checks (S1, R3, or FINAL stage)',
    parameters: { type: 'object', properties: { stage: { type: 'string', description: 'Gate stage', enum: ['S1', 'R3', 'FINAL'] }, workdir: { type: 'string', description: '.srs_formalizer path' } }, required: ['stage', 'workdir'] } },
  { name: 'status', description: 'Show workdir status dashboard (stage, artifacts, next actions)',
    parameters: { type: 'object', properties: { workdir: { type: 'string', description: '.srs_formalizer path' }, format: { type: 'string', description: 'Output format', enum: ['json', 'text'] } }, required: ['workdir'] } },
  { name: 'export_audit', description: 'Export audit package with traceability, validation reports, hash chains',
    parameters: { type: 'object', properties: { workdir: { type: 'string', description: '.srs_formalizer path' }, output: { type: 'string', description: 'Output directory path' } }, required: ['workdir', 'output'] } },
  { name: 'query_graph', description: 'Query SRS-IR knowledge graph (node/neighbors/module/path/context/export)',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'Query type', enum: ['get-node', 'get-neighbors', 'get-module', 'list-modules', 'find-path', 'get-context', 'export-brainstorm'] }, params: { type: 'string', description: 'Query parameters as JSON string' }, workdir: { type: 'string', description: '.srs_formalizer path' } }, required: ['query', 'workdir'] } },
  { name: 'generate_test_fixtures', description: 'Generate test fixtures for pytest/JUnit/Cucumber/Playwright/fast-check',
    parameters: { type: 'object', properties: { level: { type: 'string', description: 'Test level', enum: ['unit', 'integration', 'e2e'] }, framework: { type: 'string', description: 'Test framework', enum: ['pytest', 'junit', 'cucumber', 'playwright', 'fast-check'] }, workdir: { type: 'string', description: '.srs_formalizer path' } }, required: ['level', 'framework', 'workdir'] } },
  { name: 'generate_vmodel_matrix', description: 'Generate V-Model traceability matrix',
    parameters: { type: 'object', properties: { format: { type: 'string', description: 'Output format', enum: ['markdown', 'cypher'] }, output: { type: 'string', description: 'Output file path' }, workdir: { type: 'string', description: '.srs_formalizer path' } }, required: ['workdir'] } },
  { name: 'fixture_coverage', description: 'Compute test fixture coverage report against SRS-IR',
    parameters: { type: 'object', properties: { workdir: { type: 'string', description: '.srs_formalizer path' } }, required: ['workdir'] } },
  { name: 'inject_prompt', description: 'Inject parameters into a prompt template with auto-escaping',
    parameters: { type: 'object', properties: { template: { type: 'string', description: 'Template path (relative to prompts/)' }, params: { type: 'string', description: 'JSON parameters' }, shard_id: { type: 'string', description: 'Shard ID for auto SHARD_CONTENT' } }, required: ['template', 'params'] } },
];

const CLI_MAP: Array<{ tool: string; cmd: string; flags: Record<string, string>; boolean_flags?: string[] }> = [
  { tool: 'health_check', cmd: 'health-check', flags: { workdir: '--workdir' } },
  { tool: 'capability_probe', cmd: 'capability-probe', flags: { mode: '--mode', file: '--file' } },
  { tool: 'init', cmd: 'init', flags: { output: '--output' } },
  { tool: 'pipeline', cmd: 'pipeline', flags: { src: '--src', lang: '--lang', workdir: '--workdir' }, boolean_flags: ['--strict', '--full', '--auto-validate', '--skip-init', '--verbose'] },
  { tool: 'manifest', cmd: 'manifest', flags: { src: '--src', lang: '--lang', workdir: '--workdir' } },
  { tool: 'guided_extract', cmd: 'guided-extract', flags: { workdir: '--workdir' } },
  { tool: 'build_ir', cmd: 'build-ir', flags: { workdir: '--workdir' } },
  { tool: 'analyze_structure', cmd: 'analyze-structure', flags: { workdir: '--workdir' } },
  { tool: 'analyze_graph', cmd: 'analyze-graph', flags: { workdir: '--workdir' } },
  { tool: 'tag_nfr', cmd: 'tag-nfr', flags: { workdir: '--workdir' } },
  { tool: 'check_connectivity', cmd: 'check-connectivity', flags: { workdir: '--workdir' } },
  { tool: 'score_risk', cmd: 'score-risk', flags: { workdir: '--workdir' } },
  { tool: 'emit', cmd: 'emit', flags: { group: '--group', workdir: '--workdir' } },
  { tool: 'validate_bdd', cmd: 'validate-bdd', flags: { workdir: '--workdir' }, boolean_flags: ['--strict', '--promote'] },
  { tool: 'validate_tla', cmd: 'validate-tla', flags: { name: '--name', workdir: '--workdir' }, boolean_flags: ['--strict', '--promote'] },
  { tool: 'validate_lean', cmd: 'validate-lean', flags: { workdir: '--workdir' }, boolean_flags: ['--strict', '--promote'] },
  { tool: 'validate_cypher', cmd: 'validate-cypher', flags: { file: '--file', workdir: '--workdir' } },
  { tool: 'validate_jsonl', cmd: 'validate-jsonl', flags: { file: '--file', workdir: '--workdir' } },
  { tool: 'verify_gate', cmd: 'verify-gate', flags: { stage: '--stage', workdir: '--workdir' } },
  { tool: 'status', cmd: 'status', flags: { workdir: '--workdir', format: '--format' } },
  { tool: 'export_audit', cmd: 'export-audit', flags: { workdir: '--workdir', output: '--output' } },
  { tool: 'query_graph', cmd: 'query-graph', flags: { query: '--query', params: '--params', workdir: '--workdir' } },
  { tool: 'generate_test_fixtures', cmd: 'generate-test-fixtures', flags: { level: '--level', framework: '--framework', workdir: '--workdir' } },
  { tool: 'generate_vmodel_matrix', cmd: 'generate-vmodel-matrix', flags: { format: '--format', output: '--output', workdir: '--workdir' } },
  { tool: 'fixture_coverage', cmd: 'fixture-coverage', flags: { workdir: '--workdir' } },
  { tool: 'inject_prompt', cmd: 'inject-prompt', flags: { template: '--template', params: '--params', shard_id: '--shard-id' } },
];

type AnthropicTool = { name: string; description: string; input_schema: ToolDef['parameters'] };

export async function main(args: string[]): Promise<CliResult> {
  let format: string | null, outputPath: string | null;
  try {
    format = safeParseArg(args, '--format');
    outputPath = safeParseArg(args, '--output');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  const fmt = format ?? 'openai';
  if (fmt !== 'openai' && fmt !== 'anthropic') {
    return { status: 'error', message: `Invalid --format: ${fmt}. Must be 'openai' or 'anthropic'.` };
  }

  const tools: ToolDef[] | AnthropicTool[] = fmt === 'anthropic'
    ? TOOLS.map((t): AnthropicTool => ({ name: t.name, description: t.description, input_schema: t.parameters }))
    : TOOLS;

  const schema = {
    version: '1.1.0', generated_at: new Date().toISOString(), format: fmt,
    cli_prefix: 'npx tsx index.ts', tool_count: tools.length, cli_mapping: CLI_MAP, tools,
    features: {
      progress_reporting: true,
      colored_output: true,
      session_persistence: true,
      auto_validation: true,
      resource_monitoring: true,
    },
  };

  if (outputPath) {
    const outPath = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(schema, null, 2), 'utf-8');
    return { status: 'ok', message: `Tool schema: ${tools.length} tools → ${outPath}`, data: { path: outPath, tool_count: tools.length } };
  }

  return { status: 'ok', message: `Tool schema: ${tools.length} tools (${fmt})`, data: schema };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
