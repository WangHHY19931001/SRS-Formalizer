import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
const TMP = path.join(os.tmpdir(), `srs-formalizer-jsonl-test-${Date.now()}`);
describe('jsonl lib', () => {
    before(() => {
        fs.mkdirSync(TMP, { recursive: true });
    });
    after(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });
    it('readJsonl parses valid JSONL', async () => {
        const { writeJsonl, readJsonl } = await import('../lib/jsonl.js');
        const records = [
            { id: 'R1-S001-0001', category: 'explicit', statement: 'test1', source_file: 's1.md', confidence: 'high' },
            { id: 'R1-S001-0002', category: 'explicit', statement: 'test2', source_file: 's1.md', confidence: 'medium' },
        ];
        const f = path.join(TMP, 'test.jsonl');
        writeJsonl(f, records, TMP);
        const parsed = readJsonl(f, TMP);
        assert.equal(parsed.length, 2);
        assert.equal(parsed[0].id, 'R1-S001-0001');
    });
    it('readJsonl skips empty lines', async () => {
        const { readJsonl } = await import('../lib/jsonl.js');
        const f = path.join(TMP, 'empty.jsonl');
        fs.writeFileSync(f, '\n\n{"id":"R1-S001-0001","category":"explicit","statement":"x","source_file":"a.md","confidence":"high"}\n\n', 'utf-8');
        const parsed = readJsonl(f, TMP);
        assert.equal(parsed.length, 1);
    });
    it('readJsonl throws on invalid JSON', async () => {
        const { readJsonl } = await import('../lib/jsonl.js');
        const f = path.join(TMP, 'bad.jsonl');
        fs.writeFileSync(f, '{not json}', 'utf-8');
        assert.throws(() => readJsonl(f, TMP), /JSONL parse error/);
    });
    it('writeJsonl creates parent directories', async () => {
        const { writeJsonl } = await import('../lib/jsonl.js');
        const f = path.join(TMP, 'deep/nested/out.jsonl');
        writeJsonl(f, [], TMP);
        assert.ok(fs.existsSync(f));
    });
    it('readJsonl rejects paths outside workdir', async () => {
        const { readJsonl } = await import('../lib/jsonl.js');
        assert.throws(() => readJsonl('/etc/passwd', TMP), /SecurityError/);
    });
});
//# sourceMappingURL=jsonl.test.js.map