/**
 * merge-analysis.ts — 合并子代理语义分析判决（SRS §5.9）
 *
 * CLI: npx tsx index.ts merge-analysis --workdir .srs_formalizer
 *
 * 读取 analysis/ 目录下的子代理判决 JSONL 文件，应用三种判决：
 *   - duplicate  → 合并节点（保留一个，转移所有边）
 *   - conflict   → 添加 :CONFLICTS_WITH 边
 *   - same_aspect → 添加 :SAME_ASPECT 边
 *
 * 输出 graph/graph.merged.json + graph/merge_log.jsonl
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { Graph, type GraphData, type GraphEdge } from '../lib/graph.js';
import { validateWorkDir } from '../lib/security.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** 子代理判决记录（SRS §6.2） */
interface VerdictRecord {
  pair_id: string;
  verdict: 'duplicate' | 'conflict' | 'same_aspect';
  reasoning: string;
  recommended_action: 'merge' | 'add_conflict_edge' | 'add_same_aspect_edge' | 'skip';
}

/** 疑似重复对（来自 suspected_duplicates.jsonl） */
interface DuplicatePair {
  pairId: string;
  nodeA: string;
  nodeB: string;
  similarity: number;
  statementA: string;
  statementB: string;
}

/** 疑似冲突对（来自 suspected_conflicts.jsonl） */
interface ConflictPair {
  pairId: string;
  nodeA: string;
  nodeB: string;
  similarity: number;
  statementA: string;
  statementB: string;
  negationInA: boolean;
  negationInB: boolean;
}

/** 同对象集群（来自 same_aspect_clusters.jsonl） */
interface AspectCluster {
  clusterId: string;
  object: string;
  nodes: string[];
  statements: string[];
}

/** 合并日志条目 */
interface MergeLogEntry {
  pair_id: string;
  verdict: string;
  action: 'applied' | 'skipped' | 'error';
  details: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArg(args: string[], name: string): string | null {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1]!;
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/** Read JSONL file and parse each line as JSON, returning records. */
function readJsonlRecords<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const records: T[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      records.push(JSON.parse(trimmed) as T);
    } catch {
      // Skip malformed lines silently
    }
  }
  return records;
}

// ---------------------------------------------------------------------------
// Verdict application logic
// ---------------------------------------------------------------------------

/**
 * Merge nodeB into nodeA.
 * All edges pointing to/from nodeB are rewired to nodeA, then nodeB is removed.
 */
