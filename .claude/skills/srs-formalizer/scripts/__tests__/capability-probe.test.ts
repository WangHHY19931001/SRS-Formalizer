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

/** Generate perfectly valid JSONL with custom ID prefix */
function genPerfectJsonlPrefix(minRecords: number, prefix: string): string {
  const records = Array.from({ length: minRecords }, (_, i) => ({
    id: `${prefix}-TOPIC-${String(i + 1).padStart(4, '0')}`,
    category: 'explicit' as const,
    statement: `Requirement ${i + 1}`,
    source_file: 'srs.md',
    confidence: 'high' as const,
    metadata: {},
  }));
  return records.map(r => JSON.stringify(r)).join('\n');
}

/** Generate valid JSONL with special characters for special_chars_preserved test */
function genPerfectJsonlSpecialChars(minRecords: number): string {
  const specialContents = [
    '密码必须包含特殊字符（如 !@#$%^&*()、中文、emoji \u{1F600} 等）',
    '学生姓名必须支持 Unicode 字符，包括 "José"、"Müller" 和 "李"',
    '系统在遇到"内部错误"时显示 message：系统处理请求时出错，请稍后重试',
  ];
  const records = Array.from({ length: Math.min(minRecords, specialContents.length) }, (_, i) => ({
    id: `R1-TOPIC-${String(i + 1).padStart(4, '0')}`,
    category: 'explicit' as const,
    statement: specialContents[i],
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
    logical_expected?: Array<{ source: string; target: string; relation?: string }>;
    max_records?: number;
    id_prefix?: string;
    empty_input?: boolean;
    refuse_wrong_template?: boolean;
    refuse_missing_field?: boolean;
    transitive_dep?: boolean;
    cyclic_dep?: boolean;
    creative_domain?: string;
    dedup_required?: boolean;
    cross_line_ref?: boolean;
    nested_metadata?: boolean;
    unicode_content?: boolean;
    contradiction_detection?: boolean;
    long_text?: boolean;
  };
}

/** Build perfect answers for every probe */
function buildPerfectAnswers(probes: TestProbeItem[]): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const probe of probes) {
    switch (probe.dimension) {
      case 'instruction_following': {
        if (probe.expected.empty_input) {
          answers[probe.probe_id] = '';
        } else if (probe.expected.refuse_wrong_template) {
          answers[probe.probe_id] = '无法提取：模板要求 student_name, phone_number, home_address 等字段在 SRS 需求中不存在，拒绝生成。';
        } else if (probe.expected.refuse_missing_field) {
          answers[probe.probe_id] = '注意：模板缺少 source_file 和 metadata 字段。但仍按现有模板格式输出：\n' + genPerfectJsonl(probe.expected.min_records ?? 1);
        } else if (probe.expected.id_prefix) {
          answers[probe.probe_id] = genPerfectJsonlPrefix(probe.expected.min_records ?? 1, probe.expected.id_prefix);
        } else if (probe.expected.checks.includes('special_chars_preserved')) {
          answers[probe.probe_id] = genPerfectJsonlSpecialChars(probe.expected.min_records ?? 1);
        } else {
          answers[probe.probe_id] = genPerfectJsonl(probe.expected.min_records ?? 1);
        }
        break;
      }
      case 'structured_output': {
        const minRec = probe.expected.min_records ?? 1;
        if (probe.expected.nested_metadata) {
          // Probe-2: needs nested metadata with priority, module, contacts, tags
          const records = Array.from({ length: minRec }, (_, i) => ({
            id: `R1-TOPIC-${String(i + 1).padStart(4, '0')}`,
            category: 'explicit' as const,
            statement: `Requirement ${i + 1} description`,
            source_file: 'srs.md',
            confidence: 'high' as const,
            metadata: {
              priority: 'P0',
              module: ['login', 'course', 'enroll'][i] ?? 'general',
              contacts: { owner: 'Zhang Wei', reviewer: 'Li Ming' },
              tags: ['core', 'security'],
            },
          }));
          answers[probe.probe_id] = records.map(r => JSON.stringify(r)).join('\n');
        } else if (probe.expected.unicode_content) {
          // Probe-4: needs mixed Chinese/English with Unicode names
          const unicodeStatements = [
            'The system must support students using student ID and password to login (登录系统).',
            'The system must display all available courses including course name, instructor (教师), and credits (学分).',
            'Students submit enrollment application during open period. Deadline: semester week 3.',
            'The system must ensure data consistency across read and write operations (读写操作).',
            'The system supports Unicode characters in student names such as José, Müller, 李小龙.',
            'API response must include status code, message (中文), and data payload.',
          ];
          const records = Array.from({ length: Math.min(minRec, unicodeStatements.length) }, (_, i) => ({
            id: `R1-TOPIC-${String(i + 1).padStart(4, '0')}`,
            category: 'explicit' as const,
            statement: unicodeStatements[i],
            source_file: 'srs.md',
            confidence: 'high' as const,
            metadata: {},
          }));
          answers[probe.probe_id] = records.map(r => JSON.stringify(r)).join('\n');
        } else if (probe.expected.contradiction_detection) {
          // Probe-6: adopt approved revision (FR-004->第六周), exclude rejected/unconfirmed
          const statements = [
            '系统必须支持学生通过学号和密码登录。',
            '系统必须展示课程列表，包含课程名称、教师姓名、学分和课程容量上限 50 人。',
            '学生可以在选课开放期间提交选课申请。',
            '退选截止日期为每学期第六周周五。',
            '系统必须记录所有选课操作日志。',
          ];
          const records = Array.from({ length: Math.min(minRec, statements.length) }, (_, i) => ({
            id: `R1-TOPIC-${String(i + 1).padStart(4, '0')}`,
            category: 'explicit' as const,
            statement: statements[i],
            source_file: 'srs.md',
            confidence: 'high' as const,
            metadata: {},
          }));
          answers[probe.probe_id] = records.map(r => JSON.stringify(r)).join('\n');
        } else if (probe.expected.long_text) {
          // Probe-7: generate ~20 records covering all chapters
          const chapterStatements = [
            '系统必须支持学生通过学号（10位数字）和密码登录。',
            '系统必须支持教师通过工号和密码登录。',
            '管理员可创建新课程，录入课程代码、名称、学分、学时、开课院系。',
            '学生可按课程名称、教师姓名、开课院系等条件查询课程。',
            '系统必须展示每门课程的详细信息（简介、大纲、考核方式、参考书目）。',
            '每门课程有容量限制，系统实时显示已选人数和剩余名额。',
            '系统检查教室和时间冲突。',
            '学生必须在选课期间登录系统提交选课申请。',
            '系统自动检查先修课程要求。',
            '系统在补退选阶段支持退选课程。',
            '选课结束后系统自动生成学生课表。',
            '教师通过系统录入学生成绩（平时40%+期末60%）。',
            '系统自动计算最终成绩和GPA。',
            '学生可随时查询已发布课程的成绩。',
            '系统在评估窗口内支持学生匿名评价教师。',
            '系统自动计算教师综合评分。',
            '系统每日凌晨自动备份数据库。',
            '系统记录所有关键操作日志。',
            '系统基于RBAC管理用户权限。',
            '系统支持管理员进行系统参数配置。',
          ];
          const records = chapterStatements.map((stmt, i) => ({
            id: `R1-TOPIC-${String(i + 1).padStart(4, '0')}`,
            category: 'explicit' as const,
            statement: stmt,
            source_file: 'srs.md',
            confidence: 'high' as const,
            metadata: {},
          }));
          answers[probe.probe_id] = records.map(r => JSON.stringify(r)).join('\n');
        } else {
          answers[probe.probe_id] = genPerfectJsonl(minRec);
        }
        break;
      }
      case 'precision':
        // Return the expected real requirement keywords as self-contained items
        answers[probe.probe_id] = JSON.stringify(probe.expected.expected_real_reqs ?? []);
        break;
      case 'hierarchical_reasoning': {
        const expected = probe.expected.hierarchy_expected ?? {};
        if (Object.keys(expected).length === 0) {
          // Probe-5: flat text auto-infer — return 12 reasonable module assignments
          const items = [
            { requirement: 'FR-001: student login', module: '用户管理' },
            { requirement: 'FR-002: teacher login', module: '用户管理' },
            { requirement: 'FR-003: browse courses', module: '课程管理' },
            { requirement: 'FR-004: admin course mgmt', module: '课程管理' },
            { requirement: 'FR-005: enroll courses', module: '选课管理' },
            { requirement: 'FR-006: drop courses', module: '选课管理' },
            { requirement: 'FR-007: show capacity', module: '选课管理' },
            { requirement: 'FR-008: reject full course', module: '选课管理' },
            { requirement: 'FR-009: enter grades', module: '成绩管理' },
            { requirement: 'FR-010: view grades', module: '成绩管理' },
            { requirement: 'FR-011: init semester', module: '系统管理' },
            { requirement: 'FR-012: daily backup', module: '系统管理' },
          ];
          answers[probe.probe_id] = JSON.stringify(items);
        } else {
          const items = Object.entries(expected).map(([fr, module]) => ({
            requirement: `${fr}: test requirement`,
            module,
          }));
          answers[probe.probe_id] = JSON.stringify(items);
        }
        break;
      }
      case 'logical_reasoning': {
        const items = (probe.expected.logical_expected ?? []).map(e => ({
          source: e.source,
          target: e.target,
          relation: e.relation ?? 'DEPENDS_ON',
        }));
        if (probe.expected.transitive_dep) {
          // Add a transitive dependency
          items.push({ source: 'R-E', target: 'R-A', relation: 'DEPENDS_ON_TRANSITIVE' });
        }
        if (probe.expected.cyclic_dep) {
          items.push({ source: 'cycle_detected', target: 'R-A→R-B→R-C→R-I→R-A', relation: 'CYCLE' });
        }
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
      case 'instruction_following': {
        if (probe.expected.empty_input) {
          // Wrong: hallucinate content for empty input
          answers[probe.probe_id] = '{"id":"R1-HALLUCINATE-0001","category":"explicit","statement":"fake requirement"}';
        } else if (probe.expected.refuse_wrong_template) {
          // Wrong: blindly follow the wrong template
          answers[probe.probe_id] = '{"student_name":"Alice","phone_number":"123","home_address":"Beijing"}';
        } else if (probe.expected.refuse_missing_field) {
          // Wrong: blindly follow incomplete template without warning
          answers[probe.probe_id] = genZeroJsonl();
        } else {
          answers[probe.probe_id] = genZeroJsonl();
        }
        break;
      }
      case 'structured_output':
        answers[probe.probe_id] = genZeroJsonl();
        break;
      case 'precision': {
        // Return empty array — scores 0 on ALL checks (no_fabricated, no_missing, dedup_correct, cross_line_resolved)
        answers[probe.probe_id] = '[]';
        break;
      }
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
      case 'instruction_following': {
        if (probe.expected.empty_input) {
          // Partial wrong: output one record when should output zero
          answers[probe.probe_id] = '{"id":"R1-TOPIC-0001","category":"explicit","statement":"partial","source_file":"srs.md","confidence":"high","metadata":{}}';
        } else if (probe.expected.refuse_wrong_template) {
          // Partial: point out issue but still output some content
          answers[probe.probe_id] = '模板有问题但还是要输出：\n{"student_name":"test","phone_number":"000","home_address":"test"}';
        } else {
          answers[probe.probe_id] = genPartialJsonl(probe.expected.min_records ?? 1);
        }
        break;
      }
      case 'structured_output':
        answers[probe.probe_id] = genPartialJsonl(probe.expected.min_records ?? 1);
        break;
      case 'precision': {
        const realReqs = probe.expected.expected_real_reqs ?? [];
        const fakeReqs = probe.expected.fake_keywords ?? [];
        const half = Math.max(1, Math.floor(realReqs.length / 2));
        const partial = [...realReqs.slice(0, half)];
        // Add one fake to ensure no_fabricated triggers partial penalty
        if (fakeReqs.length > 0) partial.push(fakeReqs[0]!);
        answers[probe.probe_id] = JSON.stringify(partial);
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
