import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { validateShardIndex } from '../commands/validate-shard-index.js';

describe('validate-shard-index', () => {
  it('accepts valid ShardIndex v1.1', () => {
    const valid = {
      version: '1.1',
      source_path: '/tmp/x.md',
      source_hash: 'abc123',
      language: 'zh',
      total_chars: 1000,
      total_shards: 1,
      shards: [{
        id: 'S001',
        file: '/tmp/x.md',
        locator: '/tmp/x.md-1-10-F1',
        source_path: '/tmp/x.md',
        source_start_line: 1,
        source_end_line: 10,
        module: 'M1',
        chapter_ref: '§1',
        char_count: 500,
        estimated_tokens: 333,
      }],
      gaps: [],
      warnings: [],
    };
    const r = validateShardIndex(valid);
    assert.strictEqual(r.valid, true, JSON.stringify(r.errors));
  });

  it('rejects camelCase field names (totalShards vs total_shards)', () => {
    const invalid = {
      version: '1.1',
      totalShards: 1,
      shards: [],
    };
    const r = validateShardIndex(invalid);
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => e.field === 'total_shards'));
  });

  it('rejects shard id not matching ^S\\d{3}$', () => {
    const invalid = {
      version: '1.1',
      source_path: '/tmp/x.md',
      source_hash: 'abc',
      language: 'zh',
      total_chars: 100,
      total_shards: 1,
      shards: [{ id: 'S1', file: 'x', locator: 'x-1-10-F1', source_path: 'x', source_start_line: 1, source_end_line: 10, module: 'M', chapter_ref: '§1', char_count: 100, estimated_tokens: 67 }],
      gaps: [], warnings: [],
    };
    const r = validateShardIndex(invalid);
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => e.field === 'shards[0].id'));
  });

  it('rejects total_shards != shards.length', () => {
    const invalid = {
      version: '1.1',
      source_path: '/tmp/x.md', source_hash: 'abc', language: 'zh',
      total_chars: 100, total_shards: 3,
      shards: [{ id: 'S001', file: 'x', locator: 'x-1-10-F1', source_path: 'x', source_start_line: 1, source_end_line: 10, module: 'M', chapter_ref: '§1', char_count: 100, estimated_tokens: 67 }],
      gaps: [], warnings: [],
    };
    const r = validateShardIndex(invalid);
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => e.field === 'total_shards'));
  });

  it('rejects source_start_line > source_end_line', () => {
    const invalid = {
      version: '1.1', source_path: '/tmp/x.md', source_hash: 'abc', language: 'zh',
      total_chars: 100, total_shards: 1,
      shards: [{ id: 'S001', file: 'x', locator: 'x-1-10-F1', source_path: 'x', source_start_line: 20, source_end_line: 10, module: 'M', chapter_ref: '§1', char_count: 100, estimated_tokens: 67 }],
      gaps: [], warnings: [],
    };
    const r = validateShardIndex(invalid);
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => e.field === 'shards[0].source_start_line'));
  });

  it('rejects invalid version', () => {
    const invalid = {
      version: '2.0',
      source_path: '/tmp/x.md', source_hash: 'abc', language: 'zh',
      total_chars: 100, total_shards: 0, shards: [],
      gaps: [], warnings: [],
    };
    const r = validateShardIndex(invalid);
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => e.field === 'version'));
  });
});
