import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { checkFormalArtifacts } from '../lib/verify-gate/checks-final.js';
import { hashFiles, hashText, writeValidationReport } from '../lib/artifacts/validation-report.js';

function setup(): string {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'srs-final-hash-'));
  fs.writeFileSync(path.join(workdir, 'srs-ir.json'), JSON.stringify({ nfrProfile: { detectedCategories: [] } }));
  for (const dir of ['outputs/bdd/verified', 'outputs/bdd/validation', 'outputs/tlaplus/verified', 'outputs/tlaplus/validation']) fs.mkdirSync(path.join(workdir, dir), { recursive: true });
  fs.writeFileSync(path.join(workdir, 'outputs/bdd/verified', 'feature.feature'), 'Feature: valid\nScenario: valid\nGiven valid\nWhen valid\nThen valid\n');
  fs.writeFileSync(path.join(workdir, 'outputs/tlaplus/verified', 'Spec.tla'), '---- MODULE Spec ----\nVARIABLE x\nInit == x = 0\nNext == x\' = x\nTypeOK == x = 0\n====\n');
  fs.writeFileSync(path.join(workdir, 'outputs/tlaplus/verified', 'Spec.cfg'), 'INIT Init\nNEXT Next\nINVARIANT TypeOK\n');
  return workdir;
}

function report(workdir: string, kind: 'bdd' | 'tlaplus', files: string[], hash = hashFiles(files)): void {
  // tlaplus/lean4 reports must now carry real tool-execution evidence (§P0-1);
  // bdd does not require it.
  const toolEvidence = kind === 'tlaplus'
    ? [{ tool: 'TLC', exitCode: 0, stdoutHash: hashText('model checking completed') }]
    : undefined;
  writeValidationReport(path.join(workdir, 'outputs', kind === 'bdd' ? 'bdd' : 'tlaplus', 'validation', `${kind}.json`), { artifactKind: kind, lifecycle: 'verified', sourcePaths: files, sourceHash: hash, irHash: hash, tools: [], startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:00:01.000Z', passed: true, checks: [], toolEvidence });
}

describe('FINAL report content binding', () => {
  it('accepts reports matching current verified source hashes', () => {
    const workdir = setup();
    report(workdir, 'bdd', [path.join(workdir, 'outputs/bdd/verified/feature.feature')]);
    report(workdir, 'tlaplus', [path.join(workdir, 'outputs/tlaplus/verified/Spec.tla'), path.join(workdir, 'outputs/tlaplus/verified/Spec.cfg')]);
    assert.ok(checkFormalArtifacts(workdir).every(check => check.passed));
    fs.rmSync(workdir, { recursive: true, force: true });
  });

  it('rejects a hand-written tlaplus report with no real tool evidence (§P0-1)', () => {
    const workdir = setup();
    report(workdir, 'bdd', [path.join(workdir, 'outputs/bdd/verified/feature.feature')]);
    const tlaFiles = [path.join(workdir, 'outputs/tlaplus/verified/Spec.tla'), path.join(workdir, 'outputs/tlaplus/verified/Spec.cfg')];
    const hash = hashFiles(tlaFiles);
    // Forged report: passed:true, correct sourceHash, but no toolEvidence.
    writeValidationReport(path.join(workdir, 'outputs/tlaplus/validation', 'forged.json'), { artifactKind: 'tlaplus', lifecycle: 'verified', sourcePaths: tlaFiles, sourceHash: hash, irHash: hash, tools: [], startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:00:01.000Z', passed: true, checks: [] });
    assert.equal(checkFormalArtifacts(workdir).find(check => check.name === 'tlaplus verified artifacts')?.passed, false);
    fs.rmSync(workdir, { recursive: true, force: true });
  });

  it('rejects a stale successful report after verified content changes', () => {
    const workdir = setup();
    const feature = path.join(workdir, 'outputs/bdd/verified/feature.feature');
    report(workdir, 'bdd', [feature]);
    report(workdir, 'tlaplus', [path.join(workdir, 'outputs/tlaplus/verified/Spec.tla'), path.join(workdir, 'outputs/tlaplus/verified/Spec.cfg')]);
    fs.appendFileSync(feature, '\n# changed');
    assert.equal(checkFormalArtifacts(workdir).find(check => check.name === 'bdd verified artifacts')?.passed, false);
    fs.rmSync(workdir, { recursive: true, force: true });
  });
});
