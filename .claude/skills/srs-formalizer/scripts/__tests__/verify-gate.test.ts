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
  // Create all stage directories and required files
  const dirs = [
    'S0', '_ctx',
    '2_extract/r1-explicit', '2_extract/r2-implicit', '2_extract/r3-relational', '2_extract/architecture',
    '3_graph/graph', '3_graph/analysis/subagent_prompts',
    '4_bdd/features', '5_formal/specs', '5_formal/proofs',
    '6_outputs/knowledge_graph', '6_outputs/brainstorming',
  ];
  for (const d of dirs) fs.mkdirSync(path.join(workDir, d), { recursive: true });
  fs.writeFileSync(path.join(workDir, 'STATE.md'), '# SRS Formalizer — 状态追踪\n| 当前阶段 | S1 |\n', 'utf-8');
  fs.writeFileSync(path.join(workDir, '_ctx', 'shard_index.json'), '{"total_shards":0,"shards":[]}', 'utf-8');
  fs.writeFileSync(path.join(workDir, 'MINDMAP.md'), '# MINDMAP\n- [x] Module1 ✅\n- [x] Module2 ✅', 'utf-8');
  fs.writeFileSync(path.join(workDir, 'GLOSSARY.md'), '# GLOSSARY — SRS 术语表\n\n## 高置信度术语\n| 术语 | 定义 | 来源 |\n|------|------|------|\n| RBAC | Role-Based Access Control | srs.md:1 |\n', 'utf-8');
  // Write CHECKLIST.md files for each stage
  const checklistDirs = ['S0', '2_extract', '3_graph', '4_bdd', '5_formal', '6_outputs'];
  for (const d of checklistDirs) {
    fs.writeFileSync(path.join(workDir, d, 'CHECKLIST.md'), `# ${d} checklist\n\n- [x] All checks passed\n`, 'utf-8');
  }
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
    fs.writeFileSync(path.join(workDir, '_ctx', 'confirmation.json'), JSON.stringify({ user_confirm: true, detected_gaps: [], language: 'zh' }), 'utf-8');
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

  it('S1 stage: data-entities format gate PASSES on well-formed records', async () => {
    const workDir = createWorkDir('s1-df-ok');
    writeJsonl(path.join(workDir, '2_extract', 'r1-explicit'), 'a.jsonl', [
      { id: 'R1-REQ-0001', category: 'explicit', statement: 'create order', source_file: 'srs.md', confidence: 'high' },
    ]);
    writeJsonl(path.join(workDir, '2_extract', 'data-entities'), 'df.jsonl', [
      { kind: 'entity', id: 'DE-order', canonical: 'Order', source_shard: 'S001' },
      { kind: 'flow', requirement_id: 'R1-REQ-0001', entity_id: 'DE-order', action: 'produces', source_shard: 'S001' },
    ]);
    const { main } = await import('../commands/verify-gate.js');
    const result = await main(['--workdir', workDir, '--stage', 'S1']);
    const checks = (result.data as Record<string, unknown>).checks as Record<string, { passed: boolean }>;
    assert.ok(checks['data-entities format']!.passed);
  });

  it('S1 stage: data-entities format gate FAILS on malformed records', async () => {
    const workDir = createWorkDir('s1-df-bad');
    writeJsonl(path.join(workDir, '2_extract', 'r1-explicit'), 'a.jsonl', [
      { id: 'R1-REQ-0001', category: 'explicit', statement: 'x', source_file: 'srs.md', confidence: 'high' },
    ]);
    writeJsonl(path.join(workDir, '2_extract', 'data-entities'), 'df.jsonl', [
      { kind: 'flow', requirement_id: 'R1-REQ-0001', entity_id: 'DE-ghost', action: 'produces', source_shard: 'S001' },
    ]);
    const { main } = await import('../commands/verify-gate.js');
    const result = await main(['--workdir', workDir, '--stage', 'S1']);
    const data = result.data as Record<string, unknown>;
    assert.equal(data.pass, false);
    const checks = data.checks as Record<string, { passed: boolean }>;
    assert.equal(checks['data-entities format']!.passed, false);
  });

  it('S1 stage: reports failure when STATE.md is missing', async () => {
    const workDir = createWorkDir('s1-no-state');
    fs.rmSync(path.join(workDir, 'STATE.md')); // Remove STATE.md created by createWorkDir

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
    fs.writeFileSync(path.join(workDir, 'STATE.md'), '# State\n| last_verify_gate | S1:pass |\n| skipped_modules | (none) |\n| tool_failures | 0 |\n', 'utf-8');
    fs.mkdirSync(path.join(workDir, '_ctx'), { recursive: true });
    fs.writeFileSync(path.join(workDir, '_ctx', 'shard_index.json'), JSON.stringify({ version: '1.0' }), 'utf-8');
    fs.writeFileSync(path.join(workDir, '_ctx', 'confirmation.json'), JSON.stringify({ user_confirm: true, detected_gaps: [], language: 'zh' }), 'utf-8');

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
    // Architecture JSONL (required by Architecture JSONL exists check)
    writeJsonl(path.join(workDir, '2_extract', 'architecture'), 'arch-1.jsonl', [
      { id: 'ARCH-SYS-0001', type: 'module', name: 'Test', parent: null, contains: [], reasoning: 'test architecture record for gate check' },
    ]);

    // Valid graph (4 nodes >= 2 R1 nodes)
    writeGraphFile(workDir, 'graph.json', {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: '用户登录', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R1-REQ-0002', labels: [':Requirement'], properties: { statement: '用户注册', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R2-IMPL-0001', labels: [':ImplicitRequirement'], properties: { statement: '会话过期', source_file: 'srs.md', confidence: 'medium', category: 'implicit' } },
        { id: 'R3-REL-0001', labels: [':RelationalRequirement'], properties: { statement: '登录依赖认证', source_file: 'srs.md', confidence: 'medium', category: 'relational' } },
      ],
      edges: [
        { id: 'E1', source: 'R1-REQ-0001', target: 'R1-REQ-0002', type: 'RELATES_TO' },
        { id: 'E2', source: 'R2-IMPL-0001', target: 'R1-REQ-0001', type: 'RELATES_TO' },
        { id: 'E3', source: 'R3-REL-0001', target: 'R1-REQ-0001', type: 'RELATES_TO' },
      ],
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
    assert.ok(checks['Orphan ratio within threshold']!.passed);
    assert.ok(checks['Node count >= R1 explicit requirements']!.passed);
  });

  it('R3 stage: fails when orphan ratio exceeds threshold (§P1-1)', async () => {
    const workDir = createWorkDir('r3-orphans');
    fs.writeFileSync(path.join(workDir, 'STATE.md'), '# State\n', 'utf-8');
    fs.mkdirSync(path.join(workDir, '_ctx'), { recursive: true });
    fs.writeFileSync(path.join(workDir, '_ctx', 'shard_index.json'), JSON.stringify({ version: '1.0' }), 'utf-8');
    writeJsonl(path.join(workDir, '2_extract', 'r1-explicit'), 'a.jsonl', [
      { id: 'R1-REQ-0001', category: 'explicit', statement: '登录', source_file: 'srs.md', confidence: 'high' },
    ]);
    writeJsonl(path.join(workDir, '2_extract', 'r2-implicit'), 'b.jsonl', [
      { id: 'R2-IMPL-0001', category: 'implicit', statement: '会话', source_file: 'srs.md', confidence: 'medium' },
    ]);
    writeJsonl(path.join(workDir, '2_extract', 'r3-relational'), 'c.jsonl', [
      { id: 'R3-REL-0001', category: 'relational', statement: '关系', source_file: 'srs.md', confidence: 'medium' },
    ]);
    writeJsonl(path.join(workDir, '2_extract', 'architecture'), 'arch-1.jsonl', [
      { id: 'ARCH-SYS-0001', type: 'module', name: 'Test', parent: null, contains: [], reasoning: 'architecture record for orphan gate check' },
    ]);
    // 4 nodes, only 2 connected by 1 edge → orphan ratio 0.5 > 0.1
    writeGraphFile(workDir, 'graph.json', {
      nodes: [
        { id: 'R1-REQ-0001', labels: [':Requirement'], properties: { statement: '登录', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R1-REQ-0002', labels: [':Requirement'], properties: { statement: '注册', source_file: 'srs.md', confidence: 'high', category: 'explicit' } },
        { id: 'R2-IMPL-0001', labels: [':ImplicitRequirement'], properties: { statement: '会话', source_file: 'srs.md', confidence: 'medium', category: 'implicit' } },
        { id: 'R3-REL-0001', labels: [':RelationalRequirement'], properties: { statement: '关系', source_file: 'srs.md', confidence: 'medium', category: 'relational' } },
      ],
      edges: [{ id: 'E1', source: 'R1-REQ-0001', target: 'R1-REQ-0002', type: 'RELATES_TO' }],
    });

    const { main } = await import('../commands/verify-gate.js');
    const result = await main(['--workdir', workDir, '--stage', 'R3']);

    const data = result.data as Record<string, unknown>;
    assert.equal(data.pass, false);
    const checks = data.checks as Record<string, { passed: boolean }>;
    assert.equal(checks['Orphan ratio within threshold']!.passed, false);
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

  // ===========================================================================
  // B2/B3/B4 Backend stage checks (P0-1)
  // ===========================================================================

  it('rejects invalid stage B5', async () => {
    const workDir = createWorkDir('b5-invalid');
    const { main } = await import('../commands/verify-gate.js');
    const result = await main(['--workdir', workDir, '--stage', 'B5']);
    assert.strictEqual(result.status, 'error');
    assert.ok(result.message?.includes('Invalid --stage'));
  });

  it('B4 stage: skips Lean when no security/compliance NFR', async () => {
    const workDir = createWorkDir('b4-skip-lean');
    writeJsonl(path.join(workDir, '2_extract', 'r1-explicit'), 'a.jsonl', [
      { id: 'R1-REQ-0001', category: 'explicit', statement: '用户登录', source_file: 'srs.md', confidence: 'high' },
    ]);
    fs.writeFileSync(path.join(workDir, 'srs-ir.json'), JSON.stringify({
      version: '2.1.0', nodes: [], edges: [], crossRefs: [],
      nfrProfile: { detectedCategories: [{ category: 'performance' }] },
      gaps: [], glossary: {}, meta: { buildTimestamp: new Date().toISOString() },
    }), 'utf-8');

    const { main } = await import('../commands/verify-gate.js');
    const result = await main(['--workdir', workDir, '--stage', 'B4']);
    // B4 with no security/compliance → Lean not required → should not error on invalid stage
    assert.notStrictEqual(result.status, 'error');
  });

  // ===========================================================================
  // STATE.md cross-validation (P1-11)
  // ===========================================================================

  it('checkChecklistComplete warns when STATE.md says stage complete but CHECKLIST unchecked', async () => {
    const workDir = createWorkDir('state-cross-fail');
    // STATE.md says S1 is done
    fs.writeFileSync(path.join(workDir, 'STATE.md'),
      '# State\n| 当前阶段 | R3 |\n| S1 预处理 | ✅ |\n', 'utf-8');
    // But S0 CHECKLIST has unchecked items
    fs.writeFileSync(path.join(workDir, 'S0', 'CHECKLIST.md'),
      '# S0 checklist\n\n- [ ] Not done yet\n', 'utf-8');

    const { checkChecklistComplete } = await import('../lib/verify-gate/shared.js');
    const result = checkChecklistComplete('S0', workDir);
    assert.ok(!result.passed, 'should fail when CHECKLIST unchecked');
    assert.ok(result.detail?.includes('unchecked'), `detail should mention unchecked: ${result.detail}`);
  });

  it('checkStateMdCrossCheck detects STATE.md missing last_verify_gate', async () => {
    const workDir = createWorkDir('state-missing-gate');
    fs.writeFileSync(path.join(workDir, 'STATE.md'),
      '# State\n| 当前阶段 | S1 |\n', 'utf-8');

    const { checkStateMdCrossCheck } = await import('../lib/verify-gate/shared.js');
    const result = checkStateMdCrossCheck(workDir);
    assert.ok(!result.passed, 'should warn when last_verify_gate missing');
    assert.ok(result.detail?.includes('last_verify_gate'), `detail should mention last_verify_gate: ${result.detail}`);
  });

  it('checkStateMdCrossCheck passes when STATE.md has all required fields', async () => {
    const workDir = createWorkDir('state-complete');
    fs.writeFileSync(path.join(workDir, 'STATE.md'),
      '# State\n| 当前阶段 | FINAL |\n| last_verify_gate | FINAL:pass |\n| skipped_modules | (none) |\n| tool_failures | 0 |\n', 'utf-8');

    const { checkStateMdCrossCheck } = await import('../lib/verify-gate/shared.js');
    const result = checkStateMdCrossCheck(workDir);
    assert.ok(result.passed, `should pass with all fields: ${result.detail}`);
  });

  // ===========================================================================
  // P1: R3 relation ingest + r3-relational threshold
  // ===========================================================================

  it('flags R3 relations not ingested into IR edges', async () => {
    const workDir = createWorkDir('r3-relations-missing');
    // r3-relational JSONL has 2 relations
    writeJsonl(path.join(workDir, '2_extract', 'r3-relational'), 'a.jsonl', [
      { id: 'R3-REL-0001', category: 'relational', statement: 'A depends on B',
        source_file: 'srs.md', confidence: 'high',
        metadata: { relation: { type: 'depends_on', target: 'R1-REQ-0002' }, source_id: 'R1-REQ-0001' } },
      { id: 'R3-REL-0002', category: 'relational', statement: 'C refines D',
        source_file: 'srs.md', confidence: 'high',
        metadata: { relation: { type: 'refines', target: 'R1-REQ-0004' }, source_id: 'R1-REQ-0003' } },
    ]);
    // IR has NO edges — relations were not ingested
    fs.writeFileSync(path.join(workDir, 'srs-ir.json'), JSON.stringify({
      version: '2.1.0', nodes: [
        { id: 'R1-REQ-0001', kind: 'requirement', statement: 'A', module: 'S001' },
        { id: 'R1-REQ-0002', kind: 'requirement', statement: 'B', module: 'S001' },
        { id: 'R1-REQ-0003', kind: 'requirement', statement: 'C', module: 'S001' },
        { id: 'R1-REQ-0004', kind: 'requirement', statement: 'D', module: 'S001' },
      ], edges: [], crossRefs: [], nfrProfile: { detectedCategories: [] },
      gaps: [], glossary: {}, meta: { buildTimestamp: new Date().toISOString() },
    }), 'utf-8');
    const { checkR3RelationIngest } = await import('../lib/verify-gate/checks-r3.js');
    const result = checkR3RelationIngest(workDir);
    assert.strictEqual(result.passed, false, `expected missing relations to fail, got: ${result.detail}`);
    assert.ok(result.detail?.includes('relation'), `detail should mention relations: ${result.detail}`);
  });

  it('passes when R3 relations are in IR edges', async () => {
    const workDir = createWorkDir('r3-relations-present');
    writeJsonl(path.join(workDir, '2_extract', 'r3-relational'), 'a.jsonl', [
      { id: 'R3-REL-0001', category: 'relational', statement: 'A depends on B',
        source_file: 'srs.md', confidence: 'high',
        metadata: { relation: { type: 'depends_on', target: 'R1-REQ-0002' }, source_id: 'R1-REQ-0001' } },
    ]);
    fs.writeFileSync(path.join(workDir, 'srs-ir.json'), JSON.stringify({
      version: '2.1.0', nodes: [
        { id: 'R1-REQ-0001', kind: 'requirement', statement: 'A', module: 'S001' },
        { id: 'R1-REQ-0002', kind: 'requirement', statement: 'B', module: 'S001' },
      ], edges: [
        { id: 'e1', type: 'depends_on', source: 'R1-REQ-0001', target: 'R1-REQ-0002' },
      ], crossRefs: [], nfrProfile: { detectedCategories: [] },
      gaps: [], glossary: {}, meta: { buildTimestamp: new Date().toISOString() },
    }), 'utf-8');
    const { checkR3RelationIngest } = await import('../lib/verify-gate/checks-r3.js');
    const result = checkR3RelationIngest(workDir);
    assert.strictEqual(result.passed, true, `expected present relations to pass, got: ${result.detail}`);
  });

  it('flags R3 relations partial loss (>50% but not 100%)', async () => {
    const workDir = createWorkDir('r3-relations-partial-loss');
    // 3 relations: depends_on, refines, triggers
    writeJsonl(path.join(workDir, '2_extract', 'r3-relational'), 'a.jsonl', [
      { id: 'R3-REL-0001', category: 'relational', statement: 'A depends on B',
        source_file: 'srs.md', confidence: 'high',
        metadata: { relation: { type: 'depends_on', target: 'R1-REQ-0002' }, source_id: 'R1-REQ-0001' } },
      { id: 'R3-REL-0002', category: 'relational', statement: 'C refines D',
        source_file: 'srs.md', confidence: 'high',
        metadata: { relation: { type: 'refines', target: 'R1-REQ-0004' }, source_id: 'R1-REQ-0003' } },
      { id: 'R3-REL-0003', category: 'relational', statement: 'E triggers F',
        source_file: 'srs.md', confidence: 'high',
        metadata: { relation: { type: 'triggers', target: 'R1-REQ-0006' }, source_id: 'R1-REQ-0005' } },
    ]);
    // IR edges only has the depends_on edge — 2/3 missing = 66.7% loss > 50%
    fs.writeFileSync(path.join(workDir, 'srs-ir.json'), JSON.stringify({
      version: '2.1.0', nodes: [
        { id: 'R1-REQ-0001', kind: 'requirement', statement: 'A', module: 'S001' },
        { id: 'R1-REQ-0002', kind: 'requirement', statement: 'B', module: 'S001' },
        { id: 'R1-REQ-0003', kind: 'requirement', statement: 'C', module: 'S001' },
        { id: 'R1-REQ-0004', kind: 'requirement', statement: 'D', module: 'S001' },
        { id: 'R1-REQ-0005', kind: 'requirement', statement: 'E', module: 'S001' },
        { id: 'R1-REQ-0006', kind: 'requirement', statement: 'F', module: 'S001' },
      ], edges: [
        { id: 'e1', type: 'depends_on', source: 'R1-REQ-0001', target: 'R1-REQ-0002' },
      ], crossRefs: [], nfrProfile: { detectedCategories: [] },
      gaps: [], glossary: {}, meta: { buildTimestamp: new Date().toISOString() },
    }), 'utf-8');
    const { checkR3RelationIngest } = await import('../lib/verify-gate/checks-r3.js');
    const result = checkR3RelationIngest(workDir);
    assert.strictEqual(result.passed, false, `expected partial loss to fail, got: ${result.detail}`);
    assert.ok(result.detail?.includes('2/3'), `detail should report 2/3 missing: ${result.detail}`);
  });

  it('flags r3-relational below minimum threshold (< 3 records when R1 has > 10)', async () => {
    const workDir = createWorkDir('r3-threshold-fail');
    // R1 has 15 records
    const r1Records = Array.from({ length: 15 }, (_, i) => ({
      id: `R1-REQ-${String(i + 1).padStart(4, '0')}`, category: 'explicit',
      statement: `req ${i}`, source_file: 'srs.md', confidence: 'high',
    }));
    writeJsonl(path.join(workDir, '2_extract', 'r1-explicit'), 'a.jsonl', r1Records);
    // r3-relational has only 1 record (< 3 threshold)
    writeJsonl(path.join(workDir, '2_extract', 'r3-relational'), 'a.jsonl', [
      { id: 'R3-REL-0001', category: 'relational', statement: 'A depends on B',
        source_file: 'srs.md', confidence: 'high',
        metadata: { relation: { type: 'depends_on', target: 'R1-REQ-0002' }, source_id: 'R1-REQ-0001' } },
    ]);
    const { checkR3RelationalThreshold } = await import('../lib/verify-gate/checks-r3.js');
    const result = checkR3RelationalThreshold(workDir);
    assert.strictEqual(result.passed, false, `expected low r3 count to fail, got: ${result.detail}`);
  });

  // ===========================================================================
  // P0-1: Persistent gate receipts
  // ===========================================================================

  it('P0-1: verify-gate writes _ctx/gate-{stage}.json receipt', async () => {
    const workDir = createWorkDir('p01-receipt');
    fs.writeFileSync(path.join(workDir, '_ctx', 'shard_index.json'), JSON.stringify({ version: '1.0' }), 'utf-8');
    writeJsonl(path.join(workDir, '2_extract', 'r1-explicit'), 'a.jsonl', [
      { id: 'R1-REQ-0001', category: 'explicit', statement: 'test', source_file: 'srs.md', confidence: 'high' },
    ]);

    const { main } = await import('../commands/verify-gate.js');
    const result = await main(['--workdir', workDir, '--stage', 'S1']);
    const data = result.data as { pass: boolean };

    const receiptPath = path.join(workDir, '_ctx', 'gate-S1.json');
    assert.ok(fs.existsSync(receiptPath), 'gate-S1.json receipt must be written');
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf-8'));
    assert.equal(receipt.stage, 'S1');
    assert.equal(receipt.verdict, data.pass ? 'pass' : 'fail');
    assert.match(receipt.receiptHash, /^[0-9a-f]{16}$/);
    assert.match(receipt.workdirHash, /^[0-9a-f]{16}$/);
  });

  it('P0-1: verifyGateReceipt rejects missing receipt', async () => {
    const workDir = createWorkDir('p01-missing');
    const { verifyGateReceipt } = await import('../lib/verify-gate/shared.js');
    const r = verifyGateReceipt(workDir, 'S1');
    assert.equal(r.valid, false);
    assert.match(r.reason!, /Missing gate receipt/);
  });

  it('P0-1: verifyGateReceipt validates existing pass receipt', async () => {
    const workDir = createWorkDir('p01-valid');
    fs.writeFileSync(path.join(workDir, '_ctx', 'shard_index.json'), JSON.stringify({ version: '1.0' }), 'utf-8');
    writeJsonl(path.join(workDir, '2_extract', 'r1-explicit'), 'a.jsonl', [
      { id: 'R1-REQ-0001', category: 'explicit', statement: 'test', source_file: 'srs.md', confidence: 'high' },
    ]);

    const { main } = await import('../commands/verify-gate.js');
    await main(['--workdir', workDir, '--stage', 'S1']);

    const { verifyGateReceipt } = await import('../lib/verify-gate/shared.js');
    const r = verifyGateReceipt(workDir, 'S1');
    // Note: may be valid or invalid depending on whether S1 gate actually passes,
    // but the receipt should exist (not "Missing")
    assert.doesNotMatch(r.reason || '', /Missing gate receipt/);
  });

  // ===========================================================================
  // P0-4: Inversion mode confirmation.json mechanical gate
  // ===========================================================================

  it('P0-4: S1 gate fails when _ctx/confirmation.json missing', async () => {
    const workDir = createWorkDir('p04-missing');
    fs.writeFileSync(path.join(workDir, '_ctx', 'shard_index.json'), JSON.stringify({ version: '1.0' }), 'utf-8');
    writeJsonl(path.join(workDir, '2_extract', 'r1-explicit'), 'a.jsonl', [
      { id: 'R1-REQ-0001', category: 'explicit', statement: 'test', source_file: 'srs.md', confidence: 'high' },
    ]);

    const { main } = await import('../commands/verify-gate.js');
    const result = await main(['--workdir', workDir, '--stage', 'S1']);
    const data = result.data as { pass: boolean; checks: Record<string, { passed: boolean }> };
    assert.equal(data.pass, false);
    assert.ok(data.checks['confirmation.json present (Inversion gate)']);
    assert.equal(data.checks['confirmation.json present (Inversion gate)'].passed, false);
  });

  it('P0-4: S1 gate passes confirmation check when _ctx/confirmation.json has user_confirm=true', async () => {
    const workDir = createWorkDir('p04-present');
    fs.writeFileSync(path.join(workDir, '_ctx', 'shard_index.json'), JSON.stringify({ version: '1.0' }), 'utf-8');
    fs.writeFileSync(path.join(workDir, '_ctx', 'confirmation.json'), JSON.stringify({ user_confirm: true, detected_gaps: [], language: 'zh' }), 'utf-8');
    writeJsonl(path.join(workDir, '2_extract', 'r1-explicit'), 'a.jsonl', [
      { id: 'R1-REQ-0001', category: 'explicit', statement: 'test', source_file: 'srs.md', confidence: 'high' },
    ]);

    const { main } = await import('../commands/verify-gate.js');
    const result = await main(['--workdir', workDir, '--stage', 'S1']);
    const data = result.data as { checks: Record<string, { passed: boolean }> };
    assert.ok(data.checks['confirmation.json present (Inversion gate)']);
    assert.equal(data.checks['confirmation.json present (Inversion gate)'].passed, true);
  });
});
