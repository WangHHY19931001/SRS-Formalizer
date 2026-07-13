/**
 * merge-analysis.ts — 合并子代理语义分析判决（SRS §5.9, SRSIR version）
 *
 * CLI: npx tsx index.ts merge-analysis --workdir .srs_formalizer
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import type { SRSIR } from '../types/srs-ir.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { ensureDir } from '../lib/fs-utils.js';
import { applyMergeNodesIR, applyAddConflictEdgeIR, applyAddSameAspectEdgeIR } from '../lib/graph-operations.js';

interface VerdictRecord {
  pair_id: string;
  verdict: 'duplicate' | 'conflict' | 'same_aspect';
  reasoning: string;
  recommended_action: 'merge' | 'add_conflict_edge' | 'add_same_aspect_edge' | 'skip';
}

interface DuplicatePair {
  pairId: string;
  nodeA: string;
  nodeB: string;
  similarity: number;
  statementA: string;
  statementB: string;
}

interface ConflictPair extends DuplicatePair {
  negationInA: boolean;
  negationInB: boolean;
}

interface AspectCluster {
  clusterId: string;
  object: string;
  nodes: string[];
  statements: string[];
}

interface MergeLogEntry {
  pair_id: string;
  verdict: string;
  action: string;
  details: string;
  timestamp: string;
}

interface Counters {
  verdictsProcessed: number;
  applied: number;
  skipped: number;
}

const VERDICT_KEYS = ['pair_id', 'verdict', 'reasoning', 'recommended_action'] as const;

function bumpCounter(logEntries: MergeLogEntry[], counters: Counters): void {
  const last = logEntries[logEntries.length - 1];
  if (!last) return;
  counters.verdictsProcessed++;
  if (last.action === 'merged' || last.action === 'applied') counters.applied++;
  else if (last.action === 'skipped') counters.skipped++;
}

function readJsonlRecords<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  const records: T[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t) {
      try { records.push(JSON.parse(t) as T); } catch { /* skip malformed lines */ }
    }
  }
  return records;
}

