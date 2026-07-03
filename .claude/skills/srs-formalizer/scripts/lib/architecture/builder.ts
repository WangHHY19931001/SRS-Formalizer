/**
 * builder.ts — Core architecture graph building logic
 *
 * Node creation, edge creation, cross-layer synthesis from architecture JSONL files.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Graph, type GraphData } from '../graph.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Arch1Record {
  id: string;
  type: string;
  name: string;
  parent: string | null;
  contains: string[];
  reasoning?: string;
}

export interface Arch2Record {
  id: string;
  action: string;
  name: string | null;
  parent: string | null;
  contains: string[];
  reasoning?: string;
  target: string | null;
}

export interface Arch3Record {
  id: string;
  action: string;
  target: string | null;
  detail: string;
  reasoning?: string;
}

export interface ArchMetrics {
  modules: number;
  actors: number;
  constraints: number;
  contains_edges: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read lines from a JSONL file and return parsed objects.
 */
export function readJsonLines(filePath: string): unknown[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const records: unknown[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch {
      throw new Error(`JSON parse error in ${filePath}`);
    }
  }
  return records;
}

/**
 * Load the graph from the workdir, trying files in priority order:
 * graph.merged.json > graph.structure_fixed.json > graph.json.
 * Returns null if no graph file exists.
 */
export function loadGraph(workDir: string): Graph | null {
  const candidates = ['graph.merged.json', 'graph.structure_fixed.json', 'graph.json'];
  for (const name of candidates) {
    const filePath = path.join(workDir, '3_graph', 'graph', name);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const graphData = JSON.parse(raw) as GraphData;
      return Graph.fromJSON(graphData);
    }
  }
  return null;
}

/**
 * Build a name-to-id map from all nodes that have a `name` property.
 */
export function buildNameMap(graph: Graph): Map<string, string> {
  const map = new Map<string, string>();
  for (const node of graph.getAllNodes()) {
    const name = node.properties['name'];
    if (typeof name === 'string' && name.length > 0) {
      map.set(name, node.id);
    }
  }
  return map;
}

/**
 * Ensure a module node exists for the given name. Returns the node id.
 * When no module with that name exists, creates an auto-generated placeholder
 * module node and returns its synthetic id.
 */
export function ensureModuleNode(
  graph: Graph,
  name: string | null | undefined,
  nameMap: Map<string, string>,
): string {
  // Guard against null/undefined/empty names from LLM-generated arch records
  if (!name) return '';
  const existingId = nameMap.get(name);
  if (existingId) return existingId;

  // Create a synthetic id derived from the name
  const safeName = name.replace(/[^a-zA-Z0-9_一-鿿]/g, '_');
  const id = `ARCH_AUTO_${safeName}`;

  if (!graph.hasNode(id)) {
    graph.addNode({
      id,
      labels: [':Module'],
      properties: { name, auto_created: true },
    });
    nameMap.set(name, id);
  }
  return id;
}

/**
 * Check whether an edge with the given id already exists in the graph.
 */
export function graphHasEdge(graph: Graph, edgeId: string): boolean {
  return graph.getAllEdges().some(e => e.id === edgeId);
}

/**
 * Find a node id by its `name` property value. Returns undefined when not found.
 */
