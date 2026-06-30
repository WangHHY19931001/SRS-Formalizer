import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import * as path from 'node:path';
const SCRIPTS_DIR = path.resolve(import.meta.dirname, '..');
function runCli(args) {
    try {
        const stdout = execSync(`npx tsx index.ts ${args}`, {
            cwd: SCRIPTS_DIR,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return { stdout: stdout.trim(), stderr: '', exitCode: 0 };
    }
    catch (err) {
        return {
            stdout: err.stdout?.trim() || '',
            stderr: err.stderr?.trim() || '',
            exitCode: err.status || 1,
        };
    }
}
describe('CLI entry (index.ts)', () => {
    it('prints usage on --help', () => {
        const { stdout } = runCli('--help');
        assert.ok(stdout.includes('Usage') || stdout.includes('init'));
    });
    it('prints usage on no args', () => {
        const { stdout } = runCli('');
        assert.ok(stdout.includes('Usage') || stdout.includes('init'));
    });
    it('errors on unknown command', () => {
        const { exitCode } = runCli('unknown_command');
        assert.ok(exitCode !== 0);
    });
});
//# sourceMappingURL=index.test.js.map