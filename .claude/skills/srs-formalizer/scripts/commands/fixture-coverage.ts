/**
 * fixture-coverage.ts -- Compute fixture coverage report
 *
 * CLI: npx tsx index.ts fixture-coverage --workdir .srs_formalizer
 *
 * Scans the workdir for BDD features, TLA+ specs, and Lean 4 proofs,
 * compares against generated fixtures, and returns a coverage report.
 *
 * Output: {"status":"ok","data":{"total_requirements":N,"coverage_pct":N,...}}
 */

import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { computeCoverage } from '../lib/fixture-gen/coverage.js';
import { buildTraceabilityMatrix } from '../lib/fixture-gen/traceability.js';

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  try {
    workDirArg = safeParseArg(args, '--workdir');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  let workDir: string;
  try {
    workDir = validateWorkDir(workDirArg ?? process.cwd());
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  const report = computeCoverage(workDir);
  const matrix = buildTraceabilityMatrix(workDir);
  const entries = matrix.map(e => ({
    requirementId: e.requirementId,
    status: e.coverageStatus,
    bdd: e.bddScenarios.length,
    tla: e.tlaInvariants.length,
    lean: e.leanTheorems.length,
    fixtures: e.fixtureFiles.length,
  }));

  return {
    status: 'ok',
    data: {
      ...report,
      entries,
    },
  };
}

// Guard: refuse direct invocation (must go through index.ts)
import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
