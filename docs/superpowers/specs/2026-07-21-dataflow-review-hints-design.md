# Phase: Data-Flow Review Hints (数据流审视提示)

**Date:** 2026-07-21
**Status:** Draft (待评审)
**Related Issues:** #12 (Formal Rigor), #13 (Performance & Scalability)
**Scope:** 在 Middle-end 增加一路只读的**数据流分析旁路**，从 requirement 节点抽取数据实体与读写关系，检出死点/边界/gap/环路四类可疑单元，以**强提示（warning，非硬门禁）**注入下游 BDD/TLA+ executor，驱动 agent 对相关单元加强审视。

---

## Problem（问题）

现有 SRS-IR 图是**需求关系图**（节点=requirement/nfr/architecture，边=depends_on/refines/conflicts_with/traces_to），回答"需求之间怎么关联"。它**不回答**"数据从哪来、到哪去、被谁读写"——即缺少**数据流图（data lineage / DFD）**。

这带来四类需求阶段本可提前发现、却被拖到形式化阶段（甚至遗漏）的缺陷：

| 缺陷 | 数据流语义 | 现状 |
|------|-----------|------|
| **死点（死数据）** | 数据被产生但从不被消费（write-only），或被读取但从不被产生（use-before-def） | 无检测 |
| **边界** | 入度为 0 的数据实体（外部输入/信任边界）、出度为 0 的数据实体（最终输出） | 无显式识别 |
| **gap** | 需求声明依赖数据 X，但全图无任何上游产生 X（def-use 断链） | 仅有需求层 `gaps[]`，无数据层 |
| **环路异常** | 数据 A 依赖 B、B 又回头依赖 A，且无打破环的初始值 | `check-connectivity` 有 SCC 引擎，但作用于需求边，非数据流边 |

值得注意：**需求阶段的循环数据依赖，往往就是 TLA+ 阶段死锁的根因**。在需求阶段用图分析提前标记，比拖到 TLC 反例才发现成本低得多。

---

## Design Principle（核心设计原则）

### 原则 1：一般有向图 + 无环性作为待验证属性

不建 DAG。环路（SCC 大小 > 1）恰恰是检测目标之一——若建图时假设无环，就消灭了要找的目标。复用现有 `check-connectivity` 的 SCC 引擎，作用在新的数据流边上。

### 原则 2：提示信息，不是硬门禁

数据流抽取**不 sound**（需求文本不完整，会漏抽/误抽），因此结论只能是"可疑清单"。

| 形态 | 是否适配 | 原因 |
|------|:---:|------|
| 硬门禁（fail-closed） | ❌ | 不 sound，假 gap 会误杀正确需求，阻断流水线 |
| **提示信息（加强审视）** | ✅ | 假阳性代价=agent 多看一眼；真阳性收益=救回一个缺陷。非对称收益 |

误报代价从"阻断流水线"降级为"多审视一个单元"，故降级为 warning 进收敛循环。

### 原则 3：强提示——"检出 → 下游必须做什么"

裸标签（`highRisk: true`）会被 agent 忽略。提示必须携带**可操作的审视指令**，对齐现有 prompt 的「❌ 视觉检查点」写法。

弱提示（agent 会略过）：

```
⚠️ 该需求节点属于高风险单元
```

强提示（agent 无法略过，因为规定了动作）：

```
⚠️ 数据流审视点 [R1-S012 / RID-ORDER-012]
- 检出：该需求读取数据实体 `库存余额`，但全图无任何上游需求产生它
- 类型：潜在 gap（use-before-def）
- 要求：
  · 生成 BDD 时必须显式覆盖"库存余额来源缺失/为空"的边界场景；
  · 生成 TLA+ 时必须为该变量的 Init 补明确初值，不得默认存在；
  · 若确认该数据来自外部系统 → 在 Given 中显式声明为外部输入并标注信任边界。
```

差别在于：强提示把"检出了什么"翻译成"下游必须做什么"。

