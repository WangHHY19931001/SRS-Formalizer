# SRS-IR Schema 权威参考

> **本文件是 SRS-IR schema 的权威参考**，Agent 构建/校验 IR 时依据此文档。详细规范见 `docs/DESIGN.md` §5。
>
> SRS-IR 是核心数据结构。Agent 产出的 JSONL 经 `assemble-ir` 装配后必须符合此 schema。IR 版本号为 `2.1.0`（向后兼容 `2.0.0`，新增数据流节点/边），区别于旧版 `graph.json`。`assemble-ir` 产出 `2.1.0`；校验接受 `2.0.0` 与 `2.1.0`。

---

## 1. 顶层结构

```typescript
interface SRSIR {
  version: '2.0.0' | '2.1.0';
  meta: IRMeta;
  nodes: IRNode[];
  edges: IREdge[];
  crossRefs: CrossRef[];
  nfrProfile: NFRProfile;
  gaps: IRGap[];
  glossary: IRGlossaryEntry[];
}
```

---

## 2. 节点（IRNode）

```typescript
interface IRNode {
  id: string;
  type: IRNodeType;
  module: string;
  labels: string[];
  properties: IRProperties;
  source: IRSource;
  analysis?: IRAnalysis;
}

type IRNodeType =
  | 'requirement' | 'nfr' | 'architecture'
  | 'bdd_scenario' | 'tla_action' | 'tla_invariant'
  | 'lean_theorem' | 'lean_lemma'
  | 'data_entity';  // 数据流分析（2.1.0），Frontend 抽取阶段写入

interface IRProperties {
  statement?: string;
  category?: 'explicit' | 'implicit' | 'relational';
  confidence?: 'high' | 'medium' | 'low';
  nfrCategory?: NFRCategory;
  nfrThreshold?: NFRThreshold;
  archType?: 'Module' | 'Actor' | 'Constraint' | 'Component' | 'Interface';
}

type NFRCategory =
  | 'performance' | 'security' | 'availability'
  | 'compatibility' | 'maintainability' | 'compliance';

interface NFRThreshold {
  metric: string;  value: number;  unit: string;
  operator: '<' | '<=' | '>' | '>=' | '==';
}

interface IRSource {
  filePath: string;  startLine: number;  endLine: number;
  shardId: string;   chapter: string;
}

interface IRAnalysis {
  structure?: { orphan: boolean; islandId?: string; crossFileIsland: boolean; };
  semantic?: { duplicatePair?: string; conflictPair?: string; sameAspectCluster?: string; };
}
```

### 2.1 IRNodeType 枚举说明

| 类型 | 用途 |
|------|------|
| `requirement` | 显式/隐式/关系型需求节点 |
| `nfr` | 非功能性需求节点 |
| `architecture` | 架构节点（Module/Actor/Constraint/Component/Interface） |
| `bdd_scenario` | BDD 场景节点 |
| `tla_action` | TLA+ Action 节点 |
| `tla_invariant` | TLA+ 不变式节点 |
| `lean_theorem` | Lean 4 定理节点 |
| `lean_lemma` | Lean 4 引理节点 |
| `data_entity` | 数据实体节点（2.1.0）：数据流分析的对象（Order/Token/库存余额…），Frontend 抽取阶段写入 |

### 2.2 NFRCategory 枚举

全系统唯一的六类 NFR 分类：`performance`、`security`、`availability`、`compatibility`、`maintainability`、`compliance`。SRS-IR 枚举、BDD 模板、TLA+ 不变式、Lean 定理、门禁与报告均只能使用这六项。`reliability`、`observability` 等术语可作为别名或映射信号，但不得成为独立类别。

---

## 3. 边（IREdge）

```typescript
interface IREdge {
  id: string;  source: string;  target: string;
  type: IREdgeType;
  properties: IREdgeProperties;
}

type IREdgeType =
  | 'depends_on' | 'refines' | 'conflicts_with' | 'derived_from'
  | 'same_aspect' | 'contains'
  | 'nfr_impacts' | 'nfr_constrains' | 'cross_file_depends'
  | 'verifies' | 'implements' | 'proves' | 'traces_to'
  | 'produces' | 'consumes' | 'mutates';  // 数据流边（2.1.0），方向 requirement → data_entity

interface IREdgeProperties {
  crossFileWeight?: number;  confidence?: number;  reasoning?: string;
  /** check-connectivity 建议的桥接边，用于连接孤岛节点 */
  proposed?: boolean;
}
```

### 3.1 IREdgeType 枚举说明

| 类型 | 语义 |
|------|------|
| `depends_on` | 依赖关系 |
| `refines` | 细化关系 |
| `conflicts_with` | 冲突关系 |
| `derived_from` | 派生关系 |
| `same_aspect` | 同侧面聚类关系 |
| `contains` | 包含关系 |
| `nfr_impacts` | NFR 影响关系 |
| `nfr_constrains` | NFR 约束关系 |
| `cross_file_depends` | 跨文件依赖 |
| `verifies` | 验证关系 |
| `implements` | 实现关系 |
| `proves` | 证明关系 |
| `traces_to` | 追溯关系 |
| `produces` | 数据流（2.1.0）：需求产生数据实体，source=requirement → target=data_entity |
| `consumes` | 数据流（2.1.0）：需求读取数据实体，source=requirement → target=data_entity |
| `mutates` | 数据流（2.1.0）：需求改写数据实体，source=requirement → target=data_entity |

