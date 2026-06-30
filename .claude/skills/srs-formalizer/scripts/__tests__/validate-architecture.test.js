import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
const TMP = path.join(os.tmpdir(), `srs-formalizer-validate-arch-test-${Date.now()}`);
const WORKDIR = path.join(TMP, '.srs_formalizer');
describe('validate-architecture command', () => {
    before(() => {
        fs.mkdirSync(WORKDIR, { recursive: true });
    });
    after(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });
    function writeJsonl(fileName, lines) {
        const filePath = path.join(WORKDIR, fileName);
        fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
        return filePath;
    }
    // ---------------------------------------------------------------------------
    // Test 1: valid arch-1 record passes
    // ---------------------------------------------------------------------------
    it('validates correct arch-1 record as valid', async () => {
        const fp = writeJsonl('valid-arch1.jsonl', [
            JSON.stringify({
                id: 'ARCH-S001-0001',
                type: 'module',
                name: '用户管理',
                parent: null,
                contains: ['R1-REQ-0001', 'R1-REQ-0002'],
                reasoning: '用户管理模块包含登录和注册功能',
            }),
        ]);
        const { main } = await import('../commands/validate-architecture.js');
        const result = await main(['--file', fp, '--workdir', WORKDIR]);
        assert.equal(result.status, 'ok');
        assert.equal(result.data.valid, true);
        assert.equal(result.data.record_count, 1);
        assert.equal(result.data.errors.length, 0);
    });
    // ---------------------------------------------------------------------------
    // Test 2: invalid type is rejected
    // ---------------------------------------------------------------------------
    it('rejects arch-1 record with invalid type', async () => {
        const fp = writeJsonl('bad-type.jsonl', [
            JSON.stringify({
                id: 'ARCH-S001-0002',
                type: 'invalid_type',
                name: '坏模块',
                parent: null,
                contains: [],
                reasoning: 'This record has an invalid type field',
            }),
        ]);
        const { main } = await import('../commands/validate-architecture.js');
        const result = await main(['--file', fp, '--workdir', WORKDIR]);
        assert.equal(result.status, 'ok');
        assert.equal(result.data.valid, false);
        const errors = result.data.errors;
        assert.ok(errors.some((e) => e.includes('type')));
    });
    // ---------------------------------------------------------------------------
    // Test 3: cycle detection (module contains itself indirectly)
    // ---------------------------------------------------------------------------
    it('detects cycle in CONTAINS relationships', async () => {
        const fp = writeJsonl('cycle.jsonl', [
            JSON.stringify({
                id: 'ARCH-S001-0010',
                type: 'module',
                name: '模块A',
                parent: null,
                contains: ['ARCH-S001-0011'],
                reasoning: '模块A包含模块B',
            }),
            JSON.stringify({
                id: 'ARCH-S001-0011',
                type: 'module',
                name: '模块B',
                parent: null,
                contains: ['ARCH-S001-0010'],
                reasoning: '模块B包含模块A，形成循环',
            }),
        ]);
        const { main } = await import('../commands/validate-architecture.js');
        const result = await main(['--file', fp, '--workdir', WORKDIR]);
        assert.equal(result.status, 'ok');
        assert.equal(result.data.valid, false);
        const errors = result.data.errors;
        assert.ok(errors.some((e) => e.includes('cycle')));
    });
    // ---------------------------------------------------------------------------
    // Test 4: parent reference to non-existent module name
    // ---------------------------------------------------------------------------
    it('rejects parent reference to non-existent module name', async () => {
        const fp = writeJsonl('bad-parent.jsonl', [
            JSON.stringify({
                id: 'ARCH-S001-0020',
                type: 'module',
                name: '子模块',
                parent: '不存在的模块',
                contains: [],
                reasoning: 'This module references a parent that does not exist',
            }),
        ]);
        const { main } = await import('../commands/validate-architecture.js');
        const result = await main(['--file', fp, '--workdir', WORKDIR]);
        assert.equal(result.status, 'ok');
        assert.equal(result.data.valid, false);
        const errors = result.data.errors;
        assert.ok(errors.some((e) => e.includes('parent') && e.includes('not found')));
    });
    // ---------------------------------------------------------------------------
    // Test 5: contains reference with invalid R1 id format
    // ---------------------------------------------------------------------------
    it('rejects contains reference with invalid R1 id format', async () => {
        const fp = writeJsonl('bad-contains.jsonl', [
            JSON.stringify({
                id: 'ARCH-S001-0030',
                type: 'module',
                name: '模块',
                parent: null,
                contains: ['invalid-id-format'],
                reasoning: 'This module contains an invalid requirement reference',
            }),
        ]);
        const { main } = await import('../commands/validate-architecture.js');
        const result = await main(['--file', fp, '--workdir', WORKDIR]);
        assert.equal(result.status, 'ok');
        assert.equal(result.data.valid, false);
        const errors = result.data.errors;
        assert.ok(errors.some((e) => e.includes('contains') && e.includes('format')));
    });
    // ---------------------------------------------------------------------------
    // Test 6: path security rejection
    // ---------------------------------------------------------------------------
    it('rejects file path outside .srs_formalizer', async () => {
        const { main } = await import('../commands/validate-architecture.js');
        const result = await main(['--file', '/tmp/outside.jsonl', '--workdir', WORKDIR]);
        assert.equal(result.status, 'error');
    });
    // ---------------------------------------------------------------------------
    // Test 7: arch-2 record with valid action passes
    // ---------------------------------------------------------------------------
    it('validates correct arch-2 record as valid', async () => {
        const fp = writeJsonl('valid-arch2.jsonl', [
            JSON.stringify({
                id: 'ARCH2-S002-0001',
                action: 'add_module',
                name: '加密模块',
                parent: null,
                contains: [],
                reasoning: '添加加密模块以支持数据加密功能',
            }),
        ]);
        const { main } = await import('../commands/validate-architecture.js');
        const result = await main(['--file', fp, '--workdir', WORKDIR]);
        assert.equal(result.status, 'ok');
        assert.equal(result.data.valid, true);
        assert.equal(result.data.record_count, 1);
    });
    // ---------------------------------------------------------------------------
    // Test 8: arch-3 record with valid action passes
    // ---------------------------------------------------------------------------
    it('validates correct arch-3 record as valid', async () => {
        const fp = writeJsonl('valid-arch3.jsonl', [
            JSON.stringify({
                id: 'ARCH3-S003-0001',
                action: 'add_dependency_layer',
                target: '模块A',
                detail: '添加依赖层以解耦模块A',
                reasoning: '需要添加依赖层来管理模块间的依赖关系',
            }),
        ]);
        const { main } = await import('../commands/validate-architecture.js');
        const result = await main(['--file', fp, '--workdir', WORKDIR]);
        assert.equal(result.status, 'ok');
        assert.equal(result.data.valid, true);
        assert.equal(result.data.record_count, 1);
    });
    // ---------------------------------------------------------------------------
    // Test 9: rejects record with short reasoning
    // ---------------------------------------------------------------------------
    it('rejects record with reasoning shorter than 10 characters', async () => {
        const fp = writeJsonl('short-reasoning.jsonl', [
            JSON.stringify({
                id: 'ARCH-S001-0040',
                type: 'module',
                name: '模块',
                parent: null,
                contains: [],
                reasoning: '太短',
            }),
        ]);
        const { main } = await import('../commands/validate-architecture.js');
        const result = await main(['--file', fp, '--workdir', WORKDIR]);
        assert.equal(result.status, 'ok');
        assert.equal(result.data.valid, false);
        const errors = result.data.errors;
        assert.ok(errors.some((e) => e.includes('reasoning')));
    });
    // ---------------------------------------------------------------------------
    // Test 10: rejects missing --file argument
    // ---------------------------------------------------------------------------
    it('handles missing --file argument', async () => {
        const { main } = await import('../commands/validate-architecture.js');
        const result = await main(['--workdir', WORKDIR]);
        assert.equal(result.status, 'error');
    });
    // ---------------------------------------------------------------------------
    // Test 11: returns structured JSON with errors/warnings/record_count
    // ---------------------------------------------------------------------------
    it('returns structured result with errors/warnings/record_count', async () => {
        const fp = writeJsonl('structured.jsonl', [
            JSON.stringify({
                id: 'ARCH-S001-0050',
                type: 'actor',
                name: '管理员',
                parent: null,
                contains: [],
                reasoning: '系统管理员具有最高权限可以管理所有用户',
            }),
        ]);
        const { main } = await import('../commands/validate-architecture.js');
        const result = await main(['--file', fp, '--workdir', WORKDIR]);
        assert.equal(result.status, 'ok');
        assert.equal(typeof result.data.valid, 'boolean');
        assert.ok(Array.isArray(result.data.errors));
        assert.ok(Array.isArray(result.data.warnings));
        assert.equal(result.data.record_count, 1);
    });
});
//# sourceMappingURL=validate-architecture.test.js.map