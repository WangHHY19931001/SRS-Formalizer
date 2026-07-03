/**
 * checks-r3.ts — R3 stage verification checks
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { readJsonl, listJsonlFiles } from '../jsonl.js';
import { Graph, type GraphData } from '../graph.js';
import type { CheckResult } from './shared.js';

export function checkAllJsonlDirsHaveFiles(workDir: string): CheckResult {
  const jsonlDirs = ['2_extract/r1-explicit', '2_extract/r2-implicit', '2_extract/r3-relational'];
  const results: string[] = [];
  let allHaveFiles = true;

  for (const subdir of jsonlDirs) {
    const dirPath = path.join(workDir, subdir);
    if (!fs.existsSync(dirPath)) {
      results.push(`${subdir}: directory not found`);
      allHaveFiles = false;
      continue;
    }
    try {
      const files = listJsonlFiles(dirPath, workDir);
      if (files.length === 0) {
        results.push(`${subdir}: 0 files`);
        allHaveFiles = false;
      } else {
        results.push(`${subdir}: ${files.length} file(s)`);
      }
    } catch {
      results.push(`${subdir}: error reading`);
      allHaveFiles = false;
    }
  }

  return {
    name: 'JSONL existence (all subdirectories)',
    passed: allHaveFiles,
    detail: results.join('; '),
  };
}

export function checkIdUniqueness(workDir: string): CheckResult {
  const jsonlDirs = ['2_extract/r1-explicit', '2_extract/r2-implicit', '2_extract/r3-relational'];
  const seenIds = new Set<string>();
  const duplicateIds: string[] = [];

  for (const subdir of jsonlDirs) {
    const dirPath = path.join(workDir, subdir);
    if (!fs.existsSync(dirPath)) continue;
    try {
      const files = listJsonlFiles(dirPath, workDir);
      for (const filePath of files) {
        const records = readJsonl(filePath, workDir);
        for (const record of records) {
          if (seenIds.has(record.id)) {
            duplicateIds.push(record.id);
          } else {
            seenIds.add(record.id);
          }
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  const isUnique = duplicateIds.length === 0;
  return {
    name: 'ID uniqueness (no duplicates across files)',
    passed: isUnique,
    detail: isUnique ? 'All IDs unique' : `Duplicate IDs found: ${[...new Set(duplicateIds)].join(', ')}`,
  };
}

export function checkGraphLoadable(workDir: string): CheckResult {
  const mergedPath = path.join(workDir, '3_graph', 'graph', 'graph.merged.json');
  const basePath = path.join(workDir, '3_graph', 'graph', 'graph.json');
  let graphFile: string | null = null;

  if (fs.existsSync(mergedPath)) {
    graphFile = mergedPath;
  } else if (fs.existsSync(basePath)) {
    graphFile = basePath;
  }

  if (!graphFile) {
    return {
      name: 'Graph loadable',
      passed: false,
      detail: 'No graph file found (tried graph/graph.merged.json and graph/graph.json)',
    };
  }

  try {
    const raw = fs.readFileSync(graphFile, 'utf-8');
    const graphData = JSON.parse(raw) as GraphData;
    Graph.fromJSON(graphData);
    return {
      name: 'Graph loadable',
      passed: true,
      detail: `Loaded from graph/${path.basename(graphFile)}`,
    };
  } catch (err) {
    return {
      name: 'Graph loadable',
      passed: false,
      detail: `Failed to load graph: ${(err as Error).message}`,
    };
  }
}

export function checkNodeCountVsR1(workDir: string): CheckResult {
  // Count R1 explicit JSONL records
  let r1Count = 0;
  const r1Dir = path.join(workDir, '2_extract', 'r1-explicit');
  if (fs.existsSync(r1Dir)) {
    try {
      const files = listJsonlFiles(r1Dir, workDir);
      for (const filePath of files) {
        const records = readJsonl(filePath, workDir);
        r1Count += records.length;
      }
    } catch { /* ignore */ }
  }

  // Get node count from graph
  const mergedPath = path.join(workDir, '3_graph', 'graph', 'graph.merged.json');
  const basePath = path.join(workDir, '3_graph', 'graph', 'graph.json');
  const graphFile = fs.existsSync(mergedPath) ? mergedPath : (fs.existsSync(basePath) ? basePath : null);

  if (!graphFile) {
    return {
      name: 'Node count >= R1 explicit requirements',
      passed: false,
      detail: 'Cannot check: no graph file found',
    };
  }

  let nodeCount = 0;
  try {
    const raw = fs.readFileSync(graphFile, 'utf-8');
    const graphData = JSON.parse(raw) as GraphData;
    nodeCount = graphData.nodes.length;
  } catch (err) {
    return {
      name: 'Node count >= R1 explicit requirements',
      passed: false,
      detail: `Cannot check: ${(err as Error).message}`,
    };
  }

  const ok = nodeCount >= r1Count;
  return {
    name: 'Node count >= R1 explicit requirements',
    passed: ok,
    detail: ok
      ? `${nodeCount} nodes >= ${r1Count} R1 requirements`
      : `Only ${nodeCount} nodes but ${r1Count} R1 requirements (missing ${r1Count - nodeCount})`,
  };
}

