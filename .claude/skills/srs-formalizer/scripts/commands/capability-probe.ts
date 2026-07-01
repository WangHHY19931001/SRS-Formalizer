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

export interface ProbeItem {
  probe_id: string;
  dimension: Dimension;
  prompt: string;
  expected: {
    min_records?: number;
    checks: string[];
    /** Precision-specific: real requirement keywords to match */
    expected_real_reqs?: string[];
    /** Precision-specific: fake requirement keywords to reject */
    fake_keywords?: string[];
    /** Hierarchical reasoning-specific: FR-ID to module mapping */
    hierarchy_expected?: Record<string, string>;
    /** Logical reasoning-specific: expected DEPENDS_ON relations */
    logical_expected?: Array<{ source: string; target: string }>;
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
    ...generateInstructionFollowingProbes(),
    ...generateStructuredOutputProbes(),
    ...generatePrecisionProbes(),
    ...generateHierarchicalReasoningProbes(),
    ...generateLogicalReasoningProbes(),
    ...generateCreativeReasoningProbes(),
  ];
}

function generateInstructionFollowingProbes(): ProbeItem[] {
  return [
    // ---- probe-1 (easy) ----
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
    // ---- probe-2 (easy) ----
    {
      probe_id: 'instruction_following-2',
      dimension: 'instruction_following',
      prompt: `你是一个需求提取器。请将以下 5 条 SRS 需求转换为 JSONL 格式。

SRS 需求：
1. 系统必须支持新生在线注册学籍。
2. 系统必须显示每位学生的已修课程和学分汇总。
3. 系统必须在选课结束后自动生成正式课表。
4. 系统必须展示所有授课教师信息，包括姓名、职称和研究方向。
5. 系统必须支持按课程名称、教师或学分进行搜索。

每条 JSONL 记录必须包含以下字段：
- id: 格式为 R1-<TOPIC>-0001
- category: "explicit"
- statement: 需求描述原文
- source_file: "srs.md"
- confidence: "high"
- metadata: {}

请输出 5 行 JSONL，不要包含其他文字。`,
      expected: {
        min_records: 5,
        checks: ['id_format', 'category_enum', 'metadata_present'],
      },
    },
    // ---- probe-3 (medium) ----
    {
      probe_id: 'instruction_following-3',
      dimension: 'instruction_following',
      prompt: `你是一个需求提取器。请将以下 4 条 SRS 需求转换为 JSONL 格式。

SRS 需求：
1. 系统必须记录登录失败的次数和时间。
2. 系统必须在密码连续错误 5 次后锁定账号 30 分钟。
3. 系统必须支持管理员重置学生密码。
4. 系统必须记录每次密码修改的时间戳和操作 IP。

每条 JSONL 记录必须包含以下字段：
- id: 格式为 R1-<TOPIC>-0001
- category: "explicit"
- statement: 需求描述原文
- source_file: "srs.md"
- confidence: "high"
- metadata: {"severity": "high", "audit": true}

请输出 4 行 JSONL，不要包含其他文字。`,
      expected: {
        min_records: 4,
        checks: ['id_format', 'category_enum', 'metadata_present'],
      },
    },
    // ---- probe-4 (medium) ----
    {
      probe_id: 'instruction_following-4',
      dimension: 'instruction_following',
      prompt: `你是一个需求提取器。请将以下 4 条 SRS 需求转换为 JSONL 格式。

SRS 需求：
1. 系统必须支持学生通过学号和密码登录。
2. 系统必须展示所有可用课程列表，包括课程名称、教师和学分。
3. 学生可以在选课开放期间提交选课申请。
4. 系统推测：当课程选课人数不足 10 人时，该课程可能被取消。

每条 JSONL 记录必须包含以下字段：
- id: 格式为 R1-<TOPIC>-0001
- category: 如果是明确陈述的需求使用 "explicit"，如果是推测或隐含的需求使用 "implicit"
- statement: 需求描述原文
- source_file: "srs.md"
- confidence: "high"
- metadata: {}

请输出 4 行 JSONL，不要包含其他文字。`,
      expected: {
        min_records: 4,
        checks: ['id_format', 'category_enum', 'metadata_present'],
      },
    },
    // ---- probe-5 (medium) ----
    {
      probe_id: 'instruction_following-5',
      dimension: 'instruction_following',
      prompt: `你是一个需求提取器。请将以下 5 条 SRS 需求转换为 JSONL 格式。

SRS 需求（成绩管理子系统）：
1. 教师必须能够录入学生成绩，包括平时成绩和期末成绩。
2. 系统必须自动计算最终成绩 = 平时成绩 × 40% + 期末成绩 × 60%。
3. 系统必须支持成绩的多次修改，并记录修改历史。
4. 学生可以在规定时间内查看自己的成绩。
5. 系统必须在成绩公布后自动通知学生和家长。

每条 JSONL 记录必须包含以下字段：
- id: 格式为 R1-<TOPIC>-0001
- category: "explicit"
- statement: 需求描述原文
- source_file: "srs.md"
- confidence: "high"
- metadata: {}

请输出 5 行 JSONL，不要包含其他文字。`,
      expected: {
        min_records: 5,
        checks: ['id_format', 'category_enum', 'metadata_present'],
      },
    },
    // ---- probe-6 (hard) ----
    {
      probe_id: 'instruction_following-6',
      dimension: 'instruction_following',
      prompt: `你是一个需求提取器。请将以下 6 条 SRS 需求转换为 JSONL 格式。

SRS 需求：
1. 系统必须支持教师通过工号和密码登录。
2. 系统必须展示每个班级的学生名单。
3. 教师可以上传课程资料，包括课件、作业和参考书目。
4. 根据登录日志推测，系统可能在夜间进行数据备份。
5. 系统必须记录学生每次查看课程资料的日期和时长。
6. 系统推测：学生如果连续 7 天未登录，应发送提醒邮件。

每条 JSONL 记录必须包含以下字段：
- id: 格式为 R1-<TOPIC>-0001
- category: 明确陈述的需求用 "explicit"，推测性需求用 "implicit"
- statement: 需求描述原文
- source_file: "srs.md"
- confidence: 确定性需求用 "high"，推测性需求用 "medium"
- metadata: {}

请输出 6 行 JSONL，不要包含其他文字。`,
      expected: {
        min_records: 6,
        checks: ['id_format', 'category_enum', 'metadata_present'],
      },
    },
    // ---- probe-7 (hard) ----
    {
      probe_id: 'instruction_following-7',
      dimension: 'instruction_following',
      prompt: `你是一个需求提取器。请将以下 5 条 SRS 需求转换为 JSONL 格式。

SRS 需求（学位管理模块）：
1. 系统必须自动检查学生是否满足毕业条件（修满学分 + 通过论文答辩）。
2. 系统必须生成毕业生名单并提交给教务处审核。
3. 系统必须支持在线提交学位论文，格式为 PDF。
4. 系统必须将论文分配给 2 位评阅人进行盲审。
5. 系统必须记录论文查重结果，重复率不得超过 15%。

每条 JSONL 记录必须包含以下字段：
- id: 格式为 R1-<TOPIC>-0001
- category: "explicit"
- statement: 需求描述原文
- source_file: "srs.md"
- confidence: "high"
- metadata: {"module": "degree", "priority": "P0"}

请输出 5 行 JSONL，不要包含其他文字。`,
      expected: {
        min_records: 5,
        checks: ['id_format', 'category_enum', 'metadata_present'],
      },
    },
    // ---- probe-8 (hard) ----
    {
      probe_id: 'instruction_following-8',
      dimension: 'instruction_following',
      prompt: `你是一个需求提取器。请将以下 7 条 SRS 需求转换为 JSONL 格式。

SRS 需求（教学评估子系统）：
1. 系统必须支持学生在每门课程结束后匿名评价授课教师。
2. 评估维度包括：教学态度、内容深度、互动效果和作业反馈。
3. 系统必须自动计算每位教师的综合评分和分项平均分。
4. 系统必须生成学期教学评估报告，包含图表和趋势分析。
5. 教师可以在系统中查看自己的评估结果，但无法看到学生身份。
6. 系统必须在评估开放期内每日发送一次提醒通知。
7. 系统推测：评估结果可能影响教师的课时费计算。

每条 JSONL 记录必须包含以下字段：
- id: 格式为 R1-<TOPIC>-0001
- category: 明确陈述的需求用 "explicit"，推测性需求用 "implicit"
- statement: 需求描述原文
- source_file: "srs.md"
- confidence: "high"
- metadata: {"module": "evaluation", "audit": true}

请输出 7 行 JSONL，不要包含其他文字。`,
      expected: {
        min_records: 7,
        checks: ['id_format', 'category_enum', 'metadata_present'],
      },
    },
  ];
}

