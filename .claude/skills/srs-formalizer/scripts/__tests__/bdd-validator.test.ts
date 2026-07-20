import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  validateFeatureBasic,
  validateFeatureNFR,
  validateFeatureSemantics,
} from '../lib/bdd-validator.js';

describe('lib/bdd-validator.ts — Phase 1: Basic structural validation', () => {
  it('returns valid for well-formed content', () => {
    const content = `# SYSTEM: Test
# TRACE: TRC-001
Feature: Login
  Scenario: Successful login
    Given user is registered
    When user submits login form
    Then user is redirected to dashboard
`;
    const result = validateFeatureBasic(content);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('detects missing Feature declaration', () => {
    const result = validateFeatureBasic('Scenario: test\n  Given a\n  When b\n  Then c\n');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Feature:')));
  });

  it('detects missing Scenario declaration', () => {
    const result = validateFeatureBasic('Feature: test\n  Given a\n  When b\n  Then c\n');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Scenario:')));
  });

  it('detects missing Given step', () => {
    const result = validateFeatureBasic('Feature: test\n  Scenario: test\n  When b\n  Then c\n');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Given')));
  });

  it('detects missing When step', () => {
    const result = validateFeatureBasic('Feature: test\n  Scenario: test\n  Given a\n  Then c\n');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('When')));
  });

  it('detects missing Then step', () => {
    const result = validateFeatureBasic('Feature: test\n  Scenario: test\n  Given a\n  When b\n');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Then')));
  });

  it('warns when SYSTEM or TRACE header is missing', () => {
    const content = `Feature: Test
  Scenario: Test
    Given something
    When something
    Then result
`;
    const result = validateFeatureBasic(content);
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some(w => w.includes('# SYSTEM:')));
    assert.ok(result.warnings.some(w => w.includes('# TRACE:')));
  });

  it('detects unresolved Mustache placeholders', () => {
    const content = `Feature: Test
  Scenario: {{module}} login
    Given user is on login page
    When user submits credentials
    Then user is authenticated
`;
    const result = validateFeatureBasic(content);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Mustache placeholder')));
  });

  it('detects LLM_FILL residuals', () => {
    const content = `Feature: Test
  Scenario: <THEN_PLACEHOLDER>
    Given something
    When something
    Then result
`;
    const result = validateFeatureBasic(content, true);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('LLM_FILL residual')));
  });

  it('detects TODO residuals', () => {
    const content = `Feature: Test
  Scenario: <TODO>
    Given something
    When something
    Then result
`;
    const result = validateFeatureBasic(content, true);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('LLM_FILL residual')));
  });
});