---

## Data Model（数据模型）

### IR 扩展（新增节点/边类型）

复用现有 `IRNode`/`IREdge` 结构，只扩展枚举，不改结构：

```typescript
// IRNodeType 新增
type IRNodeType = ... | 'data_entity';

// IREdgeType 新增（数据流转三元关系）
type IREdgeType = ... | 'produces' | 'consumes' | 'mutates';
```

| 新增类型 | 语义 | source → target |
|----------|------|-----------------|
| `data_entity` | 数据实体节点（Order / Token / 库存余额 …） | — |
| `produces` | 需求产生数据 | requirement → data_entity |
| `consumes` | 需求读取数据 | requirement → data_entity |
| `mutates` | 需求改写数据 | requirement → data_entity |

> 数据流边的方向统一为 `requirement → data_entity`；数据实体之间的间接依赖由"共享 requirement"推导，SCC 在 `requirement ∪ data_entity` 的二部投影上运行。

### 旁路报告 `dataflow.json`（不写回 IR）

对齐 `structure.json` 的旁路定位（只读 IR、只写报告），产出 `3_graph/analysis/dataflow.json`：

```typescript
interface DataFlowAnalysis {
  entities: DataEntityRef[];       // 抽取到的数据实体（含归一后 canonical 名）
  findings: DataFlowFinding[];     // 四类检出
}

interface DataEntityRef {
  entityId: string;                // 归一后的稳定 id
  canonicalName: string;           // 归一后的规范名
  aliases: string[];               // 命中的原始别名（来自 glossary/crossRefs）
  producedBy: string[];            // requirement 节点 id
  consumedBy: string[];
  mutatedBy: string[];
}

interface DataFlowFinding {
  findingType: 'dead_data' | 'boundary' | 'gap' | 'cycle';
  severity: 'warning';             // 恒为 warning，不 fail-closed
  entityId: string;
  relatedNodes: string[];          // 命中的 requirement 节点 id（用于注入定位）
  evidence: string;                // 检出依据（人类可读）
  reviewActions: string[];         // 下游必须执行的审视动作（强提示正文）
}
```

### 四类检出的证据与建议动作模板

| findingType | 检出条件（证据） | reviewActions（建议动作模板） |
|-------------|-----------------|------------------------------|
| `dead_data` | `producedBy≠∅ 且 consumedBy=∅ 且 mutatedBy=∅`（write-only） | BDD 需覆盖"该数据产生后是否真被使用"；确认无消费者则标记为冗余需求候选 |
| `gap` | `consumedBy≠∅ 且 producedBy=∅`（use-before-def） | BDD 覆盖数据缺失/为空边界；TLA+ 为该变量补 Init 初值；若来自外部则在 Given 声明外部输入 + 信任边界 |
| `boundary` | 入度 0（外部输入）或出度 0（最终输出） | 入边界：标注信任边界，安全场景需鉴权 Given；出边界：确认是否需持久化/审计 |
| `cycle` | SCC 大小 > 1（数据循环依赖） | TLA+ 该模块 `Next` 重点防死锁（需求阶段已闻环味）；确认是否有打破环的默认值/初始态 |

---

## New Middle-end Pass（新增中端旁路）

### 新执行者 `prompts/executor-middle-end-dataflow.md`（M1.5，只读 IR）

定位与 `executor-middle-end-structure.md` 一致：**只读 IR、只写分析报告**，不修改 `nodes`/`edges`。放在 M1（结构分析）之后、M2（语义分析）之前，命名 M1.5，避免打乱现有 M 编号。

**四个步骤：**

