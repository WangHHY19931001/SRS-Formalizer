import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promoteFiles, promoteFilesMerge } from '../lib/artifacts/promotion.js';
import { hashFiles } from '../lib/artifacts/validation-report.js';
import { checkShardCoverage } from '../lib/verify-gate/checks-s1.js';

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('assessment fixes', () => {
  // §P0-1: multi-module TLA+ promotion must accumulate, not wipe.
  it('promoteFilesMerge preserves previously promoted modules', () => {
    const root = tmpDir('srs-promote-merge-');
    const draft = path.join(root, 'draft');
    const verified = path.join(root, 'verified');
    fs.mkdirSync(draft, { recursive: true });

    fs.writeFileSync(path.join(draft, 'ModuleA.tla'), 'A');
    fs.writeFileSync(path.join(draft, 'ModuleA.cfg'), 'A');
    promoteFilesMerge(draft, verified, ['ModuleA.tla', 'ModuleA.cfg']);

    fs.writeFileSync(path.join(draft, 'ModuleB.tla'), 'B');
    fs.writeFileSync(path.join(draft, 'ModuleB.cfg'), 'B');
    promoteFilesMerge(draft, verified, ['ModuleB.tla', 'ModuleB.cfg']);

    assert.ok(fs.existsSync(path.join(verified, 'ModuleA.tla')), 'ModuleA survives second promote');
    assert.ok(fs.existsSync(path.join(verified, 'ModuleB.tla')), 'ModuleB present');
    fs.rmSync(root, { recursive: true, force: true });
  });

  // §P2-9: TLC intermediates never enter verified/ via merge.
  it('promoteFilesMerge skips TLC intermediate products', () => {
    const root = tmpDir('srs-promote-tlc-');
    const draft = path.join(root, 'draft');
    const verified = path.join(root, 'verified');
    fs.mkdirSync(draft, { recursive: true });
    fs.writeFileSync(path.join(draft, 'Spec.tla'), 'S');
    fs.writeFileSync(path.join(draft, 'Spec_TTrace_123.tla'), 'trace');
    promoteFilesMerge(draft, verified, ['Spec.tla', 'Spec_TTrace_123.tla']);
    assert.ok(fs.existsSync(path.join(verified, 'Spec.tla')));
    assert.ok(!fs.existsSync(path.join(verified, 'Spec_TTrace_123.tla')), 'trace file excluded');
    fs.rmSync(root, { recursive: true, force: true });
  });

  // promoteFiles (BDD-style whole-set replace) still wipes the target.
  it('promoteFiles keeps destructive whole-directory replace semantics', () => {
    const root = tmpDir('srs-promote-replace-');
    const draft = path.join(root, 'draft');
    const verified = path.join(root, 'verified');
    fs.mkdirSync(draft, { recursive: true });
    fs.mkdirSync(verified, { recursive: true });
    fs.writeFileSync(path.join(verified, 'stale.feature'), 'old');
    fs.writeFileSync(path.join(draft, 'fresh.feature'), 'new');
    promoteFiles(draft, verified, ['fresh.feature']);
    assert.ok(fs.existsSync(path.join(verified, 'fresh.feature')));
    assert.ok(!fs.existsSync(path.join(verified, 'stale.feature')), 'old files wiped');
    fs.rmSync(root, { recursive: true, force: true });
  });

  // §P0-3: hashFiles is path-independent (basename + content only).
  it('hashFiles yields the same digest for draft and verified locations', () => {
    const root = tmpDir('srs-hash-');
    const draft = path.join(root, 'draft');
    const verified = path.join(root, 'verified');
    fs.mkdirSync(draft, { recursive: true });
    fs.mkdirSync(verified, { recursive: true });
    fs.writeFileSync(path.join(draft, 'Spec.tla'), 'content');
    fs.writeFileSync(path.join(verified, 'Spec.tla'), 'content');
    assert.equal(hashFiles([path.join(draft, 'Spec.tla')]), hashFiles([path.join(verified, 'Spec.tla')]));
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('hashFiles deduplicates a file collected twice by basename', () => {
    const root = tmpDir('srs-hash-dedup-');
    fs.mkdirSync(root, { recursive: true });
    const file = path.join(root, 'lakefile.lean');
    fs.writeFileSync(file, 'pkg');
    assert.equal(hashFiles([file, file]), hashFiles([file]));
    fs.rmSync(root, { recursive: true, force: true });
  });

  // §P0-0a: S1 shard coverage gate.
  function coverageWorkdir(): string {
    const root = tmpDir('srs-shardcov-');
    const wd = path.join(root, '.srs_formalizer');
    fs.mkdirSync(path.join(wd, '_ctx'), { recursive: true });
    fs.mkdirSync(path.join(wd, '2_extract', 'r1-explicit'), { recursive: true });
    fs.writeFileSync(path.join(wd, '_ctx', 'shard_index.json'), JSON.stringify({
      total_shards: 2,
      shards: [
        { id: 'S001', chapter_ref: '1. Intro', source_path: 'srs.md' },
        { id: 'S002', chapter_ref: '2. Arch', source_path: 'srs.md' },
      ],
    }));
    return wd;
  }

  it('checkShardCoverage fails when a shard has zero extraction', () => {
    const wd = coverageWorkdir();
    fs.writeFileSync(path.join(wd, '2_extract', 'r1-explicit', 'S001.jsonl'),
      JSON.stringify({ id: 'R1-S001-0001', category: 'explicit', statement: 'x', source_file: 'srs.md', confidence: 'high' }) + '\n');
    const result = checkShardCoverage(wd);
    assert.equal(result.passed, false);
    assert.ok(result.detail!.includes('S002'));
  });

  it('checkShardCoverage passes when empty shard is explicitly declared', () => {
    const wd = coverageWorkdir();
    fs.writeFileSync(path.join(wd, '2_extract', 'r1-explicit', 'S001.jsonl'),
      JSON.stringify({ id: 'R1-S001-0001', category: 'explicit', statement: 'x', source_file: 'srs.md', confidence: 'high' }) + '\n');
    fs.writeFileSync(path.join(wd, '2_extract', 'r1-explicit', '_empty_shards.json'), JSON.stringify(['S002']));
    const result = checkShardCoverage(wd);
    assert.equal(result.passed, true);
  });

  it('checkShardCoverage is not fooled by interval-named files', () => {
    const wd = coverageWorkdir();
    // A single interval-named file that only actually contains S001 records.
    fs.writeFileSync(path.join(wd, '2_extract', 'r1-explicit', 'S001_S002.jsonl'),
      JSON.stringify({ id: 'R1-S001-0001', category: 'explicit', statement: 'x', source_file: 'srs.md', confidence: 'high' }) + '\n');
    const result = checkShardCoverage(wd);
    assert.equal(result.passed, false, 'S002 still uncovered despite interval filename');
    assert.ok(result.detail!.includes('S002'));
  });
});
