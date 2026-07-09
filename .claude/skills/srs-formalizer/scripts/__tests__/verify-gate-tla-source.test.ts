import { describe, it, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { checkTlaGraphExists } from '../lib/verify-gate/checks-final.js';

const TMP = path.join(os.tmpdir(), `srs-tla-src-${Date.now()}`);

function setup(name: string, tlaContent: string): string {
  const wd = path.join(TMP, name, '.srs_formalizer');
  fs.mkdirSync(path.join(wd, '5_formal', 'specs'), { recursive: true });
  fs.mkdirSync(path.join(wd, '6_outputs', 'knowledge_graph'), { recursive: true });
  fs.writeFileSync(path.join(wd, '5_formal', 'specs', 'S.tla'), tlaContent, 'utf-8');
  // stale but present artifacts — the bug is that these alone made it pass
  fs.writeFileSync(path.join(wd, '5_formal', 'tla-interaction-graph.json'),
    '{"nodes":[],"edges":[],"metadata":{}}', 'utf-8');
  fs.writeFileSync(path.join(wd, '6_outputs', 'knowledge_graph', 'tla-interaction.cypher'), '// x', 'utf-8');
  return wd;
}

describe('checkTlaGraphExists re-scans source', () => {
  after(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it('FAILS when a .tla has TODO despite stale graph.json present', () => {
    const wd = setup('todo', 'VARIABLE x\n\\* TODO: finish\nInit == x = 0\n');
    const r = checkTlaGraphExists(wd);
    assert.equal(r.passed, false);
    assert.match(r.detail ?? '', /TODO/);
  });

  it('PASSES when .tla is clean and artifacts present', () => {
    const wd = setup('clean', 'VARIABLE x\nInit == x = 0\nNext == x\' = x + 1\n');
    const r = checkTlaGraphExists(wd);
    assert.equal(r.passed, true);
  });
});