1. **实体抽取 + 归一**：从每个 `requirement` 节点的 `statement` 抽取数据实体与读写动作（produce/consume/mutate）。归一**必须**复用现有 `glossary`（术语表）与 `crossRefs`（跨分片引用）——命中同一 canonical 名的别名合并为一个 `entityId`。
2. **构建数据流投影图**：以 `requirement ∪ data_entity` 为节点、`produces/consumes/mutates` 为边，构建二部有向图。
3. **四类检出**：
   - `dead_data` / `gap`：对每个 `data_entity` 做 def-use 扫描（比对 `producedBy`/`consumedBy`/`mutatedBy` 是否为空）。
   - `boundary`：统计每个 `data_entity` 的入度/出度。
   - `cycle`：复用 `check-connectivity` 的 SCC 引擎跑投影图，SCC 大小 > 1 即环。
4. **产出报告 + 生成强提示**：每个 finding 按四类模板填 `evidence` 与 `reviewActions`，写入 `3_graph/analysis/dataflow.json`。

**新增只读命令：** `npx tsx index.ts analyze-dataflow --workdir .srs_formalizer`。产出 `dataflow.json`。**不带 `--strict` 语义**（本分析恒为 warning，不参与 fail-closed）。

**约束（对齐 `executor-middle-end-structure.md`）：**
- 只写 `dataflow.json`，不改 IR 任何字段。
- 所有节点/边 id 必须来自当前 IR 或本报告新建的 `entityId`，不得编造 requirement id。
- 实体归一只能依据 `glossary`/`crossRefs`，不得凭空合并同名。

---

## Schema Migration（2.0.0 → 2.1.0）

新增 `data_entity` 节点与 `produces`/`consumes`/`mutates` 边会扩展枚举，须做一次 minor 版本升级。关键约束：`version` 在 `scripts/types/srs-ir.ts` 里是 **TypeScript 字面量类型** `version: '2.0.0'`，且 `assemble-ir.ts` 有运行时强校验 `if (ir.version !== '2.0.0')`。二者是**必须同步**的硬约束点——字面量类型既是负担也是安全网：改一处，编译器会强制所有 IR 构造点同步。

### 为什么是 minor（2.1.0）而非 major

新增全部是**可选扩展**，不改动、不删除任何现有字段：
- `IRNodeType` 加一个成员 `'data_entity'`（并集扩大，旧值仍合法）
- `IREdgeType` 加三个成员 `'produces'|'consumes'|'mutates'`
- 旧 IR（无 `data_entity` 节点）在新 schema 下**仍然合法** → 向后兼容 → minor 版本

### 必须同步改动的落点（按依赖顺序）

| # | 文件 | 改动 | 风险 |
|---|------|------|------|
| 1 | `scripts/types/srs-ir.ts` | 字面量改 `version: '2.1.0'`；`IRNodeType`/`IREdgeType` 加成员 | 改字面量后，所有构造 `SRSIR` 的位置**编译期**报错 → 强制全量同步（安全网） |
| 2 | `scripts/commands/assemble-ir.ts` | 运行时校验改为**接受 `2.1.0`**（见下方兼容策略） | 漏改则新 IR 被拒 |
| 3 | `scripts/commands/validate-semantics.ts` | Type Validity A 项的 `node.type`/`edge.type` 枚举校验加入新成员 | 漏改则含数据流边的 IR 报 type-invalid error |
| 4 | `references/ir-schema-reference.md` | 版本号、节点/边枚举表、§5 不可变性契约同步 | 文档漂移 |
| 5 | 测试夹具（`__tests__/*.ts` 中 8 处含 `2.0.0`） | 夹具版本号更新 + 新增数据流边用例 | 漏改则测试红 |

### 版本校验的兼容策略（关键决策）

`assemble-ir.ts` 的硬校验不能简单地把 `2.0.0` 替换成 `2.1.0`——那会**拒绝所有存量 2.0.0 IR**。两个选项：

- **选项 A（推荐）**：接受 `>= 2.0.0` 的 2.x 版本。`assemble-ir` 产出打 `2.1.0`；校验放宽为"major 必须为 2"。存量 2.0.0 IR 继续可读,`analyze-dataflow` 对其返回空 findings（无 `data_entity` 即无数据流）。
- **选项 B**：硬切 `2.1.0`，提供一次性 `migrate-ir` 命令把 2.0.0 IR 的 `version` 字段改写为 `2.1.0`（因向后兼容，改字段即可，无需转换数据）。

