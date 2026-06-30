/**
 * capability-probe.ts — 能力探测评估系统
 *
 * CLI: npx tsx index.ts capability-probe --workdir <path> [--mode generate|score [--file <path>]]
 *
 * 功能：
 *   --mode generate : 输出一组标准化评估题（JSON 数组），编排者将其作为 LLM prompt
 *   --mode score --file <llm_answer.json> : 读取 LLM 回答，逐题判分，输出能力画像
 *
 * 6 个评估维度：
 *   instruction_following  | JSONL 格式遵循度
 *   structured_output      | 非规范化文本 → 合法 JSONL
 *   precision              | 区分真实需求与编造需求
 *   hierarchical_reasoning | 需求归类到模块
 *   logical_reasoning      | 推导 DEPENDS_ON 关系
 *   creative_reasoning     | 推导隐式需求
 */

import * as fs from 'node:fs';
import type { CliResult } from '../types/index.js';

// ===================== Type Definitions =====================

type Dimension =
  | 'instruction_following'
  | 'structured_output'
  | 'precision'
  | 'hierarchical_reasoning'
  | 'logical_reasoning'
  | 'creative_reasoning';

interface ProbeItem {
  probe_id: string;
  dimension: Dimension;
  prompt: string;
  expected: {
    min_records?: number;
    checks: string[];
  };
}

interface ProbeResult {
  probe_id: string;
  dimension: Dimension;
  score: number;
  details: string[];
  passed: boolean;
}

interface CapabilityProfile {
  instruction_following: number;
  structured_output: number;
  precision: number;
  hierarchical_reasoning: number;
  logical_reasoning: number;
  creative_reasoning: number;
}

type Tier = 'low' | 'medium' | 'high';

// ===================== Argument Parsing =====================

function parseArg(args: string[], name: string): string | null {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1]!;
}

// ===================== Probe Generation =====================

function generateProbes(): ProbeItem[] {
  return [
    generateInstructionFollowingProbe(),
    generateStructuredOutputProbe(),
    generatePrecisionProbe(),
    generateHierarchicalReasoningProbe(),
    generateLogicalReasoningProbe(),
    generateCreativeReasoningProbe(),
  ];
}

function generateInstructionFollowingProbe(): ProbeItem {
  const prompt = `你是一个需求提取器。请将以下 3 条 SRS 需求转换为 JSONL 格式。

SRS 需求：
1. 系统必须支持学生通过学号和密码登录。
2. 系统必须展示所有可用课程列表，包括课程名称、教师和学分。
3. 学生可以在选课开放期间提交选课申请。

每条 JSONL 记录必须包含以下字段：
- id: 格式为 R1-<TOPIC>-0001（例如 R1-LOGIN-0001）
- category: "explicit"
- statement: 需求描述原文
- source_file: "srs.md"
- confidence: "high"
- metadata: {}

请输出 3 行 JSONL，不要包含其他文字。`;

  return {
    probe_id: 'instruction_following-1',
    dimension: 'instruction_following',
    prompt,
    expected: {
      min_records: 3,
      checks: ['id_format', 'category_enum', 'metadata_present'],
    },
  };
}

function generateStructuredOutputProbe(): ProbeItem {
  const prompt = `请将以下不规则的需求描述转换为标准的 JSONL 格式。

不规则文本：
================================
FR-001: login - system must support student login with ID and password
FR-002 courses-list - system must show available courses
FR-003 enroll - student can submit enrollment application during open period
Note: The system should also handle enrollment securely.
FR-004 drop - student can drop courses before deadline
================================

每条 JSONL 记录必须包含以下字段：
- id: 格式为 R1-<TOPIC>-0001
- category: "explicit"
- statement: 翻译为中文的需求描述
- source_file: "srs.md"
- confidence: "high"
- metadata: {}

请输出 4 行 JSONL，只包含标准格式的记录，不要包含其他文字。`;

  return {
    probe_id: 'structured_output-1',
    dimension: 'structured_output',
    prompt,
    expected: {
      min_records: 4,
      checks: ['valid_json', 'required_fields'],
    },
  };
}

