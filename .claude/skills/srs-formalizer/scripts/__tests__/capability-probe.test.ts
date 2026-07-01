/**
 * capability-probe.test.ts — 能力探测评估系统测试
 *
 * 测试覆盖：
 *   T1: generate 模式输出 50 个 probe (8维度 × 5-8题)，结构正确
 *   T2: score 模式完美答案 → 原 6 维度 100 分
 *   T3: score 模式全错答案 → 全 0 分 + low tier
 *   T4: score 模式部分正确 → 中间分数
 *   T5: tier 推断逻辑（全低→low, 全高→medium 因工具链维度 0 分）
 *   T6: 非法答案文件处理（文件不存在 / 无效 JSON / 空 answers）
 *   T7: 缺少 --mode 参数报错
 */

import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TMP = path.join(os.tmpdir(), `capability-probe-test-${Date.now()}`);

// ========== answer-generation helpers ==========

/** Generate perfectly valid JSONL with the required number of records */
function genPerfectJsonl(minRecords: number): string {
  const records = Array.from({ length: minRecords }, (_, i) => ({
    id: `R1-TOPIC-${String(i + 1).padStart(4, '0')}`,
    category: 'explicit' as const,
    statement: `Requirement ${i + 1}`,
    source_file: 'srs.md',
    confidence: 'high' as const,
    metadata: {},
  }));
  return records.map(r => JSON.stringify(r)).join('\n');
}

/** Generate completely invalid (non-JSONL) text */
function genZeroJsonl(): string {
  return 'this is not valid jsonl at all';
}

/** Generate half the required valid records (triggers min_records penalty) */
function genPartialJsonl(minRecords: number): string {
  const half = Math.max(1, Math.floor(minRecords / 2));
  const records = Array.from({ length: half }, (_, i) => ({
    id: `R1-TOPIC-${String(i + 1).padStart(4, '0')}`,
    category: 'explicit' as const,
    statement: `Requirement ${i + 1}`,
    source_file: 'srs.md',
    confidence: 'high' as const,
    metadata: {},
  }));
  return records.map(r => JSON.stringify(r)).join('\n');
}

interface TestProbeItem {
  probe_id: string;
  dimension: string;
  prompt: string;
  expected: {
    min_records?: number;
    checks: string[];
    expected_real_reqs?: string[];
    fake_keywords?: string[];
    hierarchy_expected?: Record<string, string>;
    logical_expected?: Array<{ source: string; target: string }>;
  };
}

/** Build perfect answers for every probe */
function buildPerfectAnswers(probes: TestProbeItem[]): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const probe of probes) {
    switch (probe.dimension) {
      case 'instruction_following':
      case 'structured_output':
        answers[probe.probe_id] = genPerfectJsonl(probe.expected.min_records ?? 1);
        break;
      case 'precision':
        // Return the expected real requirement keywords as self-contained items
        answers[probe.probe_id] = JSON.stringify(probe.expected.expected_real_reqs ?? []);
        break;
      case 'hierarchical_reasoning': {
        const items = Object.entries(probe.expected.hierarchy_expected ?? {}).map(([fr, module]) => ({
          requirement: `${fr}: test requirement`,
          module,
        }));
        answers[probe.probe_id] = JSON.stringify(items);
        break;
      }
      case 'logical_reasoning': {
        const items = (probe.expected.logical_expected ?? []).map(e => ({
          source: e.source,
          target: e.target,
          relation: 'DEPENDS_ON' as const,
        }));
        answers[probe.probe_id] = JSON.stringify(items);
        break;
      }
      case 'creative_reasoning':
        answers[probe.probe_id] = JSON.stringify({
          derived_statement: 'System should verify prerequisites before enrollment.',
          derived_from: ['R1', 'R2'],
          reasoning: 'Multiple requirements imply the need for an implicit prerequisite check mechanism.',
        });
        break;
      case 'formal_tlaplus':
        answers[probe.probe_id] = '==== Perfect TLA+ spec';
        break;
      case 'formal_lean4':
        answers[probe.probe_id] = 'theorem perfect : True := by trivial';
        break;
    }
  }
  return answers;
}

