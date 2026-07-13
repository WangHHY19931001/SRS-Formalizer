# SRS-Formalizer 设计文档

> **版本**: 1.0.0 | **日期**: 2026-07-13 | **状态**: Active
>
> 本文档是 srs-formalizer 技能开发的**唯一事实依据**（Single Source of Truth）。
> 所有设计决策、架构约束、规则合规、评估结果均记录于此。
> 代码变更必须首先更新本文档；本文档与代码不一致时，以本文档为准。

---

## 1. 概述

### 1.1 技能定义

| 属性 | 值 |
|------|-----|
| 名称 | `srs-formalizer` |
| 类型 | `framework`（基础框架型技能） |
| 主模式 | `compiler`（编译器三段式） |
| 领域 | `formal-methods` |
| 安全等级 | `high` |
| HITL | 强制 |
| 版本 | 1.0.0（语义化版本） |

### 1.2 核心能力

将 **SRS（软件需求规格说明）** 文档转化为形式化产出，采用编译器模型（Frontend → Middle-end → Backend）：

| 产出 | 格式 | 发射器 | 触发条件 |
|------|------|------|----------|
| 需求知识图谱 | Neo4j Cypher | CypherEmitter | 必选 |
| BDD 测试骨架 | Gherkin `.feature` | GherkinEmitter | 必选 |
| TLA+ 形式化规约 | `.tla` | TLAEmitter | NFR 触发（并发/性能关键词） |
| Lean 4 定理证明 | `.lean` | LeanEmitter | NFR 触发（安全关键/合规关键词） |
| 测试夹具 | pytest/JUnit/Cucumber/Playwright/fast-check | FixtureEmitter | 可选（选框架） |
| 追溯矩阵 | Markdown / Cypher | TraceabilityMatrixEmitter | 必选 |
| 覆盖率报告 | JSON | CoverageEmitter | 有 fixture 时 |

### 1.3 何时不该使用

- 无 SRS 文档或需求规格说明时
- 纯代码审查/调试场景
- 非技术文档（营销文案、法律条款、合同）
- 用户仅需代码生成时

---

## 2. 架构设计

### 2.1 编译器三阶段架构

受 SkCC (arXiv:2605.03353) 启发，本技能采用经典编译器三段式架构：

```
SRS 文档 (.md/.html)
  │
  ▼
┌──────────────────────────────────────────────────┐
│  FRONTEND (Parse → Shard → Extract → Build IR)   │
│  输出: srs-ir.json (不可变, 强类型)               │
└──────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────┐
│  MIDDLE-END (IR → IR 变换, 6 passes)             │
│  Structure → Semantic → NFR Tag → Connect →      │
│  Merge → Risk Score                              │
└──────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────┐
│  BACKEND (Emitter 注册表, 12 个)                 │
│  Cypher · Gherkin · TLA · Lean · Fixture ·       │
│  Counterexample · Traceability · Coverage ·      │
│  BehaviorGraph · TlaGraph · LeanGraph ·          │
│  CrossGraph                                      │
└──────────────────────────────────────────────────┘
  │
  ▼
输出产物 (Cypher, .feature, .tla, .lean, test_*.py, ...)
```

**核心设计原则**:

| 原则 | 说明 |
|------|------|
| **单一 IR** | 所有产物从同一个 `srs-ir.json` 生成，保证一致性 |
| **前端/后端解耦** | 新增输出格式只需实现新 Emitter，不影响现有逻辑 |
| **IR 不可变** | 前端构建后 IR 只读，Emitter 为纯函数 |
| **O(m+n) 复杂度** | m 个输入源 + n 个 Backend Emitter |
| **可增量** | 局部 SRS 变更 → 局部 IR 重建 → 受影响 Emitter 重发射 |

### 2.2 与传统七阶段映射

| 编译器阶段 | 对应原阶段 | CLI |
|:----:|:--:|------|
| **Frontend** | S0-S3 | `manifest` → `guided-extract` → `build-ir` |
| **Middle-end** | S3 分析 | `analyze-structure` → `analyze-graph` → `tag-nfr` → `check-connectivity` → `merge-analysis` → `score-risk` |
| **Backend** | S4-S6 | `emit --group graphs\|bdd\|formal\|vmodel\|verify` |

### 2.3 设计模式

```
主模式: compiler
├── Inversion  @Frontend — 信息不全不进入 IR 构建，强制 interview
├── Generator  @Frontend — 零自由度填空模板，禁止增减字段
├── Reviewer   @Middle-end — 结构/语义/NFR 分析 passes
└── Emitter    @Backend  — 统一 Emitter 接口，纯函数 IR → 产物
```

### 2.4 渐进式披露（Progressive Disclosure）

| 级别 | 内容 | Token | 加载时机 |
|:----:|------|-------|----------|
| L1 | name + description | ~100 | 启动时加载 |
| L2 | SKILL.md 正文 | ≤5,000 | 技能激活时 |
| L3 | references/ + templates/ + prompts/ | 按需 | 指令明确要求时 |

### 2.5 提示词类型与角色

