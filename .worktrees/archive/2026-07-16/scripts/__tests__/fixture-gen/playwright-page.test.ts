import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  parseScenario,
  generateFixtures,
} from '../../lib/fixture-gen/bdd.js';

const PAGE_OBJECT_SCENARIO = `
Feature: User Management
  Scenario: Login with valid credentials
    Given the user is on the login page
    When the user enters valid credentials
    Then the user should be redirected to the dashboard
`;

describe('Playwright Page Object generation', () => {
  it('generates page object class', () => {
    const scenarios = parseScenario(PAGE_OBJECT_SCENARIO);
    const fixtures = generateFixtures(scenarios, 'playwright');
    const pageContent = fixtures.find(f => f.path.includes('page.ts'));
    assert.ok(pageContent, 'Should generate page.ts file');
    assert.ok(pageContent!.content.includes('export class'));
    assert.ok(pageContent!.content.includes('navigate'));
    assert.ok(pageContent!.content.includes('getState'));
  });

  it('extracts page object name from feature', () => {
    const scenarios = parseScenario(PAGE_OBJECT_SCENARIO);
    const fixtures = generateFixtures(scenarios, 'playwright');
    const pageContent = fixtures.find(f => f.path.includes('page.ts'));
    assert.ok(pageContent!.content.includes('UserManagementPage'));
  });

  it('generates spec with page object import', () => {
    const scenarios = parseScenario(PAGE_OBJECT_SCENARIO);
    const fixtures = generateFixtures(scenarios, 'playwright');
    const specContent = fixtures.find(f => f.path.includes('spec.ts'));
    assert.ok(specContent!.content.includes('import'));
    assert.ok(specContent!.content.includes('UserManagementPage'));
  });
});
