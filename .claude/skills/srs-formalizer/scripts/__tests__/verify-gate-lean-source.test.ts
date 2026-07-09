import { describe, it, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { checkLeanGraphExists } from '../lib/verify-gate/checks-final.js';

const TMP = path.join(os.tmpdir(), `srs-lean-src-${Date.now()}`);

function setup(name: string, leanContent: string): string {
  const wd = path.join(TMP, name, '.srs_formalizer');
  fs.mkdirSync(path.join(wd, '5_formal', 'proofs'), { recursive: true });
  fs.mkdirSync(path.join(wd, '6_outputs', 'knowledge_graph'), { recursive: true });
  fs.writeFileSync(path.join(wd, '5_formal', 'proofs', 'P.lean'), leanContent, 'utf-8');
  // stale but present artifacts — the bug is that these alone made it pass
  fs.writeFileSync(path.join(wd, '5_formal', 'lean-proof-graph.json'),
    '{"nodes":[],"edges":[],"metadata":{}}', 'utf-8');
  fs.writeFileSync(path.join(wd, '6_outputs', 'knowledge_graph', 'lean-proof.cypher'), '// x', 'utf-8');
  return wd;
}

describe('checkLeanGraphExists re-scans source', () => {
  after(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it('FAILS when a .lean has sorry despite stale graph.json present', () => {
    const wd = setup('sorry', 'theorem t : True := by\n  sorry\n');
    const r = checkLeanGraphExists(wd);
    assert.equal(r.passed, false);
    assert.match(r.detail ?? '', /sorry/);
  });

  it('FAILS when a .lean has axiom', () => {
    const wd = setup('axiom', 'axiom foo : True\n');
    const r = checkLeanGraphExists(wd);
    assert.equal(r.passed, false);
    assert.match(r.detail ?? '', /axiom/);
  });

  it('PASSES when .lean is clean and artifacts present', () => {
    const wd = setup('clean', 'theorem t : True := trivial\n');
    const r = checkLeanGraphExists(wd);
    assert.equal(r.passed, true);
  });
});
