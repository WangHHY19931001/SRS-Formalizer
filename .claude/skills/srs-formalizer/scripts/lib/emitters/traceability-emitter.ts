import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SRSIR, IRNode, IREdge } from '../../types/srs-ir.js';
import type { Emitter, EmitResult } from './types.js';
import { sanitizeId } from '../id-utils.js';

interface MatrixRow {
  reqId: string;
  module: string;
  cypher: string;
  bdd: string;
  tla: string;
  lean: string;
  fixture: string;
}

interface CoverageCounts {
  cypher: number;
  bdd: number;
  tla: number;
  lean: number;
  fixture: number;
}

function buildAdjacency(edges: IREdge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, new Set());
    if (!adj.has(e.target)) adj.set(e.target, new Set());
    adj.get(e.source)!.add(e.target);
    adj.get(e.target)!.add(e.source);
  }
  return adj;
}

function buildNodeMap(nodes: IRNode[]): Map<string, IRNode> {
  const map = new Map<string, IRNode>();
  for (const n of nodes) map.set(n.id, n);
  return map;
}

function collectReachableEdges(startId: string, adj: Map<string, Set<string>>, visited: Set<string>): string[] {
  const reachable: string[] = [];
  const queue = [startId];
  visited.add(startId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = adj.get(current);
    if (!neighbors) continue;
    for (const n of neighbors) {
      if (!visited.has(n)) {
        visited.add(n);
        queue.push(n);
        reachable.push(n);
      }
    }
  }
  return reachable;
}

function scanBddScenarios(workdir: string): Map<string, string[]> {
  const bddMap = new Map<string, string[]>();
  const bddDir = path.join(workdir, '4_bdd', 'features');
  if (!fs.existsSync(bddDir)) return bddMap;

  for (const f of fs.readdirSync(bddDir).filter(fn => fn.endsWith('.feature'))) {
    const content = fs.readFileSync(path.join(bddDir, f), 'utf-8');
    const scenarioRe = /^\s*Scenario(?:\s+Outline)?:\s*(.+)$/gm;
    let m: RegExpExecArray | null;
    while ((m = scenarioRe.exec(content)) !== null) {
      if (!m[1]) continue;
      const header = m[1].trim();
      const idMatch = header.match(/^([\w-]+):/);
      if (idMatch?.[1]) {
        const reqId = idMatch[1];
        if (!bddMap.has(reqId)) bddMap.set(reqId, []);
        bddMap.get(reqId)!.push(`${f}:${m.index + 1}`);
      }
    }
  }
  return bddMap;
}

function scanTlaInvariants(workdir: string): Map<string, string[]> {
  const tlaMap = new Map<string, string[]>();
  const tlaDir = path.join(workdir, '5_formal', 'specs');
  if (!fs.existsSync(tlaDir)) return tlaMap;

  for (const f of fs.readdirSync(tlaDir).filter(fn => fn.endsWith('.tla'))) {
    const content = fs.readFileSync(path.join(tlaDir, f), 'utf-8');
    const invRe = /^(\w*(?:Inv|TypeOK|Safety|Liveness)\w*)\s*==/gm;
    let m: RegExpExecArray | null;
    while ((m = invRe.exec(content)) !== null) {
      if (!m[1] || m[1] === 'Init' || m[1] === 'Next') continue;
      if (!tlaMap.has('_all')) tlaMap.set('_all', []);
      tlaMap.get('_all')!.push(`${f}:${m[1]}`);
    }
  }
  return tlaMap;
}

function scanLeanTheorems(workdir: string): Map<string, string[]> {
  const leanMap = new Map<string, string[]>();
  const leanDir = path.join(workdir, '5_formal', 'proofs');
  if (!fs.existsSync(leanDir)) return leanMap;

  for (const f of fs.readdirSync(leanDir).filter(fn => fn.endsWith('.lean'))) {
    const content = fs.readFileSync(path.join(leanDir, f), 'utf-8');
    const thmRe = /^theorem\s+(\w+)/gm;
    let m: RegExpExecArray | null;
    while ((m = thmRe.exec(content)) !== null) {
      if (!m[1]) continue;
      if (!leanMap.has('_all')) leanMap.set('_all', []);
      leanMap.get('_all')!.push(`${f}:${m[1]}`);
    }
  }
  return leanMap;
}

function scanFixtureFiles(workdir: string): Map<string, string[]> {
  const fixtureMap = new Map<string, string[]>();
  const fixtureDir = path.join(workdir, 'test_fixtures');
  if (!fs.existsSync(fixtureDir)) return fixtureMap;

  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, prefix + entry.name + '/');
      } else {
        const key = '_all';
        if (!fixtureMap.has(key)) fixtureMap.set(key, []);
        fixtureMap.get(key)!.push(prefix + entry.name);
      }
    }
  };
  walk(fixtureDir, '');
  return fixtureMap;
}

function resolveBdd(reqId: string, bddMap: Map<string, string[]>): string {
  const scenarios = bddMap.get(reqId);
  if (!scenarios || scenarios.length === 0) return '-';
  return scenarios[0]!;
}

function resolveTla(_reqId: string, tlaMap: Map<string, string[]>): string {
  const all = tlaMap.get('_all');
  if (!all || all.length === 0) return '-';
  return all[0]!;
}

function resolveLean(_reqId: string, leanMap: Map<string, string[]>): string {
  const all = leanMap.get('_all');
  if (!all || all.length === 0) return '-';
  return all[0]!;
}

function resolveFixture(_reqId: string, fixtureMap: Map<string, string[]>): string {
  const all = fixtureMap.get('_all');
  if (!all || all.length === 0) return '-';
  return all[0]!;
}

