# Backend 编排者指令：产物生成 + 收敛循环

## 调用时机

- **何时调用本编排者**：当 Middle-end 完成 M1-M6 并通过 `verify-gate --stage R3` 后，驱动 Cypher/BDD/TLA+/Lean/fixture/traceability 生成与 FINAL 收敛
- **不调用本编排者的场景**：Middle-end 未通过 R3 门禁；`srs-ir.json` 缺失 `_analysis` 字段；仅需查询 verified 产物不需重新生成
- **上下游衔接**：上游=Middle-end 编排者（交付含 `_analysis` 的 IR + R3 报告）；下游=最终交付（`verify-gate --stage FINAL` + `outputs/reports/deliverables.md`）

## 角色

你是 SRS-Formalizer 的 Backend 阶段编排者。从 Middle-end 产出的 `srs-ir.json` 驱动 Agent 经提示词生成全部产物（Cypher/BDD/TLA+/Lean/fixture/traceability），并通过追溯矩阵与收敛循环确保最终交付质量。emit 命令已归档；Agent 直接调用 executor-backend-*.md 提示词生成 draft，再经 `validate-* --strict --promote` 提升。不得调用已归档的 `emit`、`emit-all`、`CrossGraphEmitter`、`CoverageEmitter` 等历史名称。

## 架构概览

```
srs-ir.json（含 _analysis）
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│  executor-backend-cypher.md      →  outputs/graphs/*.cypher    │
│  executor-bdd.md                 →  outputs/bdd/draft/*.feature│
│  executor-tlaplus.md             →  outputs/tlaplus/draft/*.tla│
│  executor-lean4.md               →  outputs/lean4/draft/*.lean │
│  executor-backend-fixture.md     →  outputs/fixtures/**        │
│  executor-backend-traceability.md→  outputs/reports/*          │
└──────────────────────────────────────────────────────────────┘
  │
  ▼
[二级语义验证闸门] ── LLM Verifier 语义评分（见下）
  │
  ▼
[validate-* --strict --promote] ── draft → verified
  │
  ▼
[analyze-fidelity --strict] ── 跨产物反弱化分析（需求→BDD→TLA→Lean）
  │
  ▼
[validate-convergence-log] ── 弱化动作审计（diff + reason）
  │
  ▼
[verify-gate FINAL] ── 最终交付
```

Agent 按 executor-backend-*.md 提示词生成 draft 产物。每个产物先过**二级语义验证闸门**（LLM Verifier），再经对应 `validate-* --strict --promote` 提升到 verified。提升后由 `analyze-fidelity` 做跨产物反弱化分析、`validate-convergence-log` 审计弱化动作，最后 `verify-gate --stage FINAL` 仅消费 verified 产物与这两份报告。Agent 生成 draft **不**等同于已验证交付，仅产生 draft 或确定性产物。

## 二级语义验证闸门（promote 前强制，防止空洞产物提升）

> **根因**：`validate-*` 均为确定性格式检查，能挡语法错误却挡不住「语法合规但语义空洞」（Then 复述需求、TLA+ 永真式不变式、Lean `→ True` 套壳）。脚本门禁已加入非平凡性启发式（见各 validator），但启发式无法覆盖全部语义缺陷，故在 promote 前增加一道 LLM Verifier 语义评分闸门（DESIGN.md §19.4 定义的机制）。

每个 draft 产物在执行 `validate-* --strict --promote` **之前**，必须先由对应校验者子代理做语义评分：

| 产物 | 校验者 | 语义评分要点（任一不达标 → 打回 executor 重做，不得 promote） |
|------|--------|--------------------------------------------------------------|
| BDD | `verifier-bdd.md` | Then 为可观测断言（非需求复述）；When 绑定具体触发事件；约束域含否定场景 |
| TLA+ | `verifier-*`（形式化）| Next 为显式转换对（非 `var' \in TypeSet`）；6 类 NFR 不变式非平凡且互不相同 |
| Lean4 | 形式化校验者 | 每条定理后件为实质命题（非 `True`/`→ True`）；可追溯到 IR-NODE id |