| 类型 | 数量 | 角色 | 约束 |
|------|:----:|------|------|
| **编排者** (Orchestrator) | 7 | 阶段级决策者：执行 CLI、分派子代理 | 技能完整性校验先于每阶段转换 |
| **执行者** (Executor) | 13 | 模板填充者：结构化输入 → 结构化 JSONL | 禁止增减字段、编造数据 |
| **执行者-领域** (Executor-Domain) | 3 | BDD/TLA+/Lean 4 领域专家 | 注入完整专家人设 |
| **验证者** (Verifier) | 8 | 独立审查者：新会话中逐项核验 | 强制新会话、禁止信任执行者报告 |
| **调试** (Debug) | 2 | 被动诊断：TLA+/Lean 构建失败时触发 | 不修改源代码，仅输出诊断报告 |

---

## 3. 设计决策

### 3.1 核心约束

| # | 决策 | 原因 |
|:--:|------|------|
| 1 | **零运行时 npm 依赖** | 技能自包含，不引入供应链风险 |
| 2 | **TypeScript strict** | `strict`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch` |
| 3 | **TS 只做确定性转换** | 不调用 LLM、不产生随机数、不依赖外部 API |
| 4 | **所有文件操作限定工作目录** | `.srs_formalizer/` 内，路径安全双校验 |
| 5 | **所有 CLI 经 index.ts** | `refuseDirectInvocation` 阻止绕过 |
| 6 | **统一错误处理** | `try/catch → { status, message }`，不抛异常 |
| 7 | **毒值拒绝** | `undefined/null/NaN/[object Object]` 入口拦截 |
| 8 | **文件大小** | ≤300 行（当前最大 283） |
| 9 | **禁止 `any`** | 所有错误类型用 `unknown` + `instanceof Error` |
| 10 | **`path.join()` 强制** | 禁止字符串拼接路径 |
| 11 | **`init` 用 `--output`，其余用 `--workdir`** | `validateWorkDir` 强制 `.srs_formalizer` 命名 |

### 3.2 为什么选编译器模型

受 SkCC 启发，srs-formalizer 本质上是 SRS → IR → 多目标产物的编译过程：

- **单一 IR**: `srs-ir.json` 承载所有语义信息
- **确定性**: IR 不可变，Emitter 为纯函数
- **可扩展**: 新增输出格式只需实现新 Emitter 并注册
- **可增量**: 局部 SRS 变更 → 局部 IR 重建 → 受影响 Emitter 重发射

### 3.3 为什么 NFR 条件触发 TLA+/Lean 4

| NFR 类别 | 触发条件 | 强制产物 |
|------|------|:--:|
| performance 关键词 ≥5 且 total_shards ≥100 | 高并发/分布式 | 强制 TLA+ |
| security/compliance 关键词 ≥1 | 安全关键 | 强制 Lean 4 |
| availability 关键词 ≥3 | 高可用 | 建议 TLA+ |

不适用时 Emitter 自动跳过。

---

## 4. SRS-IR Schema

SRS-IR 是编译器架构的单一事实来源。所有节点/边/元信息在此统一定义。

### 4.1 顶层结构

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

### 4.2 节点

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
  | 'lean_theorem' | 'lean_lemma';

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

### 4.3 边

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
  | 'verifies' | 'implements' | 'proves' | 'traces_to';

interface IREdgeProperties {
  crossFileWeight?: number;  confidence?: number;  reasoning?: string;
}
```

### 4.4 辅助类型

```typescript
interface IRMeta {
  sourcePath: string;  sourceHash: string;  language: 'zh' | 'en';
  totalChars: number;  totalShards: number;
  totalNodes: number;  totalEdges: number;
  buildTimestamp: string;
  riskScore?: number;  highRiskShards?: string[];
}

interface CrossRef {
  sourceShard: string;  targetShard: string;
  refType: 'heading_ref' | 'term_ref' | 'explicit_see' | 'implicit_dep';
  anchorText: string;  confidence: number;
}

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

interface IRGap {
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  type: 'unsolved_issue' | 'undefined_term' | 'missing_reference'
      | 'incomplete_section' | 'cross_chapter_gap';
  description: string;  sourceChapter: string;
}

interface IRGlossaryEntry {
  term: string;  acronym?: string;  definition: string;
  sourceShard: string;  confidence: 'high' | 'medium' | 'low';
  category: 'domain_concept' | 'acronym' | 'technical_entity'
          | 'business_entity' | 'defined_term';
}
```

### 4.5 IR 不可变性契约

- 前端 `build-ir` 生成 IR 后，文件只读写入，不再修改
- 中端 passes 读取 IR 并产生带 `analysis` 标注的副本
- 所有 Backend Emitter 以纯函数形式读取 IR
- IR 版本号 `2.0.0` 区别于旧版 `graph.json`

---

## 5. Frontend（前端）

**输入**: SRS 文档  
**输出**: `srs-ir.json`（不可变）  
**LLM 参与**: 仅 Pass 3（guided-extract）

### 5.1 Pass 1: Parser（确定性）

| 组件 | 功能 |
|------|------|
| `ChapterParser` | 章节层级树 + 12 个 NFR 关键词匹配（中英文） |
| `CrossRefDetector` | 四种跨章引用模式：标题引用、术语引用、显式"参见§X"、隐式依赖 |
| `NFRScanner` | 六类 NFR 关键词密度扫描，输出 `NFRProfile` |

### 5.2 Pass 2: Sharder（确定性）

