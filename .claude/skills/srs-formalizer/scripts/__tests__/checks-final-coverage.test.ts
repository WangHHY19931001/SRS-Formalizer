import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { hashFiles } from '../lib/artifacts/validation-report.js';

const TMP = path.join(os.tmpdir(), `srs-formalizer-coverage-test-${Date.now()}`);

function createWorkDir(name: string): string {
  const workDir = path.join(TMP, name, '.srs_formalizer');
  const dirs = [
    'outputs/tlaplus/verified', 'outputs/tlaplus/validation',
    'outputs/bdd/verified', 'outputs/bdd/validation',
    'outputs/lean4/verified', 'outputs/lean4/validation',
  ];
  for (const d of dirs) fs.mkdirSync(path.join(workDir, d), { recursive: true });
  return workDir;
}

function writeIr(workDir: string, arch1Subsystems: string[]): void {
  const nodes = arch1Subsystems.map((name, i) => ({
    id: `ARCH-${name.toUpperCase()}-${String(i + 1).padStart(4, '0')}`,
    kind: 'architecture',
    statement: name,
    source: { filePath: 'srs.md', shardId: 'S001', locator: 'srs.md:1-10' },
    metadata: { archLevel: 1, archName: name },
  }));
  fs.writeFileSync(path.join(workDir, 'srs-ir.json'), JSON.stringify({
    version: '2.1.0', nodes, edges: [], crossRefs: [],
    nfrProfile: { detectedCategories: [] },
    gaps: [], glossary: {}, meta: { buildTimestamp: new Date().toISOString() },
  }), 'utf-8');
}

function writeTlaModule(workDir: string, moduleName: string): void {
  const verifiedDir = path.join(workDir, 'outputs', 'tlaplus', 'verified');
  const validationDir = path.join(workDir, 'outputs', 'tlaplus', 'validation');
  fs.writeFileSync(path.join(verifiedDir, `${moduleName}.tla`), `---- MODULE ${moduleName} ----\n----\n`, 'utf-8');
  fs.writeFileSync(path.join(verifiedDir, `${moduleName}.cfg`), 'SPECIFICATION Spec\n', 'utf-8');
  const files = [path.join(verifiedDir, `${moduleName}.tla`), path.join(verifiedDir, `${moduleName}.cfg`)];
  const sourceHash = hashFiles(files);
  fs.writeFileSync(path.join(validationDir, `${sourceHash}.json`), JSON.stringify({
    artifactKind: 'tlaplus', lifecycle: 'verified', sourcePaths: files, sourceHash,
    irHash: sourceHash, tools: [{ name: 'tla2tools', version: '1.7.4' }],
    startedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
    passed: true, checks: [{ name: 'SANY', passed: true }, { name: 'TLC', passed: true }],
    toolEvidence: [{ tool: 'tla2tools', exitCode: 0, stdoutHash: sourceHash }],
  }), 'utf-8');
}

describe('TLA+ coverage and arch-1 coverage gates', () => {
  before(() => fs.mkdirSync(TMP, { recursive: true }));
  after(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it('checkTlaCoverage passes when all arch-1 subsystems have TLA+ modules', async () => {
    const workDir = createWorkDir('tla-coverage-pass');
    writeIr(workDir, ['AuthService', 'PaymentService']);
    writeTlaModule(workDir, 'AuthService');
    writeTlaModule(workDir, 'PaymentService');

    const { checkTlaCoverage } = await import('../lib/verify-gate/checks-final.js');
    const result = checkTlaCoverage(workDir);
    assert.ok(result.passed, `expected pass, got: ${result.detail}`);
  });

  it('checkTlaCoverage fails when an arch-1 subsystem is missing TLA+ module', async () => {
    const workDir = createWorkDir('tla-coverage-fail');
    writeIr(workDir, ['AuthService', 'PaymentService']);
    writeTlaModule(workDir, 'AuthService');
    // PaymentService missing

    const { checkTlaCoverage } = await import('../lib/verify-gate/checks-final.js');
    const result = checkTlaCoverage(workDir);
    assert.ok(!result.passed, 'expected fail for missing PaymentService');
    assert.ok(result.detail?.includes('PaymentService'), `detail should name missing module: ${result.detail}`);
  });

  it('checkTlaCoverage passes when no arch-1 subsystems exist (empty IR)', async () => {
    const workDir = createWorkDir('tla-coverage-empty');
    writeIr(workDir, []);

    const { checkTlaCoverage } = await import('../lib/verify-gate/checks-final.js');
    const result = checkTlaCoverage(workDir);
    assert.ok(result.passed, 'empty arch-1 should pass (nothing to cover)');
  });

  it('checkArch1Coverage passes when all arch-1 subsystems have BDD features', async () => {
    const workDir = createWorkDir('arch1-coverage-pass');
    writeIr(workDir, ['AuthService']);
    const bddVerified = path.join(workDir, 'outputs', 'bdd', 'verified');
    fs.writeFileSync(path.join(bddVerified, 'AuthService.feature'), 'Feature: Auth\n', 'utf-8');

    const { checkArch1Coverage } = await import('../lib/verify-gate/checks-final.js');
    const result = checkArch1Coverage(workDir);
    assert.ok(result.passed, `expected pass, got: ${result.detail}`);
  });

  it('checkArch1Coverage fails when arch-1 subsystems exist but no verified artifacts at all', async () => {
    const workDir = createWorkDir('arch1-coverage-fail');
    writeIr(workDir, ['AuthService', 'PaymentService']);
    // No verified artifacts at all

    const { checkArch1Coverage } = await import('../lib/verify-gate/checks-final.js');
    const result = checkArch1Coverage(workDir);
    assert.ok(!result.passed, 'expected fail when no artifacts for arch-1 subsystems');
  });
});
