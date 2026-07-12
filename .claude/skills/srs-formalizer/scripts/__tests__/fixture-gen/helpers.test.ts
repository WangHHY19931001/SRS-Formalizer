import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { toCamelCase, toPascalCase, toSnakeCase, escapeStr } from '../../lib/fixture-gen/helpers.js';

describe('toCamelCase', () => {
  it('handles empty string', () => {
    assert.equal(toCamelCase(''), '');
  });

  it('handles single word', () => {
    assert.equal(toCamelCase('hello'), 'hello');
  });

  it('handles spaces', () => {
    assert.equal(toCamelCase('hello world'), 'helloWorld');
  });

  it('handles hyphens', () => {
    assert.equal(toCamelCase('hello-world'), 'helloWorld');
  });

  it('handles underscores', () => {
    assert.equal(toCamelCase('hello_world'), 'helloWorld');
  });

  it('handles mixed separators', () => {
    assert.equal(toCamelCase('hello-world_foo'), 'helloWorldFoo');
  });

  it('handles PascalCase input', () => {
    assert.equal(toCamelCase('HelloWorld'), 'helloWorld');
  });
});

describe('toPascalCase', () => {
  it('handles empty string', () => {
    assert.equal(toPascalCase(''), '');
  });

  it('handles single word', () => {
    assert.equal(toPascalCase('hello'), 'Hello');
  });

  it('handles spaces', () => {
    assert.equal(toPascalCase('hello world'), 'HelloWorld');
  });
});

describe('toSnakeCase', () => {
  it('handles empty string', () => {
    assert.equal(toSnakeCase(''), '');
  });

  it('handles single word', () => {
    assert.equal(toSnakeCase('hello'), 'hello');
  });

  it('handles PascalCase', () => {
    assert.equal(toSnakeCase('HelloWorld'), 'hello_world');
  });

  it('handles camelCase', () => {
    assert.equal(toSnakeCase('helloWorld'), 'hello_world');
  });

  it('handles consecutive capitals', () => {
    assert.equal(toSnakeCase('HTMLParser'), 'html_parser');
  });
});

describe('escapeStr', () => {
  it('handles empty string', () => {
    assert.equal(escapeStr(''), '');
  });

  it('escapes backslashes', () => {
    assert.equal(escapeStr('a\\b'), 'a\\\\b');
  });

  it('escapes single quotes', () => {
    assert.equal(escapeStr("it's"), "it\\'s");
  });

  it('escapes newlines', () => {
    assert.equal(escapeStr('a\nb'), 'a\\nb');
  });
});
