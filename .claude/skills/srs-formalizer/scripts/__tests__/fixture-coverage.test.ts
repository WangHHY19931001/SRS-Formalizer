import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { computeCoverage } from '../lib/fixture-gen/coverage.js';

const TMP = path.join(os.tmpdir(), `srs-coverage-test-${Date.now()}`);

describe('computeCoverage', () => {
  after(() => { fs.rmSync(TMP, { recursive: true, force: true }); });
  it('returns zero coverage when no fixtures exist', () => {
    const workDir = path.join(TMP, 'empty');
    fs.mkdirSync(path.join(workDir, '4_bdd', 'features'), { recursive: true });
    fs.mkdirSync(workDir, { recursive: true });

    const report = computeCoverage(workDir);
    assert.equal(report.total_requirements, 0);
    assert.equal(report.coverage_pct, 0);
  });

  it('counts BDD fixtures correctly', () => {
    const workDir = path.join(TMP, 'bdd');
    const featDir = path.join(workDir, '4_bdd', 'features');
    const fixDir = path.join(workDir, 'test_fixtures', 'acceptance', 'cucumber');
    fs.mkdirSync(featDir, { recursive: true });
    fs.mkdirSync(fixDir, { recursive: true });

    fs.writeFileSync(path.join(featDir, 'mod.feature'), `Feature: mod\n\n  Scenario: R1-REQ-0001: test\n    Given x\n    When y\n    Then z\n\n  Scenario: R1-REQ-0002: test2\n    Given x\n    When y\n    Then z\n`);

    fs.writeFileSync(path.join(fixDir, 'mod_steps.ts'), 'steps');

    const report = computeCoverage(workDir);
    assert.equal(report.total_requirements, 2);
    assert.ok(report.bdd_fixtures_generated > 0);
  });
});

describe('fixture-coverage CLI', () => {
  before(() => {
    fs.mkdirSync(path.join(TMP, '.srs_formalizer'), { recursive: true });
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('returns coverage report for empty workdir', async () => {
    const workDir = path.join(TMP, '.srs_formalizer');
    const { main } = await import('../commands/fixture-coverage.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.total_requirements, 0);
    assert.equal(data.coverage_pct, 0);
  });

  it('rejects non-srs-formalizer workdir', async () => {
    const otherDir = path.join(TMP, 'other');
    fs.mkdirSync(otherDir, { recursive: true });

    const { main } = await import('../commands/fixture-coverage.js');
    const result = await main(['--workdir', otherDir]);

    assert.equal(result.status, 'error');
  });
});
