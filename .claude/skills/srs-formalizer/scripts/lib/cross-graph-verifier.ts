/**
 * cross-graph-verifier.ts — Cross-graph consistency verification (S6 convergence)
 *
 * During the S6 refinement loop, checks whether ALL produced artifacts
 * (requirement graph, behavior graph, interaction graphs, architecture graph)
 * can collectively answer 10 fundamental questions about the system.
 *
 * Enhanced with semantic node label checking and cross-graph edge validation
 * to replace the previous file-existence-only heuristic.
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

interface QuestionDef {
  id: string;
  question: string;
  expected_graphs: string[];
  min_evidence: number;
  /** Minimum total number of relevant-labeled nodes across all graphs. */
  min_relevant_nodes: number;
  optional_graphs?: string[];
}

const FUNDAMENTAL_QUESTIONS: QuestionDef[] = [
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
interface GraphLabelReq {
  graph: string;
  labels: string[];
  min_nodes: number;
}

const QUESTION_LABEL_REQUIREMENTS: Record<string, GraphLabelReq[]> = {
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
const CROSS_GRAPH_EDGE_TYPES: Record<string, string[]> = {
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

// ===================== Graph Loader =====================

interface GraphMeta {
  path: string;
  exists: boolean;
  nodes: number;
  edges: number;
  layers: string[];
  /** Normalized label → count mapping (lowercased, colon prefix stripped). */
  labelCounts: Record<string, number>;
  /** Edge type → count mapping (for cross-graph edge verification). */
  edgeTypes: Record<string, number>;
}

/** Normalize a label for matching: strip leading ':' and lowercase. */
function normalizeLabel(l: string): string {
  return l.replace(/^:/, "").toLowerCase();
}

/**
 * Load graph metadata from known directory candidates.
 * Handles both GraphData shape ({nodes, edges} with labels arrays) and
 * SystemArchitectureGraph shape ({nodes: SynthesisNode[], edges: SynthesisEdge[]}
 * which may use 'original_labels' instead of 'labels').
 */
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

        // Compute normalized label counts
        // Handle both 'labels' (GraphNode) and 'original_labels' (SynthesisNode) fields
        const labelCounts: Record<string, number> = {};
        const rawLabels = new Set<string>();
        if (data.nodes) {
          for (const n of data.nodes) {
            const nodeLabels = n.labels || n.original_labels || [];
            if (Array.isArray(nodeLabels)) {
              for (const l of nodeLabels) {
                rawLabels.add(l);
                const norm = normalizeLabel(l);
                labelCounts[norm] = (labelCounts[norm] || 0) + 1;
              }
            }
          }
        }

        // Compute edge type counts (for cross-graph edge verification)
        const edgeTypes: Record<string, number> = {};
        if (data.edges) {
          for (const e of data.edges) {
            const t = String(e.type || "unknown");
            edgeTypes[t] = (edgeTypes[t] || 0) + 1;
          }
        }

        return {
          path: p,
          exists: true,
          nodes,
          edges,
          layers: [...rawLabels],
          labelCounts,
          edgeTypes,
        };
      } catch {
        return null;
      }
    }
  }

  // Fallback: check workDir root
  const rootPath = path.join(workDir, graphFile);
  if (fs.existsSync(rootPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(rootPath, "utf-8"));
      return {
        path: rootPath,
        exists: true,
        nodes: data.nodes?.length || 0,
        edges: data.edges?.length || 0,
        layers: [],
        labelCounts: {},
        edgeTypes: {},
      };
    } catch {
      /* skip */
    }
  }

  return null;
}

// ===================== Evidence Scoring =====================

