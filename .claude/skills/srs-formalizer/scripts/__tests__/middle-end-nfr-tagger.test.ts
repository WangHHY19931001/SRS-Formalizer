import { describe, it } from 'node:test';
import assert from 'node:assert';
import { tagNFR } from '../lib/middle-end/nfr-tagger.js';
import type { SRSIR } from '../types/srs-ir.js';

function makeIR(): SRSIR {
  return {
    version: '2.0.0',
    meta: { sourcePath: '/t', sourceHash: '', language: 'zh', totalChars: 0, totalShards: 1, totalNodes: 3, totalEdges: 0, buildTimestamp: new Date().toISOString() },
    nodes: [
      { id: 'R1-01', type: 'requirement', module: 'm1', labels: [':Requirement'], properties: { statement: '系统响应时间 ≤ 200ms，并发 ≥ 10000' }, source: { filePath: '/t', startLine: 1, endLine: 1, shardId: 's1', chapter: '§2' } },
      { id: 'R1-02', type: 'requirement', module: 'm1', labels: [':Requirement'], properties: { statement: '用户点击登录按钮' }, source: { filePath: '/t', startLine: 2, endLine: 2, shardId: 's1', chapter: '§2' } },
      { id: 'R1-03', type: 'requirement', module: 'm2', labels: [':Requirement'], properties: { statement: '所有数据传输需加密，采用 AES-256' }, source: { filePath: '/t', startLine: 3, endLine: 3, shardId: 's2', chapter: '§3' } },
    ],
    edges: [],
    crossRefs: [],
    nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: ['performance','security','availability','compatibility','maintainability','compliance'] },
    gaps: [],
    glossary: [],
  };
}

describe('tagNFR', () => {
  it('tags performance node', () => {
    const ir = makeIR();
    const result = tagNFR(ir);
    const perfNode = result.ir.nodes.find(n => n.id === 'R1-01');
    assert.ok(perfNode);
    assert.strictEqual(perfNode!.type, 'nfr');
    assert.ok(perfNode!.labels.includes(':NFRPerformance'));
    assert.ok(result.ir.nfrProfile.detectedCategories.some(c => c.category === 'performance'));
  });

  it('does not tag non-NFR node', () => {
    const ir = makeIR();
    const result = tagNFR(ir);
    const normalNode = result.ir.nodes.find(n => n.id === 'R1-02');
    assert.ok(normalNode);
    assert.strictEqual(normalNode!.type, 'requirement');
  });

  it('extracts threshold from NFR node', () => {
    const ir = makeIR();
    const result = tagNFR(ir);
    const perfNode = result.ir.nodes.find(n => n.id === 'R1-01');
    assert.ok(perfNode);
    assert.ok(perfNode!.properties.nfrThreshold);
    assert.ok(result.thresholdsFound >= 1);
  });

  it('updates nfrProfile.overallCoverage', () => {
    const ir = makeIR();
    const result = tagNFR(ir);
    assert.ok(result.ir.nfrProfile.overallCoverage > 0);
    assert.ok(result.ir.nfrProfile.blindSpots.length < 6);
  });

  it('reports tagged count', () => {
    const ir = makeIR();
    const result = tagNFR(ir);
    assert.ok(result.tagged >= 1);
  });
});
