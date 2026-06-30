import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
describe('security lib', () => {
    it('isPathSafe returns true for paths inside workdir', async () => {
        const { isPathSafe } = await import('../lib/security.js');
        assert.equal(isPathSafe('/tmp/w/.srs_formalizer/shard', '/tmp/w/.srs_formalizer'), true);
        assert.equal(isPathSafe('/tmp/w/.srs_formalizer', '/tmp/w/.srs_formalizer'), true);
        assert.equal(isPathSafe('/tmp/w/.srs_formalizer/sub/deep', '/tmp/w/.srs_formalizer'), true);
    });
    it('isPathSafe returns false for paths outside workdir', async () => {
        const { isPathSafe } = await import('../lib/security.js');
        assert.equal(isPathSafe('/tmp/w/other', '/tmp/w/.srs_formalizer'), false);
        assert.equal(isPathSafe('/etc/passwd', '/tmp/w/.srs_formalizer'), false);
    });
    it('assertSafePath throws on unsafe paths', async () => {
        const { assertSafePath } = await import('../lib/security.js');
        assert.throws(() => assertSafePath('/etc/passwd', '/tmp/w/.srs_formalizer'), /SecurityError/);
    });
    it('validateWorkDir accepts only .srs_formalizer', async () => {
        const { validateWorkDir } = await import('../lib/security.js');
        const resolved = validateWorkDir('.srs_formalizer');
        assert.ok(resolved.endsWith('.srs_formalizer'));
        assert.throws(() => validateWorkDir('other_dir'), /must be "\.srs_formalizer"/);
    });
});
//# sourceMappingURL=security.test.js.map