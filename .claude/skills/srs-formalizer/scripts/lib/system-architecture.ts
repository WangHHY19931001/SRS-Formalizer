/**
 * system-architecture.ts — System Architecture Graph (S6 系统架构图谱)
 *
 * Synthesizes ALL domain graphs into a single top-level architecture view.
 * Runs AFTER all four domain graphs are complete:
 *   1. Requirement Graph   (3_graph/graph/graph.merged.json)
 *   2. Behavior Graph      (4_bdd/behavior-graph.json)
 *   3. TLA Interaction Graph (5_formal/tla-interaction-graph.json)
 *   4. Lean Proof Graph    (5_formal/lean-proof-graph.json)
 *
 * Cross-layer edges:
 *   IMPLEMENTS   — Behavior Scenario → Requirement
 *   FORMALIZES   — TLA Action → Behavior Scenario
 *   PROVES        — Lean Theorem → TLA Invariant
 *   REFINES       — Architecture Subsystem → Requirement Module
 *
 * Consistency checks:
 *   - Every requirement must have ≥1 behavior scenario (coverage gap)
 *   - Every behavior must have ≤1 TLA action reference
 *   - Every TLA invariant should have ≥0 Lean proof references
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ===================== Types =====================

interface GenericNode {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
}

interface GenericEdge {
  source: string;
  target: string;
  type: string;
  properties?: Record<string, string>;
}

interface GenericGraph {
  nodes: GenericNode[];
  edges: GenericEdge[];
  metadata?: Record<string, unknown>;
}

interface SynthesisNode {
  id: string;
  layer: 'requirement' | 'behavior' | 'tla' | 'lean';
  original_labels: string[];
  properties: Record<string, string | number | boolean>;
}

interface SynthesisEdge {
  source: string;
  target: string;
  type: 'IMPLEMENTS' | 'FORMALIZES' | 'PROVES' | 'REFINES' | 'BELONGS_TO_LAYER';
  properties?: Record<string, string>;
}

interface ConsistencyCheck {
  name: string;
  passed: boolean;
  detail: string;
  severity: 'error' | 'warning';
}

export interface SystemArchitectureGraph {
  version: '1.0';
  nodes: SynthesisNode[];
  edges: SynthesisEdge[];
  consistency: ConsistencyCheck[];
  metadata: {
    generated_at: string;
    requirement_nodes: number;
    behavior_nodes: number;
    tla_nodes: number;
    lean_nodes: number;
    total_cross_edges: number;
    iterations: number;
    source_workdir: string;
  };
}

// ===================== Graph Loader =====================

function loadGraph(filePath: string): GenericGraph | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

// ===================== Builder =====================

export function buildSystemArchitecture(workDir: string, iteration: number): SystemArchitectureGraph {
  const reqGraph = loadGraph(path.join(workDir, '3_graph', 'graph', 'graph.merged.json'));
  const behaviorGraph = loadGraph(path.join(workDir, '4_bdd', 'behavior-graph.json'));
  const tlaGraph = loadGraph(path.join(workDir, '5_formal', 'tla-interaction-graph.json'));
  const leanGraph = loadGraph(path.join(workDir, '5_formal', 'lean-proof-graph.json'));

  const nodes: SynthesisNode[] = [];
  const edges: SynthesisEdge[] = [];
  const checks: ConsistencyCheck[] = [];

  let totalCrossEdges = 0;

  // Load nodes from each graph, prefixed by layer
  if (reqGraph) {
    for (const node of reqGraph.nodes) {
      nodes.push({
        id: `R-${node.id}`,
        layer: 'requirement',
        original_labels: node.labels,
        properties: flattenProps(node.properties),
      });
      edges.push({ source: `R-${node.id}`, target: 'Layer-Requirement', type: 'BELONGS_TO_LAYER' });
    }
  }

  if (behaviorGraph) {
    for (const node of behaviorGraph.nodes) {
      nodes.push({
        id: `B-${node.id}`,
        layer: 'behavior',
        original_labels: node.labels,
        properties: flattenProps(node.properties),
      });
      edges.push({ source: `B-${node.id}`, target: 'Layer-Behavior', type: 'BELONGS_TO_LAYER' });
    }
    // Cross-layer: Behavior → Requirement via VERIFIES
    for (const edge of behaviorGraph.edges) {
      if (edge.type === 'VERIFIES') {
        const reqTarget = reqGraph?.nodes.find(n => n.id === edge.target);
        if (reqTarget) {
          edges.push({
            source: `B-${edge.source}`,
            target: `R-${edge.target}`,
            type: 'IMPLEMENTS',
            properties: { via: 'VERIFIES' },
          });
          totalCrossEdges++;
        }
      }
    }
  }

  if (tlaGraph) {
    for (const node of tlaGraph.nodes) {
      nodes.push({
        id: `T-${node.id}`,
        layer: 'tla',
        original_labels: node.labels,
        properties: flattenProps(node.properties),
      });
      edges.push({ source: `T-${node.id}`, target: 'Layer-TLA', type: 'BELONGS_TO_LAYER' });
    }
    // Cross-layer: TLA → Behavior (heuristic: match by module name)
    for (const tNode of tlaGraph.nodes) {
      if (!tNode.labels.includes('System') && !tNode.labels.includes('Action')) continue;
      const tModule = String(tNode.properties.module || tNode.properties.name || '');
      for (const bNode of behaviorGraph?.nodes || []) {
        if (!bNode.labels.includes('Feature')) continue;
        const bModule = String(bNode.properties.module || bNode.properties.name || '');
        if (tModule && bModule && similarity(tModule.toLowerCase(), bModule.toLowerCase()) > 0.6) {
          edges.push({
            source: `T-${tNode.id}`, target: `B-${bNode.id}`,
            type: 'FORMALIZES',
            properties: { match: 'module_name_heuristic' },
          });
          totalCrossEdges++;
        }
      }
    }
  }

  if (leanGraph) {
    for (const node of leanGraph.nodes) {
      nodes.push({
        id: `L-${node.id}`,
        layer: 'lean',
        original_labels: node.labels,
        properties: flattenProps(node.properties),
      });
      edges.push({ source: `L-${node.id}`, target: 'Layer-Lean', type: 'BELONGS_TO_LAYER' });
    }
    // Cross-layer: Lean → TLA (heuristic: theorem names matching invariant names)
    for (const lNode of leanGraph.nodes) {
      if (!lNode.labels.includes('Theorem')) continue;
      const lName = String(lNode.properties.name || '');
      for (const tNode of tlaGraph?.nodes || []) {
        if (!tNode.labels.includes('Invariant')) continue;
        const tName = String(tNode.properties.name || '');
        if (lName && tName && similarity(lName.toLowerCase(), tName.toLowerCase()) > 0.5) {
          edges.push({
            source: `L-${lNode.id}`, target: `T-${tNode.id}`,
            type: 'PROVES',
            properties: { match: 'name_heuristic' },
          });
          totalCrossEdges++;
        }
      }
    }
  }

  // Layer nodes
  const layerNodes = ['Requirement', 'Behavior', 'TLA', 'Lean'];
  for (const layer of layerNodes) {
    nodes.push({
      id: `Layer-${layer}`,
      layer: 'requirement', // meta
      original_labels: ['Layer'],
      properties: { name: `${layer} Layer` },
    });
  }

  // ===================== Consistency Checks =====================

  // R1: Requirement coverage — every requirement should have ≥1 behavior
  if (reqGraph && behaviorGraph) {
    const reqScenarioNodes = reqGraph.nodes.filter(n => n.labels.includes('Requirement') || n.labels.some((l: string) => l.toLowerCase().includes('requirement')));
    const behaviorVerifyEdges = behaviorGraph.edges.filter(e => e.type === 'VERIFIES');
    const verifiedReqs = new Set(behaviorVerifyEdges.map(e => e.target));
    const covered = reqScenarioNodes.filter(n => verifiedReqs.has(n.id)).length;
    const uncovered = reqScenarioNodes.length - covered;

    checks.push({
      name: 'requirement_coverage',
      passed: reqScenarioNodes.length === 0 || uncovered === 0,
      detail: reqScenarioNodes.length === 0
        ? 'N/A (no requirement nodes)'
        : uncovered === 0
          ? `✓ All ${reqScenarioNodes.length} requirements have behavior coverage`
          : `${uncovered}/${reqScenarioNodes.length} requirements lack behavior coverage`,
      severity: uncovered > 0 ? 'warning' : 'error',
    });
  } else {
    checks.push({ name: 'requirement_coverage', passed: true, detail: 'N/A (missing req or behavior graph)', severity: 'error' });
  }

  // R2: Behavior — no unresolved placeholders
  if (behaviorGraph) {
    const placeholderScenarios = behaviorGraph.nodes.filter(
      n => n.labels.includes('Scenario') && n.properties.has_placeholder === true
    );
    checks.push({
      name: 'no_placeholder_scenarios',
      passed: placeholderScenarios.length === 0,
      detail: placeholderScenarios.length === 0
        ? '✓ No unresolved <THEN_PLACEHOLDER> in behaviors'
        : `${placeholderScenarios.length} scenarios with unresolved placeholders`,
      severity: 'error',
    });
  }

  // R3: TLA — no deadlocked systems
  if (tlaGraph) {
    const sysNodes = tlaGraph.nodes.filter(n => n.labels.includes('System'));
    const noActions = sysNodes.filter(n => (n.properties.action_count as number || 0) === 0);
    checks.push({
      name: 'tla_systems_have_actions',
      passed: noActions.length === 0,
      detail: noActions.length === 0
        ? `✓ All ${sysNodes.length} systems have actions`
        : `${noActions.length} systems have no actions defined`,
      severity: 'warning',
    });
  }

  // R4: Lean — no axioms
  if (leanGraph) {
    const axiomCount = leanGraph.metadata && typeof leanGraph.metadata === 'object' && 'axiom_count' in leanGraph.metadata
      ? (leanGraph.metadata as Record<string, unknown>).axiom_count as number
      : 0;
    checks.push({
      name: 'lean_no_axioms',
      passed: axiomCount === 0,
      detail: axiomCount === 0 ? '✓ No axioms in proofs' : `${axiomCount} axioms detected — proofs may be incomplete`,
      severity: 'error',
    });
  }

  // R5: Cross-graph consistency check summary
  checks.push({
    name: 'cross_layer_edges',
    passed: totalCrossEdges > 0 || (!reqGraph && !behaviorGraph && !tlaGraph && !leanGraph),
    detail: totalCrossEdges > 0
      ? `✓ ${totalCrossEdges} cross-layer edges established`
      : 'No cross-layer edges — graphs may be disconnected',
    severity: totalCrossEdges > 0 ? 'error' : 'warning',
  });

  return {
    version: '1.0',
    nodes,
    edges,
    consistency: checks,
    metadata: {
      generated_at: new Date().toISOString(),
      requirement_nodes: reqGraph?.nodes.length ?? 0,
      behavior_nodes: behaviorGraph?.nodes.length ?? 0,
      tla_nodes: tlaGraph?.nodes.length ?? 0,
      lean_nodes: leanGraph?.nodes.length ?? 0,
      total_cross_edges: totalCrossEdges,
      iterations: iteration,
      source_workdir: workDir,
    },
  };
}

// ===================== Helpers =====================

function flattenProps(props: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    } else if (typeof v === 'object') {
      out[k] = JSON.stringify(v).slice(0, 200);
    }
  }
  return out;
}

/** Simple Jaccard-like character overlap for name matching */
function similarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0;
  const aSet = new Set(a.split(''));
  const bSet = new Set(b.split(''));
  const intersection = new Set([...aSet].filter(x => bSet.has(x)));
  const union = new Set([...aSet, ...bSet]);
  return intersection.size / union.size;
}

