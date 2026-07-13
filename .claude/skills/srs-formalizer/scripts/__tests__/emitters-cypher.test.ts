import { describe, it, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { SRSIR } from '../types/srs-ir.js';
import { CypherEmitter } from '../lib/emitters/cypher-emitter.js';

const TMP = path.join(os.tmpdir(), `srs-cypher-${Date.now()}`);

function makeIR(): SRSIR {
  return {
    version: '2.0.0',
    meta: {
      sourcePath: '/test',
      sourceHash: 'abc123',
      language: 'en',
      totalChars: 1000,
      totalShards: 3,
      totalNodes: 5,
      totalEdges: 3,
      buildTimestamp: new Date().toISOString(),
    },
    nodes: [
      {
        id: 'R1-001',
        type: 'requirement',
        module: 'intro.html',
        labels: [':Requirement'],
        properties: { statement: 'System shall login users', category: 'explicit', confidence: 'high' },
        source: { filePath: 'intro.html', startLine: 1, endLine: 5, shardId: 's1', chapter: 'Introduction' },
      },
      {
        id: 'R2-002',
        type: 'requirement',
        module: 'features.html',
        labels: [':ImplicitRequirement'],
        properties: { statement: 'System must handle errors', category: 'implicit', confidence: 'medium' },
        source: { filePath: 'features.html', startLine: 10, endLine: 15, shardId: 's2', chapter: 'Features' },
      },
      {
        id: 'R3-nfr-001',
        type: 'nfr',
        module: 'nfr.html',
        labels: [':NFR'],
        properties: {
          statement: 'Response time < 200ms',
          nfrCategory: 'performance',
          nfrThreshold: { metric: 'latency', value: 200, unit: 'ms', operator: '<' },
        },
        source: { filePath: 'nfr.html', startLine: 20, endLine: 22, shardId: 's3', chapter: 'Performance' },
      },
      {
        id: 'R4-arch-001',
        type: 'architecture',
        module: 'arch.html',
        labels: [':Architecture'],
        properties: { statement: 'Microservices architecture', archType: 'Component' },
        source: { filePath: 'arch.html', startLine: 30, endLine: 35, shardId: 's4', chapter: 'Architecture' },
      },
    ],
    edges: [
      {
        id: 'e-001',
        source: 'R2-002',
        target: 'R1-001',
        type: 'depends_on',
        properties: { confidence: 0.8 },
      },
      {
        id: 'e-002',
        source: 'R3-nfr-001',
        target: 'R1-001',
        type: 'nfr_constrains',
        properties: { reasoning: 'Performance constraint on login' },
      },
      {
        id: 'e-003',
        source: 'R3-nfr-001',
        target: 'R2-002',
        type: 'cross_file_depends',
        properties: { crossFileWeight: 0.75, proposed: true },
      },
    ],
    crossRefs: [],
    nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] },
    gaps: [],
    glossary: [],
  };
}

function setup(): string {
  const wd = path.join(TMP, '.srs_formalizer');
  fs.mkdirSync(path.join(wd, '2_graph'), { recursive: true });
  return wd;
}

describe('CypherEmitter', () => {
  const emitter = new CypherEmitter();
  after(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it('produces cypher file with correct node count', () => {
    const wd = setup();
    const ir = makeIR();
    const result = emitter.emit(ir, wd);
    assert.equal(result.fileCount, 1);
    assert.ok(result.files[0]!.endsWith('srs-graph.cypher'));
    const content = fs.readFileSync(result.files[0]!, 'utf-8');
    assert.ok(content.includes('CREATE ('));
    assert.ok(content.includes('SRS Knowledge Graph'));
  });

  it('includes NFR performance label for nfr nodes', () => {
    const wd = setup();
    const ir = makeIR();
    const result = emitter.emit(ir, wd);
    const content = fs.readFileSync(result.files[0]!, 'utf-8');
    assert.ok(content.includes(':NFRPerformance'));
  });

  it('includes requirement node statement', () => {
    const wd = setup();
    const ir = makeIR();
    const result = emitter.emit(ir, wd);
    const content = fs.readFileSync(result.files[0]!, 'utf-8');
    assert.ok(content.includes('System shall login users'));
  });

  it('generates MATCH-less CREATE edges pattern', () => {
    const wd = setup();
    const ir = makeIR();
    const result = emitter.emit(ir, wd);
    const content = fs.readFileSync(result.files[0]!, 'utf-8');
    assert.ok(content.includes('depends_on'));
    assert.ok(content.includes('nfr_constrains'));
  });

  it('includes crossFileWeight for cross_file_depends edges', () => {
    const wd = setup();
    const ir = makeIR();
    const result = emitter.emit(ir, wd);
    const content = fs.readFileSync(result.files[0]!, 'utf-8');
    assert.ok(content.includes('crossFileWeight'));
  });

  it('returns metadata with node and edge counts', () => {
    const wd = setup();
    const ir = makeIR();
    const result = emitter.emit(ir, wd);
    assert.equal(result.metadata.nodes, 4);
    assert.equal(result.metadata.edges, 3);
  });

  it('works with empty IR', () => {
    const wd = setup();
    const empty: SRSIR = {
      version: '2.0.0',
      meta: {
        sourcePath: '/empty', sourceHash: '', language: 'en',
        totalChars: 0, totalShards: 0, totalNodes: 0, totalEdges: 0,
        buildTimestamp: new Date().toISOString(),
      },
      nodes: [], edges: [], crossRefs: [],
      nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] },
      gaps: [], glossary: [],
    };
    const result = emitter.emit(empty, wd);
    const content = fs.readFileSync(result.files[0]!, 'utf-8');
    assert.ok(content.includes('Nodes: 0'));
  });
});
