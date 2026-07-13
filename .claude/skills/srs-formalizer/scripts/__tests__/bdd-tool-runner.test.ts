import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runGherkinLint, runGherklin } from '../lib/bdd-tool-runner.js';

const TMP = path.join(os.tmpdir(), `srs-formalizer-bdd-tool-runner-test-${Date.now()}`);

describe('lib/bdd-tool-runner.ts — gherkin-lint (Phase 3)', () => {
  let featuresDir: string;

  before(() => {
    featuresDir = path.join(TMP, 'lint-test', '4_bdd', 'features');
    fs.mkdirSync(featuresDir, { recursive: true });
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('returns passed when no feature files exist', () => {
    const emptyDir = path.join(TMP, 'lint-empty', 'features');
    fs.mkdirSync(emptyDir, { recursive: true });
    const result = runGherkinLint(emptyDir);
    assert.equal(result.tool, 'gherkin-lint');
    assert.equal(result.passed, true);
  });

  it('returns error for non-existent directory', () => {
    const result = runGherkinLint('/nonexistent/path');
    assert.equal(result.passed, false);
    assert.ok(result.output.includes('not found'));
  });

  it('runs gherkin-lint on valid feature files', () => {
    const validFeature = `Feature: Login
  Scenario: Successful login
    Given the user is on the login page
    When the user enters valid credentials
    Then the user is redirected to the dashboard
`;
    fs.writeFileSync(path.join(featuresDir, 'login.feature'), validFeature, 'utf-8');

    const result = runGherkinLint(featuresDir);
    assert.equal(result.tool, 'gherkin-lint');
    assert.equal(result.passed, true);
  });
});

describe('lib/bdd-tool-runner.ts — Gherklin (Phase 4)', () => {
  let featuresDir: string;

  before(() => {
    featuresDir = path.join(TMP, 'gherklin-test', '4_bdd', 'features');
    fs.mkdirSync(featuresDir, { recursive: true });
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('returns error for non-existent directory', async () => {
    const result = await runGherklin('/nonexistent/path');
    assert.equal(result.passed, false);
    assert.ok(result.output.includes('not found'));
  });

  it('runs Gherklin on valid feature files', async () => {
    const validFeature = `Feature: Login
  Scenario: Successful login
    Given the user is on the login page
    When the user enters valid credentials
    Then the user is redirected to the dashboard
`;
    fs.writeFileSync(path.join(featuresDir, 'login.feature'), validFeature, 'utf-8');

    const result = await runGherklin(featuresDir);
    assert.equal(result.tool, 'gherklin');
    assert.equal(result.passed, true);
  });

  it('runs Gherklin on empty features directory', async () => {
    const emptyDir = path.join(TMP, 'gherklin-empty', 'features');
    fs.mkdirSync(emptyDir, { recursive: true });
    const result = await runGherklin(emptyDir);
    assert.equal(result.tool, 'gherklin');
    assert.equal(result.passed, true);
  });
});
