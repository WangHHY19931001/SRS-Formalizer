/**
 * questions/creative.ts — Probe generation for creative_reasoning dimension
 */

import type { ProbeItem } from '../types.js';

export function generateCreativeReasoningProbes(): ProbeItem[] {
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
