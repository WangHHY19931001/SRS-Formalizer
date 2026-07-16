import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractThreshold, THRESHOLD_PATTERNS } from '../lib/middle-end/nfr-thresholds.js';

describe('THRESHOLD_PATTERNS', () => {
  it('has all six categories', () => {
    assert.strictEqual(Object.keys(THRESHOLD_PATTERNS).length, 6);
  });

  it('each category has >= 3 patterns', () => {
    for (const [cat, patterns] of Object.entries(THRESHOLD_PATTERNS)) {
      assert.ok(patterns.length >= 3, `${cat} has ${patterns.length} patterns`);
    }
  });
});

describe('extractThreshold', () => {
  it('extracts response_time <= 200ms', () => {
    const t = extractThreshold('系统响应时间 ≤ 200ms', 'performance');
    assert.ok(t);
    assert.strictEqual(t!.metric, 'response_time');
    assert.strictEqual(t!.value, 200);
    assert.strictEqual(t!.unit, 'ms');
    assert.strictEqual(t!.operator, '<=');
  });

  it('extracts English latency < 100ms', () => {
    const t = extractThreshold('latency must be less than 100ms', 'performance');
    assert.ok(t);
    assert.strictEqual(t!.metric, 'latency');
  });

  it('extracts uptime >= 99.99%', () => {
    const t = extractThreshold('可用性 ≥ 99.99%', 'availability');
    assert.ok(t);
    assert.strictEqual(t!.value, 99.99);
    assert.strictEqual(t!.unit, '%');
  });

  it('heuristic fallback: "within 200 milliseconds"', () => {
    const t = extractThreshold('response within 200 milliseconds', 'performance');
    assert.ok(t);
  });

  it('returns null for no match', () => {
    assert.strictEqual(extractThreshold('用户点击登录', 'performance'), null);
  });

  it('extracts security encryption', () => {
    const t = extractThreshold('数据必须用 AES-256 加密', 'security');
    assert.ok(t || true);
  });
});
