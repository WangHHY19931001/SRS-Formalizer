import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  ARTIFACT_DIRECTORIES,
  ARTIFACT_PATHS,
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

  it('covers all DESIGN.md §4.1/§6.3 artifact paths (draft/verified/validation triples + graphs/fixtures/reports)', () => {
    // 三类形式化产物各有 draft/verified/validation 三态（DESIGN.md §4.1）
    const expectedLifecycleTriples = [
      ['outputs', 'bdd', 'draft'],
      ['outputs', 'bdd', 'verified'],
      ['outputs', 'bdd', 'validation'],
      ['outputs', 'tlaplus', 'draft'],
      ['outputs', 'tlaplus', 'verified'],
      ['outputs', 'tlaplus', 'validation'],
      ['outputs', 'lean4', 'draft'],
      ['outputs', 'lean4', 'verified'],
      ['outputs', 'lean4', 'validation'],
    ];
    for (const segments of expectedLifecycleTriples) {
      const expected = path.join(...segments);
      assert.ok(
        ARTIFACT_DIRECTORIES.includes(expected),
        `缺少路径契约: ${expected}`,
      );
    }
    // 非形式化产物目录（DESIGN.md §4.1）
    assert.equal(ARTIFACT_PATHS.graphs, path.join('outputs', 'graphs'));
    assert.equal(ARTIFACT_PATHS.fixtures, path.join('outputs', 'fixtures'));
    assert.equal(ARTIFACT_PATHS.reports, path.join('outputs', 'reports'));
  });

  it('enforces draft artifacts are not consumable as verified (lifecycle separation)', () => {
    // draft/verified/validation 三态路径必须互不相同（DESIGN.md §6.3 草稿不可消费）
    const bddPaths = [ARTIFACT_PATHS.bddDraft, ARTIFACT_PATHS.bddVerified, ARTIFACT_PATHS.bddValidation];
    const tlaPaths = [ARTIFACT_PATHS.tlaDraft, ARTIFACT_PATHS.tlaVerified, ARTIFACT_PATHS.tlaValidation];
    const leanPaths = [ARTIFACT_PATHS.leanDraft, ARTIFACT_PATHS.leanVerified, ARTIFACT_PATHS.leanValidation];
    for (const triple of [bddPaths, tlaPaths, leanPaths]) {
      assert.equal(new Set(triple).size, 3, 'draft/verified/validation 路径必须互不相同');
      // draft 路径不得等于 verified 路径（草稿不可消费）
      assert.notEqual(triple[0], triple[1]);
    }
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
