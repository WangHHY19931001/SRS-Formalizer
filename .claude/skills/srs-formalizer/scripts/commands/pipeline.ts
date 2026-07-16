/**
 * pipeline.ts — One-shot complete SRS formalization pipeline
 *
 * CLI: npx tsx index.ts pipeline --src <srs-file> --lang zh|en --workdir .srs_formalizer
 *       [--strict] [--full] [--skip-init]
 *
 * Runs init → manifest → build-ir → analysis → emit → validate automatically.
 * Saves session state in _ctx/session.json for multi-turn/Agent support.
 * --full mode enables auto-continue and detailed progress reporting.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';

type StepStatus = 'pending' | 'running' | 'ok' | 'warn' | 'error' | 'skipped' | 'manual_required';

interface PipelineStep {
  id: string; name: string; status: StepStatus;
  message?: string; duration_ms?: number; data?: unknown;
}

interface PipelineReport {
  started_at: string; completed_at?: string; total_duration_ms?: number;
  src: string; lang: string; workdir: string; strict: boolean; full: boolean;
  steps: PipelineStep[]; manual_steps_required: string[];
  next_actions: string[]; artifacts_generated: string[];
  recovery_hints: string[];
  summary: { total: number; ok: number; warn: number; error: number; skipped: number; manual_required: number };
}

type CmdResult = { status: string; message?: string; data?: unknown };

interface SessionState {
  last_run: string; current_step: string; step_status: Record<string, StepStatus>;
  next_actions: string[]; src: string; lang: string; strict: boolean;
}

function saveSession(workDir: string, state: SessionState): void {
  try {
    const ctxDir = path.join(workDir, '_ctx');
    fs.mkdirSync(ctxDir, { recursive: true });
    fs.writeFileSync(path.join(ctxDir, 'session.json'), JSON.stringify(state, null, 2), 'utf-8');
  } catch {}
}

async function runStep(step: PipelineStep, fn: () => Promise<CmdResult>): Promise<{ ok: boolean; data?: unknown; warn?: boolean }> {
  step.status = 'running';
  const start = Date.now();
  try {
    const result = await fn();
    step.duration_ms = Date.now() - start;
    if (result.status === 'ok' || result.status === 'warn') {
      step.status = result.status === 'warn' ? 'warn' : 'ok';
      step.message = result.message ?? 'Completed';
      step.data = result.data;
      return { ok: true, data: result.data, warn: result.status === 'warn' };
    }
    step.status = 'error';
    step.message = result.message ?? 'Unknown error';
    return { ok: false };
  } catch (err) {
    step.duration_ms = Date.now() - start;
    step.status = 'error';
    step.message = (err as Error).message;
    return { ok: false };
  }
}

function getRecoveryHints(failedStep: string): string[] {
  const hints: Record<string, string[]> = {
    'manifest': ['Check that the SRS file exists and is valid Markdown/HTML', 'Try with --lang en if the SRS is in English'],
    'build-ir': ['Ensure guided-extract completed and JSONL files are in 2_extract/r1-explicit/', 'Run validate-jsonl on extraction files to check for format errors'],
    'emit': ['Verify srs-ir.json exists and is valid JSON', 'Check disk space and write permissions in workdir'],
    'validate-bdd': ['Run with --strict after emit completes', 'Check .feature files in outputs/bdd/draft/ for Gherkin syntax errors'],
    'verify-gate-r3': ['Ensure all artifacts are promoted (--promote flag)', 'Run status command to see what is missing'],
  };
  return hints[failedStep] ?? ['Check the workdir for detailed error logs', 'Run "npx tsx index.ts status --workdir <dir>" for diagnostics'];
}

export async function main(args: string[]): Promise<CliResult> {
  let srcPath: string | null, lang: string | null, workDirArg: string | null;
  let strictMode = false, skipInit = false, fullMode = false;

  try {
    srcPath = safeParseArg(args, '--src');
    lang = safeParseArg(args, '--lang');
    workDirArg = safeParseArg(args, '--workdir');
    strictMode = args.includes('--strict');
    skipInit = args.includes('--skip-init');
    fullMode = args.includes('--full');
    if (fullMode) strictMode = true;
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!srcPath && !skipInit) return { status: 'error', message: 'Missing --src (or use --skip-init to resume existing workdir)' };
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
  const recoveryHints: string[] = [];
  const artifactsGenerated: string[] = [];

  function buildReport(): PipelineReport {
    return {
      started_at: startedAt, completed_at: new Date().toISOString(), total_duration_ms: Date.now() - pipelineStart,
      src: absSrc ?? '(skip-init)', lang: langVal, workdir: workDir, strict: strictMode, full: fullMode,
      steps, manual_steps_required: manualSteps, next_actions: nextActions,
      artifacts_generated: artifactsGenerated, recovery_hints: recoveryHints,
      summary: {
        total: steps.length, ok: steps.filter(s => s.status === 'ok').length,
        warn: steps.filter(s => s.status === 'warn').length, error: steps.filter(s => s.status === 'error').length,
        skipped: steps.filter(s => s.status === 'skipped').length,
        manual_required: steps.filter(s => s.status === 'manual_required').length,
      },
    };
  }

  function persistSession(stepId: string): void {
    const stepStatuses: Record<string, StepStatus> = {};
    for (const s of steps) stepStatuses[s.id] = s.status;
    saveSession(workDir, {
      last_run: startedAt, current_step: stepId, step_status: stepStatuses,
      next_actions: nextActions, src: absSrc ?? '', lang: langVal, strict: strictMode,
    });
  }

  function failStep(step: PipelineStep): CliResult {
    recoveryHints.push(...getRecoveryHints(step.id));
    persistSession(step.id);
    return { status: 'error', message: `Failed at "${step.name}": ${step.message}`, data: buildReport() };
  }

  async function runCmd(mod: string, cmdArgs: string[]): Promise<CmdResult> {
    const m = await import(mod) as { main: (a: string[]) => Promise<CmdResult> };
    return m.main(cmdArgs);
  }

  if (!skipInit) {
    const step: PipelineStep = { id: 'init', name: 'Initialize workdir', status: 'pending' };
    steps.push(step);
    const { ok } = await runStep(step, () => runCmd('./init.js', ['--output', workDir]));
    if (!ok) return failStep(step);
    persistSession('init');
  } else {
    steps.push({ id: 'init', name: 'Initialize workdir', status: 'skipped', message: 'Skipped (--skip-init)' });
  }

  if (absSrc) {
    const step: PipelineStep = { id: 'manifest', name: 'Parse SRS and build shard index', status: 'pending' };
    steps.push(step);
    const { ok, data } = await runStep(step, () => runCmd('./manifest.js', ['--src', absSrc, '--lang', langVal, '--workdir', workDir]));
    if (!ok) return failStep(step);
    const manifestData = data as { total_shards?: number } | undefined;
    if (manifestData?.total_shards) artifactsGenerated.push(`shard_index.json (${manifestData.total_shards} shards)`);
    persistSession('manifest');
  } else {
    steps.push({ id: 'manifest', name: 'Parse SRS', status: 'skipped', message: 'No --src provided (resuming)' });
  }

  const extractDir = path.join(workDir, '2_extract', 'r1-explicit');
  const hasExtraction = fs.existsSync(extractDir) && fs.readdirSync(extractDir).filter(f => f.endsWith('.jsonl')).length > 0;

  if (!hasExtraction) {
    steps.push({ id: 'guided-extract', name: 'Guided extraction (LLM/Agent required)', status: 'manual_required', message: 'Requires AI agent for guided-extract' });
    manualSteps.push('guided-extract');
    nextActions.push(`npx tsx index.ts guided-extract --workdir ${workDir}`);
    nextActions.push(`npx tsx index.ts pipeline --skip-init --workdir ${workDir}${strictMode ? ' --strict' : ''}${fullMode ? ' --full' : ''}`);
    persistSession('guided-extract');
  } else {
    steps.push({ id: 'guided-extract', name: 'Guided extraction', status: 'ok', message: 'Extraction exists' });

    const buildIrStep: PipelineStep = { id: 'build-ir', name: 'Build SRS-IR', status: 'pending' };
    steps.push(buildIrStep);
    const { ok: irOk, data: irDataRaw } = await runStep(buildIrStep, () => runCmd('./build-ir.js', ['--workdir', workDir]));
    if (!irOk) return failStep(buildIrStep);
    const irData = irDataRaw as { nodes?: number; edges?: number } | undefined;
    if (irData) artifactsGenerated.push(`srs-ir.json (${irData.nodes ?? 0} nodes, ${irData.edges ?? 0} edges)`);
    persistSession('build-ir');

    for (const [cmd, name, id] of [
      ['./tag-nfr.js', 'Tag NFRs', 'tag-nfr'],
      ['./check-connectivity.js', 'Check connectivity', 'check-connectivity'],
      ['./score-risk.js', 'Score risk', 'score-risk'],
    ] as const) {
      const s: PipelineStep = { id, name, status: 'pending' };
      steps.push(s);
      const r = await runStep(s, () => runCmd(cmd, ['--workdir', workDir]));
      if (!r.ok) return failStep(s);
    }

    const emitStep: PipelineStep = { id: 'emit', name: 'Emit all artifacts', status: 'pending' };
    steps.push(emitStep);
    const { ok: emitOk, data: emitDataRaw } = await runStep(emitStep, () => runCmd('./emit.js', ['--group', 'all', '--workdir', workDir]));
    if (!emitOk) return failStep(emitStep);
    const emitData = emitDataRaw as { totalFiles?: number } | undefined;
    if (emitData?.totalFiles) artifactsGenerated.push(`${emitData.totalFiles} draft files`);
    persistSession('emit');

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
      nextActions.push(`npx tsx index.ts export-audit --workdir ${workDir} --output ${path.join(workDir, '_audit')}`);
    } else {
      steps.push({ id: 'validation', name: 'Formal validation', status: 'skipped', message: 'Add --strict for validation' });
      nextActions.push(`npx tsx index.ts validate-bdd --strict --promote --workdir ${workDir}`);
      nextActions.push(`npx tsx index.ts verify-gate --stage R3 --workdir ${workDir}`);
    }
  }

  const report = buildReport();
  persistSession('complete');
  const hasErrors = report.summary.error > 0;
  const hasManual = report.summary.manual_required > 0;
  const message = hasErrors
    ? `Failed with ${report.summary.error} error(s) at "${steps.find(s => s.status === 'error')?.name ?? 'unknown'}"`
    : hasManual
      ? `Paused — ${report.summary.manual_required} manual/agent step(s) required before proceeding`
      : strictMode
        ? `Pipeline complete (strict) — ${report.summary.ok} steps OK, ${report.summary.warn} warnings in ${(report.total_duration_ms ?? 0) / 1000}s`
        : `Pipeline complete — ${report.summary.ok} steps in ${(report.total_duration_ms ?? 0) / 1000}s (use --strict for validation)`;

  return { status: hasErrors ? 'error' : 'ok', message, data: report };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
