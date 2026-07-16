import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..', '..');
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

  it('keeps canonical documentation and registry emitter counts aligned', () => {
    for (const document of ['README.md', 'AGENTS.md', 'CLAUDE.md', '.claude/skills/srs-formalizer/SKILL.md']) {
      const content = fs.readFileSync(path.join(REPOSITORY_ROOT, document), 'utf8');
      assert.equal(/12\s+Emitter/i.test(content), false, `${document} must not claim 12 emitters`);
      assert.match(content, /10\s+Emitter/i, `${document} must state the registered emitter count`);
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