function applyMergeNodes(
  graph: Graph,
  nodeA: string,
  nodeB: string
): { edgesRewired: number; graph: Graph } {
  if (!graph.hasNode(nodeA) || !graph.hasNode(nodeB)) {
    throw new Error(`Cannot merge: node(s) not found (${nodeA}, ${nodeB})`);
  }

  if (nodeA === nodeB) {
    throw new Error(`Cannot merge: nodes are identical (${nodeA})`);
  }

  const currentData = graph.toJSON();
  let edgesRewired = 0;

  // Rewire edges: replace nodeB references with nodeA
  const updatedEdges: GraphEdge[] = currentData.edges.map(e => {
    let modified = false;
    let newSource = e.source;
    let newTarget = e.target;

    if (e.source === nodeB) {
      newSource = nodeA;
      modified = true;
    }
    if (e.target === nodeB) {
      newTarget = nodeA;
      modified = true;
    }

    if (modified) {
      edgesRewired++;
      // If the rewired edge already exists, skip adding it
      const exists = currentData.edges.some(
        other => other.source === newSource && other.target === newTarget && other.type === e.type
      );
      if (exists) return null as unknown as GraphEdge; // marker for skip
      return { ...e, id: `${newSource}--${e.type}--${newTarget}`, source: newSource, target: newTarget };
    }
    return e;
  }).filter((e): e is GraphEdge => e !== null);

  // Remove self-loops that may have been created
  const dedupedEdges = updatedEdges.filter(e => e.source !== e.target);

  // Remove duplicate edges (same source, target, type)
  const edgeSet = new Set<string>();
  const finalEdges: GraphEdge[] = [];
  for (const e of dedupedEdges) {
    const key = `${e.source}--${e.type}--${e.target}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      finalEdges.push(e);
    }
  }

  // Rebuild graph without nodeB
  const finalNodes = currentData.nodes.filter(n => n.id !== nodeB);
  const newGraph = Graph.fromJSON({ nodes: finalNodes, edges: finalEdges });

  return { edgesRewired, graph: newGraph };
}

/**
 * Add a :CONFLICTS_WITH edge between two nodes.
 */
function applyAddConflictEdge(
  graph: Graph,
  nodeA: string,
  nodeB: string,
  reasoning: string
): void {
  if (!graph.hasNode(nodeA) || !graph.hasNode(nodeB)) {
    throw new Error(`Cannot add conflict edge: node(s) not found (${nodeA}, ${nodeB})`);
  }

  const edgeId = `${nodeA}--:CONFLICTS_WITH--${nodeB}`;

  // Check if edge already exists (in either direction)
  const existingEdges = graph.getAllEdges();
  const alreadyExists = existingEdges.some(
    e =>
      (e.source === nodeA && e.target === nodeB && e.type === ':CONFLICTS_WITH') ||
      (e.source === nodeB && e.target === nodeA && e.type === ':CONFLICTS_WITH')
  );

  if (alreadyExists) {
    return; // Skip silently — edge already present
  }

  graph.addEdge({
    id: edgeId,
    source: nodeA,
    target: nodeB,
    type: ':CONFLICTS_WITH',
    properties: { reasoning },
  });
}

/**
 * Add a :SAME_ASPECT edge between two nodes.
 */
function applyAddSameAspectEdge(
  graph: Graph,
  nodeA: string,
  nodeB: string,
  reasoning: string
): void {
  if (!graph.hasNode(nodeA) || !graph.hasNode(nodeB)) {
    throw new Error(`Cannot add same-aspect edge: node(s) not found (${nodeA}, ${nodeB})`);
  }

  const edgeId = `${nodeA}--:SAME_ASPECT--${nodeB}`;

  const existingEdges = graph.getAllEdges();
  const alreadyExists = existingEdges.some(
    e =>
      (e.source === nodeA && e.target === nodeB && e.type === ':SAME_ASPECT') ||
      (e.source === nodeB && e.target === nodeA && e.type === ':SAME_ASPECT')
  );

  if (alreadyExists) {
    return;
  }

  graph.addEdge({
    id: edgeId,
    source: nodeA,
    target: nodeB,
    type: ':SAME_ASPECT',
    properties: { reasoning },
  });
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function main(args: string[]): Promise<CliResult> {
  const workDirArg = parseArg(args, '--workdir');

  if (!workDirArg) {
    return { status: 'error', message: 'Missing required argument: --workdir' };
  }

  let workDir: string;
  try {
    workDir = validateWorkDir(workDirArg);
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  // Read the input graph — prefer graph.structure_fixed.json, fallback to graph.json
  const fixedGraphPath = path.join(workDir, '3_graph', 'graph', 'graph.structure_fixed.json');
  const fallbackGraphPath = path.join(workDir, '3_graph', 'graph', 'graph.json');
  let graphPath: string;

  if (fs.existsSync(fixedGraphPath)) {
    graphPath = fixedGraphPath;
  } else if (fs.existsSync(fallbackGraphPath)) {
    graphPath = fallbackGraphPath;
  } else {
    return { status: 'error', message: `Graph file not found: tried ${fixedGraphPath} and ${fallbackGraphPath}` };
  }

  let graphData: GraphData;
  try {
    const raw = fs.readFileSync(graphPath, 'utf-8');
    graphData = JSON.parse(raw) as GraphData;
  } catch (err) {
    return { status: 'error', message: `Failed to parse graph file: ${(err as Error).message}` };
  }

  let graph = Graph.fromJSON(graphData);
  const logEntries: MergeLogEntry[] = [];
  const timestamp = new Date().toISOString();

  // -----------------------------------------------------------------------
  // Load analysis records for pair_id resolution
  // -----------------------------------------------------------------------
  const analysisDir = path.join(workDir, '3_graph', 'analysis');

  // Build pair_id -> record lookup tables
  const duplicateLookup = new Map<string, DuplicatePair>();
  const conflictLookup = new Map<string, ConflictPair>();
  const aspectLookup = new Map<string, AspectCluster>();

  // Load suspected_duplicates.jsonl
  for (const rec of readJsonlRecords<DuplicatePair>(path.join(analysisDir, 'suspected_duplicates.jsonl'))) {
    duplicateLookup.set(rec.pairId, rec);
  }

  // Load suspected_conflicts.jsonl
  for (const rec of readJsonlRecords<ConflictPair>(path.join(analysisDir, 'suspected_conflicts.jsonl'))) {
    conflictLookup.set(rec.pairId, rec);
  }

  // Load same_aspect_clusters.jsonl
  for (const rec of readJsonlRecords<AspectCluster>(path.join(analysisDir, 'same_aspect_clusters.jsonl'))) {
    aspectLookup.set(rec.clusterId, rec);
  }

  // -----------------------------------------------------------------------
  // Collect verdict JSONL files from analysis/
  // -----------------------------------------------------------------------
  const verdictFiles: string[] = [];
  const EXCLUDED_FILES = new Set([
    'suspected_duplicates.jsonl',
    'suspected_conflicts.jsonl',
    'same_aspect_clusters.jsonl',
    'orphan_nodes.jsonl',
    'dangling_edges.jsonl',
    'concept_islands.jsonl',
  ]);

  if (fs.existsSync(analysisDir)) {
    const files = fs.readdirSync(analysisDir).filter(f => f.endsWith('.jsonl'));
    verdictFiles.push(
      ...files
        .filter(f => !EXCLUDED_FILES.has(f))
        .map(f => path.join(analysisDir, f))
    );
  }

  // Parse verdict records from all verdict files
  const verdicts: VerdictRecord[] = [];
  for (const filePath of verdictFiles) {
    const records = readJsonlRecords<VerdictRecord>(filePath);
    verdicts.push(...records);
  }

  // -----------------------------------------------------------------------
  // Process each verdict
  // -----------------------------------------------------------------------
  for (const verdict of verdicts) {
    const entry: MergeLogEntry = {
      pair_id: verdict.pair_id,
      verdict: verdict.verdict,
      action: 'applied',
      details: '',
      timestamp,
    };

    try {
      switch (verdict.verdict) {
        // ---------------------------------------------------------------
        // duplicate → merge nodes
        // ---------------------------------------------------------------
        case 'duplicate': {
          const pair = duplicateLookup.get(verdict.pair_id);
          if (!pair) {
            entry.action = 'skipped';
            entry.details = `Pair not found in suspected_duplicates.jsonl: ${verdict.pair_id}`;
            break;
          }

          if (verdict.recommended_action === 'skip') {
            entry.action = 'skipped';
            entry.details = `Sub-agent recommended skip: ${verdict.reasoning}`;
            break;
          }

          // Apply merge: keep nodeA, merge nodeB into nodeA
          const result = applyMergeNodes(graph, pair.nodeA, pair.nodeB);
          graph = result.graph;

          entry.details = `Merged ${pair.nodeB} into ${pair.nodeA}, rewired ${result.edgesRewired} edge(s)`;
          break;
        }

        // ---------------------------------------------------------------
        // conflict → add :CONFLICTS_WITH edge
        // ---------------------------------------------------------------
        case 'conflict': {
          const pair = conflictLookup.get(verdict.pair_id);
          if (!pair) {
            entry.action = 'skipped';
            entry.details = `Pair not found in suspected_conflicts.jsonl: ${verdict.pair_id}`;
            break;
          }

          if (verdict.recommended_action === 'skip') {
            entry.action = 'skipped';
            entry.details = `Sub-agent recommended skip: ${verdict.reasoning}`;
            break;
          }

          applyAddConflictEdge(graph, pair.nodeA, pair.nodeB, verdict.reasoning);
          entry.details = `Added :CONFLICTS_WITH edge between ${pair.nodeA} and ${pair.nodeB}`;
          break;
        }

        // ---------------------------------------------------------------
        // same_aspect → add :SAME_ASPECT edge
        // ---------------------------------------------------------------
        case 'same_aspect': {
          const cluster = aspectLookup.get(verdict.pair_id);
          if (!cluster) {
            entry.action = 'skipped';
            entry.details = `Cluster not found in same_aspect_clusters.jsonl: ${verdict.pair_id}`;
            break;
          }

          if (verdict.recommended_action === 'skip') {
            entry.action = 'skipped';
            entry.details = `Sub-agent recommended skip: ${verdict.reasoning}`;
            break;
          }

          // Add :SAME_ASPECT edges between all pairs in the cluster
          const nodes = cluster.nodes;
          let edgeCount = 0;
          for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
              const a = nodes[i]!;
              const b = nodes[j]!;
              if (graph.hasNode(a) && graph.hasNode(b)) {
                applyAddSameAspectEdge(graph, a, b, verdict.reasoning);
                edgeCount++;
              }
            }
          }
          entry.details = `Added ${edgeCount} :SAME_ASPECT edge(s) for cluster ${verdict.pair_id} (object: ${cluster.object})`;
          break;
        }

        default: {
          entry.action = 'skipped';
          entry.details = `Unknown verdict type: "${verdict.verdict}"`;
          break;
        }
      }
    } catch (err) {
      entry.action = 'error';
      entry.details = (err as Error).message;
    }

    logEntries.push(entry);
  }

  // -----------------------------------------------------------------------
  // Write outputs
  // -----------------------------------------------------------------------
  const graphDir = path.join(workDir, '3_graph', 'graph');
  ensureDir(graphDir);

  const outputGraphPath = path.join(graphDir, 'graph.merged.json');
  fs.writeFileSync(outputGraphPath, JSON.stringify(graph.toJSON(), null, 2), 'utf-8');

  const logPath = path.join(graphDir, 'merge_log.jsonl');
  const logContent = logEntries.map(e => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(logPath, logContent, 'utf-8');

  return {
    status: 'ok',
    data: {
      verdicts_processed: verdicts.length,
      applied: logEntries.filter(e => e.action === 'applied').length,
      skipped: logEntries.filter(e => e.action === 'skipped').length,
      errors: logEntries.filter(e => e.action === 'error').length,
    },
  };
}
