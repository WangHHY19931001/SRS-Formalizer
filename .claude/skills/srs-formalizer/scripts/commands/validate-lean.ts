import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { ARTIFACT_PATHS, artifactPath } from '../lib/artifacts/paths.js';
import { collectByExtension, collectFiles, hashFiles, hashText, writeValidationReport } from '../lib/artifacts/validation-report.js';
import { promoteDirectory } from '../lib/artifacts/promotion.js';
import { stripLeanComments } from '../lib/verify-gate/shared.js';

export function auditLean(source: string): string[] {
  const clean = stripLeanComments(source);
  const checks: Array<[RegExp, string]> = [
    [/\b(sorry|admit|axiom)\b/, 'unfinished proof or axiom found'],
    [/^\s*import\s+Mathlib\s*$/m, 'full Mathlib import is forbidden'],
    [/\b(theorem|lemma)\s+\w+[^\n]*:\s*True\b/, 'semantically weakened : True theorem found'],
    // A proposition whose consequent (after `->`/`→` or `<->`/`↔`) is `True` is
    // vacuous: any hypothesis discharges it via `trivial`. Blocks the `→ True`
    // escape hatch that the plain `: True` pattern misses (proposal §3.3). Not
    // anchored to the `theorem` keyword so multi-line signatures are caught;
    // comments are already stripped, and `True` as a codomain is always vacuous.
    [/(?:->|→)\s*True\b/, 'theorem with True consequent is vacuous (→ True)'],
    [/(?:<->|↔)\s*True\b/, 'theorem with True consequent is vacuous (↔ True)'],
  ];
  return checks.filter(([pattern]) => pattern.test(clean)).map(([, message]) => message);
}

function projectFiles(root: string): string[] {
  return [...collectByExtension(root, '.lean'), ...collectFiles(root, ['lakefile.lean', 'lakefile.toml', 'lean-toolchain'])].sort();
}

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  try { workDirArg = safeParseArg(args, '--workdir'); } catch (err) { return { status: 'error', message: (err as Error).message }; }
  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };
  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); } catch (err) { return { status: 'error', message: (err as Error).message }; }
  const strict = args.includes('--strict'); const promote = args.includes('--promote');
  if (promote && !strict) return { status: 'error', message: '--promote requires --strict' };
  if (os.platform() === 'win32') return { status: 'error', message: 'Windows is not supported for Lean 4 verification' };
  const sourceDir = artifactPath(workDir, promote ? ARTIFACT_PATHS.leanDraft : ARTIFACT_PATHS.leanVerified);
  if (!fs.existsSync(sourceDir)) return { status: 'error', message: `Lean ${promote ? 'draft' : 'verified'} project directory not found` };
  if (!fs.existsSync(path.join(sourceDir, 'lakefile.lean')) && !fs.existsSync(path.join(sourceDir, 'lakefile.toml'))) return { status: 'error', message: 'Lean project must contain lakefile.lean or lakefile.toml' };
  const files = projectFiles(sourceDir);
  const leanFiles = files.filter(file => file.endsWith('.lean'));
  if (leanFiles.length === 0) return { status: 'error', message: 'No Lean source files found' };
  const errors = strict ? leanFiles.flatMap(file => auditLean(fs.readFileSync(file, 'utf8')).map(error => `[${path.relative(sourceDir, file)}] ${error}`)) : [];
  if (errors.length) return { status: 'error', message: 'Lean source audit failed', data: { errors } };
  if (!strict) return { status: 'ok', data: { files } };
  const startedAt = new Date().toISOString();
  // P0-3: distinguish "tool binary missing" from "build failed". Only the former
  // may ever justify a SKIPPED path; a build failure while lake IS present must
  // surface as a hard error and never be silently downgraded to "environment
  // limitation". We probe `lake --version` first: if that throws, the binary is
  // genuinely unavailable; if it succeeds, any subsequent `lake build` failure
  // is a real proof/spec error that must block promotion.
  let version: string;
  try { version = execFileSync('lake', ['--version'], { encoding: 'utf8' }); }
  catch (err) { return { status: 'error', message: 'lake binary not found (tool unavailable); only this case may map to a SKIPPED report', data: { reason: 'tool-missing', output: (err as { stderr?: string }).stderr?.toString() } }; }
  let output: string;
  try { output = execFileSync('lake', ['build'], { cwd: sourceDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (err) {
    const e = err as { stderr?: string | Buffer; stdout?: string | Buffer; status?: number };
    const buildOutput = `${e.stdout?.toString() ?? ''}\n${e.stderr?.toString() ?? ''}`.trim();
    // lake is present but the build failed: this is a real error, not a skip.
    return { status: 'error', message: 'lake build failed (tool present); this is a build error, not an environment skip', data: { reason: 'build-failed', exitCode: typeof e.status === 'number' ? e.status : null, output: buildOutput } };
  }
  if (/warning:/i.test(output)) return { status: 'error', message: 'lake build emitted warnings', data: { reason: 'build-warning', output } };
  const sourceHash = hashFiles(files);
  const reportPath = path.join(artifactPath(workDir, ARTIFACT_PATHS.leanValidation), `${sourceHash}.json`);
  writeValidationReport(reportPath, {
    artifactKind: 'lean4', lifecycle: 'verified', sourcePaths: files, sourceHash, irHash: sourceHash,
    tools: [{ name: 'lake', version: version.trim() }], startedAt, completedAt: new Date().toISOString(), passed: true,
    checks: [{ name: 'source audit', passed: true }, { name: 'Lake project contract', passed: true }, { name: 'lake build', passed: true }],
    // P0-1: bind report to the real `lake build` run so a hand-written report
    // with `passed: true` cannot satisfy the FINAL gate.
    toolEvidence: [{ tool: 'lake build', exitCode: 0, stdoutHash: hashText(output) }],
  });
  const verified = promote ? promoteDirectory(sourceDir, artifactPath(workDir, ARTIFACT_PATHS.leanVerified)) : sourceDir;
  return { status: 'ok', data: { files: promote ? [verified] : files, report: reportPath } };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
