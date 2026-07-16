/**
 * Performance NFR fixture generators.
 * Generators for pytest, junit, and fast-check frameworks.
 */

import type { Framework, GeneratorFn } from './types.js';
import { classify } from './types.js';

export const performance: Partial<Record<Framework, GeneratorFn>> = {
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
};
