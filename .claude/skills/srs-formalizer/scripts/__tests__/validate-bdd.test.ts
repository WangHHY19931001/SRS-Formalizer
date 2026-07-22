import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TMP = path.join(os.tmpdir(), `srs-formalizer-validate-bdd-test-${Date.now()}`);

function createWorkDir(name: string): string {
  const workDir = path.join(TMP, name, '.srs_formalizer');
  fs.mkdirSync(path.join(workDir, 'outputs', 'bdd', 'verified'), { recursive: true });
  fs.writeFileSync(path.join(workDir, 'srs-ir.json'), '{}', 'utf-8');
  return workDir;
}

function writeFeature(workDir: string, fileName: string, content: string): void {
  fs.writeFileSync(path.join(workDir, 'outputs', 'bdd', 'verified', fileName), content, 'utf-8');
}

// A valid minimal feature file that passes BDD validation
const VALID_FEATURE = `# SYSTEM: TestSystem
# TRACE: R1-REQ-0001
Feature: Login
  Scenario: Successful login
    Given the user is on the login page
    When the user enters valid credentials
    Then the user is redirected to dashboard
`;

describe('validate-bdd command', () => {
  before(() => {
    fs.mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('validates a valid .feature file successfully', async () => {
    const workDir = createWorkDir('valid');
    writeFeature(workDir, 'login.feature', VALID_FEATURE);

    const { main } = await import('../commands/validate-bdd.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.valid, true);
    assert.equal(data.files_checked, 1);
    assert.ok(typeof data.report === 'string');
  });

  it('returns error when missing --workdir argument', async () => {
    const { main } = await import('../commands/validate-bdd.js');
    const result = await main([]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('Missing required argument'));
  });

  it('returns an error when verified features directory does not exist', async () => {
    const workDir = path.join(TMP, 'no-features', '.srs_formalizer');
    fs.mkdirSync(path.dirname(workDir), { recursive: true });

    const { main } = await import('../commands/validate-bdd.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'error');
  });

  it('returns ok when no verified feature files exist', async () => {
    const workDir = createWorkDir('empty-features');

    const { main } = await import('../commands/validate-bdd.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.valid, true);
    assert.equal(data.files_checked, 0);
  });

  it('rejects non-.srs_formalizer workdir', async () => {
    const badDir = path.join(TMP, 'bad_workdir');
    fs.mkdirSync(badDir, { recursive: true });

    const { main } = await import('../commands/validate-bdd.js');
    const result = await main(['--workdir', badDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('.srs_formalizer'));
  });
});
