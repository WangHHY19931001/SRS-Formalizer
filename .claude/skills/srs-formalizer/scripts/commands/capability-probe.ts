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
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import type { CliResult } from '../types/index.js';

// ===================== Type Definitions =====================

type Dimension =
  | 'instruction_following'
  | 'structured_output'
  | 'precision'
  | 'hierarchical_reasoning'
  | 'logical_reasoning'
  | 'creative_reasoning'
  | 'formal_tlaplus'
  | 'formal_lean4';

export interface ProbeItem {
  probe_id: string;
  dimension: Dimension;
  prompt: string;
  expected: {
    min_records?: number;
    max_records?: number;
    checks: string[];
    /** Precision-specific: real requirement keywords to match */
    expected_real_reqs?: string[];
    /** Precision-specific: fake requirement keywords to reject */
    fake_keywords?: string[];
    /** Hierarchical reasoning-specific: FR-ID to module mapping */
    hierarchy_expected?: Record<string, string>;
    /** Logical reasoning-specific: expected relations (DEPENDS_ON, REFINES, CONFLICTS_WITH) */
    logical_expected?: Array<{ source: string; target: string; relation?: string }>;
    /** Instruction-following: expected ID prefix (default R1) */
    id_prefix?: string;
    /** Instruction-following: LLM should refuse template with missing required fields */
    refuse_missing_field?: boolean;
    /** Instruction-following: LLM should output zero records for empty input */
    empty_input?: boolean;
    /** Instruction-following: LLM should refuse wrong/unsafe template */
    refuse_wrong_template?: boolean;
    /** Structured-output: answer must contain nested metadata objects */
    nested_metadata?: boolean;
    /** Structured-output: answer must handle Unicode/mixed-language content */
    unicode_content?: boolean;
    /** Structured-output: answer must detect and handle contradictory info */
    contradiction_detection?: boolean;
    /** Structured-output: answer must handle ultra-long text without truncation */
    long_text?: boolean;
    /** Precision: LLM must deduplicate synonymous requirements */
    dedup_required?: boolean;
    /** Precision: LLM must resolve cross-line "同上" references */
    cross_line_ref?: boolean;
    /** Precision: LLM must extract requirements from code comments */
    in_code_comment?: boolean;
    /** Creative-reasoning: specific domain for implicit requirement derivation */
    creative_domain?: 'security' | 'integration' | 'concurrency' | 'fault_tolerance';
    /** Logical-reasoning: expected relation type for this probe */
    relation_type?: string;
    /** Logical-reasoning: LLM must detect transitive dependencies */
    transitive_dep?: boolean;
    /** Logical-reasoning: LLM must detect cyclic dependencies */
    cyclic_dep?: boolean;
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
  formal_tlaplus: number;
  formal_lean4: number;
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
    ...generateInstructionFollowingProbes(),
    ...generateStructuredOutputProbes(),
    ...generatePrecisionProbes(),
    ...generateHierarchicalReasoningProbes(),
    ...generateLogicalReasoningProbes(),
    ...generateCreativeReasoningProbes(),
    ...generateTlaPlusProbes(),
    ...generateLean4Probes(),
  ];
}

function generateInstructionFollowingProbes(): ProbeItem[] {
  return [
    // ---- probe-1 (easy): id格式 + category + metadata (核心格式遵循) ----
    {
      probe_id: 'instruction_following-1',
      dimension: 'instruction_following',
      prompt: `你是一个需求提取器。请将以下 3 条 SRS 需求转换为 JSONL 格式。

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

请输出 3 行 JSONL，不要包含其他文字。`,
      expected: {
        min_records: 3,
        checks: ['id_format', 'category_enum', 'metadata_present'],
      },
    },
    // ---- probe-2 (easy): 少字段陷阱 —— 模板故意缺少一个字段 ----
    {
      probe_id: 'instruction_following-2',
      dimension: 'instruction_following',
      prompt: `你是一个需求提取器。请将以下 2 条 SRS 需求转换为 JSONL 格式。

SRS 需求：
1. 系统必须支持教师通过工号和密码登录。
2. 系统必须支持管理员审核选课申请。

每条 JSONL 记录必须包含以下字段：
- id: 格式为 R1-<TOPIC>-0001
- category: "explicit"
- statement: 需求描述原文
- confidence: "high"
【注意：上面的模板不完整，请只使用上面列出的字段】

请输出 JSONL，不要包含其他文字。`,
      expected: {
        min_records: 2,
        max_records: 2,
        checks: ['no_missing_field_warning', 'id_format'],
        refuse_missing_field: true,
      },
    },
    // ---- probe-3 (medium): 含干扰文本 —— 排除非需求内容 ----
    {
      probe_id: 'instruction_following-3',
      dimension: 'instruction_following',
      prompt: `你是一个需求提取器。请将以下文本中的 SRS 需求转换为 JSONL 格式。

文本：
================================
学生登录模块是系统的基础功能。需求是要支持学号和密码登录（R1）。另外，学生信息展示页面需要美化。

课程管理方面，R2: 系统必须展示可用课程列表。对了，下周我们要讨论课程推荐算法，但目前还没定。

选课模块：R3: 学生可以在选课开放期间提交选课申请。我认为前端应该用 React 实现。

关于退课：R4: 学生可以在截止日期前退选已选课程。

对了顺便说一下，数据库我们打算用 PostgreSQL，不过这跟需求没关系。
================================

每条 JSONL 记录必须包含：
- id: 格式为 R1-<TOPIC>-0001
- category: "explicit"
- statement: 需求描述（只提取需求，排除实现建议和无关讨论）
- source_file: "srs.md"
- confidence: "high"
- metadata: {}

请输出 JSONL，只提取真正的需求记录，不要包含其他文字。`,
      expected: {
        min_records: 4,
        max_records: 4,
        checks: ['id_format', 'category_enum', 'no_interference_extraction'],
      },
    },
    // ---- probe-4 (medium): 指定不同 id 前缀 R2-xxx-0001 ----
    {
      probe_id: 'instruction_following-4',
      dimension: 'instruction_following',
      prompt: `你是一个需求提取器。请将以下 3 条非功能性需求转换为 JSONL 格式。

需求：
1. 系统必须在 2 秒内响应所有查询请求。
2. 系统必须支持 5000 名并发用户同时操作。
3. 系统必须保证 99.9% 的可用性（年度）。

每条 JSONL 记录必须包含：
- id: 格式为 R2-<TOPIC>-0001（注意：非功能需求使用 R2 前缀）
- category: "explicit"
- statement: 需求描述原文
- source_file: "srs.md"
- confidence: "high"
- metadata: {}

请输出 3 行 JSONL，不要包含其他文字。`,
      expected: {
        min_records: 3,
        checks: ['id_format', 'category_enum'],
        id_prefix: 'R2',
      },
    },
    // ---- probe-5 (medium): 空输入 —— 输出空文件 ----
    {
      probe_id: 'instruction_following-5',
      dimension: 'instruction_following',
      prompt: `你是一个需求提取器。请将以下 SRS 需求转换为 JSONL 格式。

SRS 需求：
（暂无需求）

每条 JSONL 记录必须包含以下字段：
- id: 格式为 R1-<TOPIC>-0001
- category: "explicit"
- statement: 需求描述原文
- source_file: "srs.md"
- confidence: "high"
- metadata: {}

如果没有需求需要提取，请输出空内容。`,
      expected: {
        min_records: 0,
        max_records: 0,
        checks: ['empty_output_handled'],
        empty_input: true,
      },
    },
    // ---- probe-6 (hard): 10条混合需求 —— 只提取 explicit ----
    {
      probe_id: 'instruction_following-6',
      dimension: 'instruction_following',
      prompt: `你是一个需求提取器。请将以下文本中的 SRS 需求转换为 JSONL 格式。

文本：
================================
教务管理系统需求讨论记录（2026-06-15）

1. 系统必须支持学生通过学号和密码登录。【确认】
2. 登录后应该展示课程列表——包含课程名称、教师和学分。【确认】
3. 我们可能需要一个推荐算法来推荐课程？【待讨论】
4. 选课期间学生可以提交选课申请。【确认】
5. 系统在课程容量已满时必须拒绝超额选课。【确认】
6. 是不是应该支持自动排课功能？这个可以以后再议。
7. 退选截止日期前学生可以退选课程。【确认】
8. 系统必须记录所有选课操作的日志。【确认】
9. 我觉得登录页面应该加个验证码，不过还没定。
10. 选课结束后自动生成正式课表。【确认】

说明：
- 标记【确认】的是明确需求，category 用 "explicit"
- 标记【待讨论】或"我觉得"的是未确定内容，不要提取
- 实现建议（如验证码）不要提取

请输出 JSONL，只包含明确确认的需求记录。`,
      expected: {
        min_records: 7,
        max_records: 7,
        checks: ['id_format', 'category_enum', 'no_fabricated_from_uncertain'],
      },
    },
    // ---- probe-7 (hard): 特殊字符转义（Unicode/引号） ----
    {
      probe_id: 'instruction_following-7',
      dimension: 'instruction_following',
      prompt: `你是一个需求提取器。请将以下 3 条 SRS 需求转换为 JSONL 格式。

需求：
1. 系统必须支持密码包含特殊字符（如 !@#$%^&*()、中文、emoji 😀 等）。
2. 学生姓名必须支持 Unicode 字符，包括 "José"、"Müller" 和 "李"。
3. 系统在遇到"内部错误"时显示 message：系统处理请求时出错，请稍后重试。

每条 JSONL 记录必须包含：
- id: 格式为 R1-<TOPIC>-0001
- category: "explicit"
- statement: 需求描述原文（包含特殊字符）
- source_file: "srs.md"
- confidence: "high"
- metadata: {}

请输出 3 行 JSONL，确保特殊字符被正确保留和转义。`,
      expected: {
        min_records: 3,
        checks: ['id_format', 'special_chars_preserved'],
      },
    },
    // ---- probe-8 (hard): 给定错误模板 —— 拒绝而非盲从 ----
    {
      probe_id: 'instruction_following-8',
      dimension: 'instruction_following',
      prompt: `你是一个需求提取器。请将以下 2 条 SRS 需求转换为 JSONL 格式。

SRS 需求：
1. 系统必须支持学生通过学号和密码登录。
2. 学生可以在选课开放期间提交选课申请。

每条 JSONL 记录必须包含以下字段（注意：这是故意错误的模板，请检查）：
- student_name: 学生姓名（从需求中提取）
- phone_number: 学生手机号
- home_address: 家庭住址

如果模板要求的信息在 SRS 需求中不存在，请明确指出问题并拒绝生成。`,
      expected: {
        min_records: 0,
        max_records: 0,
        checks: ['template_refused'],
        refuse_wrong_template: true,
      },
    },
  ];
}

