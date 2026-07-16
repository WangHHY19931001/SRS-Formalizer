import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

const TMP = '/tmp/srs-formalizer-test-manifest-new';
const WORKDIR = path.join(TMP, '.srs_formalizer');
const SRS_FILE = path.join(TMP, 'test_srs.md');

describe('manifest (new)', () => {
  before(() => {
    fs.mkdirSync(WORKDIR, { recursive: true });
    fs.writeFileSync(SRS_FILE, `# §1 概述
系统需支持高并发场景。
## §2 性能需求
响应时间不超过 200ms。
## §3 安全需求
所有数据传输需加密。参见 §2 中的定义。
## 术语表
| 术语 | 定义 |
|------|------|
| TPS | Transactions Per Second |`, 'utf-8');
    fs.writeFileSync(path.join(WORKDIR, 'STATE.md'), '# STATE\n', 'utf-8');
  });

  after(() => { fs.rmSync(TMP, { recursive: true, force: true }); });

  it('generates shard_index.json v1.1', async () => {
    const { main } = await import('../commands/manifest.js');
    const result = await main(['--src', SRS_FILE, '--lang', 'zh', '--workdir', WORKDIR]);
    assert.strictEqual(result.status, 'ok');

    const indexPath = path.join(WORKDIR, '1_input', 'shard_index.json');
    assert.ok(fs.existsSync(indexPath));
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    assert.strictEqual(index.version, '1.1');
    assert.ok(index.shards.length > 0);
  });

  it('shard_index contains nfr_profile', async () => {
    const indexPath = path.join(WORKDIR, '1_input', 'shard_index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    assert.ok(typeof index.nfr_profile === 'object');
    assert.ok(index.nfr_profile.detectedCategories.length > 0);
  });

  it('shard_index contains cross_references', async () => {
    const indexPath = path.join(WORKDIR, '1_input', 'shard_index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    assert.ok(Array.isArray(index.cross_references));
  });

  it('rejects missing --src', async () => {
    const { main } = await import('../commands/manifest.js');
    const result = await main([]);
    assert.strictEqual(result.status, 'error');
  });
});
