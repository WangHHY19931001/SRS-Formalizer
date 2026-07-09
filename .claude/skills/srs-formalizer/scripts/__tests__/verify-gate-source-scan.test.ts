import { describe, it, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  scanLeanSourceForPlaceholders,
  stripLeanComments,
  scanTlaSourceForPlaceholders,
  stripTlaCode,
} from '../lib/verify-gate/shared.js';

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

function mkSpecs(name: string, files: Record<string, string>): string {
  const dir = path.join(TMP, name, '5_formal', 'specs');
  fs.mkdirSync(dir, { recursive: true });
  for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), c, 'utf-8');
  return dir;
}

describe('scanTlaSourceForPlaceholders', () => {
  it('detects TODO in a line comment', () => {
    const dir = mkSpecs('tla-todo', { 'A.tla': 'VARIABLE x\n\\* TODO: strengthen invariant\nInit == x = 0\n' });
    const hits = scanTlaSourceForPlaceholders(dir);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.marker, 'TODO');
    assert.equal(hits[0]?.file, 'A.tla');
  });

  it('detects CJK marker 待定 in a comment', () => {
    const dir = mkSpecs('tla-cjk', { 'B.tla': '\\* 状态转换待定\nInit == TRUE\n' });
    const hits = scanTlaSourceForPlaceholders(dir);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.marker, '待定');
  });

  it('ignores GAP as a code identifier (not in a comment)', () => {
    const dir = mkSpecs('tla-code', { 'C.tla': 'CONSTANT GAP\nInit == x = GAP\n' });
    assert.deepEqual(scanTlaSourceForPlaceholders(dir), []);
  });

  it('ignores lowercase "gap" in a prose comment (case-sensitive)', () => {
    const dir = mkSpecs('tla-prose', { 'D.tla': '\\* mind the gap between states\nInit == TRUE\n' });
    assert.deepEqual(scanTlaSourceForPlaceholders(dir), []);
  });

  it('returns [] when specs dir missing', () => {
    assert.deepEqual(scanTlaSourceForPlaceholders(path.join(TMP, 'nope', 'specs')), []);
  });

  it('stripTlaCode keeps block comment text and drops code', () => {
    const out = stripTlaCode('Init == x = 0 (* TODO fix *)\nNext == TRUE');
    assert.equal(out.includes('TODO'), true);
    assert.equal(out.includes('Next'), false);
  });

  it('detects FIXME in a block comment', () => {
    const dir = mkSpecs('tla-block', { 'E.tla': '(* FIXME: block comment marker *)\nInit == TRUE\n' });
    const hits = scanTlaSourceForPlaceholders(dir);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.marker, 'FIXME');
  });

  it('reports each distinct ASCII marker in a file', () => {
    const dir = mkSpecs('tla-multi', { 'F.tla': '\\* TODO: a\n\\* GAP: b\nInit == TRUE\n' });
    const markers = scanTlaSourceForPlaceholders(dir).map(h => h.marker).sort();
    assert.deepEqual(markers, ['GAP', 'TODO']);
  });
});