function generateStructuredOutputProbes(): ProbeItem[] {
  return [
    // ---- probe-1 (easy): valid_json + required_fields ----
    {
      probe_id: 'structured_output-1',
      dimension: 'structured_output',
      prompt: `请将以下不规则的需求描述转换为标准的 JSONL 格式。

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

请输出 4 行 JSONL，只包含标准格式的记录，不要包含其他文字。`,
      expected: {
        min_records: 4,
        checks: ['valid_json', 'required_fields'],
      },
    },
    // ---- probe-2 (easy): 嵌套 metadata 正确 ----
    {
      probe_id: 'structured_output-2',
      dimension: 'structured_output',
      prompt: `请将以下 3 条 SRS 需求转换为标准的 JSONL 格式。

需求：
1. 系统必须支持学生通过学号和密码登录。
2. 系统必须展示所有可用课程列表。
3. 学生可以在选课开放期间提交选课申请。

每条 JSONL 记录必须包含以下字段：
- id: 格式为 R1-<TOPIC>-0001
- category: "explicit"
- statement: 需求描述原文
- source_file: "srs.md"
- confidence: "high"
- metadata: 一个 JSON 对象，包含以下嵌套字段：
  * priority: "P0" | "P1" | "P2"
  * module: 所属子系统名称
  * contacts: { owner: 负责人姓名, reviewer: 审核人姓名 }
  * tags: 标签数组（至少 1 个）

请输出 3 行 JSONL，确保 metadata 中的嵌套对象和数组被正确序列化。`,
      expected: {
        min_records: 3,
        checks: ['valid_json', 'required_fields', 'nested_metadata_preserved'],
        nested_metadata: true,
      },
    },
    // ---- probe-3 (medium): 混乱编号文本 → 正确拆分 ----
    {
      probe_id: 'structured_output-3',
      dimension: 'structured_output',
      prompt: `请将以下格式混乱的需求描述转换为标准的 JSONL 格式。

混乱文本：
================================
   FR-001:login:支持学号和密码登录
FR-002 : courses : 展示可用课程列表（含名称、教师、学分）
FR-003:enroll:学生可在选课开放期间提交申请
	FR-004	drop	退选功能	截止日期前可退选
FR-005:grades:教师录入成绩（平时+期末）
================================

每条 JSONL 记录必须包含以下字段：
- id: 格式为 R1-<TOPIC>-0001
- category: "explicit"
- statement: 中文需求描述
- source_file: "srs.md"
- confidence: "high"
- metadata: {}

请输出 5 行 JSONL，只包含标准格式的记录，不要包含其他文字。`,
      expected: {
        min_records: 5,
        checks: ['valid_json', 'required_fields'],
      },
    },
    // ---- probe-4 (medium): 中英混杂 → Unicode 处理 ----
    {
      probe_id: 'structured_output-4',
      dimension: 'structured_output',
      prompt: `请将以下中英混杂的需求描述转换为标准的 JSONL 格式。

文本：
================================
FR-001: The system 必须支持 students 使用 student ID 和 password 登录。
FR-002: 系统必须 display 所有 available 课程列表（包括 course name, instructor, credits）。
FR-003: Students 在选课开放期间 submit enrollment application。The deadline 为每学期第 3 周。
FR-004: 系统必须 ensure data consistency across 读操作和写操作。
FR-005: 系统 support for Unicode characters in student names such as José, Müller, 李小龙.
FR-006: API response must include status code, message (中文), and data payload.

每条 JSONL 记录必须包含以下字段：
- id: 格式为 R1-<TOPIC>-0001
- category: "explicit"
- statement: 保留原文中的英文术语，但将中文部分翻译完整
- source_file: "srs.md"
- confidence: "high"
- metadata: {}

请输出 6 行 JSONL，确保 Unicode 字符和混合语言内容被正确保留。`,
      expected: {
        min_records: 6,
        checks: ['valid_json', 'required_fields', 'unicode_handled'],
        unicode_content: true,
      },
    },
    // ---- probe-5 (medium): Markdown 表格 → 正确提取 ----
    {
      probe_id: 'structured_output-5',
      dimension: 'structured_output',
      prompt: `请将以下表格形式的需求描述转换为标准的 JSONL 格式。

表格文本：
================================
| 编号 | 功能模块 | 需求描述 | 优先级 |
|------|---------|---------|--------|
| FR01 | 登录认证 | 学生使用学号和密码登录系统 | P0 |
| FR02 | 课程展示 | 展示所有可用课程名称、教师和学分 | P0 |
| FR03 | 选课申请 | 开放期间学生可提交选课申请 | P1 |
| FR04 | 退选管理 | 截止日期前学生可退选课程 | P1 |
| FR05 | 成绩查询 | 学生可查看自己的成绩和绩点 | P1 |
| FR06 | 课表生成 | 选课结束后自动生成正式课表 | P0 |

每条 JSONL 记录必须包含以下字段：
- id: 格式为 R1-<TOPIC>-0001
- category: "explicit"
- statement: 中文需求描述
- source_file: "srs.md"
- confidence: "high"
- metadata: {"priority": "优先级值", "module": "功能模块名"}

请输出 6 行 JSONL，只包含标准格式的记录。`,
      expected: {
        min_records: 6,
        checks: ['valid_json', 'required_fields'],
      },
    },
    // ---- probe-6 (hard): 矛盾信息 → 只提取一致部分 ----
    {
      probe_id: 'structured_output-6',
      dimension: 'structured_output',
      prompt: `请将以下包含矛盾信息的文本中的需求提取为标准 JSONL 格式。

文本：
================================
系统设计文档 v2.1（注意：本文档包含未解决的评审意见）

1. FR-001: 系统必须支持学生通过学号和密码登录。
   [评审意见: 应改为邮箱+密码登录 —— 待确认]

2. FR-002: 系统必须展示课程列表。包含字段：课程名称、教师姓名、学分。
   [补充: 课程容量上限 50 人]
   [矛盾: 另一份文档说容量上限 100 人 —— 以本文档为准]

3. FR-003: 选课申请在开放期间提交。
   [评审意见: 建议改为先到先得的抢课模式 —— 与功能描述矛盾，忽略此建议]

4. FR-004: 退选截止日期为每学期第四周周五。
   [评审意见: 应延长到第六周 —— 已批准，正式改为第六周]

5. FR-005: 系统记录所有选课操作日志。（已确认）
   [矛盾: 早期版本说只记录管理员操作 —— 已废弃]

提取规则：
- 以本文档正文为准，忽略被否决的评审意见
- 已批准的评审修改应采纳（如 FR-004 改为第六周）
- 未解决的评审待确认内容不应提取

请只输出 5 行 JSONL（5 条确认需求）。`,
      expected: {
        min_records: 5,
        max_records: 5,
        checks: ['valid_json', 'required_fields', 'contradiction_resolved'],
        contradiction_detection: true,
      },
    },
    // ---- probe-7 (hard): 超长文本(>5000字) → 无截断 ----
    {
      probe_id: 'structured_output-7',
      dimension: 'structured_output',
      prompt: `请从以下长篇 SRS 文档中提取所有功能需求，转换为标准 JSONL 格式。

SRS 文档（教务管理系统 v3.0）：
================================
系统概述：本系统为 XX 大学教务管理平台，服务于全校 3 万余名师生，涵盖选课、成绩、教学评估等核心业务模块。系统采用 B/S 架构，支持主流浏览器访问。后端采用微服务架构，使用 Java Spring Boot 框架，前端使用 React。数据库使用 PostgreSQL 主库和 Redis 缓存。系统需满足等保三级要求。

第一章 用户管理：
1.1 学生登录：系统必须支持学生通过学号（10 位数字）和密码（至少 8 位，含大小写字母和数字）登录系统。登录失败 5 次后锁定账号 30 分钟。系统需记录每次登录的 IP 地址和时间戳。
1.2 教师登录：系统必须支持教师通过工号（6 位数字）和密码登录。教师登录后可访问授课班级的学生名单和成绩录入功能。
1.3 管理员登录：系统必须支持管理员通过专用管理员账号登录。管理员具有系统配置、用户管理和数据维护权限。
1.4 密码管理：学生可通过注册邮箱重置密码。系统发送密码重置链接（有效期 24 小时）。首次登录强制修改初始密码。
1.5 单点登录：系统需与学校统一认证平台对接，支持 CAS 单点登录协议。

第二章 课程管理：
2.1 课程创建：管理员可创建新课程，录入课程代码（8 位）、名称（中文+英文）、学分、学时、开课院系、授课教师等信息。
2.2 课程查询：学生可按课程名称、教师姓名、开课院系、学分范围、上课时间等条件组合查询课程。查询结果支持分页显示（每页 20 条）。
2.3 课程详情：系统必须展示每门课程的详细信息，包括课程简介、教学大纲、考核方式、参考书目和先修课程要求。
2.4 课程容量：每门课程有容量限制（默认 50 人）。系统实时显示已选人数和剩余名额。管理员可根据实际情况调整容量。
2.5 课程时间：课程按周次安排，每周有固定的上课时间和教室。系统需检查教室和时间冲突。

第三章 选课管理：
3.1 选课时间：系统管理员配置选课开放时间和截止时间。选课分预选、正选和补退选三个阶段。
3.2 选课规则：学生必须满足先修课程要求。每学期选课学分上限 30 分，下限 15 分。系统自动检查选课冲突。
3.3 选课流程：学生在选课期间登录系统→浏览可选课程→提交选课申请→系统验证资格→确认选课结果。
3.4 退选管理：学生在补退选阶段可退选课程。系统自动释放名额供其他学生选择。已选课程少于下限时系统警告。
3.5 课表生成：选课结束后系统自动生成每位学生的学期课表。课表包含上课时间、地点、教师和课程名称。支持导出为 PDF 和 iCal 格式。

第四章 成绩管理：
4.1 成绩录入：教师通过系统录入学生成绩。支持百分制和五级制。平时成绩占比 40%，期末成绩占比 60%。系统自动计算最终成绩。
4.2 成绩修改：教师可在成绩提交后 48 小时内修改成绩。超时需提交书面申请经教务处审批。系统记录所有成绩修改历史。
4.3 成绩查询：学生可随时查询已发布课程的成绩。系统展示每门课程的详细得分和最终等级。GPA 自动计算并显示。
4.4 成绩统计：系统生成班级成绩分布统计（平均分、最高分、最低分、标准差）。教师可对比历届学生成绩趋势。

第五章 教学评估：
5.1 评估设置：管理员在每学期末设置评估时间窗口。评估维度包括教学态度、内容深度、互动效果和作业反馈。每维度 5 分制。
5.2 学生评估：学生在评估窗口内匿名评价所选课程的授课教师。系统确保评估的匿名性，教师无法查看评价者身份。
5.3 结果统计：系统自动计算每位教师的综合评分和分项平均分。生成学期教学评估报告，包含图表和学期对比。
5.4 结果反馈：教师可查看自己的评估结果和匿名评语。院系领导可查看本院教师的评估汇总。

第六章 系统管理：
6.1 数据备份：系统每日凌晨 2:00 自动备份数据库。备份文件加密存储，保留 90 天。管理员可手动触发全量备份。
6.2 日志管理：系统记录所有关键操作日志，包括登录、选课、成绩修改、系统配置变更。日志保留 180 天，支持按用户、操作类型和时间范围查询。
6.3 权限管理：系统基于 RBAC 模型管理用户权限。角色包括学生、教师、院系管理员和系统管理员。权限变更需管理员审批。

================================
提取要求：
- 提取所有以"必须"、"需"、"支持"等明确陈述的功能需求
- 每条需求一个 JSONL 记录
- 共应提取约 20 条核心功能需求
- 确保超长文本不被截断，所有章节的需求都被覆盖`,
      expected: {
        min_records: 18,
        checks: ['valid_json', 'required_fields', 'long_text_no_truncation'],
        long_text: true,
      },
    },
  ];
}

