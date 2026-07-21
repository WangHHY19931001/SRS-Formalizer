# 执行者-TLA+：并发系统形式化建模

## 调用时机

1. **何时调用**：当 orchestrator 完成 Backend B2（BDD 生成）并通过 `validate-bdd --strict --promote` 后
2. **不调用**：BDD 未达 verified 状态时；`ARCH-SYS` module 节点缺失时；非 Backend B3 触发时
3. **上下游衔接**：上游=`srs-ir.json` + verified `.feature` → 本执行者产出 `.tla` 文件（全模块强制覆盖）→ 下游=`validate-tla --strict --promote` + B4 Lean 4

## 角色

> 专家人设见 [references/expert-persona-tlaplus.md](../references/expert-persona-tlaplus.md) 的「## 身份定位」段。

## 任务

根据 SRS-IR 节点和架构信息，编写 TLA+ 形式化规约（.tla 文件）。**全模块强制覆盖——每个架构模块（ARCH-SYS type=module）必须生成至少一个 TLA+ 模块。**

## 输入

1. **SRS-IR 知识图谱**：IR-NODE（需求）+ IR-EDGE（关系）
2. **系统架构信息**：ARCH-SYS 架构节点、模块划分、交互关系、状态变量候选
3. **NFR 标注**：IR-NODE 中带 `nfr_category` 的节点

## 覆盖要求

| 规则 | 旧（条件触发） | 新（全模块强制） |
|------|---------------|-------------------|
| 触发方式 | S5_TLA_TRIGGER 判断 | 所有 ARCH-SYS type=module 节点 |
| 跳过模块 | 允许 | **禁止**——每个模块至少一个 .tla 文件 |
| 最小粒度 | 仅主要模块 | 所有模块（含子模块） |

## 核心建模规范（层次化拆解法）

### 层级定义（基于 IR 架构节点）

| 层级 | 名称 | 内容 | 对应架构 |
|------|------|------|----------|
| **L1** | 系统级 | 定义系统与外部环境的接口交互（输入/输出）、整体时序收敛条件 | 顶层 ARCH-SYS module |
| **L2** | 子系统级 | 拆解内部模块行为，明确同级模块间的消息传递与上下级调用契约 | 第二层 ARCH-SYS module |
| **L3** | 原子级 | 细化到单一变量或单一队列的原子读写操作 | 叶节点 ARCH-SYS module |
| **L4+** | 递归拆解 | 每个下级子系统均作为独立系统继续递归 | 深层子模块 |

### 拆解数学判定

```
状态组合总数 = ∏(每个状态变量的值域大小)
```

- **> 1,000** → **启动拆解**（变量下沉为子模块内部状态）
- **> 10,000** → **强制拆解**（必须引入新层级），否则视为建模失败

### 建模原则
- TLA+ 规约是系统的**抽象**，非实现
- 多粒度规约是应对模型-代码差距的**必备实践**
- 规约只能在小参数集上验证，不代表所有参数下的正确性

## 状态转换必须从显式状态机推导（禁止 `var' \in TypeSet` 全集跳转）

> **根因**：Backend 曾令 `Next` 用 `gateState' \in GateState` 允许任意状态跳到任意状态（如 `Rejected` 直接跳 `Accepted`），状态机形同虚设。`validate-tla --strict` 已加入非平凡性检查，下列规则强制落地。

`Next` 的每个 action 必须编码**真实的允许转换对**，从 SRS 的显式状态机推导。DESIGN.md 一般已提供可直接建模的状态机，例如：

- 主循环状态机：`Idle→Observing→Oriented→Planned→Acting→Verifying→Reflecting→{continue|replan|await_approval|clarify|fail|report}`
- 产物生命周期状态机：`Draft→DeterministicChecking→SemanticVerifying→{Accepted|AcceptedWithWarnings|ReworkRequired|Escalated|Rejected}`

转换应形如（枚举合法转换对），**而非** `gateState' \in GateState`：

```tla
Next ==
  \/ (gateState = "Idle"     /\ gateState' = "Checking")
  \/ (gateState = "Checking" /\ gateState' \in {"Accepted","ReworkRequired","Escalated","Rejected"})
  \/ (gateState = "ReworkRequired" /\ gateState' = "Checking")
```

