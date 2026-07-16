/**
 * Question definitions and label requirements for cross-graph verification.
 *
 * These are the 10 fundamental questions, their per-graph label requirements,
 * and the cross-graph edge types needed for each question.
 */

import type { QuestionDef, GraphLabelReq } from './types.js';

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
    min_relevant_nodes: 5,
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

export const QUESTION_LABEL_REQUIREMENTS: Record<string, GraphLabelReq[]> = {
  Q1: [
    { graph: "requirement_graph.json", labels: ["requirement", "functionalrequirement", "feature"], min_nodes: 2 },
    { graph: "system-architecture.json", labels: ["module", "component", "interface", "layer", "synthesisnode"], min_nodes: 1 },
  ],
  Q2: [
    { graph: "requirement_graph.json", labels: ["requirement", "functionalrequirement", "feature"], min_nodes: 1 },
    { graph: "behavior_graph.json", labels: ["scenario", "feature", "step", "action"], min_nodes: 1 },
  ],
  Q3: [
    { graph: "requirement_graph.json", labels: ["requirement", "functionalrequirement", "feature"], min_nodes: 1 },
    { graph: "behavior_graph.json", labels: ["scenario", "feature", "step", "action"], min_nodes: 1 },
    { graph: "tla-interaction-graph.json", labels: ["system", "action", "state", "invariant", "spec", "module"], min_nodes: 1 },
  ],
  Q4: [
    { graph: "lean-proof-graph.json", labels: ["theorem", "proof", "lemma", "axiom", "file"], min_nodes: 1 },
    { graph: "requirement_graph.json", labels: ["requirement", "functionalrequirement", "feature"], min_nodes: 1 },
  ],
  Q5: [
    { graph: "system-architecture.json", labels: ["module", "component", "interface", "layer", "synthesisnode"], min_nodes: 1 },
    { graph: "tla-interaction-graph.json", labels: ["system", "action", "state", "invariant", "spec", "module"], min_nodes: 1 },
  ],
  Q6: [
    { graph: "tla-interaction-graph.json", labels: ["system", "action", "state", "invariant", "spec", "module"], min_nodes: 5 },
    { graph: "system-architecture.json", labels: ["module", "component", "interface", "layer", "synthesisnode"], min_nodes: 1 },
  ],
  Q7: [
    { graph: "behavior_graph.json", labels: ["scenario", "feature", "step", "action"], min_nodes: 2 },
    { graph: "tla-interaction-graph.json", labels: ["system", "action", "state", "invariant", "spec", "module"], min_nodes: 2 },
  ],
  Q8: [
    { graph: "behavior_graph.json", labels: ["scenario", "feature", "step", "action"], min_nodes: 1 },
    { graph: "tla-interaction-graph.json", labels: ["system", "action", "state", "invariant", "spec", "module"], min_nodes: 1 },
    { graph: "system-architecture.json", labels: ["module", "component", "interface", "layer", "synthesisnode"], min_nodes: 1 },
  ],
  Q9: [
    { graph: "behavior_graph.json", labels: ["scenario", "feature", "step", "action"], min_nodes: 1 },
    { graph: "tla-interaction-graph.json", labels: ["system", "action", "state", "invariant", "spec", "module"], min_nodes: 1 },
    { graph: "system-architecture.json", labels: ["module", "component", "interface", "layer", "synthesisnode"], min_nodes: 1 },
  ],
  Q10: [
    { graph: "requirement_graph.json", labels: ["requirement", "functionalrequirement", "feature"], min_nodes: 1 },
    { graph: "behavior_graph.json", labels: ["scenario", "feature", "step", "action"], min_nodes: 1 },
    { graph: "system-architecture.json", labels: ["module", "component", "interface", "layer", "synthesisnode"], min_nodes: 1 },
  ],
};

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
