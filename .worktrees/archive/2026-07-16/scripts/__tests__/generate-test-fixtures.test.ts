import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TMP = path.join(os.tmpdir(), `srs-gtf-test-${Date.now()}`);

function setupWorkDir(name: string): string {
  const workDir = path.join(TMP, name, '.srs_formalizer');
  fs.mkdirSync(workDir, { recursive: true });
  return workDir;
}

function setupBddFeatures(workDir: string): void {
  const featDir = path.join(workDir, '4_bdd', 'features');
  fs.mkdirSync(featDir, { recursive: true });
  fs.writeFileSync(
    path.join(featDir, 'auth.feature'),
    `Feature: auth\n\n  Scenario: R1-REQ-0001: login\n    Given user\n    When login\n    Then ok\n`
  );
}

function setupTlaSpecs(workDir: string): void {
  const tlaDir = path.join(workDir, '5_formal', 'specs');
  fs.mkdirSync(tlaDir, { recursive: true });
  fs.writeFileSync(
    path.join(tlaDir, 'Counter.tla'),
    `---- MODULE Counter ----\nVARIABLES count\nCONSTANTS MaxVal\nInit == count = 0\nNext == count' = count + 1\n====`
  );
}

function setupLeanProofs(workDir: string): void {
  const leanDir = path.join(workDir, '5_formal', 'proofs');
  fs.mkdirSync(leanDir, { recursive: true });
  fs.writeFileSync(
    path.join(leanDir, 'Basic.lean'),
    `import Nat\n\ntheorem add_zero (n : Nat) : n + 0 = n := by\n  rw [Nat.add_zero]\n`
  );
}

describe('generate-test-fixtures CLI', () => {
  before(() => {
    fs.mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('generates cucumber fixtures for acceptance level from BDD sources', async () => {
    const workDir = setupWorkDir('acceptance-cucumber');
    setupBddFeatures(workDir);

    const { main } = await import('../commands/generate-test-fixtures.js');
    const result = await main(['--workdir', workDir, '--level', 'acceptance', '--framework', 'cucumber']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.ok((data.files_created as number) > 0);

    const fixtureDir = path.join(workDir, 'test_fixtures', 'acceptance', 'cucumber');
    assert.ok(fs.existsSync(fixtureDir));
    const files = fs.readdirSync(fixtureDir);
    assert.ok(files.length > 0);
  });

  it('generates pytest fixtures for integration level from TLA+ sources', async () => {
    const workDir = setupWorkDir('integration-pytest');
    setupTlaSpecs(workDir);

    const { main } = await import('../commands/generate-test-fixtures.js');
    const result = await main(['--workdir', workDir, '--level', 'integration', '--framework', 'pytest']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.ok((data.files_created as number) > 0);

    const fixtureDir = path.join(workDir, 'test_fixtures', 'integration', 'pytest');
    assert.ok(fs.existsSync(fixtureDir));
  });

  it('generates fast-check fixtures for property level from Lean sources', async () => {
    const workDir = setupWorkDir('property-fastcheck');
    setupLeanProofs(workDir);

    const { main } = await import('../commands/generate-test-fixtures.js');
    const result = await main(['--workdir', workDir, '--level', 'property', '--framework', 'fast-check']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.ok((data.files_created as number) > 0);

    const fixtureDir = path.join(workDir, 'test_fixtures', 'property', 'fast-check');
    assert.ok(fs.existsSync(fixtureDir));
  });

  it('returns error when missing --level', async () => {
    const workDir = setupWorkDir('no-level');

    const { main } = await import('../commands/generate-test-fixtures.js');
    const result = await main(['--workdir', workDir, '--framework', 'cucumber']);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('--level'));
  });

  it('returns error when missing --framework', async () => {
    const workDir = setupWorkDir('no-framework');

    const { main } = await import('../commands/generate-test-fixtures.js');
    const result = await main(['--workdir', workDir, '--level', 'acceptance']);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('--framework'));
  });

  it('returns error when no args provided', async () => {
    const { main } = await import('../commands/generate-test-fixtures.js');
    const result = await main([]);

    assert.equal(result.status, 'error');
  });

  it('rejects invalid framework', async () => {
    const workDir = setupWorkDir('bad-framework');

    const { main } = await import('../commands/generate-test-fixtures.js');
    const result = await main(['--workdir', workDir, '--level', 'acceptance', '--framework', 'vitest']);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('framework'));
  });

  it('rejects invalid level', async () => {
    const workDir = setupWorkDir('bad-level');

    const { main } = await import('../commands/generate-test-fixtures.js');
    const result = await main(['--workdir', workDir, '--level', 'smoke', '--framework', 'cucumber']);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('level'));
  });

  it('rejects non-.srs_formalizer workdir', async () => {
    const badDir = path.join(TMP, 'bad_workdir');
    fs.mkdirSync(badDir, { recursive: true });

    const { main } = await import('../commands/generate-test-fixtures.js');
    const result = await main(['--workdir', badDir, '--level', 'acceptance', '--framework', 'cucumber']);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('.srs_formalizer'));
  });

  it('rejects framework incompatible with source', async () => {
    const workDir = setupWorkDir('incompatible');
    setupTlaSpecs(workDir);

    const { main } = await import('../commands/generate-test-fixtures.js');
    const result = await main(['--workdir', workDir, '--level', 'integration', '--framework', 'cucumber']);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('cucumber'));
  });
});
