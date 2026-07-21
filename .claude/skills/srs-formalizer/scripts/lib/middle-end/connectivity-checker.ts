import type { SRSIR } from '../../types/srs-ir.js';

export interface ConnectivityReport {
  totalShards: number;
  connectedComponents: number;
  bridges: ProposedBridge[];
  orphanShards: string[];
  /** 架构树最大链长（沿 contains 边，含起止节点）。无架构节点时为 0，单层为 1。 */
  hierarchyDepth: number;
  /** 架构节点 ≥3 但相互间无 contains 层级（全部平铺，parent 皆空）时为 true。 */
  flatTree: boolean;
  /** 架构（子系统）节点总数。 */
  architectureNodes: number;
}

/**
 * 分层深度分析（多轮提取循环·层次性收敛判据）。
 * 沿 architecture 节点间的 `contains` 边计算最大链长，并检测"架构塌缩成平铺一层"。
 */
export function analyzeHierarchy(ir: SRSIR): {
  hierarchyDepth: number;
  flatTree: boolean;
  architectureNodes: number;
} {
  const archIds = new Set<string>();
  for (const n of ir.nodes) {
    if (n.type === 'architecture') archIds.add(n.id);
  }
  const architectureNodes = archIds.size;

  // parent -> children，仅保留两端都是架构节点的 contains 边
  const children = new Map<string, Set<string>>();
  const hasParent = new Set<string>();
  for (const e of ir.edges) {
    if (e.type !== 'contains') continue;
    if (!archIds.has(e.source) || !archIds.has(e.target)) continue;
    let set = children.get(e.source);
    if (!set) { set = new Set(); children.set(e.source, set); }
    set.add(e.target);
    hasParent.add(e.target);
  }

  const flatTree = architectureNodes >= 3 && hasParent.size === 0;

  // 最长链（DFS + memo；环由 visiting 栈防护）
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  function longest(id: string): number {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 1;
    visiting.add(id);
    let best = 1;
    for (const c of children.get(id) ?? []) {
      best = Math.max(best, 1 + longest(c));
    }
    visiting.delete(id);
    memo.set(id, best);
    return best;
  }

  let hierarchyDepth = 0;
  for (const id of archIds) {
    hierarchyDepth = Math.max(hierarchyDepth, longest(id));
  }

  return { hierarchyDepth, flatTree, architectureNodes };
}

// ===========================================================================
// Atomic-operation tree (建模完整性判据)
// ===========================================================================

/**
 * 原子操作树报告（"顶层节点长出原子操作树 = 建模完整性"判据）。
 *
 * 把系统建模抽象为一棵以顶层系统为根、沿 `contains` 边逐层展开子系统、
 * 叶子挂载原子需求的树。它比"无向连通分量"更强：连通但不成树（多根、
 * contains 成环、游离子系统、空壳叶子、游离需求）都会被判为建模断裂。
 *
 * 这也是多层有限状态机抽象的静态骨架——每个 architecture 节点对应一台
 * （子）状态机，`contains` 是层次精化（refinement）关系，叶子子系统是执行
 * 原子操作的最底层状态机。该报告为下游 BDD/TLA+ 建模提供层次边界与覆盖依据。
 */
export interface AtomicTreeReport {
  architectureNodes: number;
  requirementNodes: number;
  /** 无入向 contains 的 architecture 节点（应恰为 1 个顶层系统）。 */
  roots: string[];
  /** 沿 contains 从根不可达的 architecture 节点（游离子系统）。 */
  unreachableArchitecture: string[];
  /** contains 关系在 architecture 节点间成环（破坏树结构）。 */
  cyclicContains: boolean;
  /** 叶子子系统（无子 architecture）却未挂载任何原子需求（空壳）。 */
  emptyLeafSubsystems: string[];
  /** 未经 contains/refines/traces_to/implements 链入树的需求（游离需求）。 */
  uncoveredRequirements: string[];
  /**
   * 良构：恰单根、无游离子系统、contains 无环、无空壳叶子、需求全覆盖。
   * 无 architecture 节点时为 true（判据不适用，交由其它门禁处理）。
   */
  wellFormed: boolean;
}

/** 将需求挂载到子系统的边类型（任一端为 architecture、另一端为 requirement 即视为覆盖）。 */
const REQUIREMENT_ATTACH_EDGES: ReadonlySet<string> = new Set([
  'contains', 'refines', 'traces_to', 'implements', 'derived_from',
]);