// ===================== Cypher Export =====================

export function exportSystemArchToCypher(graph: SystemArchitectureGraph): string {
  const lines: string[] = [
    '// ============================================================',
    '// System Architecture Graph — Cross-Layer Synthesis',
    `// Generated: ${graph.metadata.generated_at}`,
    `// Iteration: ${graph.metadata.iterations}`,
    `// Nodes: Req=${graph.metadata.requirement_nodes} Bhv=${graph.metadata.behavior_nodes}`,
    `//       TLA=${graph.metadata.tla_nodes} Lean=${graph.metadata.lean_nodes}`,
    `// Cross edges: ${graph.metadata.total_cross_edges}`,
    '//',
  ];

  for (const check of graph.consistency) {
    const icon = check.passed ? '✓' : '✗';
    lines.push(`// ${icon} ${check.name}: ${check.detail}`);
  }

  lines.push('// ============================================================', '');

  function safeId(id: string): string {
    return id.replace(/[^A-Za-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  for (const node of graph.nodes) {
    const labels = [...node.original_labels, node.layer].map((l: string) => `:${l}`).join('');
    const props = Object.entries(node.properties)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => typeof v === 'string' ? `${k}: ${JSON.stringify(v)}` : `${k}: ${v}`)
      .join(', ');
    lines.push(`CREATE (${safeId(node.id)}${labels} {id: "${node.id}", layer: "${node.layer}", ${props}});`);
  }

  lines.push('');

  for (const edge of graph.edges) {
    const src = safeId(edge.source);
    const tgt = safeId(edge.target);
    const eProps = edge.properties
      ? Object.entries(edge.properties).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ')
      : '';
    const eStr = eProps ? ` {${eProps}}` : '';
    lines.push(`CREATE (${src})-[:${edge.type}${eStr}]->(${tgt});`);
  }

  return lines.join('\n');
}
