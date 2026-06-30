import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
const TMP = path.join(os.tmpdir(), `srs-formalizer-validate-cypher-test-${Date.now()}`);
describe('validate-cypher command', () => {
    before(() => {
        fs.mkdirSync(TMP, { recursive: true });
    });
    after(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });
    function writeCypher(fileName, content) {
        const filePath = path.join(TMP, fileName);
        fs.writeFileSync(filePath, content, 'utf-8');
        return filePath;
    }
    // ---------------------------------------------------------------------------
    // Test 1: valid Cypher passes
    // ---------------------------------------------------------------------------
    it('validates correct Cypher script as valid', async () => {
        const fp = writeCypher('valid.cypher', [
            'CREATE CONSTRAINT unique_requirement_id IF NOT EXISTS',
            'FOR (r:Requirement) REQUIRE r.id IS UNIQUE;',
            '',
            'CREATE (r1:Requirement {id: "R1-REQ-0001", statement: "用户登录"});',
            'CREATE (r2:Requirement {id: "R1-REQ-0002", statement: "用户注册"});',
        ].join('\n'));
        const { main } = await import('../commands/validate-cypher.js');
        const result = await main(['--file', fp]);
        assert.equal(result.status, 'ok');
        assert.equal(result.data.valid, true);
        assert.equal(result.data.errors.length, 0);
    });
    // ---------------------------------------------------------------------------
    // Test 2: empty file is rejected
    // ---------------------------------------------------------------------------
    it('rejects empty file', async () => {
        const fp = writeCypher('empty.cypher', '');
        const { main } = await import('../commands/validate-cypher.js');
        const result = await main(['--file', fp]);
        assert.equal(result.status, 'ok');
        assert.equal(result.data.valid, false);
        assert.ok(result.data.errors.some((e) => e.includes('empty')));
    });
    // ---------------------------------------------------------------------------
    // Test 3: file with only whitespace is rejected
    // ---------------------------------------------------------------------------
    it('rejects whitespace-only file', async () => {
        const fp = writeCypher('whitespace.cypher', '   \n  \n  \n');
        const { main } = await import('../commands/validate-cypher.js');
        const result = await main(['--file', fp]);
        assert.equal(result.status, 'ok');
        assert.equal(result.data.valid, false);
        assert.ok(result.data.errors.some((e) => e.includes('empty')));
    });
    // ---------------------------------------------------------------------------
    // Test 4: file without CREATE/MATCH is rejected
    // ---------------------------------------------------------------------------
    it('rejects file without CREATE or MATCH statement', async () => {
        const fp = writeCypher('no-create.cypher', [
            '// This is a comment',
            'RETURN 1 AS result;',
        ].join('\n'));
        const { main } = await import('../commands/validate-cypher.js');
        const result = await main(['--file', fp]);
        assert.equal(result.status, 'ok');
        assert.equal(result.data.valid, false);
        const errors = result.data.errors;
        assert.ok(errors.some((e) => e.includes('CREATE') || e.includes('MATCH')));
    });
    // ---------------------------------------------------------------------------
    // Test 5: syntax error - missing semicolon
    // ---------------------------------------------------------------------------
    it('detects missing semicolon on CREATE/MATCH line', async () => {
        const fp = writeCypher('no-semicolon.cypher', [
            'CREATE (n:Test {id: "test"})',
        ].join('\n'));
        const { main } = await import('../commands/validate-cypher.js');
        const result = await main(['--file', fp]);
        assert.equal(result.status, 'ok');
        assert.equal(result.data.valid, false);
        const errors = result.data.errors;
        assert.ok(errors.some((e) => e.includes(';')));
    });
    // ---------------------------------------------------------------------------
    // Test 6: syntax error - unclosed quotes
    // ---------------------------------------------------------------------------
    it('detects unclosed single quote', async () => {
        const fp = writeCypher('unclosed-quote.cypher', [
            "CREATE (n:Test {id: 'unclosed});",
        ].join('\n'));
        const { main } = await import('../commands/validate-cypher.js');
        const result = await main(['--file', fp]);
        assert.equal(result.status, 'ok');
        assert.equal(result.data.valid, false);
        const errors = result.data.errors;
        assert.ok(errors.some((e) => e.includes('quote')));
    });
    // ---------------------------------------------------------------------------
    // Test 7: syntax error - mismatched parentheses
    // ---------------------------------------------------------------------------
    it('detects mismatched parentheses', async () => {
        const fp = writeCypher('bad-parens.cypher', [
            'CREATE (n:Test {id: "test"});',
            'MATCH (n:Test WHERE n.id = "test";',
        ].join('\n'));
        const { main } = await import('../commands/validate-cypher.js');
        const result = await main(['--file', fp]);
        assert.equal(result.status, 'ok');
        assert.equal(result.data.valid, false);
        const errors = result.data.errors;
        assert.ok(errors.some((e) => e.includes('bracket') || e.includes('opening')));
    });
    // ---------------------------------------------------------------------------
    // Test 8: returns error for missing --file argument
    // ---------------------------------------------------------------------------
    it('returns error for missing --file argument', async () => {
        const { main } = await import('../commands/validate-cypher.js');
        const result = await main([]);
        assert.equal(result.status, 'error');
        assert.ok(result.message.includes('--file'));
    });
    // ---------------------------------------------------------------------------
    // Test 9: returns error for non-existent file
    // ---------------------------------------------------------------------------
    it('returns error for non-existent file', async () => {
        const { main } = await import('../commands/validate-cypher.js');
        const result = await main(['--file', '/tmp/nonexistent.cypher']);
        assert.equal(result.status, 'error');
        assert.ok(result.message.includes('not found'));
    });
});
//# sourceMappingURL=validate-cypher.test.js.map