import * as fs from 'node:fs';
import * as path from 'node:path';
import { scanLeanSourceForPlaceholders, scanTlaSourceForPlaceholders, type CheckResult } from './shared.js';
import { ARTIFACT_PATHS, artifactPath } from '../artifacts/paths.js';
import { collectByExtension, collectFiles, hashFiles, readMatchingReport } from '../artifacts/validation-report.js';

type ArtifactKind = 'bdd' | 'tlaplus' | 'lean4';

function verifiedArtifactCheck(workDir: string, kind: ArtifactKind, required: boolean): CheckResult {
  const config = {
    bdd: { verified: ARTIFACT_PATHS.bddVerified, validation: ARTIFACT_PATHS.bddValidation, files: (root: string) => collectByExtension(root, '.feature') },
    tlaplus: { verified: ARTIFACT_PATHS.tlaVerified, validation: ARTIFACT_PATHS.tlaValidation, files: (root: string) => collectByExtension(root, '.tla').flatMap(file => { const cfg = file.replace(/\.tla$/, '.cfg'); return fs.existsSync(cfg) ? [file, cfg] : []; }) },
    lean4: { verified: ARTIFACT_PATHS.leanVerified, validation: ARTIFACT_PATHS.leanValidation, files: (root: string) => [...collectByExtension(root, '.lean'), ...collectFiles(root, ['lakefile.lean', 'lakefile.toml', 'lean-toolchain'])] },
  }[kind];
  if (!required) return { name: `${kind} verified artifacts`, passed: true, detail: 'Not required by IR' };
  const files = config.files(artifactPath(workDir, config.verified));
  if (files.length === 0) return { name: `${kind} verified artifacts`, passed: false, detail: 'verified source missing' };
  const passing = readMatchingReport(artifactPath(workDir, config.validation), kind, hashFiles(files));
  return { name: `${kind} verified artifacts`, passed: passing, detail: passing ? `${files.length} verified input(s) match a successful validation report` : 'current verified content has no matching successful validation report' };
}

export function checkFormalArtifacts(workDir: string): CheckResult[] {
  try {
    const ir = JSON.parse(fs.readFileSync(path.join(workDir, 'srs-ir.json'), 'utf8')) as { nfrProfile?: { detectedCategories?: Array<{ category: string }> } };
    const leanRequired = ir.nfrProfile?.detectedCategories?.some(entry => entry.category === 'security' || entry.category === 'compliance') ?? false;
    return [verifiedArtifactCheck(workDir, 'bdd', true), verifiedArtifactCheck(workDir, 'tlaplus', true), verifiedArtifactCheck(workDir, 'lean4', leanRequired)];
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
