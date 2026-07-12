import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { detectNfrType, generateNfrFixtures } from '../../lib/fixture-gen/nfr.js';

describe('detectNfrType', () => {
  it('detects performance keywords', () => {
    const result = detectNfrType('The system shall respond within 2 seconds');
    assert.equal(result, 'performance');
  });

  it('detects security keywords', () => {
    const result = detectNfrType('The system shall prevent unauthorized access');
    assert.equal(result, 'security');
  });

  it('detects reliability keywords', () => {
    const result = detectNfrType('The system shall maintain 99.9% uptime');
    assert.equal(result, 'reliability');
  });

  it('returns null for unknown NFR type', () => {
    const result = detectNfrType('The user can login');
    assert.equal(result, null);
  });
});

describe('generateNfrFixtures', () => {
  it('generates performance test fixtures', () => {
    const result = generateNfrFixtures('performance', 'test');
    assert.ok(result.includes('pytest.mark.performance') || result.includes('performance'));
  });

  it('generates security test fixtures', () => {
    const result = generateNfrFixtures('security', 'test');
    assert.ok(result.includes('SecurityTest') || result.includes('security'));
  });

  it('generates reliability test fixtures', () => {
    const result = generateNfrFixtures('reliability', 'test');
    assert.ok(result.includes('reliability') || result.includes('ReliabilityTest'));
  });
});
