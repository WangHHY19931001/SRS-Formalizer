import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { computeCoverage } from '../lib/fixture-gen/coverage.js';

const TMP = path.join(os.tmpdir(), `srs-coverage-test-${Date.now()}`);

describe('computeCoverage', () => {
  it('returns zero coverage when no fixtures exist', () => {
    const workDir = path.join(TMP, 'empty');
    fs.mkdirSync(path.join(workDir, '4_bdd', 'features'), { recursive: true });
    fs.mkdirSync(workDir, { recursive: true });

    const report = computeCoverage(workDir);
    assert.equal(report.total_requirements, 0);
    assert.equal(report.coverage_pct, 100);
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
