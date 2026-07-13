import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { generateNfrFixtures, supportsFramework, supportedFrameworks } from '../../lib/fixture-gen/nfr.js';

describe('generateNfrFixtures', () => {
  it('generates performance pytest fixtures', () => {
    const result = generateNfrFixtures('performance', 'pytest', 'login');
    assert.ok(result.includes('LLM_FILL'));
    assert.ok(result.includes('performance'));
    assert.ok(result.includes('login'));
  });

  it('generates performance junit fixtures', () => {
    const result = generateNfrFixtures('performance', 'junit', 'login');
    assert.ok(result.includes('LLM_FILL'));
    assert.ok(result.includes('performance'));
  });

  it('generates security pytest fixtures', () => {
    const result = generateNfrFixtures('security', 'pytest', 'auth');
    assert.ok(result.includes('LLM_FILL'));
    assert.ok(result.includes('Security'));
  });

  it('generates availability pytest fixtures', () => {
    const result = generateNfrFixtures('availability', 'pytest', 'api');
    assert.ok(result.includes('LLM_FILL'));
    assert.ok(result.includes('Availability'));
  });

  it('generates compatibility cucumber fixtures', () => {
    const result = generateNfrFixtures('compatibility', 'cucumber', 'ui');
    assert.ok(result.includes('Feature:'));
    assert.ok(result.includes('Scenario:'));
  });

  it('generates maintainability pytest fixtures', () => {
    const result = generateNfrFixtures('maintainability', 'pytest', 'core');
    assert.ok(result.includes('LLM_FILL'));
    assert.ok(result.includes('Maintainability'));
  });

  it('generates compliance pytest fixtures', () => {
    const result = generateNfrFixtures('compliance', 'pytest', 'data');
    assert.ok(result.includes('LLM_FILL'));
    assert.ok(result.includes('Compliance'));
  });

  it('generates fast-check fixtures for performance', () => {
    const result = generateNfrFixtures('performance', 'fast-check', 'login');
    assert.ok(result.includes('fast-check'));
    assert.ok(result.includes('LLM_FILL'));
  });

  it('throws for unsupported category × framework combo', () => {
    assert.throws(() => generateNfrFixtures('compatibility', 'pytest', 'mod'));
  });
});

describe('supportsFramework', () => {
  it('returns true for supported combos', () => {
    assert.ok(supportsFramework('performance', 'pytest'));
    assert.ok(supportsFramework('performance', 'junit'));
    assert.ok(supportsFramework('security', 'pytest'));
    assert.ok(supportsFramework('availability', 'fast-check'));
  });

  it('returns false for unsupported combos', () => {
    assert.equal(supportsFramework('compatibility', 'pytest'), false);
    assert.equal(supportsFramework('maintainability', 'fast-check'), false);
  });
});

describe('supportedFrameworks', () => {
  it('returns array of framework names for a category', () => {
    const fws = supportedFrameworks('performance');
    assert.ok(Array.isArray(fws));
    assert.ok(fws.includes('pytest'));
    assert.ok(fws.includes('junit'));
    assert.ok(fws.includes('fast-check'));
  });

  it('returns correct frameworks for compatibility', () => {
    const fws = supportedFrameworks('compatibility');
    assert.ok(fws.includes('cucumber'));
    assert.ok(fws.includes('playwright'));
  });
});
