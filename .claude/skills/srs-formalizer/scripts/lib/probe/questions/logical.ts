/**
 * questions/logical.ts — Probe generation for logical_reasoning dimension
 */

import type { ProbeItem } from '../types.js';

export function generateLogicalReasoningProbes(): ProbeItem[] {
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
