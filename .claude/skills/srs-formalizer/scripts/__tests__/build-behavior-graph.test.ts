import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TMP = path.join(os.tmpdir(), `srs-formalizer-build-behavior-graph-test-${Date.now()}`);

function createWorkDir(name: string): string {
  const workDir = path.join(TMP, name, '.srs_formalizer');
  fs.mkdirSync(path.join(workDir, '4_bdd', 'features'), { recursive: true });
  return workDir;
}

function writeFeature(workDir: string, fileName: string, content: string): void {
  fs.writeFileSync(path.join(workDir, '4_bdd', 'features', fileName), content, 'utf-8');
}

const VALID_FEATURE = `Feature: Login
  Scenario: Successful login
    Given the user is on the login page
    When the user enters valid credentials
    Then the user is redirected to dashboard
`;

describe('build-behavior-graph command', () => {
  before(() => {
    fs.mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('builds behavior graph from a valid .feature file', async () => {
    const workDir = createWorkDir('valid');
    writeFeature(workDir, 'login.feature', VALID_FEATURE);

    const { main } = await import('../commands/build-behavior-graph.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.features, 1);
    assert.equal(data.scenarios, 1);
    assert.ok(typeof data.nodes === 'number');
    assert.ok(typeof data.edges === 'number');
    assert.ok(typeof data.graph_path === 'string');

    // Verify output files
    assert.ok(fs.existsSync(path.join(workDir, '4_bdd', 'behavior-graph.json')));
    assert.ok(fs.existsSync(path.join(workDir, '6_outputs', 'knowledge_graph', 'behavior.cypher')));
  });

  it('returns error when missing --workdir argument', async () => {
    const { main } = await import('../commands/build-behavior-graph.js');
    const result = await main([]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('Missing required argument'));
  });

  it('returns error when features directory does not exist', async () => {
    const workDir = path.join(TMP, 'no-features-dir', '.srs_formalizer');
    fs.mkdirSync(path.dirname(workDir), { recursive: true });
    // Create workdir root but skip 4_bdd/features/

    const { main } = await import('../commands/build-behavior-graph.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('Features directory not found'));
  });

  it('returns error when no .feature files exist', async () => {
    const workDir = createWorkDir('empty-features');

    const { main } = await import('../commands/build-behavior-graph.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('No .feature files found'));
  });

  it('returns error when unresolved <THEN_PLACEHOLDER> found', async () => {
    const workDir = createWorkDir('placeholder');
    writeFeature(workDir, 'incomplete.feature',
      'Feature: Incomplete\n  Scenario: WIP\n    Given a precondition\n    <THEN_PLACEHOLDER>\n');

    const { main } = await import('../commands/build-behavior-graph.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('<THEN_PLACEHOLDER>'));
  });

  it('rejects non-.srs_formalizer workdir', async () => {
    const badDir = path.join(TMP, 'bad_workdir');
    fs.mkdirSync(badDir, { recursive: true });

    const { main } = await import('../commands/build-behavior-graph.js');
    const result = await main(['--workdir', badDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('.srs_formalizer'));
  });
});