function generatePrecisionProbe(): ProbeItem {
  const prompt = `以下包含 6 条需求，其中只有 3 条来自真实的 SRS 文档，另外 3 条是编造的。请只提取真实存在的需求，忽略编造的。

需求列表：
1. 系统必须支持学生通过学号和密码登录。
2. 系统必须支持人脸识别登录。
3. 系统在课程容量已满时必须拒绝超额选课。
4. 系统必须支持支付功能。
5. 系统记录每次选课操作的时间戳和操作人。
6. 系统支持学生之间聊天功能。

请以 JSON 数组形式输出真实的需求，格式：["需求1原文", "需求2原文", ...]`;

  return {
    probe_id: 'precision-1',
    dimension: 'precision',
    prompt,
    expected: {
      checks: ['no_fabricated', 'no_missing'],
    },
  };
}

function generateHierarchicalReasoningProbe(): ProbeItem {
  const prompt = `请将以下 8 条 SRS 需求归类到最合适的模块中。

可选模块：登录认证, 课程管理, 选课管理, 系统管理

需求：
1. FR-001: 系统必须支持学生通过学号和密码登录。
2. FR-002: 系统必须展示所有可用课程列表，包括课程名称、教师和学分。
3. FR-003: 系统必须显示每门课程的容量和当前已选人数。
4. FR-004: 学生可以在选课开放期间提交选课申请。
5. FR-006: 学生可以在退选截止日期前退选课程。
6. FR-007: 系统在选课结束后自动生成每位学生的正式课表。
7. FR-009: 管理员可以添加、修改和删除课程基本信息。
8. FR-011: 系统必须每学期初初始化选课数据库。

请以 JSON 数组格式输出，每条包含 requirement 和 module 字段：
[{"requirement": "FR-001: 系统必须支持学生通过学号和密码登录。", "module": "登录认证"}, ...]`;

  return {
    probe_id: 'hierarchical_reasoning-1',
    dimension: 'hierarchical_reasoning',
    prompt,
    expected: {
      checks: ['accuracy_80pct'],
    },
  };
}

function generateLogicalReasoningProbe(): ProbeItem {
  const prompt = `请根据以下 4 条需求推导它们之间的 DEPENDS_ON 依赖关系。

需求：
R-A: 系统必须每学期初初始化选课数据库。
R-B: 系统必须支持学生通过学号和密码登录。
R-C: 学生可以在选课开放期间提交选课申请。
R-D: 系统在选课结束后自动生成每位学生的正式课表。

如果 X 需要在 Y 之前完成，则 X DEPENDS_ON Y。

请以 JSON 数组格式输出依赖关系：
[{"source": "R-B", "target": "R-A", "relation": "DEPENDS_ON"}, ...]

请只输出 JSON 数组，不要包含其他文字。`;

  return {
    probe_id: 'logical_reasoning-1',
    dimension: 'logical_reasoning',
    prompt,
    expected: {
      checks: ['direction_correct'],
    },
  };
}

function generateCreativeReasoningProbe(): ProbeItem {
  const prompt = `请根据以下 3 条需求推导出 1 条隐式需求（即系统没有明说但逻辑上必须支持的功能）。

需求：
R1: 系统必须显示每门课程的容量和当前已选人数。
R2: 系统在课程容量已满时必须拒绝超额选课。
R3: 系统记录每次选课操作的时间戳和操作人。

请以 JSON 格式输出：
{
  "derived_statement": "...（隐式需求的描述）",
  "derived_from": ["R1", "R2", ...]（基于哪些明示需求推导而来）,
  "reasoning": "...（推导逻辑说明）"
}

请只输出 JSON，不要包含其他文字。`;

  return {
    probe_id: 'creative_reasoning-1',
    dimension: 'creative_reasoning',
    prompt,
    expected: {
      checks: ['derived_from_correct', 'reasoning_plausible'],
    },
  };
}

// ===================== JSON Parsing Helpers =====================

/** 从可能包含额外文字的字符串中提取 JSON 子串并解析 */
function extractJson(text: string): unknown | null {
  // Try parsing whole text first
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through
  }

  // Try to find a JSON object { ... }
  const objMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch {
      // Fall through
    }
  }

  // Try to find a JSON array [ ... ]
  const arrMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      return JSON.parse(arrMatch[0]);
    } catch {
      // Fall through
    }
  }

  return null;
}

/** 尝试将文本解析为 JSONL 记录数组 */
function parseJsonlLines(text: string): Record<string, unknown>[] {
  const lines = text.split('\n');
  const records: Record<string, unknown>[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        records.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Skip invalid lines
    }
  }
  return records;
}

