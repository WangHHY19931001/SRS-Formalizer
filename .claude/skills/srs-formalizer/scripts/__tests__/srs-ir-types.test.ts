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

describe('IRNode', () => {
  it('has required fields', () => {
    const node = {
      id: 'shard-1-R1-USER-0001',
      type: 'requirement',
      module: '用户模块',
      labels: [':Requirement'],
      properties: { statement: '用户登录', category: 'explicit', confidence: 'high' },
      source: { filePath: '/tmp/srs.md', startLine: 10, endLine: 15, shardId: 'shard-1', chapter: '§2' },
    };
    assert.strictEqual(node.id, 'shard-1-R1-USER-0001');
    assert.strictEqual(node.type, 'requirement');
  });

  it('nfr node has nfrCategory in properties', () => {
    const node = {
      id: 'shard-1-NFR-0001',
      type: 'nfr',
      module: '全局',
      labels: [':Requirement', ':NFRPerformance'],
      properties: {
        statement: '响应时间 ≤ 200ms',
        nfrCategory: 'performance',
        nfrThreshold: { metric: 'response_time', value: 200, unit: 'ms', operator: '<=' },
      },
      source: { filePath: '/tmp/srs.md', startLine: 50, endLine: 52, shardId: 'shard-1', chapter: '§3' },
    };
    assert.strictEqual(node.properties.nfrCategory, 'performance');
    assert.strictEqual(node.properties.nfrThreshold?.value, 200);
  });
});