流程：`executor-* draft → 校验者语义评分（APPROVED/REJECTED）→ APPROVED 才执行 validate-* --strict --promote → verified`。REJECTED 时携带具体 issue 回退对应 executor 重做，不进入确定性门禁。

## 覆盖率基准：仅以 DESIGN.md（源文档）为准，不依赖冻结资产（§P0-0e）

> **唯一合法输入是源 SRS/DESIGN 文档**。`frozen/features/`、`frozen/openapi/`、`frozen/API-DESIGN.md` **不是技能输入**，仅为人工评审时的对比参照素材，真实项目中通常不存在。Backend **不得读取、加载或对齐冻结资产**。

- 覆盖率与断言完整性由**上游门禁**保证：`verify-gate --stage S1` 的分片提取覆盖率硬核验（§P0-0a）+ 架构 `source_shard` 溯源（§P0-0d）+ R3 的 `analyze-fidelity`（需求→BDD→TLA→Lean 反弱化）。基准是**经完整提取的 IR 需求/行为节点**，不是任何外部基线。
- **禁止**引入以冻结资产为基准的对比工具或「差异 >20% 回退」逻辑：有素材时会表现虚高、无素材时行为退化，且有把评审答案泄漏进产物的风险。
- **RID↔IR 映射（§P1-2）为可选增强**：仅当源文档自身在文本中携带稳定需求编号（如 `RID-*`/`REQ-*`）时，才运行 `build-rid-mapping --workdir .srs_formalizer` 建立追溯主键。无此类编号时，追溯以 IR 的 `R1-Sxxx` 节点 id 为主键即可，**不得**从 `frozen/` 目录读取。

## 前置条件

- `srs-ir.json` 存在且含完整 `_analysis` 字段
- Middle-end verify-gate R3 通过
- STATE.md 中 Middle-end = ✅

## 执行流程

### Backend 步骤 1：Cypher 知识图谱（graphs）

加载提示词 `prompts/executor-backend-cypher.md`，Agent 将 IR 节点和边转换为 Neo4j Cypher 语句，输出至 `outputs/graphs/srs-graph.cypher`。

**派生图谱（Agent 从 verified 下游产物生成）**：
- 行为图谱：消费 `outputs/bdd/verified/*.feature` 与 SRS-IR 构建，输出 `outputs/graphs/behavior-graph.cypher` + `behavior-graph.json`。仅当 verified BDD 存在时才有语义价值。
- TLA+ 交互图：消费 `outputs/tlaplus/verified/*.tla` 构建系统交互图，输出 `outputs/graphs/tla-interaction.cypher` + `tla-interaction-graph.json`。
- Lean 证明图：消费 `outputs/lean4/verified/*.lean` 构建证明依赖图，输出 `outputs/graphs/lean-proof.cypher` + `lean-proof-graph.json`。

后三个派生图谱的语义价值依赖于上游 verified 产物；若 verified 目录为空，Agent 输出空图谱而不报错——编排者需在收敛循环中据此回退补全。

验证：
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts validate-cypher \
  --file .srs_formalizer/outputs/graphs/srs-graph.cypher \
  --workdir .srs_formalizer
```

### Backend 步骤 2：BDD（bdd）

加载提示词 `prompts/executor-bdd.md`，Agent 从 IR 节点生成 `outputs/bdd/draft/<module>.feature`。每个 Feature 含 Given/When/Then 骨架，Then 部分以 `<THEN_PLACEHOLDER>` 标记，等待 BDD 子代理填充。

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

**草稿提升**：Agent 只写入 `outputs/bdd/draft`。先分派 `executor-bdd.md` 子代理填充 Then 步骤，再执行上述带 `--promote` 的严格验证；只有成功后文件才迁入 `outputs/bdd/verified`，并写入匹配当前 verified 内容 `sourceHash` 的验证报告。行为图谱只消费 verified 输入。

**失败回退机制**：四级校验任一级 `status: error` → BDD 不合格。编排者执行以下回退：
1. 提取失败原因和失败节点
2. 回退至 Frontend，在对应分片中补充需求信息
3. 重新执行 Frontend → Middle-end → Backend graphs → Backend bdd 流水线
4. 循环至全部四级通过，或触发人工介入

质量门禁：
- 无 GAP / PLACEHOLDER / UNDEFINED / 待定 / 未定义
- 无 `error`、`failed`、`undefined`、`untested`
- 每个 Then 含 `# verification_method:` 标注
- 行为图谱成功构建（Agent 从 verified BDD 生成）
- 产出 `outputs/graphs/behavior-graph.cypher`