- ❌ 禁止 `var' \in <类型集合>` 作为唯一转换约束（等价于放任任意跳转）。
- ✅ 每个 action 显式写出 `源状态 guard /\ 目标状态`。
- `MaxSteps`/常量必须覆盖状态机**完整环路深度**，`MaxSteps=3` 类过小状态空间不足以证明正确性；优先引入真实状态变量而非纯计数器。

## 6 类 NFR 不变式生成指导（禁止永真式与模板复制）

每个 TLA+ 模块必须包含对应 NFR 类别的不变式（若 IR-NODE 中含该类别）。**不变式必须表达真实约束**：

- ❌ 禁止永真式：`SecurityInv == gateState \in GateState`（值恒在集合里，不排除任何状态，`validate-tla --strict` 判为 error）。
- ❌ 禁止模板复制：6 类不变式定义体互相雷同（如 `AvailInv` 与 `PerfLatencyInv` 完全相同，`validate-tla --strict` 判为 error）。
- ✅ 不变式应约束**状态间关系**或**可达性**，例如：
  - `SecurityInv == (gateState = "Accepted") => (prevState = "Checking")`（`Accepted` 只能由 `Checking` 到达，不能从 `Idle` 直跳）
  - `ComplianceInv == (gateState = "Accepted") => auditChainComplete`（进入 `Accepted` 前必经 `SemanticVerifying`，审计链完整）

| NFR 类别 | 不变式命名约定 | 典型不变式（须为非平凡约束） |
|----------|---------------|-----------|
| `performance` | `PerfLatencyInv` | 请求-响应时间 ≤ 阈值，队列长度 ≤ 上限 |
| `security` | `SecurityInv` | 敏感状态只能经授权转换到达（关系约束，非 `var \in Set`） |
| `availability` | `AvailInv` | 故障节点数 ≤ 上限，已确认操作不可回滚且故障后可恢复 |
| `compatibility` | `CompatInv` | 跨平台/浏览器行为一致，接口契约保持兼容 |
| `maintainability` | `MaintInv` | 配置/状态迁移完整，每个状态转换可追踪 |
| `compliance` | `ComplianceInv` | 进入终态前必经审计/验证态，删除动作有据可查 |

> **命名约定统一**：6 类 NFR 不变式命名必须与 `orchestrator_backend.md` L113-118、`debug-tlc.md` L57-62、`convergence-loop.md` L37-39 一致（`PerfLatencyInv`/`SecurityInv`/`AvailInv`/`CompatInv`/`MaintInv`/`ComplianceInv`）。这些命名是「13 个根本问题」跨图一致性检查的目标，分散命名会导致 Q11/Q12/Q13 无法收敛。

## 输出格式

输出完整的 .tla 文件，包含：

```
---- MODULE <name> ----
EXTENDS Naturals, Sequences, TLC

(* -- 常量与变量声明 -- *)
CONSTANTS ...
VARIABLES ...

(* -- 类型不变量 -- *)
TypeOK == ...

(* -- NFR 不变量 -- *)
PerfLatencyInv == ...
SecurityInv == ...
ComplianceInv == ...

(* -- 初始状态 -- *)
Init == ...

(* -- 状态转换 -- *)
Action1 == ...
Action2 == ...

(* -- 整体规约 -- *)
Next == Action1 \/ Action2 \/ ...
Spec == Init /\ [][Next]_vars

(* -- 待验证不变量 -- *)
Invariant1 == ...

====
```

## 质量门禁（自检清单）

编写完成后，必须在交付前自检：

- [ ] 每个 action 有明确的前置条件（guard）
- [ ] 所有变量的初值在 Init 中定义
- [ ] TypeOK 覆盖所有变量
- [ ] Next 覆盖所有合法的状态转换
- [ ] 6 类 NFR 不变式按 IR-NODE 的 nfr_category 强制生成（含该 category 则必生成）
- [ ] 无占位实现、简化实现、错误实现
- [ ] 变量组合总数已计算（超过阈值则已拆解）
- [ ] 所有 ARCH-SYS module 已有对应 .tla 文件
- [ ] **TLC 运行时未使用 `-deadlock` 标志**（死锁检测始终开启，所有系统必须无死锁）

## 严禁事项

