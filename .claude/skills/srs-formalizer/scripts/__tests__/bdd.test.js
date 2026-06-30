import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { generateFeature, validateFeature, } from '../lib/bdd.js';
describe('lib/bdd.ts — Gherkin generator and validator', () => {
    // ---------------------------------------------------------------------------
    it('generateFeature produces valid Gherkin output format', () => {
        const feature = {
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
    // ---------------------------------------------------------------------------
    it('validateFeature returns valid=true for well-formed content', () => {
        const content = `# SYSTEM: Test
# TRACE: TRC-001
# TLA_REFS: PENDING
# LEAN_REFS: PENDING

Feature: Login

  Scenario: Successful login
    Given user is registered
    When user submits login form
    Then user is redirected to dashboard
`;
        const result = validateFeature(content);
        assert.equal(result.valid, true);
        assert.equal(result.errors.length, 0);
        assert.equal(result.warnings.length, 0);
    });
    // ---------------------------------------------------------------------------
    it('validateFeature returns invalid for incomplete content', () => {
        const missingFeature = 'Scenario: test\n  Given something\n  When something\n  Then something\n';
        const result1 = validateFeature(missingFeature);
        assert.equal(result1.valid, false);
        assert.ok(result1.errors.some(e => e.includes('Feature:')));
        const missingScenario = 'Feature: test\n  Given something\n  When something\n  Then something\n';
        const result2 = validateFeature(missingScenario);
        assert.equal(result2.valid, false);
        assert.ok(result2.errors.some(e => e.includes('Scenario:')));
        const missingGiven = 'Feature: test\n  Scenario: test\n  When something\n  Then something\n';
        const result3 = validateFeature(missingGiven);
        assert.equal(result3.valid, false);
        assert.ok(result3.errors.some(e => e.includes('Given')));
        const missingWhen = 'Feature: test\n  Scenario: test\n  Given something\n  Then something\n';
        const result4 = validateFeature(missingWhen);
        assert.equal(result4.valid, false);
        assert.ok(result4.errors.some(e => e.includes('When')));
        const missingThen = 'Feature: test\n  Scenario: test\n  Given something\n  When something\n';
        const result5 = validateFeature(missingThen);
        assert.equal(result5.valid, false);
        assert.ok(result5.errors.some(e => e.includes('Then')));
    });
    // ---------------------------------------------------------------------------
    it('validateFeature catches <THEN_PLACEHOLDER> as error', () => {
        const content = `Feature: Test
  Scenario: Test
    Given something
    When something
    Then <THEN_PLACEHOLDER>
`;
        const result = validateFeature(content);
        assert.equal(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('<THEN_PLACEHOLDER>')));
    });
    // ---------------------------------------------------------------------------
    it('validateFeature warns when SYSTEM or TRACE header is missing', () => {
        const content = `Feature: Test
  Scenario: Test
    Given something
    When something
    Then result
`;
        const result = validateFeature(content);
        assert.equal(result.valid, true);
        assert.ok(result.warnings.some(e => e.includes('# SYSTEM:')));
        assert.ok(result.warnings.some(e => e.includes('# TRACE:')));
    });
});
//# sourceMappingURL=bdd.test.js.map