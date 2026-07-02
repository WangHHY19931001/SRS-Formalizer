/**
 * cross-graph-verifier.ts — Cross-graph consistency verification (S6 convergence)
 *
 * During the S6 refinement loop, checks whether ALL produced artifacts
 * (requirement graph, behavior graph, interaction graphs, architecture graph)
 * can collectively answer 10 fundamental questions about the system.
 *
 * If any question cannot be answered → continue refinement loop.
 * If multiple iterations fail → escalate to human via Socratic questioning.
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ===================== Types =====================

export interface QuestionResult {
  question: string;
  answerable: boolean;
  confidence: "high" | "medium" | "low" | "none";
  evidence: string[]; // paths to graph files that provide evidence
  gaps: string[]; // what's missing
  recommendations: string[]; // how to fix
}

export interface CrossGraphReport {
  version: "1.0";
  generated_at: string;
  iteration: number;
  overall_converged: boolean;
  questions: QuestionResult[];
  summary: {
    total_questions: number;
    answerable: number;
    unanswerable: number;
    high_confidence: number;
    low_confidence: number;
    needs_human: boolean;
    human_questions: string[]; // Socratic questions with options
  };
  metadata: {
    graphs_loaded: string[];
    graphs_missing: string[];
    source_workdir: string;
  };
}

// ===================== The 10 Fundamental Questions =====================

const FUNDAMENTAL_QUESTIONS = [
  {
    id: "Q1",
    question: "它是什么？（本质定义、核心定位）",
    expected_graphs: ["requirement_graph.json", "system-architecture.json"],
    min_evidence: 2,
  },
  {
    id: "Q2",
    question: "它做什么？（核心功能、主要作用）",
    expected_graphs: ["requirement_graph.json", "behavior_graph.json"],
    min_evidence: 2,
  },
  {
    id: "Q3",
    question: "它能做什么？（具体能力、可覆盖的应用场景）",
    expected_graphs: ["requirement_graph.json", "behavior_graph.json", "tla-interaction-graph.json"],
    min_evidence: 2,
  },
  {
    id: "Q4",
    question: "它为什么可以这样？（技术原理、实现逻辑、底层支撑、业内实践、理论支撑、论文url、可参考开源实现url，涉及算法的部分通过Lean 4建模分析）",
    expected_graphs: ["lean-proof-graph.json", "requirement_graph.json"],
    min_evidence: 1,
    optional_graphs: ["lean-proof-graph.json"],
  },
  {
    id: "Q5",
    question: "能不能和其他软件/工具联合使用？（集成场景、联动能力、兼容工具）",
    expected_graphs: ["system-architecture.json", "tla-interaction-graph.json"],
    min_evidence: 1,
  },
  {
    id: "Q6",
    question: "它的内部行为是怎样的（TLA+内部多层子系统建模分析）",
    expected_graphs: ["tla-interaction-graph.json", "system-architecture.json"],
    min_evidence: 1,
    optional_graphs: ["tla-interaction-graph.json"],
  },
  {
    id: "Q7",
    question: "它与其他系统如何交互（BDD、TLA+联合建模分析）",
    expected_graphs: ["behavior_graph.json", "tla-interaction-graph.json"],
    min_evidence: 2,
  },
  {
    id: "Q8",
    question: "它与外部如何交互（BDD、TLA+联合建模分析）",
    expected_graphs: ["behavior_graph.json", "tla-interaction-graph.json", "system-architecture.json"],
    min_evidence: 2,
  },
  {
    id: "Q9",
    question: "它的工作边界是什么（BDD、TLA+联合建模+边界条件联合分析）",
    expected_graphs: ["behavior_graph.json", "tla-interaction-graph.json", "system-architecture.json"],
    min_evidence: 2,
  },
  {
    id: "Q10",
    question: "它的兜底方案是什么（是否存在兜底方案，是否存在降级方案，是否可以在没有这个系统情况下运行，出现问题后如何回滚、降级、恢复）",
    expected_graphs: ["requirement_graph.json", "behavior_graph.json", "system-architecture.json"],
    min_evidence: 1,
  },
];

// ===================== Graph Loader =====================

interface GraphMeta {
  path: string;
  exists: boolean;
  nodes: number;
  edges: number;
  layers: string[];
}

function loadGraphMeta(workDir: string, graphFile: string): GraphMeta | null {
  const candidates = [
    path.join(workDir, "3_graph", "graph", graphFile),
    path.join(workDir, "4_bdd", graphFile),
    path.join(workDir, "5_formal", graphFile),
    path.join(workDir, "6_outputs", graphFile),
    path.join(workDir, "6_outputs", "system-architecture.json"),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const data = JSON.parse(fs.readFileSync(p, "utf-8"));
        const nodes = data.nodes?.length || 0;
        const edges = data.edges?.length || 0;
        // Detect layers from node labels
        const labels = new Set<string>();
        if (data.nodes) {
          for (const n of data.nodes) {
            if (n.labels) for (const l of (Array.isArray(n.labels) ? n.labels : [n.labels])) labels.add(l);
          }
        }
        return { path: p, exists: true, nodes, edges, layers: [...labels] };
      } catch {
        return null;
      }
    }
  }

  // Check workDir root
  const rootPath = path.join(workDir, graphFile);
  if (fs.existsSync(rootPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(rootPath, "utf-8"));
      return {
        path: rootPath, exists: true,
        nodes: data.nodes?.length || 0,
        edges: data.edges?.length || 0,
        layers: [],
      };
    } catch { /* skip */ }
  }

  return null;
}

