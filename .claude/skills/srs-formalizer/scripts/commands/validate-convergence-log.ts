/**
 * validate-convergence-log.ts — record/validate convergence audit entries (§P2-2).
 *
 * Two modes:
 *   --append '<json>'  : validate one entry and append it to the log. Weakening
 *                        actions (invariant_weakened/threshold_relaxed/…) are
 *                        rejected unless they carry before/after diff + reason.
 *   (default)          : validate the whole existing log; status error if any
 *                        entry is malformed or a weakening entry lacks its diff.
 *
 * CLI: validate-convergence-log --workdir .srs_formalizer [--append '<json>']
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir, refuseDirectInvocation } from '../lib/cli.js';
import { ARTIFACT_PATHS, artifactPath } from '../lib/artifacts/paths.js';
import { parseConvergenceLog, validateEntry, isWeakeningAction, type ConvergenceLogEntry } from '../lib/convergence-log.js';

function logPath(workDir: string): string {
  return path.join(artifactPath(workDir, ARTIFACT_PATHS.reports), 'convergence-log.jsonl');
}

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null; let appendArg: string | null;
  try { workDirArg = safeParseArg(args, '--workdir'); appendArg = safeParseArg(args, '--append'); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }
  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };
  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); } catch (err) { return { status: 'error', message: (err as Error).message }; }

  const file = logPath(workDir);

  if (appendArg) {
    let entry: Partial<ConvergenceLogEntry>;
    try { entry = JSON.parse(appendArg) as Partial<ConvergenceLogEntry>; }
    catch (err) { return { status: 'error', message: `Invalid --append JSON: ${(err as Error).message}` }; }
    if (!entry.timestamp) entry.timestamp = new Date().toISOString();
    const errors = validateEntry(entry);
    if (errors.length > 0) return { status: 'error', message: 'Convergence entry rejected', data: { errors } };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8');
    return { status: 'ok', data: { appended: true, weakening: isWeakeningAction(entry.action!), log: file } };
  }

  if (!fs.existsSync(file)) return { status: 'ok', data: { entries: 0, weakeningActions: 0, log: file } };
  let entries: ConvergenceLogEntry[];
  try { entries = parseConvergenceLog(fs.readFileSync(file, 'utf8')); }
  catch (err) { return { status: 'error', message: `Malformed convergence log: ${(err as Error).message}` }; }
  const problems: string[] = [];
  for (const [i, entry] of entries.entries()) {
    const errs = validateEntry(entry);
    if (errs.length > 0) problems.push(`line ${i + 1}: ${errs.join(', ')}`);
  }
  const weakeningActions = entries.filter(e => isWeakeningAction(e.action)).length;
  if (problems.length > 0) return { status: 'error', message: 'Convergence log validation failed', data: { entries: entries.length, weakeningActions, problems } };
  return { status: 'ok', data: { entries: entries.length, weakeningActions, log: file } };
}

refuseDirectInvocation(import.meta.url);