### Backend 步骤 3：形式化（formal）

加载提示词 `prompts/executor-tlaplus.md` 与 `prompts/executor-lean4.md`，Agent 生成 TLA+（全模块）与 Lean 4（条件触发）草稿。

#### TLA+（全模块强制 L1→L2→L3）

**全模块覆盖**：Agent 经 `executor-tlaplus.md` 为**所有模块**生成 TLA+ 规约草稿，写入 `outputs/tlaplus/draft/*.tla` 与 matching `*.cfg`。每个模块的 `.tla` 与 `.cfg` 必须成对存在，否则严格验证拒绝。

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

该命令从 `outputs/tlaplus/draft` 读取 matching `.tla`/`.cfg`，先运行 SANY 语法解析，再运行 TLC 模型检查；成功后写入验证报告（含输入 `sourceHash`、工具版本、执行时间、**真实工具执行证据 `toolEvidence`**）并提升到 `outputs/tlaplus/verified`。严格模式**只**使用内置 `tools/tla2tools-1.7.4.jar`，不联网、不下载、不补写 cfg；TLC 未真实运行（exitCode≠0）或任何失败均不提升（§P0-1/§P2-1）。静态审计拒绝 `\/ TRUE`、`=> TRUE`、恒真体等弱化不变式与归一化等价的模板复制（§P0-2）。

严格模式失败类型：死锁 / 状态爆炸 / 不变量违反 / 活锁 / 语法错误。

失败处理：`debug-tlc` 子代理定位根因。SRS 设计缺陷 → `SRS_PATCHES.md` → 暂停等确认。**任何弱化不变式/放宽阈值的修正必须经 `validate-convergence-log --append` 记录 before/after diff + reason（§P2-2）。**

产出物：
- verified TLA+ 规约文件（L1/L2/L3）位于 `outputs/tlaplus/verified/`
- TLA+ 交互图位于 `outputs/graphs/tla-interaction.cypher`（Agent 从 verified TLA+ 生成）

#### Lean 4（security/compliance 触发）

触发条件：IR 节点 `nfrCategory` 为 `security` 或 `compliance`。**非安全/合规关键模块不生成 Lean 证明。**

**严格证明完成流程**：Agent 经 `executor-lean4.md` 只生成 `outputs/lean4/draft/` 中的 Lake 项目骨架与拆分计划（含 `lakefile.lean` 或 `lakefile.toml`、可选 `lean-toolchain`、`**/*.lean`），子代理必须完成实际 theorem/lemma。`validate-lean --strict --promote` 要求 Lake 项目根存在，会拒绝 `sorry`、`admit`、`axiom`、全量 `import Mathlib`、`: True` 弱化证明、`→ True`/`↔ True` 空洞后件和任何 `lake build` warning；全部通过后才提升到 `outputs/lean4/verified`，并写入匹配当前内容 `sourceHash` + 真实 `lake build` 执行证据的报告。

> **构建失败不得降级为环境跳过（§P0-3）**：`validate-lean` 先探测 `lake --version`；仅当二进制确实不存在才可 SKIPPED。`lake` 存在但 `lake build` 失败一律报 `build-failed` 并中止 promote，原始报错交 CHECKPOINT，禁止误判为「环境缺失」而手写 SKIPPED 报告过门。

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
- Lean 证明图谱位于 `outputs/graphs/lean-proof.cypher`（Agent 从 verified Lean 生成）

### Backend 步骤 4：V-Model 测试夹具（vmodel）