// ===================== Evidence Scoring =====================

function scoreQuestion(
  graphs: Map<string, GraphMeta>,
  question: (typeof FUNDAMENTAL_QUESTIONS)[number],
): QuestionResult {
  const evidence: string[] = [];
  let totalNodes = 0;
  let totalEdges = 0;

  for (const g of question.expected_graphs) {
    const meta = graphs.get(g);
    if (meta && meta.exists) {
      evidence.push(g);
      totalNodes += meta.nodes;
      totalEdges += meta.edges;
    }
  }

  const hasOptional = (question as any).optional_graphs?.some(
    (g: string) => graphs.get(g)?.exists
  );

  let confidence: QuestionResult["confidence"] = "none";
  if (evidence.length >= question.min_evidence && totalNodes > 0 && totalEdges > 0) {
    confidence = "high";
  } else if (evidence.length >= Math.max(1, question.min_evidence - 1) && totalNodes > 0) {
    confidence = "medium";
  } else if (evidence.length >= 1 || totalNodes > 0) {
    confidence = "low";
  }

  const missing = question.expected_graphs.filter((g) => !graphs.get(g)?.exists);
  const gaps: string[] = [];
  const recommendations: string[] = [];

  if (missing.length > 0) {
    gaps.push(`Missing graphs: ${missing.join(", ")}`);
    recommendations.push(`Run the corresponding build-* command for: ${missing.join(", ")}`);
  }
  if (totalNodes === 0) {
    gaps.push("No nodes found in any available graph");
    recommendations.push("Ensure at least one graph has meaningful content (>0 nodes)");
  }
  if (totalEdges === 0 && totalNodes > 0) {
    gaps.push("Nodes exist but no edges (isolated nodes)");
    recommendations.push("Run analyze-structure + merge-structure to connect nodes");
  }
  if (hasOptional && confidence === "low") {
    gaps.push("Optional formal verification graph not found (TLA+/Lean)");
    recommendations.push("If the system involves algorithms/state machines, trigger S5");
  }

  return {
    question: question.question,
    answerable: confidence !== "none" && confidence !== "low",
    confidence,
    evidence,
    gaps,
    recommendations,
  };
}

// ===================== Socratic Question Generator =====================

function generateSocraticQuestions(unanswerable: QuestionResult[]): string[] {
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

    const recommendation = r.recommendations[0] || "需要进一步分析";
    questions.push(
      `【${q}】\n` +
      `置信度: ${r.confidence}\n` +
      `缺口: ${r.gaps.join("; ")}\n` +
      `推荐操作: ${recommendation}\n` +
      `请选择: ${options.join(" | ")}`,
    );
  }

  return questions;
}

// ===================== Main Verifier =====================

export function verifyCrossGraphConsistency(workDir: string, iteration: number): CrossGraphReport {
  // Load all available graphs
  const graphNames = [
    "requirement_graph.json",
    "behavior_graph.json",
    "tla-interaction-graph.json",
    "lean-proof-graph.json",
    "system-architecture.json",
    "architecture_graph.json",
  ];

  const graphs = new Map<string, GraphMeta>();
  const loaded: string[] = [];
  const missing: string[] = [];

  for (const name of graphNames) {
    const meta = loadGraphMeta(workDir, name);
    if (meta) {
      graphs.set(name, meta);
      loaded.push(name);
    } else {
      missing.push(name);
      graphs.set(name, { path: "", exists: false, nodes: 0, edges: 0, layers: [] });
    }
  }

  // Score all 10 questions
  const results = FUNDAMENTAL_QUESTIONS.map((q) => scoreQuestion(graphs, q));

  const answerable = results.filter((r) => r.answerable);
  const unanswerable = results.filter((r) => !r.answerable);
  const highConf = results.filter((r) => r.confidence === "high");
  const lowConf = results.filter((r) => r.confidence === "low" || r.confidence === "none");

  // Generate Socratic questions for gaps
  const needsHuman = unanswerable.length > 0 && iteration >= 3;
  const humanQuestions = needsHuman ? generateSocraticQuestions(unanswerable) : [];

  return {
    version: "1.0",
    generated_at: new Date().toISOString(),
    iteration,
    overall_converged: unanswerable.length === 0,
    questions: results,
    summary: {
      total_questions: results.length,
      answerable: answerable.length,
      unanswerable: unanswerable.length,
      high_confidence: highConf.length,
      low_confidence: lowConf.length,
      needs_human: needsHuman,
      human_questions: humanQuestions,
    },
    metadata: {
      graphs_loaded: loaded,
      graphs_missing: missing,
      source_workdir: workDir,
    },
  };
}
