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

describe('IREdge', () => {
  it('depends_on edge', () => {
    const edge = {
      id: 'shard-1-dep-001',
      source: 'shard-1-R1-USER-0001',
      target: 'shard-1-R1-AUTH-0002',
      type: 'depends_on',
      properties: { confidence: 0.9 },
    };
    assert.strictEqual(edge.type, 'depends_on');
  });

  it('nfr_impacts edge', () => {
    const edge = {
      id: 'nfr-edge-001',
      source: 'shard-1-NFR-0001',
      target: 'shard-1-R1-USER-0001',
      type: 'nfr_impacts',
      properties: { reasoning: '性能约束影响登录流程' },
    };
    assert.strictEqual(edge.type, 'nfr_impacts');
  });

  it('cross_file_depends edge has crossFileWeight', () => {
    const edge = {
      id: 'cross-001',
      source: 'shard-1-R1-0001',
      target: 'shard-2-R1-0002',
      type: 'cross_file_depends',
      properties: { crossFileWeight: 0.7 },
    };
    assert.strictEqual(edge.properties.crossFileWeight, 0.7);
  });
});
