import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ArtifactLifecycle } from './paths.js';

export interface ValidationCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface ValidationTool {
  name: string;
  version: string;
}

export interface ArtifactValidationReport {
  artifactKind: 'bdd' | 'tlaplus' | 'lean4';
  lifecycle: Extract<ArtifactLifecycle, 'verified'>;
  sourcePaths: string[];
  sourceHash: string;
  irHash: string;
  tools: ValidationTool[];
  startedAt: string;
  completedAt: string;
  passed: boolean;
  checks: ValidationCheck[];
}

export function hashFiles(filePaths: string[]): string {
  const hash = crypto.createHash('sha256');
  for (const filePath of [...filePaths].sort()) {
    hash.update(filePath);
    hash.update('\0');
    hash.update(fs.readFileSync(filePath));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function writeValidationReport(reportPath: string, report: ArtifactValidationReport): void {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const temporaryPath = path.join(path.dirname(reportPath), `.${path.basename(reportPath)}.tmp`);
  fs.writeFileSync(temporaryPath, JSON.stringify(report, null, 2), 'utf-8');
  fs.renameSync(temporaryPath, reportPath);
}