递归分片：`MAX_SHARD_LINES = 200`。按章节标题分割，无标题时按段落回退。每个 shard 记录 `nfrWeight`（0-1）和邻接 shard 引用关系。

### 5.3 Pass 3: Extractor（LLM 参与）

| 提取类型 | 说明 |
|------|------|
| R1-explicit | 显式需求 |
| R2-implicit | 隐式需求 |
| R3-relational | `R3-` | 关系需求 |
| **R3-cross** (★) | `R3C-` | 跨分片关系二次扫描 |
| **R4-NFR** (★) | `R4N-` | NFR 专项提取 |
| Arch-1/2/3 | — | 架构分解（基础/增量/修正） |
| **Arch-4-NFR** (★) | — | NFR 架构节点 |

**动态架构轮次**: 根据 `totalShards` 输出：<50 → 3 轮，50-99 → 4 轮，≥100 → 5 轮。`crossRefCount > 50` → +1 轮。

### 5.4 Pass 4: IR Builder（确定性）

1. 读取所有 JSONL → 去重 → 构建 `IRNode[]` + `IREdge[]`
2. 合并 `crossRefs`、`nfrProfile`、`gaps`、`glossary`
3. 完整性验证（`validateIR`）：版本号 `2.0.0`、无悬挂边（`source`/`target` 必须在 `nodes[]` 中存在）、`buildTimestamp` 非空。不通过则 `build-ir` 返回 error。
4. 输出 `srs-ir.json`（存储在 workdir 根目录）

**IR 不可变性**：`build-ir` 生成 IR 后不再修改。中端 passes 和 Backend Emitter 只读。

### 5.5 CLI

| 命令 | 说明 |
|------|------|
| `manifest --src <path> --lang zh/en --workdir <path>` | Pass 1+2 |
| `guided-extract --type r1/r2/r3/r3-cross/r4-nfr/arch --workdir <path>` | Pass 3 |
| `inject-prompt --template <path> --params '{}'` | 模板注入 |
| `build-ir --workdir <path>` | Pass 4 |

---

## 6. Middle-end（中端）

全部确定性算法。无 LLM 依赖。输入和输出都是 `srs-ir.json`（annotated）。

| Pass | 组件 | 功能 |
|:--:|------|------|
| M1 | Structure Analyzer | 孤立节点 · 悬挂边 · 概念孤岛 · **跨文件孤岛** |
| M2 | Semantic Analyzer | Jaccard 重复检测 · 反义词冲突 · 同侧面聚类 |
| M3 | NFR Tagger (★) | NFR 节点自动分类 · 阈值正则提取（"≤200ms" → `{metric, value, unit, operator}`）· 盲点检测 |
| M4 | Connectivity Checker (★) | 跨 shard 连通性图 · 孤岛修复建议边 |
| M5 | Merge Optimizer | 子代理 verdict → 合并/冲突边/同侧面边 |
| M6 | Risk Scorer (★) | 风险因子：orphanRate(×0.2) + crossFileCoverage(×0.3) + nfrCoverage(×0.3) + gapWeight(×0.2) |

### 6.1 NFR 阈值提取（正则 + 启发式）

六类 NFR 各 5 个正则模式，含启发式回退。例如性能类：
```
/响应时间\s*[≤<=]\s*(\d+\.?\d*)\s*(ms|毫秒)/          → {metric:'response_time', ...}
/latency\s*[≤<=]\s*(\d+\.?\d*)\s*(ms|seconds?)/i     → {metric:'latency', ...}
/within\s+(\d+\.?\d*)\s*(ms|milliseconds?)/i          → 启发式回退
```

正则优先 → 未匹配则尝试启发式 → 仍未匹配则跳过（不报错，LLM 后续填充）。

### 6.2 NFR 检测关键词

| NFR 类别 | 中文关键词 | 英文关键词 |
|------|------|------|
| performance | 响应时间、延迟、吞吐、并发、性能 | latency, throughput, response time, concurrent |
| security | 安全、加密、认证、授权、防攻击 | encrypt, authentication, authorize, prevent |
| availability | 可用性、容错、冗余、恢复、高可用 | uptime, availability, fault, recovery, redundant |
| compatibility | 兼容、适配、浏览器、操作系统 | compatible, browser, platform, OS |
| maintainability | 可维护、扩展、模块化、可配置 | maintainable, extensible, modular, configurable |
| compliance | 合规、GDPR、PCI、审计、监管 | compliance, GDPR, PCI, audit, regulatory |

### 6.2 CLI

| 命令 | Pass | 说明 |
|------|:--:|------|
| `analyze-structure` | M1 | 结构分析 |
| `analyze-graph` | M2 | 语义分析 |
| `tag-nfr` (★) | M3 | NFR 标注 |
| `check-connectivity` (★) | M4 | 连通性检查 |
| `merge-analysis` | M5 | 合并子代理判决 |
| `score-risk` (★) | M6 | 风险评分 |

---

## 7. Backend（后端）

### 7.1 Emitter 接口

```typescript
interface Emitter {
  readonly name: string;
  readonly description: string;
  readonly outputDir: string;
  emit(ir: SRSIR, workdir: string, options?: Record<string, unknown>): EmitResult;
}

interface EmitResult {
  files: string[];  fileCount: number;
  metadata: Record<string, unknown>;
}
```

### 7.2 Emitter 清单（12 个）

