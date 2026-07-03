/**
 * questions.ts — The 10 fundamental questions, label requirements, and Socratic question generator
 *
 * During the S6 refinement loop, these questions check whether ALL produced artifacts
 * (requirement graph, behavior graph, interaction graphs, architecture graph)
 * can collectively answer 10 fundamental questions about the system.
 *
 * This module contains the question definitions, their label requirements per graph,
 * cross-graph edge types per question, and the Socratic question generator
 * for escalating unanswerable questions to humans.
 */

import type { QuestionResult } from '../cross-graph-verifier.js';

// ===================== The 10 Fundamental Questions =====================

export interface QuestionDef {
  id: string;
  question: string;
  expected_graphs: string[];
  min_evidence: number;
  /** Minimum total number of relevant-labeled nodes across all graphs. */
  min_relevant_nodes: number;
  optional_graphs?: string[];
}

export const FUNDAMENTAL_QUESTIONS: QuestionDef[] = [
  {
    id: "Q1",
    question: "它是什么？（本质定义、核心定位）",
    expected_graphs: ["requirement_graph.json", "system-architecture.json"],
    min_evidence: 2,
    min_relevant_nodes: 2,
  },
  {
    id: "Q2",
    question: "它做什么？（核心功能、主要作用）",
    expected_graphs: ["requirement_graph.json", "behavior_graph.json"],
    min_evidence: 2,
    min_relevant_nodes: 3,
  },
  {
    id: "Q3",
    question: "它能做什么？（具体能力、可覆盖的应用场景）",
    expected_graphs: [
      "requirement_graph.json",
      "behavior_graph.json",
      "tla-interaction-graph.json",
    ],
    min_evidence: 2,
    min_relevant_nodes: 4,
  },
  {
    id: "Q4",
    question:
      "它为什么可以这样？（技术原理、实现逻辑、底层支撑、业内实践、理论支撑、论文url、可参考开源实现url，涉及算法的部分通过Lean 4建模分析）",
    expected_graphs: ["lean-proof-graph.json", "requirement_graph.json"],
    min_evidence: 1,
    min_relevant_nodes: 2,
    optional_graphs: ["lean-proof-graph.json"],
  },
  {
    id: "Q5",
    question: "能不能和其他软件/工具联合使用？（集成场景、联动能力、兼容工具）",
    expected_graphs: ["system-architecture.json", "tla-interaction-graph.json"],
    min_evidence: 1,
    min_relevant_nodes: 2,
  },
  {
    id: "Q6",
    question: "它的内部行为是怎样的（TLA+内部多层子系统建模分析）",
    expected_graphs: ["tla-interaction-graph.json", "system-architecture.json"],
    min_evidence: 1,
    min_relevant_nodes: 5, // TLA+ internal behavior needs more nodes
    optional_graphs: ["tla-interaction-graph.json"],
  },
  {
    id: "Q7",
    question: "它与其他系统如何交互（BDD、TLA+联合建模分析）",
    expected_graphs: ["behavior_graph.json", "tla-interaction-graph.json"],
    min_evidence: 2,
    min_relevant_nodes: 4,
  },
  {
    id: "Q8",
    question: "它与外部如何交互（BDD、TLA+联合建模分析）",
    expected_graphs: [
      "behavior_graph.json",
      "tla-interaction-graph.json",
      "system-architecture.json",
    ],
    min_evidence: 2,
    min_relevant_nodes: 3,
  },
  {
    id: "Q9",
    question: "它的工作边界是什么（BDD、TLA+联合建模+边界条件联合分析）",
    expected_graphs: [
      "behavior_graph.json",
      "tla-interaction-graph.json",
      "system-architecture.json",
    ],
    min_evidence: 2,
    min_relevant_nodes: 4,
  },
  {
    id: "Q10",
    question:
      "它的兜底方案是什么（是否存在兜底方案，是否存在降级方案，是否可以在没有这个系统情况下运行，出现问题后如何回滚、降级、恢复）",
    expected_graphs: [
      "requirement_graph.json",
      "behavior_graph.json",
      "system-architecture.json",
    ],
    min_evidence: 1,
    min_relevant_nodes: 3,
  },
];

// ===================== Label Requirements per Question =====================

/**
 * For each question, defines which labels each graph is expected to contain.
 * Labels are normalized (lowercased, colon prefix stripped) for matching.
 * `min_nodes` is the minimum count of nodes with relevant labels in that specific graph.
 */
export interface GraphLabelReq {
  graph: string;
  labels: string[];
  min_nodes: number;
}

