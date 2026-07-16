/**
 * V-Model traceability matrix builder.
 * Maps requirements to their coverage across all dimensions.
 * Zero dependencies.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TraceabilityEntry } from './types.js';

interface SrsRecord {
  id: string;
  title: string;
  description: string;
  priority: string;
  type: string;
}

interface CoverageData {
  graphNodes?: string[];
  bddScenarios?: string[];
  tlaInvariants?: string[];
  leanTheorems?: string[];
  fixtureFiles?: string[];
}

/**
 * Build traceability matrix from SRS records.
 * Coverage status: 'full' (all dimensions), 'partial' (some), 'none' (empty).
 */
export function buildTraceabilityMatrix(
  records: SrsRecord[],
  coverageData?: Record<string, CoverageData>,
): TraceabilityEntry[];
/**
 * Scan workDir and build a full V-Model traceability matrix.
 * Returns TraceabilityEntry[] grouped by requirement ID.
 */
export function buildTraceabilityMatrix(workDir: string): TraceabilityEntry[];
export function buildTraceabilityMatrix(
  recordsOrWorkDir: SrsRecord[] | string,
  coverageData?: Record<string, CoverageData>,
): TraceabilityEntry[] {
  if (typeof recordsOrWorkDir === 'string') {
    return buildTraceabilityMatrixFromWorkDir(recordsOrWorkDir);
  }

  const records = recordsOrWorkDir;
  return records.map(record => {
    const data = coverageData?.[record.id];

    const graphNodes = data?.graphNodes ?? [];
    const bddScenarios = data?.bddScenarios ?? [];
    const tlaInvariants = data?.tlaInvariants ?? [];
    const leanTheorems = data?.leanTheorems ?? [];
    const fixtureFiles = data?.fixtureFiles ?? [];

    const filledDimensions = [
      graphNodes.length > 0,
      bddScenarios.length > 0,
      tlaInvariants.length > 0,
      leanTheorems.length > 0,
      fixtureFiles.length > 0,
    ].filter(Boolean).length;

    let coverageStatus: 'full' | 'partial' | 'none' = 'none';
    if (filledDimensions === 5) {
      coverageStatus = 'full';
    } else if (filledDimensions > 0) {
      coverageStatus = 'partial';
    }

    return {
      requirementId: record.id,
      requirementTitle: record.title,
      graphNodes,
      bddScenarios,
      tlaInvariants,
      leanTheorems,
      fixtureFiles,
      coverageStatus,
    };
  });
}

/**
 * Scan workDir and build a full V-Model traceability matrix.
 * Returns TraceabilityEntry[] grouped by requirement ID.
 */
function buildTraceabilityMatrixFromWorkDir(workDir: string): TraceabilityEntry[] {
  const entries: Map<string, TraceabilityEntry> = new Map();
  const jsonlDir = path.join(workDir, '2_extract');
  const graphDir = path.join(workDir, '3_graph', 'graph');
  const bddDir = path.join(workDir, '4_bdd', 'features');
  const tlaDir = path.join(workDir, '5_formal', 'specs');
  const leanDir = path.join(workDir, '5_formal', 'proofs');
  const fixtureDir = path.join(workDir, 'test_fixtures');

  if (fs.existsSync(jsonlDir)) {
    for (const f of fs.readdirSync(jsonlDir).filter(f => f.endsWith('.jsonl'))) {
      const lines = fs.readFileSync(path.join(jsonlDir, f), 'utf-8').split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const rec = JSON.parse(line) as { id?: string; statement?: string };
          if (rec.id) {
            entries.set(rec.id, {
              requirementId: rec.id,
              requirementTitle: rec.statement?.slice(0, 80) ?? rec.id,
              graphNodes: [],
              bddScenarios: [],
              tlaInvariants: [],
              leanTheorems: [],
              fixtureFiles: [],
              coverageStatus: 'none',
            });
          }
        } catch { /* skip malformed lines */ }
      }
    }
  }

  if (fs.existsSync(bddDir)) {
    for (const f of fs.readdirSync(bddDir).filter(f => f.endsWith('.feature'))) {
      const content = fs.readFileSync(path.join(bddDir, f), 'utf-8');
      const scenarioMatches = content.matchAll(/^\s*Scenario(?: Outline)?:\s*([\w-]+):/gm);
      for (const m of scenarioMatches) {
        if (m[1]) {
          const entry = entries.get(m[1]);
          if (entry) {
            entry.bddScenarios.push(`${f}:${m[1]}`);
            entry.coverageStatus = 'partial';
          }
        }
      }
    }
  }

  if (fs.existsSync(tlaDir)) {
    for (const f of fs.readdirSync(tlaDir).filter(f => f.endsWith('.tla'))) {
      const content = fs.readFileSync(path.join(tlaDir, f), 'utf-8');
      const invMatches = content.matchAll(/^(\w*(?:Inv|TypeOK|Safety|Liveness)\w*)\s*==/gm);
      for (const m of invMatches) {
        if (m[1]) {
          for (const [rid, entry] of entries) {
            const cleaned = rid.replace(/-/g, '').toLowerCase();
            if (m[1].toLowerCase().includes(cleaned)) {
              entry.tlaInvariants.push(`${f}:${m[1]}`);
              entry.coverageStatus = 'partial';
            }
          }
        }
      }
    }
  }

  if (fs.existsSync(leanDir)) {
    for (const f of fs.readdirSync(leanDir).filter(f => f.endsWith('.lean'))) {
      const content = fs.readFileSync(path.join(leanDir, f), 'utf-8');
      const thmMatches = content.matchAll(/^theorem\s+(\w+)/gm);
      for (const m of thmMatches) {
        if (m[1]) {
          for (const [rid, entry] of entries) {
            const cleaned = rid.replace(/-/g, '').toLowerCase();
            if (m[1].toLowerCase().includes(cleaned)) {
              entry.leanTheorems.push(`${f}:${m[1]}`);
              entry.coverageStatus = 'partial';
            }
          }
        }
      }
    }
  }

  if (fs.existsSync(fixtureDir)) {
    const scanDir = (dir: string, prefix: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(full, prefix + entry.name + '/');
        } else {
          const reqMatch = entry.name.match(/REQ[-_]?(S\d[-_]?\d+)/i);
          if (reqMatch?.[1]) {
            const rid = reqMatch[1]!.replace(/_/g, '-');
            const e = entries.get(rid);
            if (e) {
              e.fixtureFiles.push(prefix + entry.name);
              e.coverageStatus = 'partial';
            }
          }
        }
      }
    };
    scanDir(fixtureDir, '');
  }

  for (const [, entry] of entries) {
    if (entry.bddScenarios.length > 0 && entry.tlaInvariants.length > 0 &&
        entry.leanTheorems.length > 0 && entry.fixtureFiles.length > 0) {
      entry.coverageStatus = 'full';
    }
    if (fs.existsSync(graphDir)) {
      for (const f of fs.readdirSync(graphDir).filter(f => f.endsWith('.json'))) {
        try {
          const graph = JSON.parse(fs.readFileSync(path.join(graphDir, f), 'utf-8'));
          if (graph.nodes) {
            for (const node of graph.nodes) {
              if (node.id && typeof node.id === 'string' && node.id.includes(entry.requirementId)) {
                entry.graphNodes.push(node.id);
              }
            }
          }
        } catch { /* skip */ }
      }
    }
  }

  return [...entries.values()];
}
