import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tagNFR } from '../lib/middle-end/nfr-tagger.js';
import type { SRSIR, IRNode, NFRCategory } from '../types/srs-ir.js';

// 辅助函数：构造最小 SRSIR
function makeIR(nodes: SRSIR['nodes'], edges: SRSIR['edges'] = [], gaps: SRSIR['gaps'] = []): SRSIR {
  return {
    version: '2.1.0',
    meta: { sourcePath: '', sourceHash: '', language: 'zh', totalChars: 0, totalShards: 0, totalNodes: nodes.length, totalEdges: edges.length, buildTimestamp: '' },
    nodes, edges, crossRefs: [],
    nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] },
    gaps, glossary: [],
  };
}

function req(id: string, statement: string, module = 'S001', filePath = 'a.md'): IRNode {
  return {
    id, type: 'requirement', module, labels: [':Requirement'],
    properties: { statement },
    source: { filePath, startLine: 1, endLine: 2, shardId: 'S001', chapter: '' },
  };
}

const ALL_CATEGORIES: NFRCategory[] = [
  'performance', 'security', 'availability', 'compatibility', 'maintainability', 'compliance',
];

describe('M3 NFR Tagger', () => {
  it('should detect performance category', () => {
    const ir = makeIR([req('R1', '系统响应时间必须小于100ms')]);
    const result = tagNFR(ir);
    assert.ok(result.nfrProfile.detectedCategories.some(e => e.category === 'performance'));
  });

  it('should detect security category', () => {
    const ir = makeIR([req('R1', '系统必须支持用户认证与授权')]);
    const result = tagNFR(ir);
    assert.ok(result.nfrProfile.detectedCategories.some(e => e.category === 'security'));
  });

  it('should list all 6 categories in blindSpots when no NFR keywords present', () => {
    const ir = makeIR([req('R1', '系统必须支持用户登录功能')]);
    const result = tagNFR(ir);
    assert.equal(result.nfrProfile.blindSpots.length, 6);
    for (const cat of ALL_CATEGORIES) {
      assert.ok(result.nfrProfile.blindSpots.includes(cat), `blindSpots should include ${cat}`);
    }
  });

  it('should calculate overallCoverage correctly (1 of 2 reqs tagged = 0.5)', () => {
    const ir = makeIR([
      req('R1', '系统响应时间必须小于100ms'),  // performance NFR
      req('R2', '系统必须支持用户登录功能'),    // no NFR
    ]);
    const result = tagNFR(ir);
    assert.equal(result.nfrProfile.overallCoverage, 0.5);
  });

  it('should handle empty IR gracefully (overallCoverage=0, blindSpots=6)', () => {
    const ir = makeIR([]);
    const result = tagNFR(ir);
    assert.equal(result.nfrProfile.overallCoverage, 0);
    assert.equal(result.nfrProfile.detectedCategories.length, 0);
    assert.equal(result.nfrProfile.blindSpots.length, 6);
  });

  it('should not tag "必须" alone as NFR (anti-inflation)', () => {
    // "必须" is a modal verb, not an NFR keyword (根因报告 §4.7 注水根因)
    const ir = makeIR([req('R1', '系统必须支持数据导出功能')]);
    const result = tagNFR(ir);
    assert.equal(result.nfrProfile.detectedCategories.length, 0);
    assert.equal(result.nfrProfile.overallCoverage, 0);
  });
});