export const QUESTION_LABEL_REQUIREMENTS: Record<string, GraphLabelReq[]> = {
  Q1: [
    {
      graph: "requirement_graph.json",
      labels: ["requirement", "functionalrequirement", "feature"],
      min_nodes: 2,
    },
    {
      graph: "system-architecture.json",
      labels: ["module", "component", "interface", "layer", "synthesisnode"],
      min_nodes: 1,
    },
  ],
  Q2: [
    {
      graph: "requirement_graph.json",
      labels: ["requirement", "functionalrequirement", "feature"],
      min_nodes: 1,
    },
    {
      graph: "behavior_graph.json",
      labels: ["scenario", "feature", "step", "action"],
      min_nodes: 1,
    },
  ],
  Q3: [
    {
      graph: "requirement_graph.json",
      labels: ["requirement", "functionalrequirement", "feature"],
      min_nodes: 1,
    },
    {
      graph: "behavior_graph.json",
      labels: ["scenario", "feature", "step", "action"],
      min_nodes: 1,
    },
    {
      graph: "tla-interaction-graph.json",
      labels: ["system", "action", "state", "invariant", "spec", "module"],
      min_nodes: 1,
    },
  ],
  Q4: [
    {
      graph: "lean-proof-graph.json",
      labels: ["theorem", "proof", "lemma", "axiom", "file"],
      min_nodes: 1,
    },
    {
      graph: "requirement_graph.json",
      labels: ["requirement", "functionalrequirement", "feature"],
      min_nodes: 1,
    },
  ],
  Q5: [
    {
      graph: "system-architecture.json",
      labels: ["module", "component", "interface", "layer", "synthesisnode"],
      min_nodes: 1,
    },
    {
      graph: "tla-interaction-graph.json",
      labels: ["system", "action", "state", "invariant", "spec", "module"],
      min_nodes: 1,
    },
  ],
  Q6: [
    {
      graph: "tla-interaction-graph.json",
      labels: ["system", "action", "state", "invariant", "spec", "module"],
      min_nodes: 5,
    },
    {
      graph: "system-architecture.json",
      labels: ["module", "component", "interface", "layer", "synthesisnode"],
      min_nodes: 1,
    },
  ],
  Q7: [
    {
      graph: "behavior_graph.json",
      labels: ["scenario", "feature", "step", "action"],
      min_nodes: 2,
    },
    {
      graph: "tla-interaction-graph.json",
      labels: ["system", "action", "state", "invariant", "spec", "module"],
      min_nodes: 2,
    },
  ],
  Q8: [
    {
      graph: "behavior_graph.json",
      labels: ["scenario", "feature", "step", "action"],
      min_nodes: 1,
    },
    {
      graph: "tla-interaction-graph.json",
      labels: ["system", "action", "state", "invariant", "spec", "module"],
      min_nodes: 1,
    },
    {
      graph: "system-architecture.json",
      labels: ["module", "component", "interface", "layer", "synthesisnode"],
      min_nodes: 1,
    },
  ],
  Q9: [
    {
      graph: "behavior_graph.json",
      labels: ["scenario", "feature", "step", "action"],
      min_nodes: 1,
    },
    {
      graph: "tla-interaction-graph.json",
      labels: ["system", "action", "state", "invariant", "spec", "module"],
      min_nodes: 1,
    },
    {
      graph: "system-architecture.json",
      labels: ["module", "component", "interface", "layer", "synthesisnode"],
      min_nodes: 1,
    },
  ],
  Q10: [
    {
      graph: "requirement_graph.json",
      labels: ["requirement", "functionalrequirement", "feature"],
      min_nodes: 1,
    },
    {
      graph: "behavior_graph.json",
      labels: ["scenario", "feature", "step", "action"],
      min_nodes: 1,
    },
    {
      graph: "system-architecture.json",
      labels: ["module", "component", "interface", "layer", "synthesisnode"],
      min_nodes: 1,
    },
  ],
};

// ===================== Cross-Graph Edge Types =====================

/**
 * For questions that require multiple interacting graphs, these edge types
 * should be present in the synthesized system-architecture.json for
 * the question to achieve "high" confidence.
 *
 * Edge type legend:
 *   IMPLEMENTS  — Behavior Scenario → Requirement
 *   FORMALIZES  — TLA Action → Behavior Scenario
 *   PROVES      — Lean Theorem → TLA Invariant
 *   REFINES     — Architecture Subsystem → Requirement Module
 */
export const CROSS_GRAPH_EDGE_TYPES: Record<string, string[]> = {
  Q1: [],
  Q2: ["IMPLEMENTS"],
  Q3: ["IMPLEMENTS", "FORMALIZES"],
  Q4: ["PROVES"],
  Q5: ["REFINES"],
  Q6: [],
  Q7: ["FORMALIZES", "IMPLEMENTS"],
  Q8: ["FORMALIZES", "IMPLEMENTS", "REFINES"],
  Q9: ["FORMALIZES", "IMPLEMENTS", "REFINES"],
  Q10: ["IMPLEMENTS", "REFINES"],
};

// ===================== Socratic Question Generator =====================

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

    // Include specific gap details in Socratic guidance
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