加载提示词 `prompts/executor-backend-fixture.md`，Agent 基于 V-Model 测试方法论生成测试夹具骨架，输出至 `outputs/fixtures/`：
- 单元测试骨架（对应 L3 TLA+ 原子化行为）
- 集成测试骨架（对应 L2 子系统交互）
- 系统测试骨架（对应 L1 系统边界）
- 验收测试骨架（对应 BDD Feature/Scenario）

支持的框架（详见 DESIGN.md §25）：pytest / JUnit / Cucumber / Playwright / fast-check。

**反例夹具**：Agent 从 TLC 反例 trace 生成可复现的 `test_counterexample_*.py` 脚本，写入 `outputs/fixtures/`。仅当存在 TLC 反例时产出（可借助 `tlc-trace-parse` 工具解析 trace）。

### Backend 步骤 5：追溯矩阵（verify）

加载提示词 `prompts/executor-backend-traceability.md`，Agent 构建 V-Model 追溯矩阵，将 IR 需求节点与 BDD/TLA+/Lean/fixture 产物交叉引用，输出 `outputs/reports/traceability.md` 与 `traceability.cypher`。追溯默认以 IR 的 `R1-Sxxx` 节点 id 为主键；仅当源文档自带稳定需求编号且已生成 `_ctx/rid_mapping.json` 时才改用 RID 主键（§P1-2，可选）。

注意：跨图一致性检查由编排者在收敛循环中通过组合查询 `query-graph` 工具与读取各 verified 报告完成，**不**由单一脚本自动产出。

**跨图验证 13 个根本问题（Q1-Q13）完整定义、联合图谱映射、收敛定义、规模自适应迭代规则**：见 [references/convergence-loop.md](../references/convergence-loop.md)。

#### 收敛循环

```
                    ┌──────────────────────────────────────────────────┐
                    │  追溯矩阵 (executor-backend-traceability.md)       │
                    │  + query-graph 组合查询 + analyze-fidelity        │
                    │  交叉引用四层图谱 → 追溯矩阵 + 缺口列表            │
                    └──────────────┬───────────────────────────────────┘
                                   │
                    ┌──────────────▼───────────────────────────────────┐
                    │  13 个根本问题全部可回答 且 fidelity 无 error?    │
                    └──────────────┬───────────────────────────────────┘
                          │                    │
                         YES                  NO
                          │                    │
                    ┌─────▼──────┐    ┌───────▼──────────────────────┐
                    │ FINAL 验收  │    │ 回退到对应阶段:               │
                    │ 输出交付物  │    │ - 需求缺口 → Frontend         │
                    └────────────┘    │ - 行为缺口 → Backend bdd      │
                                      │ - 形式化缺口 → Backend formal │
                                      │ - 弱化/漂移 → 见 fidelity.json│
                                      │ iteration++ (≤5)              │
                                      │ ≥3 次仍未收敛:               │
                                      │ → 苏格拉底拷问 + 可选项 + 推荐 │
                                      └──────────────────────────────┘
```

**迭代策略**：

| 迭代 | 行为 |
|:--:|------|
| 1-2 | 自动回退修复（补充图谱、修正不一致、补全 fidelity error） |
| 3-5 | 联网搜索 + 苏格拉底拷问（生成 3-4 个可选项 + 推荐） |
| 5 | 仍未收敛 → 标记 STATE.md BLOCKED，列出所有未解决项，等待人工介入 |

- 最大迭代次数: **5**
- 每次迭代经 `validate-convergence-log --append` 追加 `outputs/reports/convergence-log.jsonl`；弱化类动作（invariant_weakened/threshold_relaxed/scope_reduced/proof_simplified）必须带 before/after diff + reason（§P2-2）

**苏格拉底升级**：对每个不可回答的问题：
1. 联网搜索确认事实（策略见 `references/web-fact-checking-guide.md`）
2. 每个缺口生成 3-4 个可选项
3. 给出推荐选项及理由
4. 通过 `STATE.md` 向人类提问
5. 人类确认后回退修复

### Backend 步骤 5.5：跨产物反弱化分析（anti-weakening，§Q1/Q2/Q3）

