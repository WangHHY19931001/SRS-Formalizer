# SRS-Formalizer 编译器架构重构设计

**日期**: 2026-07-13  
**版本**: 1.0.0  
**基于 Issue**: [#3](https://github.com/WangHHY19931001/SRS-Formalizer/issues/3), [#4](https://github.com/WangHHY19931001/SRS-Formalizer/issues/4), [#5](https://github.com/WangHHY19931001/SRS-Formalizer/issues/5)  
**设计原则**: SRS → IR → 多目标产物，经典编译器三段式架构

---

## 1. 概述

### 1.1 目标

将当前 S0→S6 阶段式流水线重构为**显式编译器架构**（Frontend → Middle-end → Backend），使系统具备：

- **单一 IR** — 所有产物从同一个 `srs-ir.json` 生成，保证一致性
- **可组合后端** — 12 个 Emitter 独立读取 IR，新增输出格式不影响现有逻辑
- **确定性** — IR 构建后不可变，Emitter 为纯函数
- **可增量** — 局部 SRS 变更 → 局部 IR 重构建 → 受影响 Emitter 重发射

### 1.2 架构全景

```
SRS 文档 (.md/.html)
  │
  ▼
┌──────────────────────────────────────────────┐
│  FRONTEND (S0-S3 合并)                       │
│  Parse → Shard → Extract → Build IR          │
└──────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────┐
│  MIDDLE-END (IR → IR 变换)                   │
│  Structure → Semantic → NFR Tag → Connect →  │
│  Merge → Risk Score                          │
└──────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────┐
│  BACKEND (Emitter 注册表, 12 个)             │
│  Cypher · Gherkin · TLA · Lean · Fixture ·   │
│  Counterexample · Traceability · Coverage ·  │
│  BehaviorGraph · TlaGraph · LeanGraph ·      │
│  CrossGraph                                  │
└──────────────────────────────────────────────┘
  │
  ▼
输出产物 (Cypher, .feature, .tla, .lean, test_*.py, ...)
```

### 1.3 与现有架构对比

| 维度 | 当前 (S0-S6) | 编译器模型 |
|------|------|------|
| 中间表示 | 泛型 GraphData（非结构化 properties） | 强类型 SRSIR（枚举节点/边类型） |
| 输出生成 | 各阶段独立读取 graph.json | 所有 Emitter 读取同一个不可变 IR |
| 新增输出 | 选阶段插入，需理解完整流水线 | 实现新 Emitter，注册即可 |
| NFR 支持 | 无系统化支持 | IR 原生携带 nfrProfile + nfrThreshold |
| 跨文件引用 | 无 | IR 原生携带 crossRefs |
| 风险可见性 | 无 | IR 携带 riskScore + highRiskShards |
| 测试方式 | 测试阶段耦合 | IR 构建 + 每个 Emitter 独立测试 |

---

## 2. SRS-IR Schema

IR 是编译器的唯一事实来源。所有节点/边/元信息在此统一定义。

### 2.1 顶层结构

```typescript
interface SRSIR {
  version: '2.0.0';
  meta: IRMeta;
  nodes: IRNode[];
  edges: IREdge[];
  crossRefs: CrossRef[];
  nfrProfile: NFRProfile;
  gaps: IRGap[];
  glossary: IRGlossaryEntry[];
}
```

### 2.2 IRMeta

```typescript
interface IRMeta {
  sourcePath: string;
  sourceHash: string;
  language: 'zh' | 'en';
  totalChars: number;
  totalShards: number;
  totalNodes: number;
  totalEdges: number;
  buildTimestamp: string;
  riskScore?: number;
  highRiskShards?: string[];
}
```

### 2.3 IRNode

```typescript
interface IRNode {
  id: string;
  type: IRNodeType;
  module: string;
  labels: string[];
  properties: IRProperties;
  source: IRSource;
  analysis?: IRAnalysis;          // 中端填充
}

type IRNodeType =
  | 'requirement'
  | 'nfr'
  | 'architecture'
  | 'bdd_scenario'
  | 'tla_action'
  | 'tla_invariant'
  | 'lean_theorem'
  | 'lean_lemma';

interface IRProperties {
  statement?: string;
  category?: 'explicit' | 'implicit' | 'relational';
  confidence?: 'high' | 'medium' | 'low';
  nfrCategory?: NFRCategory;
  nfrThreshold?: NFRThreshold;
  archType?: 'Module' | 'Actor' | 'Constraint' | 'Component' | 'Interface';
  verificationMethod?: 'api_check' | 'ui_check' | 'db_check' | 'log_check' | 'output_check';
}

interface IRSource {
  filePath: string;
  startLine: number;
  endLine: number;
  shardId: string;
  chapter: string;
}

interface IRAnalysis {
  structure?: {
    orphan: boolean;
    islandId?: string;
    crossFileIsland: boolean;
  };
  semantic?: {
    duplicatePair?: string;
    conflictPair?: string;
    sameAspectCluster?: string;
  };
}

type NFRCategory =
  | 'performance'
  | 'security'
  | 'availability'
  | 'compatibility'
  | 'maintainability'
  | 'compliance';

interface NFRThreshold {
  metric: string;
  value: number;
  unit: string;
  operator: '<' | '<=' | '>' | '>=' | '==';
}
```

### 2.4 IREdge

```typescript
interface IREdge {
  id: string;
  source: string;
  target: string;
  type: IREdgeType;
  properties: IREdgeProperties;
}

type IREdgeType =
  | 'depends_on'
  | 'refines'
  | 'conflicts_with'
  | 'derived_from'
  | 'same_aspect'
  | 'contains'
  | 'nfr_impacts'
  | 'nfr_constrains'
  | 'cross_file_depends'
  | 'verifies'
  | 'implements'
  | 'proves'
  | 'traces_to';

interface IREdgeProperties {
  crossFileWeight?: number;
  confidence?: number;
  reasoning?: string;
  proposed?: boolean;            // 中端建议边
}
```

### 2.5 辅助类型

```typescript
interface CrossRef {
  sourceShard: string;
  targetShard: string;
  refType: 'heading_ref' | 'term_ref' | 'explicit_see' | 'implicit_dep';
  anchorText: string;
  confidence: number;
}

interface NFRProfile {
  detectedCategories: NFREntry[];
  weightedShards: NFRWeightedShard[];
  overallCoverage: number;
  blindSpots: NFRCategory[];
}

interface NFREntry {
  category: NFRCategory;
  keywordHits: number;
  shardIds: string[];
  nodeIds: string[];
}

interface NFRWeightedShard {
  shardId: string;
  nfrWeight: number;
  primaryCategory?: NFRCategory;
}

interface IRGap {
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  type: 'unsolved_issue' | 'undefined_term' | 'missing_reference' | 'incomplete_section' | 'cross_chapter_gap';
  description: string;
  sourceChapter: string;
}

interface IRGlossaryEntry {
  term: string;
  acronym?: string;
  definition: string;
  sourceShard: string;
  confidence: 'high' | 'medium' | 'low';
  category: 'domain_concept' | 'acronym' | 'technical_entity' | 'business_entity' | 'defined_term';
}
```

---

## 3. Frontend（前端）

**输入**: SRS 文档  
**输出**: `srs-ir.json`（不可变，无 LLM 依赖在 Pass 1/2/4）  
**LLM 参与**: 仅 Pass 3（guided-extract）

### 3.1 Pass 1: Parser

确定性。无 LLM。

| 组件 | 操作 | 功能 |
|------|:--:|------|
| `ChapterParser` (扩展) | 重写 | 章节层级树 + 12 个 NFR 关键词匹配（中英文） |
| `CrossRefDetector` | **新建** | 四种跨章引用模式：标题引用、术语引用、显式"参见§X"、隐式依赖 |
| `NFRScanner` | **新建** | 六类 NFR 关键词密度扫描，输出 `NFRProfile` |

### 3.2 Pass 2: Sharder

确定性。无 LLM。

| 组件 | 操作 | 功能 |
|------|:--:|------|
| `Sharder` | 重写 | 分片 + NFR 权重 + 跨章标注 + `cross_references` 边预生成 |

分片属性扩展：每个 shard 记录 `nfrWeight`（0-1）和与其有引用关系的邻接 shard。

### 3.3 Pass 3: Extractor

LLM 参与。扩展 `guided-extract` 支持类型。

| 提取类型 | 输出目录 | 说明 |
|------|------|------|
| R1-explicit | `2_extract/r1-explicit/` | 显式需求 |
| R2-implicit | `2_extract/r2-implicit/` | 隐式需求 |
| R3-relational | `2_extract/r3-relational/` | 关系需求 |
| **R3-cross** (新) | `2_extract/r3-cross/` | 跨分片关系二次扫描 |
| **R4-NFR** (新) | `2_extract/r4-nfr/` | NFR 专项提取 |
| Arch-1/2/3 | `2_extract/architecture/` | 架构分解（基础/增量/修正） |
| **Arch-4-NFR** (新) | `2_extract/architecture/` | NFR 架构节点 |

**动态架构轮次**: `RoundCalculator` 根据 `totalShards × crossRefCount` 自动输出 3-5 轮建议。

### 3.4 Pass 4: IR Builder

确定性。无 LLM。

```
build-ir 命令:
  1. 读取所有 JSONL (R1/R2/R3/R3-cross/R4-NFR/Arch-1-4)
  2. 按 id 去重
  3. 构建 IRNode[]: JsonlRecord → 强类型映射
  4. 构建 IREdge[]: metadata.relation/derived_from → 枚举边类型
  5. 合并 crossRefs, nfrProfile, gaps, glossary
  6. 完整性验证: 无悬挂引用, NFR 节点数 ≥ nfrProfile 预期值
  7. 输出 srs-ir.json
```

### 3.5 CLI

| 命令 | 说明 |
|------|------|
| `manifest --src <path> --lang zh/en --workdir <path>` | Pass 1+2: 分片 + 章节识别 + NFR scan |
| `guided-extract --type r1/r2/r3/r3-cross/r4-nfr/arch --workdir <path>` | Pass 3: 逐行提取 |
| `inject-prompt --template <path> --params '{}'` | 保持 |
| `build-ir --workdir <path>` | Pass 4: 组装 IR |

### 3.6 文件变更

| 操作 | 文件 | 行数 |
|------|------|:--:|
| **新建** | `types/srs-ir.ts` | 200 |
| **新建** | `lib/frontend/parser.ts` | 180 |
| **新建** | `lib/frontend/nfr-scanner.ts` | 120 |
| **新建** | `lib/frontend/cross-ref-detector.ts` | 180 |
| **新建** | `lib/frontend/sharder.ts` | 220 |
| **新建** | `lib/frontend/round-calculator.ts` | 80 |
| **新建** | `lib/frontend/builder.ts` | 250 |
| **新建** | `commands/build-ir.ts` | 160 |
| **新建** | `lib/frontend/nfr-keywords.ts` | 60 |
| 扩展 | `commands/guided-extract.ts` | +100 |
| 扩展 | `commands/manifest.ts` | +80 |
| 扩展 | `lib/chapter-parser.ts` | +30 |
| 淘汰 | `lib/sharder.ts` | — |

### 3.7 测试

| 文件 | 操作 | 行数 |
|------|:--:|:--:|
| `__tests__/frontend-parser.test.ts` | 新建 | 200 |
| `__tests__/frontend-builder.test.ts` | 新建 | 250 |
| `__tests__/srs-ir-types.test.ts` | 新建 | 180 |
| `__tests__/nfr-scanner.test.ts` | 新建 | 150 |
| `__tests__/cross-ref-detector.test.ts` | 新建 | 140 |
| `__tests__/sharder-nfr.test.ts` | 新建 | 120 |
| `__tests__/guided-extract.test.ts` | 扩展 | +80 |
| `__tests__/round-calculator.test.ts` | 新建 | 80 |

---

## 4. Middle-end（中端）

全部确定性算法。无 LLM 依赖。输入和输出都是 `srs-ir.json`（annotated）。

### 4.1 Pass 概述

| Pass | 组件 | 功能 |
|:--:|------|------|
| M1 | `StructureAnalyzer` | 孤立节点 · 悬挂边 · 概念孤岛 · 跨文件孤岛 |
| M2 | `SemanticAnalyzer` | Jaccard 重复检测 · 反义词冲突 · 同侧面聚类 |
| M3 | `NFRTagger` | NFR 节点自动分类 · 阈值正则提取 · 盲点检测 |
| M4 | `ConnectivityChecker` | 跨 shard 连通性图 · 孤岛修复建议 |
| M5 | `MergeOptimizer` | 子代理 verdict → 合并/冲突边/同侧面边 |
| M6 | `RiskScorer` | shard 遗漏风险 · NFR 覆盖缺口 · 综合评分 |

### 4.2 M1: Structure Analyzer

```
检测项:
  孤立节点:      出入度均为 0
  悬挂边:        边目标节点不存在
  概念孤岛:      无向图连通分量
  跨文件孤岛:    分属不同源文件且无连接链

输出: IR.nodes[].analysis.structure
```

### 4.3 M2: Semantic Analyzer

```
检测项:
  重复:          Jaccard > 0.7
  冲突:          反义词对 (包含/不包含, 必须/禁止)
  同侧面聚类:    同一动作 + 同一对象 + 无否定

NFR 隔离: NFR 节点不与业务需求混入同一聚类
```

### 4.4 M3: NFR Tagger

确定性 NFR 分类和阈值提取。

```
算法:
  for each node.type == 'requirement':
    category = detectNFRCategory(statement, IR.nfrProfile)  // 关键词+上下文
    threshold = extractNFRThreshold(statement)               // 正则提取数值
    if category:
      node.type = 'nfr'
      node.labels.push(`:NFR${capitalize(category)}`)
      node.properties.nfrCategory = category
      node.properties.nfrThreshold = threshold
```

阈值提取示例:

```
"接口响应时间 ≤ 200ms"      → { metric: 'response_time', value: 200, unit: 'ms', operator: '<=' }
"并发用户 ≥ 10000"          → { metric: 'max_users', value: 10000, unit: 'users', operator: '>=' }
"可用性 99.99%"             → { metric: 'uptime', value: 99.99, unit: '%', operator: '>=' }
```

### 4.5 M4: Connectivity Checker

```
算法:
  1. 构建 shard 邻接矩阵 (利用 IR.crossRefs)
  2. BFS 检测连通分量
  3. 不连通 shard 对:
     查找共有关键词 → 建议添加 cross_file_depends 边
  4. 输出: IR.edges[] 中追加建议边 (.proposed: true)
```

### 4.6 M5: Merge Optimizer

保持现有 `merge-analysis` 逻辑，操作对象从 `Graph` 改为 `SRSIR`。

```
操作:
  applyMergeNodes:           合并重复节点, 重连边
  applyAddConflictEdge:      添加 :CONFLICTS_WITH 边
  applyAddSameAspectEdge:    添加 :SAME_ASPECT 边
```

### 4.7 M6: Risk Scorer

```
风险因子:
  orphanRate        = orphans / totalNodes                       (权重 0.2)
  crossFileCoverage = connectedShards / totalShards              (权重 0.3)
  nfrCoverage       = detectedNFRCategories / 6                 (权重 0.3)
  gapWeight         = Σ(gap.priority→数值) / maxPossible        (权重 0.2)

  P0=4, P1=3, P2=2, P3=1

综合评分:
  riskScore = 1 - (crossFileCoverage*0.3 + nfrCoverage*0.3
                 + (1-orphanRate)*0.2 + (1-gapWeight)*0.2)

输出:
  IR.meta.riskScore          // 0-1, 越高越危险
  IR.meta.highRiskShards[]   // riskScore > 0.5 的 shard
```

### 4.8 CLI

```
# 全部 pass 串行
run-middle-end --workdir <path> [--passes M1,M3,M4]

# 逐个 pass
analyze-structure --workdir <path>
analyze-graph --workdir <path>
tag-nfr --workdir <path>
check-connectivity --workdir <path>
merge-analysis --workdir <path>
score-risk --workdir <path>
```

### 4.9 文件变更

| 操作 | 文件 | 行数 |
|------|------|:--:|
| **新建** | `lib/middle-end/structure-analyzer.ts` | 200 |
| **新建** | `lib/middle-end/semantic-analyzer.ts` | 250 |
| **新建** | `lib/middle-end/nfr-tagger.ts` | 220 |
| **新建** | `lib/middle-end/connectivity-checker.ts` | 180 |
| **新建** | `lib/middle-end/merge-optimizer.ts` | 180 |
| **新建** | `lib/middle-end/risk-scorer.ts` | 160 |
| **新建** | `commands/tag-nfr.ts` | 100 |
| **新建** | `commands/check-connectivity.ts` | 100 |
| **新建** | `commands/score-risk.ts` | 120 |
| 重写 | `commands/analyze-structure.ts` | 270 |
| 重写 | `commands/analyze-graph.ts` | 200 |
| 重写 | `commands/merge-analysis.ts` | 180 |

### 4.10 测试

| 文件 | 操作 | 行数 |
|------|:--:|:--:|
| `__tests__/middle-end-structure.test.ts` | 新建 | 180 |
| `__tests__/middle-end-semantic.test.ts` | 新建 | 200 |
| `__tests__/middle-end-nfr-tagger.test.ts` | 新建 | 200 |
| `__tests__/middle-end-connectivity.test.ts` | 新建 | 160 |
| `__tests__/middle-end-merge.test.ts` | 新建 | 160 |
| `__tests__/middle-end-risk.test.ts` | 新建 | 140 |
| `__tests__/middle-end-pipeline.test.ts` | 新建 | 150 |

---

## 5. Backend（Emitter 注册表）

所有 Emitter 从同一个 `srs-ir.json` 读取，纯函数，确定性。

### 5.1 Emitter 接口

```typescript
interface Emitter {
  readonly name: string;
  readonly description: string;
  readonly outputDir: string;
  emit(ir: SRSIR, workdir: string, options?: Record<string, unknown>): EmitResult;
}

interface EmitResult {
  files: string[];
  fileCount: number;
  metadata: Record<string, unknown>;
}
```

### 5.2 Emitter 清单

**图谱组 (4):**

| Emitter | 输出 | 条件 |
|------|------|:--:|
| `CypherEmitter` | `schema.cypher` | 必选 |
| `BehaviorGraphEmitter` | `behavior.cypher` + `behavior-graph.json` | 有 BDD 时 |
| `TlaGraphEmitter` | `tla-interaction.cypher` + `.json` | 有 TLA+ 时 |
| `LeanGraphEmitter` | `lean-proof.cypher` + `.json` | 有 Lean 4 时 |

**BDD 组 (1):**

| Emitter | 输出 | 条件 |
|------|------|:--:|
| `GherkinEmitter` | `<module>.feature` + `NFR<Category>.feature` | 必选 |

**形式化组 (2):**

| Emitter | 输出 | 条件 |
|------|------|:--:|
| `TLAEmitter` | `*.tla` 骨架 | NFR 触发 |
| `LeanEmitter` | `*.lean` 骨架 | NFR 触发 |

**V-Model 组 (3):**

| Emitter | 输出 | 条件 |
|------|------|:--:|
| `FixtureEmitter` | `test_*.py` / `*Test.java` / `*.spec.ts` | 选框架 |
| `CounterexampleEmitter` | `test_reproduce_*.py` | TLC 有 trace |
| `TraceabilityMatrixEmitter` | `traceability.md` / `traceability.cypher` | 必选 |

**验证组 (2):**

| Emitter | 输出 | 条件 |
|------|------|:--:|
| `CoverageEmitter` | `coverage-report.json` | 有 fixture |
| `CrossGraphEmitter` | `cross-graph-report.json` + `convergence-log.jsonl` | 必选 |

### 5.3 关键 Emitter 设计

#### GherkinEmitter

双重生成：

```
IR.requirement 节点 → <module>.feature     (按 module 分组)
IR.nfr 节点         → NFR<Category>.feature (含实际阈值)
```

NFR 场景模板示例:

```gherkin
Feature: NFR Performance

  Scenario: 接口响应时间不超过 200ms
    Given 系统负载低于 10000 个并发用户
    When 用户执行查询操作
    Then 响应时间应 ≤ 200 毫秒
    # verification_method: api_check
```

#### FixtureEmitter

```
options.framework: 'pytest' | 'junit' | 'cucumber' | 'playwright' | 'fast-check'
options.level:     'unit' | 'integration' | 'e2e' | 'nfr'
```

从 IR + .feature/.tla/.lean 源文件 → 对应框架测试代码。

#### TraceabilityMatrixEmitter

```markdown
| 需求 ID | 模块 | BDD Scenario | TLA+ Action | Lean Theorem | Fixture |
|---------|------|-------------|-------------|--------------|---------|
| R1-USER-0001 | 用户模块 | login.feature:3 | Login(user) | auth_correct | test_login.py |
```

### 5.4 Emitter 注册表

```typescript
// lib/emitters/registry.ts
import { CypherEmitter } from './cypher-emitter.js';
import { GherkinEmitter } from './gherkin-emitter.js';
// ... 其余 10 个

const REGISTRY: Record<string, Emitter> = {
  cypher: new CypherEmitter(),
  gherkin: new GherkinEmitter(),
  behaviorGraph: new BehaviorGraphEmitter(),
  tlaGraph: new TlaGraphEmitter(),
  leanGraph: new LeanGraphEmitter(),
  tlaSpec: new TLAEmitter(),
  leanProof: new LeanEmitter(),
  fixture: new FixtureEmitter(),
  counterexample: new CounterexampleEmitter(),
  traceabilityMatrix: new TraceabilityMatrixEmitter(),
  coverage: new CoverageEmitter(),
  crossGraph: new CrossGraphEmitter(),
};

export async function emitAll(
  ir: SRSIR, workdir: string, options?: EmitOptions
): Promise<EmitResult[]>

export async function emitGroup(
  ir: SRSIR, workdir: string, group: 'graphs' | 'bdd' | 'formal' | 'vmodel' | 'verify'
): Promise<EmitResult[]>
```

### 5.5 CLI

```
# 全部发射
emit-all --workdir <path>

# 按组
emit --group graphs --workdir <path>
emit --group bdd --workdir <path>
emit --group formal --workdir <path>
emit --group vmodel --workdir <path>
emit --group verify --workdir <path>

# 单个
emit --name cypher --workdir <path>
emit --name gherkin --workdir <path> --nfr-focus performance,security
emit --name fixture --workdir <path> --framework pytest --level nfr
```

### 5.6 文件变更

| 操作 | 文件 | 行数 |
|------|------|:--:|
| **新建** | `lib/emitters/types.ts` | 60 |
| **新建** | `lib/emitters/registry.ts` | 100 |
| **新建** | `lib/emitters/base-emitter.ts` | 80 |
| **新建** | `lib/emitters/cypher-emitter.ts` | 220 |
| **新建** | `lib/emitters/gherkin-emitter.ts` | 260 |
| **新建** | `lib/emitters/behavior-graph-emitter.ts` | 180 |
| **新建** | `lib/emitters/tla-graph-emitter.ts` | 160 |
| **新建** | `lib/emitters/lean-graph-emitter.ts` | 160 |
| **新建** | `lib/emitters/tla-emitter.ts` | 200 |
| **新建** | `lib/emitters/lean-emitter.ts` | 200 |
| **新建** | `lib/emitters/fixture-emitter.ts` | 280 |
| **新建** | `lib/emitters/counterexample-emitter.ts` | 150 |
| **新建** | `lib/emitters/traceability-emitter.ts` | 180 |
| **新建** | `lib/emitters/coverage-emitter.ts` | 160 |
| **新建** | `lib/emitters/cross-graph-emitter.ts` | 140 |
| **新建** | `lib/emitters/system-arch-emitter.ts` | 160 |
| **新建** | `commands/emit.ts` | 200 |

### 5.7 淘汰命令

以下 7 个命令从 `index.ts` 注册表中移除（文件保留不删）：

| 淘汰命令 | 替代 |
|------|------|
| `build-graph` | `build-ir` |
| `export-cypher` | `emit --name cypher` |
| `generate-bdd` | `emit --name gherkin` |
| `build-behavior-graph` | `emit --name behaviorGraph` |
| `build-tla-graph` | `emit --name tlaGraph` |
| `build-lean-graph` | `emit --name leanGraph` |
| `build-system-architecture` | `emit --name systemArch` |

### 5.8 测试

| 文件 | 操作 | 行数 |
|------|:--:|:--:|
| `__tests__/emitters-cypher.test.ts` | 新建 | 180 |
| `__tests__/emitters-gherkin.test.ts` | 新建 | 220 |
| `__tests__/emitters-tla.test.ts` | 新建 | 180 |
| `__tests__/emitters-lean.test.ts` | 新建 | 180 |
| `__tests__/emitters-fixture.test.ts` | 新建 | 250 |
| `__tests__/emitters-traceability.test.ts` | 新建 | 150 |
| `__tests__/emitters-coverage.test.ts` | 新建 | 140 |
| `__tests__/emitters-registry.test.ts` | 新建 | 150 |
| `__tests__/emitters-pipeline.test.ts` | 新建 | 200 |

---

## 6. 完整的 CLI 命令表

### 前端 (4)

| 命令 | 说明 |
|------|------|
| `manifest` | SRS 扫描分片 |
| `guided-extract` | 逐行提取 (R1/R2/R3/R3-cross/R4-NFR/Arch-1-4) |
| `inject-prompt` | 模板注入 |
| `build-ir` | 组装 IR |

### 中端 (6)

| 命令 | 说明 |
|------|------|
| `analyze-structure` | M1: 结构分析 |
| `analyze-graph` | M2: 语义分析 |
| `tag-nfr` | M3: NFR 标注 |
| `check-connectivity` | M4: 连通性检查 |
| `merge-analysis` | M5: 合并子代理判决 |
| `score-risk` | M6: 风险评分 |

### 后端 (2)

| 命令 | 说明 |
|------|------|
| `emit-all` | `emit-all --workdir <path>` |
| `emit` | `emit --group/--name <name> --workdir <path>` |

### 验证 (9)

| 命令 | 说明 |
|------|------|
| `validate-jsonl` | JSONL 校验 |
| `validate-architecture` | 架构 JSONL |
| `validate-glossary` | 术语表 |
| `validate-cypher` | Cypher 脚本 |
| `validate-bdd` | .feature (+NFR 规则) |
| `validate-tla` | SANY + TLC (+NFR 不变式) |
| `validate-lean` | lake build (+NFR 定理) |
| `validate-checklist` | CHECKLIST |
| `verify-gate` | 门禁 (S1/R3/FINAL + NFR) |
| `query-graph` | IR 查询 (+ --query nfr/risk) |

### 编译与打包 (6)

| 命令 | 说明 |
|------|------|
| `compile` | SKILL.md → SkIR |
| `pack-skill` | AES 备份 |
| `verify-skill-integrity` | 完整性校验 |
| `capability-probe` | 能力探测 (+NFR 触发) |
| `stability-test` | 跨 LLM 测试 |
| `generate-counterexample-fixtures` | 反例夹具 (接入) |

---

## 7. Prompt 文件变更

### 新建

| 文件 | 说明 |
|------|------|
| `prompts/executor-R3-cross.md` | 跨文件关系二次扫描 prompt |
| `prompts/executor-R4-NFR.md` | NFR 专项提取 prompt（含 6 类关键词） |
| `prompts/verifier-R3-cross.md` | R3-cross 验证 |
| `prompts/verifier-R4-NFR.md` | NFR 验证 |

### 扩展

| 文件 | 说明 |
|------|------|
| `prompts/executor-bdd.md` | +NFR 建模指南（边界值、降级路径、安全前置条件） |
| `prompts/executor-tlaplus.md` | +NFR 不变式指南（性能上界、安全不变量） |
| `prompts/executor-lean4.md` | +NFR 定理指南（时间上界、无泄漏） |
| `prompts/orchestrator_stage_S6.md` | +规模自适应策略 + NFR 收敛指引 |

---

## 8. 模板与数据文件

| 文件 | 操作 | 说明 |
|------|:--:|------|
| `templates/bdd-nfr-scenarios.json` | **新建** | 6 类 NFR × 3-5 个 Gherkin 场景骨架模板 |
| `lib/fixture-gen/nfr-tla-invariants.ts` | **新建** | NFR TLA+ 不变式模板 |
| `lib/fixture-gen/nfr-lean-theorems.ts` | **新建** | NFR Lean 4 定理模板 |
| `lib/fixture-gen/nfr-trigger-engine.ts` | **新建** | NFR 触发条件判定 |

---

## 9. 文档变更

| 文件 | 操作 | 说明 |
|------|:--:|------|
| `docs/DESIGN.md` | 扩展 | +"编译器架构" +"NFR 全流程处理" +"大型 SRS 处理指南" |
| `examples/large-srs-multifile/` | **新建** | 大型多文件 SRS walkthrough |
| `rules/project/coding/standards.md` | 扩展 | +NFR 边类型规范 + 跨文件引用命名 |
| `CLAUDE.md` | 重写 | 移除旧的 S0-S6 阶段描述，更新为编译器模型 |
| `AGENTS.md` | 更新 | 更新命令数 + 架构描述 + 工作目录约定 |
| `README.md` | 扩展 | +编译器架构图 + NFR 支持说明 |

---

## 10. 文件变更总表

| 操作 | 计数 |
|------|:--:|
| 新建源文件 | 26 |
| 新建测试文件 | 25 |
| 重写/扩展源文件 | 18 |
| 扩展测试文件 | 1 |
| 新建/扩展 prompt | 8 |
| 新建模板/数据文件 | 4 |
| 淘汰命令（从注册表移除） | 7 |
| 新建 examples 目录 | 1 |

---

## 11. 测试计划

### 11.1 预估规模

| 阶段 | 新建 | 扩展 | 新增行数 |
|------|:--:|:--:|:--:|
| IR 类型 | 1 | 0 | 180 |
| Frontend | 8 | 1 | 1200 |
| Middle-end | 7 | 0 | 1190 |
| Backend | 9 | 0 | 1650 |
| **总计** | **25** | **1** | **~4220** |

### 11.2 目标

- 现有测试数: ~342
- 新增测试数: ~400
- 目标总计: **~740 tests, 0 failures**

### 11.3 关键测试场景

1. **IR 不可变性**: 构建后 IR → 所有 Emitter 读取 → 确认 IR 未被修改
2. **全 Emitter 串行**: `emitAll` → 验证 12 个 Emitter 无冲突
3. **NFR 端到端**: SRS(含性能/安全需求) → IR(NFR nodes) → Gherkin(NFR scenarios) → Fixture(NFR tests)
4. **大型 SRS**: 100+ shard → 动态架构轮次 → 规模自适应收敛 → 风险评分
5. **跨文件引用**: 3 个 SRS 文件 → crossRefs → 连通性检查 → 孤岛修复

---

## 12. 实现顺序

### Phase 1 (IR + Frontend)

1. `types/srs-ir.ts` — IR 类型定义
2. `lib/frontend/` — Parser, Sharder, NFRScanner, CrossRefDetector
3. `commands/build-ir.ts` — CLI
4. `commands/manifest.ts`, `guided-extract.ts` — 扩展
5. 前端测试 (8+1 文件)

### Phase 2 (Middle-end)

6. `lib/middle-end/` — 6 个分析器
7. `commands/` — tag-nfr, check-connectivity, score-risk
8. 重写 analyze-structure, analyze-graph, merge-analysis
9. 中端测试 (7 文件)

### Phase 3 (Backend)

10. `lib/emitters/types.ts`, `registry.ts`, `base-emitter.ts`
11. 12 个 Emitter 实现
12. `commands/emit.ts` + `commands/emit-all.ts`
13. 淘汰 7 个旧命令的 CLI 注册
14. 后端测试 (9 文件)

### Phase 4 (Prompt + 模板 + 文档)

15. 8 个 prompt 文件 (新建 4 + 扩展 4)
16. 4 个模板/数据文件
17. docs/DESIGN.md, README.md, CLAUDE.md, AGENTS.md 更新
18. examples/large-srs-multifile/

### Phase 5 (集成验证)

19. `npm run typecheck` — 0 errors
20. `npm test` — ~740 tests, 0 failures
21. 端到端 walkthrough：i18n SRS → IR → Cypher + Gherkin + TLA + Lean + Fixtures + Matrix

---

## 13. 回退策略

- 所有淘汰的 `build-*.ts` / `export-cypher.ts` / `generate-bdd.ts` 文件保留在磁盘，仅从 `index.ts` COMMANDS 注册表中移除
- 如需回退，恢复注册表即可
- IR 格式通过 `version` 字段区分，旧版 `graph.json` 仍可被 `query-graph` 读取

---

## 14. 关键设计约束（继承自现有 AGENTS.md）

- 零运行时 npm 依赖
- Strict TypeScript, 0 `any`
- Max 300 lines/file
- `path.join()` only
- Poison values rejected at CLI entry
- `refuseDirectInvocation` guard on all commands
- CLI output: JSON to stdout, status: ok/error
- Commit: Conventional Commits + Co-Authored-By
