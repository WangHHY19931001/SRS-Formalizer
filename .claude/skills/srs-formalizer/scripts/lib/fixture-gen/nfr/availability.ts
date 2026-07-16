/**
 * Availability NFR fixture generators.
 * Generators for pytest, junit, and fast-check frameworks.
 */

import type { Framework, GeneratorFn } from './types.js';
import { classify } from './types.js';

export const availability: Partial<Record<Framework, GeneratorFn>> = {
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
};
