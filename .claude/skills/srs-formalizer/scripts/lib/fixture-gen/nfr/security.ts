/**
 * Security NFR fixture generators.
 * Generators for pytest, junit, and fast-check frameworks.
 */

import type { Framework, GeneratorFn } from './types.js';
import { classify } from './types.js';

export const security: Partial<Record<Framework, GeneratorFn>> = {
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
};
