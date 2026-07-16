/**
 * generate-counterexample-fixtures.ts — 从 TLC trace 文件生成反例复现测试夹具
 *
 * CLI: npx tsx index.ts generate-counterexample-fixtures --trace <path> --framework <fw> --workdir <dir>
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import type { FixtureFile } from '../lib/fixture-gen/types.js';
import { safeParseArg, validateWorkDir, assertSafePath } from '../lib/cli.js';
import { parseTlcTrace } from '../lib/fixture-gen/tla-counterexample.js';
import { loadTemplate, renderTemplate } from '../lib/fixture-gen/template-engine.js';

const VALID_FRAMEWORKS = ['pytest', 'junit', 'fast-check'] as const;

function isValidFramework(fw: string): fw is typeof VALID_FRAMEWORKS[number] {
  return VALID_FRAMEWORKS.includes(fw as typeof VALID_FRAMEWORKS[number]);
}

function extractInvariantFromTrace(rawTrace: string): string | undefined {
  const inlineMatch = rawTrace.match(/<Invariant (\w+) violated>/);
  if (inlineMatch && inlineMatch[1]) return inlineMatch[1];
  const sentenceMatch = rawTrace.match(/Invariant (\w+) is violated/);
  if (sentenceMatch && sentenceMatch[1]) return sentenceMatch[1];
  return undefined;
}

function buildTemplateVars(
  traceEntries: ReturnType<typeof parseTlcTrace>,
  rawTrace: string,
): Record<string, string> {
  const detectedInvariant: string =
    traceEntries.find(e => e.violatedInvariant)?.violatedInvariant ??
    extractInvariantFromTrace(rawTrace) ??
    'Unknown';
  const invariantLower = detectedInvariant.toLowerCase();

  const traceLines: string[] = [];
  for (const entry of traceEntries) {
    const varPairs = Object.entries(entry.state)
      .map(([k, v]) => `${k} = ${v}`)
      .join(' /\\ ');
    const tag = entry.violatedInvariant ? ` <Invariant ${entry.violatedInvariant} violated>` : '';
    traceLines.push(`State ${entry.step}:${tag} ${varPairs}`);
  }
  const traceStr = traceLines.join('\n');

  const stateComments: string[] = [];
  for (const entry of traceEntries) {
    const varPairs = Object.entries(entry.state)
      .map(([k, v]) => `${k} = ${v}`)
      .join(', ');
    const tag = entry.violatedInvariant ? `  <Invariant violated>` : '';
    stateComments.push(`    # State ${entry.step}: ${varPairs}${tag}`);
  }
  const statesStr = stateComments.join('\n');

  const capInvariant = detectedInvariant.charAt(0).toUpperCase() + detectedInvariant.slice(1);

  return {
    INVARIANT: detectedInvariant,
    INVARIANT_LOWER: invariantLower,
    TRACE: traceStr,
    STATES: statesStr,
    CLASS_NAME: `Counterexample${capInvariant}Test`,
  };
}

function makeFixtureFile(
  framework: string,
  invariantLower: string,
  capInvariant: string,
  content: string,
): FixtureFile {
  if (framework === 'pytest') {
    return { path: `test_counterexample_${invariantLower}.py`, content };
  } else if (framework === 'junit') {
    return { path: `Counterexample${capInvariant}Test.java`, content };
  } else {
    return { path: `counterexample_${invariantLower}.test.ts`, content };
  }
}

export async function main(args: string[]): Promise<CliResult> {
  let traceArg: string | null;
  let frameworkArg: string | null;
  let workDirArg: string | null;

  try {
    traceArg = safeParseArg(args, '--trace');
    frameworkArg = safeParseArg(args, '--framework');
    workDirArg = safeParseArg(args, '--workdir');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!traceArg) {
    return { status: 'error', message: 'Missing required argument: --trace <path-to-trace-file>' };
  }
  if (!frameworkArg) {
    return { status: 'error', message: 'Missing required argument: --framework (pytest|junit|fast-check)' };
  }
  if (!isValidFramework(frameworkArg)) {
    return { status: 'error', message: `Invalid --framework "${frameworkArg}". Must be one of: ${VALID_FRAMEWORKS.join(', ')}` };
  }

  if (!fs.existsSync(traceArg)) {
    return { status: 'error', message: `Trace file not found: ${traceArg}` };
  }

  const workDirCandidate = workDirArg ?? process.cwd();
  let workDir: string;
  try {
    workDir = validateWorkDir(workDirCandidate);
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  let traceContent: string;
  try {
    traceContent = fs.readFileSync(traceArg, 'utf-8');
  } catch (err) {
    return { status: 'error', message: `Failed to read trace file: ${(err as Error).message}` };
  }

  let trace: ReturnType<typeof parseTlcTrace>;
  try {
    trace = parseTlcTrace(traceContent);
  } catch (err) {
    return { status: 'error', message: `Failed to parse trace: ${(err as Error).message}` };
  }

  if (trace.length === 0) {
    return { status: 'error', message: 'Trace file contained no parseable states' };
  }

  const templateVars = buildTemplateVars(trace, traceContent);
  const invariant = templateVars['INVARIANT']!;
  const invariantLower = templateVars['INVARIANT_LOWER']!;
  const capInvariant = invariant.charAt(0).toUpperCase() + invariant.slice(1);

  let templateContent: string;
  try {
    templateContent = loadTemplate(frameworkArg, 'counterexample');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  const rendered = renderTemplate(templateContent, templateVars);
  const file = makeFixtureFile(frameworkArg, invariantLower, capInvariant, rendered);

  const outputDir = path.join(workDir, 'test_fixtures', 'counterexample', frameworkArg);
  assertSafePath(outputDir, workDir);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filePath = path.join(outputDir, file.path);
  const fileDir = path.dirname(filePath);
  if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir, { recursive: true });
  }
  assertSafePath(filePath, outputDir);
  fs.writeFileSync(filePath, file.content, 'utf-8');

  return {
    status: 'ok',
    data: {
      files_created: 1,
      output_dir: path.join('test_fixtures', 'counterexample', frameworkArg),
      trace_states: trace.length,
      violated_invariant: invariant,
      files: [file.path],
    },
  };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
