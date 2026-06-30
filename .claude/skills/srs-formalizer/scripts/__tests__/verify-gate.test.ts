import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { GraphData } from '../lib/graph.js';

const TMP = path.join(os.tmpdir(), `srs-formalizer-verify-gate-test-${Date.now()}`);

/**
 * Create a temporary .srs_formalizer workdir with initial S1 structure.
 * Returns the workdir path.
 */
function createWorkDir(name: string): string {
  const workDir = path.join(TMP, name, '.srs_formalizer');
  fs.mkdirSync(path.join(workDir, '3_graph', 'graph'), { recursive: true });
  return workDir;
}

/**
 * Write a JSONL file in a subdirectory.
 */
function writeJsonl(dir: string, filename: string, records: unknown[]): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const content = records.map(r => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(path.join(dir, filename), content, 'utf-8');
}

/**
 * Write a graph JSON file.
 */
function writeGraphFile(workDir: string, filename: string, data: GraphData): void {
  const filePath = path.join(workDir, '3_graph', 'graph', filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

describe('verify-gate command', () => {
  before(() => {
    fs.mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  // ===========================================================================
  // S1 stage checks
  // ===========================================================================

  it('S1 stage: all checks pass with valid workdir', async () => {
    const workDir = createWorkDir('s1-pass');

    // Create S1 artifacts
    fs.writeFileSync(path.join(workDir, 'STATE.md'), '# State\n', 'utf-8');
    fs.mkdirSync(path.join(workDir, '_ctx'), { recursive: true });
    fs.writeFileSync(path.join(workDir, '_ctx', 'shard_index.json'), JSON.stringify({ version: '1.0' }), 'utf-8');
    writeJsonl(path.join(workDir, '2_extract', 'r1-explicit'), 'a.jsonl', [
      { id: 'R1-REQ-0001', category: 'explicit', statement: '用户登录', source_file: 'srs.md', confidence: 'high' },
    ]);

    const { main } = await import('../commands/verify-gate.js');
    const result = await main(['--workdir', workDir, '--stage', 'S1']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.pass, true);
    const checks = data.checks as Record<string, { passed: boolean }>;
    assert.ok(checks['STATE.md exists']!.passed);
    assert.ok(checks['_ctx/shard_index.json exists']!.passed);
    assert.ok(checks['r1-explicit has JSONL files']!.passed);
  });

  it('S1 stage: reports failure when STATE.md is missing', async () => {
    const workDir = createWorkDir('s1-no-state');

    fs.mkdirSync(path.join(workDir, '_ctx'), { recursive: true });
    fs.writeFileSync(path.join(workDir, '_ctx', 'shard_index.json'), JSON.stringify({ version: '1.0' }), 'utf-8');
    writeJsonl(path.join(workDir, '2_extract', 'r1-explicit'), 'a.jsonl', [
      { id: 'R1-REQ-0001', category: 'explicit', statement: '用户登录', source_file: 'srs.md', confidence: 'high' },
    ]);

    const { main } = await import('../commands/verify-gate.js');
    const result = await main(['--workdir', workDir, '--stage', 'S1']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.pass, false);
    const checks = data.checks as Record<string, { passed: boolean }>;
    assert.equal(checks['STATE.md exists']!.passed, false);
  });

  // ===========================================================================
  // R3 stage checks
  // ===========================================================================

  it('R3 stage: all checks pass with complete valid workdir', async () => {
    const workDir = createWorkDir('r3-pass');

    // S1 artifacts
    fs.writeFileSync(path.join(workDir, 'STATE.md'), '# State\n', 'utf-8');
    fs.mkdirSync(path.join(workDir, '_ctx'), { recursive: true });
    fs.writeFileSync(path.join(workDir, '_ctx', 'shard_index.json'), JSON.stringify({ version: '1.0' }), 'utf-8');

    // JSONL files in all subdirectories
    writeJsonl(path.join(workDir, '2_extract', 'r1-explicit'), 'a.jsonl', [
      { id: 'R1-REQ-0001', category: 'explicit', statement: '用户登录', source_file: 'srs.md', confidence: 'high' },
      { id: 'R1-REQ-0002', category: 'explicit', statement: '用户注册', source_file: 'srs.md', confidence: 'high' },
    ]);
    writeJsonl(path.join(workDir, '2_extract', 'r2-implicit'), 'b.jsonl', [
      { id: 'R2-IMPL-0001', category: 'implicit', statement: '会话过期', source_file: 'srs.md', confidence: 'medium' },
    ]);
    writeJsonl(path.join(workDir, '2_extract', 'r3-relational'), 'c.jsonl', [
      { id: 'R3-REL-0001', category: 'relational', statement: '登录依赖认证', source_file: 'srs.md', confidence: 'medium' },
    ]);

    // Valid graph (4 nodes >= 2 R1 nodes)
    writeGraphFile(workDir, 'graph.json', {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: '用户登录', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R1-REQ-0002', labels: [':Requirement'], properties: { statement: '用户注册', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R2-IMPL-0001', labels: [':ImplicitRequirement'], properties: { statement: '会话过期', source_file: 'srs.md', confidence: 'medium', category: 'implicit' } },
        { id: 'R3-REL-0001', labels: [':RelationalRequirement'], properties: { statement: '登录依赖认证', source_file: 'srs.md', confidence: 'medium', category: 'relational' } },
      ],
      edges: [],
    });

    const { main } = await import('../commands/verify-gate.js');
    const result = await main(['--workdir', workDir, '--stage', 'R3']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.pass, true);
    const checks = data.checks as Record<string, { passed: boolean }>;
    assert.ok(checks['STATE.md exists']!.passed);
    assert.ok(checks['_ctx/shard_index.json exists']!.passed);
    assert.ok(checks['r1-explicit has JSONL files']!.passed);
    assert.ok(checks['JSONL existence (all subdirectories)']!.passed);
    assert.ok(checks['ID uniqueness (no duplicates across files)']!.passed);
    assert.ok(checks['Graph loadable']!.passed);
    assert.ok(checks['Node count >= R1 explicit requirements']!.passed);
  });

  it('R3 stage: fails when r2-implicit directory is missing', async () => {
    const workDir = createWorkDir('r3-missing-dir');

    fs.writeFileSync(path.join(workDir, 'STATE.md'), '# State\n', 'utf-8');
    fs.mkdirSync(path.join(workDir, '_ctx'), { recursive: true });
    fs.writeFileSync(path.join(workDir, '_ctx', 'shard_index.json'), JSON.stringify({ version: '1.0' }), 'utf-8');
    writeJsonl(path.join(workDir, '2_extract', 'r1-explicit'), 'a.jsonl', [
      { id: 'R1-REQ-0001', category: 'explicit', statement: '用户登录', source_file: 'srs.md', confidence: 'high' },
    ]);

    const { main } = await import('../commands/verify-gate.js');
    const result = await main(['--workdir', workDir, '--stage', 'R3']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.pass, false);
    const errors = data.errors as string[];
    assert.ok(errors.some((e: string) => e.includes('r2-implicit') || e.includes('Some subdirectories')));
  });

  it('R3 stage: fails when duplicate IDs exist across files', async () => {
    const workDir = createWorkDir('r3-dupe-id');

    fs.writeFileSync(path.join(workDir, 'STATE.md'), '# State\n', 'utf-8');
    fs.mkdirSync(path.join(workDir, '_ctx'), { recursive: true });
    fs.writeFileSync(path.join(workDir, '_ctx', 'shard_index.json'), JSON.stringify({ version: '1.0' }), 'utf-8');
    writeJsonl(path.join(workDir, '2_extract', 'r1-explicit'), 'a.jsonl', [
      { id: 'R1-REQ-0001', category: 'explicit', statement: '用户登录', source_file: 'srs.md', confidence: 'high' },
    ]);
    writeJsonl(path.join(workDir, '2_extract', 'r2-implicit'), 'b.jsonl', [
      { id: 'R2-IMPL-0001', category: 'implicit', statement: '会话过期', source_file: 'srs.md', confidence: 'medium' },
    ]);
    writeJsonl(path.join(workDir, '2_extract', 'r3-relational'), 'c.jsonl', [
      { id: 'R1-REQ-0001', category: 'relational', statement: '重复ID', source_file: 'srs.md', confidence: 'low' },
    ]);

    writeGraphFile(workDir, 'graph.json', { nodes: [], edges: [] });

    const { main } = await import('../commands/verify-gate.js');
    const result = await main(['--workdir', workDir, '--stage', 'R3']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.pass, false);
    const checks = data.checks as Record<string, { passed: boolean }>;
    assert.equal(checks['ID uniqueness (no duplicates across files)']!.passed, false);
    assert.ok((data.errors as string[]).some((e: string) => e.includes('Duplicate')));
  });

  it('R3 stage: fails when graph file is not found', async () => {
    const workDir = createWorkDir('r3-no-graph');

    fs.writeFileSync(path.join(workDir, 'STATE.md'), '# State\n', 'utf-8');
    fs.mkdirSync(path.join(workDir, '_ctx'), { recursive: true });
    fs.writeFileSync(path.join(workDir, '_ctx', 'shard_index.json'), JSON.stringify({ version: '1.0' }), 'utf-8');
    writeJsonl(path.join(workDir, '2_extract', 'r1-explicit'), 'a.jsonl', [
      { id: 'R1-REQ-0001', category: 'explicit', statement: '用户登录', source_file: 'srs.md', confidence: 'high' },
    ]);
    writeJsonl(path.join(workDir, '2_extract', 'r2-implicit'), 'b.jsonl', [
      { id: 'R2-IMPL-0001', category: 'implicit', statement: '会话过期', source_file: 'srs.md', confidence: 'medium' },
    ]);
    writeJsonl(path.join(workDir, '2_extract', 'r3-relational'), 'c.jsonl', [
      { id: 'R3-REL-0001', category: 'relational', statement: '登录依赖', source_file: 'srs.md', confidence: 'medium' },
    ]);
    // No graph files!

    const { main } = await import('../commands/verify-gate.js');
    const result = await main(['--workdir', workDir, '--stage', 'R3']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.pass, false);
    const checks = data.checks as Record<string, { passed: boolean }>;
    assert.equal(checks['Graph loadable']!.passed, false);
  });

  it('R3 stage: fails when node count is less than R1 explicit count', async () => {
    const workDir = createWorkDir('r3-too-few-nodes');

    fs.writeFileSync(path.join(workDir, 'STATE.md'), '# State\n', 'utf-8');
    fs.writeFileSync(path.join(workDir, 'index.json'), JSON.stringify({ version: '1.0' }), 'utf-8');

    // 3 R1 explicit requirements
    writeJsonl(path.join(workDir, '2_extract', 'r1-explicit'), 'a.jsonl', [
      { id: 'R1-REQ-0001', category: 'explicit', statement: '登录', source_file: 'srs.md', confidence: 'high' },
      { id: 'R1-REQ-0002', category: 'explicit', statement: '注册', source_file: 'srs.md', confidence: 'high' },
      { id: 'R1-REQ-0003', category: 'explicit', statement: '支付', source_file: 'srs.md', confidence: 'high' },
    ]);
    writeJsonl(path.join(workDir, '2_extract', 'r2-implicit'), 'b.jsonl', [
      { id: 'R2-IMPL-0001', category: 'implicit', statement: '会话', source_file: 'srs.md', confidence: 'medium' },
    ]);
    writeJsonl(path.join(workDir, '2_extract', 'r3-relational'), 'c.jsonl', [
      { id: 'R3-REL-0001', category: 'relational', statement: '关系', source_file: 'srs.md', confidence: 'medium' },
    ]);

    // Only 1 node in graph (should have >= 3)
    writeGraphFile(workDir, 'graph.json', {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: '登录', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
      ],
      edges: [],
    });

    const { main } = await import('../commands/verify-gate.js');
    const result = await main(['--workdir', workDir, '--stage', 'R3']);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal(data.pass, false);
    const checks = data.checks as Record<string, { passed: boolean }>;
    assert.equal(checks['Node count >= R1 explicit requirements']!.passed, false);
  });

  // ===========================================================================
  // CLI argument validation
  // ===========================================================================

  it('returns error when --workdir is missing', async () => {
    const { main } = await import('../commands/verify-gate.js');
    const result = await main(['--stage', 'S1']);

    assert.equal(result.status, 'error');
    assert.equal(result.message, 'Missing required argument: --workdir');
  });

  it('returns error when --stage is missing', async () => {
    const { main } = await import('../commands/verify-gate.js');
    const result = await main(['--workdir', '/tmp/test']);

    assert.equal(result.status, 'error');
    assert.equal(result.message, 'Missing required argument: --stage');
  });

  it('returns error for invalid --stage value', async () => {
    const { main } = await import('../commands/verify-gate.js');
    const result = await main(['--workdir', '/tmp/.srs_formalizer', '--stage', 'INVALID']);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('Invalid --stage'));
  });

  it('rejects non-.srs_formalizer workdir', async () => {
    const badDir = path.join(TMP, 'bad_workdir');
    fs.mkdirSync(badDir, { recursive: true });

    const { main } = await import('../commands/verify-gate.js');
    const result = await main(['--workdir', badDir, '--stage', 'S1']);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('.srs_formalizer'));
  });
});
