/**
 * export-audit.ts — Export audit package with traceability and validation evidence
 *
 * CLI: npx tsx index.ts export-audit --workdir .srs_formalizer --output <dir>
 *
 * Collects: validation reports, source hash chain, traceability matrix,
 * IR summary, risk scores, and artifact manifest. Generates AUDIT_SUMMARY.md
 * and copies all evidence files into an audit directory.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir, assertSafePath } from '../lib/cli.js';
import { collectFiles, collectByExtension } from '../lib/artifacts/validation-report.js';

interface AuditEvidence {
  category: string;
  path: string;
  hash: string;
  exists: boolean;
}

interface AuditSummary {
  exported_at: string;
  workdir: string;
  srs_source_hash?: string;
  ir_hash?: string;
  ir_stats?: { nodes: number; edges: number };
  artifacts: Array<{ kind: string; draft_count: number; verified_count: number }>;
  validation_reports: string[];
  evidence: AuditEvidence[];
  traceability_matrix?: boolean;
  risk_score?: unknown;
  overall_status: 'complete' | 'partial' | 'not_started';
}

function hashFile(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => !f.startsWith('.'));
}

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null, outputArg: string | null;
  try {
    workDirArg = safeParseArg(args, '--workdir');
    outputArg = safeParseArg(args, '--output');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!workDirArg) return { status: 'error', message: 'Missing --workdir' };
  if (!outputArg) return { status: 'error', message: 'Missing --output' };

  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); } catch (err) { return { status: 'error', message: (err as Error).message }; }

  const outDir = path.resolve(outputArg);
  if (!outDir.startsWith(path.resolve(workDir) + path.sep) && outDir !== path.resolve(workDir)) {
    try { assertSafePath(outDir, path.dirname(workDir)); } catch {
      return { status: 'error', message: 'Output path must be within or adjacent to workdir parent' };
    }
  }

  fs.mkdirSync(outDir, { recursive: true });
  const evidenceDir = path.join(outDir, 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });

  const evidence: AuditEvidence[] = [];
  const evidenceFiles: Array<{ src: string; category: string }> = [];

  const irPath = path.join(workDir, 'srs-ir.json');
  const irExists = fs.existsSync(irPath);
  let irHash: string | undefined;
  let irStats: { nodes: number; edges: number } | undefined;
  if (irExists) {
    irHash = hashFile(irPath);
    const ir = JSON.parse(fs.readFileSync(irPath, 'utf-8')) as { nodes?: unknown[]; edges?: unknown[] };
    irStats = { nodes: ir.nodes?.length ?? 0, edges: ir.edges?.length ?? 0 };
    evidenceFiles.push({ src: irPath, category: 'ir' });
  }

  const manifestDir = path.join(workDir, '1_manifest');
  let srsHash: string | undefined;
  for (const f of listFiles(manifestDir)) {
    if (f.endsWith('.md') || f.endsWith('.json')) {
      const fp = path.join(manifestDir, f);
      srsHash = srsHash ?? hashFile(fp);
      evidenceFiles.push({ src: fp, category: 'source' });
    }
  }

  const artifacts: Array<{ kind: string; draft_count: number; verified_count: number }> = [];
  for (const kind of ['graphs', 'bdd', 'tlaplus', 'lean4', 'fixtures', 'reports'] as const) {
    const draftDir = path.join(workDir, 'outputs', kind, 'draft');
    const verDir = path.join(workDir, 'outputs', kind, 'verified');
    const dc = listFiles(draftDir).length;
    const vc = listFiles(verDir).length;
    artifacts.push({ kind, draft_count: dc, verified_count: vc });
    for (const f of listFiles(draftDir)) evidenceFiles.push({ src: path.join(draftDir, f), category: `${kind}/draft` });
    for (const f of listFiles(verDir)) evidenceFiles.push({ src: path.join(verDir, f), category: `${kind}/verified` });
  }

  const reportsDir = path.join(workDir, '_reports');
  const validationReports: string[] = [];
  const reportFiles = collectFiles(reportsDir, []);
  for (const rf of reportFiles) {
    if (rf.endsWith('.json')) {
      validationReports.push(path.relative(workDir, rf));
      evidenceFiles.push({ src: rf, category: 'validation' });
    }
  }

  const traceDir = path.join(workDir, 'outputs', 'reports', 'verified');
  const hasTraceability = collectByExtension(traceDir, '.md').length > 0 ||
    collectByExtension(path.join(workDir, 'outputs', 'reports', 'draft'), '.md').length > 0;

  for (const { src, category } of evidenceFiles) {
    if (!fs.existsSync(src)) {
      evidence.push({ category, path: path.relative(workDir, src), hash: '', exists: false });
      continue;
    }
    const relPath = path.relative(workDir, src);
    const destPath = path.join(evidenceDir, relPath.replace(/[\\/]/g, '__'));
    fs.copyFileSync(src, destPath);
    evidence.push({ category, path: relPath, hash: hashFile(src), exists: true });
  }

  const allVerified = artifacts.filter(a => ['bdd', 'tlaplus', 'lean4'].includes(a.kind)).every(a => a.verified_count > 0);
  const anyDraft = artifacts.some(a => a.draft_count > 0);
  const overallStatus = allVerified ? 'complete' : anyDraft || irExists ? 'partial' : 'not_started';

  const summary: AuditSummary = {
    exported_at: new Date().toISOString(), workdir: workDir,
    ...(srsHash ? { srs_source_hash: srsHash } : {}),
    ...(irHash ? { ir_hash: irHash } : {}),
    ...(irStats ? { ir_stats: irStats } : {}),
    artifacts, validation_reports: validationReports, evidence,
    ...(hasTraceability ? { traceability_matrix: hasTraceability } : {}),
    overall_status: overallStatus,
  };

  fs.writeFileSync(path.join(outDir, 'audit-summary.json'), JSON.stringify(summary, null, 2), 'utf-8');

  const mdLines = [
    '# Audit Summary', '',
    `- **Exported**: ${summary.exported_at}`,
    `- **Workdir**: ${workDir}`,
    `- **Status**: ${summary.overall_status.toUpperCase()}`,
    `- **IR**: ${irStats ? `${irStats.nodes} nodes, ${irStats.edges} edges` : 'Not built'}`, '',
    '## Artifacts', '',
    '| Kind | Draft | Verified |', '|------|-------|----------|',
    ...artifacts.map(a => `| ${a.kind} | ${a.draft_count} | ${a.verified_count} |`), '',
    '## Validation Reports', '',
    ...validationReports.map(r => `- ${r}`),
    ...(validationReports.length === 0 ? ['(none)'] : []), '',
    '## Evidence Files', '',
    `Total: ${evidence.filter(e => e.exists).length} files`, '',
  ];
  fs.writeFileSync(path.join(outDir, 'AUDIT_SUMMARY.md'), mdLines.join('\n'), 'utf-8');

  return {
    status: 'ok',
    message: `Audit exported to ${outDir} (status: ${overallStatus}, ${evidence.filter(e => e.exists).length} files)`,
    data: { output_dir: outDir, status: overallStatus, evidence_count: evidence.filter(e => e.exists).length, validation_count: validationReports.length },
  };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