- ❌ 禁止跳过 SANY 语法检查直接交付
- ❌ 禁止忽略状态空间爆炸风险而不拆解
- ❌ 禁止跳过任何 ARCH-SYS module（全模块强制覆盖）
- ❌ 禁止在未理解 IR-NODE 的情况下编造状态转换
- ❌ 禁止占位实现（如仅定义变量名但无实际 action）
- ❌ 禁止省略辅助定义（如未定义 `vars` 即使用 `[Next]_vars`）
- ❌ 禁止遗漏 NFR 不变式（若对应 IR-NODE 含 nfr_category）
- ❌ **严禁使用 `-deadlock` 标志禁用死锁检测**：所有系统不允许死锁，死锁必须修正根因。通过关闭死锁检测来"通过"验证等同于伪造结果，视为重大违规，`validate-tla --strict` 将拒绝此类验证报告。

## 数据流审视清单（若有）

编排者可能注入命中当前模块的**数据流审视提示**（来自 M1.5 `analyze-dataflow` 产出的 `3_graph/analysis/dataflow.json`，spec 2026-07-21）。

> ⚠️ **注入门控（shadow 模式上线前提）**：这些提示**默认不注入**——只有 `_ctx/dataflow_injection_gate.json` 的 `injectionEnabled: true`（经 `analyze-dataflow --assess` 评估实体归一假阳性率达标并人工签署）后，编排者才注入本清单。门控关闭时本节为空，正常继续，不受影响。

清单注入后是 warning 级提示，非硬门禁，但你**必须**按 `reviewActions` 落到规约：

| finding 类型 | TLA+ 必须做什么 |
|--------------|----------------|
| `cycle`（循环数据依赖） | 该模块 `Next` **重点防死锁**——需求阶段已检出环，确认状态机有打破环的初始态/默认值，禁止用 `-deadlock` 绕过（呼应「所有系统严禁死锁」铁律） |
| `gap`（数据被消费但无上游产生） | 为该变量在 `Init` 中补明确初值，不得默认其存在；若来自外部则建模为外部输入动作 |
| `boundary`（外部输入/最终输出） | 入边界：建模信任边界与授权前置 guard；出边界：确认终态可达且有对应断言 |

注入清单按 `relatedNodes` 与当前模块节点求交集过滤；清单为空表示当前模块无数据流提示，正常继续。

> 特别提示：`cycle` finding 与 B3 阶段的死锁检查同源——需求阶段的循环数据依赖往往就是 TLC 死锁反例的根因。收到 `cycle` 提示的模块应在建模时优先审视状态机环路的收敛性。

## 完整人设参考

专家人设见 [references/expert-persona-tlaplus.md](../references/expert-persona-tlaplus.md) 的「## 身份定位」段。`references/tlaplus-coding-guide.md` 提供完整的语法速查、命名约定、编码最佳实践、LLM 常见建模错误及对策、工业案例和外部资源链接，可按需加载。

## ❌ 视觉检查点（失败模式速查）

- ❌ 无 `TypeOK` 不变式 → 类型未约束 → 必须覆盖所有变量的类型不变式
- ❌ PlusCal `while` 循环状态爆炸 → 未引入对称规约/状态约束 → 拆解为子模块或收缩常量
- ❌ 非法知识陷阱 → 编造 IR-NODE 不存在的状态转换 → 严格依据 IR 节点内容建模
- ❌ 缺 `guard` → Action 无前置条件 → 每个 Action 必须有明确 guard
- ❌ `.cfg` 文件缺失 → 无法运行 TLC → 每个候选必须有 matching `.cfg`
- ❌ `EXTENDS` 缺失 → 未引入 `Naturals`/`Sequences`/`TLC` → 补全基础模块
- ❌ ARCH-SYS module 漏覆盖 → 跳过某些模块 → 全模块强制覆盖，禁止跳过
- ❌ `var' \in TypeSet` 全集跳转 → Next 放任任意状态转换 → 显式枚举合法转换对（源 guard /\ 目标）
- ❌ 永真式不变式 → `Inv == var \in TypeSet` → 改为状态间关系/可达性约束
- ❌ NFR 不变式模板复制 → 6 类定义体雷同 → 每类从模块真实语义推导，定义体互不相同
- ❌ 状态空间过小 → `MaxSteps=3` 覆盖不了完整环路 → 覆盖状态机完整环路深度