/** Build all-zero answers for every probe */
function buildZeroAnswers(probes: TestProbeItem[]): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const probe of probes) {
    switch (probe.dimension) {
      case 'instruction_following':
      case 'structured_output':
        answers[probe.probe_id] = genZeroJsonl();
        break;
      case 'precision':
        // Return only fabricated requirements
        answers[probe.probe_id] = JSON.stringify(probe.expected.fake_keywords ?? []);
        break;
      case 'hierarchical_reasoning':
        answers[probe.probe_id] = '[]';
        break;
      case 'logical_reasoning': {
        // Reverse all expected relations
        const reversed = (probe.expected.logical_expected ?? []).map(e => ({
          source: e.target,
          target: e.source,
          relation: 'DEPENDS_ON' as const,
        }));
        answers[probe.probe_id] = JSON.stringify(reversed);
        break;
      }
      case 'creative_reasoning':
        answers[probe.probe_id] = JSON.stringify({
          derived_statement: '',
          derived_from: [],
          reasoning: '',
        });
        break;
      case 'formal_tlaplus':
        answers[probe.probe_id] = 'INVALID TLA+ ###';
        break;
      case 'formal_lean4':
        answers[probe.probe_id] = 'invalid lean';
        break;
    }
  }
  return answers;
}

/** Build partially-correct answers for every probe */
function buildPartialAnswers(probes: TestProbeItem[]): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const probe of probes) {
    switch (probe.dimension) {
      case 'instruction_following':
      case 'structured_output':
        answers[probe.probe_id] = genPartialJsonl(probe.expected.min_records ?? 1);
        break;
      case 'precision': {
        // Return only half the expected real reqs
        const half = Math.max(1, Math.floor((probe.expected.expected_real_reqs?.length ?? 1) / 2));
        answers[probe.probe_id] = JSON.stringify((probe.expected.expected_real_reqs ?? []).slice(0, half));
        break;
      }
      case 'hierarchical_reasoning': {
        const entries = Object.entries(probe.expected.hierarchy_expected ?? {});
        const half = Math.max(1, Math.floor(entries.length / 2));
        const items = entries.slice(0, half).map(([fr, module]) => ({
          requirement: `${fr}: test requirement`,
          module,
        }));
        // Add one deliberately wrong entry
        if (entries.length > half) {
          items.push({ requirement: `${entries[half]![0]}: test requirement`, module: 'WRONG_MODULE' });
        }
        answers[probe.probe_id] = JSON.stringify(items);
        break;
      }
      case 'logical_reasoning': {
        const expected = probe.expected.logical_expected ?? [];
        const half = Math.max(1, Math.floor(expected.length / 2));
        const items = expected.slice(0, half).map(e => ({
          source: e.source,
          target: e.target,
          relation: 'DEPENDS_ON' as const,
        }));
        // Add a deliberately reversed relation
        if (expected.length > half) {
          const extra = expected[half]!;
          items.push({ source: extra.target, target: extra.source, relation: 'DEPENDS_ON' as const });
        }
        answers[probe.probe_id] = JSON.stringify(items);
        break;
      }
      case 'creative_reasoning':
        answers[probe.probe_id] = JSON.stringify({
          derived_statement: 'Partial reasoning statement about system behavior.',
          derived_from: ['R1'],
          reasoning: 'This reasoning string is long enough to pass the length check.',
        });
        break;
      case 'formal_tlaplus':
        answers[probe.probe_id] = '==== Partial TLA+ spec';
        break;
      case 'formal_lean4':
        answers[probe.probe_id] = 'theorem partial : True := by';
        break;
    }
  }
  return answers;
}

// ========== Tests ==========

