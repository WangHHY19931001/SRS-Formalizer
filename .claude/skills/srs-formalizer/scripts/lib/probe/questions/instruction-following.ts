/**
 * questions/instruction-following.ts — Probe generation for instruction_following dimension
 */

import type { ProbeItem } from '../types.js';

export function generateInstructionFollowingProbes(): ProbeItem[] {
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
