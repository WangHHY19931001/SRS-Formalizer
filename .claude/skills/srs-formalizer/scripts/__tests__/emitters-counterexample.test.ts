import { describe, it, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { SRSIR } from '../types/srs-ir.js';
import { CounterexampleEmitter } from '../lib/emitters/counterexample-emitter.js';

const TMP = path.join(os.tmpdir(), `srs-ce-emitter-${Date.now()}`);

const SAMPLE_TRACE = `---- MODULE TestSpec ----
State 1: <Initial predicate>
x = 0
y = 0

State 2:
x = 5
y = 0

State 3: <Invariant TypeOK violated>
x = 11
y = 0
`;

function makeIR(): SRSIR {
  return {
    version: '2.0.0',
    meta: {
      sourcePath: '/test', sourceHash: 'abc', language: 'en',
      totalChars: 100, totalShards: 1, totalNodes: 1, totalEdges: 0,
      buildTimestamp: new Date().toISOString(),
    },
    nodes: [{
      id: 'R1', type: 'requirement', module: 'test',
      labels: [':Requirement'],
      properties: { statement: 'Test', category: 'explicit', confidence: 'high' },
      source: { filePath: 'spec.html', startLine: 1, endLine: 2, shardId: 's1', chapter: 'Intro' },
    }],
    edges: [], crossRefs: [],
    nfrProfile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: [] },
    gaps: [], glossary: [],
  };
}

function setupTrace(wd: string) {
  const traceDir = path.join(wd, '5_formal', 'traces');
  fs.mkdirSync(traceDir, { recursive: true });
  fs.writeFileSync(path.join(traceDir, 'sample.trace'), SAMPLE_TRACE);
}

describe('CounterexampleEmitter', () => {
  const emitter = new CounterexampleEmitter();
  after(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it('has correct name and description', () => {
    assert.equal(emitter.name, 'counterexample');
    assert.ok(emitter.description.length > 0);
  });

  it('returns empty result when no trace found', () => {
    const wd = path.join(TMP, '.srs_formalizer_ce1');
    fs.mkdirSync(wd, { recursive: true });
    const ir = makeIR();
    const result = emitter.emit(ir, wd);
    assert.equal(result.fileCount, 0);
  });

  it('generates pytest counterexample from trace', () => {
    const wd = path.join(TMP, '.srs_formalizer_ce2');
    fs.mkdirSync(wd, { recursive: true });
    setupTrace(wd);
    const ir = makeIR();
    const result = emitter.emit(ir, wd, { framework: 'pytest' });
    assert.equal(result.fileCount, 1);
    assert.ok(result.files[0]!.endsWith('.py'));
    const content = fs.readFileSync(result.files[0]!, 'utf-8');
    assert.ok(content.includes('counterexample'));
    assert.ok(content.includes('TypeOK'));
    assert.ok(content.includes('pytest') || content.includes('def test_'));
  });

  it('generates junit counterexample from trace', () => {
    const wd = path.join(TMP, '.srs_formalizer_ce3');
    fs.mkdirSync(wd, { recursive: true });
    setupTrace(wd);
    const ir = makeIR();
    const result = emitter.emit(ir, wd, { framework: 'junit' });
    assert.equal(result.fileCount, 1);
    assert.ok(result.files[0]!.endsWith('.java'));
    const content = fs.readFileSync(result.files[0]!, 'utf-8');
    assert.ok(content.includes('class '));
    assert.ok(content.includes('TypeOK'));
  });

  it('generates fast-check counterexample from trace', () => {
    const wd = path.join(TMP, '.srs_formalizer_ce4');
    fs.mkdirSync(wd, { recursive: true });
    setupTrace(wd);
    const ir = makeIR();
    const result = emitter.emit(ir, wd, { framework: 'fast-check' });
    assert.equal(result.fileCount, 1);
    assert.ok(result.files[0]!.endsWith('.ts'));
  });

  it('returns metadata with invariant name and state count', () => {
    const wd = path.join(TMP, '.srs_formalizer_ce5');
    fs.mkdirSync(wd, { recursive: true });
    setupTrace(wd);
    const ir = makeIR();
    const result = emitter.emit(ir, wd, { framework: 'pytest' });
    assert.equal(result.metadata.invariantName, 'TypeOK');
    assert.equal(result.metadata.traceStates, 3);
  });

  it('reads trace from explicit --trace-file path', () => {
    const wd = path.join(TMP, '.srs_formalizer_ce6');
    fs.mkdirSync(wd, { recursive: true });
    const tracePath = path.join(TMP, 'explicit.trace');
    fs.writeFileSync(tracePath, SAMPLE_TRACE);
    const ir = makeIR();
    const result = emitter.emit(ir, wd, { framework: 'pytest', tracePath });
    assert.equal(result.fileCount, 1);
  });
});
