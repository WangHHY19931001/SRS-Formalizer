import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { generateBddFixtures, generateFixtures, parseFeature } from '../../lib/fixture-gen/bdd.js';
import type { Framework } from '../../lib/fixture-gen/types.js';

const SAMPLE_FEATURE = `# SYSTEM: SRS
# TRACE: PENDING
Feature: 用户模块

  Scenario: R1-REQ-0001: 用户登录
    Given the user <user_id> exists
    When the user submits credentials with <password>
    Then the system grants access

  Scenario: R1-REQ-0002: 用户注册
    Given the user <email> is not registered
    When the user submits registration form
    Then the account is created
`;

describe('parseFeature', () => {
  it('extracts scenarios with params', () => {
    const scenarios = parseFeature(SAMPLE_FEATURE);
    assert.equal(scenarios.length, 2);
    assert.equal(scenarios[0]?.requirementId, 'R1-REQ-0001');
    assert.deepEqual(scenarios[0]?.params, ['user_id', 'password']);
    assert.equal(scenarios[1]?.requirementId, 'R1-REQ-0002');
    assert.deepEqual(scenarios[1]?.params, ['email']);
  });

  it('returns empty array for feature with no scenarios', () => {
    const scenarios = parseFeature('Feature: Empty\n');
    assert.equal(scenarios.length, 0);
  });
});

describe('generateBddFixtures', () => {
  it('generates cucumber step definitions', () => {
    const files = generateBddFixtures(SAMPLE_FEATURE, '用户模块', 'cucumber');
    assert.ok(files.length > 0);
    const stepsFile = files.find(f => f.path.includes('steps'));
    assert.ok(stepsFile, 'Should have steps file');
    assert.ok(stepsFile!.content.includes("Given('the user"));
    assert.ok(stepsFile!.content.includes('LLM_FILL'));
  });

  it('generates playwright spec', () => {
    const files = generateBddFixtures(SAMPLE_FEATURE, '用户模块', 'playwright');
    const specFile = files.find(f => f.path.includes('.spec.'));
    assert.ok(specFile, 'Should have spec file');
    assert.ok(specFile!.content.includes('test('));
  });

  it('generates pytest test file', () => {
    const files = generateBddFixtures(SAMPLE_FEATURE, '用户模块', 'pytest');
    const testFile = files.find(f => f.path.includes('test_'));
    assert.ok(testFile, 'Should have test file');
    assert.ok(testFile!.content.includes('def test_'));
    assert.ok(testFile!.content.includes('LLM_FILL'));
  });

  it('generates junit test class', () => {
    const files = generateBddFixtures(SAMPLE_FEATURE, '用户模块', 'junit');
    const testFile = files.find(f => f.path.includes('Test.java'));
    assert.ok(testFile, 'Should have Test.java');
    assert.ok(testFile!.content.includes('@Test'));
  });

  it('generates fast-check properties', () => {
    const files = generateBddFixtures(SAMPLE_FEATURE, '用户模块', 'fast-check');
    const propFile = files.find(f => f.path.includes('.property.'));
    assert.ok(propFile, 'Should have property file');
    assert.ok(propFile!.content.includes('fc.'));
  });

  it('throws on unknown framework', () => {
    assert.throws(
      () => generateBddFixtures(SAMPLE_FEATURE, 'mod', 'unknown' as Framework),
      /Unknown framework/,
    );
  });
});

describe('generateFixtures (routing)', () => {
  it('routes playwright to page object generator', () => {
    const scenarios = parseFeature(SAMPLE_FEATURE);
    const files = generateFixtures(scenarios, 'playwright');
    const pageFile = files.find(f => f.path.includes('page.ts'));
    assert.ok(pageFile, 'Should generate page.ts via page object');
    assert.ok(pageFile!.content.includes('export class'));
  });
});