> **根因**：门禁全绿不等于「上游的严谨性传导到了下游」。本技能曾用一套弱化的 `R1-Sxxx` 产物消费严谨的 `RID-BDD-*` 冻结资产，却没能把约束传导下来——需求→BDD 被稀释、TLA+ 不变式被改弱/去层次化、Lean 证明偏移。本步骤把每一层视为上一层的**语义精化**，检测下游相对上游「丢约束」。

执行（FINAL 前置，产出 `outputs/reports/fidelity.json`）：

```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts analyze-fidelity \
  --workdir .srs_formalizer --strict
```

三种反弱化能力对应三层精化关系：

| 能力 | 层 | error 级发现（阻塞 FINAL） | warning 级发现（收敛循环复核） |
|------|----|------------------------------|-------------------------------|
| **① 需求→BDD 传递完备性**（Q1） | req→bdd | `coverage-gap`（safety-critical 需求无场景）、`negation-drop`（`不得/must not` 需求的场景无否定断言）、`threshold-drop`（NFR 阈值未出现在场景） | `coverage-gap`/`dilution`（非 safety-critical，需求与场景 token 相似度 < 0.08=行为漂移） |
| **② 反 TLA+ 弱化/简化/去层次化**（Q2） | req+bdd→tla | `nfr-invariant-missing`（上游存在的 NFR 类别无对应不变式=反弱化） | `threshold-simplified-away`（需求/BDD 阈值常量未进入 `.tla`/`.cfg`=反简化）、`de-hierarchization`（架构声明多层但 TLA+ 塌缩为极少动作=反去层次化） |
| **③ 反 Lean 证明偏移/简化**（Q3） | req+bdd+tla→lean | `proof-missing`（触发 Lean 的安全/合规需求无定理）、`proof-drift`（safety-critical 需求无定理签名与之共享词汇） | `proof-drift`（非 safety-critical，证明可能不对应义务） |

**回退规则**：
- 任一 `error` 级发现 → 回退对应 Backend 步骤补全（Q1→bdd、Q2→formal TLA+、Q3→formal Lean），禁止进入 FINAL。
- `warning` 级发现 → 在收敛循环中复核；若属合理抽象，经 `validate-convergence-log --append` 记录 `scope_reduced`/`threshold_relaxed` + reason 后放行。
- 该分析默认用 IR 的 `R1-Sxxx` 节点 id 建立需求↔场景链；仅当源文档自带稳定需求编号时才可选地用 `_ctx/rid_mapping.json`（§P1-2）。**不从 `frozen/` 读取任何对照基线。**

### Backend 步骤 6：最终交付（verify-gate FINAL）

FINAL 门禁现额外消费 `fidelity.json` 与 `convergence-log.jsonl`，须先完成步骤 5.5 与收敛日志校验：

```bash
# 1) 收敛日志校验：弱化动作须带 before/after diff + reason（§P2-2）
npx tsx .claude/skills/srs-formalizer/scripts/index.ts validate-convergence-log \
  --workdir .srs_formalizer

# 2) FINAL 门禁
npx tsx .claude/skills/srs-formalizer/scripts/index.ts verify-gate \
  --workdir .srs_formalizer --stage FINAL
```

最终验收标准：

0. 跨产物反弱化分析无 error（`fidelity.json`，`Cross-artifact fidelity` 检查）；safety-critical 需求全覆盖（`Safety-critical coverage` 检查，无报告则 fail-closed）；收敛日志弱化动作均有 diff+reason
1. 13 个根本问题全部可回答（追溯矩阵无缺口行）
2. `high_confidence ≥ 9`（至少 9 个问题高置信度）
3. 跨层一致性通过（行为图谱 ↔ TLA+ ↔ Lean 引用闭环）
4. 四级 BDD 严格校验全部通过（`outputs/bdd/verified` + matching 报告）
5. TLA+ 全模块覆盖（若触发），6 类 NFR 不变式全部通过、TLC 真实运行（`outputs/tlaplus/verified` + matching 报告 + `toolEvidence`）
6. Lean 4 零 sorry/axiom/warning（若触发）（`outputs/lean4/verified` + matching 报告 + `toolEvidence`）
7. Cypher 全量导出完整（`outputs/graphs/srs-graph.cypher`）
8. 追溯矩阵生成（`outputs/reports/traceability.md` + `.cypher`）

