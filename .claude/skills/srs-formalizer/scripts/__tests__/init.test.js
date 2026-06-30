import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
const TMP = path.join(os.tmpdir(), `srs-formalizer-init-test-${Date.now()}`);
const WORKDIR = path.join(TMP, '.srs_formalizer');
describe('init command', () => {
    before(() => {
        fs.mkdirSync(TMP, { recursive: true });
    });
    after(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });
    it('creates .srs_formalizer with all required subdirectories', async () => {
        const { main } = await import('../commands/init.js');
        const result = await main(['--output', WORKDIR]);
        assert.equal(result.status, 'ok');
        const expectedDirs = [
            '1_shard',
            '_ctx',
            '2_extract/r1-explicit', '2_extract/r2-implicit', '2_extract/r3-relational',
            '3_graph/graph',
            '3_graph/analysis/subagent_prompts',
            '4_bdd/features',
            '5_formal/specs', '5_formal/proofs',
            '6_outputs/knowledge_graph', '6_outputs/brainstorming',
            'backups',
        ];
        for (const dir of expectedDirs) {
            const full = path.join(WORKDIR, dir);
            assert.ok(fs.existsSync(full), `Missing dir: ${dir}`);
        }
    });
    it('is idempotent — runs twice successfully', async () => {
        const { main } = await import('../commands/init.js');
        const r1 = await main(['--output', WORKDIR]);
        const r2 = await main(['--output', WORKDIR]);
        assert.equal(r1.status, 'ok');
        assert.equal(r2.status, 'ok');
    });
    it('rejects non-.srs_formalizer output path', async () => {
        const { main } = await import('../commands/init.js');
        const result = await main(['--output', path.join(TMP, 'evil_dir')]);
        assert.equal(result.status, 'error');
        assert.ok(result.message?.includes('.srs_formalizer'));
    });
    it('writes STATE.md with required fields', async () => {
        const { main } = await import('../commands/init.js');
        await main(['--output', WORKDIR]);
        const content = fs.readFileSync(path.join(WORKDIR, 'STATE.md'), 'utf-8');
        for (const field of ['当前阶段', 'S1', '阶段完成度', '决策记录', '阻塞点']) {
            assert.ok(content.includes(field), `STATE.md missing: ${field}`);
        }
    });
    it('handles missing --output argument', async () => {
        const { main } = await import('../commands/init.js');
        const result = await main([]);
        assert.equal(result.status, 'error');
    });
});
//# sourceMappingURL=init.test.js.map