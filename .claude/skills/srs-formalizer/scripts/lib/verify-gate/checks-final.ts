import * as fs from 'node:fs';
import * as path from 'node:path';
import { scanLeanSourceForPlaceholders, scanTlaSourceForPlaceholders, type CheckResult } from './shared.js';
import { ARTIFACT_PATHS, artifactPath } from '../artifacts/paths.js';

function verifiedArtifactCheck(workDir: string, kind: 'bdd' | 'tlaplus' | 'lean4', required: boolean): CheckResult {
  const config = {
    bdd: { verified: ARTIFACT_PATHS.bddVerified, validation: ARTIFACT_PATHS.bddValidation, extension: '.feature' },
    tlaplus: { verified: ARTIFACT_PATHS.tlaVerified, validation: ARTIFACT_PATHS.tlaValidation, extension: '.tla' },
    lean4: { verified: ARTIFACT_PATHS.leanVerified, validation: ARTIFACT_PATHS.leanValidation, extension: '.lean' },
  }[kind];
  if (!required) return { name: `${kind} verified artifacts`, passed: true, detail: 'Not required by IR' };
  const verified = artifactPath(workDir, config.verified);
  const validation = artifactPath(workDir, config.validation);
  const sourceFiles = fs.existsSync(verified) ? fs.readdirSync(verified).filter(file => file.endsWith(config.extension)) : [];
  const passing = fs.existsSync(validation) && fs.readdirSync(validation).filter(file => file.endsWith('.json')).some(file => {
    try { return JSON.parse(fs.readFileSync(path.join(validation, file), 'utf8')).passed === true; } catch { return false; }
  });
  return { name: `${kind} verified artifacts`, passed: sourceFiles.length > 0 && passing, detail: sourceFiles.length > 0 && passing ? `${sourceFiles.length} verified source(s) with successful report` : 'verified source or successful validation report missing' };
}

export function checkFormalArtifacts(workDir: string): CheckResult[] {
  try {
    const ir = JSON.parse(fs.readFileSync(path.join(workDir, 'srs-ir.json'), 'utf8')) as { nfrProfile?: { detectedCategories?: Array<{ category: string }> } };
    const leanRequired = ir.nfrProfile?.detectedCategories?.some(entry => entry.category === 'security' || entry.category === 'compliance') ?? false;
    return [verifiedArtifactCheck(workDir, 'bdd', true), verifiedArtifactCheck(workDir, 'tlaplus', true), verifiedArtifactCheck(workDir, 'lean4', leanRequired)];
  } catch { return [{ name: 'SRS IR available for artifact requirements', passed: false, detail: 'srs-ir.json cannot be read' }]; }
}

export function checkTlaGraphExists(workDir: string): CheckResult {
  const specs = path.join(workDir, '5_formal', 'specs');
  const placeholders = scanTlaSourceForPlaceholders(specs);
  return { name: 'TLA interaction graph exists', passed: placeholders.length === 0, detail: placeholders.length ? `Forbidden placeholders: ${placeholders.map(hit => `${hit.file}:${hit.marker}`).join(', ')}` : 'Legacy source scan clean' };
}

export function checkLeanGraphExists(workDir: string): CheckResult {
  const proofs = path.join(workDir, '5_formal', 'proofs');
  const placeholders = scanLeanSourceForPlaceholders(proofs);
  return { name: 'Lean proof graph exists', passed: placeholders.length === 0, detail: placeholders.length ? `Forbidden placeholders: ${placeholders.map(hit => `${hit.file}:${hit.kind}`).join(', ')}` : 'Legacy source scan clean' };
}