export function analyzeAtomicTree(ir: SRSIR): AtomicTreeReport {
  const archIds = new Set<string>();
  const reqIds = new Set<string>();
  for (const n of ir.nodes) {
    if (n.type === 'architecture') archIds.add(n.id);
    else if (n.type === 'requirement') reqIds.add(n.id);
  }

  const empty: AtomicTreeReport = {
    architectureNodes: archIds.size,
    requirementNodes: reqIds.size,
    roots: [],
    unreachableArchitecture: [],
    cyclicContains: false,
    emptyLeafSubsystems: [],
    uncoveredRequirements: [],
    wellFormed: archIds.size === 0 ? true : false,
  };
  if (archIds.size === 0) return empty;

  // arch → arch 的 contains 邻接，及每个 arch 的入向 contains 计数。
  const archChildren = new Map<string, Set<string>>();
  const hasArchParent = new Set<string>();
  for (const id of archIds) archChildren.set(id, new Set());
  for (const e of ir.edges) {
    if (e.type !== 'contains') continue;
    if (!archIds.has(e.source) || !archIds.has(e.target)) continue;
    archChildren.get(e.source)!.add(e.target);
    hasArchParent.add(e.target);
  }

  const roots = [...archIds].filter(id => !hasArchParent.has(id)).sort();

  // 从所有根沿 contains 做可达性（BFS），检出游离子系统。
  const reachable = new Set<string>();
  const queue = [...roots];
  for (const r of roots) reachable.add(r);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const c of archChildren.get(cur) ?? []) {
      if (!reachable.has(c)) { reachable.add(c); queue.push(c); }
    }
  }
  const unreachableArchitecture = [...archIds].filter(id => !reachable.has(id)).sort();

  // contains 在 architecture 间成环检测（DFS + 三色）。
  const cyclicContains = detectContainsCycle(archIds, archChildren);

  // 需求挂载：任一 attach 边一端为 arch、另一端为 requirement。
  const coveredReq = new Set<string>();
  const archHasRequirement = new Set<string>();
  for (const e of ir.edges) {
    if (!REQUIREMENT_ATTACH_EDGES.has(e.type)) continue;
    const srcArch = archIds.has(e.source), tgtArch = archIds.has(e.target);
    const srcReq = reqIds.has(e.source), tgtReq = reqIds.has(e.target);
    if (srcArch && tgtReq) { coveredReq.add(e.target); archHasRequirement.add(e.source); }
    else if (tgtArch && srcReq) { coveredReq.add(e.source); archHasRequirement.add(e.target); }
  }

  // 空壳叶子：无子 architecture 且未挂载任何原子需求。
  const emptyLeafSubsystems = [...archIds]
    .filter(id => (archChildren.get(id)?.size ?? 0) === 0 && !archHasRequirement.has(id))
    .sort();

  const uncoveredRequirements = [...reqIds].filter(id => !coveredReq.has(id)).sort();

  const wellFormed =
    roots.length === 1 &&
    unreachableArchitecture.length === 0 &&
    !cyclicContains &&
    emptyLeafSubsystems.length === 0 &&
    uncoveredRequirements.length === 0;

  return {
    architectureNodes: archIds.size,
    requirementNodes: reqIds.size,
    roots,
    unreachableArchitecture,
    cyclicContains,
    emptyLeafSubsystems,
    uncoveredRequirements,
    wellFormed,
  };
}

function detectContainsCycle(
  archIds: Set<string>,
  archChildren: Map<string, Set<string>>,
): boolean {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const id of archIds) color.set(id, WHITE);

  const dfs = (u: string): boolean => {
    color.set(u, GRAY);
    for (const v of archChildren.get(u) ?? []) {
      const cv = color.get(v);
      if (cv === GRAY) return true;
      if (cv === WHITE && dfs(v)) return true;
    }
    color.set(u, BLACK);
    return false;
  };

  for (const id of archIds) {
    if (color.get(id) === WHITE && dfs(id)) return true;
  }
  return false;
}

export interface ProposedBridge {
  sourceNode: string;
  targetNode: string;
  reason: string;
  confidence: number;
}

function collectShardIds(ir: SRSIR): Set<string> {
  const shardIds = new Set<string>();
  for (const node of ir.nodes) {
    if (node.source.shardId) shardIds.add(node.source.shardId);
  }
  return shardIds;
}

function buildAdjacency(
  ir: SRSIR,
  shardIds: Set<string>,
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const sid of shardIds) adj.set(sid, new Set());

  for (const edge of ir.edges) {
    const srcNode = ir.nodes.find(n => n.id === edge.source);
    const tgtNode = ir.nodes.find(n => n.id === edge.target);
    if (!srcNode || !tgtNode) continue;
    const srcSid = srcNode.source.shardId;
    const tgtSid = tgtNode.source.shardId;
    if (srcSid && tgtSid && srcSid !== tgtSid) {
      adj.get(srcSid)?.add(tgtSid);
      adj.get(tgtSid)?.add(srcSid);
    }
  }

  for (const ref of ir.crossRefs) {
    if (shardIds.has(ref.sourceShard) && shardIds.has(ref.targetShard)) {
      adj.get(ref.sourceShard)?.add(ref.targetShard);
      adj.get(ref.targetShard)?.add(ref.sourceShard);
    }
  }

  return adj;
}

function findComponents(
  shardIds: Set<string>,
  adj: Map<string, Set<string>>,
): { componentCount: number; componentMap: Map<string, number> } {
  const visited = new Set<string>();
  let componentCount = 0;
  const componentMap = new Map<string, number>();

  for (const sid of shardIds) {
    if (visited.has(sid)) continue;
    const queue = [sid];
    visited.add(sid);
    componentMap.set(sid, componentCount);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const nb of adj.get(cur) ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push(nb);
          componentMap.set(nb, componentCount);
        }
      }
    }
    componentCount++;
  }

  return { componentCount, componentMap };
}

