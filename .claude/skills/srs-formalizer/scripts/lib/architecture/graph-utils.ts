/**
 * Graph utility helpers for architecture graph building.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Graph, type GraphData } from '../graph.js';

/** Read lines from a JSONL file and return parsed objects. */
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

/** Build a name-to-id map from all nodes that have a `name` property. */
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

/** Check whether an edge with the given id already exists in the graph. */
export function graphHasEdge(graph: Graph, edgeId: string): boolean {
  return graph.getAllEdges().some(e => e.id === edgeId);
}

/** Find a node id by its `name` property value. Returns undefined when not found. */
export function findNodeByName(graph: Graph, name: string): string | undefined {
  for (const node of graph.getAllNodes()) {
    const nodeName = node.properties['name'];
    if (typeof nodeName === 'string' && nodeName === name) {
      return node.id;
    }
  }
  return undefined;
}
