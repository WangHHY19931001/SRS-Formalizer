import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { main } from '../commands/generate-vmodel-matrix.js';

const TMP = path.join(os.tmpdir(), `srs-vm-test-${Date.now()}`);
const WORKDIR = path.join(TMP, '.srs_formalizer');

describe('generate-vmodel-matrix', () => {
  before(() => {
    fs.mkdirSync(path.join(WORKDIR, '2_extract'), { recursive: true });
    fs.mkdirSync(path.join(WORKDIR, '4_bdd', 'features'), { recursive: true });
    fs.mkdirSync(path.join(WORKDIR, 'test_fixtures'), { recursive: true });

    fs.writeFileSync(
      path.join(WORKDIR, '2_extract', 'r1-explicit.jsonl'),
      '{"id":"R1-REQ-0001","statement":"User login"}\n{"id":"R1-REQ-0002","statement":"Logout"}\n',
    );
    fs.writeFileSync(
      path.join(WORKDIR, '4_bdd', 'features', 'login.feature'),
      'Feature: Login\n  Scenario: R1-REQ-0001: valid login\n    Given user exists\n    When login\n    Then access granted\n',
    );
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('outputs markdown by default', async () => {
    const result = await main(['--workdir', WORKDIR]);
    assert.equal(result.status, 'ok');
    const data = (result as { status: 'ok'; data: unknown }).data as Record<string, unknown>;
    assert.ok(typeof (data.matrix_output as string) === 'string');
    assert.ok((data.matrix_output as string).includes('Requirement'));
  });

  it('outputs cypher with --format cypher', async () => {
    const result = await main(['--workdir', WORKDIR, '--format', 'cypher']);
    assert.equal(result.status, 'ok');
    const data = (result as { status: 'ok'; data: unknown }).data as Record<string, unknown>;
    assert.ok((data.matrix_output as string).includes('MERGE'));
  });
});
