/**
 * processArch1 — create nodes and edges from arch-1 base architecture records.
 */

import { Graph } from '../../graph.js';
import type { Arch1Record, ArchMetrics } from '../types.js';
import { buildNameMap, ensureModuleNode, graphHasEdge } from '../graph-utils.js';

export function processArch1(graph: Graph, records: Arch1Record[], metrics: ArchMetrics): void {
  // Pass 1: create all nodes
  for (const rec of records) {
    if (graph.hasNode(rec.id)) continue;

    const baseProps: Record<string, unknown> = {
      name: rec.name,
      reasoning: rec.reasoning ?? '',
    };

    switch (rec.type) {
      case 'module': {
        graph.addNode({ id: rec.id, labels: [':Module'], properties: baseProps });
        metrics.modules++;
        break;
      }
      case 'actor': {
        graph.addNode({ id: rec.id, labels: [':Actor'], properties: baseProps });
        metrics.actors++;
        break;
      }
      case 'constraint': {
        graph.addNode({ id: rec.id, labels: [':Constraint'], properties: baseProps });
        metrics.constraints++;
        break;
      }
    }
  }

  // Build name map after creating all arch-1 nodes
  const nameMap = buildNameMap(graph);

  // Pass 2: create edges
  for (const rec of records) {
    // -- CONTAINS edges: module/constraint → requirement --
    if (rec.contains && rec.contains.length > 0) {
      for (const targetId of rec.contains) {
        const edgeId = `${rec.id}--:CONTAINS--${targetId}`;
        if (!graphHasEdge(graph, edgeId)) {
          graph.addEdge({
            id: edgeId,
            source: rec.id,
            target: targetId,
            type: ':CONTAINS',
          });
          metrics.contains_edges++;
        }
      }
    }

    // -- PARENT_OF edge: parent module → child module --
    if (rec.parent != null && rec.type === 'module') {
      const parentId = ensureModuleNode(graph, rec.parent, nameMap);
      const edgeId = `${parentId}--:PARENT_OF--${rec.id}`;
      if (!graphHasEdge(graph, edgeId)) {
        graph.addEdge({
          id: edgeId,
          source: parentId,
          target: rec.id,
          type: ':PARENT_OF',
        });
      }
    }
  }
}
