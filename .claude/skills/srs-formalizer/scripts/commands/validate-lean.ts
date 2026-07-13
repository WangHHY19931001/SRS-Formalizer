import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { ARTIFACT_PATHS, artifactPath } from '../lib/artifacts/paths.js';
import { collectByExtension, collectFiles, hashFiles, writeValidationReport } from '../lib/artifacts/validation-report.js';
import { promoteDirectory } from '../lib/artifacts/promotion.js';
import { stripLeanComments } from '../lib/verify-gate/shared.js';

function auditLean(source: string): string[] {
  const clean = stripLeanComments(source);
  const checks: Array<[RegExp, string]> = [[/\b(sorry|admit|axiom)\b/, 'unfinished proof or axiom found'], [/^\s*import\s+Mathlib\s*$/m, 'full Mathlib import is forbidden'], [/\b(theorem|lemma)\s+\w+[^\n]*:\s*True\b/, 'semantically weakened : True theorem found']];
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
  let version: string; let output: string;
  try { version = execFileSync('lake', ['--version'], { encoding: 'utf8' }); output = execFileSync('lake', ['build'], { cwd: sourceDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (err) { return { status: 'error', message: 'lake build failed or Lean 4 is unavailable', data: { output: (err as { stderr?: string }).stderr?.toString() } }; }
  if (/warning:/i.test(output)) return { status: 'error', message: 'lake build emitted warnings', data: { output } };
  const sourceHash = hashFiles(files);
  const reportPath = path.join(artifactPath(workDir, ARTIFACT_PATHS.leanValidation), `${sourceHash}.json`);
  writeValidationReport(reportPath, { artifactKind: 'lean4', lifecycle: 'verified', sourcePaths: files, sourceHash, irHash: sourceHash, tools: [{ name: 'lake', version: version.trim() }], startedAt, completedAt: new Date().toISOString(), passed: true, checks: [{ name: 'source audit', passed: true }, { name: 'Lake project contract', passed: true }, { name: 'lake build', passed: true }] });
  const verified = promote ? promoteDirectory(sourceDir, artifactPath(workDir, ARTIFACT_PATHS.leanVerified)) : sourceDir;
  return { status: 'ok', data: { files: promote ? [verified] : files, report: reportPath } };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
