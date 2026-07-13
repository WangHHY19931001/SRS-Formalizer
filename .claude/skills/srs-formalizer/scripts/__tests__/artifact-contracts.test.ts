import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ARTIFACT_DIRECTORIES,
  ARTIFACT_PATHS,
  EMITTER_GROUPS,
  EMITTER_REGISTRY,
  emitterNames,
  emittersInGroup,
  hashFiles,
  writeValidationReport,
} from '../lib/artifacts/index.js';

describe('artifact contracts', () => {
  it('defines unique paths for every lifecycle destination', () => {
    assert.equal(new Set(ARTIFACT_DIRECTORIES).size, ARTIFACT_DIRECTORIES.length);
    assert.equal(ARTIFACT_PATHS.bddDraft, path.join('outputs', 'bdd', 'draft'));
    assert.equal(ARTIFACT_PATHS.tlaVerified, path.join('outputs', 'tlaplus', 'verified'));
    assert.equal(ARTIFACT_PATHS.leanValidation, path.join('outputs', 'lean4', 'validation'));
  });

  it('registers every emitter exactly once with a supported group', () => {
    const names = emitterNames();
    assert.equal(new Set(names).size, names.length);
    assert.equal(EMITTER_REGISTRY.length, 10);
    for (const entry of EMITTER_REGISTRY) {
      assert.ok(EMITTER_GROUPS.includes(entry.group));
    }
    assert.deepEqual(emittersInGroup('bdd').map(entry => entry.name), ['gherkin']);
    assert.deepEqual(emittersInGroup('formal').map(entry => entry.name), ['tlaSpec', 'leanProof']);
  });

  it('hashes sources deterministically and atomically writes reports', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'srs-artifacts-'));
    const source = path.join(dir, 'source.txt');
    const reportPath = path.join(dir, 'reports', 'bdd.json');
    fs.writeFileSync(source, 'source', 'utf-8');

    const hash = hashFiles([source]);
    writeValidationReport(reportPath, {
      artifactKind: 'bdd',
      lifecycle: 'verified',
      sourcePaths: [source],
      sourceHash: hash,
      irHash: hash,
      tools: [{ name: 'test', version: '1.0' }],
      startedAt: '2026-07-13T00:00:00.000Z',
      completedAt: '2026-07-13T00:00:01.000Z',
      passed: true,
      checks: [{ name: 'structure', passed: true }],
    });

    assert.equal(hashFiles([source]), hash);
    assert.equal(JSON.parse(fs.readFileSync(reportPath, 'utf-8')).passed, true);
    assert.equal(fs.readdirSync(path.dirname(reportPath)).some(file => file.endsWith('.tmp')), false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