选 A 还是 B 取决于是否允许存量 IR 原地存活。A 改动小、体验平滑；B 版本语义更干净但需要迁移动作。**建议 A**，与"新增字段全部可选"的向后兼容前提一致。

### 降级行为（硬性）

`analyze-dataflow` 遇到无 `data_entity` 节点的 IR（旧数据或 Frontend 未抽取）**必须返回空 `findings` 而非报错**——对齐 ADR-0009 的风险缓解项，保证 schema 升级不破坏存量流程。

---

## Downstream Injection（下游注入）

提示在三个层次注入，全部复用现有结构：

### 层次 1：数据层（M6 风险标记联动）

`analyze-dataflow` 产出 `dataflow.json` 后，M6 风险评分执行者在识别 `highRiskShards` 时**增加一条命中规则**：某 shard 内节点出现在任一 `DataFlowFinding.relatedNodes` 中 → 计入 `highRiskShards`。

这样数据流信号复用现有 `highRiskShards` 载体，不新增 IR 写回字段。M6 的写权限范围（`meta.riskScore` / `meta.highRiskShards`）不变。

### 层次 2：提示层（BDD / TLA+ executor 输入注入）

编排者在分派 `executor-bdd.md` / `executor-tlaplus.md` 时，把**命中当前模块**的 `DataFlowFinding` 作为「数据流审视清单」拼入 prompt 输入（按 `relatedNodes` 与模块节点求交集过滤）。

- BDD executor：接收 `gap`/`dead_data`/`boundary` 类 finding → 转成必须覆盖的边界/否定场景。
- TLA+ executor：接收 `cycle`/`gap`/`boundary` 类 finding → `cycle` 提示重点防死锁（呼应现有"所有系统严禁死锁"规则）、`gap` 提示补 Init 初值、`boundary` 提示信任边界建模。

两个 executor prompt 各加一节「## 数据流审视清单（若有）」，说明如何消费注入的 finding（格式对齐现有「❌ 视觉检查点」）。

### 层次 3：收敛层（warning 进收敛循环）

`dataflow.json` 的 findings 作为 **warning** 进入 Backend 收敛循环与苏格拉底拷问，**不 fail-closed**。若 agent 审视后确认为合理抽象（如数据确来自外部系统），经 `validate-convergence-log --append` 记录 reason 后放行。

---

## Testing

### Unit Tests: `__tests__/middle-end-dataflow.test.ts`

1. **纯净 IR**：无数据流问题 → `findings` 为空
2. **dead_data 检出**：数据仅被 produce、无 consume/mutate → 1 条 `dead_data` finding
3. **gap 检出**：数据被 consume 但无 produce → 1 条 `gap` finding
4. **boundary 检出（入）**：入度 0 的外部输入数据 → `boundary` finding，evidence 标注外部输入
5. **boundary 检出（出）**：出度 0 的最终输出数据 → `boundary` finding
6. **cycle 检出**：A→B→A 循环数据依赖 → SCC 大小 2 → `cycle` finding
7. **实体归一**："订单"/"order"/"Order" 命中同一 glossary canonical → 合并为一个 `entityId`
8. **归一保守性**：无 glossary/crossRefs 证据的同名词 → **不合并**（防噪声）
9. **severity 恒为 warning**：所有 finding 的 `severity === 'warning'`
10. **reviewActions 非空**：每条 finding 的 `reviewActions.length > 0`（强提示不可为空标签）
11. **relatedNodes 真实性**：所有 `relatedNodes` id 存在于 IR `nodes[]`

### Integration Tests

