import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { hashFiles, hashText } from '../lib/artifacts/validation-report.js';
import { ARTIFACT_PATHS, artifactPath } from '../lib/artifacts/paths.js';
import { checkReportAuthenticity, checkReportArtifactRatio, checkAntiPatterns } from '../lib/verify-gate/checks-final.js';

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

  // ===========================================================================
  // P0: Fake-report detection (irHash / startedAt=completedAt / 1:1 ratio)
  // ===========================================================================

  it('flags report with startedAt === completedAt (0ms fake report)', () => {
    const workDir = createWorkDir('fake-zero-ms');
    const verifiedDir = artifactPath(workDir, ARTIFACT_PATHS.bddVerified);
    const validationDir = artifactPath(workDir, ARTIFACT_PATHS.bddValidation);
    fs.mkdirSync(verifiedDir, { recursive: true });
    fs.mkdirSync(validationDir, { recursive: true });
    fs.writeFileSync(path.join(verifiedDir, 'Login.feature'), 'Feature: Login\n', 'utf-8');
    const sameTime = '2026-07-22T10:00:00.000Z';
    const report = {
      artifactKind: 'bdd', lifecycle: 'verified', passed: true,
      sourcePaths: [path.join(verifiedDir, 'Login.feature')],
      sourceHash: hashFiles([path.join(verifiedDir, 'Login.feature')]),
      irHash: '0'.repeat(64),
      tools: [], startedAt: sameTime, completedAt: sameTime,
      checks: [{ name: 'BDD structure', passed: true }],
    };
    fs.writeFileSync(path.join(validationDir, `${report.sourceHash}.json`), JSON.stringify(report), 'utf-8');
    const result = checkReportAuthenticity(workDir, 'bdd');
    assert.strictEqual(result.passed, false, `expected 0ms report to fail, got: ${result.detail}`);
    assert.ok(result.detail?.includes('0ms'), `detail should mention 0ms: ${result.detail}`);
  });

  it('flags report with irHash not matching current srs-ir.json (stale artifact)', () => {
    const workDir = createWorkDir('fake-stale-ir');
    const verifiedDir = artifactPath(workDir, ARTIFACT_PATHS.bddVerified);
    const validationDir = artifactPath(workDir, ARTIFACT_PATHS.bddValidation);
    fs.mkdirSync(verifiedDir, { recursive: true });
    fs.mkdirSync(validationDir, { recursive: true });
    fs.writeFileSync(path.join(verifiedDir, 'Login.feature'), 'Feature: Login\n', 'utf-8');
    const irContent = JSON.stringify({ version: '2.1.0', nodes: [], edges: [] });
    fs.writeFileSync(path.join(workDir, 'srs-ir.json'), irContent, 'utf-8');
    const report = {
      artifactKind: 'bdd', lifecycle: 'verified', passed: true,
      sourcePaths: [path.join(verifiedDir, 'Login.feature')],
      sourceHash: hashFiles([path.join(verifiedDir, 'Login.feature')]),
      irHash: 'deadbeef'.repeat(8), // wrong irHash
      tools: [],
      startedAt: '2026-07-22T10:00:00.000Z', completedAt: '2026-07-22T10:00:05.000Z',
      checks: [{ name: 'BDD structure', passed: true }],
    };
    fs.writeFileSync(path.join(validationDir, `${report.sourceHash}.json`), JSON.stringify(report), 'utf-8');
    const result = checkReportAuthenticity(workDir, 'bdd');
    assert.strictEqual(result.passed, false, `expected stale-ir report to fail, got: ${result.detail}`);
    assert.ok(result.detail?.includes('irHash'), `detail should mention irHash mismatch: ${result.detail}`);
  });

  it('passes when irHash matches current srs-ir.json', () => {
    const workDir = createWorkDir('authentic-ir');
    const verifiedDir = artifactPath(workDir, ARTIFACT_PATHS.bddVerified);
    const validationDir = artifactPath(workDir, ARTIFACT_PATHS.bddValidation);
    fs.mkdirSync(verifiedDir, { recursive: true });
    fs.mkdirSync(validationDir, { recursive: true });
    fs.writeFileSync(path.join(verifiedDir, 'Login.feature'), 'Feature: Login\n', 'utf-8');
    const irContent = JSON.stringify({ version: '2.1.0', nodes: [], edges: [] });
    fs.writeFileSync(path.join(workDir, 'srs-ir.json'), irContent, 'utf-8');
    const realIrHash = hashText(irContent);
    const artifactHash = hashFiles([path.join(verifiedDir, 'Login.feature')]);
    const report = {
      artifactKind: 'bdd', lifecycle: 'verified', passed: true,
      sourcePaths: [path.join(verifiedDir, 'Login.feature')],
      sourceHash: artifactHash, irHash: realIrHash,
      tools: [],
      startedAt: '2026-07-22T10:00:00.000Z', completedAt: '2026-07-22T10:00:05.000Z',
      checks: [{ name: 'BDD structure', passed: true }],
    };
    fs.writeFileSync(path.join(validationDir, `${artifactHash}.json`), JSON.stringify(report), 'utf-8');
    const result = checkReportAuthenticity(workDir, 'bdd');
    assert.strictEqual(result.passed, true, `expected authentic report to pass, got: ${result.detail}`);
  });

  it('flags verified artifacts with no matching validation report (1:1 ratio)', () => {
    const workDir = createWorkDir('missing-report');
    const verifiedDir = artifactPath(workDir, ARTIFACT_PATHS.bddVerified);
    const validationDir = artifactPath(workDir, ARTIFACT_PATHS.bddValidation);
    fs.mkdirSync(verifiedDir, { recursive: true });
    fs.mkdirSync(validationDir, { recursive: true });
    fs.writeFileSync(path.join(verifiedDir, 'Login.feature'), 'Feature: Login\n', 'utf-8');
    const irContent = JSON.stringify({ version: '2.1.0', nodes: [], edges: [] });
    fs.writeFileSync(path.join(workDir, 'srs-ir.json'), irContent, 'utf-8');
    const result = checkReportArtifactRatio(workDir, 'bdd');
    assert.strictEqual(result.passed, false, `expected missing-report to fail, got: ${result.detail}`);
    assert.ok(result.detail?.includes('report'), `detail should mention missing report: ${result.detail}`);
  });

  // ===========================================================================
  // P0: Anti-pattern detection
  // ===========================================================================

  it('flags manual .cfg file in tlaplus/draft (bypassing validate-tla)', () => {
    const workDir = createWorkDir('manual-cfg');
    const draftDir = artifactPath(workDir, ARTIFACT_PATHS.tlaDraft);
    fs.mkdirSync(draftDir, { recursive: true });
    fs.writeFileSync(path.join(draftDir, 'Module.cfg'), 'INIT Init\n', 'utf-8');
    fs.writeFileSync(path.join(draftDir, 'Module.tla'), '---- MODULE Module ----\n====\n', 'utf-8');
    const result = checkAntiPatterns(workDir);
    assert.strictEqual(result.passed, false, `expected manual .cfg to fail, got: ${result.detail}`);
    assert.ok(result.detail?.includes('cfg'), `detail should mention .cfg: ${result.detail}`);
  });

  it('flags /tmp script in workdir (bypassing path safety)', () => {
    const workDir = createWorkDir('tmp-script');
    fs.mkdirSync(path.join(workDir, 'tmp'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'tmp', 'hack.sh'), '#!/bin/bash\necho hacked\n', 'utf-8');
    const result = checkAntiPatterns(workDir);
    assert.strictEqual(result.passed, false, `expected /tmp script to fail, got: ${result.detail}`);
    assert.ok(result.detail?.includes('tmp'), `detail should mention tmp: ${result.detail}`);
  });

  it('flags CHECKLIST all-checked but referenced file missing', () => {
    const workDir = createWorkDir('checklist-file-missing');
    fs.mkdirSync(path.join(workDir, '6_outputs'), { recursive: true });
    fs.writeFileSync(path.join(workDir, '6_outputs', 'CHECKLIST.md'),
      '# S6\n- [x] `outputs/graphs/srs-graph.cypher` exists\n', 'utf-8');
    // Note: outputs/graphs/srs-graph.cypher does NOT exist
    const result = checkAntiPatterns(workDir);
    assert.strictEqual(result.passed, false, `expected missing file to fail, got: ${result.detail}`);
    assert.ok(result.detail?.includes('cypher') || result.detail?.includes('CHECKLIST'),
      `detail should mention the missing file or checklist: ${result.detail}`);
  });

  it('passes when no anti-patterns detected', () => {
    const workDir = createWorkDir('clean-workdir');
    fs.mkdirSync(path.join(workDir, '6_outputs'), { recursive: true });
    fs.writeFileSync(path.join(workDir, '6_outputs', 'CHECKLIST.md'),
      '# S6\n- [ ] pending\n', 'utf-8');
    const result = checkAntiPatterns(workDir);
    assert.strictEqual(result.passed, true, `expected clean workdir to pass, got: ${result.detail}`);
  });
});
