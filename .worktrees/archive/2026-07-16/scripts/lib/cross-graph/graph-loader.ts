/**
 * Graph metadata loader — reads graph files from the workdir and extracts
 * label counts, edge type counts, and existence metadata.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface GraphMeta {
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
export function normalizeLabel(l: string): string {
  return l.replace(/^:/, "").toLowerCase();
}

/**
 * Load graph metadata from known directory candidates.
 * Handles both GraphData shape ({nodes, edges} with labels arrays) and
 * SystemArchitectureGraph shape ({nodes: SynthesisNode[], edges: SynthesisEdge[]}
 * which may use 'original_labels' instead of 'labels').
 */
export function loadGraphMeta(workDir: string, graphFile: string): GraphMeta | null {
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

        return { path: p, exists: true, nodes, edges, layers: [...rawLabels], labelCounts, edgeTypes };
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
        path: rootPath, exists: true,
        nodes: data.nodes?.length || 0, edges: data.edges?.length || 0,
        layers: [], labelCounts: {}, edgeTypes: {},
      };
    } catch { /* skip */ }
  }

  return null;
}