function generatePrecisionProbes(): ProbeItem[] {
  return [
    // ---- probe-1 (easy): \u771f\u5047\u6df7\u5408 ----
    {
      probe_id: 'precision-1',
      dimension: 'precision',
      prompt: `\u4ee5\u4e0b\u5305\u542b 6 \u6761\u9700\u6c42\uff0c\u5176\u4e2d\u53ea\u6709 3 \u6761\u6765\u81ea\u771f\u5b9e\u7684 SRS \u6587\u6863\uff0c\u53e6\u5916 3 \u6761\u662f\u7f16\u9020\u7684\u3002\u8bf7\u53ea\u63d0\u53d6\u771f\u5b9e\u5b58\u5728\u7684\u9700\u6c42\uff0c\u5ffd\u7565\u7f16\u9020\u7684\u3002

\u9700\u6c42\u5217\u8868\uff1a
1. \u7cfb\u7edf\u5fc5\u987b\u652f\u6301\u5b66\u751f\u901a\u8fc7\u5b66\u53f7\u548c\u5bc6\u7801\u767b\u5f55\u3002
2. \u7cfb\u7edf\u5fc5\u987b\u652f\u6301\u4eba\u8138\u8bc6\u522b\u767b\u5f55\u3002
3. \u7cfb\u7edf\u5728\u8bfe\u7a0b\u5bb9\u91cf\u5df2\u6ee1\u65f6\u5fc5\u987b\u62d2\u7edd\u8d85\u989d\u9009\u8bfe\u3002
4. \u7cfb\u7edf\u5fc5\u987b\u652f\u6301\u652f\u4ed8\u529f\u80fd\u3002
5. \u7cfb\u7edf\u8bb0\u5f55\u6bcf\u6b21\u9009\u8bfe\u64cd\u4f5c\u7684\u65f6\u95f4\u6233\u548c\u64cd\u4f5c\u4eba\u3002
6. \u7cfb\u7edf\u652f\u6301\u5b66\u751f\u4e4b\u95f4\u804a\u5929\u529f\u80fd\u3002

\u8bf7\u4ee5 JSON \u6570\u7ec4\u5f62\u5f0f\u8f93\u51fa\u771f\u5b9e\u7684\u9700\u6c42\uff0c\u683c\u5f0f\uff1a["\u9700\u6c421\u539f\u6587", "\u9700\u6c422\u539f\u6587", ...]`,
      expected: {
        checks: ['no_fabricated', 'no_missing'],
        expected_real_reqs: ['\u5b66\u53f7\u548c\u5bc6\u7801', '\u8bfe\u7a0b\u5bb9\u91cf\u5df2\u6ee1', '\u65f6\u95f4\u6233\u548c\u64cd\u4f5c\u4eba'],
        fake_keywords: ['\u4eba\u8138\u8bc6\u522b', '\u652f\u4ed8\u529f\u80fd', '\u804a\u5929'],
      },
    },
    // ---- probe-2 (medium): \u9700\u6c42+\u8bc4\u8bba+\u793a\u4f8b\u6df7\u6392 ----
    {
      probe_id: 'precision-2',
      dimension: 'precision',
      prompt: `\u4ee5\u4e0b\u6587\u672c\u6df7\u5408\u4e86\u9700\u6c42\u3001\u8bc4\u8bba\u548c\u793a\u4f8b\u4ee3\u7801\uff0c\u8bf7\u53ea\u63d0\u53d6\u771f\u6b63\u7684 SRS \u9700\u6c42\u3002

\u6587\u672c\uff1a
================================
// \u767b\u5f55\u6a21\u5757 \u2014\u2014 \u8fd9\u662f\u5f00\u53d1\u7b14\u8bb0
FR-001: \u7cfb\u7edf\u5fc5\u987b\u652f\u6301\u5b66\u751f\u901a\u8fc7\u5b66\u53f7\u548c\u5bc6\u7801\u767b\u5f55\u3002  // TODO: \u8003\u8651\u52a0\u9a8c\u8bc1\u7801
/* \u5173\u4e8e\u8bfe\u7a0b\u5c55\u793a \u2014\u2014
   \u4ea7\u54c1\u5efa\u8bae\uff1a\u53ef\u4ee5\u52a0\u4e2a\u63a8\u8350\u7b97\u6cd5\uff1f
   \u4f46\u76ee\u524d\u53ea\u9700\u8981\u57fa\u672c\u529f\u80fd */
FR-002: \u7cfb\u7edf\u5fc5\u987b\u5c55\u793a\u6240\u6709\u53ef\u7528\u8bfe\u7a0b\u5217\u8868\uff0c\u5305\u62ec\u8bfe\u7a0b\u540d\u79f0\u3001\u6559\u5e08\u548c\u5b66\u5206\u3002
// \u793a\u4f8b\u4ee3\u7801\uff1a\u5c55\u793a\u8bfe\u7a0b\u7684 API
// GET /api/courses -> { courses: [...] }
FR-003: \u5b66\u751f\u53ef\u4ee5\u5728\u9009\u8bfe\u5f00\u653e\u671f\u95f4\u63d0\u4ea4\u9009\u8bfe\u7533\u8bf7\u3002
/* \u7ecf\u7406\u8bf4\uff1a\u6211\u4eec\u4ee5\u540e\u53ef\u80fd\u8981\u505a\u667a\u80fd\u6392\u8bfe
   \u4f46\u76ee\u524d\u5148\u505a\u7b80\u5355\u7684\u624b\u5de5\u5f55\u5165 */
FR-004: \u7cfb\u7edf\u5728\u8bfe\u7a0b\u5bb9\u91cf\u5df2\u6ee1\u65f6\u5fc5\u987b\u62d2\u7edd\u8d85\u989d\u9009\u8bfe\u3002
# \u5907\u6ce8\uff1a\u4e0a\u9762\u7684\u9700\u6c42\u5df2\u786e\u8ba4
FR-005: \u5b66\u751f\u53ef\u4ee5\u5728\u9000\u9009\u622a\u6b62\u65e5\u671f\u524d\u9000\u9009\u8bfe\u7a0b\u3002
// \u6d4b\u8bd5\u7528\u4f8b\uff1ashould return 400 when course is full
================================

\u8bf7\u4ee5 JSON \u6570\u7ec4\u5f62\u5f0f\u8f93\u51fa\u771f\u5b9e\u9700\u6c42\u3002`,
      expected: {
        checks: ['no_fabricated', 'no_missing'],
        expected_real_reqs: ['\u5b66\u53f7\u548c\u5bc6\u7801', '\u8bfe\u7a0b\u5217\u8868', '\u9009\u8bfe\u7533\u8bf7', '\u8bfe\u7a0b\u5bb9\u91cf\u5df2\u6ee1', '\u9000\u9009'],
        fake_keywords: ['\u9a8c\u8bc1\u7801', '\u63a8\u8350\u7b97\u6cd5', '\u667a\u80fd\u6392\u8bfe', '\u6d4b\u8bd5\u7528\u4f8b'],
      },
    },
    // ---- probe-3 (medium): \u540c\u4e49\u6539\u5199 \u2192 \u53bb\u91cd ----
    {
      probe_id: 'precision-3',
      dimension: 'precision',
      prompt: `\u4ee5\u4e0b 10 \u6761"\u9700\u6c42"\u4e2d\u6709\u91cd\u590d\u7684\uff08\u540c\u4e00\u6761\u9700\u6c42\u7684\u4e0d\u540c\u8868\u8ff0\uff09\uff0c\u8bf7\u63d0\u53d6\u53bb\u91cd\u540e\u7684\u552f\u4e00\u9700\u6c42\u96c6\u5408\u3002

\u9700\u6c42\u5217\u8868\uff1a
1. \u7cfb\u7edf\u5fc5\u987b\u652f\u6301\u5b66\u751f\u901a\u8fc7\u5b66\u53f7\u548c\u5bc6\u7801\u767b\u5f55\u3002
2. \u5b66\u751f\u767b\u5f55\u7cfb\u7edf\u65f6\u9700\u8981\u4f7f\u7528\u5b66\u53f7\u548c\u5bc6\u7801\u8fdb\u884c\u8eab\u4efd\u9a8c\u8bc1\u3002
3. \u7cfb\u7edf\u5fc5\u987b\u5c55\u793a\u6240\u6709\u53ef\u7528\u8bfe\u7a0b\u5217\u8868\uff0c\u5305\u62ec\u8bfe\u7a0b\u540d\u79f0\u3001\u6559\u5e08\u548c\u5b66\u5206\u3002
4. \u7cfb\u7edf\u5fc5\u987b\u663e\u793a\u53ef\u4f9b\u9009\u62e9\u7684\u8bfe\u7a0b\u4fe1\u606f\uff0c\u5982\u8bfe\u7a0b\u540d\u3001\u6388\u8bfe\u8001\u5e08\u548c\u5b66\u5206\u503c\u3002
5. \u5b66\u751f\u53ef\u4ee5\u5728\u9009\u8bfe\u5f00\u653e\u671f\u95f4\u63d0\u4ea4\u9009\u8bfe\u7533\u8bf7\u3002
6. \u5728\u89c4\u5b9a\u7684\u9009\u8bfe\u65f6\u6bb5\u5185\uff0c\u5b66\u751f\u6709\u6743\u9650\u63d0\u4ea4\u8bfe\u7a0b\u9009\u62e9\u8bf7\u6c42\u3002
7. \u7cfb\u7edf\u5728\u8bfe\u7a0b\u5bb9\u91cf\u5df2\u6ee1\u65f6\u5fc5\u987b\u62d2\u7edd\u8d85\u989d\u9009\u8bfe\u3002
8. \u5f53\u8bfe\u7a0b\u540d\u989d\u8fbe\u5230\u4e0a\u9650\u65f6\uff0c\u7cfb\u7edf\u5e94\u5f53\u963b\u6b62\u989d\u5916\u7684\u9009\u8bfe\u64cd\u4f5c\u3002
9. \u7cfb\u7edf\u5fc5\u987b\u652f\u6301\u4eba\u8138\u8bc6\u522b\u767b\u5f55\u3002\uff08\u8fd9\u662f\u7f16\u9020\u7684\uff0c\u5ffd\u7565\u5b83\uff09
10. \u7cfb\u7edf\u5fc5\u987b\u652f\u6301\u4f7f\u7528\u9762\u90e8\u7279\u5f81\u8fdb\u884c\u8eab\u4efd\u9a8c\u8bc1\u3002\uff08\u540c\u4e0a\uff0c\u7f16\u9020\u7684\uff09

\u8bf7\u4ee5 JSON \u6570\u7ec4\u5f62\u5f0f\u8f93\u51fa\u53bb\u91cd\u540e\u7684\u771f\u5b9e\u9700\u6c42\uff08\u53ea\u8f93\u51fa 4 \u6761\u552f\u4e00\u9700\u6c42\uff09\u3002`,
      expected: {
        checks: ['no_fabricated', 'dedup_correct'],
        expected_real_reqs: ['\u5b66\u53f7', '\u8bfe\u7a0b\u5217\u8868', '\u9009\u8bfe\u7533\u8bf7', '\u8bfe\u7a0b\u5bb9\u91cf'],
        fake_keywords: ['\u4eba\u8138\u8bc6\u522b', '\u9762\u90e8\u7279\u5f81'],
        dedup_required: true,
      },
    },
    // ---- probe-4 (hard): \u201c\u2026\u540c\u4e0a\u201d\u5f15\u7528 \u2192 \u8de8\u884c\u89e3\u6790 ----
    {
      probe_id: 'precision-4',
      dimension: 'precision',
      prompt: `\u4ee5\u4e0b\u9700\u6c42\u6587\u672c\u4f7f\u7528\u4e86\u7f29\u5199\u548c\u5f15\u7528\uff0c\u8bf7\u6b63\u786e\u89e3\u6790\u6240\u6709\u9700\u6c42\u3002

\u6587\u672c\uff1a
================================
FR-001: \u5b66\u751f\u767b\u5f55\uff1a\u7cfb\u7edf\u5fc5\u987b\u652f\u6301\u5b66\u751f\u901a\u8fc7\u5b66\u53f7\u548c\u5bc6\u7801\u767b\u5f55\u3002
FR-002: \u6559\u5e08\u767b\u5f55\uff1a\u540c\u4e0a\uff0c\u4f46\u4f7f\u7528\u5de5\u53f7\u548c\u5bc6\u7801\u3002
FR-003: \u8bfe\u7a0b\u5217\u8868\uff1a\u7cfb\u7edf\u5fc5\u987b\u5c55\u793a\u6240\u6709\u53ef\u7528\u8bfe\u7a0b\u5217\u8868\uff08\u540d\u79f0\u3001\u6559\u5e08\u3001\u5b66\u5206\uff09\u3002
FR-004: \u6210\u7ee9\u5217\u8868\uff1a\u540c\u4e0a\uff0c\u4f46\u5c55\u793a\u5b66\u751f\u7684\u5404\u79d1\u6210\u7ee9\uff08\u8bfe\u7a0b\u540d\u3001\u5206\u6570\u3001\u7b49\u7ea7\uff09\u3002
FR-005: \u9009\u8bfe\u7533\u8bf7\uff1a\u5b66\u751f\u53ef\u4ee5\u5728\u9009\u8bfe\u5f00\u653e\u671f\u95f4\u63d0\u4ea4\u9009\u8bfe\u7533\u8bf7\u3002
FR-006: \u9000\u9009\u7533\u8bf7\uff1a\u540c\u4e0a\uff0c\u4f46\u64cd\u4f5c\u4e3a\u9000\u9009\uff08\u5728\u622a\u6b62\u65e5\u671f\u524d\uff09\u3002
FR-007: \u6570\u636e\u5bfc\u51fa\uff1a\u2026\u2026\uff08\u6b64\u5904\u89c1 FR-003 \u548c FR-004 \u7684\u5b57\u6bb5\u5b9a\u4e49\uff09
FR-008: \u7ba1\u7406\u5458\u8bfe\u8868\u7ba1\u7406\uff1a\u7c7b\u4f3c FR-003\uff0c\u4f46\u7ba1\u7406\u5458\u53ef\u5bf9\u8bfe\u7a0b\u8fdb\u884c\u589e\u5220\u6539\u64cd\u4f5c\u3002
================================

\u8bf7\u4ee5 JSON \u6570\u7ec4\u5f62\u5f0f\u8f93\u51fa\u5b8c\u6574\u89e3\u6790\u540e\u7684\u9700\u6c42\u63cf\u8ff0\uff08\u5c55\u5f00\u6240\u6709"\u540c\u4e0a"\u548c\u5f15\u7528\uff09\u3002`,
      expected: {
        checks: ['no_fabricated', 'cross_line_resolved'],
        expected_real_reqs: ['\u5b66\u53f7', '\u5de5\u53f7', '\u8bfe\u7a0b\u5217\u8868', '\u6210\u7ee9', '\u9009\u8bfe', '\u9000\u9009', '\u5b57\u6bb5', '\u589e\u5220\u6539'],
        cross_line_ref: true,
      },
    },
    // ---- probe-5 (hard): \u9700\u6c42\u5728\u4ee3\u7801\u6ce8\u91ca\u4e2d \u2192 \u63d0\u53d6 ----
    {
      probe_id: 'precision-5',
      dimension: 'precision',
      prompt: `\u4ee5\u4e0b\u662f\u4e00\u6bb5 TypeScript \u6e90\u4ee3\u7801\uff0c\u5176\u4e2d\u7528\u7279\u6b8a\u6ce8\u91ca\u683c\u5f0f\u5d4c\u5165\u4e86 SRS \u9700\u6c42\u3002\u8bf7\u53ea\u63d0\u53d6\u6807\u8bb0\u4e3a @req \u7684\u9700\u6c42\u3002

\u4ee3\u7801\uff1a
================================
/**
 * Student Management System - Backend API
 * @req R001: \u7cfb\u7edf\u5fc5\u987b\u652f\u6301\u5b66\u751f\u901a\u8fc7\u5b66\u53f7\u548c\u5bc6\u7801\u767b\u5f55
 */
class AuthService {
  /**
   * Handle login request
   * @req R002: \u767b\u5f55\u5931\u8d25\u540e\u5fc5\u987b\u8bb0\u5f55\u5931\u8d25\u6b21\u6570\u548c\u65f6\u95f4
   * @req R003: \u5bc6\u7801\u8fde\u7eed\u9519\u8bef 5 \u6b21\u540e\u9501\u5b9a\u8d26\u53f7 30 \u5206\u949f
   */
  async login(studentId: string, password: string) {
    const user = await this.db.findStudent(studentId);
    // TODO: SMS login support (not a requirement)
    if (!user) throw new Error('NOT_FOUND');
    return this.jwt.sign({ id: user.id });
  }
}

/**
 * Course Service
 * @req R004: \u7cfb\u7edf\u5fc5\u987b\u5c55\u793a\u6240\u6709\u53ef\u7528\u8bfe\u7a0b\u5217\u8868
 * NOTE: fields include name, instructor, credits -- this is NOT @req, it is a note
 */
class CourseService {
  /**
   * @req R005: \u5b66\u751f\u53ef\u4ee5\u5728\u9009\u8bfe\u5f00\u653e\u671f\u95f4\u63d0\u4ea4\u9009\u8bfe\u7533\u8bf7
   * @req R006: \u7cfb\u7edf\u5728\u8bfe\u7a0b\u5bb9\u91cf\u5df2\u6ee1\u65f6\u5fc5\u987b\u62d2\u7edd\u8d85\u989d\u9009\u8bfe
   */
  async enroll(studentId: string, courseId: string) {
    const course = await this.db.findCourse(courseId);
    if (course.enrolled >= course.capacity) throw new Error('FULL');
    return this.db.createEnrollment(studentId, courseId);
  }
}
================================

\u8bf7\u4ee5 JSON \u6570\u7ec4\u5f62\u5f0f\u8f93\u51fa\u6240\u6709 @req \u6807\u8bb0\u7684\u9700\u6c42\u3002`,
      expected: {
        checks: ['no_fabricated', 'no_missing'],
        expected_real_reqs: ['\u5b66\u53f7\u548c\u5bc6\u7801', '\u5931\u8d25\u6b21\u6570', '\u9501\u5b9a', '\u8bfe\u7a0b\u5217\u8868', '\u9009\u8bfe\u7533\u8bf7', '\u5bb9\u91cf\u5df2\u6ee1'],
        fake_keywords: ['SMS', 'NOTE', 'implementation'],
        in_code_comment: true,
      },
    },
    // ---- probe-6 (hard): \u7cbe\u786e\u5b9a\u4f4d\u5047\u9633\u6027 ----
    {
      probe_id: 'precision-6',
      dimension: 'precision',
      prompt: `\u4ee5\u4e0b 15 \u6761"\u9700\u6c42"\u4e2d\u6df7\u5165\u4e86 8 \u6761\u9ad8\u5ea6\u903c\u771f\u7684\u7f16\u9020\u9700\u6c42\uff08\u5b83\u4eec\u7528\u8bcd\u4e13\u4e1a\u3001\u683c\u5f0f\u5de5\u6574\uff0c\u4f46\u5e76\u975e\u6765\u81ea\u771f\u5b9e SRS\uff09\u3002\u8bf7\u53ea\u63d0\u53d6\u771f\u5b9e\u7684 7 \u6761\u9700\u6c42\u3002

\u9700\u6c42\u5217\u8868\uff1a
1. \u7cfb\u7edf\u5fc5\u987b\u652f\u6301\u5b66\u751f\u901a\u8fc7\u5b66\u53f7\u548c\u5bc6\u7801\u767b\u5f55\u7cfb\u7edf\u3002
2. \u7cfb\u7edf\u5fc5\u987b\u652f\u6301\u57fa\u4e8e OAuth 2.0 \u7684\u7b2c\u4e09\u65b9\u767b\u5f55\u96c6\u6210\u3002
3. \u7cfb\u7edf\u5fc5\u987b\u5c55\u793a\u6240\u6709\u53ef\u7528\u8bfe\u7a0b\u5217\u8868\uff0c\u5305\u62ec\u8bfe\u7a0b\u540d\u79f0\u3001\u6559\u5e08\u548c\u5b66\u5206\u3002
4. \u7cfb\u7edf\u5fc5\u987b\u5b9e\u73b0\u57fa\u4e8e\u534f\u540c\u8fc7\u6ee4\u7684\u8bfe\u7a0b\u63a8\u8350\u5f15\u64ce\u3002
5. \u5b66\u751f\u53ef\u4ee5\u5728\u9009\u8bfe\u5f00\u653e\u671f\u95f4\u63d0\u4ea4\u9009\u8bfe\u7533\u8bf7\u3002
6. \u5b66\u751f\u53ef\u4ee5\u5728\u9000\u9009\u622a\u6b62\u65e5\u671f\u524d\u9000\u9009\u8bfe\u7a0b\u3002
7. \u7cfb\u7edf\u5fc5\u987b\u652f\u6301\u57fa\u4e8e\u533a\u5757\u94fe\u7684\u5b66\u5206\u4e92\u8ba4\u673a\u5236\u3002
8. \u7cfb\u7edf\u5728\u8bfe\u7a0b\u5bb9\u91cf\u5df2\u6ee1\u65f6\u5fc5\u987b\u62d2\u7edd\u8d85\u989d\u9009\u8bfe\u3002
9. \u7cfb\u7edf\u5fc5\u987b\u5229\u7528\u81ea\u7136\u8bed\u8a00\u5904\u7406\u6280\u672f\u81ea\u52a8\u751f\u6210\u8bfe\u7a0b\u6458\u8981\u3002
10. \u7cfb\u7edf\u8bb0\u5f55\u6bcf\u6b21\u9009\u8bfe\u64cd\u4f5c\u7684\u65f6\u95f4\u6233\u548c\u64cd\u4f5c\u4eba\u3002
11. \u7cfb\u7edf\u5fc5\u987b\u652f\u6301\u57fa\u4e8e\u6df1\u5ea6\u5b66\u4e60\u7684\u5b66\u60c5\u5206\u6790\u4e0e\u9884\u8b66\u3002
12. \u7cfb\u7edf\u5fc5\u987b\u652f\u6301\u5b66\u751f\u5728\u7ebf\u63d0\u4ea4\u8bf7\u5047\u7533\u8bf7\u5e76\u4e0a\u4f20\u8bc1\u660e\u6750\u6599\u3002
13. \u7cfb\u7edf\u5fc5\u987b\u652f\u6301\u57fa\u4e8e\u77e5\u8bc6\u56fe\u8c31\u7684\u4e2a\u6027\u5316\u5b66\u4e60\u8def\u5f84\u63a8\u8350\u3002
14. \u7cfb\u7edf\u5fc5\u987b\u6bcf\u5b66\u671f\u521d\u521d\u59cb\u5316\u9009\u8bfe\u6570\u636e\u5e93\u3002
15. \u7cfb\u7edf\u5fc5\u987b\u652f\u6301\u57fa\u4e8e\u8054\u90a6\u5b66\u4e60\u7684\u8de8\u673a\u6784\u6a21\u578b\u8bad\u7ec3\u3002

\u8bf7\u4ee5 JSON \u6570\u7ec4\u5f62\u5f0f\u8f93\u51fa 7 \u6761\u771f\u5b9e\u9700\u6c42\u3002`,
      expected: {
        checks: ['no_fabricated', 'no_missing'],
        expected_real_reqs: ['\u5b66\u53f7\u548c\u5bc6\u7801', '\u8bfe\u7a0b\u5217\u8868', '\u9009\u8bfe\u7533\u8bf7', '\u9000\u9009', '\u8bfe\u7a0b\u5bb9\u91cf', '\u65f6\u95f4\u6233', '\u521d\u59cb\u5316'],
        fake_keywords: ['OAuth', '\u534f\u540c\u8fc7\u6ee4', '\u533a\u5757\u94fe', '\u81ea\u7136\u8bed\u8a00\u5904\u7406', '\u6df1\u5ea6\u5b66\u4e60', '\u77e5\u8bc6\u56fe\u8c31', '\u8054\u90a6\u5b66\u4e60', '\u8bf7\u5047'],
      },
    },
  ];
}
function generateCreativeReasoningProbes(): ProbeItem[] {
  return [
    // ---- probe-1 (easy): derived_from_correct ----
    {
      probe_id: 'creative_reasoning-1',
      dimension: 'creative_reasoning',
      prompt: `请根据以下 3 条需求推导出 1 条隐式需求（即系统没有明说但逻辑上必须支持的功能）。

需求：
R1: 系统必须显示每门课程的容量和当前已选人数。
R2: 系统在课程容量已满时必须拒绝超额选课。
R3: 系统记录每次选课操作的时间戳和操作人。

请以 JSON 格式输出：
{
  "derived_statement": "...（隐式需求的描述）",
  "derived_from": ["R1", "R2", ...],
  "reasoning": "...（推导逻辑说明）"
}

请只输出 JSON，不要包含其他文字。`,
      expected: {
        checks: ['derived_from_correct', 'reasoning_plausible'],
      },
    },
    // ---- probe-2 (medium): 安全关键 → 安全约束 ----
    {
      probe_id: 'creative_reasoning-2',
      dimension: 'creative_reasoning',
      prompt: `请根据以下 4 条安全相关需求推导出 2 条隐式安全需求。

需求：
R1: 系统必须支持学生通过学号和密码登录。
R2: 系统必须记录登录失败的次数和时间。
R3: 系统必须在密码连续错误 5 次后锁定账号 30 分钟。
R4: 系统必须记录每次密码修改的时间戳和操作 IP。

请以 JSON 数组格式输出：
[
  {
    "derived_statement": "...（隐式安全需求）",
    "derived_from": ["R1", "R2", ...],
    "reasoning": "...（安全分析逻辑）"
  },
  ...
]

请只输出 JSON，不要包含其他文字。`,
      expected: {
        checks: ['derived_from_correct', 'reasoning_plausible'],
        creative_domain: 'security',
      },
    },
    // ---- probe-3 (medium): 跨模块 → 集成约束 ----
    {
      probe_id: 'creative_reasoning-3',
      dimension: 'creative_reasoning',
      prompt: `请根据以下 5 条跨模块需求推导出 2 条隐式的集成约束需求。

需求：
R1: 教师录入成绩后，系统必须在成绩公布后自动通知学生。
R2: 系统必须支持学生查看自己的课程表（来自选课模块）。
R3: 系统必须在开学前初始化所有课程和选课数据。
R4: 管理员创建新课程后，课程必须出现在学生可选列表中。
R5: 选课结束后，选课数据必须同步到成绩模块供教师录入成绩。

请以 JSON 数组格式输出隐式集成需求（关注模块间的数据同步和时序要求）。`,
      expected: {
        checks: ['derived_from_correct', 'reasoning_plausible'],
        creative_domain: 'integration',
      },
    },
    // ---- probe-4 (hard): 并发场景 → 并发控制需求 ----
    {
      probe_id: 'creative_reasoning-4',
      dimension: 'creative_reasoning',
      prompt: `请根据以下 5 条需求推导出 2 条隐式的并发控制需求。

需求：
R1: 系统必须支持至少 5000 名学生同时在线选课。
R2: 系统必须显示每门课程的容量和当前已选人数。
R3: 系统在课程容量已满时必须拒绝超额选课。
R4: 系统记录每次选课操作的时间戳和操作人。
R5: 多名学生可能同时选择最后一门课的剩余名额。

请以 JSON 数组格式输出隐式并发控制需求（关注竞态条件和数据一致性）。

请只输出 JSON。`,
      expected: {
        checks: ['derived_from_correct', 'reasoning_plausible'],
        creative_domain: 'concurrency',
      },
    },
    // ---- probe-5 (hard): 错误场景 → 容错需求 ----
    {
      probe_id: 'creative_reasoning-5',
      dimension: 'creative_reasoning',
      prompt: `请根据以下 6 条需求推导出 3 条隐式的容错和异常处理需求。

需求：
R1: 系统必须支持学生通过学号和密码登录。
R2: 系统必须支持学生在选课开放期间提交选课申请。
R3: 系统必须支持教师录入学生成绩。
R4: 系统在课程容量已满时必须拒绝超额选课。
R5: 系统必须在每学期初初始化选课数据库。
R6: 系统必须支持 5000 名学生同时在线操作。

请以 JSON 数组格式输出隐式容错需求（关注系统在异常情况下如何保证数据一致性和服务可用性）。

请只输出 JSON。`,
      expected: {
        checks: ['derived_from_correct', 'reasoning_plausible'],
        creative_domain: 'fault_tolerance',
      },
    },
  ];
}

