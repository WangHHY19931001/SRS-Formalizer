import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TMP = path.join(os.tmpdir(), `srs-formalizer-inject-test-${Date.now()}`);
const WORKDIR = path.join(TMP, '.srs_formalizer');
const TEMPLATE_PATH = path.join(TMP, 'prompts', 'test-template.md');

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

  it('auto-resolves SHARD_CONTENT when --shard-id is provided', async () => {
    const { main } = await import('../commands/inject-prompt.js');
    // Setup: create a minimal SRS file + shard_index.json
    const srcFile = path.join(TMP, 'test-srs.md');
    fs.writeFileSync(srcFile, 'line 1\nline 2\nline 3\nline 4\nline 5\n', 'utf-8');

    const ctxDir = path.join(WORKDIR, '_ctx');
    fs.mkdirSync(ctxDir, { recursive: true });
    fs.writeFileSync(path.join(ctxDir, 'shard_index.json'), JSON.stringify({
      version: '1.1',
      source_path: TMP,
      source_hash: 'a'.repeat(64),
      language: 'zh',
      total_chars: 35,
      total_shards: 1,
      shards: [{
        id: 'S001', file: 'S001',
        locator: `${srcFile}-2-4-001`,
        module: 'test', chapter_ref: '# test',
        source_path: srcFile,
        source_start_line: 2,
        source_end_line: 4,
        char_count: 15,
        estimated_tokens: 10,
      }],
      gaps: [],
      warnings: [],
    }), 'utf-8');

    const result = await main([
      '--template', TEMPLATE_PATH,
      '--shard-id', 'S001',
      '--workdir', WORKDIR,
      '--params', '{}',
    ]);

    assert.equal(result.status, 'ok');
    const data = result.data as string;
    assert.ok(data.includes('line 2'), 'Must include line 2 from source file');
    assert.ok(data.includes('line 3'), 'Must include line 3 from source file');
    assert.ok(data.includes('line 4'), 'Must include line 4 from source file');
    assert.ok(!data.includes('line 1'), 'Must NOT include line 1 (outside range)');
    assert.ok(!data.includes('line 5'), 'Must NOT include line 5 (outside range)');
  });

  it('does not override SHARD_CONTENT when already in --params', async () => {
    const { main } = await import('../commands/inject-prompt.js');
    const result = await main([
      '--template', TEMPLATE_PATH,
      '--shard-id', 'S001',
      '--workdir', WORKDIR,
      '--params', '{"SHARD_CONTENT":"manual content"}',
    ]);

    assert.equal(result.status, 'ok');
    const data = result.data as string;
    assert.ok(data.includes('manual content'), 'Must preserve manually provided content');
  });

  it('returns error when shard_index.json does not exist', async () => {
    const { main } = await import('../commands/inject-prompt.js');
    // Must end with .srs_formalizer to pass validateWorkDir, but no 1_input/shard_index.json
    const emptyWorkdir = path.join(TMP, 'empty-test', '.srs_formalizer');
    fs.mkdirSync(emptyWorkdir, { recursive: true });

    const result = await main([
      '--template', TEMPLATE_PATH,
      '--shard-id', 'S001',
      '--workdir', emptyWorkdir,
      '--params', '{}',
    ]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('shard_index.json'));
  });
});
