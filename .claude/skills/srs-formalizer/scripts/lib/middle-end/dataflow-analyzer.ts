/**
 * dataflow-analyzer.ts — 数据流审视提示分析（spec 2026-07-21）
 *
 * 只读 IR，产出可疑清单（findings）。恒为 warning，不参与 fail-closed。
 * 四类检出：
 *   - dead_data : 被 produce/mutate 但从不 consume（write-only）
 *   - gap       : 被 consume 但从不 produce（use-before-def）
 *   - boundary  : 入度 0（外部输入）或出度 0（最终输出）的数据实体
 *   - cycle     : 数据循环依赖（requirement↔data_entity 投影图上的 SCC 大小 > 1）
 *
 * 数据流边方向统一为 requirement → data_entity，类型 produces/consumes/mutates。
 * 对无 data_entity 节点的旧 IR（schema 2.0.0）返回空 findings（降级不报错）。
 */

import type { SRSIR } from '../../types/srs-ir.js';

export type DataFlowFindingType = 'dead_data' | 'boundary' | 'gap' | 'cycle';

export interface DataEntityRef {
  entityId: string;
  canonicalName: string;
  producedBy: string[];
  consumedBy: string[];
  mutatedBy: string[];
}

export interface DataFlowFinding {
  findingType: DataFlowFindingType;
  severity: 'warning';
  entityId: string;
  relatedNodes: string[];
  evidence: string;
  reviewActions: string[];
}

export interface DataFlowAnalysis {
  entities: DataEntityRef[];
  findings: DataFlowFinding[];
}

const REVIEW_ACTIONS: Record<DataFlowFindingType, string[]> = {
  dead_data: [
    'BDD：覆盖"该数据产生后是否真被使用"的场景；',
    '若确认无消费者 → 标记为冗余需求候选，回溯是否遗漏下游读取方。',
  ],
  gap: [
    'BDD：显式覆盖"数据缺失/为空"的边界场景；',
    'TLA+：为该变量在 Init 中补明确初值，不得默认存在；',
    '若数据来自外部系统 → 在 Given 中声明为外部输入并标注信任边界。',
  ],
  boundary: [
    '入边界（外部输入）：标注信任边界，安全场景需鉴权 Given；',
    '出边界（最终输出）：确认是否需持久化/审计。',
  ],
  cycle: [
    'TLA+：该模块 Next 重点防死锁（需求阶段已检出循环数据依赖）；',
    '确认环上是否有打破循环的默认值/初始态。',
  ],
};

/** 聚合每个 data_entity 的 produce/consume/mutate 来源 requirement 节点。 */
function collectEntities(ir: SRSIR): Map<string, DataEntityRef> {
  const entities = new Map<string, DataEntityRef>();
  for (const n of ir.nodes) {
    if (n.type !== 'data_entity') continue;
    entities.set(n.id, {
      entityId: n.id,
      canonicalName: n.module || n.properties.statement || n.id,
      producedBy: [],
      consumedBy: [],
      mutatedBy: [],
    });
  }
  for (const e of ir.edges) {
    const ent = entities.get(e.target);
    if (!ent) continue;
    if (e.type === 'produces') ent.producedBy.push(e.source);
    else if (e.type === 'consumes') ent.consumedBy.push(e.source);
    else if (e.type === 'mutates') ent.mutatedBy.push(e.source);
  }
  return entities;
}

/**
 * Tarjan SCC，作用于 requirement ∪ data_entity 的有向投影图。
 * produces/mutates: requirement → data_entity（写）
 * consumes: data_entity → requirement（读，反向连边使"读后写"可成环）
 * 返回大小 > 1 的强连通分量（即循环数据依赖）。
 */
function findCycles(ir: SRSIR): string[][] {
  const adj = new Map<string, string[]>();
  const relevant = new Set<string>();
  for (const n of ir.nodes) {
    if (n.type === 'requirement' || n.type === 'data_entity') {
      relevant.add(n.id);
      adj.set(n.id, []);
    }
  }
  for (const e of ir.edges) {
    if (!relevant.has(e.source) || !relevant.has(e.target)) continue;
    if (e.type === 'produces' || e.type === 'mutates') adj.get(e.source)!.push(e.target);
    else if (e.type === 'consumes') adj.get(e.target)!.push(e.source);
  }

  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];

  const strongConnect = (v: string): void => {
    idx.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    for (const w of adj.get(v) ?? []) {
      if (!idx.has(w)) {
        strongConnect(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, idx.get(w)!));
      }
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) sccs.push(comp);
    }
  };

  for (const v of relevant) {
    if (!idx.has(v)) strongConnect(v);
  }
  return sccs;
}

export function analyzeDataFlow(ir: SRSIR): DataFlowAnalysis {
  const entityMap = collectEntities(ir);
  const entities = [...entityMap.values()];
  const findings: DataFlowFinding[] = [];

  // 降级：无 data_entity（旧 IR / Frontend 未抽取）→ 空 findings，不报错。
  if (entities.length === 0) {
    return { entities: [], findings: [] };
  }

  for (const ent of entities) {
    const hasProducer = ent.producedBy.length > 0;
    const hasConsumer = ent.consumedBy.length > 0;
    const hasMutator = ent.mutatedBy.length > 0;

    // dead_data: 被写（produce/mutate）但从不读（consume）。
    if ((hasProducer || hasMutator) && !hasConsumer) {
      findings.push({
        findingType: 'dead_data',
        severity: 'warning',
        entityId: ent.entityId,
        relatedNodes: [...ent.producedBy, ...ent.mutatedBy],
        evidence: `数据实体 "${ent.canonicalName}" 被产生/改写但从不被消费（write-only）`,
        reviewActions: REVIEW_ACTIONS.dead_data,
      });
    }

    // gap: 被读（consume）但从不产生（produce）。
    if (hasConsumer && !hasProducer) {
      findings.push({
        findingType: 'gap',
        severity: 'warning',
        entityId: ent.entityId,
        relatedNodes: ent.consumedBy,
        evidence: `数据实体 "${ent.canonicalName}" 被消费但全图无上游产生它（use-before-def）`,
        reviewActions: REVIEW_ACTIONS.gap,
      });
    }

    // boundary: 入度 0（无 producer/mutator=外部输入）或出度 0（无 consumer=最终输出）。
    const inDegree = ent.producedBy.length + ent.mutatedBy.length;
    const outDegree = ent.consumedBy.length;
    if (inDegree === 0 || outDegree === 0) {
      const kind = inDegree === 0 ? '外部输入（入边界）' : '最终输出（出边界）';
      findings.push({
        findingType: 'boundary',
        severity: 'warning',
        entityId: ent.entityId,
        relatedNodes: [...ent.producedBy, ...ent.mutatedBy, ...ent.consumedBy],
        evidence: `数据实体 "${ent.canonicalName}" 处于系统边界：${kind}`,
        reviewActions: REVIEW_ACTIONS.boundary,
      });
    }
  }

  // cycle: 投影图上的 SCC 大小 > 1。
  for (const scc of findCycles(ir)) {
    const dataNodes = scc.filter(id => entityMap.has(id));
    findings.push({
      findingType: 'cycle',
      severity: 'warning',
      entityId: dataNodes[0] ?? scc[0]!,
      relatedNodes: scc,
      evidence: `检出循环数据依赖（SCC 大小 ${scc.length}）：${scc.join(' → ')}`,
      reviewActions: REVIEW_ACTIONS.cycle,
    });
  }

  return { entities, findings };
}