export function findNodeByName(graph: Graph, name: string): string | undefined {
  for (const node of graph.getAllNodes()) {
    const nodeName = node.properties['name'];
    if (typeof nodeName === 'string' && nodeName === name) {
      return node.id;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Architecture processing
// ---------------------------------------------------------------------------

/**
 * Process arch-1 records: create nodes and edges from the base architecture definition.
 */
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

/**
 * Process arch-2 records: incremental operations on the architecture.
 */
export function processArch2(graph: Graph, records: Arch2Record[], metrics: ArchMetrics): Graph {
  const nameMap = buildNameMap(graph);

  for (const rec of records) {
    switch (rec.action) {
      // -------------------------------------------------------------------
      // add_module — add a new module node
      // -------------------------------------------------------------------
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

        // Update name map
        if (rec.name) {
          nameMap.set(rec.name, rec.id);
        }

        // Parent link
        if (rec.parent != null && rec.name !== null) {
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

        // CONTAINS edges
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
        break;
      }

      // -------------------------------------------------------------------
      // add_constraint — add a new constraint node
      // -------------------------------------------------------------------
      case 'add_constraint': {
        if (graph.hasNode(rec.id)) continue;
        graph.addNode({
          id: rec.id,
          labels: [':Constraint'],
          properties: {
            name: rec.name ?? '',
            reasoning: rec.reasoning ?? '',
          },
        });
        metrics.constraints++;

        // CONTAINS edges
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
        break;
      }

      // -------------------------------------------------------------------
      // add_actor — add a new actor node
      // -------------------------------------------------------------------
      case 'add_actor': {
        if (graph.hasNode(rec.id)) continue;
        graph.addNode({
          id: rec.id,
          labels: [':Actor'],
          properties: {
            name: rec.name ?? '',
            reasoning: rec.reasoning ?? '',
          },
        });
        metrics.actors++;
        break;
      }

      // -------------------------------------------------------------------
      // reparent — change the parent of an existing module
      // -------------------------------------------------------------------
      case 'reparent': {
        if (rec.target === null) continue;

        // Find the target module by name
        const targetId = findNodeByName(graph, rec.target);
        if (targetId === undefined) continue;

        // Remove existing PARENT_OF edges where targetId is the child
        const currentData = graph.toJSON();
        const filteredEdges = currentData.edges.filter(
          e => !(e.type === ':PARENT_OF' && e.target === targetId),
        );

        // Add new PARENT_OF edge
        if (rec.parent != null) {
          const parentId = ensureModuleNode(graph, rec.parent, nameMap);
          // Rebuild graph without old parent edges, then add new one
          let rebuilt = new Graph();
          for (const n of currentData.nodes) { rebuilt.addNode(n); }
          for (const e of filteredEdges) { rebuilt.addEdge(e); }

          const edgeId = `${parentId}--:PARENT_OF--${targetId}`;
          if (!graphHasEdge(rebuilt, edgeId)) {
            rebuilt.addEdge({
              id: edgeId,
              source: parentId,
              target: targetId,
              type: ':PARENT_OF',
            });
          }
          graph = rebuilt;
        } else {
          // No parent — just remove old PARENT_OF edges
          let rebuilt = new Graph();
          for (const n of currentData.nodes) { rebuilt.addNode(n); }
          for (const e of filteredEdges) { rebuilt.addEdge(e); }
          graph = rebuilt;
        }
        break;
      }

      // -------------------------------------------------------------------
      // merge — merge target module into a named module
      // -------------------------------------------------------------------
      case 'merge': {
        if (graph.hasNode(rec.id)) continue;

        // Create the merged module node
        graph.addNode({
          id: rec.id,
          labels: [':Module'],
          properties: {
            name: rec.name ?? '',
            reasoning: rec.reasoning ?? '',
          },
        });
        metrics.modules++;

        // Add MERGED_WITH edge if target is specified
        if (rec.target !== null) {
          const targetId = findNodeByName(graph, rec.target);
          if (targetId !== undefined) {
            const edgeId = `${rec.id}--:MERGED_WITH--${targetId}`;
            if (!graphHasEdge(graph, edgeId)) {
              graph.addEdge({
                id: edgeId,
                source: rec.id,
                target: targetId,
                type: ':MERGED_WITH',
              });
            }
          }
        }

        // Parent link
        if (rec.parent != null) {
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
        break;
      }
    }
  }

  return graph;
}

/**
 * Process arch-3 records: correction operations on the architecture.
 */
export function processArch3(graph: Graph, records: Arch3Record[]): void {
  for (const rec of records) {
    switch (rec.action) {
      // -------------------------------------------------------------------
      // add_dependency_layer — insert a coordination layer node
      // -------------------------------------------------------------------
      case 'add_dependency_layer': {
        if (graph.hasNode(rec.id)) continue;
        graph.addNode({
          id: rec.id,
          labels: [':DependencyLayer'],
          properties: {
            detail: rec.detail,
            target: rec.target ?? '',
            reasoning: rec.reasoning ?? '',
          },
        });
        break;
      }
    }
  }
}