function findOrphans(
  shardIds: Set<string>,
  adj: Map<string, Set<string>>,
): string[] {
  const orphans: string[] = [];
  for (const sid of shardIds) {
    if ((adj.get(sid)?.size ?? 0) === 0) {
      orphans.push(sid);
    }
  }
  return orphans;
}

function isCJK(c: string): boolean {
  const cp = c.codePointAt(0);
  return cp !== undefined && (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0xf900 && cp <= 0xfaff)
  );
}

function tokenizeCJK(text: string): Set<string> {
  const chars = [...text.toLowerCase()];
  const tokens = new Set<string>();
  for (let i = 0; i < chars.length; i++) {
    if (isCJK(chars[i]!)) {
      tokens.add(chars[i]!);
      const bigram = chars.slice(i, i + 2).join('');
      if (bigram.length === 2 && [...bigram].every(isCJK)) {
        tokens.add(bigram);
      }
    }
  }
  return tokens;
}

function tokenizeStatement(stmt: string | undefined): Set<string> {
  if (!stmt) return new Set();
  const lower = stmt.toLowerCase();
  const cjk = tokenizeCJK(lower);
  const nonCJK = new Set(
    lower
      .split(/[\s,，。；;:：、\(\)（）\[\]{}「」『』""''\t\n\r]+/)
      .filter(w => w.length > 1 && [...w].every(c => !isCJK(c))),
  );
  return new Set([...cjk, ...nonCJK]);
}

function proposeBridges(
  ir: SRSIR,
  componentMap: Map<string, number>,
  componentCount: number,
): ProposedBridge[] {
  if (componentCount <= 1) return [];

  const componentNodes = new Map<number, string[]>();
  for (const n of ir.nodes) {
    if (n.source.shardId) {
      const comp = componentMap.get(n.source.shardId);
      if (comp !== undefined) {
        const list = componentNodes.get(comp) ?? [];
        list.push(n.id);
        componentNodes.set(comp, list);
      }
    }
  }

  if (componentNodes.size <= 1) return [];

  const bridges: ProposedBridge[] = [];
  const compIds = [...new Set(componentMap.values())];

  for (let i = 0; i < compIds.length; i++) {
    for (let j = i + 1; j < compIds.length; j++) {
      const ci = compIds[i]!;
      const cj = compIds[j]!;
      const nodesI = componentNodes.get(ci);
      const nodesJ = componentNodes.get(cj);
      if (!nodesI || !nodesJ) continue;

      let bestConfidence = 0;
      let bestNodeI = '';
      let bestNodeJ = '';
      let bestShared: string[] = [];

      for (const ni of nodesI.slice(0, 50)) {
        const nodeI = ir.nodes.find(n => n.id === ni);
        const wordsI = tokenizeStatement(nodeI?.properties.statement);
        if (wordsI.size === 0) continue;
        for (const nj of nodesJ.slice(0, 50)) {
          const nodeJ = ir.nodes.find(n => n.id === nj);
          const wordsJ = tokenizeStatement(nodeJ?.properties.statement);
          if (wordsJ.size === 0) continue;
          const shared = [...wordsI].filter(w => wordsJ.has(w));
          const confidence = shared.length / Math.max(wordsI.size, wordsJ.size, 1);
          if (confidence > bestConfidence) {
            bestConfidence = confidence;
            bestNodeI = ni;
            bestNodeJ = nj;
            bestShared = shared;
          }
        }
      }

      if (bestConfidence > 0 && bestNodeI && bestNodeJ) {
        bridges.push({
          sourceNode: bestNodeI,
          targetNode: bestNodeJ,
          reason: `Shared keywords across disconnected components: ${bestShared.slice(0, 5).join(', ')}`,
          confidence: Math.round(bestConfidence * 100) / 100,
        });
      }
    }
  }

  return bridges;
}

export function checkConnectivity(ir: SRSIR): ConnectivityReport {
  const shardIds = collectShardIds(ir);
  const totalShards = shardIds.size;

  if (totalShards === 0) {
    const h0 = analyzeHierarchy(ir);
    return {
      totalShards: 0,
      connectedComponents: 0,
      bridges: [],
      orphanShards: [],
      hierarchyDepth: h0.hierarchyDepth,
      flatTree: h0.flatTree,
      architectureNodes: h0.architectureNodes,
    };
  }

  const adj = buildAdjacency(ir, shardIds);
  const { componentCount, componentMap } = findComponents(shardIds, adj);
  const orphanShards = totalShards > 1 ? findOrphans(shardIds, adj) : [];
  const bridges = proposeBridges(ir, componentMap, componentCount);
  const hierarchy = analyzeHierarchy(ir);

  return {
    totalShards,
    connectedComponents: componentCount,
    bridges,
    orphanShards,
    hierarchyDepth: hierarchy.hierarchyDepth,
    flatTree: hierarchy.flatTree,
    architectureNodes: hierarchy.architectureNodes,
  };
}
