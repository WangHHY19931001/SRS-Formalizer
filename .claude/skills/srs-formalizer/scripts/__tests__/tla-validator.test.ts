import { describe, it, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { validateTla } from '../lib/tla-validator.js';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'srs-tla-validator-'));
const valid = `---- MODULE Counter ----
EXTENDS Naturals
VARIABLE x
Init == x = 0
Next == IF x < 1 THEN x' = x + 1 ELSE x' = x
Spec == Init /\\ [][Next]_x
TypeOK == x \\in 0..1
====
`;
const cfg = 'SPECIFICATION Spec\nINVARIANT TypeOK\n';

after(() => fs.rmSync(ROOT, { recursive: true, force: true }));

function files(name: string, source = valid, config = cfg): [string, string] {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(dir, { recursive: true });
  const tla = path.join(dir, 'Counter.tla');
  const tlaCfg = path.join(dir, 'Counter.cfg');
  fs.writeFileSync(tla, source, 'utf8');
  fs.writeFileSync(tlaCfg, config, 'utf8');
  return [tla, tlaCfg];
}

describe('bundled TLA validator', () => {
  it('runs SANY and TLC using only the bundled JAR', () => {
    const [tla, tlaCfg] = files('valid');
    const result = validateTla(tla, tlaCfg);
    assert.equal(result.passed, true, result.tlc.output);
    assert.equal(result.sany.passed, true);
    assert.equal(result.tlc.passed, true, result.tlc.output);
    assert.match(result.jarPath, /tla2tools-1\.7\.4\.jar$/);
  });

  it('rejects a SANY syntax error without running TLC', () => {
    const [tla, tlaCfg] = files('syntax', '---- MODULE Counter ----\nEXTENDS Naturals\nVARIABLE x\nInit ==\n====\n');
    const result = validateTla(tla, tlaCfg);
    assert.equal(result.passed, false);
    assert.equal(result.sany.passed, false);
    assert.equal(result.tlc.durationMs, 0);
  });

  it('rejects a TLC invariant violation', () => {
    const [tla, tlaCfg] = files('invariant', valid, 'INIT Init\nNEXT Next\nINVARIANT Bad\n');
    fs.appendFileSync(tla, 'Bad == x = 0\n', 'utf8');
    const result = validateTla(tla, tlaCfg);
    assert.equal(result.passed, false);
    assert.equal(result.sany.passed, true);
    assert.equal(result.tlc.passed, false);
  });

  it('requires an existing cfg and never creates one', () => {
    const [tla, tlaCfg] = files('missing-cfg');
    fs.rmSync(tlaCfg);
    assert.throws(() => validateTla(tla, tlaCfg), /configuration not found/);
    assert.equal(fs.existsSync(tlaCfg), false);
  });
});
