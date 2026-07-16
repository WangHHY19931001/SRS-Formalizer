/**
 * processArch2 — incremental operations on the architecture (add / reparent / merge).
 */

import { Graph } from '../../graph.js';
import type { Arch2Record, ArchMetrics } from '../types.js';
import { buildNameMap, ensureModuleNode, findNodeByName, graphHasEdge } from '../graph-utils.js';

export function processArch2(graph: Graph, records: Arch2Record[], metrics: ArchMetrics): Graph {
  const nameMap = buildNameMap(graph);

  for (const rec of records) {
    switch (rec.action) {
      // -- add_module --
      case 'add_module': {
        if (graph.hasNode(rec.id)) continue;
        graph.addNode({
          id: rec.id,
          labels: [':Module'],
          properties: {
            name: rec.name ?? '',
            reasoning: rec.reasoning ?? '',
          },
        });
        metrics.modules++;

        if (rec.name) nameMap.set(rec.name, rec.id);

        if (rec.parent != null && rec.name !== null) {
          const parentId = ensureModuleNode(graph, rec.parent, nameMap);
          const edgeId = `${parentId}--:PARENT_OF--${rec.id}`;
          if (!graphHasEdge(graph, edgeId)) {
            graph.addEdge({ id: edgeId, source: parentId, target: rec.id, type: ':PARENT_OF' });
          }
        }

        if (rec.contains && rec.contains.length > 0) {
          for (const targetId of rec.contains) {
            const edgeId = `${rec.id}--:CONTAINS--${targetId}`;
            if (!graphHasEdge(graph, edgeId)) {
              graph.addEdge({ id: edgeId, source: rec.id, target: targetId, type: ':CONTAINS' });
              metrics.contains_edges++;
            }
          }
        }
        break;
      }

      // -- add_constraint --
      case 'add_constraint': {
        if (graph.hasNode(rec.id)) continue;
        graph.addNode({
          id: rec.id,
          labels: [':Constraint'],
          properties: { name: rec.name ?? '', reasoning: rec.reasoning ?? '' },
        });
        metrics.constraints++;

        if (rec.contains && rec.contains.length > 0) {
          for (const targetId of rec.contains) {
            const edgeId = `${rec.id}--:CONTAINS--${targetId}`;
            if (!graphHasEdge(graph, edgeId)) {
              graph.addEdge({ id: edgeId, source: rec.id, target: targetId, type: ':CONTAINS' });
              metrics.contains_edges++;
            }
          }
        }
        break;
      }

      // -- add_actor --
      case 'add_actor': {
        if (graph.hasNode(rec.id)) continue;
        graph.addNode({
          id: rec.id,
          labels: [':Actor'],
          properties: { name: rec.name ?? '', reasoning: rec.reasoning ?? '' },
        });
        metrics.actors++;
        break;
      }

      // -- reparent --
      case 'reparent': {
        if (rec.target === null) continue;
        const targetId = findNodeByName(graph, rec.target);
        if (targetId === undefined) continue;

        const currentData = graph.toJSON();
        const filteredEdges = currentData.edges.filter(
          e => !(e.type === ':PARENT_OF' && e.target === targetId),
        );

        if (rec.parent != null) {
          const parentId = ensureModuleNode(graph, rec.parent, nameMap);
          let rebuilt = new Graph();
          for (const n of currentData.nodes) rebuilt.addNode(n);
          for (const e of filteredEdges) rebuilt.addEdge(e);
          const edgeId = `${parentId}--:PARENT_OF--${targetId}`;
          if (!graphHasEdge(rebuilt, edgeId)) {
            rebuilt.addEdge({ id: edgeId, source: parentId, target: targetId, type: ':PARENT_OF' });
          }
          graph = rebuilt;
        } else {
          let rebuilt = new Graph();
          for (const n of currentData.nodes) rebuilt.addNode(n);
          for (const e of filteredEdges) rebuilt.addEdge(e);
          graph = rebuilt;
        }
        break;
      }

      // -- merge --
      case 'merge': {
        if (graph.hasNode(rec.id)) continue;
        graph.addNode({
          id: rec.id,
          labels: [':Module'],
          properties: { name: rec.name ?? '', reasoning: rec.reasoning ?? '' },
        });
        metrics.modules++;

        if (rec.target !== null) {
          const targetId = findNodeByName(graph, rec.target);
          if (targetId !== undefined) {
            const edgeId = `${rec.id}--:MERGED_WITH--${targetId}`;
            if (!graphHasEdge(graph, edgeId)) {
              graph.addEdge({ id: edgeId, source: rec.id, target: targetId, type: ':MERGED_WITH' });
            }
          }
        }

        if (rec.parent != null) {
          const parentId = ensureModuleNode(graph, rec.parent, nameMap);
          const edgeId = `${parentId}--:PARENT_OF--${rec.id}`;
          if (!graphHasEdge(graph, edgeId)) {
            graph.addEdge({ id: edgeId, source: parentId, target: rec.id, type: ':PARENT_OF' });
          }
        }
        break;
      }
    }
  }

  return graph;
}
