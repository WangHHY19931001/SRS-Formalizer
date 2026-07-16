import type { SRSIR, IRNode, IREdge } from '../../types/srs-ir.js';
import type { MatrixRow, CoverageCounts } from './types.js';
import {
  scanBddScenarios,
  scanTlaInvariants,
  scanLeanTheorems,
  scanFixtureFiles,
  resolveBdd,
  resolveTla,
  resolveLean,
  resolveFixture,
} from './scanners.js';

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

export { buildAdjacency, buildNodeMap, collectReachableEdges, buildMatrix, buildCounts };