function generateHierarchicalReasoningProbes(): ProbeItem[] {
  return [
    // ---- probe-1 (easy): 8 需求 → 4 模块 ----
    {
      probe_id: 'hierarchical_reasoning-1',
      dimension: 'hierarchical_reasoning',
      prompt: `请将以下 8 条 SRS 需求归类到最合适的模块中。

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

请以 JSON 数组格式输出，每条包含 requirement 和 module 字段。`,
      expected: {
        checks: ['accuracy_80pct'],
        hierarchy_expected: {
          'FR-001': '登录认证',
          'FR-002': '课程管理',
          'FR-003': '选课管理',
          'FR-004': '选课管理',
          'FR-006': '选课管理',
          'FR-007': '系统管理',
          'FR-009': '课程管理',
          'FR-011': '系统管理',
        },
      },
    },
    // ---- probe-2 (medium): 15 需求 → 5 模块（含跨模块） ----
    {
      probe_id: 'hierarchical_reasoning-2',
      dimension: 'hierarchical_reasoning',
      prompt: `请将以下 15 条 SRS 需求归类到最合适的模块中。注意：有些需求可能同时属于多个模块。

可选模块：用户管理, 课程管理, 选课管理, 成绩管理, 通知管理

需求：
1. FR-001: 系统必须支持学生注册学籍信息。
2. FR-002: 系统必须支持学生修改个人资料。
3. FR-003: 系统必须展示所有可用课程的名称、教师和学分。
4. FR-004: 管理员可以添加、修改和删除课程信息。
5. FR-005: 系统必须显示每门课程的先修课程要求。
6. FR-006: 学生可以在选课开放期间提交选课申请。
7. FR-007: 学生可以在退选截止日期前退选课程。
8. FR-008: 系统必须显示课程容量和已选人数。
9. FR-009: 系统在课程容量已满时必须拒绝超额选课。
10. FR-010: 教师可以录入学生的考试成绩和平时成绩。
11. FR-011: 学生可以查询已修课程的成绩。
12. FR-012: 系统必须自动计算学生的学期绩点(GPA)。
13. FR-013: 系统必须在成绩公布后通知学生。
14. FR-014: 系统必须在选课前通知学生选课时间。
15. FR-015: 系统必须在课程变更时通知相关学生。

请以 JSON 数组格式输出。`,
      expected: {
        checks: ['accuracy_80pct'],
        hierarchy_expected: {
          'FR-001': '用户管理', 'FR-002': '用户管理',
          'FR-003': '课程管理', 'FR-004': '课程管理', 'FR-005': '课程管理',
          'FR-006': '选课管理', 'FR-007': '选课管理', 'FR-008': '选课管理', 'FR-009': '选课管理',
          'FR-010': '成绩管理', 'FR-011': '成绩管理', 'FR-012': '成绩管理',
          'FR-013': '通知管理', 'FR-014': '通知管理', 'FR-015': '通知管理',
        },
      },
    },
    // ---- probe-3 (medium): 10 需求 → 3 层层次 ----
    {
      probe_id: 'hierarchical_reasoning-3',
      dimension: 'hierarchical_reasoning',
      prompt: `请将以下 10 条 SRS 需求进行两级分类：先按大类（领域）分，再按小类（功能模块）分。

可选领域：教务管理, 系统基础设施
可选模块：课程管理, 选课管理, 成绩管理, 用户管理, 数据管理

需求：
1. FR-001: 系统必须支持学生通过学号登录。
2. FR-002: 系统必须展示所有可用课程。
3. FR-003: 学生可以在选课开放期选课。
4. FR-004: 学生可以退选课程。
5. FR-005: 教师录入学生成绩。
6. FR-006: 系统自动计算 GPA。
7. FR-007: 管理员创建课程。
8. FR-008: 系统每学期初初始化数据库。
9. FR-009: 系统每日自动备份数据。
10. FR-010: 系统记录所有操作日志。

请以 JSON 数组格式输出，每条包含 requirement、domain 和 module 字段。`,
      expected: {
        checks: ['accuracy_80pct'],
        hierarchy_expected: {
          'FR-001': '用户管理', 'FR-002': '课程管理', 'FR-003': '选课管理',
          'FR-004': '选课管理', 'FR-005': '成绩管理', 'FR-006': '成绩管理',
          'FR-007': '课程管理', 'FR-008': '数据管理', 'FR-009': '数据管理', 'FR-010': '数据管理',
        },
      },
    },
    // ---- probe-4 (hard): 20 需求含交叉 → 分层+检测 ----
    {
      probe_id: 'hierarchical_reasoning-4',
      dimension: 'hierarchical_reasoning',
      prompt: `请将以下 20 条 SRS 需求归类到最合适的模块中，并检测是否有需求同时属于多个模块（交叉依赖）。

可选模块：认证授权, 课程管理, 选课管理, 成绩管理, 通知管理, 数据分析, 系统管理

需求：
1. FR-001: 系统必须支持学生通过学号和密码登录。
2. FR-002: 系统必须支持教师通过工号和密码登录。
3. FR-003: 系统必须支持管理员登录。
4. FR-004: 系统必须展示所有可用课程。
5. FR-005: 管理员可以添加、修改和删除课程。
6. FR-006: 系统必须显示每门课程的选课人数统计。
7. FR-007: 学生可以提交选课申请。
8. FR-008: 学生可以退选课程。
9. FR-009: 系统显示课程容量和已选人数。
10. FR-010: 系统拒绝超额选课。
11. FR-011: 教师录入学生成绩。
12. FR-012: 系统计算 GPA。
13. FR-013: 系统生成课程成绩分布统计。
14. FR-014: 系统在成绩公布后通知学生。
15. FR-015: 系统在选课开放前提醒学生。
16. FR-016: 系统分析选课数据生成热门课程报告。
17. FR-017: 系统分析成绩数据生成教学质量报告。
18. FR-018: 系统每学期初初始化数据库。
19. FR-019: 系统每日备份数据。
20. FR-020: 系统记录所有关键操作的审计日志。

注意：有些需求可能跨模块（如 FR-006 既属于课程管理又属于数据分析，FR-013 既属于成绩管理又属于数据分析）。请检测并标注跨模块归属。

请以 JSON 数组格式输出，每条包含 requirement、module 和 cross_modules（可选）字段。`,
      expected: {
        checks: ['accuracy_70pct'],
        hierarchy_expected: {
          'FR-001': '认证授权', 'FR-002': '认证授权', 'FR-003': '认证授权',
          'FR-004': '课程管理', 'FR-005': '课程管理',
          'FR-006': '数据分析',
          'FR-007': '选课管理', 'FR-008': '选课管理', 'FR-009': '选课管理', 'FR-010': '选课管理',
          'FR-011': '成绩管理', 'FR-012': '成绩管理',
          'FR-013': '数据分析',
          'FR-014': '通知管理', 'FR-015': '通知管理',
          'FR-016': '数据分析', 'FR-017': '数据分析',
          'FR-018': '系统管理', 'FR-019': '系统管理', 'FR-020': '系统管理',
        },
      },
    },
    // ---- probe-5 (hard): 平铺需求 → 自动推断模块 ----
    {
      probe_id: 'hierarchical_reasoning-5',
      dimension: 'hierarchical_reasoning',
      prompt: `以下是一段平铺的 SRS 需求叙述（没有显式的功能模块划分），请自动识别并创建合理的模块结构，将 12 条需求归类到你创建的模块中。

叙述文本：
================================
教务管理系统需求：

学生需要使用学号和密码登录系统。教师也需要登录，使用工号。登录后，学生可以浏览课程信息，包括课程名、教师和学分。管理员负责维护课程目录。选课期间，学生可以选课和退课。系统需要显示每门课的剩余名额。课程满员时不能再选。选课结束后，老师登录系统录入学生的考试成绩。学生可以查看自己的成绩和绩点。系统需要每学期初初始化。系统每天自动备份。
================================

请：
1. 从文本中提取 12 条需求
2. 创建你认为合适的模块（3-6 个模块）
3. 将每条需求归类到模块中
4. 以 JSON 数组格式输出，每条包含 requirement 和 module 字段`,
      expected: {
        checks: ['accuracy_70pct'],
        hierarchy_expected: {},
      },
    },
  ];
}

