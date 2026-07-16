import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { loadTemplate, renderTemplate } from '../../lib/fixture-gen/template-engine.js';

describe('renderTemplate', () => {
  it('replaces single placeholder', () => {
    const result = renderTemplate('Hello {{NAME}}!', { NAME: 'World' });
    assert.equal(result, 'Hello World!');
  });

  it('replaces multiple placeholders', () => {
    const result = renderTemplate('{{A}} and {{B}}', { A: 'X', B: 'Y' });
    assert.equal(result, 'X and Y');
  });

  it('leaves unmatched placeholders as-is', () => {
    const result = renderTemplate('{{A}} {{B}}', { A: 'X' });
    assert.equal(result, 'X {{B}}');
  });

  it('handles empty template', () => {
    const result = renderTemplate('', {});
    assert.equal(result, '');
  });
});

describe('loadTemplate', () => {
  it('loads a known template', () => {
    const tmpl = loadTemplate('cucumber', 'world.ts');
    assert.ok(tmpl.length > 0, 'Template should not be empty');
  });

  it('throws on missing template', () => {
    assert.throws(
      () => loadTemplate('cucumber', 'nonexistent.ts'),
      /Template not found/,
    );
  });
});
