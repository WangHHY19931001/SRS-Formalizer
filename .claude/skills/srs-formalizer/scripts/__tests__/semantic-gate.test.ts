import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TMP = path.join(os.tmpdir(), `srs-formalizer-semantic-gate-test-${Date.now()}`);

function createWorkDir(name: string): string {
  const workDir = path.join(TMP, name, '.srs_formalizer');
  fs.mkdirSync(path.join(workDir, 'outputs', 'bdd', 'draft'), { recursive: true });
  fs.mkdirSync(path.join(workDir, 'outputs', 'semantic-reports'), { recursive: true });
  return workDir;
}

describe('semantic-gate command', () => {
  before(() => fs.mkdirSync(TMP, { recursive: true }));
  after(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it('generates scoring template for BDD draft', async () => {
    const workDir = createWorkDir('template-gen');
    fs.writeFileSync(path.join(workDir, 'outputs', 'bdd', 'draft', 'auth.feature'),
      'Feature: Auth\n  Scenario: Login\n    Given user\n    When login\n    Then success\n', 'utf-8');

    const { main } = await import('../commands/semantic-gate.js');
    const result = await main(['--workdir', workDir, '--kind', 'bdd', '--generate-template']);
    assert.strictEqual(result.status, 'ok');
    const data = result.data as { templatePath: string } | undefined;
    assert.ok(data?.templatePath, 'should return template path');
    assert.ok(fs.existsSync(data.templatePath), 'template file should exist');
  });

  it('passes when APPROVED report exists', async () => {
    const workDir = createWorkDir('approved');
    fs.writeFileSync(path.join(workDir, 'outputs', 'bdd', 'draft', 'auth.feature'),
      'Feature: Auth\n', 'utf-8');
    const reportPath = path.join(workDir, 'outputs', 'semantic-reports', 'bdd-auth.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      artifactKind: 'bdd',
      artifactPath: 'outputs/bdd/draft/auth.feature',
      verdict: 'APPROVED',
      score: 8,
      issues: [],
      reviewedAt: new Date().toISOString(),
    }), 'utf-8');

    const { main } = await import('../commands/semantic-gate.js');
    const result = await main(['--workdir', workDir, '--kind', 'bdd']);
    assert.strictEqual(result.status, 'ok');
  });

  it('fails when REJECTED report exists', async () => {
    const workDir = createWorkDir('rejected');
    fs.writeFileSync(path.join(workDir, 'outputs', 'bdd', 'draft', 'auth.feature'),
      'Feature: Auth\n', 'utf-8');
    const reportPath = path.join(workDir, 'outputs', 'semantic-reports', 'bdd-auth.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      artifactKind: 'bdd',
      artifactPath: 'outputs/bdd/draft/auth.feature',
      verdict: 'REJECTED',
      score: 3,
      issues: ['Then clause restates requirement instead of observable assertion'],
      reviewedAt: new Date().toISOString(),
    }), 'utf-8');

    const { main } = await import('../commands/semantic-gate.js');
    const result = await main(['--workdir', workDir, '--kind', 'bdd']);
    assert.strictEqual(result.status, 'error');
    assert.ok(result.message?.includes('REJECTED'));
  });

  it('fails when no report exists (semantic gate not run)', async () => {
    const workDir = createWorkDir('no-report');
    fs.writeFileSync(path.join(workDir, 'outputs', 'bdd', 'draft', 'auth.feature'),
      'Feature: Auth\n', 'utf-8');

    const { main } = await import('../commands/semantic-gate.js');
    const result = await main(['--workdir', workDir, '--kind', 'bdd']);
    assert.strictEqual(result.status, 'error');
    assert.ok(result.message?.includes('no semantic report'));
  });
});