// ===================== Scoring Functions =====================

const VALID_ID_RE = /^R1-[A-Z]+-\d{4}$/;
const VALID_CATEGORIES = ['explicit', 'implicit', 'relational'];
const REQUIRED_FIELDS = ['id', 'category', 'statement', 'source_file', 'confidence'];

/**
 * 逐行评分：instruction_following 和 structured_output 共用此逻辑，
 * 但检查项不同。
 */
function scoreJsonlRecords(
  probe: ProbeItem,
  answer: string,
  checkMap: Record<string, (records: Record<string, unknown>[]) => { score: number; detail: string }>,
): ProbeResult {
  const records = parseJsonlLines(answer);
  const details: string[] = [];
  let totalScore = 0;
  const checks = probe.expected.checks;

  for (const check of checks) {
    const handler = checkMap[check];
    if (handler) {
      const result = handler(records);
      details.push(result.detail);
      totalScore += result.score;
    }
  }

  // min_records penalty: if fewer records than expected
  if (probe.expected.min_records !== undefined && records.length < probe.expected.min_records) {
    details.push(`期望至少 ${probe.expected.min_records} 条记录，实际 ${records.length} 条`);
    totalScore *= records.length / probe.expected.min_records;
  }

  const finalScore = Math.round(totalScore / checks.length);

  return {
    probe_id: probe.probe_id,
    dimension: probe.dimension,
    score: Math.max(0, Math.min(100, finalScore)),
    details,
    passed: finalScore >= 70,
  };
}

function scoreInstructionFollowing(probe: ProbeItem, answer: string): ProbeResult {
  const checkMap: Record<string, (records: Record<string, unknown>[]) => { score: number; detail: string }> = {
    id_format: (records) => {
      if (records.length === 0) return { score: 0, detail: 'id_format: 无记录可检查' };
      const passed = records.filter((r) => VALID_ID_RE.test(String(r.id ?? '')));
      const pct = Math.round((passed.length / records.length) * 100);
      return { score: pct, detail: `id_format: ${passed.length}/${records.length} 条记录 ID 格式正确 (${pct}%)` };
    },
    category_enum: (records) => {
      if (records.length === 0) return { score: 0, detail: 'category_enum: 无记录可检查' };
      const passed = records.filter((r) => VALID_CATEGORIES.includes(String(r.category ?? '')));
      const pct = Math.round((passed.length / records.length) * 100);
      return { score: pct, detail: `category_enum: ${passed.length}/${records.length} 条记录 category 合法 (${pct}%)` };
    },
    metadata_present: (records) => {
      if (records.length === 0) return { score: 0, detail: 'metadata_present: 无记录可检查' };
      const passed = records.filter((r) => r.metadata !== undefined && r.metadata !== null);
      const pct = Math.round((passed.length / records.length) * 100);
      return { score: pct, detail: `metadata_present: ${passed.length}/${records.length} 条记录包含 metadata (${pct}%)` };
    },
  };

  return scoreJsonlRecords(probe, answer, checkMap);
}

function scoreStructuredOutput(probe: ProbeItem, answer: string): ProbeResult {
  const checkMap: Record<string, (records: Record<string, unknown>[]) => { score: number; detail: string }> = {
    valid_json: () => {
      const rawLines = answer.split('\n').filter((l) => l.trim() !== '');
      if (rawLines.length === 0) return { score: 0, detail: 'valid_json: 无输入' };
      const validCount = rawLines.filter((l) => {
        try {
          const p = JSON.parse(l.trim());
          return typeof p === 'object' && p !== null && !Array.isArray(p);
        } catch {
          return false;
        }
      }).length;
      const pct = Math.round((validCount / rawLines.length) * 100);
      return { score: pct, detail: `valid_json: ${validCount}/${rawLines.length} 行合法 JSON (${pct}%)` };
    },
    required_fields: (records) => {
      if (records.length === 0) return { score: 0, detail: 'required_fields: 无记录可检查' };
      const passed = records.filter((r) => REQUIRED_FIELDS.every((f) => r[f] !== undefined && r[f] !== null && r[f] !== ''));
      const pct = Math.round((passed.length / records.length) * 100);
      return { score: pct, detail: `required_fields: ${passed.length}/${records.length} 条记录包含全部必填字段 (${pct}%)` };
    },
  };

  return scoreJsonlRecords(probe, answer, checkMap);
}

