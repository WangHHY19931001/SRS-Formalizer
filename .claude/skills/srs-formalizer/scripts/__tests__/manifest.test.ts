import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TMP = path.join(os.tmpdir(), `srs-formalizer-manifest-test-${Date.now()}`);
const WORKDIR = path.join(TMP, '.srs_formalizer');
const FIXTURE = path.join(import.meta.dirname!, 'fixtures', 'srs-sample-zh.md');

describe('manifest command', () => {
  before(async () => {
    fs.mkdirSync(TMP, { recursive: true });
    const { main: initMain } = await import('../commands/init.js');
    await initMain(['--output', WORKDIR]);
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('processes single markdown SRS and creates shard index', async () => {
    const { main } = await import('../commands/manifest.js');
    const result = await main([
      '--src', FIXTURE, '--lang', 'zh', '--workdir', WORKDIR,
    ]);
    assert.equal(result.status, 'ok');
    const indexPath = path.join(WORKDIR, '_ctx', 'shard_index.json');
    assert.ok(fs.existsSync(indexPath), 'shard_index.json must exist');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    assert.ok(index.shards.length >= 2, `Expected >=2 shards, got ${index.shards.length}`);
    assert.ok(index.shards[0].locator, 'each shard must have locator');
    assert.ok(index.shards[0].locator.includes(FIXTURE), 'locator must contain source path');
    // Manifest no longer writes physical shard files; only the index is produced
    assert.ok(!fs.existsSync(path.join(WORKDIR, '1_shard', 'S001.md')), 'manifest must not create S001.md in 1_shard/');
  });

  it('produces valid shard_index.json', async () => {
    const { main } = await import('../commands/manifest.js');
    await main(['--src', FIXTURE, '--lang', 'zh', '--workdir', WORKDIR]);
    const indexPath = path.join(WORKDIR, '_ctx', 'shard_index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    assert.equal(index.language, 'zh');
    assert.equal(index.version, '1.1');
    assert.equal(typeof index.source_hash, 'string');
    assert.equal(index.source_hash.length, 64);
    assert.ok(index.shards.length >= 2);
  });

  it('detects P0 gaps from §7 unresolved issues', async () => {
    const { main } = await import('../commands/manifest.js');
    await main(['--src', FIXTURE, '--lang', 'zh', '--workdir', WORKDIR]);
    const indexPath = path.join(WORKDIR, '_ctx', 'shard_index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    const p0Gaps = index.gaps.filter((g: { priority: string }) => g.priority === 'P0');
    assert.ok(p0Gaps.length > 0, `Expected >=1 P0 gap, got ${p0Gaps.length}`);
  });

  it('writes CONTEXT.md with glossary terms', async () => {
    const { main } = await import('../commands/manifest.js');
    await main(['--src', FIXTURE, '--lang', 'zh', '--workdir', WORKDIR]);
    const ctx = fs.readFileSync(path.join(WORKDIR, 'CONTEXT.md'), 'utf-8');
    assert.ok(ctx.includes('SKU'), 'CONTEXT.md should contain SKU');
    assert.ok(ctx.includes('OMS'), 'CONTEXT.md should contain OMS');
  });

  it('is deterministic — same input, same output', async () => {
    const { main } = await import('../commands/manifest.js');
    await main(['--src', FIXTURE, '--lang', 'zh', '--workdir', WORKDIR]);
    const idx1 = JSON.parse(fs.readFileSync(path.join(WORKDIR, '_ctx', 'shard_index.json'), 'utf-8'));
    fs.rmSync(path.join(WORKDIR, '_ctx'), { recursive: true, force: true });
    await main(['--src', FIXTURE, '--lang', 'zh', '--workdir', WORKDIR]);
    const idx2 = JSON.parse(fs.readFileSync(path.join(WORKDIR, '_ctx', 'shard_index.json'), 'utf-8'));
    assert.equal(idx1.source_hash, idx2.source_hash);
    assert.equal(idx1.total_shards, idx2.total_shards);
  });

  it('rejects invalid --workdir', async () => {
    const { main } = await import('../commands/manifest.js');
    const result = await main(['--src', FIXTURE, '--lang', 'zh', '--workdir', '/tmp/nope']);
    assert.equal(result.status, 'error');
  });

  it('handles missing required args', async () => {
    const { main } = await import('../commands/manifest.js');
    const r1 = await main(['--lang', 'zh', '--workdir', WORKDIR]);
    assert.equal(r1.status, 'error');
    const r2 = await main(['--src', FIXTURE, '--lang', 'zh']);
    assert.equal(r2.status, 'error');
  });

  it('errors gracefully on nonexistent src file', async () => {
    const { main } = await import('../commands/manifest.js');
    const result = await main(['--src', path.join(TMP, 'nope.md'), '--lang', 'zh', '--workdir', WORKDIR]);
    assert.equal(result.status, 'error');
  });
});
