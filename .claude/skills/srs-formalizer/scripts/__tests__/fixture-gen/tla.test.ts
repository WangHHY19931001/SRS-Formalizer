import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { generateTlaFixtures, parseTlaSpec } from '../../lib/fixture-gen/tla.js';

const SAMPLE_TLA = `---- MODULE TestSpec ----
VARIABLES x, y
CONSTANTS MaxVal, SetS

Init == x = 0 /\\ y = 0
Next == x' = x + 1 /\\ y' = y
TypeOK == x \\in 0..MaxVal /\\ y \\in 0..MaxVal
====
`;

describe('parseTlaSpec', () => {
  it('extracts variables and constants', () => {
    const spec = parseTlaSpec(SAMPLE_TLA);
    assert.deepEqual(spec.variables, ['x', 'y']);
    assert.deepEqual(spec.constants, ['MaxVal', 'SetS']);
    assert.equal(spec.specName, 'TestSpec');
  });

  it('extracts invariants', () => {
    const spec = parseTlaSpec(SAMPLE_TLA);
    assert.ok(spec.invariants.includes('TypeOK'));
  });
});

describe('generateTlaFixtures', () => {
  it('generates pytest invariant tests', () => {
    const files = generateTlaFixtures(SAMPLE_TLA, 'pytest');
    assert.ok(files.length > 0);
    const testFile = files.find(f => f.path.includes('test_'));
    assert.ok(testFile);
    assert.ok(testFile!.content.includes('def test_'));
    assert.ok(testFile!.content.includes('LLM_FILL'));
  });

  it('generates junit invariant tests', () => {
    const files = generateTlaFixtures(SAMPLE_TLA, 'junit');
    const testFile = files.find(f => f.path.includes('Test.java'));
    assert.ok(testFile);
    assert.ok(testFile!.content.includes('@Test'));
  });

  it('generates fast-check properties', () => {
    const files = generateTlaFixtures(SAMPLE_TLA, 'fast-check');
    const propFile = files.find(f => f.path.includes('.property.'));
    assert.ok(propFile);
    assert.ok(propFile!.content.includes('fc.'));
  });
});
