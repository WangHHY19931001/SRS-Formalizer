/**
 * merge-structure.ts — 合并子代理结构补全建议命令
 *
 * CLI: npx tsx index.ts merge-structure --workdir .srs_formalizer
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { Graph, type GraphData } from '../lib/graph.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { listJsonlFiles } from '../lib/jsonl.js';

interface CompletionSuggestion { gap_id: string; suggestion_type: string; suggestion: string; reasoning: string; confidence: string; }
interface AddRelationSuggestion { source: string; target: string; type: string; }
interface FixDanglingSuggestion { edge_id: string; new_target: string; }
interface AddRequirementSuggestion { id: string; statement: string; category: string; confidence: string; source_file: string; }
interface MergeLogEntry { gap_id: string; suggestion_type: string; action: 'applied' | 'skipped'; reason?: string; timestamp: string; }

const VALID_SUGGESTION_TYPES = ['add_relation', 'fix_dangling', 'add_requirement'] as const;

function isSuggestionRecord(record: unknown): record is CompletionSuggestion {
  if (typeof record !== 'object' || record === null) return false;
  const obj = record as Record<string, unknown>;
  return typeof obj.gap_id === 'string' && typeof obj.suggestion_type === 'string' && typeof obj.suggestion === 'string';
}

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  try { workDirArg = safeParseArg(args, '--workdir'); } catch (err) { return { status: 'error', message: (err as Error).message }; }
  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };

  let workDir: string;
  try { workDir = validateWorkDir(workDirArg); } catch (err) { return { status: 'error', message: (err as Error).message }; }

  const graphPath = path.join(workDir, '3_graph', 'graph', 'graph.json');
  if (!fs.existsSync(graphPath)) return { status: 'error', message: `Graph file not found: ${graphPath}` };

  let graphData: GraphData;
  try { graphData = JSON.parse(fs.readFileSync(graphPath, 'utf-8')) as GraphData; } catch (err) { return { status: 'error', message: `Failed to parse graph file: ${(err as Error).message}` }; }

  let graph = Graph.fromJSON(graphData);
  const logEntries: MergeLogEntry[] = [];
  const analysisDir = path.join(workDir, '3_graph', 'analysis');
  const suggestionFiles: string[] = [];

  try {
    const files = listJsonlFiles(analysisDir, workDir);
    suggestionFiles.push(...files.filter(f => {
      const b = path.basename(f);
      return !['orphan_nodes.jsonl', 'dangling_edges.jsonl', 'concept_islands.jsonl'].includes(b);
    }));
  } catch { /* no suggestions */ }

  const suggestions: CompletionSuggestion[] = [];
  for (const filePath of suggestionFiles) {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (!line) continue;
      let parsed: unknown;
      try { parsed = JSON.parse(line); } catch { logEntries.push({ gap_id: 'unknown', suggestion_type: 'unknown', action: 'skipped', reason: `JSON parse error at ${path.basename(filePath)}:${i + 1}`, timestamp: new Date().toISOString() }); continue; }
      if (isSuggestionRecord(parsed)) suggestions.push(parsed);
    }
  }

  for (const sug of suggestions) {
    const ts = new Date().toISOString();
    if (!(VALID_SUGGESTION_TYPES as readonly string[]).includes(sug.suggestion_type)) { logEntries.push({ gap_id: sug.gap_id, suggestion_type: sug.suggestion_type, action: 'skipped', reason: `Unknown suggestion_type: "${sug.suggestion_type}"`, timestamp: ts }); continue; }

    try {
      switch (sug.suggestion_type) {
        case 'add_relation': {
          const details = JSON.parse(sug.suggestion) as AddRelationSuggestion;
          if (!details.source || !details.target || !details.type) { logEntries.push({ gap_id: sug.gap_id, suggestion_type: sug.suggestion_type, action: 'skipped', reason: 'Missing required fields (source, target, type)', timestamp: ts }); continue; }
          if (!graph.hasNode(details.source) || !graph.hasNode(details.target)) { logEntries.push({ gap_id: sug.gap_id, suggestion_type: sug.suggestion_type, action: 'skipped', reason: `Node not found: ${!graph.hasNode(details.source) ? details.source : details.target}`, timestamp: ts }); continue; }
          graph.addEdge({ id: `${details.source}--:${details.type}--${details.target}`, source: details.source, target: details.target, type: `:${details.type}` });
          logEntries.push({ gap_id: sug.gap_id, suggestion_type: sug.suggestion_type, action: 'applied', reason: `Added edge :${details.type}`, timestamp: ts });
          break;
        }
        case 'fix_dangling': {
          const details = JSON.parse(sug.suggestion) as FixDanglingSuggestion;
          if (!details.edge_id || !details.new_target) { logEntries.push({ gap_id: sug.gap_id, suggestion_type: sug.suggestion_type, action: 'skipped', reason: 'Missing required fields (edge_id, new_target)', timestamp: ts }); continue; }
          const currentData = graph.toJSON();
          if (!currentData.edges.some(e => e.id === details.edge_id)) { logEntries.push({ gap_id: sug.gap_id, suggestion_type: sug.suggestion_type, action: 'skipped', reason: `Edge not found: ${details.edge_id}`, timestamp: ts }); continue; }
          if (!graph.hasNode(details.new_target)) { logEntries.push({ gap_id: sug.gap_id, suggestion_type: sug.suggestion_type, action: 'skipped', reason: `Target not found: ${details.new_target}`, timestamp: ts }); continue; }
          const fixedEdges = currentData.edges.map(e => e.id === details.edge_id ? { ...e, target: details.new_target } : e);
          graph = Graph.fromJSON({ nodes: currentData.nodes, edges: fixedEdges });
          logEntries.push({ gap_id: sug.gap_id, suggestion_type: sug.suggestion_type, action: 'applied', reason: `Fixed edge ${details.edge_id} target → ${details.new_target}`, timestamp: ts });
          break;
        }
        case 'add_requirement': {
          const details = JSON.parse(sug.suggestion) as AddRequirementSuggestion;
          if (!details.id) { logEntries.push({ gap_id: sug.gap_id, suggestion_type: sug.suggestion_type, action: 'skipped', reason: 'Missing required field "id"', timestamp: ts }); continue; }
          if (graph.hasNode(details.id)) { logEntries.push({ gap_id: sug.gap_id, suggestion_type: sug.suggestion_type, action: 'skipped', reason: `Node already exists: ${details.id}`, timestamp: ts }); continue; }
          graph.addNode({ id: details.id, labels: [':SupplementalRequirement'], properties: { statement: details.statement ?? '', source_file: details.source_file ?? '', confidence: details.confidence ?? 'medium', category: details.category ?? 'explicit' } });
          logEntries.push({ gap_id: sug.gap_id, suggestion_type: sug.suggestion_type, action: 'applied', reason: `Added node ${details.id}`, timestamp: ts });
          break;
        }
      }
    } catch (err) { logEntries.push({ gap_id: sug.gap_id, suggestion_type: sug.suggestion_type, action: 'skipped', reason: `Error: ${(err as Error).message}`, timestamp: ts }); }
  }

  const graphDir = path.join(workDir, '3_graph', 'graph');
  if (!fs.existsSync(graphDir)) fs.mkdirSync(graphDir, { recursive: true });
  fs.writeFileSync(path.join(graphDir, 'graph.structure_fixed.json'), JSON.stringify(graph.toJSON(), null, 2), 'utf-8');
  fs.writeFileSync(path.join(graphDir, 'structure_merge_log.jsonl'), logEntries.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf-8');

  return { status: 'ok', data: { suggestions_processed: suggestions.length, applied: logEntries.filter(e => e.action === 'applied').length, skipped: logEntries.filter(e => e.action === 'skipped').length } };
}

import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
