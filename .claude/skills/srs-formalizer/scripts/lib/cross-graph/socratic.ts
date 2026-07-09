/**
 * Socratic question generator — escalates unanswerable questions to humans
 * with structured multiple-choice options.
 */

import type { QuestionResult } from './types.js';

export function generateSocraticQuestions(unanswerable: QuestionResult[]): string[] {
  const questions: string[] = [];

  for (const r of unanswerable) {
    const q = r.question;
    const options: string[] = [];

    if (q.includes("兜底")) {
      options.push("A. 有明确的降级方案（请描述）");
      options.push("B. 有回滚方案但无降级方案");
      options.push("C. 系统不可降级（关键系统）");
      options.push("D. 尚未考虑兜底方案");
    } else if (q.includes("为什么")) {
      options.push("A. 基于已知理论/论文（请提供URL）");
      options.push("B. 基于开源实现参考（请提供URL）");
      options.push("C. 基于内部技术积累（请简述）");
      options.push("D. 技术原理需要进一步调研");
    } else if (q.includes("联合使用")) {
      options.push("A. 已有明确的集成方案（请列出工具名）");
      options.push("B. 可以集成但需要适配（请说明适配点）");
      options.push("C. 独立运行，暂无集成需求");
      options.push("D. 不确定是否可集成");
    } else if (q.includes("边界")) {
      options.push("A. 边界已明确（请定义输入/输出边界）");
      options.push("B. 边界部分明确（请说明模糊地带）");
      options.push("C. 边界尚未定义");
    } else if (q.includes("内部行为") || q.includes("交互")) {
      options.push("A. 已有 TLA+/BDD 模型覆盖");
      options.push("B. 部分覆盖，需要补充模型");
      options.push("C. 尚未建模");
    } else {
      options.push("A. 已充分定义（请提供补充信息）");
      options.push("B. 部分定义（请说明缺失部分）");
      options.push("C. 未定义");
    }

    const gapDetails =
      r.gaps.length > 0
        ? `缺失详情:\n  - ${r.gaps.join("\n  - ")}`
        : "缺失详情: 暂无具体信息";

    const recommendation = r.recommendations[0] || "需要进一步分析";

    questions.push(
      `【${q}】\n` +
        `置信度: ${r.confidence}\n` +
        `${gapDetails}\n` +
        `推荐操作: ${recommendation}\n` +
        `请选择: ${options.join(" | ")}`,
    );
  }

  return questions;
}