// Precision expected: the 3 real requirements
const PRECISION_REAL_REQUIREMENTS = [
  '系统必须支持学生通过学号和密码登录。',
  '系统在课程容量已满时必须拒绝超额选课。',
  '系统记录每次选课操作的时间戳和操作人。',
];

function scorePrecision(probe: ProbeItem, answer: string): ProbeResult {
  const details: string[] = [];
  const parsed = extractJson(answer);
  let extracted: string[] = [];
  let score = 0;
  const checks = probe.expected.checks;

  if (Array.isArray(parsed)) {
    extracted = parsed.map(String);
  }

  if (extracted.length === 0) {
    for (const check of checks) {
      if (check === 'no_fabricated') details.push('no_fabricated: 无提取结果');
      if (check === 'no_missing') details.push('no_missing: 无提取结果');
    }
    return { probe_id: probe.probe_id, dimension: 'precision', score: 0, details, passed: false };
  }

  // Distinctive keywords that identify fake vs real requirements
  const FAKE_KEYWORDS = ['人脸识别', '支付功能', '聊天'];
  const REAL_KEYWORDS = ['学号和密码', '课程容量已满', '时间戳和操作人'];

  const containsFabricated = extracted.some((item) =>
    FAKE_KEYWORDS.some((kw) => item.includes(kw)),
  );

  const fabricatedInAnswer = extracted.filter((item) =>
    FAKE_KEYWORDS.some((kw) => item.includes(kw)),
  );

  if (checks.includes('no_fabricated')) {
    if (containsFabricated) {
      details.push(`no_fabricated: 包含编造需求 (${fabricatedInAnswer.length} 条)`);
    } else {
      details.push('no_fabricated: ✓ 未包含编造需求');
    }
  }

  // Check no_missing: all real requirements should be extracted
  const matchedReals = PRECISION_REAL_REQUIREMENTS.filter((real) =>
    REAL_KEYWORDS.some((kw) => real.includes(kw)) &&
    extracted.some((item) => item.includes(REAL_KEYWORDS.find((kw) => real.includes(kw)) ?? '')),
  );

  if (checks.includes('no_missing')) {
    if (matchedReals.length >= PRECISION_REAL_REQUIREMENTS.length) {
      details.push(`no_missing: ✓ 提取了全部 ${PRECISION_REAL_REQUIREMENTS.length} 条真实需求`);
    } else {
      details.push(`no_missing: 只提取了 ${matchedReals.length}/${PRECISION_REAL_REQUIREMENTS.length} 条真实需求`);
    }
  }

  // Calculate F-score / average
  const precision = extracted.length > 0 ? (extracted.length - fabricatedInAnswer.length) / extracted.length : 0;
  const recall = matchedReals.length / PRECISION_REAL_REQUIREMENTS.length;

  // Convert to score 0-100: average of precision and recall
  score = Math.round(((containsFabricated ? 0 : precision) + recall) / 2 * 100);
  // cap
  score = Math.max(0, Math.min(100, score));

  return {
    probe_id: probe.probe_id,
    dimension: 'precision',
    score,
    details,
    passed: score >= 70,
  };
}

// Expected module assignments for hierarchical_reasoning-1
const HIERARCHICAL_EXPECTED: Record<string, string> = {
  'FR-001': '登录认证',
  'FR-002': '课程管理',
  'FR-003': '选课管理',
  'FR-004': '选课管理',
  'FR-006': '选课管理',
  'FR-007': '系统管理',
  'FR-009': '课程管理',
  'FR-011': '系统管理',
};

function scoreHierarchicalReasoning(probe: ProbeItem, answer: string): ProbeResult {
  const details: string[] = [];
  const parsed = extractJson(answer);
  let assignments: Array<{ requirement: string; module: string }> = [];

  if (Array.isArray(parsed)) {
    assignments = parsed as Array<{ requirement: string; module: string }>;
  }

  if (assignments.length === 0) {
    details.push('accuracy_80pct: 无法解析归类结果');
    return { probe_id: probe.probe_id, dimension: 'hierarchical_reasoning', score: 0, details, passed: false };
  }

  // Map each assignment to expected module by FR-ID
  let correctCount = 0;
  for (const a of assignments) {
    const req = String(a.requirement ?? '');
    const module = String(a.module ?? '');

    // Extract FR-ID from requirement string
    const frMatch = req.match(/(FR-\d{3})/);
    if (frMatch) {
      const frId = frMatch[1]!;
      const expected = HIERARCHICAL_EXPECTED[frId];
      if (expected && module === expected) {
        correctCount++;
      }
    }
  }

  const pct = Math.round((correctCount / assignments.length) * 100);
  details.push(`accuracy_80pct: ${correctCount}/${assignments.length} 归类正确 (${pct}%)`);

  return {
    probe_id: probe.probe_id,
    dimension: 'hierarchical_reasoning',
    score: pct,
    details,
    passed: pct >= 80,
  };
}

