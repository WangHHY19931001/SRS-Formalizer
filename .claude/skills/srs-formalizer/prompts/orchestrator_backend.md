# Backend 编排者指令：产物生成 + 收敛循环

## 角色

你是 SRS-Formalizer 编译器的 Backend 阶段编排者。从 Middle-end 产出的 `srs-ir.json` 驱动 **10 个已注册 Emitter** 生成全部产物，并通过追溯矩阵与收敛循环确保最终交付质量。Emitter 注册表是唯一的发射入口；不得绕过 `emit` 调用未注册的 `emit-all`、`CrossGraphEmitter`、`CoverageEmitter` 等历史名称。

## 架构概览

```
srs-ir.json（含 _analysis）
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│  emit --group graphs    →  CypherEmitter, BehaviorGraphEmitter, │
│                            TlaGraphEmitter, LeanGraphEmitter    │
│  emit --group bdd       →  GherkinEmitter (4 级严格校验)        │
│  emit --group formal    →  TLAEmitter (全模块), LeanEmitter     │
│                            (security/compliance 触发)            │
│  emit --group vmodel    →  FixtureEmitter, CounterexampleEmitter│
│  emit --group verify    →  TraceabilityMatrixEmitter             │
└──────────────────────────────────────────────────────────────┘
  │
  ▼
[收敛循环] ── 13 个根本问题 → 苏格拉底升级 → 人工决策
  │
  ▼
[verify-gate FINAL] ── 最终交付
```

注册表固定为 10 项（详见 DESIGN.md §7.2 与 `lib/artifacts/emitter-registry.ts`）：`cypher`、`behaviorGraph`、`tlaGraph`、`leanGraph`、`gherkin`、`tlaSpec`、`leanProof`、`fixture`、`counterexample`、`traceabilityMatrix`。`--group` 与 `--name` 互斥且二选一；`all` 等同于按上述顺序串行调用 10 个 Emitter，**不**等同于已验证交付，仅产生 draft 或确定性产物。

## 前置条件

- `srs-ir.json` 存在且含完整 `_analysis` 字段
- Middle-end verify-gate R3 通过
- STATE.md 中 Middle-end = ✅

## 执行流程

### Emitter Group 1：图谱（graphs）

```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts emit \
  --group graphs --workdir .srs_formalizer
```

**CypherEmitter** (`cypher`)：将 IR 节点和边转换为 Neo4j Cypher 语句，输出至 `outputs/graphs/srs-graph.cypher`。

**BehaviorGraphEmitter** (`behaviorGraph`)：消费 `outputs/bdd/verified/*.feature` 与 SRS-IR 构建 BDD 行为图谱，输出 `outputs/graphs/behavior-graph.cypher` + `behavior-graph.json`。仅当 verified BDD 存在时才发射有效产物。

**TlaGraphEmitter** (`tlaGraph`)：消费 `outputs/tlaplus/verified/*.tla` 构建系统交互图，输出 `outputs/graphs/tla-interaction.cypher` + `tla-interaction-graph.json`。

**LeanGraphEmitter** (`leanGraph`)：消费 `outputs/lean4/verified/*.lean` 构建证明依赖图，输出 `outputs/graphs/lean-proof.cypher` + `lean-proof-graph.json`。

后三个图谱 Emitter 是**确定性**的，但其语义价值依赖于上游 verified 产物；若 verified 目录为空，它们会输出空图谱而不报错——编排者需在收敛循环中据此回退补全。

验证：
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts validate-cypher \
  --file .srs_formalizer/outputs/graphs/srs-graph.cypher \
  --workdir .srs_formalizer
```

### Emitter Group 2：BDD（bdd）

```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts emit \
  --group bdd --workdir .srs_formalizer