### 3.2 引用完整性约束

`validate-semantics` 校验：`source`/`target` 必须在 `nodes[]` 中存在（无悬挂边）。

---

## 4. 辅助类型

### 4.1 IRMeta

```typescript
interface IRMeta {
  sourcePath: string;  sourceHash: string;  language: 'zh' | 'en';
  totalChars: number;  totalShards: number;
  totalNodes: number;  totalEdges: number;
  buildTimestamp: string;
  riskScore?: number;  highRiskShards?: string[];
}
```

`buildTimestamp` 必须非空（`assemble-ir` 完整性验证项）。

### 4.2 CrossRef

```typescript
interface CrossRef {
  sourceShard: string;  targetShard: string;
  refType: 'heading_ref' | 'term_ref' | 'explicit_see' | 'implicit_dep';
  anchorText: string;  confidence: number;
}
```

### 4.3 NFRProfile

```typescript
interface NFRProfile {
  detectedCategories: NFREntry[];
  weightedShards: NFRWeightedShard[];
  overallCoverage: number;
  blindSpots: NFRCategory[];
}

interface NFREntry {
  category: NFRCategory;  keywordHits: number;
  shardIds: string[];     nodeIds: string[];
}

interface NFRWeightedShard {
  shardId: string;  nfrWeight: number;  primaryCategory?: NFRCategory;
}
```

`blindSpots` 记录六类中未覆盖到的 NFR 类别。

### 4.4 IRGap

```typescript
interface IRGap {
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  type: 'unsolved_issue' | 'undefined_term' | 'missing_reference'
      | 'incomplete_section' | 'cross_chapter_gap';
  description: string;  sourceChapter: string;
}
```

### 4.5 IRGlossaryEntry

```typescript
interface IRGlossaryEntry {
  term: string;  acronym?: string;  definition: string;
  sourceShard: string;  confidence: 'high' | 'medium' | 'low';
  category: 'domain_concept' | 'acronym' | 'technical_entity'
          | 'business_entity' | 'defined_term';
}
```

---

## 5. IR 不可变性契约

- Frontend `assemble-ir` 生成 IR 后，文件只读写入，不再修改
- Middle-end M3/M5/M6 读取 IR 并产生带 `analysis`/`nfrProfile`/`meta.riskScore` 标注的更新版本
- Backend Agent 以纯读方式读取 IR 生成产物
- IR 版本号 `2.1.0`（向后兼容 `2.0.0`）区别于旧版 `graph.json`
- **数据流节点/边（`data_entity` + `produces`/`consumes`/`mutates`，2.1.0）由 Frontend F4e 抽取**：Agent 经 `executor-frontend-dataflow.md` 产出 `2_extract/data-entities/*.jsonl`（entity/flow 记录），`assemble-ir` 消费并按 canonical 归一为 `data_entity` 节点 + 数据流边写入 IR。Middle-end M1.5 `analyze-dataflow` 只读消费、只写 `3_graph/analysis/dataflow.json`，不修改 IR（对齐 ADR-0009）

### 5.1 Middle-end 对 IR 的修改范围

| 阶段 | 修改字段 | 说明 |
|------|----------|------|
| M3 | `nfrProfile` | NFR 节点分类、阈值提取、盲点检测写回 |
| M5 | `edges` | 子代理冲突判决后合并/标记冲突边/同侧面边 |
| M6 | `meta.riskScore`、`meta.highRiskShards` | 按风险公式计算写回 |

Backend 阶段 Agent 以纯读方式消费 IR，不得修改。

---

## 6. 数据流抽取记录（Frontend F4e，spec 2026-07-21 / ADR-0009）

Agent 在 F4e 产出 `2_extract/data-entities/*.jsonl`，每行一条判别联合记录。`assemble-ir` 校验（`validateDataFlowRecords`）后按 canonical 归一转为 `data_entity` 节点 + 数据流边。校验命令：`validate-dataflow --file <path> --workdir .srs_formalizer`。

```typescript
type DataFlowRecord = DataEntityRecord | DataFlowLinkRecord;

interface DataEntityRecord {
  kind: 'entity';
  id: string;            // DE-<slug>，小写 slug（如 DE-order）
  canonical: string;     // 归一规范名；相同 canonical 的 entity 合并为一个节点
  aliases?: string[];    // 别名（进节点 labels，供下游检索）
  source_shard: string;  // SNNN
}

interface DataFlowLinkRecord {
  kind: 'flow';
  requirement_id: string;  // 真实需求 id R[123]-<mod>-NNNN（边的 source）
  entity_id: string;       // 指向已声明 DataEntityRecord.id（边的 target）
  action: 'produces' | 'consumes' | 'mutates';  // 边类型
  source_shard: string;    // SNNN
}
```

**装配规则**：
- 边方向统一 `requirement → data_entity`；边 id 形如 `DF-0001`
- canonical 归一：相同 `canonical` 的多个 entity 合并为一个节点，保留首个记录 id，aliases 汇总
- 归一后重复的 `(requirement_id, action, 节点)` 三元组去重
- `flow.entity_id` 悬挂（未声明）→ 校验 FAIL；`flow.requirement_id` 不存在于装配后节点 → 完整性校验悬挂边 FAIL
- 缺失 `data-entities/` → IR 无数据流，`analyze-dataflow` 降级为空 findings（不报错）