**图谱组 (4)**:

| Emitter | 输出 | 条件 |
|------|------|:--:|
| `CypherEmitter` | `schema.cypher` | 必选 |
| `BehaviorGraphEmitter` | `behavior.cypher` + `.json` | 有 BDD |
| `TlaGraphEmitter` | `tla-interaction.cypher` + `.json` | 有 TLA+ |
| `LeanGraphEmitter` | `lean-proof.cypher` + `.json` | 有 Lean 4 |

**BDD 组 (1)**:

| Emitter | 输出 | 说明 |
|------|------|------|
| `GherkinEmitter` | `<module>.feature` + `NFR<Category>.feature` | 必选。NFR 场景含实际阈值 |

**形式化组 (2)**:

| Emitter | 输出 | 条件 |
|------|------|:--:|
| `TLAEmitter` | `*.tla` 骨架 | NFR 触发 |
| `LeanEmitter` | `*.lean` 骨架 | NFR 触发 |

**V-Model 组 (3)**:

| Emitter | 输出 | 条件 |
|------|------|:--:|
| `FixtureEmitter` | `test_*.py` / `*Test.java` / `*.spec.ts` | 选框架 |
| `CounterexampleEmitter` | `test_reproduce_*.py` | TLC trace |
| `TraceabilityMatrixEmitter` | `traceability.md` / `traceability.cypher` | 必选 |

**验证组 (2)**:

| Emitter | 输出 | 条件 |
|------|------|:--:|
| `CoverageEmitter` | `coverage-report.json` | 有 fixture |
| `CrossGraphEmitter` | `cross-graph-report.json` + `convergence-log.jsonl` | 必选 |

### 7.3 CLI

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

### 7.4 编译器复杂度

```
未引入 IR:  m 个输入 × n 个输出 = O(m×n)
引入 IR 后: m 个输入 → IR + n 个 Emitter = O(m+n)
```

---

## 8. CLI 命令清单

### 8.1 前端 (4)

| 命令 | 说明 |
|------|------|
| `manifest` | SRS 扫描分片 + 章节识别 + NFR 扫描 + 跨章引用 |
| `guided-extract` | 逐行提取 (R1/R2/R3/R3-cross/R4-NFR/Arch-1-4) |
| `inject-prompt` | 模板参数注入 |
| `build-ir` | 组装 SRS-IR |

### 8.2 中端 (6)

| 命令 | 说明 |
|------|------|
| `analyze-structure` | M1: 结构分析 |
| `analyze-graph` | M2: 语义分析 |
| `tag-nfr` | M3: NFR 标注 |
| `check-connectivity` | M4: 连通性检查 |
| `merge-analysis` | M5: 合并子代理判决 |
| `score-risk` | M6: 风险评分 |

### 8.3 后端 (2)

| 命令 | 说明 |
|------|------|
| `emit-all` | 全部 12 个 Emitter 串行 |
| `emit` | `--group` / `--name` 分目标发射 |

### 8.4 验证与维护

| 命令 | 说明 |
|------|------|
| `validate-jsonl` | JSONL 格式校验 |
| `validate-architecture` | 架构 JSONL 校验 |
| `validate-glossary` | 术语表校验 |
| `validate-cypher` | Cypher 脚本校验 |
| `validate-bdd` | .feature 校验 (+NFR 规则) |
| `validate-tla` | SANY + TLC (+NFR 不变式) |
| `validate-lean` | lake build (+NFR 定理) |
| `validate-checklist` | CHECKLIST 校验 |
| `verify-gate` | 门禁 (S1/R3/FINAL + NFR) |
| `query-graph` | IR 查询 (+ `--query nfr/risk`) |
| `compile` | SKILL.md → SkIR |
| `pack-skill` | AES 加密备份 |
| `verify-skill-integrity` | 完整性校验 |
| `capability-probe` | 能力探测 (+NFR 触发) |
| `stability-test` | 跨 LLM 稳定性测试 |
| `generate-counterexample-fixtures` | 反例夹具 |
| `fixture-coverage` | 覆盖报告 |

### 8.5 淘汰命令

以下命令从 `index.ts` 注册表移除（文件保留）：

| 淘汰 | 替代 |
|------|------|
| `build-graph` | `build-ir` |
| `export-cypher` | `emit --name cypher` |
| `generate-bdd` | `emit --name gherkin` |
| `build-behavior-graph` | `emit --name behaviorGraph` |
| `build-tla-graph` | `emit --name tlaGraph` |
| `build-lean-graph` | `emit --name leanGraph` |
| `build-system-architecture` | `emit --name systemArch` |

### 8.6 CLI 参数约定

| 参数 | 适用命令 | 说明 |
|------|----------|------|
| `--output` | init | 工作目录路径（仅 init） |
| `--workdir` | 大部分命令（init 除外） | 工作目录路径，必须为 `.srs_formalizer` |
| `--file <path>` | validate-* | 待校验文件路径 |
| `--group` / `--name` | emit | 发射器组或名称 |
| `--type` | guided-extract | r1/r2/r3/r3-cross/r4-nfr/arch |
| `--query <type>` | query-graph | node/neighbors/module/path/context/nfr/risk |
| `--stage S1\|R3\|FINAL` | verify-gate | 门禁阶段 |
| `--repair` | validate-checklist | 自动修复 |

