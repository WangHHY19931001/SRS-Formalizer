import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TMP = path.join(os.tmpdir(), `srs-formalizer-build-tla-graph-test-${Date.now()}`);

function createWorkDir(name: string): string {
  const workDir = path.join(TMP, name, '.srs_formalizer');
  fs.mkdirSync(path.join(workDir, '5_formal', 'specs'), { recursive: true });
  return workDir;
}

function writeTla(workDir: string, fileName: string, content: string): void {
  fs.writeFileSync(path.join(workDir, '5_formal', 'specs', fileName), content, 'utf-8');
}

const MINIMAL_TLA = `---- MODULE TestSpec ----
VARIABLE x
Init == x = 0
Next == x' = x + 1
Invariant == x >= 0
====
`;

describe('build-tla-graph command', () => {
  before(() => {
    fs.mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('builds TLA interaction graph from a valid .tla file', async () => {
    const workDir = createWorkDir('valid');
    writeTla(workDir, 'TestSpec.tla', MINIMAL_TLA);

    const { main } = await import('../commands/build-tla-graph.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.specs, 1);
    assert.ok(typeof data.nodes === 'number');
    assert.ok(typeof data.edges === 'number');

    // Verify output files
    assert.ok(fs.existsSync(path.join(workDir, '5_formal', 'tla-interaction-graph.json')));
    assert.ok(fs.existsSync(path.join(workDir, '6_outputs', 'knowledge_graph', 'tla-interaction.cypher')));
  });

  it('returns error when missing --workdir argument', async () => {
    const { main } = await import('../commands/build-tla-graph.js');
    const result = await main([]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('Missing required argument'));
  });

  it('returns error when specs directory does not exist', async () => {
    const workDir = path.join(TMP, 'no-specs', '.srs_formalizer');
    fs.mkdirSync(path.dirname(workDir), { recursive: true });

    const { main } = await import('../commands/build-tla-graph.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('Specs directory not found'));
  });

  it('returns error when no .tla files found', async () => {
    const workDir = createWorkDir('empty-specs');

    const { main } = await import('../commands/build-tla-graph.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('No .tla files found'));
  });

  it('rejects non-.srs_formalizer workdir', async () => {
    const badDir = path.join(TMP, 'bad_workdir');
    fs.mkdirSync(badDir, { recursive: true });

    const { main } = await import('../commands/build-tla-graph.js');
    const result = await main(['--workdir', badDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('.srs_formalizer'));
  });

  it('returns error when a .tla contains a TODO marker in a comment', async () => {
    const workDir = createWorkDir('marker');
    writeTla(workDir, 'Bad.tla', '---- MODULE Bad ----\nVARIABLE x\n\\* TODO: finish this\nInit == x = 0\n====\n');

    const { main } = await import('../commands/build-tla-graph.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('Forbidden placeholders'));
  });
});
