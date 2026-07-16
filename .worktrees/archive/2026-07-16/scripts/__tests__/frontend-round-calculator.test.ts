import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateArchRounds } from '../lib/frontend/round-calculator.js';

describe('calculateArchRounds', () => {
  it('returns 3 for small SRS (< 50 shards)', () => {
    assert.strictEqual(calculateArchRounds(0, 0), 3);
    assert.strictEqual(calculateArchRounds(1, 0), 3);
    assert.strictEqual(calculateArchRounds(49, 0), 3);
  });

  it('returns 4 for medium SRS (50-99 shards)', () => {
    assert.strictEqual(calculateArchRounds(50, 0), 4);
    assert.strictEqual(calculateArchRounds(75, 0), 4);
    assert.strictEqual(calculateArchRounds(99, 0), 4);
  });

  it('returns 5 for large SRS (>= 100 shards)', () => {
    assert.strictEqual(calculateArchRounds(100, 0), 5);
    assert.strictEqual(calculateArchRounds(500, 0), 5);
  });

  it('adds 1 round for many cross-references', () => {
    assert.strictEqual(calculateArchRounds(10, 60), 4);
  });

  it('never exceeds 5', () => {
    assert.strictEqual(calculateArchRounds(999, 999), 5);
  });
});