### 8.7 CLI 输出格式

所有命令输出 JSON 到 stdout：`{ "status": "ok" | "error", "message"?: string, "data"?: ... }`。成功 exit(0)，失败 exit(1)。

### 8.8 refuseDirectInvocation 放置约定

所有命令文件末尾：
```typescript
import { refuseDirectInvocation } from '../lib/cli.js';
refuseDirectInvocation(import.meta.url);
```

---

## 9. 数据契约

### 9.1 JSONL 记录格式（前端产出）

```typescript
interface JsonlRecord {
  id: string;           // R[123]-[A-Za-z0-9_.]+-\d{4}
  category: 'explicit' | 'implicit' | 'relational';
  statement: string;
  source_file: string;
  confidence: 'high' | 'medium' | 'low';
  metadata?: Record<string, unknown>;
}
```

验证规则（`validate-jsonl`, 6 项）：id 正则、category/confidence 枚举、statement 非空、source_file 非空、metadata 关联 ID 合法。

### 9.2 ShardIndex（前端 Pass 2 中间产物）

```typescript
interface ShardIndex {
  version: '1.1';
  source_path: string;  source_hash: string;
  language: 'zh' | 'en';  total_chars: number;  total_shards: number;
  shards: ShardEntry[];  gaps: GapEntry[];  warnings: string[];
  cross_references: CrossRef[];   // ★ v1.1 新增
  nfr_profile: NFRProfile;        // ★ v1.1 新增
}

interface ShardEntry {
  id: string;  file: string;  locator: string;
  source_path: string;  source_start_line: number;  source_end_line: number;
  module: string;  chapter_ref: string;
  char_count: number;  estimated_tokens: number;
  nfr_weight?: number;  // ★ 新增
}
```

### 9.3 分片算法

- `MAX_SHARD_LINES = 200`（硬上限）
- 递归策略：按章节标题分割 → 章节回退 → 段落回退
- 超过阈值强制分割，无分割点时记录 warning
- Token 估算：中文 `chars / 1.5`，英文 `chars / 4`

### 9.4 阶段间文件契约

```
Frontend → shard_index.json, 2_extract/*.jsonl, srs-ir.json
IR       → srs-ir.json
Backend  → 4_bdd/features/*.feature, 5_formal/specs/*.tla, 5_formal/proofs/*.lean
          6_outputs/knowledge_graph/*.cypher, test_fixtures/<level>/<framework>/
          6_outputs/system-architecture.json, cross-graph-report.json,
          convergence-log.jsonl, coverage-report.json, traceability.md
```

---

## 10. SkIR 类型系统（技能编译用）

技能自身的 SKILL.md 编译也使用类似的编译器模型。SkIR 是技能编译的 IR。

### 10.1 核心枚举

```typescript
type SecurityLevel = 'low' | 'medium' | 'high' | 'critical';
type SkillMode = 'sequential' | 'alternative' | 'toolkit' | 'guideline';
type PermissionKind = 'network' | 'filesystem' | 'database' | 'execute' | 'mcp' | 'environment';
type ConstraintLevel = 'warning' | 'error' | 'critical';
```

### 10.2 SkillIR 关键字段

```typescript
interface SkillIR {
  name: string; version: string; description: string;
  security_level: SecurityLevel; hitl_required: boolean;
  pre_conditions: string[]; post_conditions: string[];
  fallbacks: string[]; permissions: Permission[];
  procedures: ProcedureStep[]; mode: SkillMode;
  anti_skill_constraints: Constraint[];
  // srs-formalizer 扩展
  pipeline_stages: PipelineStage[];
  capability_requirements: Record<string, Record<string, number>>;
  capability_tiers: CapabilityTier[];
  stage_gates: string[];
  source_path: string; source_hash: string; compiled_at: string;
}
```

---

## 11. 技能编译管线（SkCC 四阶段）

### 11.1 流水线

```
Phase 1 (Parser) → Phase 2 (IR Builder) → Phase 3 (Security Optimizer) → Phase 4 (Emitter)
```

| 阶段 | 输入 | 输出 | 失败行为 |
|------|------|------|----------|
| Phase 1 | SKILL.md | RawAST | Fail-Fast |
| Phase 2 | RawAST | SkillIR | Fail-Fast |
| Phase 3 | SkillIR | SkillIR(带约束) | Critical 阻断 |
| Phase 4 | SkillIR(带约束) | Claude XML / Generic MD | Fail-Fast |

### 11.2 Emitter 多平台发射

| 框架 | 发射器 | 输出格式 |
|------|------|------|
| Claude Code | `ClaudeXmlEmitter` | XML 语义分层 |
| Generic (7+ 平台) | `GenericMarkdownEmitter` | YAML + Markdown |

---

## 12. 门禁与验证

### 12.1 verify-gate 三级

| 阶段 | 主要检查项 |
|:----:|------|
| S1 | STATE.md, shard_index.json, JSONL 文件存在, 分片完整性, 术语表, Checklist |
| R3 | S1 检查 + 全部 JSONL 目录, ID 唯一性, 图谱可加载, 节点数 ≥ R1 数 |
| FINAL | R3 检查 + validate-bdd, graph.merged.json, schema.cypher, behavior/tla/lean graph, system architecture, 全部 checklist, **NFR 覆盖率 ≥ 80%** |

