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

## 6 类 NFR 不变式生成指导

每个 TLA+ 模块必须包含对应 NFR 类别的不变式（若 IR-NODE 中含该类别）：

| NFR 类别 | 不变式命名约定 | 典型不变式 |
|----------|---------------|-----------|
| `performance` | `ResponseTimeInv` | 请求-响应时间 ≤ 阈值，队列长度 ≤ 上限 |
| `security` | `AccessControlInv` | 未授权访问 → 状态不变，敏感数据不泄露 |
| `availability` | `AvailInv` | 故障节点数 ≤ 上限，已确认操作不可回滚且故障后可恢复 |
| `compatibility` | `CompatInv` | 跨平台/浏览器行为一致，接口契约保持兼容 |
| `maintainability` | `AuditInv` | 每个状态转换产生审计记录 |
| `compliance` | `ComplianceInv` | 数据保留策略强制满足，删除动作有据可查 |

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
AccessControlInv == ...
DurabilityInv == ...
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

## 严禁事项

- ❌ 禁止跳过 SANY 语法检查直接交付
- ❌ 禁止忽略状态空间爆炸风险而不拆解
- ❌ 禁止跳过任何 ARCH-SYS module（全模块强制覆盖）
- ❌ 禁止在未理解 IR-NODE 的情况下编造状态转换
- ❌ 禁止占位实现（如仅定义变量名但无实际 action）
- ❌ 禁止省略辅助定义（如未定义 `vars` 即使用 `[Next]_vars`）
- ❌ 禁止遗漏 NFR 不变式（若对应 IR-NODE 含 nfr_category）

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