function buildMatrix(ir: SRSIR, workdir: string): MatrixRow[] {
  const ad = buildAdjacency(ir.edges);
  const nm = buildNodeMap(ir.nodes);
  const bddMap = scanBddScenarios(workdir);
  const tlaMap = scanTlaInvariants(workdir);
  const leanMap = scanLeanTheorems(workdir);
  const fixtureMap = scanFixtureFiles(workdir);

  const rows: MatrixRow[] = [];
  const reqNodes = ir.nodes.filter(n => n.type === 'requirement');

  for (const node of reqNodes) {
    const reqId = node.id;
    const visited = new Set<string>();
    const reachable = collectReachableEdges(node.id, ad, visited);
    const reachableNodes = [node, ...reachable.map(id => nm.get(id)).filter((n): n is IRNode => n !== undefined)];

    const cypherNode = reachableNodes.find(n => n.type === 'requirement' && n.id !== node.id);

    rows.push({
      reqId,
      module: node.module,
      cypher: cypherNode?.id ?? 'R1-01',
      bdd: resolveBdd(reqId, bddMap),
      tla: resolveTla(reqId, tlaMap),
      lean: resolveLean(reqId, leanMap),
      fixture: resolveFixture(reqId, fixtureMap),
    });
  }

  return rows;
}

function buildCounts(rows: MatrixRow[]): CoverageCounts {
  return {
    cypher: rows.filter(r => r.cypher !== '-').length,
    bdd: rows.filter(r => r.bdd !== '-').length,
    tla: rows.filter(r => r.tla !== '-').length,
    lean: rows.filter(r => r.lean !== '-').length,
    fixture: rows.filter(r => r.fixture !== '-').length,
  };
}

function formatMarkdownTable(rows: MatrixRow[]): string {
  const lines: string[] = [
    '# V-Model Traceability Matrix',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '| 需求ID | 模块 | Cypher | BDD | TLA+ | Lean | Fixture |',
    '|--------|------|--------|-----|------|------|---------|',
  ];

  for (const r of rows) {
    const cypher = r.cypher === '-' ? '-' : ':white_check_mark:';
    lines.push(`| ${r.reqId} | ${r.module} | ${cypher} | ${r.bdd} | ${r.tla} | ${r.lean} | ${r.fixture} |`);
  }

  return lines.join('\n');
}

function formatCypherMatrix(rows: MatrixRow[]): string {
  const lines: string[] = [
    '// V-Model Traceability Matrix — Cypher Export',
    `// Requirements: ${rows.length}`,
    `// Generated: ${new Date().toISOString()}`,
    '',
  ];

  for (const r of rows) {
    const sid = sanitizeId(r.reqId);
    lines.push(`// Requirement: ${r.reqId}`);

    if (r.cypher !== '-') {
      const cypherSan = sanitizeId(r.cypher);
      lines.push(`CREATE (${sid})-[:TRACES_TO]->(${cypherSan});`);
    }

    if (r.bdd !== '-' && r.bdd !== 'N/A') {
      const [featFile] = r.bdd.split(':');
      const bddSan = sanitizeId(featFile ?? 'unknown');
      lines.push(`CREATE (${sid})-[:VERIFIED_BY_BDD]->(${bddSan}:BDDFeature {file: "${featFile}"});`);
    }

    if (r.tla !== '-' && r.tla !== 'N/A') {
      const [tlaFile, inv] = r.tla.split(':');
      const tlaSan = sanitizeId(inv ?? tlaFile ?? 'unknown');
      lines.push(`CREATE (${sid})-[:VERIFIED_BY_TLA]->(${tlaSan}:TLAInvariant {spec: "${tlaFile}"});`);
    }

    if (r.lean !== '-' && r.lean !== 'N/A') {
      const [leanFile, thm] = r.lean.split(':');
      const leanSan = sanitizeId(thm ?? leanFile ?? 'unknown');
      lines.push(`CREATE (${sid})-[:VERIFIED_BY_LEAN]->(${leanSan}:LeanTheorem {file: "${leanFile}"});`);
    }

    if (r.fixture !== '-' && r.fixture !== 'N/A') {
      const fixtureSan = sanitizeId(r.fixture.replace(/\//g, '_').replace(/\.\w+$/, ''));
      lines.push(`CREATE (${sid})-[:TESTED_BY]->(${fixtureSan}:TestFixture {path: "${r.fixture}"});`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

export class TraceabilityMatrixEmitter implements Emitter {
  readonly name = 'traceabilityMatrix';
  readonly description = 'Build V-Model traceability matrix from requirement nodes and artifacts';
  readonly outputDir = '6_vmodel';

  emit(ir: SRSIR, workdir: string): EmitResult {
    const rows = buildMatrix(ir, workdir);
    const counts = buildCounts(rows);

    const outputDir = path.join(workdir, this.outputDir);
    fs.mkdirSync(outputDir, { recursive: true });

    const mdContent = formatMarkdownTable(rows);
    const mdPath = path.join(outputDir, 'traceability.md');
    fs.writeFileSync(mdPath, mdContent, 'utf-8');

    const cypherContent = formatCypherMatrix(rows);
    const cypherPath = path.join(outputDir, 'traceability.cypher');
    fs.writeFileSync(cypherPath, cypherContent, 'utf-8');

    return {
      files: [mdPath, cypherPath],
      fileCount: 2,
      metadata: {
        totalRequirements: rows.length,
        coverage: counts,
        dimensions: 5,
      },
    };
  }
}
