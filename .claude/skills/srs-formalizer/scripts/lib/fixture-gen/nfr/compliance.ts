/**
 * Compliance NFR fixture generators.
 * Generators for pytest and junit frameworks.
 */

import type { Framework, GeneratorFn } from './types.js';
import { classify } from './types.js';

export const compliance: Partial<Record<Framework, GeneratorFn>> = {
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
};
