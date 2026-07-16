import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildShardIndex } from '../lib/frontend/sharder.js';
import { identifyChapters, scanNFR } from '../lib/frontend/parser.js';

describe('buildShardIndex', () => {
  const shortContent = '# §1 标题\n这是内容。\n## §2 子标题\n更多内容。';

  it('creates shards from content', () => {
    const chapters = identifyChapters(shortContent, '/tmp/srs.md');
    const nfrProfile = scanNFR(shortContent, 'zh');
    const index = buildShardIndex('/tmp/srs.md', shortContent, chapters, 'zh', nfrProfile);
    assert.ok(index.shards.length > 0);
    assert.strictEqual(index.version, '1.1');
    assert.strictEqual(index.nfr_profile.overallCoverage, nfrProfile.overallCoverage);
  });

  it('each shard has locator and line range', () => {
    const chapters = identifyChapters(shortContent, '/tmp/srs.md');
    const nfrProfile = scanNFR(shortContent, 'zh');
    const index = buildShardIndex('/tmp/srs.md', shortContent, chapters, 'zh', nfrProfile);
    for (const shard of index.shards) {
      assert.ok(shard.locator.length > 0);
      assert.ok(shard.source_start_line <= shard.source_end_line);
      assert.ok(shard.estimated_tokens > 0);
    }
  });

  it('shard has nfr_weight when NFR keywords present', () => {
    const nfrContent = '# §1\n响应时间不超过 200ms。并发 10000。\n'.repeat(10);
    const chapters = identifyChapters(nfrContent, '/tmp/srs.md');
    const nfrProfile = scanNFR(nfrContent, 'zh');
    const index = buildShardIndex('/tmp/srs.md', nfrContent, chapters, 'zh', nfrProfile);
    for (const shard of index.shards) {
      assert.ok(typeof shard.nfr_weight === 'number');
      assert.ok(shard.nfr_weight >= 0 && shard.nfr_weight <= 1);
    }
  });

  it('handles empty content', () => {
    const chapters = identifyChapters('', '/tmp/empty.md');
    const nfrProfile = scanNFR('', 'zh');
    const index = buildShardIndex('/tmp/empty.md', '', chapters, 'zh', nfrProfile);
    assert.strictEqual(index.shards.length, 0);
  });

  it('cross_references and nfr_profile present', () => {
    const chapters = identifyChapters(shortContent, '/tmp/srs.md');
    const nfrProfile = scanNFR(shortContent, 'zh');
    const index = buildShardIndex('/tmp/srs.md', shortContent, chapters, 'zh', nfrProfile);
    assert.ok(Array.isArray(index.cross_references));
    assert.ok(typeof index.nfr_profile === 'object');
  });
});
