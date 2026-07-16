/**
 * middle-end-runner.ts — Parallelized execution of the 5 middle-end passes
 *
 * Pipeline phases (preserves original data-flow semantics):
 *   Phase 1 (parallel):   analyze-structure + analyze-graph  (see original IR)
 *   Phase 2 (sequential): tag-nfr                            (mutates IR, adds NFR tags)
 *   Phase 3 (parallel):   check-connectivity + score-risk    (see NFR-tagged IR)
 *
 * See `docs/superpowers/specs/2026-07-16-middle-end-parallelization-design.md`
 * for the full dependency and safety analysis.
 */

import type { ProgressReporter } from '../progress.js';

export interface MiddleEndStepResult {
  id: string;
  name: string;
  status: 'ok' | 'warn' | 'error';
  message: string;
  data?: unknown;
  duration_ms: number;
}

export interface MiddleEndRunnerOptions {
  workDir: string;
  progress?: ProgressReporter;
}

type CmdResult = { status: string; message?: string; data?: unknown };

interface PassSpec {
  cmd: string;
  id: string;
  name: string;
}

const PHASE1_PASSES: readonly PassSpec[] = [
  { cmd: '../../commands/analyze-structure.js', id: 'analyze-structure', name: 'Analyze structure' },
  { cmd: '../../commands/analyze-graph.js', id: 'analyze-graph', name: 'Analyze graph semantics' },
] as const;

const TAG_NFR_PASS: PassSpec = {
  cmd: '../../commands/tag-nfr.js', id: 'tag-nfr', name: 'Tag NFRs',
};

const PHASE3_PASSES: readonly PassSpec[] = [
  { cmd: '../../commands/check-connectivity.js', id: 'check-connectivity', name: 'Check connectivity' },
  { cmd: '../../commands/score-risk.js', id: 'score-risk', name: 'Score risk' },
] as const;

async function runCmd(mod: string, cmdArgs: string[]): Promise<CmdResult> {
  const m = await import(mod) as { main: (a: string[]) => Promise<CmdResult> };
  return m.main(cmdArgs);
}

async function runSinglePass(
  spec: PassSpec,
  workDir: string,
  progress?: ProgressReporter,
): Promise<MiddleEndStepResult> {
  const start = Date.now();
  const timer = progress?.startStep(spec.name);
  try {
    const result = await runCmd(spec.cmd, ['--workdir', workDir]);
    const duration_ms = Date.now() - start;
    const status: MiddleEndStepResult['status'] =
      result.status === 'ok' ? 'ok' :
      result.status === 'warn' ? 'warn' : 'error';
    const fallback = status === 'ok' ? 'Completed' : status === 'warn' ? 'Completed with warnings' : 'Failed';
    const message = result.message ?? fallback;
    if (timer) progress?.completeStep(timer, status, message);
    return { id: spec.id, name: spec.name, status, message, data: result.data, duration_ms };
  } catch (err) {
    const duration_ms = Date.now() - start;
    const message = (err as Error).message;
    if (timer) progress?.completeStep(timer, 'error', message);
    return { id: spec.id, name: spec.name, status: 'error', message, duration_ms };
  }
}

async function runParallelPasses(
  passes: readonly PassSpec[],
  workDir: string,
  progress?: ProgressReporter,
): Promise<MiddleEndStepResult[]> {
  const results = await Promise.all(
    passes.map(p => runSinglePass(p, workDir, progress)),
  );
  return results;
}

export async function runMiddleEndPasses(
  options: MiddleEndRunnerOptions,
): Promise<MiddleEndStepResult[]> {
  const { workDir, progress } = options;
  const results: MiddleEndStepResult[] = [];

  const phase1 = await runParallelPasses(PHASE1_PASSES, workDir, progress);
  results.push(...phase1);

  const tagNfrResult = await runSinglePass(TAG_NFR_PASS, workDir, progress);
  results.push(tagNfrResult);
  if (tagNfrResult.status === 'error') {
    return results;
  }

  const phase3 = await runParallelPasses(PHASE3_PASSES, workDir, progress);
  results.push(...phase3);

  return results;
}
