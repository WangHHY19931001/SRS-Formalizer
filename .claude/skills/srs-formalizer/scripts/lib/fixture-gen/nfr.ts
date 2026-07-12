/**
 * NFR (Non-Functional Requirement) fixture generator.
 * Detects NFR type from keywords and generates appropriate test fixtures.
 * Zero dependencies.
 */

export type NfrType = 'performance' | 'security' | 'reliability' | 'usability';

const NFR_KEYWORDS: Record<NfrType, string[]> = {
  performance: ['respond within', 'latency', 'throughput', 'response time', 'fast', 'quick'],
  security: ['prevent', 'unauthorized', 'encrypt', 'authentication', 'authorization', 'secure'],
  reliability: ['uptime', 'availability', 'fault', 'recovery', 'redundancy', 'reliable'],
  usability: ['easy to use', 'intuitive', 'user-friendly', 'accessible', 'usability'],
};

/**
 * Detect NFR type from requirement text.
 * Returns null if no NFR type detected.
 */
export function detectNfrType(text: string): NfrType | null {
  const lower = text.toLowerCase();
  for (const [type, keywords] of Object.entries(NFR_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return type as NfrType;
    }
  }
  return null;
}

/**
 * Generate NFR test fixtures for the detected type.
 * Returns a string containing test code.
 */
export function generateNfrFixtures(nfrType: NfrType, moduleName: string): string {
  if (nfrType === 'performance') {
    return generatePerformanceFixtures(moduleName);
  } else if (nfrType === 'security') {
    return generateSecurityFixtures(moduleName);
  } else if (nfrType === 'reliability') {
    return generateReliabilityFixtures(moduleName);
  } else {
    return generateUsabilityFixtures(moduleName);
  }
}

function generatePerformanceFixtures(moduleName: string): string {
  return `"""${moduleName} performance tests — NFR fixtures"""
import pytest
import time

@pytest.mark.performance
def test_response_time():
    """Verify response time < threshold."""
    # LLM_FILL: define SUT and threshold
    start = time.time()
    # result = sut.operation()
    elapsed = time.time() - start
    assert elapsed < 1.0  # LLM_FILL: adjust threshold
`;
}

function generateSecurityFixtures(moduleName: string): string {
  const capitalized = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
  return `"""${moduleName} security tests — NFR fixtures"""
import pytest

class Test${capitalized}Security:
    """Security test cases for ${moduleName}."""

    def test_rejects_sql_injection(self):
        """Verify SQL injection prevention."""
        # LLM_FILL: test SQL injection prevention
        pass

    def test_rejects_xss_payload(self):
        """Verify XSS prevention."""
        # LLM_FILL: test XSS prevention
        pass
`;
}

function generateReliabilityFixtures(moduleName: string): string {
  return `"""${moduleName} reliability tests — NFR fixtures"""
import pytest

@pytest.mark.reliability
def test_handles_failure_gracefully():
    """Verify system handles failures gracefully."""
    # LLM_FILL: test failure handling
    pass

@pytest.mark.reliability
def test_recovers_after_error():
    """Verify system recovers after error."""
    # LLM_FILL: test recovery
    pass
`;
}

function generateUsabilityFixtures(moduleName: string): string {
  return `"""${moduleName} usability tests — NFR fixtures"""
import pytest

@pytest.mark.usability
def test_ui_intuitive():
    """Verify UI is intuitive."""
    # LLM_FILL: test UI intuitiveness
    pass

@pytest.mark.usability
def test_accessible():
    """Verify accessibility compliance."""
    # LLM_FILL: test accessibility
    pass
`;
}
