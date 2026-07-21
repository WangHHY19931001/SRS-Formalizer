import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ArtifactLifecycle } from './paths.js';

export interface ValidationCheck { name: string; passed: boolean; detail?: string; }
export interface ValidationTool { name: string; version: string; }

/**
 * Evidence that a verification tool actually executed (proposal §P0-1). Written
 * only by the validate-* scripts from a captured child-process result, never by
 * hand. `toolStdoutHash` is the sha256 of the tool's raw stdout/stderr, so the
 * FINAL gate can require its presence and reject purely static JSON that claims
 * `passed: true` without any real run.
 */
export interface ToolExecutionEvidence {
  tool: string;
  exitCode: number | null;
  stdoutHash: string;
  durationMs?: number;
}
export interface ArtifactValidationReport {
  artifactKind: 'bdd' | 'tlaplus' | 'lean4'; lifecycle: Extract<ArtifactLifecycle, 'verified'>;
  sourcePaths: string[]; sourceHash: string; irHash: string; tools: ValidationTool[];
  startedAt: string; completedAt: string; passed: boolean; checks: ValidationCheck[];
  toolEvidence?: ToolExecutionEvidence[];
}

export function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Content-addressed hash of a file set (proposal §P0-3). Keyed on each file's
 * basename + content, NOT its absolute path, so the same bytes hash identically
 * whether they live in draft/ or verified/. The previous implementation folded
 * the absolute path into the digest, which meant a report written from a draft
 * path could never match the verified-path hash the FINAL gate recomputes —
 * forcing manual hash rewrites. Basenames are deduplicated so a file collected
 * twice (e.g. lakefile.lean via both extension and name scans) counts once.
 */
export function hashFiles(filePaths: string[]): string {
  const byName = new Map<string, Buffer>();
  for (const filePath of filePaths) {
    const key = path.basename(filePath);
    if (!byName.has(key)) byName.set(key, fs.readFileSync(filePath));
  }
  const hash = crypto.createHash('sha256');
  for (const key of [...byName.keys()].sort()) {
    hash.update(key); hash.update('\0');
    hash.update(byName.get(key)!); hash.update('\0');
  }
  return hash.digest('hex');
}

export function collectFiles(root: string, names: readonly string[]): string[] {
  if (!fs.existsSync(root)) return [];
  const result: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const candidate = path.join(dir, entry.name);
      if (entry.isDirectory() && !['.lake', 'build'].includes(entry.name)) visit(candidate);
      else if (entry.isFile() && names.includes(entry.name)) result.push(candidate);
    }
  };
  visit(root);
  return result;
}

export function collectByExtension(root: string, extension: string): string[] {
  if (!fs.existsSync(root)) return [];
  const result: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const candidate = path.join(dir, entry.name);
      if (entry.isDirectory() && !['.lake', 'build'].includes(entry.name)) visit(candidate);
      else if (entry.isFile() && entry.name.endsWith(extension)) result.push(candidate);
    }
  };
  visit(root);
  return result;
}

/**
 * True when the report carries execution evidence from every tool it required
 * (proposal §P0-1): a non-empty `toolEvidence` array where each entry has a
 * 64-hex stdout hash and an exit code of 0. Formal artifacts (tlaplus/lean4)
 * must clear this bar; a hand-written JSON with `passed: true` but no captured
 * tool output no longer satisfies the FINAL gate.
 */
function hasRealToolEvidence(report: Partial<ArtifactValidationReport>): boolean {
  const evidence = report.toolEvidence;
  if (!Array.isArray(evidence) || evidence.length === 0) return false;
  return evidence.every(entry =>
    typeof entry?.stdoutHash === 'string' && /^[0-9a-f]{64}$/.test(entry.stdoutHash) && entry.exitCode === 0,
  );
}

/**
 * All verified+passed reports for a kind that carry real tool evidence when the
 * kind requires it (proposal §P0-2). Used by the FINAL gate to reconstruct the
 * set of modules that were actually validated, so a module whose report exists
 * but whose files were dropped from verified/ can be detected — the exact
 * failure the destructive promote used to hide.
 */
export function readPassingReports(reportDir: string, artifactKind: ArtifactValidationReport['artifactKind']): ArtifactValidationReport[] {
  if (!fs.existsSync(reportDir)) return [];
  const requireEvidence = artifactKind === 'tlaplus' || artifactKind === 'lean4';
  const reports: ArtifactValidationReport[] = [];
  for (const file of fs.readdirSync(reportDir).filter(name => name.endsWith('.json'))) {
    try {
      const report = JSON.parse(fs.readFileSync(path.join(reportDir, file), 'utf8')) as ArtifactValidationReport;
      const base = report.artifactKind === artifactKind && report.lifecycle === 'verified' && report.passed === true;
      if (base && (!requireEvidence || hasRealToolEvidence(report))) reports.push(report);
    } catch { /* skip malformed report */ }
  }
  return reports;
}

export function readMatchingReport(reportDir: string, artifactKind: ArtifactValidationReport['artifactKind'], sourceHash: string): boolean {
  if (!fs.existsSync(reportDir)) return false;
  const requireEvidence = artifactKind === 'tlaplus' || artifactKind === 'lean4';
  return fs.readdirSync(reportDir).filter(file => file.endsWith('.json')).some(file => {
    try {
      const report = JSON.parse(fs.readFileSync(path.join(reportDir, file), 'utf8')) as Partial<ArtifactValidationReport>;
      const base = report.artifactKind === artifactKind && report.lifecycle === 'verified' && report.passed === true && report.sourceHash === sourceHash;
      return base && (!requireEvidence || hasRealToolEvidence(report));
    } catch { return false; }
  });
}

export function writeValidationReport(reportPath: string, report: ArtifactValidationReport): void {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const temporaryPath = path.join(path.dirname(reportPath), `.${path.basename(reportPath)}.tmp`);
  fs.writeFileSync(temporaryPath, JSON.stringify(report, null, 2), 'utf-8');
  fs.renameSync(temporaryPath, reportPath);
}