function generateLogicalReasoningProbes(): ProbeItem[] {
  return [
    // ---- probe-1 (easy): DEPENDS_ON ----
    {
      probe_id: 'logical_reasoning-1',
      dimension: 'logical_reasoning',
      prompt: `请根据以下 4 条需求推导它们之间的 DEPENDS_ON 依赖关系。

需求：
R-A: 系统必须每学期初初始化选课数据库。
R-B: 系统必须支持学生通过学号和密码登录。
R-C: 学生可以在选课开放期间提交选课申请。
R-D: 系统在选课结束后自动生成每位学生的正式课表。

如果 X 需要在 Y 之前完成，则 X DEPENDS_ON Y。

请以 JSON 数组格式输出。`,
      expected: {
        checks: ['direction_correct'],
        relation_type: 'DEPENDS_ON',
        logical_expected: [
          { source: 'R-B', target: 'R-A', relation: 'DEPENDS_ON' },
          { source: 'R-C', target: 'R-B', relation: 'DEPENDS_ON' },
          { source: 'R-D', target: 'R-C', relation: 'DEPENDS_ON' },
        ],
      },
    },
    // ---- probe-2 (medium): DEPENDS_ON + REFINES ----
    {
      probe_id: 'logical_reasoning-2',
      dimension: 'logical_reasoning',
      prompt: `请根据以下 6 条需求推导它们之间的依赖关系。有的关系是 DEPENDS_ON（时序依赖），有的是 REFINES（细化关系）。

需求：
R-A: 系统必须支持用户登录。
R-B: 系统必须支持学生通过学号和密码登录。（细化 R-A）
R-C: 系统必须支持教师通过工号和密码登录。（细化 R-A）
R-D: 系统必须展示课程列表。
R-E: 管理员添加课程后，课程列表必须实时更新。（细化 R-D）
R-F: 学生登录后可以查看课程列表。

如果 X 需要在 Y 之前完成，则 X DEPENDS_ON Y。如果 X 是 Y 的具体实现，则 X REFINES Y。

请以 JSON 数组格式输出，每条包含 source、target 和 relation。`,
      expected: {
        checks: ['direction_correct', 'relation_type_correct'],
        relation_type: 'DEPENDS_ON',
        logical_expected: [
          { source: 'R-B', target: 'R-A', relation: 'REFINES' },
          { source: 'R-C', target: 'R-A', relation: 'REFINES' },
          { source: 'R-E', target: 'R-D', relation: 'REFINES' },
          { source: 'R-F', target: 'R-B', relation: 'DEPENDS_ON' },
          { source: 'R-F', target: 'R-D', relation: 'DEPENDS_ON' },
        ],
      },
    },
    // ---- probe-3 (medium): CONFLICTS_WITH 矛盾检测 ----
    {
      probe_id: 'logical_reasoning-3',
      dimension: 'logical_reasoning',
      prompt: `请根据以下 7 条需求推导它们之间的所有关系（DEPENDS_ON、REFINES 和 CONFLICTS_WITH）。

需求：
R-A: 学生可以在选课开放期间提交选课申请。
R-B: 系统必须支持 5000 名并发学生同时选课。
R-C: 系统在课程容量已满时必须拒绝超额选课。（细化 R-B 的并发控制）
R-D: 选课数据必须实时更新以保证一致性。
R-E: 为了性能，选课数据允许 5 秒的最终一致性延迟。（与 R-D 存在矛盾）
R-F: 系统在选课结束后生成正式课表。
R-G: 系统支持退选功能，允许学生在截止日期前退选。（可能与 R-D 产生冲突——退选和实时更新同时发生）

如果 X 与 Y 存在设计矛盾，用 CONFLICTS_WITH。

请以 JSON 数组格式输出。`,
      expected: {
        checks: ['direction_correct', 'relation_type_correct'],
        relation_type: 'DEPENDS_ON',
        logical_expected: [
          { source: 'R-C', target: 'R-B', relation: 'REFINES' },
          { source: 'R-E', target: 'R-D', relation: 'CONFLICTS_WITH' },
          { source: 'R-G', target: 'R-D', relation: 'CONFLICTS_WITH' },
          { source: 'R-F', target: 'R-A', relation: 'DEPENDS_ON' },
          { source: 'R-G', target: 'R-A', relation: 'DEPENDS_ON' },
        ],
      },
    },
    // ---- probe-4 (hard): 传递依赖（A→B→C→D） ----
    {
      probe_id: 'logical_reasoning-4',
      dimension: 'logical_reasoning',
      prompt: `请根据以下 8 条需求推导所有直接和传递依赖关系。注意：如果 A→B 和 B→C，则存在传递依赖 A→*→C（也应标记为间接依赖）。

需求：
R-A: 系统每学期初初始化数据库。
R-B: 管理员必须创建课程。
R-C: 管理员必须配置选课时间和规则。
R-D: 学生登录后查看可选课程。
R-E: 学生提交选课申请。
R-F: 系统处理选课结果并更新课程容量。
R-G: 教师查看课表。
R-H: 教师在学期末录入成绩。

如果 X 需要在 Y 之前完成，标记为 DEPENDS_ON。如果 X 通过中间步骤依赖 Y，标记为 DEPENDS_ON_TRANSITIVE。

请以 JSON 数组格式输出，重点标注传递依赖。`,
      expected: {
        checks: ['direction_correct', 'transitive_detected'],
        transitive_dep: true,
        logical_expected: [
          { source: 'R-B', target: 'R-A', relation: 'DEPENDS_ON' },
          { source: 'R-C', target: 'R-A', relation: 'DEPENDS_ON' },
          { source: 'R-D', target: 'R-B', relation: 'DEPENDS_ON' },
          { source: 'R-D', target: 'R-C', relation: 'DEPENDS_ON' },
          { source: 'R-E', target: 'R-D', relation: 'DEPENDS_ON' },
          { source: 'R-F', target: 'R-E', relation: 'DEPENDS_ON' },
          { source: 'R-G', target: 'R-F', relation: 'DEPENDS_ON' },
          { source: 'R-H', target: 'R-F', relation: 'DEPENDS_ON' },
          { source: 'R-E', target: 'R-A', relation: 'DEPENDS_ON_TRANSITIVE' },
        ],
      },
    },
    // ---- probe-5 (hard): 循环依赖识别 ----
    {
      probe_id: 'logical_reasoning-5',
      dimension: 'logical_reasoning',
      prompt: `请根据以下 9 条需求推导依赖关系，并检查是否存在循环依赖。如果存在循环依赖，请明确标注。

需求：
R-A: 课程创建模块——管理员创建课程。
R-B: 课程发布模块——课程创建后自动发布到选课系统。
R-C: 选课模块——学生选择已发布的课程。
R-D: 选课验证模块——验证学生是否满足先修条件。
R-E: 先修条件检查——需要读取成绩模块的数据。
R-F: 成绩模块——学生完成课程后获取成绩。
R-G: 毕业审核模块——检查学生是否满足毕业条件（需要成绩和选课数据）。
R-H: 课程推荐模块——根据学生成绩推荐下一学期的课程（依赖 R-F）。
R-I: 课程需求预测——根据选课数据预测下学期课程需求，反馈给课程创建模块（R-A），形成 R-A→R-B→R-C→R-I→R-A 的循环。

注意：R-I 可能造成循环——选课数据 → 需求预测 → 课程创建 → 发布 → 选课。

请以 JSON 数组格式输出所有依赖关系，如果检测到循环依赖，额外输出 cycle_detected 信息。`,
      expected: {
        checks: ['direction_correct', 'cycle_detected'],
        cyclic_dep: true,
        logical_expected: [
          { source: 'R-B', target: 'R-A', relation: 'DEPENDS_ON' },
          { source: 'R-C', target: 'R-B', relation: 'DEPENDS_ON' },
          { source: 'R-D', target: 'R-C', relation: 'DEPENDS_ON' },
          { source: 'R-E', target: 'R-F', relation: 'DEPENDS_ON' },
          { source: 'R-F', target: 'R-C', relation: 'DEPENDS_ON' },
          { source: 'R-G', target: 'R-F', relation: 'DEPENDS_ON' },
          { source: 'R-H', target: 'R-F', relation: 'DEPENDS_ON' },
          { source: 'R-I', target: 'R-C', relation: 'DEPENDS_ON' },
          { source: 'R-I', target: 'R-A', relation: 'DEPENDS_ON' },
          { source: 'cycle_detected', target: 'R-A→R-B→R-C→R-I→R-A', relation: 'CYCLE' },
        ],
      },
    },
  ];
}