function scoreQuestion(
  graphs: Map<string, GraphMeta>,
  question: QuestionDef,
): QuestionResult {
  const evidence: string[] = [];
  const gaps: string[] = [];
  const recommendations: string[] = [];

  const labelReqs = QUESTION_LABEL_REQUIREMENTS[question.id] || [];
  let totalRelevantNodes = 0;
  let totalRelevantEdges = 0;
  let graphsWithRelevantContent = 0;
  let crossEdgeStatus: "ok" | "missing_arch" | "missing_edge" = "ok";

  for (const g of question.expected_graphs) {
    const meta = graphs.get(g);
    if (!meta || !meta.exists) {
      gaps.push(`${g}: file not found`);
      recommendations.push(`Run the corresponding build-* command for ${g}`);
      continue;
    }

    // Find label requirements for this specific graph
    const req = labelReqs.find((r) => r.graph === g);

    if (req) {
      // Count nodes with required labels
      let relevantNodeCount = 0;
      const matchedLabels: string[] = [];
      for (const label of req.labels) {
        const count = meta.labelCounts[label] || 0;
        if (count > 0) {
          relevantNodeCount += count;
          matchedLabels.push(label);
        }
      }

      if (matchedLabels.length === 0) {
        // Graph exists but has no nodes with the required labels
        const foundLabels = Object.keys(meta.labelCounts);
        const labelStr = req.labels.join(", ");
        gaps.push(
          `${g}: no relevant node types (expected: ${labelStr}; found: ${foundLabels.length > 0 ? foundLabels.join(", ") : "none"})`,
        );
        recommendations.push(
          `Add nodes with relevant labels to ${g}: ${labelStr}`,
        );
      } else if (relevantNodeCount < req.min_nodes) {
        // Some relevant nodes exist but not enough
        gaps.push(
          `${g}: ${relevantNodeCount}/${req.min_nodes} relevant nodes only`,
        );
        recommendations.push(
          `Add more relevant nodes to ${g} (need >= ${req.min_nodes})`,
        );
      } else {
        // Sufficient relevant content found
        evidence.push(g);
        graphsWithRelevantContent++;
        totalRelevantNodes += relevantNodeCount;
        if (meta.edges > 0) totalRelevantEdges += meta.edges;
      }
    } else {
      // No specific label requirement — check for any content
      if (meta.nodes > 0) {
        evidence.push(g);
        graphsWithRelevantContent++;
        totalRelevantNodes += meta.nodes;
        totalRelevantEdges += meta.edges;
      } else {
        gaps.push(`${g}: exists but has 0 nodes`);
        recommendations.push(`Ensure ${g} has meaningful content (>0 nodes)`);
      }
    }
  }

  // ===================== Cross-Graph Edge Validation =====================
  // When a question requires multiple graphs that should be connected,
  // check that the synthesized system-architecture.json has the appropriate
  // cross-layer edge types (IMPLEMENTS, FORMALIZES, PROVES, REFINES).

  const requiredEdgeTypes = CROSS_GRAPH_EDGE_TYPES[question.id];
  if (
    requiredEdgeTypes &&
    requiredEdgeTypes.length > 0 &&
    evidence.length >= 2
  ) {
    const archMeta = graphs.get("system-architecture.json");
    if (archMeta?.exists) {
      const foundTypes = requiredEdgeTypes.filter(
        (t) => (archMeta.edgeTypes[t] || 0) > 0,
      );
      if (foundTypes.length === 0) {
        crossEdgeStatus = "missing_edge";
        gaps.push(
          `system-architecture.json lacks cross-graph edges (expected: ${requiredEdgeTypes.join("/")})`,
        );
        recommendations.push(
          "Establish cross-layer connections between graphs (IMPLEMENTS/FORMALIZES/PROVES/REFINES)",
        );
      }
    } else {
      crossEdgeStatus = "missing_arch";
    }
  }

  // ===================== Optional Graph Note =====================

  const anyOptionalFound = question.optional_graphs?.some(
    (g: string) => graphs.get(g)?.exists,
  );
  if (
    !anyOptionalFound &&
    question.optional_graphs &&
    question.optional_graphs.length > 0 &&
    graphsWithRelevantContent < question.min_evidence
  ) {
    gaps.push(
      "Optional formal verification graph not found (TLA+/Lean) — consider running S5",
    );
    recommendations.push(
      "If the system involves algorithms/state machines, trigger S5",
    );
  }

  // ===================== Confidence =====================

  const hasMinEvidence = graphsWithRelevantContent >= question.min_evidence;
  const hasMinNodes = totalRelevantNodes >= question.min_relevant_nodes;
  const hasEdges = totalRelevantEdges > 0;
  const crossEdgesOk = crossEdgeStatus === "ok";

  let confidence: QuestionResult["confidence"] = "none";

  if (hasMinEvidence && hasMinNodes && hasEdges && crossEdgesOk) {
    confidence = "high";
  } else if (
    graphsWithRelevantContent >= Math.max(1, question.min_evidence - 1) &&
    totalRelevantNodes >= 1
  ) {
    confidence = "medium";
  } else if (graphsWithRelevantContent >= 1 || totalRelevantNodes > 0) {
    confidence = "low";
  }

  return {
    question: question.question,
    answerable: confidence === "high" || confidence === "medium",
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

// ===================== Main Verifier =====================

export function verifyCrossGraphConsistency(
  workDir: string,
  iteration: number,
): CrossGraphReport {
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
      graphs.set(name, {
        path: "",
        exists: false,
        nodes: 0,
        edges: 0,
        layers: [],
        labelCounts: {},
        edgeTypes: {},
      });
    }
  }

  // Score all 10 questions
  const results = FUNDAMENTAL_QUESTIONS.map((q) => scoreQuestion(graphs, q));

  const answerable = results.filter((r) => r.answerable);
  const unanswerable = results.filter((r) => !r.answerable);
  const highConf = results.filter((r) => r.confidence === "high");
  const lowConf = results.filter(
    (r) => r.confidence === "low" || r.confidence === "none",
  );

  // Generate Socratic questions for gaps
  const needsHuman = unanswerable.length > 0 && iteration >= 3;
  const humanQuestions = needsHuman
    ? generateSocraticQuestions(unanswerable)
    : [];

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