// Expected DEPENDS_ON relations for logical_reasoning-1
const LOGICAL_EXPECTED: Array<{ source: string; target: string }> = [
  { source: 'R-B', target: 'R-A' },
  { source: 'R-C', target: 'R-B' },
  { source: 'R-D', target: 'R-C' },
];

function scoreLogicalReasoning(probe: ProbeItem, answer: string): ProbeResult {
  const details: string[] = [];
  const parsed = extractJson(answer);
  let relations: Array<{ source: string; target: string; relation?: string }> = [];

  if (Array.isArray(parsed)) {
    relations = parsed as Array<{ source: string; target: string; relation?: string }>;
  }

  if (relations.length === 0) {
    details.push('direction_correct: 无法解析依赖关系');
    return { probe_id: probe.probe_id, dimension: 'logical_reasoning', score: 0, details, passed: false };
  }

  let correctCount = 0;
  for (const rel of relations) {
    const src = String(rel.source ?? '').trim();
    const tgt = String(rel.target ?? '').trim();
    const found = LOGICAL_EXPECTED.some((e) => e.source === src && e.target === tgt);
    if (found) {
      correctCount++;
    }
    // If reversed, it's wrong direction, so don't count
  }

  const pct = Math.round((relations.length > 0 ? correctCount / relations.length : 0) * 100);
  details.push(`direction_correct: ${correctCount}/${relations.length} 条关系方向正确 (${pct}%)`);

  return {
    probe_id: probe.probe_id,
    dimension: 'logical_reasoning',
    score: pct,
    details,
    passed: pct >= 70,
  };
}

function scoreCreativeReasoning(probe: ProbeItem, answer: string): ProbeResult {
  const details: string[] = [];
  const parsed = extractJson(answer);
  let derived: { derived_statement?: string; derived_from?: string[] | string; reasoning?: string } = {};

  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    derived = parsed as Record<string, unknown>;
  }

  let score = 0;

  // Check derived_from_correct: must reference at least 2 of R1, R2, R3
  const dFrom = derived.derived_from;
  const refs: string[] = [];
  if (Array.isArray(dFrom)) {
    refs.push(...dFrom.map(String));
  } else if (typeof dFrom === 'string') {
    refs.push(dFrom);
  }

  const validRefs = refs.filter((r) => /^R[123]$/.test(r.trim()));
  if (validRefs.length >= 2) {
    details.push(`derived_from_correct: ✓ 引用了 ${validRefs.length} 个原始需求 (${validRefs.join(', ')})`);
    score += 50;
  } else {
    details.push(`derived_from_correct: 只引用了 ${validRefs.length} 个原始需求，期望至少 2 个`);
  }

  // Check reasoning_plausible: reasoning should be a meaningful string
  const reasoning = String(derived.reasoning ?? '');
  const statement = String(derived.derived_statement ?? '');
  if (reasoning.length >= 15 && statement.length >= 5) {
    details.push(`reasoning_plausible: ✓ 推导逻辑合理 (${reasoning.length} 字)`);
    score += 50;
  } else {
    details.push(`reasoning_plausible: 推导逻辑不足 (reasoning: ${reasoning.length} 字, statement: ${statement.length} 字)`);
  }

  return {
    probe_id: probe.probe_id,
    dimension: 'creative_reasoning',
    score,
    details,
    passed: score >= 70,
  };
}

// ===================== Profile Calculation =====================