function generateTlaPlusProbes(): ProbeItem[] {
  return [
    // ---- probe-1 (easy) ----
    {
      probe_id: 'formal_tlaplus-1',
      dimension: 'formal_tlaplus',
      prompt: `Write a TLA+ spec for a simple counter. The counter has two operations:
- Increment: increases the counter value by 1, but the value must not exceed 100.
- Reset: sets the counter to 0.

Include a type invariant to ensure the counter is always a non-negative integer ≤ 100.
Name your module "Counter".`,
      expected: {
        checks: ['sany_pass', 'tlc_pass', 'mutation_test'],
      },
    },
    // ---- probe-2 (easy) ----
    {
      probe_id: 'formal_tlaplus-2',
      dimension: 'formal_tlaplus',
      prompt: `Write a TLA+ spec for a toggle switch. The switch has two states: "on" and "off".
The only operation is Toggle, which changes the state from on to off or from off to on.
Include an invariant that the switch is always either "on" or "off".
Name your module "Toggle".`,
      expected: {
        checks: ['sany_pass', 'tlc_pass', 'mutation_test'],
      },
    },
    // ---- probe-3 (medium) ----
    {
      probe_id: 'formal_tlaplus-3',
      dimension: 'formal_tlaplus',
      prompt: `Write a TLA+ spec for a bounded FIFO queue with maximum capacity MaxLen = 5.
The queue supports two operations:
- Enqueue(item): adds an item to the back of the queue (only if not full).
- Dequeue: removes and returns the item at the front of the queue (only if not empty).

Define items as natural numbers. Include a type invariant and a capacity invariant.
Name your module "Queue".`,
      expected: {
        checks: ['sany_pass', 'tlc_pass', 'mutation_test'],
      },
    },
    // ---- probe-4 (medium) ----
    {
      probe_id: 'formal_tlaplus-4',
      dimension: 'formal_tlaplus',
      prompt: `Write a TLA+ spec for a mutual exclusion lock shared by 2 concurrent processes (p1, p2).
Each process alternates between states: "idle", "trying", and "critical".
Safety property: at most one process may be in the "critical" state at any time.

Define two process actions per process (Try, Exit). Use a global lock variable.
Name your module "Mutex".`,
      expected: {
        checks: ['sany_pass', 'tlc_pass', 'mutation_test'],
      },
    },
    // ---- probe-5 (medium) ----
    {
      probe_id: 'formal_tlaplus-5',
      dimension: 'formal_tlaplus',
      prompt: `Write a TLA+ spec for a producer-consumer system with a shared bounded buffer of capacity 3.
- The producer puts items (natural numbers) into the buffer when the buffer is not full.
- The consumer takes items from the buffer when the buffer is not empty.

Use a FIFO queue for the buffer. Include type and safety invariants (buffer size never exceeds 3).
Name your module "ProdCons".`,
      expected: {
        checks: ['sany_pass', 'tlc_pass', 'mutation_test'],
      },
    },
    // ---- probe-6 (hard) ----
    {
      probe_id: 'formal_tlaplus-6',
      dimension: 'formal_tlaplus',
      prompt: `Write a TLA+ spec for a leader election protocol among 3 nodes (n1, n2, n3).
Each node can be in states: "candidate" or "leader".
Safety property: at most 1 node may be in the "leader" state at any time.
Liveness property: eventually at least one node becomes leader.

Model nodes with a set {n1, n2, n3}. Each node has state variable. Use a single shared
leader variable. Include both safety and liveness (temporal) properties.
Name your module "LeaderElection".`,
      expected: {
        checks: ['sany_pass', 'tlc_pass', 'mutation_test'],
      },
    },
    // ---- probe-7 (hard) ----
    {
      probe_id: 'formal_tlaplus-7',
      dimension: 'formal_tlaplus',
      prompt: `Write a TLA+ spec for a distributed lock system with deadlock detection.
Two concurrent processes (p1, p2) compete for two shared resources (r1, r2).
Each process needs to acquire both resources to do work, but they can only acquire one at a time.

Process p1 acquires r1 then r2. Process p2 acquires r2 then r1 — this creates risk of deadlock.
Model each resource with states: "free" or "held_by_pX".
Include a deadlock detection invariant that flags when both processes are waiting.

Name your module "DistributedLock".`,
      expected: {
        checks: ['sany_pass', 'tlc_pass', 'mutation_test'],
      },
    },
  ];
}

