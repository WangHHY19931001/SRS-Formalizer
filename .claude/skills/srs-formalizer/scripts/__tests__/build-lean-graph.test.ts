import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TMP = path.join(os.tmpdir(), `srs-formalizer-build-lean-graph-test-${Date.now()}`);

function createWorkDir(name: string): string {
  const workDir = path.join(TMP, name, '.srs_formalizer');
  fs.mkdirSync(path.join(workDir, '5_formal', 'proofs'), { recursive: true });
  return workDir;
}

function writeLean(workDir: string, fileName: string, content: string): void {
  fs.writeFileSync(path.join(workDir, '5_formal', 'proofs', fileName), content, 'utf-8');
}

const VALID_LEAN = `theorem add_comm (a b : Nat) : a + b = b + a := by
  omega
`;

const LEAN_WITH_SORRY = `theorem unsolved_theorem (x : Nat) : x = x := by
  sorry
`;

describe('build-lean-graph command', () => {
  before(() => {
    fs.mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('builds lean proof graph from a valid .lean file', async () => {
    const workDir = createWorkDir('valid');
    writeLean(workDir, 'Test.lean', VALID_LEAN);

    const { main } = await import('../commands/build-lean-graph.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.files, 1);
    assert.ok(typeof data.theorems === 'number');
    assert.ok(typeof data.max_depth === 'number');
    assert.ok(Array.isArray(data.warnings));

    // Verify output files
    assert.ok(fs.existsSync(path.join(workDir, '5_formal', 'lean-proof-graph.json')));
    assert.ok(fs.existsSync(path.join(workDir, '6_outputs', 'knowledge_graph', 'lean-proof.cypher')));
  });

  it('returns error when missing --workdir argument', async () => {
    const { main } = await import('../commands/build-lean-graph.js');
    const result = await main([]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('Missing required argument'));
  });

  it('returns ok with skipped=true when proofs directory does not exist', async () => {
    const workDir = path.join(TMP, 'no-proofs', '.srs_formalizer');
    fs.mkdirSync(path.dirname(workDir), { recursive: true });

    const { main } = await import('../commands/build-lean-graph.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.skipped, true);
  });

  it('returns ok with skipped=true when no .lean files found', async () => {
    const workDir = createWorkDir('empty-proofs');

    const { main } = await import('../commands/build-lean-graph.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.skipped, true);
  });

  it('returns error when "sorry" is found in .lean files', async () => {
    const workDir = createWorkDir('with-sorry');
    writeLean(workDir, 'Unsolved.lean', LEAN_WITH_SORRY);

    const { main } = await import('../commands/build-lean-graph.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('sorry'));
  });

  it('rejects non-.srs_formalizer workdir', async () => {
    const badDir = path.join(TMP, 'bad_workdir');
    fs.mkdirSync(badDir, { recursive: true });

    const { main } = await import('../commands/build-lean-graph.js');
    const result = await main(['--workdir', badDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('.srs_formalizer'));
  });

  it('does NOT error on sorry inside a comment (no false positive)', async () => {
    const workDir = createWorkDir('comment-sorry');
    writeLean(workDir, 'P.lean', 'theorem t : True := trivial -- sorry mentioned\n');

    const { main } = await import('../commands/build-lean-graph.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
  });
});