### 12.2 跨图一致性验证（13 个根本问题）

原 10 个 + 3 个 NFR 问题：

| # | 问题 | 联合图谱 |
|:--:|------|------|
| Q1-Q10 | 原问题（是什么/做什么/能做什么/为什么/联合使用/内部行为/交互/外部/边界/兜底） | 需求+架构+行为+TLA++Lean |
| **Q11** (★) | 各模块的性能边界是否一致？ | 需求+NFR+TLA+ |
| **Q12** (★) | 安全约束是否在所有数据路径中一致应用？ | 需求+NFR+Lean |
| **Q13** (★) | 可用性降级路径是否覆盖所有关键模块？ | 需求+NFR+架构+行为 |

### 12.3 收敛循环（规模自适应）

```
total_shards ≤ 50   → max_iterations = 3, parallelism = 1
total_shards 51-100  → max_iterations = 5, parallelism = 2
total_shards > 100   → max_iterations = 8, parallelism = 4, 强制 NFR 分维度并行

收敛定义 = 全部 13 个 Q 可回答 + high-confidence ≥ 9/13
         + NFR 覆盖率 ≥ 80% + verify-gate FINAL pass
```

---

## 13. 安全设计

### 13.1 防御层次

| 层级 | 机制 |
|:----:|------|
| 编译期 | Anti-Skill Injector (7 规则, 94.8% 触发率) + Fail-Fast 10 条 |
| 入口 | `refuseDirectInvocation` + `validateNoPoisonArgs` + `safeParseArg` |
| 文件系统 | `validateWorkDir` + `isPathSafe` + `assertSafePath` |
| 流程 | 9 stage_gates + HITL + `verify-skill-integrity` |
| 备份 | SHA-256 + AES-256-GCM `.enc` |

### 13.2 Anti-Skill 注入规则

**SkCC 默认 (4)**：http-safety, loop-safety, db-destructive, parse-safety

**SRS 特化 (3)**：
- `srs-writeback`: 禁止无确认修改原始 SRS
- `verifier-isolation`: 验证者必须新会话
- `integrity-gate`: 阶段转换前运行 verify-skill-integrity

---

## 14. BDD 建模约束

### 14.1 格式要求

- 必须采用独立 `.feature` 文件格式，不接受 Markdown 描述
- 完整 Given → When → Then → And 步骤，Then 含 `# verification_method:`
- NFR 场景含具体阈值（"≤ 200ms"、"99.99%"）
- NFR Feature 文件独立：`NFRPerformance.feature`, `NFRSecurity.feature`, ...

### 14.2 质量门禁

| # | 检查 | 严重度 |
|:--:|------|:------:|
| 1-6 | 无占位符/error/failed/undefined/untested/步骤缺失/逻辑顺序 | 硬阻塞 |
| 7 | 不允许占位实现、简化实现、错误实现 | 硬阻塞 |
| 8 | **NFR 场景必须含具体数值阈值** (★) | 硬阻塞 |
| 9 | **安全场景必须含前置认证步骤** (★) | 警告 |

---

## 15. TLA+ 建模约束

### 15.1 层次化拆解

L1(系统级) → L2(子系统级) → L3(原子级) → 可推广至 N 级。拆解判定：变量组合 >1k 考虑拆，>1w 强制拆。

### 15.2 NFR 不变式 (★)

TLA+ Emitter 自动为检测到的 NFR 类别生成专用不变式：

```
PerfLatencyInv == latency ≤ MaxLatency     \* 性能上界
SecurityInv    == \A u ∈ Users : auth[u] => access_ok[u]  \* 安全
AvailInv       == Cardinality(dead_nodes) ≤ MaxDeadNodes  \* 可用性
```

### 15.3 质量门禁

| # | 检查 | 严重度 |
|:--:|------|:------:|
| 1 | SANY 语法检查 | 硬阻塞 |
| 2 | TLC 模型检查 (-deadlock) | 硬阻塞 |
| 3-7 | 无死锁/状态爆炸/违法不变式/活锁/奇迹 | 硬阻塞 |
| 8 | 无占位实现、简化实现、错误实现 | 硬阻塞 |

---

## 16. Lean 4 建模约束

### 16.1 拆分证明（四步循环）

1. 编写证明骨架（带 sorry）→ 2. 每个 sorry 独立文件 → 3. 继续拆分 → 4. 递归至 0 sorry

### 16.2 NFR 定理 (★)

Lean Emitter 自动生成 NFR 相关定理骨架：

```lean4
theorem response_time_bound : ∀ (op : Operation), time(op) ≤ max_latency := by
  -- NFR proof skeleton
  sorry
```

### 16.3 质量门禁

| # | 检查 | 严重度 |
|:--:|------|:------:|
| 1-6 | 0 sorry/0 axiom/0 warnings/lake build/theorem+proof/独立文件 | 硬阻塞 |
| 7 | 无占位实现、简化实现、错误实现 | 硬阻塞 |

### 16.4 平台限制

| 平台 | 支持 |
|------|:----:|
| Linux x86_64 | ✅ |
| macOS ARM64 | ✅ |
| Windows | ❌ 禁止 |

---

## 17. SRS 一致性升级流程

当形式化符合 SRS 设计但仍有问题时：

