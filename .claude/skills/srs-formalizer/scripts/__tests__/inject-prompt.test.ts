import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TMP = path.join(os.tmpdir(), `srs-formalizer-inject-test-${Date.now()}`);

describe('inject-prompt command', () => {
  before(() => {
    fs.mkdirSync(TMP, { recursive: true });
    const templateDir = path.join(TMP, 'prompts');
    fs.mkdirSync(templateDir, { recursive: true });
    fs.writeFileSync(
      path.join(templateDir, 'test-template.md'),
      'Shard: {{SHARD_ID}}\nContent:\n{{SHARD_CONTENT}}\nLang: {{LANG}}',
      'utf-8'
    );
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('replaces all {{PARAM}} placeholders', async () => {
    const { main } = await import('../commands/inject-prompt.js');
    const result = await main([
      '--template', path.join(TMP, 'prompts', 'test-template.md'),
      '--params', JSON.stringify({ SHARD_ID: 'S001', SHARD_CONTENT: 'hello world', LANG: 'zh' }),
    ]);
    assert.equal(result.status, 'ok');
    const output = result.data as string;
    assert.ok(output.includes('Shard: S001'));
    assert.ok(output.includes('hello world'));
    assert.ok(output.includes('Lang: zh'));
    assert.ok(!output.includes('{{SHARD_ID}}'));
  });

  it('escapes user {{ and }} in param values to prevent injection', async () => {
    const { main } = await import('../commands/inject-prompt.js');
    const result = await main([
      '--template', path.join(TMP, 'prompts', 'test-template.md'),
      '--params', JSON.stringify({ SHARD_ID: 'S001', SHARD_CONTENT: '{{evil}}', LANG: 'zh' }),
    ]);
    assert.equal(result.status, 'ok');
    const output = result.data as string;
    assert.ok(output.includes('{{evil}}'));
  });

  it('rejects template path outside prompts/ directory', async () => {
    const { main } = await import('../commands/inject-prompt.js');
    const result = await main(['--template', '/etc/passwd', '--params', '{}']);
    assert.equal(result.status, 'error');
  });

  it('handles missing --template argument', async () => {
    const { main } = await import('../commands/inject-prompt.js');
    const result = await main(['--params', '{}']);
    assert.equal(result.status, 'error');
  });

  it('handles missing --params argument', async () => {
    const { main } = await import('../commands/inject-prompt.js');
    const result = await main(['--template', path.join(TMP, 'prompts', 'test-template.md')]);
    assert.equal(result.status, 'error');
  });

  it('handles invalid JSON in --params', async () => {
    const { main } = await import('../commands/inject-prompt.js');
    const result = await main([
      '--template', path.join(TMP, 'prompts', 'test-template.md'),
      '--params', '{not valid json',
    ]);
    assert.equal(result.status, 'error');
  });
});
