import * as fs from 'node:fs';
import * as path from 'node:path';
import { scanLeanSourceForPlaceholders, scanTlaSourceForPlaceholders, type CheckResult } from './shared.js';
import { ARTIFACT_PATHS, artifactPath } from '../artifacts/paths.js';
import { collectByExtension, collectFiles, hashFiles, readMatchingReport, readPassingReports } from '../artifacts/validation-report.js';

export function verifiedArtifactCheck(workDir: string, kind: 'bdd' | 'lean4', required: boolean): CheckResult {
  const config = {
    bdd: { verified: ARTIFACT_PATHS.bddVerified, validation: ARTIFACT_PATHS.bddValidation, files: (root: string) => collectByExtension(root, '.feature') },
    lean4: { verified: ARTIFACT_PATHS.leanVerified, validation: ARTIFACT_PATHS.leanValidation, files: (root: string) => [...collectByExtension(root, '.lean'), ...collectFiles(root, ['lakefile.lean', 'lakefile.toml', 'lean-toolchain'])] },
  }[kind];
  if (!required) return { name: `${kind} verified artifacts`, passed: true, detail: 'Not required by IR' };
  const files = config.files(artifactPath(workDir, config.verified));
  if (files.length === 0) return { name: `${kind} verified artifacts`, passed: false, detail: 'verified source missing' };
  const passing = readMatchingReport(artifactPath(workDir, config.validation), kind, hashFiles(files));
  return { name: `${kind} verified artifacts`, passed: passing, detail: passing ? `${files.length} verified input(s) match a successful validation report` : 'current verified content has no matching successful validation report' };
}

/** A TLA+ module = a `<name>.tla` + matching `<name>.cfg` pair. */
function tlaModulesInVerified(root: string): Map<string, string[]> {
  const modules = new Map<string, string[]>();
  for (const tla of collectByExtension(root, '.tla')) {
    const cfg = tla.replace(/\.tla$/, '.cfg');
    if (fs.existsSync(cfg)) modules.set(path.basename(tla, '.tla'), [tla, cfg]);
  }
  return modules;
}

/**
 * FINAL check for TLA+ by MODULE SET rather than file count (proposal §P0-2).
 *
 * The old check passed as long as `.tla`+`.cfg` file count ≥ 1 and *some* report
 * matched, so a single surviving module (after the destructive promote wiped the
 * rest) counted as full coverage. Here we reconstruct the module set that was
 * actually validated from the passing reports and require, module-by-module,
 * that its files are still present in verified/ AND that the current bytes match
 * a passing report. Any validated module missing from verified/ (the drop the
 * destructive promote caused) fails the gate with the missing module named.
 */
export function tlaVerifiedCheck(workDir: string): CheckResult {
  const name = 'tlaplus verified artifacts';
  const verifiedRoot = artifactPath(workDir, ARTIFACT_PATHS.tlaVerified);
  const validationDir = artifactPath(workDir, ARTIFACT_PATHS.tlaValidation);
  const modules = tlaModulesInVerified(verifiedRoot);
  const reports = readPassingReports(validationDir, 'tlaplus');

  if (reports.length === 0) {
    return { name, passed: false, detail: 'no passing TLA+ validation report with tool evidence found' };
  }

  const validatedModules = new Set<string>();
  for (const report of reports) {
    for (const sourcePath of report.sourcePaths) {
      if (sourcePath.endsWith('.tla')) validatedModules.add(path.basename(sourcePath, '.tla'));
    }
  }

  const missingFromVerified = [...validatedModules].filter(module => !modules.has(module)).sort();
  if (missingFromVerified.length > 0) {
    return {
      name,
      passed: false,
      detail: `${missingFromVerified.length} validated module(s) missing from verified/ (promote likely overwrote them): ${missingFromVerified.join(', ')}`,
    };
  }

  if (modules.size === 0) {
    return { name, passed: false, detail: 'verified source missing (no <module>.tla + <module>.cfg pair)' };
  }

  const unmatched: string[] = [];
  for (const [module, files] of modules) {
    if (!readMatchingReport(validationDir, 'tlaplus', hashFiles(files))) unmatched.push(module);
  }
  if (unmatched.length > 0) {
    return {
      name,
      passed: false,
      detail: `${unmatched.length} verified module(s) with no matching passing report (content changed after validation): ${unmatched.sort().join(', ')}`,
    };
  }

  return { name, passed: true, detail: `${modules.size} TLA+ module(s) verified and matched: ${[...modules.keys()].sort().join(', ')}` };
}

/** B4/FINAL: Lean4 verified artifacts — required only when IR has security/compliance NFR */
export function leanVerifiedCheck(workDir: string): CheckResult {
  try {
    const ir = JSON.parse(fs.readFileSync(path.join(workDir, 'srs-ir.json'), 'utf8')) as { nfrProfile?: { detectedCategories?: Array<{ category: string }> } };
    const leanRequired = ir.nfrProfile?.detectedCategories?.some(entry => entry.category === 'security' || entry.category === 'compliance') ?? false;
    return verifiedArtifactCheck(workDir, 'lean4', leanRequired);
  } catch {
    return { name: 'lean4 verified artifacts', passed: false, detail: 'srs-ir.json cannot be read' };
  }
}

export function checkFormalArtifacts(workDir: string): CheckResult[] {
  try {
    // Read IR to determine lean requirement; if IR unreadable, fail.
    JSON.parse(fs.readFileSync(path.join(workDir, 'srs-ir.json'), 'utf8'));
    return [verifiedArtifactCheck(workDir, 'bdd', true), tlaVerifiedCheck(workDir), leanVerifiedCheck(workDir)];
  } catch { return [{ name: 'SRS IR available for artifact requirements', passed: false, detail: 'srs-ir.json cannot be read' }]; }
}

export function checkLegacyTlaSource(workDir: string): CheckResult {
  const hits = scanTlaSourceForPlaceholders(path.join(workDir, '5_formal', 'specs'));
  return { name: 'legacy TLA source scan', passed: hits.length === 0, detail: hits.length ? `Forbidden placeholders: ${hits.map(hit => `${hit.file}:${hit.marker}`).join(', ')}` : 'Legacy source scan clean' };
}

export function checkLegacyLeanSource(workDir: string): CheckResult {
  const hits = scanLeanSourceForPlaceholders(path.join(workDir, '5_formal', 'proofs'));
  return { name: 'legacy Lean source scan', passed: hits.length === 0, detail: hits.length ? `Forbidden placeholders: ${hits.map(hit => `${hit.file}:${hit.kind}`).join(', ')}` : 'Legacy source scan clean' };
}

export const checkTlaGraphExists = checkLegacyTlaSource;
export const checkLeanGraphExists = checkLegacyLeanSource;