1. 不修改代码绕过问题
2. 写入 `SRS_PATCHES.md`：矛盾描述 + SRS 引用 + 可选项 A/B/C + 事实依据（允许联网搜索）
3. 等待人类确认
4. 若涉及安全关键需求，`security_level` 提升至 `critical`

---

## 18. 能力探测系统

### 18.1 8 维度 50 探针

| 维度 | 题数 |
|------|:--:|
| instruction_following | 8 |
| structured_output | 7 |
| precision | 6 |
| creative_reasoning | 5 |
| hierarchical_reasoning | 5 |
| logical_reasoning | 5 |
| formal_tlaplus | 7（工具链条件生成） |
| formal_lean4 | 7（工具链条件生成） |

### 18.2 Tier 判定

```
score = per-dimension pass rate (0-100)
tier  = min(all 8 dimension scores)
      ≥ 80 → high (full_auto)
      ≥ 50 → medium (guided)
      < 50 → low (human_in_loop)
```

### 18.3 工具链条件与 NFR 触发 (★)

TLA+/Lean 4 探针仅在有工具链时生成。NFR 检测增强：即使工具链未安装，若 IR 的 `nfrProfile` 标记了 performance/security 热点，输出"建议安装 TLA+/Lean 4"提示并标记维度为 `required_not_optional`。

---

## 19. 引导提取协议

### 19.1 两步模式

```
Step 1: --template → 生成 guided prompt
Step 2: --line '<json>' → 单行校验 → OK / ERR: <detail> / DONE
```

### 19.2 提取类型

```
r1/r2/r3/r3-cross/r4-nfr/arch
```

验证规则：id 正则 + category/confidence 枚举 + 字段完整性。

---

## 20. 技能完整性系统

### 20.1 备份不可变原则

`pack-skill --force`: 仅人类显式操作 → SHA-256 → MANIFEST.json → AES-256-GCM → `.enc`

### 20.2 校验流程

阶段转换前：`verify-skill-integrity` → SHA-256 对比 MANIFEST.json → 篡改检测 → `--repair` 恢复 → 暂停流水线 → 人类确认。

---

## 21. 稳定性测试

### 21.1 两阶段

```
Phase 1: stability-test --config llm-config.json --passes 3 → prompt manifests
Phase 2: stability-test --config llm-config.json --score <results-dir> → 评分报告
```

### 21.2 指标

```
Intra-model σ: < 1.0 = stable
Inter-model Δ: < 1.5 = consistent
Overall: max(0, 10 - avg(σ) - avg(Δ)) → 0-10 scale
```

---

## 22. 专家人设体系

三位形式化验证专家内置为 L3 参考资料。编排者在对应阶段加载。

### 22.1 BDD 行为建模专家

核心使命：将 SRS 业务规则转化为机器可执行、业务可读的 Gherkin 模型。信奉 Discovery → Formulation → Automation 三大支柱。严禁 Markdown 描述替代 `.feature` 文件。

### 22.2 TLA+ 并发系统建模专家

核心使命：通过 TLC 状态空间搜索提前发现死锁、活锁、不变式违例。严格执行层次化拆解 L1→L2→L3+，变量组合 >1w 强制拆。

### 22.3 Lean 4 定理证明专家

核心使命：通过构造性证明确保算法在数学上绝对成立。严格执行 Sorry 驱动开发四步循环，递归至 0 sorry。

---

## 23. 专家协作契约

### 23.1 仲裁优先级

| 优先级 | 专家 | 理由 |
|:--:|------|------|
| **最高** | Lean 4 | 数学绝对性 |
| **次高** | TLA+ | 状态空间穷尽探索 |
| **参考** | BDD | 业务语义正确性 |

### 23.2 需求细化联动

- BDD → TLA+：边界条件 → 状态不变量
- BDD → Lean 4：边界场景 → 证明前件
- TLA+ ↔ Lean 4：相互验证（状态异常 ↔ 隐含假设缺失）

---

## 24. Agent 自动安装设计

### 24.1 三层架构

- Layer 1: SKILL.md frontmatter（元数据）
- Layer 2: agent-card.json（A2A Protocol v1.0）
- Layer 3: references/auto-setup.md（可执行安装指南, 15 平台）

### 24.2 AI 安装协议

1. 平台检测 → 2. 目录复制 → 3. npm install + typecheck + test → 4. 可选激活配置 → 5. 验证

---

## 25. V-Model Test Fixture 生成

### 25.1 架构

TS 层做确定性骨架 + LLM 层做语义填充。一个入口 `emit --name fixture` dispatch 到 `lib/fixture-gen/`。

### 25.2 框架支持

| 框架 | 适用 level |
|------|------|
| Cucumber | acceptance |
| Playwright | acceptance, e2e |
| Pytest | unit, integration, nfr |
| JUnit | unit, integration, nfr |
| fast-check | property, nfr |

### 25.3 NFR 框架兼容矩阵 (★)

| NFR 类型 | cucumber | playwright | pytest | junit | fast-check |
|------|:--:|:--:|:--:|:--:|:--:|
| performance | — | — | ✅ | ✅ | ✅ |
| security | — | — | ✅ | ✅ | ✅ |
| reliability | — | — | ✅ | ✅ | ✅ |
| usability | ✅ | ✅ | — | — | — |
| compatibility | ✅ | ✅ | — | — | — |
| maintainability | — | — | ✅ | ✅ | — |
| compliance | — | — | ✅ | ✅ | — |