describe('lib/bdd-validator.ts — Phase 2: NFR validation', () => {
  it('detects unresolved <THEN_PLACEHOLDER> in NFR features', () => {
    const content = `Feature: NFR Performance - API Gateway
  Scenario: API Gateway response time
    Given system load is normal
    When user executes API Gateway operation
    Then <THEN_PLACEHOLDER>
`;
    const result = validateFeatureNFR(content, 'nfr_performance_api_gateway.feature');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('<THEN_PLACEHOLDER>')));
  });

  it('detects Mustache placeholders in NFR features', () => {
    const content = `Feature: NFR Performance - {{module}}
  Scenario: test
    Given load is normal
    When operation is executed
    Then response time is 200 ms
`;
    const result = validateFeatureNFR(content, 'nfr_performance.feature');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Mustache')));
  });

  it('warns when security scenario lacks auth precondition', () => {
    const content = `Feature: NFR Security - AuthService
  Scenario: Unauthorized access denied
    Given system is running
    When unauthorized user accesses resource
    Then access is denied
`;
    const result = validateFeatureNFR(content, 'nfr_security_auth.feature');
    assert.ok(result.warnings.some(w => w.includes('authentication precondition')));
  });

  it('accepts security scenario with auth precondition', () => {
    const content = `Feature: NFR Security - AuthService
  Scenario: Authenticated access
    Given the user is authenticated
    When user accesses protected resource
    Then access is granted
`;
    const result = validateFeatureNFR(content, 'nfr_security_auth.feature');
    assert.equal(result.valid, true);
    const authWarnings = result.warnings.filter(w => w.includes('authentication precondition'));
    assert.equal(authWarnings.length, 0);
  });

  it('warns about non-snake_case filenames', () => {
    const content = `Feature: Test
  Scenario: Test
    Given a
    When b
    Then c
`;
    const result = validateFeatureNFR(content, 'My Feature File.feature');
    assert.ok(result.warnings.some(w => w.includes('naming convention')));
  });

  it('accepts proper snake_case filenames', () => {
    const content = `Feature: Test
  Scenario: Test
    Given a
    When b
    Then c
`;
    const result = validateFeatureNFR(content, 'nfr_performance_api_gateway.feature');
    const nameWarnings = result.warnings.filter(w => w.includes('naming convention'));
    assert.equal(nameWarnings.length, 0);
  });

  it('warns when NFR feature lacks threshold value pattern', () => {
    const content = `Feature: Test
  Scenario: Test
    Given a
    When b
    Then c
`;
    const result = validateFeatureNFR(content, 'nfr_test.feature');
    assert.ok(result.warnings.some(w => w.includes('threshold value pattern')));
  });

  it('recognizes threshold value pattern in NFR features', () => {
    const content = `Feature: NFR Performance
  Scenario: Response time
    Given load is normal
    When operation is executed
    Then response time should < 200 ms
`;
    const result = validateFeatureNFR(content, 'nfr_performance.feature');
    const thresholdWarnings = result.warnings.filter(w => w.includes('threshold value pattern'));
    assert.equal(thresholdWarnings.length, 0);
  });
});

describe('lib/bdd-validator.ts — semantic heuristics (proposal §1.3)', () => {
  it('flags generic "processes the requirement" When as an error (B-2)', () => {
    const content = `Feature: Governance System
  Scenario: functional requirement 1
    Given the Governance System subsystem is initialized and operational
    When the system processes the requirement
    Then the audit log records the outcome
`;
    const result = validateFeatureSemantics(content, 'governance_system.feature');
    assert.ok(result.errors.some(e => e.includes('Generic placeholder When step')));
  });

  it('warns when a Then step restates a directive requirement instead of asserting outcome (B-1)', () => {
    const content = `Feature: Report
  Scenario: quality check
    Given input is provided
    When the user submits the report
    Then 系统必须使用确定性验证与开放性质量评判共同确认结果质量
`;
    const result = validateFeatureSemantics(content, 'report.feature');
    assert.ok(result.warnings.some(w => w.includes('restates the requirement')));
  });

  it('requires a negative-boundary scenario in constraint domains (B-3)', () => {
    const content = `Feature: Approval Governance
  Scenario: approval granted
    Given an action is waiting on approval
    When an approver grants approval
    Then the action executes
`;
    const result = validateFeatureSemantics(content, 'governance_approval.feature');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('negative-boundary scenario')));
  });

  it('accepts a constraint domain that includes a negative-boundary assertion', () => {
    const content = `Feature: Approval Governance
  Scenario: hold execution while approval is unresolved
    Given an action is waiting on approval
    When no approval outcome has yet been provided
    Then execution remains held for that approval-controlled action
    And the system does not behave as though unresolved approval were implicit consent
`;
    const result = validateFeatureSemantics(content, 'governance_approval.feature');
    assert.equal(result.valid, true);
  });

  it('does not require negative constraints for non-constraint domains', () => {
    const content = `Feature: Product Listing
  Scenario: list products
    Given the catalog contains items
    When the user opens the listing page
    Then the page shows 20 items per page
`;
    const result = validateFeatureSemantics(content, 'product_listing.feature');
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });
});
