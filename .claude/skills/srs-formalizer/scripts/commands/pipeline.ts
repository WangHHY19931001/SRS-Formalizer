/**
 * pipeline.ts — One-shot complete SRS formalization pipeline
 *
 * CLI: npx tsx index.ts pipeline --src <srs-file> --lang zh|en --workdir .srs_formalizer [--strict] [--skip-init]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';

type StepStatus = 'pending' | 'running' | 'ok' | 'warn' | 'error' | 'skipped' | 'manual_required';

interface PipelineStep {
  id: string;
  name: string;
  status: StepStatus;
  message?: string;
  duration_ms?: number;
  data?: unknown;
}

interface PipelineReport {
  started_at: string;
  completed_at?: string;
  total_duration_ms?: number;
  src: string;
  lang: string;
  workdir: string;
  strict: boolean;
  steps: PipelineStep[];
  manual_steps_required: string[];
  next_actions: string[];
  artifacts_generated: string[];
  summary: { total: number; ok: number; warn: number; error: number; skipped: number; manual_required: number };
}

type CmdResult = { status: string; message?: string; data?: unknown };

async function runStep(
  step: PipelineStep,
  fn: () => Promise<CmdResult>
): Promise<{ ok: boolean; data?: unknown }> {
  step.status = 'running';
  const start = Date.now();
  try {
    const result = await fn();
    step.duration_ms = Date.now() - start;
    if (result.status === 'ok' || result.status === 'warn') {
      step.status = result.status === 'warn' ? 'warn' : 'ok';
      step.message = result.message ?? 'Completed';
      step.data = result.data;
      return { ok: true, data: result.data };
    } else {
      step.status = 'error';
      step.message = result.message ?? 'Unknown error';
      return { ok: false };
    }
  } catch (err) {
    step.duration_ms = Date.now() - start;
    step.status = 'error';
    step.message = (err as Error).message;
    return { ok: false };
  }
}

export async function main(args: string[]): Promise<CliResult> {
  let srcPath: string | null, lang: string | null, workDirArg: string | null;
  let strictMode = false, skipInit = false;

  try {
    srcPath = safeParseArg(args, '--src');
    lang = safeParseArg(args, '--lang');
    workDirArg = safeParseArg(args, '--workdir');
    strictMode = args.includes('--strict');
    skipInit = args.includes('--skip-init');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!srcPath && !skipInit) return { status: 'error', message: 'Missing --src (or use --skip-init)' };
  if (!workDirArg) return { status: 'error', message: 'Missing --workdir' };
  const langVal = lang ?? 'zh';
  if (langVal !== 'zh' && langVal !== 'en') return { status: 'error', message: 'Invalid --lang (must be zh or en)' };

  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); } catch (err) { return { status: 'error', message: (err as Error).message }; }

  const absSrc = srcPath ? path.resolve(srcPath) : null;
  if (absSrc && !fs.existsSync(absSrc)) return { status: 'error', message: `Source not found: ${absSrc}` };

  const startedAt = new Date().toISOString();
  const pipelineStart = Date.now();
  const steps: PipelineStep[] = [];
  const manualSteps: string[] = [];
  const nextActions: string[] = [];
  const artifactsGenerated: string[] = [];

  function buildReport(): PipelineReport {
    return {
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      total_duration_ms: Date.now() - pipelineStart,
      src: absSrc ?? '(skip-init)',
      lang: langVal,
      workdir: workDir,
      strict: strictMode,
      steps,
      manual_steps_required: manualSteps,
      next_actions: nextActions,
      artifacts_generated: artifactsGenerated,
      summary: {
        total: steps.length,
        ok: steps.filter(s => s.status === 'ok').length,
        warn: steps.filter(s => s.status === 'warn').length,
        error: steps.filter(s => s.status === 'error').length,
        skipped: steps.filter(s => s.status === 'skipped').length,
        manual_required: steps.filter(s => s.status === 'manual_required').length,
      },
    };
  }

  function failStep(step: PipelineStep): CliResult {
    return { status: 'error', message: `Failed at "${step.name}": ${step.message}`, data: buildReport() };
  }

  async function runCmd(mod: string, cmdArgs: string[]): Promise<CmdResult> {
    const m = await import(mod) as { main: (a: string[]) => Promise<CmdResult> };
    return m.main(cmdArgs);
  }

  // Step 1: Init
  if (!skipInit) {
    const step: PipelineStep = { id: 'init', name: 'Initialize workdir', status: 'pending' };
    steps.push(step);
    const { ok } = await runStep(step, () => runCmd('./init.js', ['--output', workDir]));
    if (!ok) return failStep(step);
  } else {
    steps.push({ id: 'init', name: 'Initialize workdir', status: 'skipped', message: 'Skipped (--skip-init)' });
  }

  // Step 2: Manifest
  if (absSrc) {
    const step: PipelineStep = { id: 'manifest', name: 'Parse SRS and build shard index', status: 'pending' };
    steps.push(step);
    const { ok, data } = await runStep(step, () => runCmd('./manifest.js', ['--src', absSrc, '--lang', langVal, '--workdir', workDir]));
    if (!ok) return failStep(step);
    const manifestData = data as { total_shards?: number } | undefined;
    if (manifestData?.total_shards) artifactsGenerated.push(`shard_index.json (${manifestData.total_shards} shards)`);
  } else {
    steps.push({ id: 'manifest', name: 'Parse SRS', status: 'skipped', message: 'No --src provided' });
  }

  // Step 3: Check extraction
  const extractDir = path.join(workDir, '2_extract', 'r1-explicit');
  const hasExtraction = fs.existsSync(extractDir) && fs.readdirSync(extractDir).filter(f => f.endsWith('.jsonl')).length > 0;

  if (!hasExtraction) {
    steps.push({
      id: 'guided-extract',
      name: 'Guided extraction (LLM/Agent required)',
      status: 'manual_required',
      message: 'Requires AI agent for guided-extract',
    });
    manualSteps.push('guided-extract');
    nextActions.push(`npx tsx index.ts guided-extract --workdir ${workDir}`);
    nextActions.push(`npx tsx index.ts pipeline --skip-init --workdir ${workDir}${strictMode ? ' --strict' : ''}`);
  } else {
    steps.push({ id: 'guided-extract', name: 'Guided extraction', status: 'ok', message: 'Extraction exists' });

    // Step 4: Build IR
    const buildIrStep: PipelineStep = { id: 'build-ir', name: 'Build SRS-IR', status: 'pending' };
    steps.push(buildIrStep);
    const { ok: irOk, data: irDataRaw } = await runStep(buildIrStep, () => runCmd('./build-ir.js', ['--workdir', workDir]));
    if (!irOk) return failStep(buildIrStep);
    const irData = irDataRaw as { nodes?: number; edges?: number } | undefined;
    if (irData) artifactsGenerated.push(`srs-ir.json (${irData.nodes ?? 0} nodes, ${irData.edges ?? 0} edges)`);

    // Step 5: Middle-end passes
    for (const [cmd, name] of [
      ['./tag-nfr.js', 'Tag NFRs'],
      ['./check-connectivity.js', 'Check connectivity'],
      ['./score-risk.js', 'Score risk'],
    ] as const) {
      const s: PipelineStep = { id: cmd, name, status: 'pending' };
      steps.push(s);
      await runStep(s, () => runCmd(cmd, ['--workdir', workDir]));
    }

    // Step 6: Emit all
    const emitStep: PipelineStep = { id: 'emit', name: 'Emit all artifacts', status: 'pending' };
    steps.push(emitStep);
    const { ok: emitOk, data: emitDataRaw } = await runStep(emitStep, () => runCmd('./emit.js', ['--group', 'all', '--workdir', workDir]));
    if (!emitOk) return failStep(emitStep);
    const emitData = emitDataRaw as { totalFiles?: number } | undefined;
    if (emitData?.totalFiles) artifactsGenerated.push(`${emitData.totalFiles} draft files`);

    // Step 7: Strict validation
    if (strictMode) {
      const bddStep: PipelineStep = { id: 'validate-bdd', name: 'Validate BDD', status: 'pending' };
      steps.push(bddStep);
      await runStep(bddStep, () => runCmd('./validate-bdd.js', ['--strict', '--promote', '--workdir', workDir]));

      const vgStep: PipelineStep = { id: 'verify-gate-r3', name: 'R3 gate', status: 'pending' };
      steps.push(vgStep);
      await runStep(vgStep, () => runCmd('./verify-gate.js', ['--stage', 'R3', '--workdir', workDir]));

      nextActions.push(`npx tsx index.ts validate-tla --name <module> --strict --promote --workdir ${workDir}`);
      nextActions.push(`npx tsx index.ts validate-lean --strict --promote --workdir ${workDir}`);
      nextActions.push(`npx tsx index.ts verify-gate --stage FINAL --workdir ${workDir}`);
    } else {
      steps.push({ id: 'validation', name: 'Formal validation', status: 'skipped', message: 'Add --strict' });
      nextActions.push(`npx tsx index.ts validate-bdd --strict --promote --workdir ${workDir}`);
      nextActions.push(`npx tsx index.ts verify-gate --stage R3 --workdir ${workDir}`);
    }
  }

  const report = buildReport();
  const hasErrors = report.summary.error > 0;
  const hasManual = report.summary.manual_required > 0;
  const message = hasErrors
    ? `Failed with ${report.summary.error} error(s)`
    : hasManual
      ? `Paused — ${report.summary.manual_required} manual step(s) required`
      : strictMode
        ? `Completed (strict) — ${report.summary.ok} steps`
        : `Completed — ${report.summary.ok} steps`;

  return { status: hasErrors ? 'error' : 'ok', message, data: report };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
