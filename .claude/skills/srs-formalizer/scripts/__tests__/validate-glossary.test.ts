import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TMP = path.join(os.tmpdir(), `srs-formalizer-validate-glossary-test-${Date.now()}`);

function createGlossaryFile(name: string, content: string): string {
  const dir = path.join(TMP, name);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, 'glossary.json');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

// A valid glossary batch with all required fields (5 high-confidence terms to satisfy default --min-high 5)
const VALID_GLOSSARY = JSON.stringify({
  batch_id: 'batch-001',
  shards_covered: ['S001', 'S002'],
  terms: [
    { term: 'Authentication', definition: 'The process of verifying the identity of a user or system.', source_shard: 'S001', confidence: 'high', category: 'domain_concept' },
    { term: 'JWT', definition: 'JSON Web Token used for stateless authentication.', source_shard: 'S002', confidence: 'high', category: 'acronym' },
    { term: 'Authorization', definition: 'The process of determining what resources a user can access.', source_shard: 'S001', confidence: 'high', category: 'domain_concept' },
    { term: 'Session', definition: 'A temporary and secure interaction between a user and a system.', source_shard: 'S002', confidence: 'high', category: 'technical_entity' },
    { term: 'RBAC', definition: 'Role-Based Access Control for managing user permissions.', source_shard: 'S001', confidence: 'high', category: 'acronym' },
  ],
});

const GLOSSARY_EMPTY_TERMS = JSON.stringify({
  batch_id: 'batch-002',
  shards_covered: ['S001'],
  terms: [],
});

const GLOSSARY_INVALID_JSON = 'this is not json';

describe('validate-glossary command', () => {
  before(() => {
    fs.mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('validates a valid glossary JSON successfully', async () => {
    const filePath = createGlossaryFile('valid', VALID_GLOSSARY);

    const { main } = await import('../commands/validate-glossary.js');
    const result = await main(['--file', filePath]);
    assert.equal(result.status, 'ok');

    const data = result.data as Record<string, unknown>;
    assert.equal(data.passed, true);
    assert.equal(data.errors, 0);
  });

  it('returns error when missing --file argument', async () => {
    const { main } = await import('../commands/validate-glossary.js');
    const result = await main([]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('Missing required argument'));
  });

  it('returns error when JSON is invalid', async () => {
    const filePath = createGlossaryFile('invalid-json', GLOSSARY_INVALID_JSON);

    const { main } = await import('../commands/validate-glossary.js');
    const result = await main(['--file', filePath]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('合法 JSON'));
  });

  it('returns error when terms array is empty', async () => {
    const filePath = createGlossaryFile('empty-terms', GLOSSARY_EMPTY_TERMS);

    const { main } = await import('../commands/validate-glossary.js');
    const result = await main(['--file', filePath]);

    assert.equal(result.status, 'error');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.passed, false);
    // Should have errors since terms array is empty
    assert.ok((data.errors as number) > 0);
  });

  it('validates confidence enum values — high/medium/low accepted', async () => {
    const glossary = JSON.stringify({
      batch_id: 'batch-003',
      shards_covered: ['S001'],
      terms: [
        { term: 'HighConf', definition: 'A high confidence term with sufficient length.', source_shard: 'S001', confidence: 'high', category: 'domain_concept' },
        { term: 'MediumConf', definition: 'A medium confidence term with sufficient length.', source_shard: 'S001', confidence: 'medium', category: 'technical_entity' },
        { term: 'LowConf', definition: 'A low confidence term with sufficient length.', source_shard: 'S001', confidence: 'low', category: 'business_entity' },
      ],
    });
    const filePath = createGlossaryFile('confidence-enums', glossary);

    // Use --min-high 1 since only 1 term is high confidence
    const { main } = await import('../commands/validate-glossary.js');
    const result = await main(['--file', filePath, '--min-high', '1']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.passed, true);
  });

  it('validates category enum values — all five categories accepted', async () => {
    const glossary = JSON.stringify({
      batch_id: 'batch-004',
      shards_covered: ['S001'],
      terms: [
        { term: 'Concept', definition: 'A domain concept that is very important and long enough.', source_shard: 'S001', confidence: 'high', category: 'domain_concept' },
        { term: 'Acro', definition: 'An acronym that is very important and long enough.', source_shard: 'S001', confidence: 'high', category: 'acronym' },
        { term: 'TechEnt', definition: 'A technical entity that is very important and long enough.', source_shard: 'S001', confidence: 'high', category: 'technical_entity' },
        { term: 'BizEnt', definition: 'A business entity that is very important and long enough.', source_shard: 'S001', confidence: 'high', category: 'business_entity' },
        { term: 'DefTerm', definition: 'A defined term that is very important and long enough.', source_shard: 'S001', confidence: 'high', category: 'defined_term' },
      ],
    });
    const filePath = createGlossaryFile('category-enums', glossary);

    const { main } = await import('../commands/validate-glossary.js');
    const result = await main(['--file', filePath]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.passed, true);
  });

  it('returns error when --min-high is not met', async () => {
    const glossary = JSON.stringify({
      batch_id: 'batch-005',
      shards_covered: ['S001'],
      terms: [
        { term: 'LowOnly', definition: 'A low confidence term with sufficient length and high detail.', source_shard: 'S001', confidence: 'low', category: 'domain_concept' },
      ],
    });
    const filePath = createGlossaryFile('min-high-fail', glossary);

    const { main } = await import('../commands/validate-glossary.js');
    const result = await main(['--file', filePath, '--min-high', '1']);

    assert.equal(result.status, 'error');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.passed, false);
  });

  it('returns error when the file does not exist', async () => {
    const { main } = await import('../commands/validate-glossary.js');
    const result = await main(['--file', '/tmp/nonexistent-glossary-file-12345.json']);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('File not found'));
  });
});