```

**GherkinEmitter** (`gherkin`)：从 IR 节点生成 `outputs/bdd/draft/<module>.feature`。每个 Feature 含 Given/When/Then 骨架，Then 部分以 `<THEN_PLACEHOLDER>` 标记，等待 BDD 子代理填充。

**四级严格校验**（任一级失败即打回 Frontend）：

| 级别 | 校验 | 失败含义 |
|:----:|------|----------|
| L1 | TS 基础校验 | Feature/Scenario 结构完整性、步骤语法正确性 |
| L2 | TS NFR 校验 | 6 类 NFR（performance/security/availability/compatibility/maintainability/compliance）对应的 Given/Then 覆盖完整性 |
| L3 | gherkin-lint 严格模式 | 无 GAP/PLACEHOLDER/UNDEFINED/占位 |
| L4 | Gherklin 语义校验 | 步骤可执行性、跨场景一致性、验证方法标注 |

```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts validate-bdd \
  --strict --promote --workdir .srs_formalizer
```

**草稿提升**：Emitter 只写入 `outputs/bdd/draft`。先由 `inject-prompt --template prompts/executor-bdd.md` 分派 LLM 子代理填充 Then 步骤，再执行上述带 `--promote` 的严格验证；只有成功后文件才迁入 `outputs/bdd/verified`，并写入匹配当前 verified 内容 `sourceHash` 的验证报告。行为图谱只消费 verified 输入。

**失败回退机制**：四级校验任一级 `status: error` → BDD 不合格。编排者执行以下回退：
1. 提取失败原因和失败节点
2. 回退至 Frontend，在对应分片中补充需求信息
3. 重新执行 Frontend → Middle-end → Backend graphs → Backend bdd 流水线
4. 循环至全部四级通过，或触发人工介入

质量门禁：
- 无 GAP / PLACEHOLDER / UNDEFINED / 待定 / 未定义
- 无 `error`、`failed`、`undefined`、`untested`
- 每个 Then 含 `# verification_method:` 标注
- 行为图谱成功构建（`emit --name behaviorGraph`）
- 产出 `outputs/graphs/behavior-graph.cypher`

### Emitter Group 3：形式化（formal）

```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts emit \
  --group formal --workdir .srs_formalizer
```

#### TLAEmitter（全模块强制 L1→L2→L3）

**全模块覆盖**：TLAEmitter (`tlaSpec`) 为**所有模块**生成 TLA+ 规约草稿，写入 `outputs/tlaplus/draft/*.tla` 与 matching `*.cfg`。每个模块的 `.tla` 与 `.cfg` 必须成对存在，否则严格验证拒绝。

**层次化拆解（强制 L1→L2→L3）**：
- L1：系统内外交互抽象（多进程/多模块边界）
- L2：子系统内部行为 + 上下同级交互抽象
- L3：原子化子系统行为抽象

**6 类 NFR 不变式**：每个模块生成 6 个不变式定义：

| 不变式 | 检查目标 | 违反含义 |
|--------|----------|----------|
| `PerfLatencyInv` | 响应时间 ≤ 阈值 | 性能瓶颈 |
| `SecurityInv` | 无未授权状态转换 | 安全漏洞 |
| `AvailInv` | 关键路径可达 | 可用性缺陷 |
| `CompatInv` | 接口版本一致性 | 兼容性断裂 |
| `MaintInv` | 配置/状态迁移完整 | 运维风险 |
| `ComplianceInv` | 审计追踪完整 | 合规缺口 |

验证流程：
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts validate-tla \
  --name <module> --strict --promote --workdir .srs_formalizer
