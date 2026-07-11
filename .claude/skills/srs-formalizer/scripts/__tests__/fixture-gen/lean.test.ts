import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { generateLeanFixtures, parseLeanFile } from '../../lib/fixture-gen/lean.js';

const SAMPLE_LEAN = `import Mathlib

theorem add_zero (n : Nat) : n + 0 = n := by
  simp

theorem mul_one (n : Nat) : n * 1 = n := by
  ring
`;

describe('parseLeanFile', () => {
  it('extracts theorem names and type signatures', () => {
    const theorems = parseLeanFile(SAMPLE_LEAN);
    assert.equal(theorems.length, 2);
    assert.equal(theorems[0]?.name, 'add_zero');
    assert.ok(theorems[0]?.typeSignature.includes('Nat'));
    assert.equal(theorems[1]?.name, 'mul_one');
  });

  it('extracts imports', () => {
    const theorems = parseLeanFile(SAMPLE_LEAN);
    assert.ok(theorems[0]?.imports.includes('Mathlib'));
  });
});

describe('generateLeanFixtures', () => {
  it('generates pytest property tests', () => {
    const files = generateLeanFixtures(SAMPLE_LEAN, 'pytest');
    assert.ok(files.length > 0);
    const testFile = files.find(f => f.path.includes('test_'));
    assert.ok(testFile);
    assert.ok(testFile!.content.includes('def test_'));
    assert.ok(testFile!.content.includes('LLM_FILL'));
  });

  it('generates fast-check properties', () => {
    const files = generateLeanFixtures(SAMPLE_LEAN, 'fast-check');
    const propFile = files.find(f => f.path.includes('.property.'));
    assert.ok(propFile);
    assert.ok(propFile!.content.includes('fc.'));
  });

  it('generates junit property tests', () => {
    const files = generateLeanFixtures(SAMPLE_LEAN, 'junit');
    const testFile = files.find(f => f.path.includes('Test.java'));
    assert.ok(testFile);
    assert.ok(testFile!.content.includes('@Test'));
  });
});
