/**
 * validate-semantics.ts — SRS-IR semantic consistency validation command
 *
 * CLI: npx tsx index.ts validate-semantics --workdir .srs_formalizer [--strict]
 *
 * Checks IR internal consistency across 4 categories:
 *   A. Type validity (enum fields)
 *   B. Reference integrity (edge endpoints, ID uniqueness, meta counts)
 *   C. Property completeness (required fields per node type)
 *   D. NFR threshold validity (finite values, valid operators)
 *
 * --strict: returns status 'error' if any errors found (for pipeline gating).
 * Without --strict: always returns status 'ok' with findings in data.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import type { SRSIR } from '../types/srs-ir.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { checkSemanticConsistency } from '../lib/semantic/consistency-checker.js';

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  let strictMode = false;
  try {
    workDirArg = safeParseArg(args, '--workdir');
    strictMode = args.includes('--strict');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };

  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }

  const irPath = path.join(workDir, 'srs-ir.json');
  if (!fs.existsSync(irPath)) {
    return { status: 'error', message: `srs-ir.json not found at ${irPath}` };
  }

  let ir: SRSIR;
  try { ir = JSON.parse(fs.readFileSync(irPath, 'utf-8')) as SRSIR; }
  catch (err) {
    return { status: 'error', message: `Failed to parse srs-ir.json: ${(err as Error).message}` };
  }

  const report = checkSemanticConsistency(ir);

  if (strictMode && !report.valid) {
    return {
      status: 'error',
      message: `Semantic validation failed: ${report.errors} error(s), ${report.warnings} warning(s)`,
      data: report,
    };
  }

  return {
    status: 'ok',
    message: `Semantic validation complete: ${report.errors} error(s), ${report.warnings} warning(s)`,
    data: report,
  };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
