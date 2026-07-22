import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { validateFeatureBasic, validateFeatureNFR, validateFeatureSemantics } from '../lib/bdd-validator.js';
import { runGherkinLint, runGherklin } from '../lib/bdd-tool-runner.js';
import { ARTIFACT_PATHS, artifactPath } from '../lib/artifacts/paths.js';
import { hashFiles, hashText, writeValidationReport } from '../lib/artifacts/validation-report.js';

import { promoteFiles } from '../lib/artifacts/promotion.js';

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  try { workDirArg = safeParseArg(args, '--workdir'); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }
  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };

  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); }
  catch (err) { return { status: 'error', message: (err as Error).message }; }

  const strict = args.includes('--strict');
  const promote = args.includes('--promote');
  if (promote && !strict) return { status: 'error', message: '--promote requires --strict' };

  const sourceDir = artifactPath(workDir, promote ? ARTIFACT_PATHS.bddDraft : ARTIFACT_PATHS.bddVerified);
  if (!fs.existsSync(sourceDir)) return { status: 'error', message: `BDD ${promote ? 'draft' : 'verified'} directory not found: ${sourceDir}` };
  const files = fs.readdirSync(sourceDir).filter(file => file.endsWith('.feature')).sort();
  if (files.length === 0) return { status: 'ok', data: { valid: true, files_checked: 0, files: [], report: null } };

  const errors: string[] = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(sourceDir, file), 'utf-8');
    const basic = validateFeatureBasic(content, strict);
    errors.push(...basic.errors.map(error => `[${file}] ${error}`));
    if (strict) {
      const nfr = validateFeatureNFR(content, file);
      errors.push(...nfr.errors.map(error => `[${file}] ${error}`));
      errors.push(...nfr.warnings.filter(warning =>
        warning.includes('authentication precondition') || warning.includes('threshold value pattern'),
      ).map(warning => `[${file}] ${warning}`));
      const semantics = validateFeatureSemantics(content, file);
      errors.push(...semantics.errors.map(error => `[${file}] ${error}`));
    }
  }
  if (strict) {
    const lint = runGherkinLint(sourceDir);
    if (!lint.passed) errors.push(`[gherkin-lint] ${lint.output.slice(0, 500)}`);
    const gherklin = await runGherklin(sourceDir);
    if (!gherklin.passed) errors.push(`[gherklin] ${gherklin.output.slice(0, 500)}`);
  }
  if (errors.length > 0) return { status: 'error', message: 'BDD validation failed', data: { valid: false, errors, files_checked: files.length } };

  const sourcePaths = files.map(file => path.join(sourceDir, file));
  let verifiedFiles = sourcePaths;
  if (promote) verifiedFiles = promoteFiles(sourceDir, artifactPath(workDir, ARTIFACT_PATHS.bddVerified), files);
  // Hash the FINAL file locations (verified/ when --promote, draft/ otherwise) so that
  // checks-final.ts (which hashes the verified/ paths) can match the report's sourceHash.
  // Earlier versions hashed sourcePaths (draft paths) which never matched verified paths.
  const sourceHash = hashFiles(verifiedFiles);
  // P0: irHash must bind to the current srs-ir.json content (not sourceHash, which
  // made the field useless). checkReportAuthenticity rejects reports whose irHash
  // does not match the current IR — catching artifacts not re-validated after IR changed.
  const irHash = hashText(fs.readFileSync(path.join(workDir, 'srs-ir.json'), 'utf-8'));
  const startedAt = new Date().toISOString();
  const reportPath = path.join(artifactPath(workDir, ARTIFACT_PATHS.bddValidation), `${sourceHash}.json`);
  writeValidationReport(reportPath, {
    artifactKind: 'bdd', lifecycle: 'verified', sourcePaths: verifiedFiles, sourceHash, irHash,
    tools: strict ? [{ name: 'gherkin-lint', version: 'configured' }, { name: 'gherklin', version: 'configured' }] : [],
    startedAt, completedAt: new Date().toISOString(), passed: true,
    checks: [{ name: 'BDD structure', passed: true }, { name: 'strict validation', passed: strict }],
  });
  return { status: 'ok', data: { valid: true, files_checked: files.length, files: verifiedFiles, report: reportPath } };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
