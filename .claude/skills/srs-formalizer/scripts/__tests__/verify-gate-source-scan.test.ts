import { describe, it, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { scanLeanSourceForPlaceholders, stripLeanComments } from '../lib/verify-gate/shared.js';

const TMP = path.join(os.tmpdir(), `srs-scan-test-${Date.now()}`);

function mkProofs(name: string, files: Record<string, string>): string {
  const dir = path.join(TMP, name, '5_formal', 'proofs');
  fs.mkdirSync(dir, { recursive: true });
  for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), c, 'utf-8');
  return dir;
}

describe('scanLeanSourceForPlaceholders', () => {
  after(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it('detects real sorry', () => {
    const dir = mkProofs('real-sorry', { 'A.lean': 'theorem t : True := by\n  sorry\n' });
    const hits = scanLeanSourceForPlaceholders(dir);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.kind, 'sorry');
    assert.equal(hits[0]?.file, 'A.lean');
  });

  it('detects axiom', () => {
    const dir = mkProofs('has-axiom', { 'B.lean': 'axiom foo : True\n' });
    const hits = scanLeanSourceForPlaceholders(dir);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.kind, 'axiom');
  });

  it('ignores sorry inside a line comment (no false positive)', () => {
    const dir = mkProofs('comment', { 'C.lean': 'theorem t : True := trivial -- no sorry here\n' });
    assert.deepEqual(scanLeanSourceForPlaceholders(dir), []);
  });

  it('ignores sorry as a substring of an identifier', () => {
    const dir = mkProofs('ident', { 'D.lean': 'def notsorryish : Nat := 0\n' });
    assert.deepEqual(scanLeanSourceForPlaceholders(dir), []);
  });

  it('returns [] when dir missing', () => {
    assert.deepEqual(scanLeanSourceForPlaceholders(path.join(TMP, 'nope', 'proofs')), []);
  });

  it('stripLeanComments removes block comments', () => {
    assert.equal(stripLeanComments('a /- sorry -/ b').includes('sorry'), false);
  });
});