---

## 26. 评估结果

### 26.1 SKILL-RUBRIC v0.1.5

| 维度 | 得分 | 关键证据 |
|------|:----:|----------|
| D1 Problem-fit | 8/10 | 明确用户画像 + 反事实价值 |
| D2 Architecture | 9/10 | 编译器模型 + IR 不可变 + O(m+n) |
| D3 Reliability | 5/10 | 缺跨 LLM 数据（待 collection） |
| D4 Output-fit | 8/10 | 溯源 + 零往返 + 失败清晰 |
| D5 Lifecycle-fit | 7/10 | 版本管理 + IR 契约 + 生态集成 |

**加权平均**: 7.4/10 → **B+**

### 26.2 OWASP AST10

通过率 **9/10**：SHA-256 防篡改 ✅, verify-skill-integrity ✅, 最小权限 ✅, Anti-Skill ✅, HITL ✅, A2A Agent Card ✅。

### 26.3 SkillAudit

安全风险等级: **Low**（0 高危发现）

---

## 27. 技术栈

| 组件 | 选型 | 版本 |
|------|------|------|
| 语言 | TypeScript (strict) | ≥5.5 |
| 运行时 | Node.js (ESM) | ≥20 |
| 执行器 | tsx | latest |
| 测试 | Node.js native `node:test` | built-in |
| 形式化 | tla2tools (内置) | 1.7.4 |
| 形式化 | Lean 4 + mathlib4 | latest |
| BDD 校验 | gherkin-lint | latest |
| IR 编译 | SRS-IR + SkIR | 2.0.0 |

```
运行时依赖: 0
开发依赖: typescript, @types/node
```

---

## 28. 测试策略

### 28.1 测试层级

| 层级 | 数量（目标） | 通过标准 |
|------|:----:|----------|
| 单元测试 | ~740 | 0 failures |
| 集成测试 | `tests/assertions/` | 端到端正确 |
| Golden 测试 | `tests/golden/` | 输出与基准一致 |

### 28.2 运行命令

```bash
cd .claude/skills/srs-formalizer/scripts
npm install
npx tsc --noEmit
npx tsx --test __tests__/*.test.ts
```

---

## 29. 演化历史

| 版本 | 日期 | 关键变更 |
|------|------|----------|
| 1.0.0 | 2026-07-13 | **编译器架构重构**：S0-S6 流水线 → Frontend/Middle-end/Backend；SRS-IR 强类型 IR（§4）；12 个 Emitter 统一注册表（§7）；NFR 贯穿全阶段；跨文件引用 + 连通性 + 风险评分；7 条旧命令 + 旧 lib 模块 zip 归档至 `.worktrees/archive/`；CLI emit --group/--name 统一入口。详见 `docs/superpowers/specs/2026-07-13-compiler-refactor-design.md` |
| 0.8.0 | 2026-07-13 | V-Model Zero-Gap Wiring：bdd/tla/lean/playwright-page 迁移至 template-engine，generate-counterexample-fixtures，generate-vmodel-matrix，--level nfr，fixture-coverage 增强，测试 407→342 |
| 0.7.0 | 2026-07-13 | 模板引擎（16×6 框架），TLC 反例解析器，Hypothesis 模式识别，Playwright Page Object，追溯矩阵，NFR fixture，helpers 边界测试 |
| 0.6.0 | 2026-07-12 | V-Model 测试 fixture 生成（5 框架），fixture-coverage，Cypher 注入防护 |
| 0.5.7 | 2026-07-09 | 文件拆分 + 去重重构：16 个超限文件拆分，全部 ≤283 行 |
| 0.5.6 | 2026-07-09 | verify-gate 源重扫安全修复：Lean sorry/axiom + TLA+ 占位标记重扫 |
| 0.5.5 | 2026-07-07 | 专家人设体系 + 协作契约，三位领域专家内置为 L3 参考资料 |
| 0.5.3 | 2026-07-03 | 能力探测工具链条件生成 + 语法降级评分，路径 Bug 修复 |
| 0.5.0 | 2026-07-01 | 分片索引化重构，移除物理分片目录 |
| 0.4.0 | 2026-07-01 | SkCC 集成：compile, SkIR, Anti-Skill, 双发射器 |
| 0.1.0 | 2026-06-30 | S1 基础设施：init, manifest, 类型定义, 安全库, 25 测试 |

---

## 30. 参考

| 来源 | 链接 |
|------|------|
| SkCC 论文 | [arXiv:2605.03353](https://arxiv.org/abs/2605.03353) |
| SkillsBench | [arXiv:2602.12670](https://arxiv.org/abs/2602.12670) |
| SKILL-RUBRIC | [GitHub](https://github.com/acnlabs/OpenPersona/blob/main/docs/SKILL-RUBRIC.md) |
| OWASP AST10 | [owasp.org](https://owasp.org/www-project-agentic-skills-top-10/) |
| A2A Protocol v1.0 | [Linux Foundation](https://github.com/google/A2A) |
| 本项目仓库 | [GitHub](https://github.com/WangHHY19931001/SRS-Formalizer) |
| 编译器重构详细设计 | `docs/superpowers/specs/2026-07-13-compiler-refactor-design.md` |