function generateStructuredOutputProbes(): ProbeItem[] {
  return [
    // ---- probe-1 (easy) ----
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
    // ---- probe-2 (easy) ----
    {
      probe_id: 'structured_output-2',
      dimension: 'structured_output',
      prompt: `请将以下混合格式的需求描述转换为标准的 JSONL 格式。

混合格式文本：
================================
REQ-001: 登录功能 - 支持学号和密码登录
{"id":"REQ-002","desc":"展示课程列表包含名称教师学分"}
REQ-003: 选课申请 - 开放期间可提交
REQ-004: 退选功能 - 截止日期前可退选
{"id":"REQ-005","desc":"每学期初初始化数据库"}
================================

每条 JSONL 记录必须包含以下字段：
- id: 格式为 R1-<TOPIC>-0001
- category: "explicit"
- statement: 中文需求描述
- source_file: "srs.md"
- confidence: "high"
- metadata: {}

请输出 5 行 JSONL，只包含标准格式的记录，不要包含其他文字。
注意：既有的 JSON 行也需要转换为标准 JSONL 格式。`,
      expected: {
        min_records: 5,
        checks: ['valid_json', 'required_fields'],
      },
    },
    // ---- probe-3 (medium) ----
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
    // ---- probe-4 (medium) ----
    {
      probe_id: 'structured_output-4',
      dimension: 'structured_output',
      prompt: `请将以下表格形式的需求描述转换为标准的 JSONL 格式。

表格文本：
================================
编号 | 功能 | 描述
FR01 | 登录 | 学生使用学号和密码登录系统
FR02 | 课程列表 | 展示所有可用课程名称、教师和学分
FR03 | 选课申请 | 开放期间学生可提交选课申请
FR04 | 退选 | 截止日期前学生可退选课程
FR05 | 成绩查询 | 学生可查看自己的成绩
FR06 | 课表生成 | 选课结束后自动生成正式课表
================================

每条 JSONL 记录必须包含以下字段：
- id: 格式为 R1-<TOPIC>-0001
- category: "explicit"
- statement: 中文需求描述
- source_file: "srs.md"
- confidence: "high"
- metadata: {}

请输出 6 行 JSONL，只包含标准格式的记录，不要包含其他文字。`,
      expected: {
        min_records: 6,
        checks: ['valid_json', 'required_fields'],
      },
    },
    // ---- probe-5 (medium) ----
    {
      probe_id: 'structured_output-5',
      dimension: 'structured_output',
      prompt: `请将以下叙述文中的需求提取出来，转换为标准的 JSONL 格式。

叙述文本：
================================
本系统是一个高校选课平台。首先，学生需要登录系统（FR-001），登录后才能看到课程列表（FR-002）。选课开放期间（FR-003），学生可以选择课程。如果不想选了，在截止日前可以退选（FR-004）。教务处在每学期初要初始化数据（FR-005）。
================================

每条 JSONL 记录必须包含以下字段：
- id: 格式为 R1-<TOPIC>-0001
- category: "explicit"
- statement: 提取出的需求描述
- source_file: "srs.md"
- confidence: "high"
- metadata: {}

请输出 5 行 JSONL，只包含标准格式的记录，不要包含其他文字。`,
      expected: {
        min_records: 5,
        checks: ['valid_json', 'required_fields'],
      },
    },
    // ---- probe-6 (hard) ----
    {
      probe_id: 'structured_output-6',
      dimension: 'structured_output',
      prompt: `请将以下含注释和混合分隔符的需求描述转换为标准的 JSONL 格式。

文本：
================================
FR#001 # 登录功能
系统必须支持学生通过学号和密码登录 /* 安全要求 */

FR_002 - 课程列表
system must show available courses // 包括名称教师学分

FR=003=选课
学生可在选课开放期间提交申请 --- 逾期不受理

FR_004 退选
'截止日期前可退选' 逾期不可退

FR 005 成绩查询
"学生可以查看自己的成绩" 但不可修改
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
    // ---- probe-7 (hard) ----
    {
      probe_id: 'structured_output-7',
      dimension: 'structured_output',
      prompt: `请将以下自然语言段落中的需求提取并转换为标准的 JSONL 格式。

文本：
================================
我们正在开发一个教务系统。首先需要让学生能够登录平台（使用学号和密码）。登录后，系统应该展示课程信息，包括每门课的名称、授课老师和学分。在每学期固定的选课时间内，学生可以选课。如果学生改变主意，也可以在截止日期前退课。另外，选课结束后，每位学生需要能查看自己的正式课表。系统还需要让老师录入成绩，学生可以查询成绩。
================================

每条 JSONL 记录必须包含以下字段：
- id: 格式为 R1-<TOPIC>-0001
- category: "explicit"
- statement: 提取出的需求描述（简洁明确）
- source_file: "srs.md"
- confidence: "high"
- metadata: {}

请输出 6 行 JSONL，只包含标准格式的记录，不要包含其他文字。`,
      expected: {
        min_records: 6,
        checks: ['valid_json', 'required_fields'],
      },
    },
  ];
}

function generatePrecisionProbes(): ProbeItem[] {
  return [
    // ---- probe-1 (easy) ----
    {
      probe_id: 'precision-1',
      dimension: 'precision',
      prompt: `以下包含 6 条需求，其中只有 3 条来自真实的 SRS 文档，另外 3 条是编造的。请只提取真实存在的需求，忽略编造的。

需求列表：
1. 系统必须支持学生通过学号和密码登录。
2. 系统必须支持人脸识别登录。
3. 系统在课程容量已满时必须拒绝超额选课。
4. 系统必须支持支付功能。
5. 系统记录每次选课操作的时间戳和操作人。
6. 系统支持学生之间聊天功能。

请以 JSON 数组形式输出真实的需求，格式：["需求1原文", "需求2原文", ...]`,
      expected: {
        checks: ['no_fabricated', 'no_missing'],
        expected_real_reqs: ['学号和密码', '课程容量已满', '时间戳和操作人'],
        fake_keywords: ['人脸识别', '支付功能', '聊天'],
      },
    },
    // ---- probe-2 (medium) ----
    {
      probe_id: 'precision-2',
      dimension: 'precision',
      prompt: `以下包含 8 条需求，其中只有 4 条来自真实的 SRS 文档，另外 4 条是编造的。请只提取真实存在的需求。

需求列表：
1. 系统必须支持学生通过学号和密码登录系统。
2. 系统必须展示所有可用课程列表，包括课程名称、教师和学分。
3. 系统必须支持短信通知学生选课结果。
4. 学生可以在选课开放期间提交选课申请。
5. 系统在选课结束后自动生成每位学生的正式课表。
6. 系统必须支持学生通过微信支付缴纳学费。
7. 系统必须提供在线客服功能，回答学生问题。
8. 系统必须集成 AI 智能助手辅助教学。

请以 JSON 数组形式输出真实的需求，格式：["需求1原文", "需求2原文", ...]`,
      expected: {
        checks: ['no_fabricated', 'no_missing'],
        expected_real_reqs: ['学号和密码', '课程列表', '选课申请', '课表'],
        fake_keywords: ['短信通知', '微信支付', '在线客服', 'AI'],
      },
    },
    // ---- probe-3 (medium) ----
    {
      probe_id: 'precision-3',
      dimension: 'precision',
      prompt: `以下包含 10 条需求，其中只有 5 条来自真实的 SRS 文档，另外 5 条是编造的。请只提取真实存在的需求。

需求列表：
1. 系统必须支持学生在线注册学籍信息。
2. 系统必须支持教师在期末录入学生成绩。
3. 系统必须提供学生对教师的教学评估功能。
4. 系统必须支持管理员进行教室资源的分配和调整。
5. 系统必须展示每门课程的教学大纲和参考书目。
6. 系统必须提供学生之间的社交互动功能。
7. 系统必须集成小游戏模块用于课堂教学。
8. 系统必须支持校园外卖配送服务。
9. 系统必须提供在线叫车功能方便学生出行。
10. 系统必须支持课堂教学直播功能。

请以 JSON 数组形式输出真实的需求，格式：["需求1原文", "需求2原文", ...]`,
      expected: {
        checks: ['no_fabricated', 'no_missing'],
        expected_real_reqs: ['学籍注册', '成绩录入', '教学评估', '教室资源', '课程大纲'],
        fake_keywords: ['社交互动', '小游戏', '外卖', '叫车', '直播'],
      },
    },
    // ---- probe-4 (hard) ----
    {
      probe_id: 'precision-4',
      dimension: 'precision',
      prompt: `以下包含 8 条需求，其中只有 3 条来自真实的 SRS 文档，另外 5 条是编造的。请只提取真实存在的需求。

需求列表：
1. 学生可以在退选截止日期前退选已选课程。
2. 系统必须支持学生查询已修课程的成绩。
3. 系统必须显示每门课程的容量和当前已选人数。
4. 系统必须利用 AI 技术为学生推荐个性化课程。
5. 系统必须基于区块链技术存储学生成绩记录。
6. 系统必须提供虚拟现实(VR)实验教学功能。
7. 系统必须支持学生用语音控制选课操作。
8. 系统必须自动为论文进行查重检测。

请以 JSON 数组形式输出真实的需求，格式：["需求1原文", "需求2原文", ...]`,
      expected: {
        checks: ['no_fabricated', 'no_missing'],
        expected_real_reqs: ['退选', '成绩查询', '课程容量'],
        fake_keywords: ['AI', '个性化课程', '区块链', '虚拟现实', 'VR', '语音控制', '论文查重'],
      },
    },
    // ---- probe-5 (hard) ----
    {
      probe_id: 'precision-5',
      dimension: 'precision',
      prompt: `以下包含 10 条需求，其中只有 4 条来自真实的 SRS 文档，另外 6 条是编造的。请只提取真实存在的需求。

需求列表：
1. 学生可以在退选截止日期前退选课程。
2. 系统在选课结束后自动生成每位学生的正式课表。
3. 管理员可以添加、修改和删除课程基本信息。
4. 系统必须每学期初初始化选课数据库。
5. 系统必须利用智能算法自动排课优化教室利用率。
6. 系统必须提供 7x24 小时在线智能答疑服务。
7. 系统必须根据学生学习行为推荐最优学习路径。
8. 系统必须分析学生行为数据并生成学情报告。
9. 系统必须在课前自动发送签到提醒短信。
10. 系统必须提供校园 3D 导航地图服务。

请以 JSON 数组形式输出真实的需求，格式：["需求1原文", "需求2原文", ...]`,
      expected: {
        checks: ['no_fabricated', 'no_missing'],
        expected_real_reqs: ['退选', '课表', '课程基本信息', '初始化选课数据库'],
        fake_keywords: ['智能排课', '智能答疑', '学习路径', '行为数据', '签到提醒', '3D 导航'],
      },
    },
    // ---- probe-6 (hard) ----
    {
      probe_id: 'precision-6',
      dimension: 'precision',
      prompt: `以下包含 12 条需求，其中只有 4 条来自真实的 SRS 文档，另外 8 条是编造的。请只提取真实存在的需求。

需求列表：
1. 系统必须支持导出成绩单为 PDF 格式，供学生打印。
2. 学生可以在选课开放期间提交选课申请。
3. 系统必须支持学生按课程名称、教师或学分查询课程。
4. 系统必须支持学生修改登录密码。
5. 系统必须支持人脸识别门禁进入教学楼。
6. 系统必须提供 AI 助教自动回答 FAQ 问题。
7. 系统必须支持多种语言之间的自动翻译。
8. 系统必须将课堂语音实时转写为文字笔记。
9. 系统必须利用 AI 智能批改学生的主观题作答。
10. 系统必须根据学生专业自动规划个性化培养方案。
11. 系统必须支持学生使用校园卡在食堂消费。
12. 系统必须提供宿舍电费在线充值功能。

请以 JSON 数组形式输出真实的需求，格式：["需求1原文", "需求2原文", ...]`,
      expected: {
        checks: ['no_fabricated', 'no_missing'],
        expected_real_reqs: ['成绩单', '选课申请', '查询课程', '修改登录密码'],
        fake_keywords: ['人脸识别门禁', 'AI 助教', '自动翻译', '语音转写', '智能批改', '培养方案', '校园卡', '电费'],
      },
    },
  ];
}

function generateHierarchicalReasoningProbes(): ProbeItem[] {
  return [
    // ---- probe-1 (easy) ----
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

请以 JSON 数组格式输出，每条包含 requirement 和 module 字段：
[{"requirement": "FR-001: 系统必须支持学生通过学号和密码登录。", "module": "登录认证"}, ...]`,
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
    // ---- probe-2 (medium) ----
    {
      probe_id: 'hierarchical_reasoning-2',
      dimension: 'hierarchical_reasoning',
      prompt: `请将以下 10 条 SRS 需求归类到最合适的模块中。

可选模块：学生管理, 课程管理, 选课管理, 成绩管理, 系统管理

需求：
1. FR-001: 系统必须支持学生注册学籍信息。
2. FR-002: 系统必须展示所有可用课程的名称、教师和学分。
3. FR-003: 学生可以在选课开放期间提交选课申请。
4. FR-004: 学生可以在退选截止日期前退选课程。
5. FR-005: 教师可以录入学生的考试成绩。
6. FR-006: 管理员可以添加和修改课程基本信息。
7. FR-007: 系统在选课结束后自动生成正式课表。
8. FR-008: 系统必须支持学生查询已修课程成绩。
9. FR-009: 系统必须支持学生修改个人资料。
10. FR-010: 系统必须每学期初初始化数据库。

请以 JSON 数组格式输出，每条包含 requirement 和 module 字段：
[{"requirement": "FR-001: 系统必须支持学生注册学籍信息。", "module": "学生管理"}, ...]`,
      expected: {
        checks: ['accuracy_80pct'],
        hierarchy_expected: {
          'FR-001': '学生管理',
          'FR-002': '课程管理',
          'FR-003': '选课管理',
          'FR-004': '选课管理',
          'FR-005': '成绩管理',
          'FR-006': '课程管理',
          'FR-007': '选课管理',
          'FR-008': '成绩管理',
          'FR-009': '学生管理',
          'FR-010': '系统管理',
        },
      },
    },
    // ---- probe-3 (medium) ----
    {
      probe_id: 'hierarchical_reasoning-3',
      dimension: 'hierarchical_reasoning',
      prompt: `请将以下 12 条 SRS 需求归类到最合适的模块中。

可选模块：教学管理, 选课管理, 成绩管理, 系统管理

需求：
1. FR-001: 系统必须支持教师上传课程教学大纲。
2. FR-002: 系统必须展示课程的教学日历和每周教学计划。
3. FR-003: 教师可以在系统中发布课程通知。
4. FR-004: 学生可以在选课开放期间提交选课申请。
5. FR-005: 学生可以在退选截止日期前退选课程。
6. FR-006: 系统必须显示每门课程的容量和已选人数。
7. FR-007: 系统必须支持平时成绩和期末成绩的录入。
8. FR-008: 系统必须自动计算课程最终成绩（加权平均）。
9. FR-009: 学生可以在规定时间内查看自己的成绩。
10. FR-010: 系统必须每学期初初始化数据库。
11. FR-011: 系统必须记录每次登录和操作的时间戳。
12. FR-012: 系统必须定期自动备份所有数据。

请以 JSON 数组格式输出，每条包含 requirement 和 module 字段：
[{"requirement": "FR-001: 系统必须支持教师上传课程教学大纲。", "module": "教学管理"}, ...]`,
      expected: {
        checks: ['accuracy_80pct'],
        hierarchy_expected: {
          'FR-001': '教学管理',
          'FR-002': '教学管理',
          'FR-003': '教学管理',
          'FR-004': '选课管理',
          'FR-005': '选课管理',
          'FR-006': '选课管理',
          'FR-007': '成绩管理',
          'FR-008': '成绩管理',
          'FR-009': '成绩管理',
          'FR-010': '系统管理',
          'FR-011': '系统管理',
          'FR-012': '系统管理',
        },
      },
    },
    // ---- probe-4 (hard) ----
    {
      probe_id: 'hierarchical_reasoning-4',
      dimension: 'hierarchical_reasoning',
      prompt: `请将以下 14 条 SRS 需求归类到最合适的模块中。

可选模块：用户管理, 课程管理, 选课管理, 成绩管理, 通知管理, 系统管理

需求：
1. FR-001: 系统必须支持学生通过学号和密码登录。
2. FR-002: 系统必须支持教师通过工号和密码登录。
3. FR-003: 管理员可以添加、修改和删除课程基本信息。
4. FR-004: 系统必须展示每门课程的授课教师、学分和上课地点。
5. FR-005: 学生可以在选课开放期间提交选课申请。
6. FR-006: 学生可以在退选截止日期前退选课程。
7. FR-007: 教师可以录入学生的平时成绩和期末成绩。
8. FR-008: 系统必须自动计算学生的学期绩点(GPA)。
9. FR-009: 系统必须在成绩公布后自动通知学生。
10. FR-010: 系统必须在选课开放前向学生发送提醒通知。
11. FR-011: 系统必须在课程变更时通知相关学生。
12. FR-012: 系统必须支持管理员进行系统参数配置。
13. FR-013: 系统必须记录所有关键操作的审计日志。
14. FR-014: 系统必须每学期初进行数据归档。

请以 JSON 数组格式输出，每条包含 requirement 和 module 字段：
[{"requirement": "FR-001: 系统必须支持学生通过学号和密码登录。", "module": "用户管理"}, ...]`,
      expected: {
        checks: ['accuracy_80pct'],
        hierarchy_expected: {
          'FR-001': '用户管理',
          'FR-002': '用户管理',
          'FR-003': '课程管理',
          'FR-004': '课程管理',
          'FR-005': '选课管理',
          'FR-006': '选课管理',
          'FR-007': '成绩管理',
          'FR-008': '成绩管理',
          'FR-009': '通知管理',
          'FR-010': '通知管理',
          'FR-011': '通知管理',
          'FR-012': '系统管理',
          'FR-013': '系统管理',
          'FR-014': '系统管理',
        },
      },
    },
    // ---- probe-5 (hard) ----
    {
      probe_id: 'hierarchical_reasoning-5',
      dimension: 'hierarchical_reasoning',
      prompt: `请将以下 16 条 SRS 需求归类到最合适的模块中。

可选模块：认证授权, 课程管理, 选课管理, 成绩管理, 系统管理

需求：
1. FR-001: 系统必须支持学生通过学号和密码登录。
2. FR-002: 系统必须支持教师通过工号和密码登录。
3. FR-003: 系统必须支持管理员通过管理员账号登录。
4. FR-004: 系统必须展示所有可用课程的列表。
5. FR-005: 系统必须显示每门课程的详细信息和教学大纲。
6. FR-006: 管理员可以添加、修改和删除课程信息。
7. FR-007: 学生可以在选课开放期间提交选课申请。
8. FR-008: 学生可以在退选截止日期前退选课程。
9. FR-009: 系统必须显示每门课程的容量和当前已选人数。
10. FR-010: 系统在课程容量已满时必须拒绝超额选课。
11. FR-011: 教师可以录入学生的考试成绩和平时成绩。
12. FR-012: 学生可以查看自己的成绩和绩点。
13. FR-013: 系统必须记录所有用户的操作日志。
14. FR-014: 系统必须支持管理员进行系统参数配置。
15. FR-015: 系统必须每学期初初始化选课数据库。
16. FR-016: 系统必须定期自动备份所有数据。

请以 JSON 数组格式输出，每条包含 requirement 和 module 字段：
[{"requirement": "FR-001: 系统必须支持学生通过学号和密码登录。", "module": "认证授权"}, ...]`,
      expected: {
        checks: ['accuracy_80pct'],
        hierarchy_expected: {
          'FR-001': '认证授权',
          'FR-002': '认证授权',
          'FR-003': '认证授权',
          'FR-004': '课程管理',
          'FR-005': '课程管理',
          'FR-006': '课程管理',
          'FR-007': '选课管理',
          'FR-008': '选课管理',
          'FR-009': '选课管理',
          'FR-010': '选课管理',
          'FR-011': '成绩管理',
          'FR-012': '成绩管理',
          'FR-013': '系统管理',
          'FR-014': '系统管理',
          'FR-015': '系统管理',
          'FR-016': '系统管理',
        },
      },
    },
  ];
}

function generateLogicalReasoningProbes(): ProbeItem[] {
  return [
    // ---- probe-1 (easy) ----
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

请以 JSON 数组格式输出依赖关系：
[{"source": "R-B", "target": "R-A", "relation": "DEPENDS_ON"}, ...]

请只输出 JSON 数组，不要包含其他文字。`,
      expected: {
        checks: ['direction_correct'],
        logical_expected: [
          { source: 'R-B', target: 'R-A' },
          { source: 'R-C', target: 'R-B' },
          { source: 'R-D', target: 'R-C' },
        ],
      },
    },
    // ---- probe-2 (medium) ----
    {
      probe_id: 'logical_reasoning-2',
      dimension: 'logical_reasoning',
      prompt: `请根据以下 6 条需求推导它们之间的 DEPENDS_ON 依赖关系。

需求：
R-A: 系统必须每学期初初始化选课数据库。
R-B: 系统必须支持学生通过学号和密码登录。
R-C: 系统必须支持管理员通过管理员账号登录。
R-D: 学生可以在选课开放期间提交选课申请。
R-E: 管理员可以添加、修改和删除课程基本信息。
R-F: 系统在选课结束后自动生成每位学生的正式课表。

如果 X 需要在 Y 之前完成，则 X DEPENDS_ON Y。注意：依赖关系可能形成分支结构。

请以 JSON 数组格式输出依赖关系：
[{"source": "R-B", "target": "R-A", "relation": "DEPENDS_ON"}, ...]

请只输出 JSON 数组，不要包含其他文字。`,
      expected: {
        checks: ['direction_correct'],
        logical_expected: [
          { source: 'R-B', target: 'R-A' },
          { source: 'R-C', target: 'R-A' },
          { source: 'R-D', target: 'R-B' },
          { source: 'R-E', target: 'R-C' },
          { source: 'R-F', target: 'R-D' },
          { source: 'R-F', target: 'R-E' },
        ],
      },
    },
    // ---- probe-3 (medium) ----
    {
      probe_id: 'logical_reasoning-3',
      dimension: 'logical_reasoning',
      prompt: `请根据以下 7 条需求推导它们之间的 DEPENDS_ON 依赖关系。

需求：
R-A: 系统必须每学期初进行系统初始化。
R-B: 系统必须支持统一的身份认证功能。
R-C: 管理员必须能在系统中录入课程信息。
R-D: 系统必须支持选课开放和关闭的时间配置。
R-E: 学生可以在选课开放期间提交选课申请。
R-F: 教师必须在选课结束后录入学生成绩。
R-G: 学生可以在成绩公布后查询自己的成绩。

如果 X 需要在 Y 之前完成，则 X DEPENDS_ON Y。

请以 JSON 数组格式输出依赖关系：
[{"source": "R-B", "target": "R-A", "relation": "DEPENDS_ON"}, ...]

请只输出 JSON 数组，不要包含其他文字。`,
      expected: {
        checks: ['direction_correct'],
        logical_expected: [
          { source: 'R-B', target: 'R-A' },
          { source: 'R-C', target: 'R-A' },
          { source: 'R-D', target: 'R-C' },
          { source: 'R-E', target: 'R-B' },
          { source: 'R-E', target: 'R-D' },
          { source: 'R-F', target: 'R-E' },
          { source: 'R-G', target: 'R-F' },
        ],
      },
    },
    // ---- probe-4 (hard) ----
    {
      probe_id: 'logical_reasoning-4',
      dimension: 'logical_reasoning',
      prompt: `请根据以下 8 条需求推导它们之间的 DEPENDS_ON 依赖关系。

需求：
R-A: 系统必须在每学期开学前完成系统初始化。
R-B: 系统必须为教师创建教学账号。
R-C: 系统必须为学生创建学籍账号。
R-D: 教师必须在系统中创建本学期所授课程。
R-E: 系统必须审核并发布教师创建的课程信息。
R-F: 学生可以在课程发布后在选课系统中选课。
R-G: 教师在选课结束后可以录入学生成绩。
R-H: 教务管理员必须审核教师录入的成绩。

如果 X 需要在 Y 之前完成，则 X DEPENDS_ON Y。

请以 JSON 数组格式输出依赖关系：
[{"source": "R-B", "target": "R-A", "relation": "DEPENDS_ON"}, ...]

请只输出 JSON 数组，不要包含其他文字。`,
      expected: {
        checks: ['direction_correct'],
        logical_expected: [
          { source: 'R-B', target: 'R-A' },
          { source: 'R-C', target: 'R-A' },
          { source: 'R-D', target: 'R-B' },
          { source: 'R-E', target: 'R-D' },
          { source: 'R-E', target: 'R-C' },
          { source: 'R-F', target: 'R-E' },
          { source: 'R-G', target: 'R-F' },
          { source: 'R-H', target: 'R-G' },
        ],
      },
    },
    // ---- probe-5 (hard) ----
    {
      probe_id: 'logical_reasoning-5',
      dimension: 'logical_reasoning',
      prompt: `请根据以下 9 条需求推导它们之间的 DEPENDS_ON 依赖关系。

需求：
R-A: 系统必须完成学期的初始化配置。
R-B: 系统必须支持教师身份认证。
R-C: 系统必须支持学生身份认证。
R-D: 管理员必须创建和维护课程目录。
R-E: 系统必须支持各专业培养方案的制定。
R-F: 系统必须根据培养方案配置选课规则。
R-G: 学生可以查看课程目录并在选课规则内选课。
R-H: 教师可以在选课结束后评定学生成绩。
R-I: 系统必须根据培养方案和成绩进行毕业审核。

如果 X 需要在 Y 之前完成，则 X DEPENDS_ON Y。

请以 JSON 数组格式输出依赖关系：
[{"source": "R-B", "target": "R-A", "relation": "DEPENDS_ON"}, ...]

请只输出 JSON 数组，不要包含其他文字。`,
      expected: {
        checks: ['direction_correct'],
        logical_expected: [
          { source: 'R-B', target: 'R-A' },
          { source: 'R-C', target: 'R-A' },
          { source: 'R-D', target: 'R-B' },
          { source: 'R-E', target: 'R-B' },
          { source: 'R-F', target: 'R-E' },
          { source: 'R-G', target: 'R-C' },
          { source: 'R-G', target: 'R-D' },
          { source: 'R-G', target: 'R-F' },
          { source: 'R-H', target: 'R-G' },
          { source: 'R-I', target: 'R-H' },
          { source: 'R-I', target: 'R-E' },
        ],
      },
    },
  ];
}

function generateCreativeReasoningProbes(): ProbeItem[] {
  return [
    // ---- probe-1 (easy) ----
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
  "derived_from": ["R1", "R2", ...]（基于哪些明示需求推导而来）,
  "reasoning": "...（推导逻辑说明）"
}

请只输出 JSON，不要包含其他文字。`,
      expected: {
        checks: ['derived_from_correct', 'reasoning_plausible'],
      },
    },
    // ---- probe-2 (medium) ----
    {
      probe_id: 'creative_reasoning-2',
      dimension: 'creative_reasoning',
      prompt: `请根据以下 4 条需求推导出 2 条隐式需求（系统没有明说但逻辑上必须支持的功能）。

需求：
R1: 系统必须展示所有可用课程列表，包括课程名称、教师和学分。
R2: 系统必须显示每门课程的容量和当前已选人数。
R3: 学生可以在选课开放期间提交选课申请。
R4: 系统在课程容量已满时必须拒绝超额选课。

请以 JSON 数组格式输出：
[
  {
    "derived_statement": "...（隐式需求的描述）",
    "derived_from": ["R1", "R2", ...],
    "reasoning": "...（推导逻辑说明）"
  },
  ...
]

请只输出 JSON，不要包含其他文字。`,
      expected: {
        checks: ['derived_from_correct', 'reasoning_plausible'],
      },
    },
    // ---- probe-3 (medium) ----
    {
      probe_id: 'creative_reasoning-3',
      dimension: 'creative_reasoning',
      prompt: `请根据以下 5 条需求推导出 2 条隐式需求（系统没有明说但逻辑上必须支持的功能）。

需求：
R1: 教师必须能够录入学生成绩，包括平时成绩和期末成绩。
R2: 系统必须自动计算最终成绩 = 平时成绩 × 40% + 期末成绩 × 60%。
R3: 系统必须支持成绩的多次修改，并记录修改历史。
R4: 学生可以在规定时间内查看自己的成绩。
R5: 系统必须在成绩公布后自动通知学生。

请以 JSON 数组格式输出：
[
  {
    "derived_statement": "...（隐式需求的描述）",
    "derived_from": ["R1", "R2", ...],
    "reasoning": "...（推导逻辑说明）"
  },
  ...
]

请只输出 JSON，不要包含其他文字。`,
      expected: {
        checks: ['derived_from_correct', 'reasoning_plausible'],
      },
    },
    // ---- probe-4 (hard) ----
    {
      probe_id: 'creative_reasoning-4',
      dimension: 'creative_reasoning',
      prompt: `请根据以下 5 条需求推导出 2 条隐式需求（系统没有明说但逻辑上必须支持的功能）。

需求：
R1: 系统必须支持学生通过学号和密码登录。
R2: 系统必须记录登录失败的次数和时间。
R3: 系统必须在密码连续错误 5 次后锁定账号 30 分钟。
R4: 系统必须支持管理员重置学生密码。
R5: 系统必须记录每次密码修改的时间戳和操作 IP。

请以 JSON 数组格式输出：
[
  {
    "derived_statement": "...（隐式需求的描述）",
    "derived_from": ["R1", "R2", ...],
    "reasoning": "...（推导逻辑说明）"
  },
  ...
]

请只输出 JSON，不要包含其他文字。`,
      expected: {
        checks: ['derived_from_correct', 'reasoning_plausible'],
      },
    },
    // ---- probe-5 (hard) ----
    {
      probe_id: 'creative_reasoning-5',
      dimension: 'creative_reasoning',
      prompt: `请根据以下 6 条需求推导出 3 条隐式需求（系统没有明说但逻辑上必须支持的功能）。

需求：
R1: 系统必须支持至少 5000 名学生同时在线选课。
R2: 系统必须支持学生通过学号和密码登录。
R3: 系统必须展示课程的名称、教师、学分、容量和已选人数。
R4: 学生可以在选课开放期间提交选课申请。
R5: 系统在课程容量已满时必须拒绝超额选课。
R6: 系统记录每次选课操作的时间戳和操作人。

请以 JSON 数组格式输出：
[
  {
    "derived_statement": "...（隐式需求的描述）",
    "derived_from": ["R1", "R2", ...],
    "reasoning": "...（推导逻辑说明）"
  },
  ...
]

请只输出 JSON，不要包含其他文字。`,
      expected: {
        checks: ['derived_from_correct', 'reasoning_plausible'],
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

  // Calculate F-score / average
  const precision = extracted.length > 0 ? (extracted.length - fabricatedInAnswer.length) / extracted.length : 0;
  const recall = realKeywords.length > 0 ? matchedReals.length / realKeywords.length : 1;

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
      const expected = probe.expected.hierarchy_expected?.[frId];
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

function buildScorers(): Record<string, (probe: ProbeItem, answer: string) => ProbeResult> {
  const scorers: Record<string, (probe: ProbeItem, answer: string) => ProbeResult> = {};
  const dimToScorer: Record<Dimension, (probe: ProbeItem, answer: string) => ProbeResult> = {
    instruction_following: scoreInstructionFollowing,
    structured_output: scoreStructuredOutput,
    precision: scorePrecision,
    hierarchical_reasoning: scoreHierarchicalReasoning,
    logical_reasoning: scoreLogicalReasoning,
    creative_reasoning: scoreCreativeReasoning,
  };
  const dimCounts: Record<Dimension, number> = {
    instruction_following: 8,
    structured_output: 7,
    precision: 6,
    hierarchical_reasoning: 5,
    logical_reasoning: 5,
    creative_reasoning: 5,
  };
  for (const [dim, count] of Object.entries(dimCounts)) {
    const scorer = dimToScorer[dim as Dimension];
    for (let i = 1; i <= count; i++) {
      scorers[`${dim}-${i}`] = scorer;
    }
  }
  return scorers;
}

const SCORERS: Record<string, (probe: ProbeItem, answer: string) => ProbeResult> = buildScorers();

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