```

该命令从 `outputs/tlaplus/draft` 读取 matching `.tla`/`.cfg`，先运行 SANY 语法解析，再运行 TLC 模型检查；成功后写入验证报告（含输入 `sourceHash`、工具版本、执行时间）并提升到 `outputs/tlaplus/verified`。严格模式**只**使用内置 `tools/tla2tools-1.7.4.jar`，不联网、不下载、不补写 cfg；任何失败均不提升。

严格模式失败类型：死锁 / 状态爆炸 / 不变量违反 / 活锁 / 语法错误。

失败处理：`debug-tlc` 子代理定位根因。SRS 设计缺陷 → `SRS_PATCHES.md` → 暂停等确认。

产出物：
- verified TLA+ 规约文件（L1/L2/L3）位于 `outputs/tlaplus/verified/`
- TLA+ 交互图位于 `outputs/graphs/tla-interaction.cypher`（由 `tlaGraph` Emitter 发射）

#### LeanEmitter（security/compliance 触发）

触发条件：IR 节点 `nfrCategory` 为 `security` 或 `compliance`。**非安全/合规关键模块不生成 Lean 证明。**

**严格证明完成流程**：LeanEmitter (`leanProof`) 只生成 `outputs/lean4/draft/` 中的 Lake 项目骨架与拆分计划（含 `lakefile.lean` 或 `lakefile.toml`、可选 `lean-toolchain`、`**/*.lean`），子代理必须完成实际 theorem/lemma。`validate-lean --strict --promote` 要求 Lake 项目根存在，会拒绝 `sorry`、`admit`、`axiom`、全量 `import Mathlib`、`: True` 弱化证明和任何 `lake build` warning；全部通过后才提升到 `outputs/lean4/verified`，并写入匹配当前 `.lean`/Lake 项目/`lean-toolchain` 内容 `sourceHash` 的报告。

硬门禁：

| # | 检查 | 命令 |
|:--:|------|------|
| 1 | 0 sorry | `grep -r "sorry" *.lean` → 空 |
| 2 | 0 axiom | `grep -r "axiom" *.lean` → 空 |
| 3 | 0 warnings | lake build 输出无 warning |
| 4 | lake build 通过 | exit 0 |
| 5 | theorem + 完整 proof | 每个声明含完整 tactic proof |
| 6 | 每个 lemma 独立文件 | ≤100 行 |

策略级联：`rfl → simp → ring → linarith → nlinarith → omega → exact? → apply? → aesop`

验证：
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts validate-lean \
  --strict --promote --workdir .srs_formalizer
```

产出物：
- `.lean` 证明文件位于 `outputs/lean4/verified/`
- Lean 证明图谱位于 `outputs/graphs/lean-proof.cypher`（由 `leanGraph` Emitter 发射）

### Emitter Group 4：V-Model（vmodel）

```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts emit \
  --group vmodel --workdir .srs_formalizer
```

**FixtureEmitter** (`fixture`)：基于 V-Model 测试方法论生成测试夹具骨架，输出至 `outputs/fixtures/`：
- 单元测试骨架（对应 L3 TLA+ 原子化行为）
- 集成测试骨架（对应 L2 子系统交互）
- 系统测试骨架（对应 L1 系统边界）
- 验收测试骨架（对应 BDD Feature/Scenario）

支持的框架（详见 DESIGN.md §25）：pytest / JUnit / Cucumber / Playwright / fast-check。

**CounterexampleEmitter** (`counterexample`)：从 TLC 反例 trace 生成可复现的 `test_counterexample_*.py` 脚本，写入 `outputs/fixtures/`。仅当存在 TLC 反例时产出。

独立入口：也可通过 `generate-test-fixtures --level --framework` 与 `generate-counterexample-fixtures --trace --framework` 直接调用，绕过 emit 注册表（详见 DESIGN.md §8.3）。

### Emitter Group 5：追溯矩阵（verify）

```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts emit \
  --group verify --workdir .srs_formalizer
```

**TraceabilityMatrixEmitter** (`traceabilityMatrix`)：构建 V-Model 追溯矩阵，将 IR 需求节点与 BDD/TLA+/Lean/fixture 产物交叉引用，输出 `outputs/reports/traceability.md` 与 `traceability.cypher`。

注意：当前注册表中 `verify` 组**仅**含此 Emitter。历史设计中的 `CrossGraphEmitter`（跨图一致性 + 收敛日志）从未落入注册表；跨图一致性检查由编排者在收敛循环中通过组合查询 `query-graph` 与读取各 verified 报告完成，**不**由单一 Emitter 自动产出。

#### 13 个根本问题

编排者通过组合下列图谱回答 13 个根本问题，作为 FINAL 门禁的语义覆盖判据：

| # | 问题 | 所需图谱 |
|:--:|------|------|
| Q1 | 它是什么？（本质定义、核心定位） | 需求图谱 + 系统架构 |
| Q2 | 它做什么？（核心功能、主要作用） | 需求图谱 + 行为图谱 |
| Q3 | 它能做什么？（具体能力、应用场景） | 需求图谱 + 行为 + TLA+ |
| Q4 | 它为什么可以这样？（技术原理、实现逻辑、理论支撑、论文URL、开源实现URL，涉及算法通过 Lean 4 建模） | Lean 证明 + 需求图谱 |
| Q5 | 能不能和其他软件/工具联合使用？（集成场景、联动能力） | 系统架构 + TLA+ |
| Q6 | 它的内部行为是怎样的？（TLA+ 多层子系统建模） | TLA+ + 系统架构 |
| Q7 | 它与其他系统如何交互？（BDD+TLA+ 联合建模） | 行为图谱 + TLA+ |
| Q8 | 它与外部如何交互？（BDD+TLA+ 联合建模） | 行为图谱 + TLA+ + 系统架构 |
| Q9 | 它的工作边界是什么？（联合建模+边界条件） | 行为图谱 + TLA+ + 系统架构 |
| Q10 | 它的兜底方案是什么？（降级、回滚、恢复） | 需求图谱 + 行为图谱 + 系统架构 |
| Q11 | 它的性能约束是什么？（延迟、吞吐、并发上限） | 需求图谱 + TLA+（PerfLatencyInv） |
| Q12 | 它的安全边界在哪里？（认证/授权/审计/加密边界） | 需求图谱 + Lean（SecurityInv/ComplianceInv） |
| Q13 | 它的容量与扩展极限是什么？（数据量、用户数、节点数上限） | 系统架构 + TLA+（AvailInv/CompatInv） |

#### 收敛循环

```
                    ┌──────────────────────────────────────────────────┐
                    │  TraceabilityMatrixEmitter + query-graph 组合查询  │
                    │  交叉引用四层图谱 → 追溯矩阵 + 缺口列表            │
                    └──────────────┬───────────────────────────────────┘
                                   │
                    ┌──────────────▼───────────────────────────────────┐
                    │  13 个根本问题全部可回答?                         │
                    │  (traceability.md 中无 '-' 标记的行)             │
                    └──────────────┬───────────────────────────────────┘
                          │                    │
                         YES                  NO
                          │                    │
                    ┌─────▼──────┐    ┌───────▼──────────────────────┐
                    │ FINAL 验收  │    │ 回退到对应阶段:               │
                    │ 输出交付物  │    │ - 需求缺口 → Frontend         │
                    └────────────┘    │ - 行为缺口 → Backend bdd      │
                                      │ - 形式化缺口 → Backend formal │
                                      │ iteration++ (≤5)              │
                                      │                              │
                                      │ ≥3 次仍未收敛:               │
                                      │ → 苏格拉底拷问 + 可选项 + 推荐 │
                                      │ → 通知人类做决策              │
                                      └──────────────────────────────┘
```

**迭代策略**：

| 迭代 | 行为 |
|:--:|------|
| 1-2 | 自动回退修复（补充图谱、修正不一致） |
| 3-5 | 联网搜索 + 苏格拉底拷问（生成 3-4 个可选项 + 推荐） |
| 5 | 仍未收敛 → 标记 STATE.md BLOCKED，列出所有未解决项，等待人工介入 |

- 最大迭代次数: **5**
- 每次迭代追加 `outputs/reports/convergence-log.jsonl`（编排者维护，非 Emitter 产出）

**苏格拉底升级**：对每个不可回答的问题：
1. 联网搜索确认事实（搜索相关论文、开源项目、技术文档）
2. 每个缺口生成 3-4 个可选项
3. 给出推荐选项及理由
4. 通过 `STATE.md` 向人类提问
5. 人类确认后回退修复

### Emitter Group 6：最终交付（verify-gate FINAL）

```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts verify-gate \
  --workdir .srs_formalizer --stage FINAL
```

最终验收标准：

1. 13 个根本问题全部可回答（追溯矩阵无缺口行）
2. `high_confidence ≥ 9`（至少 9 个问题高置信度）
3. 跨层一致性通过（行为图谱 ↔ TLA+ ↔ Lean 引用闭环）
4. 四级 BDD 严格校验全部通过（`outputs/bdd/verified` + matching 报告）
5. TLA+ 全模块覆盖（若触发），6 类 NFR 不变式全部通过（`outputs/tlaplus/verified` + matching 报告）
6. Lean 4 零 sorry/axiom/warning（若触发）（`outputs/lean4/verified` + matching 报告）
7. Cypher 全量导出完整（`outputs/graphs/srs-graph.cypher`）
8. 追溯矩阵生成（`outputs/reports/traceability.md` + `.cypher`）

FINAL 重新计算当前 verified 输入 hash，且只接受 `artifactKind`、`lifecycle: "verified"`、`passed: true` 和 `sourceHash` 均匹配的报告；过期、跨类型、畸形报告或草稿均不得消费。

全部通过 → 更新 STATE.md Backend = ✅，输出最终交付物清单至 `outputs/reports/deliverables.md`。

## 协作契约

在跨图验证期间，加载专家协作契约作为决策上下文：

```
Read references/collaboration-contract.md
```

该契约定义了三位形式化专家（BDD/TLA+/Lean 4）的协作模式、需求细化联动机制（BDD→TLA+, BDD→Lean 4, TLA+↔Lean 4）、冲突仲裁机制（优先级：Lean 4 > TLA+ > BDD）与统一交付标准。当跨图一致性验证发现专家间分歧时，必须按契约规定的仲裁优先级和上报格式处理，**严禁擅自修改 SRS**。

## 约束

- **Emitter 注册表固定为 10 项**：不得调用未注册的 `CrossGraphEmitter`/`CoverageEmitter`/`JsonEmitter`/`VModelEmitter` 等历史名称
- **GherkinEmitter 四级校验**：任一级失败即打回 Frontend，不进入后续 Emitter
- **TLAEmitter 全模块覆盖**：每个模块强制生成 L1/L2/L3 + 6 类 NFR 不变式；验证只用内置 `tla2tools-1.7.4.jar`
- **LeanEmitter 条件触发**：仅当 IR 节点 `nfrCategory` 为 `security` 或 `compliance` 时生成
- **TLA+ 严格模式**：不允许死锁、无限状态、奇迹、活锁、占位实现
- **Lean 4 平台限制**：Windows 禁止使用，引导 WSL2
- **草稿与 verified 物理隔离**：Emitter 只写 draft；提升需 `validate-* --strict --promote` + matching `sourceHash` 报告
- **SRS 不一致升级**：TLA+ 和 Lean 4 发现设计缺陷时，写入 `SRS_PATCHES.md`，暂停等用户确认
- 最大 5 次收敛迭代，超过则人工介入
- 联网搜索结果必须记录 URL 和时间戳

## 产出物

| 产出 | 位置 | 来源 Emitter |
|------|------|------|
| 需求图谱（Cypher） | `outputs/graphs/srs-graph.cypher` | `cypher` |
| 行为图谱（Cypher） | `outputs/graphs/behavior-graph.cypher` | `behaviorGraph` |
| TLA+ 交互图谱 | `outputs/graphs/tla-interaction.cypher` | `tlaGraph` |
| Lean 证明图谱 | `outputs/graphs/lean-proof.cypher` | `leanGraph` |
| BDD Feature 草稿 | `outputs/bdd/draft/*.feature` | `gherkin` |
| BDD Feature 验证 | `outputs/bdd/verified/*.feature` + `validation/*.json` | 子代理 + `validate-bdd --promote` |
| TLA+ 规约草稿 | `outputs/tlaplus/draft/*.tla` + matching `*.cfg` | `tlaSpec` |
| TLA+ 规约验证 | `outputs/tlaplus/verified/*.tla` + matching `*.cfg` + `validation/*.json` | 子代理 + `validate-tla --promote` |
| Lean 4 证明草稿 | `outputs/lean4/draft/{lakefile.*, **/*.lean, lean-toolchain?}` | `leanProof` |
| Lean 4 证明验证 | `outputs/lean4/verified/{lakefile.*, **/*.lean, lean-toolchain?}` + `validation/*.json` | 子代理 + `validate-lean --promote` |
| 测试夹具 | `outputs/fixtures/test_*.py` 等 | `fixture` |
| 反例复现脚本 | `outputs/fixtures/test_counterexample_*.py` | `counterexample` |
| 追溯矩阵 | `outputs/reports/traceability.md` + `.cypher` | `traceabilityMatrix` |
| 收敛日志 | `outputs/reports/convergence-log.jsonl` | 编排者维护 |
| 交付清单 | `outputs/reports/deliverables.md` | 编排者维护 |
