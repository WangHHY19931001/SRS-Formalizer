import { describe, it } from 'node:test';
import assert from 'node:assert';
import { NFR_KEYWORDS, detectNFRCategories, computeNFRWeight } from '../lib/frontend/nfr-keywords.js';

describe('NFR_KEYWORDS', () => {
  it('has all six categories', () => {
    const categories = Object.keys(NFR_KEYWORDS);
    assert.strictEqual(categories.length, 6);
    assert.ok(categories.includes('performance'));
    assert.ok(categories.includes('security'));
    assert.ok(categories.includes('availability'));
    assert.ok(categories.includes('compatibility'));
    assert.ok(categories.includes('maintainability'));
    assert.ok(categories.includes('compliance'));
  });

  it('each category has zh and en arrays', () => {
    for (const [cat, kw] of Object.entries(NFR_KEYWORDS)) {
      assert.ok(Array.isArray(kw.zh), `${cat} missing zh keywords`);
      assert.ok(Array.isArray(kw.en), `${cat} missing en keywords`);
      assert.ok(kw.zh.length > 0, `${cat} zh keywords empty`);
      assert.ok(kw.en.length > 0, `${cat} en keywords empty`);
    }
  });
});

describe('detectNFRCategories', () => {
  it('detects performance from Chinese text', () => {
    const result = detectNFRCategories('系统响应时间不得超过 200ms，并发用户数需支持 10000', 'zh');
    assert.ok(result.includes('performance'));
  });

  it('detects security from English text', () => {
    const result = detectNFRCategories('The system must encrypt all user data with AES-256', 'en');
    assert.ok(result.includes('security'));
  });

  it('returns empty array for no NFR match', () => {
    const result = detectNFRCategories('用户点击按钮后跳转到首页', 'zh');
    assert.strictEqual(result.length, 0);
  });

  it('detects multiple categories', () => {
    const result = detectNFRCategories('响应时间 ≤ 100ms 且需要加密传输', 'zh');
    assert.ok(result.includes('performance'));
    assert.ok(result.includes('security'));
  });

  it('handles empty string', () => {
    const result = detectNFRCategories('', 'zh');
    assert.strictEqual(result.length, 0);
  });
});

describe('computeNFRWeight', () => {
  it('returns 0 for no NFR keywords', () => {
    assert.strictEqual(computeNFRWeight('普通业务逻辑描述', 'zh'), 0);
  });

  it('returns > 0 for NFR text', () => {
    const weight = computeNFRWeight('响应时间不超过 200ms 且需要高可用 99.99%', 'zh');
    assert.ok(weight > 0);
  });

  it('returns higher weight for more NFR keywords', () => {
    const low = computeNFRWeight('响应时间不超过 200ms', 'zh');
    const high = computeNFRWeight('响应时间不超过 200ms 且需要高可用 99.99% 且加密传输', 'zh');
    assert.ok(high > low);
  });

  it('weight capped at 1.0', () => {
    const weight = computeNFRWeight('性能 安全 可用性 兼容性 可维护 合规'.repeat(10), 'zh');
    assert.ok(weight <= 1.0);
  });
});