- M6 联动：含 finding 的 shard 出现在 `meta.highRiskShards`
- Executor 注入：给定 `dataflow.json` + 模块 id，验证注入清单只含命中当前模块的 finding（按 `relatedNodes` 交集过滤）

---

## Non-Goals & Risks

### Non-Goals（非目标）

- **不做硬门禁**：数据流分析永不 fail-closed，不阻断流水线。sound 的检查留给现有 `validate-*` / `verify-gate`。
- **不替代需求层 `gaps[]`**：数据层 gap 是补充信号，不改现有 gap 检测。
- **不做完整数据类型推导**：只判"有没有产生/消费"，不判类型是否匹配（那是 TLA+ TypeOK 的职责）。
- **不修改 IR 不可变性契约**：`data_entity` 节点与数据流边由 Frontend 抽取阶段一次性写入；Middle-end `analyze-dataflow` 只读它们做分析，不新增/改写。

### Risks（风险）

| 风险 | 可能性 | 缓解 |
|------|:---:|------|
| **实体归一不准**（同一实体被抽成多个节点） | 中 | 归一强制依赖 `glossary`/`crossRefs`；无证据不合并；测试 8 锁死保守性 |
| **误报训练 agent 无视提示**（提示噪声太多 → agent 学会忽略所有提示） | 中高 | 恒为 warning + 强提示携带具体动作；上线前用真实 SRS 度量假阳性率，过高则先收紧抽取再放开注入 |
| **数据流抽取拉高 Frontend 成本** | 中 | 抽取并入现有 requirement 解析，不新增独立 LLM pass；`analyze-dataflow` 本身是确定性图算法，成本低 |
| **循环误判**（正常的双向引用被判为环） | 低 | `cycle` finding 明确要求 agent 确认"是否有打破环的初始值"，把判断权交给下游而非直接定性 |

> **上线前提（硬性）**：实体归一的假阳性率必须先达标，否则提示会因噪声被 agent 学会性无视——**一个总是误报的提示比没有提示更糟**。建议先以 shadow 模式产出 `dataflow.json` 供人工评估，达标后再开启层次 2 的 executor 注入。

### 上线前提的可操作机制（injection gate，已实现）

shadow 模式不是口头约定，而是一个确定性门控文件 `_ctx/dataflow_injection_gate.json`（`scripts/lib/dataflow-gate.ts`）：

- **默认关闭**：无门控文件 → `injectionEnabled: false`（shadow 模式）。`analyze-dataflow` 照常产出 `dataflow.json`，但 `data.injectionMode` 报 `shadow`，编排者据此**不注入**层次 2 清单。
- **人工评估签署**：`analyze-dataflow --assess --fp-rate <0~1> --sample-size <n> --assessed-by <name> [--threshold <0~1>]` 写入门控。放开条件（全部满足）：`fp-rate ≤ threshold`（默认 0.15）、`sample-size ≥ 10`、`assessed-by` 非空。任一不满足 → 保持 shadow。
- **executor prompt 呼应**：`executor-bdd.md` / `executor-tlaplus.md` 的「数据流审视清单」节明确标注"默认不注入，仅门控开启后注入"。
- **测试锁定**：`__tests__/dataflow-gate.test.ts` 覆盖超阈值/未签署/样本不足/越界 fp-rate 均保持 shadow。

> 门控只影响**层次 2 注入**。层次 1（M6 风险标记）与产出 `dataflow.json` 本身不受门控限制——shadow 模式下仍产出报告供评估。

### S1 格式门禁（已实现）

数据流抽取产物 `2_extract/data-entities/*.jsonl` 的**格式**（非分析结论）纳入 `verify-gate --stage S1` 硬校验（`checkDataFlowFormat`）：id 形状、无悬挂 `entity_id`、无重复 id、JSON 合法。缺失 data-entities 目录 ⇒ PASS（抽取可选）。这与"分析恒 warning"不冲突——格式门禁保证 `assemble-ir` 能消费产物，分析结论仍不 fail-closed。