function isValidVerdict(r: unknown): r is VerdictRecord {
  if (typeof r !== 'object' || r === null) return false;
  const obj = r as Record<string, unknown>;
  return (
    VERDICT_KEYS.every(k => k in obj) &&
    ['duplicate', 'conflict', 'same_aspect'].includes(obj.verdict as string)
  );
}

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  try { workDirArg = safeParseArg(args, '--workdir'); } catch (err) { return { status: 'error', message: (err as Error).message }; }
  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };

  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); } catch (err) { return { status: 'error', message: (err as Error).message }; }

  const irPath = path.join(workDir, 'srs-ir.json');
  if (!fs.existsSync(irPath)) {
    return { status: 'error', message: `SRS IR file not found: ${irPath}` };
  }

  let ir: SRSIR;
  try { ir = JSON.parse(fs.readFileSync(irPath, 'utf-8')) as SRSIR; } catch (err) {
    return { status: 'error', message: `Failed to parse srs-ir.json: ${(err as Error).message}` };
  }

  const logEntries: MergeLogEntry[] = [];
  const counters: Counters = { verdictsProcessed: 0, applied: 0, skipped: 0 };
  const ts = new Date().toISOString();
  const analysisDir = path.join(workDir, '3_graph', 'analysis');

  if (!fs.existsSync(analysisDir)) {
    return { status: 'ok', data: { ir_nodes: ir.nodes.length, ir_edges: ir.edges.length, log_entries: 0, verdicts_processed: 0, applied: 0, skipped: 0 } };
  }

  const duplicateLookup = new Map(
    readJsonlRecords<DuplicatePair>(path.join(analysisDir, 'suspected_duplicates.jsonl')).map(r => [r.pairId, r]),
  );
  const conflictLookup = new Map(
    readJsonlRecords<ConflictPair>(path.join(analysisDir, 'suspected_conflicts.jsonl')).map(r => [r.pairId, r]),
  );
  const aspectLookup = new Map(
    readJsonlRecords<AspectCluster>(path.join(analysisDir, 'same_aspect_clusters.jsonl')).map(r => [r.clusterId, r]),
  );

  const EXCLUDED = new Set([
    'suspected_duplicates.jsonl',
    'suspected_conflicts.jsonl',
    'same_aspect_clusters.jsonl',
  ]);

  const verdictFiles = fs
    .readdirSync(analysisDir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.jsonl') && !EXCLUDED.has(e.name))
    .map(e => path.join(analysisDir, e.name));

  let currentIR = ir;

  for (const file of verdictFiles) {
    const records = readJsonlRecords<unknown>(file);
    for (const rec of records) {
      const r = rec as Record<string, unknown>;
      if (!isValidVerdict(r)) {
        logEntries.push({
          pair_id: String(r.pair_id ?? 'unknown'),
          verdict: String(r.verdict ?? 'unknown'),
          action: 'skipped',
          details: 'Invalid verdict record',
          timestamp: ts,
        });
        bumpCounter(logEntries, counters);
        continue;
      }

      if (r.recommended_action === 'skip') {
        logEntries.push({
          pair_id: r.pair_id,
          verdict: r.verdict,
          action: 'skipped',
          details: 'Sub-agent recommended skip',
          timestamp: ts,
        });
        bumpCounter(logEntries, counters);
        continue;
      }

      switch (r.verdict) {
        case 'duplicate': {
          const dup = duplicateLookup.get(r.pair_id);
          if (!dup) {
            logEntries.push({ pair_id: r.pair_id, verdict: 'duplicate', action: 'skipped', details: 'Pair not found in duplicates', timestamp: ts });
            bumpCounter(logEntries, counters);
            continue;
          }
          try {
            const merged = applyMergeNodesIR(currentIR, dup.nodeA, dup.nodeB);
            const removed = currentIR.nodes.length - merged.nodes.length;
            currentIR = merged;
            logEntries.push({ pair_id: r.pair_id, verdict: 'duplicate', action: 'applied', details: `Merged node, removed ${removed} node(s)`, timestamp: ts });
          } catch (err) {
            logEntries.push({ pair_id: r.pair_id, verdict: 'duplicate', action: 'skipped', details: (err as Error).message, timestamp: ts });
          }
          bumpCounter(logEntries, counters);
          break;
        }
        case 'conflict': {
          const con = conflictLookup.get(r.pair_id);
          if (!con) {
            logEntries.push({ pair_id: r.pair_id, verdict: 'conflict', action: 'skipped', details: 'Pair not found in conflicts', timestamp: ts });
            bumpCounter(logEntries, counters);
            continue;
          }
          try {
            currentIR = applyAddConflictEdgeIR(currentIR, con.nodeA, con.nodeB, r.reasoning);
            logEntries.push({ pair_id: r.pair_id, verdict: 'conflict', action: 'applied', details: 'Added conflicts_with edge', timestamp: ts });
          } catch (err) {
            logEntries.push({ pair_id: r.pair_id, verdict: 'conflict', action: 'skipped', details: (err as Error).message, timestamp: ts });
          }
          bumpCounter(logEntries, counters);
          break;
        }
        case 'same_aspect': {
          const cluster = aspectLookup.get(r.pair_id);
          if (!cluster) {
            logEntries.push({ pair_id: r.pair_id, verdict: 'same_aspect', action: 'skipped', details: 'Cluster not found', timestamp: ts });
            bumpCounter(logEntries, counters);
            continue;
          }
          try {
            let changed = false;
            for (let i = 0; i < cluster.nodes.length; i++) {
              for (let j = i + 1; j < cluster.nodes.length; j++) {
                const nA = cluster.nodes[i]!;
                const nB = cluster.nodes[j]!;
                try {
                  currentIR = applyAddSameAspectEdgeIR(currentIR, nA, nB, r.reasoning);
                  changed = true;
                } catch { /* skip edge errors */ }
              }
            }
            logEntries.push({
              pair_id: r.pair_id,
              verdict: 'same_aspect',
              action: changed ? 'applied' : 'skipped',
              details: `Processed cluster with ${cluster.nodes.length} nodes`,
              timestamp: ts,
            });
          } catch (err) {
            logEntries.push({ pair_id: r.pair_id, verdict: 'same_aspect', action: 'skipped', details: (err as Error).message, timestamp: ts });
          }
          bumpCounter(logEntries, counters);
          break;
        }
      }
    }
  }

  const mergedPath = path.join(workDir, 'srs-ir.merged.json');
  const graphDir = path.join(workDir, '3_graph', 'graph');
  ensureDir(graphDir);
  fs.writeFileSync(mergedPath, JSON.stringify(currentIR, null, 2), 'utf-8');
  fs.writeFileSync(
    path.join(graphDir, 'merge_log.jsonl'),
    logEntries.map(e => JSON.stringify(e)).join('\n') + '\n',
    'utf-8',
  );

  return {
    status: 'ok',
    data: {
      ir_nodes: currentIR.nodes.length,
      ir_edges: currentIR.edges.length,
      log_entries: logEntries.length,
      verdicts_processed: counters.verdictsProcessed,
      applied: counters.applied,
      skipped: counters.skipped,
    },
  };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
