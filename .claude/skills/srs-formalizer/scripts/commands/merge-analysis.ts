/**
 * merge-analysis.ts — 合并子代理语义分析判决（SRS §5.9）
 *
 * CLI: npx tsx index.ts merge-analysis --workdir .srs_formalizer
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { Graph, type GraphData } from '../lib/graph.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { ensureDir } from '../lib/fs-utils.js';
import { applyMergeNodes, applyAddConflictEdge, applyAddSameAspectEdge } from '../lib/graph-operations.js';

interface VerdictRecord { pair_id: string; verdict: 'duplicate' | 'conflict' | 'same_aspect'; reasoning: string; recommended_action: 'merge' | 'add_conflict_edge' | 'add_same_aspect_edge' | 'skip'; }
interface DuplicatePair { pairId: string; nodeA: string; nodeB: string; similarity: number; statementA: string; statementB: string; }
interface ConflictPair extends DuplicatePair { negationInA: boolean; negationInB: boolean; }
interface AspectCluster { clusterId: string; object: string; nodes: string[]; statements: string[]; }
interface MergeLogEntry { pair_id: string; verdict: string; action: string; details: string; timestamp: string; }
interface Counters { verdictsProcessed: number; applied: number; skipped: number; }

const VERDICT_KEYS = ['pair_id', 'verdict', 'reasoning', 'recommended_action'] as const;

function bumpCounter(logEntries: MergeLogEntry[], counters: Counters): void {
  const lastAction = logEntries[logEntries.length - 1]!.action;
  counters.verdictsProcessed++;
  if (lastAction === 'merged' || lastAction === 'applied') counters.applied++;
  else if (lastAction === 'skipped') counters.skipped++;
}

function readJsonlRecords<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  const records: T[] = [];
  for (const line of lines) { const t = line.trim(); if (t) { try { records.push(JSON.parse(t) as T); } catch { /* skip */ } } }
  return records;
}

