import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { ARTIFACT_PATHS, artifactPath } from '../lib/artifacts/paths.js';
import { hashFiles, writeValidationReport } from '../lib/artifacts/validation-report.js';
import { promoteFiles } from '../lib/artifacts/promotion.js';
import { validateTla } from '../lib/tla-validator.js';

const PLACEHOLDER = /LLM_FILL|TODO|FIXME|TBD|\bGAP\b|待定|未定义|待实现/i;

/** The six NFR invariant names (must stay in sync with orchestrator_backend.md / executor-tlaplus.md). */
const NFR_INVARIANTS = ['PerfLatencyInv', 'SecurityInv', 'AvailInv', 'CompatInv', 'MaintInv', 'ComplianceInv'] as const;

/** Strip TLA+ comments so definition bodies compare on semantics, not prose. */
function stripTlaComments(src: string): string {
  return src.replace(/\(\*[\s\S]*?\*\)/g, ' ').split('\n').map(line => {
    const idx = line.indexOf('\\*');
    return idx === -1 ? line : line.slice(0, idx);
  }).join('\n');
}

/**
 * Extract the body of a top-level `Name == ...` definition. Captures the first
 * line after `==` plus any following continuation lines (conjunction/disjunction
 * lists starting with /\ or \/), normalising whitespace for comparison.
 */
function extractDefinitionBody(source: string, name: string): string | null {
  const lines = source.split('\n');
  const start = lines.findIndex(line => new RegExp(`^${name}\\s*==`).test(line));
  if (start === -1) return null;
  const first = lines[start]!.replace(new RegExp(`^${name}\\s*==`), '').trim();
  const collected = [first];
  for (let i = start + 1; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (/^(\/\\|\\\/)/.test(trimmed) || (trimmed !== '' && /^[\s]/.test(lines[i]!) && !/^\w+\s*==/.test(trimmed))) {
      collected.push(trimmed);
    } else break;
  }
  return collected.join(' ').replace(/\s+/g, ' ').trim();
}

/** `var \in SetName` (a single membership in a named set) is a type-tautology: permanently true given TypeOK. */
const TAUTOLOGY_BODY = /^\w+'?\s*\\in\s+\w+$/;

/**
 * Non-triviality checks (proposal §2.3): reject vacuous invariants and template
 * duplication that let semantically empty specs pass the deterministic gate.
 */
function nonTrivialityErrors(source: string): string[] {
  const errors: string[] = [];
  const clean = stripTlaComments(source);
  const presentNfr = NFR_INVARIANTS.filter(name => new RegExp(`^${name}\\s*==`, 'm').test(clean));
  const bodies = new Map<string, string>();
  for (const name of presentNfr) {
    const body = extractDefinitionBody(clean, name);
    if (!body) continue;
    bodies.set(name, body);
    if (TAUTOLOGY_BODY.test(body)) {
      errors.push(`${name} is a tautology (\`var \\in TypeSet\` form is permanently true, not a real constraint)`);
    }
  }
  // Detect template duplication: two NFR invariants with identical bodies.
  const byBody = new Map<string, string[]>();
  for (const [name, body] of bodies) {
    if (!byBody.has(body)) byBody.set(body, []);
    byBody.get(body)!.push(name);
  }
  for (const [, names] of byBody) {
    if (names.length > 1) errors.push(`NFR invariants share an identical body (template duplication): ${names.join(', ')}`);
  }
  return errors;
}

function staticErrors(source: string, cfg: string): string[] {
  const errors: string[] = [];
  if (PLACEHOLDER.test(source)) errors.push('forbidden placeholder found');
  if ((source.match(/----\s*MODULE\s+\w+\s*----/g) ?? []).length !== 1) errors.push('exactly one module header is required');
  if (!/VARIABLES\s+\w+/.test(source)) errors.push('non-empty VARIABLES declaration is required');
  for (const operator of ['Init', 'Next', 'TypeOK']) if (!new RegExp(`^${operator}\\s*==\\s*\\S`, 'm').test(source)) errors.push(`non-empty ${operator} definition is required`);
  if (!/^INVARIANT\s+TypeOK/m.test(cfg)) errors.push('cfg must declare TypeOK invariant');
  errors.push(...nonTrivialityErrors(source));
  return errors;
}

export { nonTrivialityErrors };

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null; let name: string | null;
  try { workDirArg = safeParseArg(args, '--workdir'); name = safeParseArg(args, '--name'); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }
  if (!workDirArg || !name) return { status: 'error', message: `Missing required argument: ${!workDirArg ? '--workdir' : '--name'}` };
  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); } catch (err) { return { status: 'error', message: (err as Error).message }; }
  const strict = args.includes('--strict'); const promote = args.includes('--promote');
  if (promote && !strict) return { status: 'error', message: '--promote requires --strict' };
  const sourceDir = artifactPath(workDir, promote ? ARTIFACT_PATHS.tlaDraft : ARTIFACT_PATHS.tlaVerified);
  const tlaFile = path.join(sourceDir, `${name}.tla`); const cfgFile = path.join(sourceDir, `${name}.cfg`);
  if (!fs.existsSync(tlaFile) || !fs.existsSync(cfgFile)) return { status: 'error', message: 'candidate .tla and matching .cfg are required' };
  const startedAt = new Date().toISOString();
  const errors = strict ? staticErrors(fs.readFileSync(tlaFile, 'utf8'), fs.readFileSync(cfgFile, 'utf8')) : [];
  if (errors.length) return { status: 'error', message: 'TLA+ static validation failed', data: { errors } };
  if (!strict) return { status: 'ok', data: { files: [tlaFile, cfgFile] } };
  let result;
  try { result = validateTla(tlaFile, cfgFile); }
  catch (err) { return { status: 'error', message: 'TLA+ toolchain unavailable', data: { error: (err as Error).message } }; }
  if (!result.passed) return { status: 'error', message: 'TLA+ SANY or TLC validation failed', data: { sany: result.sany, tlc: result.tlc } };
  // Promote first, then hash the FINAL file locations (verified/ when --promote, draft/ otherwise)
  // so that checks-final.ts (which hashes the verified/ paths) can match the report's sourceHash.
  // Earlier versions hashed draft paths which never matched verified paths.
  const files = promote ? promoteFiles(sourceDir, artifactPath(workDir, ARTIFACT_PATHS.tlaVerified), [`${name}.tla`, `${name}.cfg`]) : [tlaFile, cfgFile];
  const sourceHash = hashFiles(files);
  const reportPath = path.join(artifactPath(workDir, ARTIFACT_PATHS.tlaValidation), `${sourceHash}.json`);
  writeValidationReport(reportPath, { artifactKind: 'tlaplus', lifecycle: 'verified', sourcePaths: files, sourceHash, irHash: sourceHash, tools: [{ name: 'java', version: result.javaVersion }, { name: 'tla2tools', version: result.jarVersion }], startedAt, completedAt: new Date().toISOString(), passed: true, checks: [{ name: 'static specification checks', passed: true }, { name: 'SANY', passed: true, detail: result.sany.output.slice(0, 500) }, { name: 'TLC', passed: true, detail: result.tlc.output.slice(0, 500) }] });
  return { status: 'ok', data: { files, report: reportPath } };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
