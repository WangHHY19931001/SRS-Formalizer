import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TMP = path.join(os.tmpdir(), `srs-cf-test-${Date.now()}`);

const SAMPLE_TRACE = `State 1:
x = 0 /\\ y = 0

State 2:
x = 5 /\\ y = 0

State 3: <Invariant TypeOK violated>
x = 11 /\\ y = 0
`;

describe('generate-counterexample-fixtures', () => {
  before(() => {
    fs.mkdirSync(path.join(TMP, '.srs_formalizer'), { recursive: true });
    fs.writeFileSync(path.join(TMP, 'sample.trace'), SAMPLE_TRACE);
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  function workdir(): string {
    return path.join(TMP, '.srs_formalizer');
  }

  async function runMain(args: string[]) {
    const { main } = await import('../commands/generate-counterexample-fixtures.js');
    return main(args);
  }

  it('returns error when --trace not found', async () => {
    const result = await runMain(['--trace', '/nonexistent.trace', '--framework', 'pytest', '--workdir', workdir()]);
    assert.equal(result.status, 'error');
  });

  it('generates pytest fixture from trace', async () => {
    const result = await runMain(['--trace', path.join(TMP, 'sample.trace'), '--framework', 'pytest', '--workdir', workdir()]);
    assert.equal(result.status, 'ok');
    const data = (result as { status: 'ok'; data: unknown }).data as Record<string, unknown>;
    assert.ok((data.files_created as number) > 0);

    const fixturePath = path.join(workdir(), 'test_fixtures', 'counterexample', 'pytest', 'test_counterexample_typeok.py');
    assert.ok(fs.existsSync(fixturePath));
    const content = fs.readFileSync(fixturePath, 'utf-8');
    assert.ok(content.includes('TypeOK'));
    assert.ok(content.includes('test_counterexample_typeok'));
    assert.ok(content.includes('LLM_FILL'));
  });

  it('generates junit fixture from trace', async () => {
    const result = await runMain(['--trace', path.join(TMP, 'sample.trace'), '--framework', 'junit', '--workdir', workdir()]);
    assert.equal(result.status, 'ok');
    const fixturePath = path.join(workdir(), 'test_fixtures', 'counterexample', 'junit', 'CounterexampleTypeOKTest.java');
    assert.ok(fs.existsSync(fixturePath));
  });

  it('generates fast-check fixture from trace', async () => {
    const result = await runMain(['--trace', path.join(TMP, 'sample.trace'), '--framework', 'fast-check', '--workdir', workdir()]);
    assert.equal(result.status, 'ok');
    const fixturePath = path.join(workdir(), 'test_fixtures', 'counterexample', 'fast-check', 'counterexample_typeok.test.ts');
    assert.ok(fs.existsSync(fixturePath));
  });

  it('rejects invalid framework', async () => {
    const result = await runMain(['--trace', path.join(TMP, 'sample.trace'), '--framework', 'cucumber', '--workdir', workdir()]);
    assert.equal(result.status, 'error');
  });

  it('returns error on missing --trace', async () => {
    const result = await runMain(['--framework', 'pytest', '--workdir', workdir()]);
    assert.equal(result.status, 'error');
  });
});
