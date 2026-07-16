import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { generateFeature, type BddFeature } from '../lib/bdd.js';

describe('lib/bdd.ts — Gherkin generator', () => {
  it('generateFeature produces valid Gherkin output format', () => {
    const feature: BddFeature = {
      system: 'OrderManagement',
      trace: 'SRS-2024',
      module: 'UserModule',
      scenarios: [
        {
          name: 'User login with valid credentials',
          requirementId: 'R1-REQ-0001',
          given: ['the user is on the login page'],
          when: ['the user enters valid credentials'],
          then: ['<THEN_PLACEHOLDER>'],
        },
      ],
    };

    const output = generateFeature(feature);

    assert.ok(output.includes('# SYSTEM: OrderManagement'));
    assert.ok(output.includes('# TRACE: SRS-2024'));
    assert.ok(output.includes('# TLA_REFS: PENDING'));
    assert.ok(output.includes('# LEAN_REFS: PENDING'));
    assert.ok(output.includes('Feature: UserModule'));
    assert.ok(output.includes('Scenario: User login with valid credentials'));
    assert.ok(output.includes('Given the user is on the login page'));
    assert.ok(output.includes('When the user enters valid credentials'));
    assert.ok(output.includes('Then <THEN_PLACEHOLDER>'));
  });

  it('generates verification_method comment when set', () => {
    const feature: BddFeature = {
      system: 'Test',
      trace: 'TRC-001',
      module: 'TestModule',
      scenarios: [
        {
          name: 'Test scenario',
          requirementId: 'R1-REQ-0002',
          given: ['precondition'],
          when: ['action'],
          then: ['expected result'],
          verification_method: 'api_check',
        },
      ],
    };

    const output = generateFeature(feature);
    assert.ok(output.includes('# verification_method: api_check'));
  });

  it('handles empty scenarios gracefully', () => {
    const feature: BddFeature = {
      system: 'Test',
      trace: 'TRC-002',
      module: 'EmptyModule',
      scenarios: [],
    };

    const output = generateFeature(feature);
    assert.ok(output.includes('Feature: EmptyModule'));
    assert.ok(output.includes('# SYSTEM: Test'));
  });

  it('generates multiple scenarios correctly', () => {
    const feature: BddFeature = {
      system: 'MultiSystem',
      trace: 'TRC-003',
      module: 'MultiModule',
      scenarios: [
        {
          name: 'First scenario',
          requirementId: 'R1-REQ-0003',
          given: ['given 1'],
          when: ['when 1'],
          then: ['then 1'],
        },
        {
          name: 'Second scenario',
          requirementId: 'R1-REQ-0004',
          given: ['given 2'],
          when: ['when 2'],
          then: ['then 2a', 'then 2b'],
          verification_method: 'log_check',
        },
      ],
    };

    const output = generateFeature(feature);
    assert.ok(output.includes('Scenario: First scenario'));
    assert.ok(output.includes('Scenario: Second scenario'));
    assert.ok(output.includes('Given given 1'));
    assert.ok(output.includes('Given given 2'));
    assert.ok(output.includes('Then then 2a'));
    assert.ok(output.includes('Then then 2b'));
    assert.ok(output.includes('# verification_method: log_check'));
  });
});