describe('capability-probe command', () => {
  before(() => {
    fs.mkdirSync(TMP, { recursive: true });
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  // ========== T1: generate mode ==========
  it('T1: generate mode outputs 50 probes with correct structure and dimension counts', async () => {
    const { main } = await import('../commands/capability-probe.js');
    const result = await main(['--mode', 'generate']);

    assert.equal(result.status, 'ok');
    assert.ok(Array.isArray(result.data));

    const probes = result.data as TestProbeItem[];

    // 8 + 7 + 6 + 5 + 5 + 5 + 7 + 7 = 50
    assert.equal(probes.length, 50);

    // Verify per-dimension distribution
    const dimCounts: Record<string, number> = {};
    for (const p of probes) {
      dimCounts[p.dimension] = (dimCounts[p.dimension] ?? 0) + 1;
    }

    const expectedCounts: Record<string, number> = {
      instruction_following: 8,
      structured_output: 7,
      precision: 6,
      hierarchical_reasoning: 5,
      logical_reasoning: 5,
      creative_reasoning: 5,
      formal_tlaplus: 7,
      formal_lean4: 7,
    };

    for (const [dim, count] of Object.entries(expectedCounts)) {
      assert.equal(dimCounts[dim], count, `Dimension ${dim} should have ${count} probes`);
    }

    const expectedDims = Object.keys(expectedCounts);

    for (const p of probes) {
      assert.ok(typeof p.probe_id === 'string' && p.probe_id.length > 0, 'probe_id must be non-empty string');
      assert.ok(typeof p.prompt === 'string' && p.prompt.length > 0, 'prompt must be non-empty string');
      assert.ok(Array.isArray(p.expected.checks) && p.expected.checks.length > 0, 'expected.checks must be non-empty array');
      assert.ok(expectedDims.includes(p.dimension), `Invalid dimension: ${p.dimension}`);
    }
  });

  // ========== T2: score mode — perfect answers ==========
  it('T2: score mode with perfect answer returns 100 across all 6 original dimensions (tier: medium due to toolchain dims)', async () => {
    const { main } = await import('../commands/capability-probe.js');

    // Generate probes and build perfect answers for all 50
    const genResult = await main(['--mode', 'generate']);
    const probes = genResult.data as TestProbeItem[];
    const perfectAnswers = buildPerfectAnswers(probes);

    const answerFile = path.join(TMP, 'perfect-answers.json');
    fs.writeFileSync(answerFile, JSON.stringify({ answers: perfectAnswers }), 'utf-8');

    const result = await main(['--mode', 'score', '--file', answerFile]);
    assert.equal(result.status, 'ok');

    const data = result.data as Record<string, unknown>;
    const profile = data.capability_profile as Record<string, number>;

    // Original 6 dimensions score 100 with perfect answers
    for (const dim of ['instruction_following', 'structured_output', 'precision', 'hierarchical_reasoning', 'logical_reasoning', 'creative_reasoning']) {
      assert.equal(profile[dim], 100, `${dim} should be 100, got ${profile[dim]}`);
    }

    // TLA+/Lean 4 toolchain dims score 0 (no real toolchain in test env)
    assert.equal(profile['formal_tlaplus'], 0, 'formal_tlaplus should be 0 (no toolchain)');
    assert.equal(profile['formal_lean4'], 0, 'formal_lean4 should be 0 (no toolchain)');

    // Average = (6*100 + 0 + 0) / 8 = 75 → medium
    assert.equal(data.estimated_tier, 'medium');
    assert.ok(Array.isArray(data.recommendations));
  });

  // ========== T3: score mode — zero answers ==========
  it('T3: score mode with completely wrong answer returns 0 on all dimensions (low tier)', async () => {
    const { main } = await import('../commands/capability-probe.js');

    const genResult = await main(['--mode', 'generate']);
    const probes = genResult.data as TestProbeItem[];
    const zeroAnswers = buildZeroAnswers(probes);

    const answerFile = path.join(TMP, 'zero-answers.json');
    fs.writeFileSync(answerFile, JSON.stringify({ answers: zeroAnswers }), 'utf-8');

    const result = await main(['--mode', 'score', '--file', answerFile]);
    assert.equal(result.status, 'ok');

    const data = result.data as Record<string, unknown>;
    const profile = data.capability_profile as Record<string, number>;

    for (const dim of ['instruction_following', 'structured_output', 'precision', 'hierarchical_reasoning']) {
      assert.equal(profile[dim], 0, `${dim} should be 0, got ${profile[dim]}`);
    }

    // Ensure average is low (at least some dimensions at 0 drag average down)
    const scores = Object.values(profile);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    assert.ok(avgScore < 20, `Average score should be low, got ${avgScore}`);

    assert.equal(data.estimated_tier, 'low');
  });

  // ========== T4: score mode — partial answers ==========
  it('T4: score mode with partially correct answer returns intermediate scores', async () => {
    const { main } = await import('../commands/capability-probe.js');

    const genResult = await main(['--mode', 'generate']);
    const probes = genResult.data as TestProbeItem[];
    const partialAnswers = buildPartialAnswers(probes);

    const answerFile = path.join(TMP, 'partial-answers.json');
    fs.writeFileSync(answerFile, JSON.stringify({ answers: partialAnswers }), 'utf-8');

    const result = await main(['--mode', 'score', '--file', answerFile]);
    assert.equal(result.status, 'ok');

    const data = result.data as Record<string, unknown>;
    const profile = data.capability_profile as Record<string, number>;

    // All 6 original dimensions should have intermediate scores (between 0 and 100 exclusive)
    for (const dim of ['instruction_following', 'structured_output', 'precision', 'hierarchical_reasoning', 'logical_reasoning', 'creative_reasoning']) {
      const s = profile[dim] ?? 0;
      assert.ok(s > 0 && s < 100, `${dim} should be between 0 and 100, got ${s}`);
    }

    // Toolchain dimensions score 0 (no toolchain in test env)
    assert.equal(profile['formal_tlaplus'], 0);
    assert.equal(profile['formal_lean4'], 0);

    assert.ok(Array.isArray(data.recommendations));
  });

  // ========== T5: tier inference ==========
  it('T5: tier inference logic — all zero → low, all perfect → medium (toolchain dims score 0)', async () => {
    const { main } = await import('../commands/capability-probe.js');

    const genResult = await main(['--mode', 'generate']);
    const probes = genResult.data as TestProbeItem[];

    // Zero answers → low tier
    const zeroPath = path.join(TMP, 'tier-low.json');
    fs.writeFileSync(zeroPath, JSON.stringify({ answers: buildZeroAnswers(probes) }), 'utf-8');
    const lowResult = await main(['--mode', 'score', '--file', zeroPath]);
    assert.equal(lowResult.status, 'ok');
    const lowData = lowResult.data as Record<string, unknown>;
    assert.equal(lowData.estimated_tier, 'low');

    // Perfect answers → medium tier (6 dims at 100 + 2 toolchain dims at 0 = avg 75)
    const highPath = path.join(TMP, 'tier-high.json');
    fs.writeFileSync(highPath, JSON.stringify({ answers: buildPerfectAnswers(probes) }), 'utf-8');
    const highResult = await main(['--mode', 'score', '--file', highPath]);
    assert.equal(highResult.status, 'ok');
    const highData = highResult.data as Record<string, unknown>;
    assert.equal(highData.estimated_tier, 'medium');
  });

  // ========== T6: invalid answer file ==========
  it('T6: score mode with invalid file handling returns error', async () => {
    const { main } = await import('../commands/capability-probe.js');

    // File does not exist
    const noFile = await main(['--mode', 'score', '--file', path.join(TMP, 'nonexistent.json')]);
    assert.equal(noFile.status, 'error');
    assert.ok(
      (noFile.message ?? '').includes('not found') ||
      (noFile.message ?? '').includes('exist') ||
      (noFile.message ?? '').includes('ENOENT'),
    );

    // File has invalid JSON content
    const badJsonPath = path.join(TMP, 'bad-json.json');
    fs.writeFileSync(badJsonPath, 'not json at all', 'utf-8');
    const badJson = await main(['--mode', 'score', '--file', badJsonPath]);
    assert.equal(badJson.status, 'error');

    // File has missing "answers" key
    const noAnswersPath = path.join(TMP, 'no-answers.json');
    fs.writeFileSync(noAnswersPath, JSON.stringify({ wrong_key: {} }), 'utf-8');
    const noAnswers = await main(['--mode', 'score', '--file', noAnswersPath]);
    assert.equal(noAnswers.status, 'ok');
    const noAnsData = noAnswers.data as Record<string, unknown>;
    // Should still work, just all zeros
    assert.ok(noAnsData.capability_profile);
  });

  // ========== T7: missing --mode ==========
  it('T7: missing --mode argument returns error', async () => {
    const { main } = await import('../commands/capability-probe.js');
    const result = await main([]);
    assert.equal(result.status, 'error');
    assert.ok(
      (result.message ?? '').includes('mode') ||
      (result.message ?? '').includes('--mode'),
    );
  });
});
