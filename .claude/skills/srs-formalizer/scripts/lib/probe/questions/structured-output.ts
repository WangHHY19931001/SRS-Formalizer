/**
 * questions/structured-output.ts — Probe generation for structured_output dimension
 */

import type { ProbeItem } from '../types.js';

export function generateStructuredOutputProbes(): ProbeItem[] {
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
