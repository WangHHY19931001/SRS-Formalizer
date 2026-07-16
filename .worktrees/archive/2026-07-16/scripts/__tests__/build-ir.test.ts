import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

const TMP = '/tmp/srs-formalizer-test-cli-ir';

describe('build-ir CLI', () => {
  before(() => {
    fs.mkdirSync(path.join(TMP, '.srs_formalizer', '2_extract', 'r1-explicit'), { recursive: true });
    fs.mkdirSync(path.join(TMP, '.srs_formalizer', '1_input'), { recursive: true });
    fs.writeFileSync(path.join(TMP, '.srs_formalizer', '2_extract', 'r1-explicit', 'shard-1.jsonl'),
      '{"id":"R1-TEST-0001","category":"explicit","statement":"测试","source_file":"srs.md","confidence":"high"}\n', 'utf-8');
    fs.writeFileSync(path.join(TMP, '.srs_formalizer', '1_input', 'shard_index.json'),
      JSON.stringify({ version: '1.1', cross_references: [], nfr_profile: { detectedCategories: [], weightedShards: [], overallCoverage: 0, blindSpots: ['performance','security','availability','compatibility','maintainability','compliance'] } }, null, 2), 'utf-8');
    fs.writeFileSync(path.join(TMP, '.srs_formalizer', 'STATE.md'), '# STATE\n', 'utf-8');
  });

  after(() => { fs.rmSync(TMP, { recursive: true, force: true }); });

  it('writes srs-ir.json to workdir', async () => {
    const { main } = await import('../commands/build-ir.js');
    const result = await main(['--workdir', path.join(TMP, '.srs_formalizer')]);
    assert.strictEqual(result.status, 'ok');
    const irPath = path.join(TMP, '.srs_formalizer', 'srs-ir.json');
    assert.ok(fs.existsSync(irPath));
    const irData = JSON.parse(fs.readFileSync(irPath, 'utf-8'));
    assert.strictEqual(irData.version, '2.0.0');
    assert.ok(irData.nodes.length >= 1);
  });

  it('rejects missing workdir', async () => {
    const { main } = await import('../commands/build-ir.js');
    const result = await main([]);
    assert.strictEqual(result.status, 'error');
    assert.ok(result.message?.includes('workdir'));
  });
});
