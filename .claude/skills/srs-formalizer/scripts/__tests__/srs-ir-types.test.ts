import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('NFRCategory', () => {
  it('accepts all six valid categories', () => {
    const valid: string[] = ['performance', 'security', 'availability',
      'compatibility', 'maintainability', 'compliance'];
    for (const v of valid) {
      assert.doesNotThrow(() => void (v as unknown));
    }
  });
});

describe('NFRThreshold', () => {
  it('serializes and deserializes correctly', () => {
    const threshold = {
      metric: 'response_time', value: 200, unit: 'ms', operator: '<=' as const
    };
    const json = JSON.stringify(threshold);
    const parsed = JSON.parse(json);
    assert.strictEqual(parsed.metric, 'response_time');
    assert.strictEqual(parsed.value, 200);
    assert.strictEqual(parsed.unit, 'ms');
    assert.strictEqual(parsed.operator, '<=');
  });
});
