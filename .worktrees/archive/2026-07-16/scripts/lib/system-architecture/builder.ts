/**
 * System architecture builder — synthesizes all domain graphs into a single
 * cross-layer architecture view.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GenericGraph, SynthesisNode, SynthesisEdge, SystemArchitectureGraph } from './types.js';
import { addCrossLayerEdges } from './cross-layer.js';
import { runConsistencyChecks } from './consistency.js';

function loadGraph(filePath: string): GenericGraph | null {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch { return null; }
}

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

export function buildSystemArchitecture(workDir: string, iteration: number): SystemArchitectureGraph {
  const reqGraph = loadGraph(path.join(workDir, '3_graph', 'graph', 'graph.merged.json'));
  const behaviorGraph = loadGraph(path.join(workDir, '4_bdd', 'behavior-graph.json'));
  const tlaGraph = loadGraph(path.join(workDir, '5_formal', 'tla-interaction-graph.json'));
  const leanGraph = loadGraph(path.join(workDir, '5_formal', 'lean-proof-graph.json'));

  const nodes: SynthesisNode[] = [];
  const edges: SynthesisEdge[] = [];

  // Load nodes from each graph, prefixed by layer
  if (reqGraph) {
    for (const node of reqGraph.nodes) {
      nodes.push({ id: `R-${node.id}`, layer: 'requirement', original_labels: node.labels, properties: flattenProps(node.properties) });
      edges.push({ source: `R-${node.id}`, target: 'Layer-Requirement', type: 'BELONGS_TO_LAYER' });
    }
  }

  if (behaviorGraph) {
    for (const node of behaviorGraph.nodes) {
      nodes.push({ id: `B-${node.id}`, layer: 'behavior', original_labels: node.labels, properties: flattenProps(node.properties) });
      edges.push({ source: `B-${node.id}`, target: 'Layer-Behavior', type: 'BELONGS_TO_LAYER' });
    }
  }

  if (tlaGraph) {
    for (const node of tlaGraph.nodes) {
      nodes.push({ id: `T-${node.id}`, layer: 'tla', original_labels: node.labels, properties: flattenProps(node.properties) });
      edges.push({ source: `T-${node.id}`, target: 'Layer-TLA', type: 'BELONGS_TO_LAYER' });
    }
  }

  if (leanGraph) {
    for (const node of leanGraph.nodes) {
      nodes.push({ id: `L-${node.id}`, layer: 'lean', original_labels: node.labels, properties: flattenProps(node.properties) });
      edges.push({ source: `L-${node.id}`, target: 'Layer-Lean', type: 'BELONGS_TO_LAYER' });
    }
  }

  // Layer nodes
  for (const layer of ['Requirement', 'Behavior', 'TLA', 'Lean']) {
    nodes.push({ id: `Layer-${layer}`, layer: 'requirement', original_labels: ['Layer'], properties: { name: `${layer} Layer` } });
  }

  // Cross-layer edges
  const { totalCrossEdges } = addCrossLayerEdges({ nodes, edges, totalCrossEdges: 0 }, reqGraph, behaviorGraph, tlaGraph, leanGraph);

  // Consistency checks
  const consistency = runConsistencyChecks(reqGraph, behaviorGraph, tlaGraph, leanGraph, totalCrossEdges);

  return {
    version: '1.0',
    nodes,
    edges,
    consistency,
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