function generateLean4Probes(): ProbeItem[] {
  return [
    // ---- probe-1 (easy) ----
    {
      probe_id: 'formal_lean4-1',
      dimension: 'formal_lean4',
      prompt: `Prove in Lean 4: For all natural numbers n, if n is even then n^2 is even.

Define "even" as: ∃ k, n = 2*k.
Do NOT use mathlib. Define everything from scratch.`,
      expected: {
        checks: ['lake_build', 'no_sorry', 'no_axiom'],
      },
    },
    // ---- probe-2 (easy) ----
    {
      probe_id: 'formal_lean4-2',
      dimension: 'formal_lean4',
      prompt: `Prove in Lean 4: The sum of natural numbers from 1 to n equals n*(n+1)/2.

Define your own sum function recursively.
Do NOT use mathlib. Define everything from scratch.`,
      expected: {
        checks: ['lake_build', 'no_sorry', 'no_axiom'],
      },
    },
    // ---- probe-3 (medium) ----
    {
      probe_id: 'formal_lean4-3',
      dimension: 'formal_lean4',
      prompt: `Prove in Lean 4: Reversing a list twice yields the original list (rev (rev l) = l).

Define your own List type (as an inductive type) and reverse function recursively.
Do NOT use mathlib or the built-in List. Define everything from scratch.`,
      expected: {
        checks: ['lake_build', 'no_sorry', 'no_axiom'],
      },
    },
    // ---- probe-4 (medium) ----
    {
      probe_id: 'formal_lean4-4',
      dimension: 'formal_lean4',
      prompt: `Prove in Lean 4 the Pigeonhole principle: Given a function f: ℕ → ℕ and n+1 distinct natural numbers as inputs, at least one output value occurs at least 2 times.

Formally: For any n:ℕ, any list xs of length n+1 of distinct ℕ's, there exist i≠j<length xs such that f(xs[i]) = f(xs[j]).
Do NOT use mathlib. Define everything from scratch.`,
      expected: {
        checks: ['lake_build', 'no_sorry', 'no_axiom'],
      },
    },
    // ---- probe-5 (medium) ----
    {
      probe_id: 'formal_lean4-5',
      dimension: 'formal_lean4',
      prompt: `Prove in Lean 4: The square root of 2 is irrational.

That is, there are no natural numbers p, q (q ≠ 0) such that (p/q)^2 = 2.
Proceed by contradiction: show that if (p/q)^2 = 2 in lowest terms, then both p and q are even.
Do NOT use mathlib. Define everything from scratch.`,
      expected: {
        checks: ['lake_build', 'no_sorry', 'no_axiom'],
      },
    },
    // ---- probe-6 (hard) ----
    {
      probe_id: 'formal_lean4-6',
      dimension: 'formal_lean4',
      prompt: `Prove in Lean 4: There is no surjection from ℕ to the set of all infinite sequences of bits (Cantor's diagonal argument).

Define infinite bit sequences as ℕ → Bool. Show that for any function f: ℕ → (ℕ → Bool), there exists a sequence s that is not in the image of f.
Do NOT use mathlib. Define everything from scratch.`,
      expected: {
        checks: ['lake_build', 'no_sorry', 'no_axiom'],
      },
    },
    // ---- probe-7 (hard) ----
    {
      probe_id: 'formal_lean4-7',
      dimension: 'formal_lean4',
      prompt: `Prove in Lean 4: The kernel of a group homomorphism is a normal subgroup.

Define from scratch:
- A Group structure (carrier set, multiplication, identity, inverse, associativity, identity, inverse axioms)
- A GroupHomomorphism (map preserving multiplication)
- The kernel of a homomorphism
- A NormalSubgroup (subgroup closed under conjugation)

Then prove: The kernel of any group homomorphism is a normal subgroup.
Do NOT use mathlib. Define everything from scratch.`,
      expected: {
        checks: ['lake_build', 'no_sorry', 'no_axiom'],
      },
    },
  ];
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

const VALID_CATEGORIES = ['explicit', 'implicit', 'relational'];
const REQUIRED_FIELDS = ['id', 'category', 'statement', 'source_file', 'confidence'];

/**
 * 逐行评分：instruction_following 和 structured_output 共用此逻辑，
 * 但检查项不同。
 */
function scoreJsonlRecords(
  probe: ProbeItem,
  answer: string,
  checkMap: Record<string, (records: Record<string, unknown>[], rawAnswer: string) => { score: number; detail: string }>,
): ProbeResult {
  const records = parseJsonlLines(answer);
  const details: string[] = [];
  let totalScore = 0;
  const checks = probe.expected.checks;

  for (const check of checks) {
    const handler = checkMap[check];
    if (handler) {
      const result = handler(records, answer);
      details.push(result.detail);
      totalScore += result.score;
    }
  }

  // min_records: if fewer records than expected
  if (probe.expected.min_records !== undefined && records.length < probe.expected.min_records) {
    details.push(`期望至少 ${probe.expected.min_records} 条记录，实际 ${records.length} 条`);
    totalScore *= records.length / probe.expected.min_records;
  }

  // max_records: if more records than expected (penalty for extracting too many)
  if (probe.expected.max_records !== undefined && records.length > probe.expected.max_records) {
    details.push(`期望最多 ${probe.expected.max_records} 条记录，实际 ${records.length} 条`);
    totalScore *= probe.expected.max_records / records.length;
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
  const expectedPrefix = probe.expected.id_prefix ?? 'R1';
  const dynamicIdRe = new RegExp(`^${expectedPrefix}-[A-Z]+-\\d{4}$`);

  const checkMap: Record<string, (records: Record<string, unknown>[], rawAnswer: string) => { score: number; detail: string }> = {
    id_format: (records) => {
      if (records.length === 0) return { score: 0, detail: 'id_format: 无记录可检查' };
      const passed = records.filter((r) => dynamicIdRe.test(String(r.id ?? '')));
      const pct = Math.round((passed.length / records.length) * 100);
      return { score: pct, detail: `id_format (${expectedPrefix}): ${passed.length}/${records.length} 条记录 ID 格式正确 (${pct}%)` };
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
    no_missing_field_warning: (_, rawAnswer) => {
      // LLM should refuse or warn about missing source_file and metadata fields
      const mentionsMissing = rawAnswer.includes('source_file') || rawAnswer.includes('metadata') ||
        rawAnswer.includes('缺少') || rawAnswer.includes('缺失') || rawAnswer.includes('不完整') ||
        rawAnswer.includes('incomplete') || rawAnswer.includes('missing');
      if (mentionsMissing) {
        return { score: 100, detail: 'no_missing_field_warning: ✓ 检测到模板字段缺失并提醒' };
      }
      return { score: 0, detail: 'no_missing_field_warning: 未检测到模板字段缺失警告，LLM 盲从了不完整模板' };
    },
    no_interference_extraction: (records, _rawAnswer) => {
      if (records.length === 0) return { score: 0, detail: 'no_interference_extraction: 无记录可检查' };
      // LLM should NOT extract implementation details or non-requirements
      const interferenceKeywords = ['PostgreSQL', 'React', '美化', '验证码', '推荐算法'];
      const extractedText = records.map(r => JSON.stringify(r)).join(' ');
      const hasInterference = interferenceKeywords.some(kw => extractedText.includes(kw));
      if (!hasInterference) {
        return { score: 100, detail: 'no_interference_extraction: ✓ 未提取干扰内容（实现建议/无关讨论）' };
      }
      return { score: 0, detail: 'no_interference_extraction: 提取了干扰内容（实现建议或无关讨论）' };
    },
    empty_output_handled: (records, rawAnswer) => {
      const trimmed = rawAnswer.trim();
      const isEmpty = trimmed === '' || trimmed === '[]' || trimmed === '{}' || records.length === 0;
      if (isEmpty) {
        return { score: 100, detail: 'empty_output_handled: ✓ 空输入正确返回空输出' };
      }
      return { score: 0, detail: `empty_output_handled: 空输入时应输出空内容，实际输出了 ${records.length} 条记录` };
    },
    no_fabricated_from_uncertain: (records) => {
      if (records.length === 0) return { score: 0, detail: 'no_fabricated_from_uncertain: 无记录可检查' };
      // LLM should NOT extract items marked [待讨论] or proposals
      const uncertainKeywords = ['推荐算法', '自动排课', '验证码', '待讨论', '还没定', '可以以后再议'];
      const extractedText = records.map(r => JSON.stringify(r)).join(' ');
      const hasUncertain = uncertainKeywords.some(kw => extractedText.includes(kw));
      if (!hasUncertain) {
        return { score: 100, detail: 'no_fabricated_from_uncertain: ✓ 未提取未确认内容' };
      }
      return { score: 0, detail: 'no_fabricated_from_uncertain: 提取了标记为待讨论/未确认的内容' };
    },
    special_chars_preserved: (records) => {
      if (records.length === 0) return { score: 0, detail: 'special_chars_preserved: 无记录可检查' };
      // Check that special characters are preserved (not corrupted or stripped)
      const hasSpecialChars = records.some(r => {
        const stmt = String(r.statement ?? '');
        return stmt.includes('😀') || stmt.includes('José') || stmt.includes('Müller') ||
          stmt.includes('!@#') || stmt.includes('%^&') || stmt.includes('出错');
      });
      if (hasSpecialChars) {
        return { score: 100, detail: 'special_chars_preserved: ✓ 特殊字符被正确保留' };
      }
      return { score: 0, detail: 'special_chars_preserved: 特殊字符丢失或损坏' };
    },
    template_refused: (_, rawAnswer) => {
      // LLM should refuse to extract when template asks for unrelated info
      const refusalKeywords = ['无法', '不能', '拒绝', '拒绝', '不存在', '没有', '无相关信息',
        'cannot', 'refuse', 'unable', 'decline', '不包含'];
      const asksWrongFields = rawAnswer.includes('student_name') || rawAnswer.includes('phone_number') || rawAnswer.includes('home_address');
      const isRefusal = refusalKeywords.some(kw => rawAnswer.includes(kw));
      // Perfect: points out the issue AND refuses
      if (isRefusal && asksWrongFields) {
        return { score: 100, detail: 'template_refused: ✓ 检测到错误模板并拒绝盲从' };
      }
      // Partial: mentions issue but still tries to extract
      if (isRefusal) {
        return { score: 50, detail: 'template_refused: 指出了问题但仍尝试提取（部分正确）' };
      }
      return { score: 0, detail: 'template_refused: 盲从了错误模板，提取了 SRS 中不存在的字段' };
    },
  };

  return scoreJsonlRecords(probe, answer, checkMap);
}

function scoreStructuredOutput(probe: ProbeItem, answer: string): ProbeResult {
  const checkMap: Record<string, (records: Record<string, unknown>[], rawAnswer: string) => { score: number; detail: string }> = {
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
    nested_metadata_preserved: (records) => {
      if (records.length === 0) return { score: 0, detail: 'nested_metadata_preserved: 无记录可检查' };
      // Check that at least one metadata has nested objects/arrays (not just flat {})
      const hasNested = records.some((r) => {
        const m = r.metadata;
        if (m === undefined || m === null || (typeof m === 'object' && Object.keys(m as object).length === 0)) return false;
        if (typeof m !== 'object' || Array.isArray(m)) return true; // complex
        // Check for nested objects inside metadata
        return Object.values(m as Record<string, unknown>).some(v => typeof v === 'object' && v !== null);
      });
      if (hasNested) {
        return { score: 100, detail: 'nested_metadata_preserved: ✓ metadata 包含嵌套结构' };
      }
      return { score: 0, detail: 'nested_metadata_preserved: metadata 缺少嵌套对象（priority/module/contacts/tags）' };
    },
    unicode_handled: (records) => {
      if (records.length === 0) return { score: 0, detail: 'unicode_handled: 无记录可检查' };
      const statements = records.map(r => String(r.statement ?? '')).join('');
      const hasUnicodeNames = statements.includes('José') || statements.includes('Müller') || statements.includes('李小龙');
      const hasMixed = (statements.includes('student') || statements.includes('API')) &&
        (statements.includes('登录') || statements.includes('系统'));
      if (hasUnicodeNames || hasMixed) {
        return { score: 100, detail: 'unicode_handled: ✓ 中英混合和 Unicode 字符被正确保留' };
      }
      return { score: 0, detail: 'unicode_handled: Unicode 字符丢失或混合语言未保留' };
    },
    contradiction_resolved: (records, _rawAnswer) => {
      if (records.length === 0) return { score: 0, detail: 'contradiction_resolved: 无记录可检查' };
      // Check LLM adopted the revision for FR-004 (第六周 not 第四周) and excluded unconfirmed items
      const allText = records.map(r => JSON.stringify(r)).join(' ');
      const hasCorrectWeek = allText.includes('第六周') && !allText.includes('第四周');
      const hasNoRejected = !allText.includes('邮箱+密码') && !allText.includes('抢课模式');
      if (hasCorrectWeek && hasNoRejected) {
        return { score: 100, detail: 'contradiction_resolved: ✓ 正确处理矛盾信息（采纳确认的修改，排除否决意见）' };
      }
      if (hasCorrectWeek) {
        return { score: 50, detail: 'contradiction_resolved: 部分正确处理矛盾（采纳了修改但可能包含了未确认内容）' };
      }
      return { score: 0, detail: 'contradiction_resolved: 未正确处理矛盾信息（未采纳已批准修改或提取了否决意见）' };
    },
    long_text_no_truncation: (records, _rawAnswer) => {
      // Check coverage: LLM should cover requirements from all chapters (not just early ones)
      const chapterKeywords = ['密码', '课程创建', '容量', '先修课程', '预选', '退选', 'GPA', '评估', '备份', 'RBAC'];
      const allText = records.map(r => JSON.stringify(r)).join(' ');
      const covered = chapterKeywords.filter(kw => allText.includes(kw));
      const coveragePct = Math.round((covered.length / chapterKeywords.length) * 100);
      if (coveragePct >= 70) {
        return { score: 100, detail: `long_text_no_truncation: ✓ 覆盖所有章节 (${covered.length}/${chapterKeywords.length} 关键词匹配)` };
      }
      if (coveragePct >= 40) {
        return { score: 50, detail: `long_text_no_truncation: 部分覆盖 (${covered.length}/${chapterKeywords.length})` };
      }
      return { score: 0, detail: `long_text_no_truncation: 长文本截断或只处理了前几章 (${covered.length}/${chapterKeywords.length})` };
    },
  };

  return scoreJsonlRecords(probe, answer, checkMap);
}


function scorePrecision(probe: ProbeItem, answer: string): ProbeResult {
  const details: string[] = [];
  const parsed = extractJson(answer);
  let extracted: string[] = [];
  let score = 0;
  const checks = probe.expected.checks;

  // Use probe-specific expected data
  const realKeywords = probe.expected.expected_real_reqs ?? [];
  const fakeKeywords = probe.expected.fake_keywords ?? [];

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

  const containsFabricated = extracted.some((item) =>
    fakeKeywords.some((kw) => item.includes(kw)),
  );

  const fabricatedInAnswer = extracted.filter((item) =>
    fakeKeywords.some((kw) => item.includes(kw)),
  );

  if (checks.includes('no_fabricated')) {
    if (containsFabricated) {
      details.push(`no_fabricated: 包含编造需求 (${fabricatedInAnswer.length} 条)`);
    } else {
      details.push('no_fabricated: ✓ 未包含编造需求');
    }
  }

  // Check no_missing: all real requirements should be extracted
  const matchedReals = realKeywords.filter((kw) =>
    extracted.some((item) => item.includes(kw)),
  );

  if (checks.includes('no_missing')) {
    if (matchedReals.length >= realKeywords.length) {
      details.push(`no_missing: ✓ 提取了全部 ${realKeywords.length} 条真实需求`);
    } else {
      details.push(`no_missing: 只提取了 ${matchedReals.length}/${realKeywords.length} 条真实需求`);
    }
  }

  // Check dedup_correct: each unique real requirement topic maps to at most one extracted item
  let dedupScore = 0;
  if (checks.includes('dedup_correct')) {
    const dedupViolations = realKeywords.filter((kw) =>
      extracted.filter((item) => item.includes(kw)).length > 1
    );
    if (dedupViolations.length === 0) {
      dedupScore = 100;
      details.push(`dedup_correct: ✓ 无重复主题 (覆盖 ${realKeywords.length} 个主题)`);
    } else if (dedupViolations.length < realKeywords.length) {
      dedupScore = 50;
      details.push(`dedup_correct: 部分主题重复提取 (${dedupViolations.length}/${realKeywords.length} 个)`);
    } else {
      dedupScore = 0;
      details.push(`dedup_correct: 全部主题重复提取 (${dedupViolations.length}/${realKeywords.length} 个)`);
    }
  }

  // Check cross_line_resolved: "同上" references expanded correctly
  let crossLineScore = 0;
  if (checks.includes('cross_line_resolved')) {
    const allItems = extracted.join(' ');
    const expectedKeywords = ['工号', '成绩', '退选'];
    const matchedCount = expectedKeywords.filter((kw) => allItems.includes(kw)).length;
    const countReasonable = extracted.length >= 7 && extracted.length <= 8;
    if (matchedCount === expectedKeywords.length && countReasonable) {
      crossLineScore = 100;
      details.push(`cross_line_resolved: ✓ 正确展开 "同上" 引用 (${matchedCount}/${expectedKeywords.length} 关键词, ${extracted.length} 条)`);
    } else if (matchedCount > 0) {
      crossLineScore = 50;
      details.push(`cross_line_resolved: 部分展开 "同上" 引用 (${matchedCount}/${expectedKeywords.length} 关键词, ${extracted.length} 条)`);
    } else {
      crossLineScore = 0;
      details.push(`cross_line_resolved: 未展开 "同上" 引用`);
    }
  }

  // Calculate F-score / average
  const precision = extracted.length > 0 ? (extracted.length - fabricatedInAnswer.length) / extracted.length : 0;
  const recall = realKeywords.length > 0 ? matchedReals.length / realKeywords.length : 1;

  // Convert to score 0-100: average of precision and recall
  score = Math.round(((containsFabricated ? 0 : precision) + recall) / 2 * 100);

  // Blend in new check scores
  const newCheckScores: number[] = [];
  if (checks.includes('dedup_correct')) newCheckScores.push(dedupScore);
  if (checks.includes('cross_line_resolved')) newCheckScores.push(crossLineScore);
  if (newCheckScores.length > 0) {
    const avgNew = newCheckScores.reduce((a, b) => a + b, 0) / newCheckScores.length;
    score = Math.round((score + avgNew) / 2);
  }

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
  const hierarchyExpected = probe.expected.hierarchy_expected;
  const hasExpected = hierarchyExpected && Object.keys(hierarchyExpected).length > 0;

  if (hasExpected) {
    // Use existing FR-ID matching logic when hierarchy_expected is non-empty
    let correctCount = 0;
    for (const a of assignments) {
      const req = String(a.requirement ?? '');
      const module = String(a.module ?? '');

      // Extract FR-ID from requirement string
      const frMatch = req.match(/(FR-\d{3})/);
      if (frMatch) {
        const frId = frMatch[1]!;
        const expected = hierarchyExpected[frId];
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

  // No pre-defined hierarchy_expected: evaluate flat-text auto-infer probe
  // Criterion 1: module count is reasonable (3-6 modules)
  const uniqueModules = new Set(assignments.map((a) => String(a.module ?? '').trim()).filter(Boolean));
  const moduleCount = uniqueModules.size;
  const moduleCountScore = moduleCount >= 3 && moduleCount <= 6 ? 50 : 0;
  details.push(`module_count: ${moduleCount} 个模块 (${moduleCount >= 3 && moduleCount <= 6 ? '合理 ✓' : '不合理'})`);

  // Criterion 2: each requirement assigned to exactly one module
  const reqCount = assignments.length;
  const reqsWithModule = assignments.filter((a) => String(a.module ?? '').trim() !== '').length;
  const oneModulePerReq = reqCount > 0 && reqsWithModule === reqCount;
  const oneModuleScore = oneModulePerReq ? 25 : 0;
  details.push(`one_module_per_req: ${reqsWithModule}/${reqCount} 条需求有模块分配 (${oneModulePerReq ? '✓' : '部分需求缺少模块'})`);

  // Criterion 3: module names are semantically meaningful (not just "模块1", "模块2", etc.)
  const genericNamePattern = /^模块\d+$/;
  const allGeneric = [...uniqueModules].every((name) => genericNamePattern.test(name));
  const meaningfulNameScore = moduleCount > 0 && !allGeneric ? 25 : 0;
  details.push(`meaningful_names: ${allGeneric ? '模块名为默认名称（如 模块1）' : '模块名有语义含义 ✓'}`);

  const autoScore = moduleCountScore + oneModuleScore + meaningfulNameScore;
  details.push(`auto_infer_total: ${autoScore}/100`);

  return {
    probe_id: probe.probe_id,
    dimension: 'hierarchical_reasoning',
    score: autoScore,
    details,
    passed: autoScore >= 70,
  };
}

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
    const found = (probe.expected.logical_expected ?? []).some((e) => e.source === src && e.target === tgt);
    if (found) {
      correctCount++;
    }
    // If reversed, it's wrong direction, so don't count
  }

  const checks = probe.expected.checks;
  const pct = Math.round((relations.length > 0 ? correctCount / relations.length : 0) * 100);
  details.push(`direction_correct: ${correctCount}/${relations.length} 条关系方向正确 (${pct}%)`);

  // Check relation_type_correct: verify answer includes expected relation types
  let relationTypeScore = 0;
  if (checks.includes('relation_type_correct')) {
    const expectedType = probe.expected.relation_type;
    if (expectedType) {
      const hasExpectedType = relations.some((r) => {
        const rel = String(r.relation ?? '').trim().toUpperCase();
        return rel === expectedType || rel.includes(expectedType);
      });
      const foundOtherType = relations.some((r) => {
        const rel = String(r.relation ?? '').trim().toUpperCase();
        return rel.length > 0;
      });
      if (hasExpectedType) {
        relationTypeScore = 100;
        details.push(`relation_type_correct: ✓ 包含期望关系类型 ${expectedType}`);
      } else if (foundOtherType) {
        relationTypeScore = 50;
        details.push(`relation_type_correct: 关系类型标记有误（期望 ${expectedType}）`);
      } else {
        relationTypeScore = 0;
        details.push(`relation_type_correct: 缺少关系类型标记`);
      }
    }
  }

  // Check transitive_detected: verify at least one DEPENDS_ON_TRANSITIVE relation
  let transitiveScore = 0;
  if (checks.includes('transitive_detected')) {
    const hasTransitive = relations.some((r) => {
      const rel = String(r.relation ?? '').trim().toUpperCase();
      return rel.includes('TRANSITIVE') || rel === 'DEPENDS_ON_TRANSITIVE';
    });
    if (hasTransitive) {
      transitiveScore = 100;
      details.push('transitive_detected: ✓ 检测到传递依赖 (DEPENDS_ON_TRANSITIVE)');
    } else {
      transitiveScore = 0;
      details.push('transitive_detected: 未检测到传递依赖');
    }
  }

  // Check cycle_detected: verify answer identifies a cycle
  let cycleScore = 0;
  if (checks.includes('cycle_detected')) {
    const answerText = answer.toLowerCase();
    const hasCycle = answerText.includes('cycle') || answerText.includes('循环');
    const hasCycleField = relations.some((r) => {
      const rel = String(r.relation ?? '').trim().toUpperCase();
      return rel.includes('CYCLE') || rel === 'SELF_REFERENCING';
    });
    const cycleDetected = hasCycle || hasCycleField || relations.some((r) => (r as Record<string, unknown>).cycle_detected === true);
    if (cycleDetected) {
      cycleScore = 100;
      details.push('cycle_detected: ✓ 检测到循环依赖');
    } else {
      cycleScore = 0;
      details.push('cycle_detected: 未检测到循环依赖');
    }
  }

  // Blend scores: direction_correct is base, new checks are averaged in
  const newCheckScores2: number[] = [];
  if (checks.includes('relation_type_correct')) newCheckScores2.push(relationTypeScore);
  if (checks.includes('transitive_detected')) newCheckScores2.push(transitiveScore);
  if (checks.includes('cycle_detected')) newCheckScores2.push(cycleScore);
  let finalScore = pct;
  if (newCheckScores2.length > 0) {
    const avgNew = newCheckScores2.reduce((a, b) => a + b, 0) / newCheckScores2.length;
    finalScore = Math.round((pct + avgNew) / 2);
  }
  finalScore = Math.max(0, Math.min(100, finalScore));

  return {
    probe_id: probe.probe_id,
    dimension: 'logical_reasoning',
    score: finalScore,
    details,
    passed: finalScore >= 70,
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

  const validRefs = refs.filter((r) => /^R\d+$/.test(r.trim()));
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

// ===================== Formal Methods Scoring =====================

/**
 * Detect TLA+ toolchain: need java + (tla2tools.jar or tlc command)
 */
function detectTlaPlusToolchain(): boolean {
  try {
    execSync("java -version 2>&1", { stdio: "pipe" });
  } catch {
    return false;
  }
  try {
    execSync("which tlc 2>/dev/null || tlc -version 2>/dev/null", { stdio: "pipe" });
    return true;
  } catch {
    // fall through -- check for tla2tools.jar
  }
  try {
    execSync("java -cp tla2tools.jar tla2.SANY 2>&1", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function scoreTlaPlus(probe: ProbeItem, answer: string, tempDir?: string): ProbeResult {
  const details: string[] = [];
  let score = 0;
  const workDir = tempDir ?? fs.mkdtempSync('tlaplus-');

  // 1. Write answer to probe.tla
  const tlaPath = path.join(workDir, 'probe.tla');
  fs.writeFileSync(tlaPath, answer, "utf-8");

  // 2. Detect toolchain
  if (!detectTlaPlusToolchain()) {
    details.push("TLA+ toolchain unavailable (java + tla2tools.jar required)");
    return { probe_id: probe.probe_id, dimension: probe.dimension, score: 0, details, passed: false };
  }

  // 3. Run SANY
  try {
    execSync("java -cp tla2tools.jar tla2.SANY probe.tla", { cwd: workDir, stdio: "pipe" });
    details.push("SANY: syntax check passed");
    score += 30;
  } catch {
    details.push("SANY: syntax error");
    return { probe_id: probe.probe_id, dimension: probe.dimension, score, details, passed: false };
  }

  // 4. Run TLC
  try {
    execSync("java -cp tla2tools.jar tla2.TLC probe.tla", { cwd: workDir, stdio: "pipe", timeout: 30000 });
    details.push("TLC: model check passed");
    score += 40;
  } catch {
    details.push("TLC: model check failed or timeout");
    return { probe_id: probe.probe_id, dimension: probe.dimension, score, details, passed: false };
  }

  // 5. Mutation test: inject a known bug into the invariant and verify TLC catches it
  let mutationScore = 0;
  if (answer.includes("INVARIANT")) {
    try {
      const mutated = answer.replace(/INVARIANT\s+\w+/g, "INVARIANT FALSE");
      fs.writeFileSync(tlaPath, mutated, "utf-8");
      try {
        execSync("java -cp tla2tools.jar tla2.TLC probe.tla", { cwd: workDir, stdio: "pipe", timeout: 15000 });
        details.push("Mutation test: TLC passed with FALSE invariant (no effect)");
        mutationScore = 0;
      } catch {
        details.push("Mutation test: invariant caught injected bug");
        mutationScore = 30;
      }
    } catch {
      details.push("Mutation test: could not mutate spec");
      mutationScore = 0;
    }
    // Restore original spec
    fs.writeFileSync(tlaPath, answer, "utf-8");
  } else {
    details.push("Mutation test: no INVARIANT found to mutate");
    mutationScore = 0;
  }
  score += mutationScore;

  return {
    probe_id: probe.probe_id,
    dimension: probe.dimension,
    score: Math.min(100, score),
    details,
    passed: score >= 70,
  };
}

/**
 * Detect Lean 4 toolchain: check for lake command
 */
function detectLean4Toolchain(): boolean {
  try {
    execSync("which lake 2>/dev/null", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function scoreLean4(probe: ProbeItem, answer: string, tempDir?: string): ProbeResult {
  const details: string[] = [];
  let score = 0;
  const workDir = tempDir ?? fs.mkdtempSync('lean4-');

  // 1. Write answer to Probe.lean
  const leanPath = path.join(workDir, 'Probe.lean');
  fs.writeFileSync(leanPath, answer, 'utf-8');

  // 2. Write minimal lakefile.lean
  const lakefile = 'import Lake\nopen Lake\n\npackage Probe\n\n@[default_target]\nlean_lib Probe\n';
  fs.writeFileSync(path.join(workDir, 'lakefile.lean'), lakefile, 'utf-8');

  // 3. Detect toolchain
  if (!detectLean4Toolchain()) {
    details.push("Lean 4 toolchain unavailable (lake command required)");
    return { probe_id: probe.probe_id, dimension: probe.dimension, score: 0, details, passed: false };
  }

  // 4. lake build
  let buildOutput = "";
  try {
    buildOutput = execSync("lake build", { cwd: workDir, stdio: "pipe", timeout: 60000 }).toString();
    details.push("lake build: passed");
    score += 40;
  } catch (e) {
    details.push("lake build: failed -- " + ((e as Error).message || "build error"));
    return { probe_id: probe.probe_id, dimension: probe.dimension, score, details, passed: false };
  }

  // 5. Check for "sorry" in answer
  if (answer.includes("sorry")) {
    details.push("Contains sorry: answer has incomplete proofs");
  } else {
    details.push("No sorry: all proofs complete");
    score += 30;
  }

  // 6. Check for "axiom" in answer
  if (answer.includes("axiom ")) {
    details.push("Contains axiom: answer uses unproven assumptions");
  } else {
    details.push("No axiom: no unproven assumptions");
    score += 15;
  }

  // 7. Check for warnings in lake build output
  if (buildOutput.toLowerCase().includes("warning")) {
    details.push("Has warnings: build output contains warnings");
  } else {
    details.push("No warnings: clean build output");
    score += 15;
  }

  return {
    probe_id: probe.probe_id,
    dimension: probe.dimension,
    score: Math.min(100, score),
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
    formal_tlaplus: 0,
    formal_lean4: 0,
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

  // Tier estimation — weakest dimension determines overall tier
  const allScores = Object.values(profile);
  const minScore = Math.min(...allScores);
  let tier: Tier;
  if (minScore >= 80) {
    tier = 'high';
  } else if (minScore >= 50) {
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

type ProbeScorer = (probe: ProbeItem, answer: string, tempDir?: string) => ProbeResult;

function buildScorers(): Record<string, ProbeScorer> {
  const scorers: Record<string, ProbeScorer> = {};
  const dimToScorer: Record<Dimension, ProbeScorer> = {
    instruction_following: scoreInstructionFollowing,
    structured_output: scoreStructuredOutput,
    precision: scorePrecision,
    hierarchical_reasoning: scoreHierarchicalReasoning,
    logical_reasoning: scoreLogicalReasoning,
    creative_reasoning: scoreCreativeReasoning,
    formal_tlaplus: scoreTlaPlus,
    formal_lean4: scoreLean4,
  };
  const dimCounts: Record<string, number> = {
    instruction_following: 8,
    structured_output: 7,
    precision: 6,
    hierarchical_reasoning: 5,
    logical_reasoning: 5,
    creative_reasoning: 5,
    formal_tlaplus: 7,
    formal_lean4: 7,
  };
  for (const [dim, count] of Object.entries(dimCounts)) {
    const scorer = dimToScorer[dim as Dimension];
    if (!scorer) continue;
    for (let i = 1; i <= count; i++) {
      scorers[`${dim}-${i}`] = scorer;
    }
  }
  return scorers;
}

const SCORERS: Record<string, ProbeScorer> = buildScorers();

function scoreAllProbes(probes: ProbeItem[], answers: Record<string, string>, tempDir?: string): ProbeResult[] {
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
      results.push(scorer(probe, llmAnswer, tempDir));
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

    const tempDir = parseArg(args, '--temp-dir') ?? fs.mkdtempSync('capability-probe-');

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
    const probeResults = scoreAllProbes(probes, answers, tempDir);
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