function isValidVerdict(r: unknown): r is VerdictRecord {
  if (typeof r !== 'object' || r === null) return false;
  const obj = r as Record<string, unknown>;
  return VERDICT_KEYS.every(k => k in obj) && ['duplicate', 'conflict', 'same_aspect'].includes(obj.verdict as string);
}

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  try { workDirArg = safeParseArg(args, '--workdir'); } catch (err) { return { status: 'error', message: (err as Error).message }; }
  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };

  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); } catch (err) { return { status: 'error', message: (err as Error).message }; }

  const fixedGraphPath = path.join(workDir, '3_graph', 'graph', 'graph.structure_fixed.json');
  const fallbackGraphPath = path.join(workDir, '3_graph', 'graph', 'graph.json');
  let graphPath: string;
  if (fs.existsSync(fixedGraphPath)) graphPath = fixedGraphPath;
  else if (fs.existsSync(fallbackGraphPath)) graphPath = fallbackGraphPath;
  else return { status: 'error', message: `Graph file not found: tried ${fixedGraphPath} and ${fallbackGraphPath}` };

  let graphData: GraphData;
  try { graphData = JSON.parse(fs.readFileSync(graphPath, 'utf-8')) as GraphData; } catch (err) { return { status: 'error', message: `Failed to parse graph file: ${(err as Error).message}` }; }

  let graph = Graph.fromJSON(graphData);
  const logEntries: MergeLogEntry[] = [];
  const counters: Counters = { verdictsProcessed: 0, applied: 0, skipped: 0 };
  const ts = new Date().toISOString();
  const analysisDir = path.join(workDir, '3_graph', 'analysis');

  if (!fs.existsSync(analysisDir)) {
    return { status: 'ok', data: { merged_graph: graph.toJSON(), log_entries: 0, verdicts_processed: 0, applied: 0, skipped: 0 } };
  }

  const duplicateLookup = new Map(readJsonlRecords<DuplicatePair>(path.join(analysisDir, 'suspected_duplicates.jsonl')).map(r => [r.pairId, r]));
  const conflictLookup = new Map(readJsonlRecords<ConflictPair>(path.join(analysisDir, 'suspected_conflicts.jsonl')).map(r => [r.pairId, r]));

  const EXCLUDED_FILES = new Set(['suspected_duplicates.jsonl', 'suspected_conflicts.jsonl', 'same_aspect_clusters.jsonl']);
  const verdictFiles = fs.readdirSync(analysisDir, { withFileTypes: true }).filter(e => e.isFile() && e.name.endsWith('.jsonl') && !EXCLUDED_FILES.has(e.name)).map(e => path.join(analysisDir, e.name));

  // Collect aspect clusters
  const aspectLookup = new Map(readJsonlRecords<AspectCluster>(path.join(analysisDir, 'same_aspect_clusters.jsonl')).map(r => [r.clusterId, r]));

  for (const file of verdictFiles) {
    const records = readJsonlRecords<unknown>(file);
    for (const rec of records) {
      const r = rec as Record<string, unknown>;
      if (!isValidVerdict(r)) { logEntries.push({ pair_id: String(r.pair_id ?? 'unknown'), verdict: String(r.verdict ?? 'unknown'), action: 'skipped', details: 'Invalid verdict record', timestamp: ts }); bumpCounter(logEntries, counters); continue; }
      if (r.recommended_action === 'skip') { logEntries.push({ pair_id: r.pair_id, verdict: r.verdict, action: 'skipped', details: 'Sub-agent recommended skip', timestamp: ts }); bumpCounter(logEntries, counters); continue; }

      switch (r.verdict) {
        case 'duplicate': {
          const dup = duplicateLookup.get(r.pair_id);
          if (!dup) { logEntries.push({ pair_id: r.pair_id, verdict: 'duplicate', action: 'skipped', details: 'Pair not found in duplicates', timestamp: ts }); bumpCounter(logEntries, counters); continue; }
          try {
            const { edgesRewired, graph: newGraph } = applyMergeNodes(graph, dup.nodeA, dup.nodeB);
            graph = newGraph;
            logEntries.push({ pair_id: r.pair_id, verdict: 'duplicate', action: 'applied', details: `Rewired ${edgesRewired} edges`, timestamp: ts });
          } catch (err) { logEntries.push({ pair_id: r.pair_id, verdict: 'duplicate', action: 'skipped', details: (err as Error).message, timestamp: ts }); }
          bumpCounter(logEntries, counters);
          break;
        }
        case 'conflict': {
          const con = conflictLookup.get(r.pair_id);
          if (!con) { logEntries.push({ pair_id: r.pair_id, verdict: 'conflict', action: 'skipped', details: 'Pair not found in conflicts', timestamp: ts }); bumpCounter(logEntries, counters); continue; }
          try { applyAddConflictEdge(graph, con.nodeA, con.nodeB, r.reasoning); logEntries.push({ pair_id: r.pair_id, verdict: 'conflict', action: 'applied', details: 'Added :CONFLICTS_WITH edge', timestamp: ts }); }
          catch (err) { logEntries.push({ pair_id: r.pair_id, verdict: 'conflict', action: 'skipped', details: (err as Error).message, timestamp: ts }); }
          bumpCounter(logEntries, counters);
          break;
        }
        case 'same_aspect': {
          const cluster = aspectLookup.get(r.pair_id);
          if (!cluster) { logEntries.push({ pair_id: r.pair_id, verdict: 'same_aspect', action: 'skipped', details: 'Cluster not found', timestamp: ts }); bumpCounter(logEntries, counters); continue; }
          for (let i = 0; i < cluster.nodes.length; i++) {
            for (let j = i + 1; j < cluster.nodes.length; j++) {
              try { applyAddSameAspectEdge(graph, cluster.nodes[i]!, cluster.nodes[j]!, r.reasoning); }
              catch { /* skip edge errors */ }
            }
          }
          logEntries.push({ pair_id: r.pair_id, verdict: 'same_aspect', action: 'applied', details: `Processed cluster with ${cluster.nodes.length} nodes`, timestamp: ts });
          bumpCounter(logEntries, counters);
          break;
        }
      }
    }
  }

  const graphDir = path.join(workDir, '3_graph', 'graph');
  ensureDir(graphDir);
  fs.writeFileSync(path.join(graphDir, 'graph.merged.json'), JSON.stringify(graph.toJSON(), null, 2), 'utf-8');
  fs.writeFileSync(path.join(graphDir, 'merge_log.jsonl'), logEntries.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf-8');

  return { status: 'ok', data: { merged_graph: graph.toJSON(), log_entries: logEntries.length, verdicts_processed: counters.verdictsProcessed, applied: counters.applied, skipped: counters.skipped } };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
