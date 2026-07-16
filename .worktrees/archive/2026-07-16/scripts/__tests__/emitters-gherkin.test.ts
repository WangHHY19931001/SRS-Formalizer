import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { SRSIR } from '../types/srs-ir.js';
import { GherkinEmitter } from '../lib/emitters/gherkin-emitter.js';

const TMP = path.join(os.tmpdir(), `srs-formalizer-gherkin-emitter-test-${Date.now()}`);

function makeIR(overrides: Partial<SRSIR> = {}): SRSIR {
  return {
    version: '2.0.0',
    meta: {
      sourcePath: '/test/srs.md',
      sourceHash: 'a'.repeat(64),
      language: 'zh',
      totalChars: 1000,
      totalShards: 2,
      totalNodes: 6,
      totalEdges: 2,
      buildTimestamp: new Date().toISOString(),
    },
    nodes: [
      {
        id: 'R1-REQ-0001',
        type: 'requirement',
        module: 'UserLogin',
        labels: ['functional', 'security'],
        properties: { statement: '当用户提交登录表单时系统应验证凭据', category: 'explicit', confidence: 'high' },
        source: { filePath: 'srs.md', startLine: 10, endLine: 15, shardId: 'S1', chapter: '2' },
      },
      {
        id: 'R1-REQ-0002',
        type: 'requirement',
        module: 'Dashboard',
        labels: ['functional'],
        properties: { statement: '用户登录后应在3秒内看到仪表盘', category: 'explicit', confidence: 'high' },
        source: { filePath: 'srs.md', startLine: 20, endLine: 25, shardId: 'S1', chapter: '2' },
      },
      {
        id: 'R1-NFR-0003',
        type: 'nfr',
        module: 'API Gateway',
        labels: ['nfr', 'performance'],
        properties: {
          nfrCategory: 'performance',
          nfrThreshold: { metric: 'response_time', value: 200, unit: 'ms', operator: '<' },
          confidence: 'high',
        },
        source: { filePath: 'srs.md', startLine: 30, endLine: 35, shardId: 'S2', chapter: '3' },
      },
      {
        id: 'R1-NFR-0004',
        type: 'nfr',
        module: 'AuthService',
        labels: ['nfr', 'security'],
        properties: {
          nfrCategory: 'security',
          nfrThreshold: { metric: 'auth_failure_rate', value: 5, unit: '%', operator: '<' },
          confidence: 'high',
        },
        source: { filePath: 'srs.md', startLine: 40, endLine: 45, shardId: 'S2', chapter: '3' },
      },
    ],
    edges: [
      {
        id: 'E1', source: 'R1-REQ-0001', target: 'R1-REQ-0002', type: 'depends_on',
        properties: { confidence: 1.0 },
      },
      {
        id: 'E2', source: 'R1-NFR-0003', target: 'R1-REQ-0001', type: 'nfr_constrains',
        properties: { confidence: 0.9 },
      },
    ],
    crossRefs: [],
    nfrProfile: {
      detectedCategories: [
        { category: 'performance', keywordHits: 3, shardIds: ['S2'], nodeIds: ['R1-NFR-0003'] },
        { category: 'security', keywordHits: 2, shardIds: ['S2'], nodeIds: ['R1-NFR-0004'] },
      ],
      weightedShards: [{ shardId: 'S2', nfrWeight: 0.8, primaryCategory: 'performance' }],
      overallCoverage: 0.7,
      blindSpots: [],
    },
    gaps: [],
    glossary: [],
    ...overrides,
  };
}

describe('GherkinEmitter', () => {
  let workDir: string;

  before(() => {
    fs.mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('creates .feature files from SRS IR', () => {
    workDir = path.join(TMP, 'gherkin-test', '.srs_formalizer');
    const emitter = new GherkinEmitter();
    const ir = makeIR();
    const result = emitter.emit(ir, workDir);

    assert.ok(result.fileCount > 0);
    assert.ok(result.files.length > 0);
    assert.ok((result.metadata as Record<string, unknown>).moduleCount !== undefined);

    for (const file of result.files) {
      assert.ok(fs.existsSync(file));
      assert.ok(file.endsWith('.feature'));
    }
  });

  it('generates Features with proper Gherkin structure', () => {
    workDir = path.join(TMP, 'gherkin-structure', '.srs_formalizer');
    const emitter = new GherkinEmitter();
    const ir = makeIR();
    const result = emitter.emit(ir, workDir);

    for (const file of result.files) {
      const content = fs.readFileSync(file, 'utf-8');
      assert.ok(content.includes('# SYSTEM:'));
      assert.ok(content.includes('# TRACE:'));
      assert.ok(content.includes('Feature:'));
      assert.ok(content.includes('Scenario:'));
    }
  });

  it('generates NFR features when NFR nodes exist', () => {
    workDir = path.join(TMP, 'gherkin-nfr', '.srs_formalizer');
    const emitter = new GherkinEmitter();
    const ir = makeIR();
    const result = emitter.emit(ir, workDir);

    const nfrFiles = result.files.filter(f => {
      const base = path.basename(f);
      return base.includes('NFR_') || base.includes('NFR ');
    });
    assert.ok(nfrFiles.length >= 1);

    for (const file of nfrFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      assert.ok(content.includes('# verification_method:'));
    }
  });

  it('writes output to 4_bdd/features/ subdirectory', () => {
    workDir = path.join(TMP, 'gherkin-output-dir', '.srs_formalizer');
    const emitter = new GherkinEmitter();
    const ir = makeIR();
    const result = emitter.emit(ir, workDir);

    for (const file of result.files) {
      assert.ok(file.includes(path.join('outputs', 'bdd', 'draft')));
    }
  });

  it('handles IR with no nodes gracefully', () => {
    workDir = path.join(TMP, 'gherkin-empty', '.srs_formalizer');
    const emitter = new GherkinEmitter();
    const ir = makeIR({ nodes: [] });
    const result = emitter.emit(ir, workDir);

    assert.equal(result.fileCount, 0);
    assert.deepStrictEqual(result.files, []);
  });

  it('sanitizes module names containing special characters', () => {
    workDir = path.join(TMP, 'gherkin-sanitize', '.srs_formalizer');
    const emitter = new GherkinEmitter();
    const ir = makeIR({
      nodes: [{
        id: 'R1-REQ-0099',
        type: 'requirement',
        module: 'Module/With:Special<Chars>',
        labels: ['functional'],
        properties: { statement: 'test statement', confidence: 'high' },
        source: { filePath: 'srs.md', startLine: 1, endLine: 2, shardId: 'S1', chapter: '1' },
      }],
      edges: [],
    });
    const result = emitter.emit(ir, workDir);

    for (const file of result.files) {
      const base = path.basename(file);
      assert.ok(!base.includes('/'));
      assert.ok(!base.includes(':'));
      assert.ok(!base.includes('<'));
      assert.ok(!base.includes('>'));
    }
  });
});
