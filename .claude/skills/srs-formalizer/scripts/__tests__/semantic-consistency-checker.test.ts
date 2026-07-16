/**
 * Tests for lib/semantic/consistency-checker.ts
 *
 * Verifies all 4 categories of IR semantic validation:
 *   A. Type validity (enum fields)
 *   B. Reference integrity (edge endpoints, ID uniqueness, meta counts)
 *   C. Property completeness (required fields per node type)
 *   D. NFR threshold validity (finite values, valid operators)
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import type { SRSIR, IRNode, IREdge } from '../types/srs-ir.js';
import { checkSemanticConsistency } from '../lib/semantic/consistency-checker.js';

function mkNode(overrides: Partial<IRNode> & { id: string }): IRNode {
  return {
    type: 'requirement', module: 'mod', labels: [],
    properties: { statement: 'test statement', category: 'explicit', confidence: 'high' },
    source: { filePath: '/tmp/test.md', startLine: 1, endLine: 2, shardId: 's1', chapter: '§1' },
    ...overrides,
  };
}

function mkEdge(overrides: Partial<IREdge> & { id: string; source: string; target: string }): IREdge {
  return { type: 'depends_on', properties: {}, ...overrides };
}

function mkIR(nodes: IRNode[], edges: IREdge[]): SRSIR {
  return {
    version: '2.0.0',
    meta: {
      sourcePath: '/tmp/test.md', sourceHash: 'abc', language: 'zh',
      totalChars: 100, totalShards: 1, totalNodes: nodes.length, totalEdges: edges.length,
      buildTimestamp: new Date().toISOString(),
    },
    nodes, edges, crossRefs: [],
    nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] },
    gaps: [], glossary: [],
  };
}

describe('checkSemanticConsistency', () => {
  it('returns valid for a well-formed IR', () => {
    const ir = mkIR([
      mkNode({ id: 'R1-01' }),
      mkNode({ id: 'R1-02', type: 'nfr', properties: { statement: '响应时间 ≤ 200ms', nfrCategory: 'performance', nfrThreshold: { metric: 'response_time', value: 200, unit: 'ms', operator: '<=' } } }),
    ], [mkEdge({ id: 'E1', source: 'R1-01', target: 'R1-02' })]);

    const report = checkSemanticConsistency(ir);
    assert.equal(report.valid, true);
    assert.equal(report.errors, 0);
  });

  it('flags invalid node type', () => {
    const ir = mkIR([mkNode({ id: 'R1-01', type: 'invalid_type' as IRNode['type'] })], []);
    const report = checkSemanticConsistency(ir);
    assert.equal(report.valid, false);
    assert.ok(report.findings.some(f => f.category === 'type' && f.path === 'nodes[0].type'));
  });

  it('flags invalid edge type', () => {
    const ir = mkIR(
      [mkNode({ id: 'R1-01' }), mkNode({ id: 'R1-02' })],
      [mkEdge({ id: 'E1', source: 'R1-01', target: 'R1-02', type: 'invalid_edge' as IREdge['type'] })],
    );
    const report = checkSemanticConsistency(ir);
    assert.equal(report.valid, false);
    assert.ok(report.findings.some(f => f.category === 'type' && f.path === 'edges[0].type'));
  });

  it('flags dangling edge source', () => {
    const ir = mkIR(
      [mkNode({ id: 'R1-01' })],
      [mkEdge({ id: 'E1', source: 'NONEXISTENT', target: 'R1-01' })],
    );
    const report = checkSemanticConsistency(ir);
    assert.equal(report.valid, false);
    assert.ok(report.findings.some(f => f.category === 'reference' && f.path === 'edges[0].source'));
  });

  it('flags dangling edge target', () => {
    const ir = mkIR(
      [mkNode({ id: 'R1-01' })],
      [mkEdge({ id: 'E1', source: 'R1-01', target: 'NONEXISTENT' })],
    );
    const report = checkSemanticConsistency(ir);
    assert.equal(report.valid, false);
    assert.ok(report.findings.some(f => f.category === 'reference' && f.path === 'edges[0].target'));
  });

  it('flags duplicate node IDs', () => {
    const ir = mkIR(
      [mkNode({ id: 'R1-01' }), mkNode({ id: 'R1-01' })],
      [],
    );
    const report = checkSemanticConsistency(ir);
    assert.equal(report.valid, false);
    assert.ok(report.findings.some(f => f.category === 'reference' && f.message.includes('Duplicate node ID')));
  });

  it('flags duplicate edge IDs', () => {
    const ir = mkIR(
      [mkNode({ id: 'R1-01' }), mkNode({ id: 'R1-02' })],
      [
        mkEdge({ id: 'E1', source: 'R1-01', target: 'R1-02' }),
        mkEdge({ id: 'E1', source: 'R1-02', target: 'R1-01' }),
      ],
    );
    const report = checkSemanticConsistency(ir);
    assert.equal(report.valid, false);
    assert.ok(report.findings.some(f => f.category === 'reference' && f.message.includes('Duplicate edge ID')));
  });

  it('flags missing statement on requirement node', () => {
    const ir = mkIR([mkNode({ id: 'R1-01', properties: { statement: '' } })], []);
    const report = checkSemanticConsistency(ir);
    assert.equal(report.valid, false);
    assert.ok(report.findings.some(f => f.category === 'property' && f.path === 'nodes[0].properties.statement'));
  });

  it('flags missing nfrCategory on nfr node', () => {
    const ir = mkIR([mkNode({ id: 'R1-01', type: 'nfr', properties: { statement: 'test' } })], []);
    const report = checkSemanticConsistency(ir);
    assert.equal(report.valid, false);
    assert.ok(report.findings.some(f => f.category === 'property' && f.path === 'nodes[0].properties.nfrCategory'));
  });

  it('flags missing source.filePath', () => {
    const ir = mkIR([mkNode({ id: 'R1-01', source: { filePath: '', startLine: 1, endLine: 2, shardId: 's1', chapter: '§1' } })], []);
    const report = checkSemanticConsistency(ir);
    assert.equal(report.valid, false);
    assert.ok(report.findings.some(f => f.category === 'property' && f.path === 'nodes[0].source.filePath'));
  });

  it('flags invalid threshold operator', () => {
    const ir = mkIR([mkNode({
      id: 'R1-01', type: 'nfr',
      properties: {
        statement: 'test', nfrCategory: 'performance',
        nfrThreshold: { metric: 'response_time', value: 200, unit: 'ms', operator: '!=' as never },
      },
    })], []);
    const report = checkSemanticConsistency(ir);
    assert.equal(report.valid, false);
    assert.ok(report.findings.some(f => f.category === 'threshold' && f.path === 'nodes[0].properties.nfrThreshold.operator'));
  });

  it('flags NaN threshold value', () => {
    const ir = mkIR([mkNode({
      id: 'R1-01', type: 'nfr',
      properties: {
        statement: 'test', nfrCategory: 'performance',
        nfrThreshold: { metric: 'response_time', value: NaN, unit: 'ms', operator: '<=' },
      },
    })], []);
    const report = checkSemanticConsistency(ir);
    assert.equal(report.valid, false);
    assert.ok(report.findings.some(f => f.category === 'threshold' && f.path === 'nodes[0].properties.nfrThreshold.value'));
  });

  it('flags missing threshold unit', () => {
    const ir = mkIR([mkNode({
      id: 'R1-01', type: 'nfr',
      properties: {
        statement: 'test', nfrCategory: 'performance',
        nfrThreshold: { metric: 'response_time', value: 200, unit: '', operator: '<=' },
      },
    })], []);
    const report = checkSemanticConsistency(ir);
    assert.equal(report.valid, false);
    assert.ok(report.findings.some(f => f.category === 'threshold' && f.path === 'nodes[0].properties.nfrThreshold.unit'));
  });

  it('flags overallCoverage out of range', () => {
    const ir = mkIR([mkNode({ id: 'R1-01' })], []);
    ir.nfrProfile.overallCoverage = 1.5;
    const report = checkSemanticConsistency(ir);
    assert.equal(report.valid, false);
    assert.ok(report.findings.some(f => f.category === 'threshold' && f.path === 'nfrProfile.overallCoverage'));
  });

  it('flags meta.totalNodes mismatch', () => {
    const ir = mkIR([mkNode({ id: 'R1-01' }), mkNode({ id: 'R1-02' })], []);
    ir.meta.totalNodes = 5;
    const report = checkSemanticConsistency(ir);
    assert.equal(report.valid, false);
    assert.ok(report.findings.some(f => f.category === 'reference' && f.path === 'meta.totalNodes'));
  });

  it('flags invalid nfrCategory enum', () => {
    const ir = mkIR([mkNode({
      id: 'R1-01', type: 'nfr',
      properties: { statement: 'test', nfrCategory: 'invalid_cat' as never },
    })], []);
    const report = checkSemanticConsistency(ir);
    assert.equal(report.valid, false);
    assert.ok(report.findings.some(f => f.category === 'type' && f.path === 'nodes[0].properties.nfrCategory'));
  });

  it('warns on threshold without nfrCategory', () => {
    const ir = mkIR([mkNode({
      id: 'R1-01', type: 'requirement',
      properties: {
        statement: 'test',
        nfrThreshold: { metric: 'response_time', value: 200, unit: 'ms', operator: '<=' },
      },
    })], []);
    const report = checkSemanticConsistency(ir);
    assert.equal(report.warnings, 1);
    assert.ok(report.findings.some(f => f.category === 'threshold' && f.severity === 'warning'));
  });

  it('provides correct summary counts', () => {
    const ir = mkIR([
      mkNode({ id: 'R1-01', type: 'invalid' as never }),
      mkNode({ id: 'R1-01' }),
    ], [
      mkEdge({ id: 'E1', source: 'MISSING', target: 'ALSO_MISSING' }),
    ]);
    ir.meta.totalNodes = 99;
    const report = checkSemanticConsistency(ir);
    assert.ok(report.summary.typeErrors > 0);
    assert.ok(report.summary.referenceErrors > 0);
  });
});