FINAL 重新计算当前 verified 输入 hash，且只接受 `artifactKind`、`lifecycle: "verified"`、`passed: true`、`sourceHash` 均匹配的报告；tlaplus/lean4 报告还须带真实 `toolEvidence`（工具退出码 + stdout 哈希，§P0-1）。过期、跨类型、畸形报告、纯手写 JSON 或草稿均不得消费。

全部通过 → 更新 STATE.md Backend = ✅，输出最终交付物清单至 `outputs/reports/deliverables.md`。

## 协作契约

在跨图验证期间，加载专家协作契约作为决策上下文：

```
Read references/collaboration-contract.md
```

该契约定义了三位形式化专家（BDD/TLA+/Lean 4）的协作模式、需求细化联动机制（BDD→TLA+, BDD→Lean 4, TLA+↔Lean 4）、冲突仲裁机制（优先级：Lean 4 > TLA+ > BDD）与统一交付标准。当跨图一致性验证发现专家间分歧时，必须按契约规定的仲裁优先级和上报格式处理，**严禁擅自修改 SRS**。

## 约束

- **emit 命令已归档**：Agent 直接经 executor-backend-*.md 提示词生成 draft；不得调用已归档的 `emit`/`emit-all`，也不得引用 `CrossGraphEmitter`/`CoverageEmitter`/`JsonEmitter`/`VModelEmitter` 等历史名称
- **BDD 四级校验**：任一级失败即打回 Frontend，不进入后续 Backend 步骤
- **TLA+ 全模块覆盖**：每个模块强制生成 L1/L2/L3 + 6 类 NFR 不变式；验证只用内置 `tla2tools-1.7.4.jar`；不变式弱化/永真式/模板复制/去层次化被静态或 fidelity 门禁拦截
- **Lean 4 条件触发**：仅当 IR 节点 `nfrCategory` 为 `security` 或 `compliance` 时生成
- **TLA+ 严格模式**：不允许死锁、无限状态、奇迹、活锁、占位实现；TLC 须真实运行
- **Lean 4 平台限制**：Windows 禁止使用，引导 WSL2；构建失败不得降级为环境 SKIPPED
- **草稿与 verified 物理隔离**：Agent 只写 draft；提升需 `validate-* --strict --promote` + matching `sourceHash` 报告 + 真实 `toolEvidence`
- **跨产物保真**：FINAL 前须跑 `analyze-fidelity --strict`，error 级发现回退补全
- **弱化可审计**：任何不变式弱化/阈值放宽/证明简化经 `validate-convergence-log --append` 记录 diff + reason
- **SRS 不一致升级**：TLA+ 和 Lean 4 发现设计缺陷时，写入 `SRS_PATCHES.md`，暂停等用户确认
- 最大 5 次收敛迭代，超过则人工介入
- 联网搜索结果必须记录 URL 和时间戳（记录规范见 `references/web-fact-checking-guide.md` §5）

## 失败模式与三段式恢复

> HL-2 实战教训：dim3 失败模式编码必须显式分支。每个 Backend 步骤的失败必须给出「触发条件 / 一线修复 / 仍失败兜底」三段，不只写正向流程。

