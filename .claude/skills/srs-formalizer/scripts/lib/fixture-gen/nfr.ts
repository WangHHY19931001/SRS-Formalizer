/**
 * NFR (Non-Functional Requirement) fixture generator.
 * Six NFR categories aligned with types/srs-ir.ts NFRCategory.
 * Registry pattern: NFR_GENERATORS maps category × framework → generator fn.
 * All generated code includes LLM_FILL markers for semantic content.
 * Zero runtime dependencies.
 */

import type { NFRCategory } from '../../types/srs-ir.js';

type Framework = 'pytest' | 'junit' | 'cucumber' | 'playwright' | 'fast-check';

type GeneratorFn = (moduleName: string) => string;

const NFR_GENERATORS: Partial<Record<NFRCategory, Partial<Record<Framework, GeneratorFn>>>> = {
  performance: {
    pytest: (m) => `"""${m} performance tests — NFR fixtures"""
import pytest
import time

@pytest.mark.performance
class Test${classify(m)}Performance:
    """Performance test cases for ${m}."""

    def test_response_time(self):
        """Verify response time < threshold."""
        # LLM_FILL: define SUT and threshold
        start = time.time()
        # result = sut.operation()
        elapsed = time.time() - start
        assert elapsed < 1.0  # LLM_FILL: adjust threshold

    def test_throughput(self):
        """Verify throughput meets requirement."""
        # LLM_FILL: measure throughput
        pass

    def test_latency_p95(self):
        """Verify p95 latency under load."""
        # LLM_FILL: measure p95 latency
        pass
`,
    junit: (m) => `// ${m} performance tests — NFR fixtures
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;

@Tag("performance")
class ${classify(m)}PerformanceTest {

    @Test
    @DisplayName("Response time is within threshold")
    void responseTimeWithinThreshold() {
        // LLM_FILL: define SUT and threshold
        long start = System.currentTimeMillis();
        // result = sut.operation();
        long elapsed = System.currentTimeMillis() - start;
        assertTrue(elapsed < 1000, "LLM_FILL: adjust threshold");
    }

    @Test
    @DisplayName("Throughput meets requirement")
    void throughputMeetsRequirement() {
        // LLM_FILL: measure throughput
    }
}
`,
    'fast-check': (m) => `// ${m} performance tests — NFR fixtures
import fc from 'fast-check';

describe('${m} performance', () => {
  test('response time under load', async () => {
    // LLM_FILL: define SUT and operation
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 1000 }), async (load) => {
        // LLM_FILL: measure response time under load
        const start = performance.now();
        // await sut.operation(load);
        const elapsed = performance.now() - start;
        return elapsed < 1000; // LLM_FILL: adjust threshold
      })
    );
  });
});
`,
  },

  security: {
    pytest: (m) => `"""${m} security tests — NFR fixtures"""
import pytest

@pytest.mark.security
class Test${classify(m)}Security:
    """Security test cases for ${m}."""

    def test_rejects_sql_injection(self):
        """Verify SQL injection prevention."""
        # LLM_FILL: craft SQL injection payload and assert rejection
        payload = "'; DROP TABLE users; --"
        # response = sut.process_input(payload)
        # assert response.status_code == 400

    def test_rejects_xss_payload(self):
        """Verify XSS prevention."""
        # LLM_FILL: craft XSS payload and assert sanitization
        payload = "<script>alert('xss')</script>"
        # response = sut.render(payload)
        # assert "<script>" not in response

    def test_prevents_unauthorized_access(self):
        """Verify authorization enforcement."""
        # LLM_FILL: attempt unauthorized access, assert 403
        pass

    def test_encrypts_sensitive_data(self):
        """Verify encryption of sensitive data at rest."""
        # LLM_FILL: verify encryption on stored data
        pass
`,
    junit: (m) => `// ${m} security tests — NFR fixtures
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;

@Tag("security")
class ${classify(m)}SecurityTest {

    @Test
    @DisplayName("Rejects SQL injection")
    void rejectsSqlInjection() {
        // LLM_FILL: craft SQL injection payload and assert rejection
    }

    @Test
    @DisplayName("Rejects XSS payload")
    void rejectsXssPayload() {
        // LLM_FILL: craft XSS payload and assert sanitization
    }

    @Test
    @DisplayName("Prevents unauthorized access")
    void preventsUnauthorizedAccess() {
        // LLM_FILL: attempt unauthorized access, assert 403
    }
}
`,
    'fast-check': (m) => `// ${m} security tests — NFR fixtures
import fc from 'fast-check';

describe('${m} security', () => {
  test('rejects malicious input', async () => {
    // LLM_FILL: define malicious input generator
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1 }), async (input) => {
        // LLM_FILL: verify no SQL injection or XSS succeeds
        return true;
      })
    );
  });
});
`,
  },

  availability: {
    pytest: (m) => `"""${m} availability tests — NFR fixtures"""
import pytest
import time

@pytest.mark.availability
class Test${classify(m)}Availability:
    """Availability test cases for ${m}."""

    def test_health_check_responds(self):
        """Verify health endpoint responds."""
        # LLM_FILL: check health endpoint
        pass

    def test_recovery_after_failure(self):
        """Verify system recovers after simulated failure."""
        # LLM_FILL: simulate failure, wait, verify recovery
        pass

    def test_no_data_loss_on_restart(self):
        """Verify data persistence across restarts."""
        # LLM_FILL: write data, restart, read data
        pass

    def test_handles_dependency_outage(self):
        """Verify graceful degradation when dependency is down."""
        # LLM_FILL: bring down dependency, verify system degrades gracefully
        pass
`,
    junit: (m) => `// ${m} availability tests — NFR fixtures
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;

@Tag("availability")
class ${classify(m)}AvailabilityTest {

    @Test
    @DisplayName("Health check responds")
    void healthCheckResponds() {
        // LLM_FILL: check health endpoint
    }

    @Test
    @DisplayName("Recovers after failure")
    void recoversAfterFailure() {
        // LLM_FILL: simulate failure, wait, verify recovery
    }
}
`,
    'fast-check': (m) => `// ${m} availability tests — NFR fixtures
import fc from 'fast-check';

describe('${m} availability', () => {
  test('system recovers from failures', async () => {
    // LLM_FILL: define failure scenarios
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 100 }), async (failures) => {
        // LLM_FILL: inject failures and verify recovery
        return true;
      })
    );
  });
});
`,
  },

  compatibility: {
    cucumber: (m) => `Feature: ${m} compatibility
  As a user of ${m}
  I want cross-platform compatibility
  So that the system works across all target environments

  Scenario: Renders correctly on Chrome
    Given the user is on Chrome browser
    When the ${m} page loads
    Then all elements are visible and functional

  Scenario: Renders correctly on Firefox
    Given the user is on Firefox browser
    When the ${m} page loads
    Then all elements are visible and functional

  Scenario: Renders correctly on Safari
    Given the user is on Safari browser
    When the ${m} page loads
    Then all elements are visible and functional

  Scenario: Renders correctly on mobile
    Given the user is on a mobile device
    When the ${m} page loads
    Then the layout is responsive and functional
`,
    playwright: (m) => `// ${m} compatibility tests — NFR fixtures
import { test, expect } from '@playwright/test';

test.describe('${m} cross-browser compatibility', () => {
  // LLM_FILL: define target browsers and viewports

  test('renders correctly across browsers', async ({ browser }) => {
    // LLM_FILL: iterate browsers and verify rendering
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    await page.goto('/${m}');
    await expect(page.locator('body')).toBeVisible();
    await context.close();
  });

  test('responsive layout on mobile', async ({ browser }) => {
    // LLM_FILL: verify mobile layout
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const page = await context.newPage();
    await page.goto('/${m}');
    await expect(page.locator('body')).toBeVisible();
    await context.close();
  });
});
`,
  },

  maintainability: {
    pytest: (m) => `"""${m} maintainability tests — NFR fixtures"""
import pytest
import ast
import os

@pytest.mark.maintainability
class Test${classify(m)}Maintainability:
    """Maintainability test cases for ${m}."""

    def test_code_complexity_within_bounds(self):
        """Verify cyclomatic complexity is within acceptable limits."""
        # LLM_FILL: run complexity analysis
        pass

    def test_no_circular_dependencies(self):
        """Verify no circular imports in module."""
        # LLM_FILL: check for circular dependencies
        pass

    def test_documentation_coverage(self):
        """Verify public API has documentation."""
        # LLM_FILL: check docstring coverage
        pass

    def test_type_hints_present(self):
        """Verify type hints are used in public API."""
        # LLM_FILL: check type hint coverage
        pass
`,
    junit: (m) => `// ${m} maintainability tests — NFR fixtures
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;

@Tag("maintainability")
class ${classify(m)}MaintainabilityTest {

    @Test
    @DisplayName("Cyclomatic complexity is within bounds")
    void complexityWithinBounds() {
        // LLM_FILL: run complexity analysis
    }

    @Test
    @DisplayName("No circular dependencies")
    void noCircularDependencies() {
        // LLM_FILL: check for circular dependencies
    }
}
`,
  },

  compliance: {
    pytest: (m) => `"""${m} compliance tests — NFR fixtures"""
import pytest
import json
import re

@pytest.mark.compliance
class Test${classify(m)}Compliance:
    """Compliance test cases for ${m}."""

    def test_gdpr_data_retention(self):
        """Verify GDPR data retention policy is enforced."""
        # LLM_FILL: verify data is purged after retention period
        pass

    def test_pii_masking_in_logs(self):
        """Verify PII is masked in log output."""
        # LLM_FILL: check logs for unmasked PII
        pass

    def test_audit_trail_complete(self):
        """Verify all data access is logged in audit trail."""
        # LLM_FILL: verify audit log contains required fields
        pass

    def test_user_consent_recorded(self):
        """Verify user consent is recorded before data collection."""
        # LLM_FILL: verify consent mechanism
        pass
`,
    junit: (m) => `// ${m} compliance tests — NFR fixtures
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;

@Tag("compliance")
class ${classify(m)}ComplianceTest {

    @Test
    @DisplayName("GDPR data retention enforced")
    void gdprDataRetentionEnforced() {
        // LLM_FILL: verify data is purged after retention period
    }

    @Test
    @DisplayName("PII masked in logs")
    void piiMaskedInLogs() {
        // LLM_FILL: check logs for unmasked PII
    }
}
`,
  },
};

function classify(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1).replace(/[^\w]/g, '');
}

/**
 * Generate NFR test fixtures for a given category × framework combination.
 * Throws if no generator is registered for the combination.
 */
export function generateNfrFixtures(
  category: NFRCategory,
  framework: Framework,
  moduleName: string,
): string {
  const gen = NFR_GENERATORS[category]?.[framework];
  if (!gen) {
    throw new Error(`No NFR generator for category=${category}, framework=${framework}`);
  }
  return gen(moduleName);
}

/**
 * Check whether a given category × framework combination has a registered generator.
 */
export function supportsFramework(category: NFRCategory, framework: Framework): boolean {
  return !!(NFR_GENERATORS[category]?.[framework]);
}

/** List all frameworks that support a given NFR category */
export function supportedFrameworks(category: NFRCategory): Framework[] {
  return (Object.keys(NFR_GENERATORS[category] ?? {}) as Framework[]);
}