function calculateProfile(results: ProbeResult[]): {
  profile: CapabilityProfile;
  tier: Tier;
  recommendations: string[];
} {
  const profile: CapabilityProfile = {
    instruction_following: 0,
    structured_output: 0,
    precision: 0,
    hierarchical_reasoning: 0,
    logical_reasoning: 0,
    creative_reasoning: 0,
  };

  const dimScoreMap: Record<string, number[]> = {};
  for (const r of results) {
    if (!dimScoreMap[r.dimension]) dimScoreMap[r.dimension] = [];
    dimScoreMap[r.dimension]!.push(r.score);
  }

  // Average per dimension
  for (const [dim, scores] of Object.entries(dimScoreMap)) {
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    if (dim in profile) {
      (profile as unknown as Record<string, number>)[dim] = avg;
    }
  }

  // Tier estimation
  const allScores = Object.values(profile);
  const avgAll = allScores.reduce((a, b) => a + b, 0) / allScores.length;
  let tier: Tier;
  if (avgAll >= 80) {
    tier = 'high';
  } else if (avgAll >= 50) {
    tier = 'medium';
  } else {
    tier = 'low';
  }

  // Recommendations
  const recs: string[] = [];
  const fullAuto: string[] = [];
  const guided: string[] = [];
  const humanLoop: string[] = [];

  for (const [dim, score] of Object.entries(profile)) {
    if (score >= 80) fullAuto.push(dim);
    else if (score >= 50) guided.push(dim);
    else humanLoop.push(dim);
  }

  if (fullAuto.length > 0) recs.push(`R1: full_auto — ${fullAuto.join(', ')}`);
  if (guided.length > 0) recs.push(`R2: guided — ${guided.join(', ')}`);
  if (humanLoop.length > 0) recs.push(`R3: human_in_loop — ${humanLoop.join(', ')}`);

  return { profile, tier, recommendations: recs };
}

// ===================== Main Scoring =====================

const SCORERS: Record<string, (probe: ProbeItem, answer: string) => ProbeResult> = {
  'instruction_following-1': scoreInstructionFollowing,
  'structured_output-1': scoreStructuredOutput,
  'precision-1': scorePrecision,
  'hierarchical_reasoning-1': scoreHierarchicalReasoning,
  'logical_reasoning-1': scoreLogicalReasoning,
  'creative_reasoning-1': scoreCreativeReasoning,
};

function scoreAllProbes(probes: ProbeItem[], answers: Record<string, string>): ProbeResult[] {
  const results: ProbeResult[] = [];
  for (const probe of probes) {
    const llmAnswer = answers[probe.probe_id];
    if (llmAnswer === undefined || llmAnswer === null) {
      results.push({
        probe_id: probe.probe_id,
        dimension: probe.dimension,
        score: 0,
        details: ['未提供答案'],
        passed: false,
      });
      continue;
    }
    const scorer = SCORERS[probe.probe_id];
    if (scorer) {
      results.push(scorer(probe, llmAnswer));
    } else {
      results.push({
        probe_id: probe.probe_id,
        dimension: probe.dimension,
        score: 0,
        details: ['未知 probe ID'],
        passed: false,
      });
    }
  }
  return results;
}

// ===================== Main Entry Point =====================

export async function main(args: string[]): Promise<CliResult> {
  const mode = parseArg(args, '--mode');

  if (!mode) {
    return { status: 'error', message: 'Missing required argument: --mode (generate|score)' };
  }

  if (mode === 'generate') {
    const probes = generateProbes();
    return { status: 'ok', data: probes };
  }

  if (mode === 'score') {
    const filePath = parseArg(args, '--file');
    if (!filePath) {
      return { status: 'error', message: 'Missing required argument: --file <path> (required for score mode)' };
    }

    // Read answer file
    let raw: string;
    try {
      raw = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      return { status: 'error', message: `无法读取答案文件: ${(err as Error).message}` };
    }

    let answerData: { answers?: Record<string, string> };
    try {
      answerData = JSON.parse(raw) as { answers?: Record<string, string> };
    } catch {
      return { status: 'error', message: '答案文件不是合法的 JSON' };
    }

    const answers = answerData.answers ?? {};
    const probes = generateProbes();
    const probeResults = scoreAllProbes(probes, answers);
    const { profile, tier, recommendations } = calculateProfile(probeResults);

    return {
      status: 'ok',
      data: {
        probe_results: probeResults,
        capability_profile: profile,
        estimated_tier: tier,
        recommendations,
      },
    };
  }

  return { status: 'error', message: `Unknown mode: ${mode}. Use --mode generate or --mode score` };
}