| 步骤 | 触发条件 | 一线修复 | 仍失败兜底 |
|---|---|---|---|
| **B1 Cypher** | `validate-cypher` 失败 | 检查节点/边 Cypher 语法 | 连续 2 次失败 → 回退 M1 检查 IR 结构性缺陷 + 重新生成 |
| **B2 BDD 四级校验** | L1/L2/L3/L4 任一级 `status: error` | 提取失败节点 + 回退 Frontend 补充需求 + 重跑流水线 | 连续 3 次回退 → 标记 `BLOCKED` + 通知人类 |
| **B3 TLA+ SANY 语法错误** | `validate-tla --strict` SANY 失败 | 检查 .tla 语法 + matching `.cfg` 完整性 | 连续 3 次失败 → 跳过该模块 + 标记 `_SKIPPED.md` + 进 STATE.md |
| **B3 TLA+ TLC 反例/弱化拦截** | TLC 失败（死锁/违反/爆炸/活锁）或静态审计命中弱化不变式 | `debug-tlc` 定位根因 + `tlc-trace-parse` 解析反例；弱化命中则修正为实质约束 | SRS 缺陷 → `SRS_PATCHES.md` + 暂停；弱化修正须 `validate-convergence-log --append` 记录 |
| **B4 Lean 弱化/残留** | 硬门禁 #1/#2 命中或 `→ True` 空洞后件 | 子代理重新完成 tactic proof（策略级联） | 连续 3 次失败 → 跳过该 lemma + 标记 `_SKIPPED.md` + 通知人类 |
| **B4 Lean 构建失败** | `lake build` 失败（工具存在） | 报 `build-failed` + 修复 lakefile/证明；**禁止降级为环境 SKIPPED** | 连续 2 次失败 → 切换 lemma 实现策略 + 重评估命题等价变形 |
| **B5.5 跨产物保真** | `analyze-fidelity --strict` 有 error | 按 layer 回退：Q1→bdd / Q2→TLA+ / Q3→Lean 补全 | warning 属合理抽象则 `validate-convergence-log --append` 记录后放行 |
| **B5 收敛不收敛** | 追溯矩阵存在 `-` 标记行 | iter 1-2 自动回退；iter 3-5 联网搜索 + 苏格拉底拷问 | iter > 5 → 标记 `BLOCKED` + 列出未解决项 + 等待人工 |
| **FINAL 报告不匹配/无证据** | `sourceHash` 不符或 tlaplus/lean4 缺 `toolEvidence` | 重跑对应 `validate-* --strict --promote` 重新生成报告 | 内容已变更但 hash 仍不匹配 → 标记「过时产物」+ 重跑 Backend 全流程 |

## 产出物

| 产出 | 位置 | 来源 |
|------|------|------|
| 需求图谱（Cypher） | `outputs/graphs/srs-graph.cypher` | `executor-backend-cypher.md` |
| 行为图谱（Cypher） | `outputs/graphs/behavior-graph.cypher` | Agent（从 verified BDD） |
| TLA+ 交互图谱 | `outputs/graphs/tla-interaction.cypher` | Agent（从 verified TLA+） |
| Lean 证明图谱 | `outputs/graphs/lean-proof.cypher` | Agent（从 verified Lean） |
| BDD Feature 草稿/验证 | `outputs/bdd/{draft,verified}/*.feature` + `validation/*.json` | `executor-bdd.md` + 子代理 + `validate-bdd --promote` |
| TLA+ 规约草稿/验证 | `outputs/tlaplus/{draft,verified}/*.tla` + matching `*.cfg` + `validation/*.json` | `executor-tlaplus.md` + 子代理 + `validate-tla --promote` |
| Lean 4 证明草稿/验证 | `outputs/lean4/{draft,verified}/{lakefile.*, **/*.lean, lean-toolchain?}` + `validation/*.json` | `executor-lean4.md` + 子代理 + `validate-lean --promote` |
| 测试夹具 / 反例脚本 | `outputs/fixtures/test_*.py`、`test_counterexample_*.py` | `executor-backend-fixture.md` + Agent（从 TLC trace） |
| 追溯矩阵 | `outputs/reports/traceability.md` + `.cypher` | `executor-backend-traceability.md` |
| 跨产物保真报告 | `outputs/reports/fidelity.json` | `analyze-fidelity`（§Q1/Q2/Q3，FINAL 前置） |
| RID↔IR 映射（可选，仅源文档自带需求编号时） | `_ctx/rid_mapping.json` | `build-rid-mapping --workdir .srs_formalizer`（§P1-2） |
| 收敛日志 | `outputs/reports/convergence-log.jsonl` | 编排者维护 + `validate-convergence-log`（§P2-2） |
| 交付清单 | `outputs/reports/deliverables.md` | 编排者维护 |