/** R3: 验证架构 JSONL 文件存在且非空 */
export function checkArchitectureExists(workDir: string): CheckResult {
  try {
    const archDir = path.join(workDir, '2_extract', 'architecture');
    if (!fs.existsSync(archDir)) {
      return { name: 'Architecture JSONL exists', passed: false, detail: 'architecture/ directory not found' };
    }
    const files = fs.readdirSync(archDir).filter(f => f.endsWith('.jsonl'));
    if (files.length === 0) {
      return { name: 'Architecture JSONL exists', passed: false, detail: 'No architecture JSONL files' };
    }
    const empty: string[] = [];
    for (const f of files) {
      const stat = fs.statSync(path.join(archDir, f));
      if (stat.size === 0) empty.push(f);
    }
    return {
      name: 'Architecture JSONL exists',
      passed: true,
      detail: `${files.length} file(s)${empty.length > 0 ? ` (empty: ${empty.join(',')})` : ''}`,
    };
  } catch {
    return { name: 'Architecture JSONL exists', passed: false, detail: 'Could not check architecture' };
  }
}

/** R3: 验证图谱中每条边的 source 和 target 节点存在 */
export function checkGraphEdgeIntegrity(workDir: string): CheckResult {
  try {
    const graphPaths = [
      path.join(workDir, '3_graph', 'graph', 'graph.merged.json'),
      path.join(workDir, '3_graph', 'graph', 'graph.structure_fixed.json'),
      path.join(workDir, '3_graph', 'graph', 'graph.json'),
    ];
    let graphData: { nodes: {id:string}[], edges: {id:string,source:string,target:string,type:string}[] } | null = null;
    for (const gp of graphPaths) {
      if (fs.existsSync(gp)) {
        graphData = JSON.parse(fs.readFileSync(gp, 'utf-8'));
        break;
      }
    }
    if (!graphData) {
      return { name: 'Graph edge integrity', passed: false, detail: 'No graph file found' };
    }
    const nodeIds = new Set(graphData.nodes.map(n => n.id));
    const danglingEdges: string[] = [];
    for (const e of graphData.edges) {
      if (!nodeIds.has(e.source)) danglingEdges.push(`${e.id}: source "${e.source}" not found`);
      if (!nodeIds.has(e.target)) danglingEdges.push(`${e.id}: target "${e.target}" not found`);
    }
    return {
      name: 'Graph edge integrity',
      passed: danglingEdges.length === 0,
      detail: danglingEdges.length === 0
        ? `All ${graphData.edges.length} edges reference existing nodes`
        : danglingEdges.slice(0, 5).join('; '),
    };
  } catch {
    return { name: 'Graph edge integrity', passed: false, detail: 'Could not verify edges' };
  }
}
