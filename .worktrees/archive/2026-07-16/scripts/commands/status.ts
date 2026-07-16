/**
 * status.ts — Workdir status dashboard
 *
 * CLI: npx tsx index.ts status --workdir .srs_formalizer [--format json|text]
 *
 * Shows current stage, artifact states, validation status, and recommended
 * next actions. Agent-friendly output with both JSON and human-readable text.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';

interface ArtifactStatus {
  name: string;
  draft: boolean;
  verified: boolean;
  draft_files: string[];
  verified_files: string[];
}

interface StageInfo {
  id: string;
  name: string;
  complete: boolean;
  artifacts?: string[];
}

interface StatusReport {
  workdir: string;
  initialized: boolean;
  current_stage: string;
  stages: StageInfo[];
  artifacts: Record<string, ArtifactStatus>;
  ir_built: boolean;
  ir_stats?: { nodes: number; edges: number; nfrs?: number };
  validation: { bdd: string; tla: string; lean: string; gate?: string };
  errors: string[];
  warnings: string[];
  next_actions: string[];
  session?: { last_command?: string; last_updated?: string; step?: string };
}

const STAGE_ORDER = ['init', 'manifest', 'extract', 'build-ir', 'analyze', 'emit', 'validate', 'final'];

function listFilesSafe(dir: string): string[] {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => !f.startsWith('.') && !f.startsWith('_'));
  } catch {
    return [];
  }
}

function readJsonSafe<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function detectStage(workDir: string, artifacts: Record<string, ArtifactStatus>): string {
  const hasExtraction = listFilesSafe(path.join(workDir, '2_extract', 'r1-explicit'))
    .filter(f => f.endsWith('.jsonl')).length > 0;
  const ir = readJsonSafe<{ nodes?: unknown[]; edges?: unknown[]; nfrProfile?: unknown }>(path.join(workDir, 'srs-ir.json'));
  const hasEmits = Object.values(artifacts).some(a => a.draft || a.verified);
  const hasVerified = Object.values(artifacts).some(a => a.verified);

  if (hasVerified) return 'validate';
  if (hasEmits) return 'emit';
  if (ir) return 'analyze';
  if (hasExtraction) return 'build-ir';
  if (listFilesSafe(path.join(workDir, '1_manifest')).length > 0) return 'extract';
  if (fs.existsSync(path.join(workDir, 'STATE.md'))) return 'manifest';
  return 'init';
}

function buildNextActions(stage: string, artifacts: Record<string, ArtifactStatus>, workDir: string): string[] {
  const actions: string[] = [];
  switch (stage) {
    case 'init':
      actions.push(`npx tsx index.ts pipeline --src <srs-file> --lang zh --workdir ${workDir}`);
      break;
    case 'manifest':
      actions.push(`npx tsx index.ts guided-extract --workdir ${workDir}`);
      break;
    case 'extract':
      actions.push(`npx tsx index.ts build-ir --workdir ${workDir}`);
      break;
    case 'build-ir':
      actions.push(`npx tsx index.ts tag-nfr --workdir ${workDir}`);
      actions.push(`npx tsx index.ts score-risk --workdir ${workDir}`);
      actions.push(`npx tsx index.ts emit --group all --workdir ${workDir}`);
      break;
    case 'analyze':
      actions.push(`npx tsx index.ts emit --group all --workdir ${workDir}`);
      break;
    case 'emit':
      if (artifacts.bdd?.draft && !artifacts.bdd.verified) {
        actions.push(`npx tsx index.ts validate-bdd --strict --promote --workdir ${workDir}`);
      }
      actions.push(`npx tsx index.ts verify-gate --stage R3 --workdir ${workDir}`);
      break;
    case 'validate':
      if (artifacts.tlaplus?.draft && !artifacts.tlaplus.verified) {
        actions.push(`npx tsx index.ts validate-tla --name <module> --strict --promote --workdir ${workDir}`);
      }
      if (artifacts.lean4?.draft && !artifacts.lean4.verified) {
        actions.push(`npx tsx index.ts validate-lean --strict --promote --workdir ${workDir}`);
      }
      actions.push(`npx tsx index.ts verify-gate --stage FINAL --workdir ${workDir}`);
      break;
  }
  return actions;
}

function formatTextReport(report: StatusReport): string {
  const lines: string[] = [];
  const wd = report.workdir;
  lines.push('');
  lines.push('╔══════════════════════════════════════════════════════════════╗');
  lines.push('║           SRS-Formalizer Status Dashboard                   ║');
  lines.push('╚══════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`  Workdir:    ${wd}`);
  lines.push(`  Stage:      ${report.current_stage.toUpperCase()}`);
  lines.push(`  IR Built:   ${report.ir_built ? 'Yes' : 'No'}`);
  if (report.ir_stats) {
    lines.push(`  IR Stats:   ${report.ir_stats.nodes} nodes, ${report.ir_stats.edges} edges`);
  }
  lines.push('');
  lines.push('  ── Stages ──────────────────────────────────────────────────');
  for (const s of report.stages) {
    const mark = s.complete ? '✓' : '○';
    lines.push(`   ${mark} ${s.name.padEnd(20)}`);
  }
  lines.push('');
  lines.push('  ── Artifacts ───────────────────────────────────────────────');
  for (const [name, a] of Object.entries(report.artifacts)) {
    const d = a.draft ? `${a.draft_files.length} draft` : '';
    const v = a.verified ? `${a.verified_files.length} verified` : '';
    const state = a.verified ? '✓ VERIFIED' : a.draft ? '◐ DRAFT' : '○ empty';
    const info = [d, v].filter(Boolean).join(', ');
    lines.push(`   ${name.padEnd(12)} ${state.padEnd(12)} ${info}`);
  }
  if (report.errors.length > 0) {
    lines.push('');
    lines.push('  ── Errors ──────────────────────────────────────────────────');
    for (const e of report.errors) lines.push(`   ✗ ${e}`);
  }
  if (report.warnings.length > 0) {
    lines.push('');
    lines.push('  ── Warnings ────────────────────────────────────────────────');
    for (const w of report.warnings) lines.push(`   ! ${w}`);
  }
  lines.push('');
  lines.push('  ── Next Actions ────────────────────────────────────────────');
  for (let i = 0; i < report.next_actions.length; i++) {
    lines.push(`   ${i + 1}. ${report.next_actions[i]}`);
  }
  lines.push('');
  return lines.join('\n');
}

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null, formatArg: string | null;
  try {
    workDirArg = safeParseArg(args, '--workdir');
    formatArg = safeParseArg(args, '--format');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!workDirArg) return { status: 'error', message: 'Missing --workdir' };
  const fmt = formatArg ?? 'json';
  if (fmt !== 'json' && fmt !== 'text') return { status: 'error', message: 'Invalid --format (json|text)' };

  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); } catch (err) { return { status: 'error', message: (err as Error).message }; }

  const errors: string[] = [];
  const warnings: string[] = [];
  const artifacts: Record<string, ArtifactStatus> = {};
  const outputDirs = ['graphs', 'bdd', 'tlaplus', 'lean4', 'fixtures', 'reports'];

  for (const dir of outputDirs) {
    const draftPath = path.join(workDir, 'outputs', dir, 'draft');
    const verifiedPath = path.join(workDir, 'outputs', dir, 'verified');
    const draftFiles = listFilesSafe(draftPath);
    const verifiedFiles = listFilesSafe(verifiedPath);
    artifacts[dir] = {
      name: dir, draft: draftFiles.length > 0, verified: verifiedFiles.length > 0,
      draft_files: draftFiles, verified_files: verifiedFiles,
    };
  }

  const ir = readJsonSafe<{ nodes?: unknown[]; edges?: unknown[]; nfrProfile?: unknown }>(path.join(workDir, 'srs-ir.json'));
  const ir_built = ir !== null;

  const stage = detectStage(workDir, artifacts);
  const stages: StageInfo[] = STAGE_ORDER.map(s => ({
    id: s, name: s, complete: STAGE_ORDER.indexOf(s) <= STAGE_ORDER.indexOf(stage),
  }));

  const validation = { bdd: artifacts.bdd?.verified ? 'verified' : artifacts.bdd?.draft ? 'draft' : 'none',
    tla: artifacts.tlaplus?.verified ? 'verified' : artifacts.tlaplus?.draft ? 'draft' : 'none',
    lean: artifacts.lean4?.verified ? 'verified' : artifacts.lean4?.draft ? 'draft' : 'none' };

  const session = readJsonSafe<{ last_command?: string; last_updated?: string; step?: string }>(path.join(workDir, '_ctx', 'session.json')) ?? undefined;
  const next_actions = buildNextActions(stage, artifacts, workDir);

  const report: StatusReport = {
    workdir: workDir, initialized: fs.existsSync(workDir), current_stage: stage,
    stages, artifacts, ir_built,
    ...(ir ? { ir_stats: { nodes: ir.nodes?.length ?? 0, edges: ir.edges?.length ?? 0 } } : {}),
    validation, errors, warnings, next_actions,
    ...(session ? { session } : {}),
  };

  if (fmt === 'text') {
    return { status: 'ok', message: formatTextReport(report), data: report };
  }
  return { status: 'ok', message: `Stage: ${stage}, IR: ${ir_built ? 'built' : 'not built'}, Actions: ${next_actions.length}`, data: report };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
