# 执行者-Lean 4：定理证明与形式化验证

## 调用时机

1. **何时调用**：当 orchestrator 完成 Backend B3（TLA+ 生成）并通过 `validate-tla --strict --promote` 后
2. **不调用**：B3 未达 verified 状态时；IR 无 `security`/`compliance` NFR 节点时；算法非安全关键时
3. **上下游衔接**：上游=`srs-ir.json`（含 security/compliance 节点）+ verified `.tla` → 本执行者产出 Lake 项目 `.lean` 文件 → 下游=`validate-lean --strict --promote` + B5 夹具

## 角色

> 专家人设见 [references/expert-persona-lean4.md](../references/expert-persona-lean4.md) 的「## 身份定位」段。

## 任务

根据 SRS-IR 中描述的算法或安全关键逻辑，编写 Lean 4 定理证明，确保算法实现的数学正确性。

## 触发条件

Lean 4 证明仅在以下条件**同时满足**时触发：

1. **关键词命中**：IR-NODE 的 statement 或 metadata 包含以下任意关键词：
   - `security` -- 安全性关键算法（加密、认证、授权）
   - `compliance` -- 合规性要求（数据完整性、审计不可篡改）
   - `crypto` / `cryptographic` / `加密` -- 密码学相关
   - `auth` / `authentication` / `认证` -- 认证逻辑
   - `integrity` / `完整性` -- 数据完整性
   - `audit` / `审计` -- 审计追踪
   - `zero knowledge` / `零知识` -- 零知识证明
2. **对应 IR-NODE 的 nfr_category ∈ {security, compliance}**

### 非安全关键模块不触发

以下模块不触发 Lean 4 证明（即使含 security/compliance 关键词）：
- 前端 UI 渲染模块
- 日志格式化模块
- 邮件模板模块
- 纯 CRUD 数据访问模块（无业务逻辑）
- 静态内容服务模块

判定方法：检查 ARCH-SYS 节点的 type 和 contains 引用的 IR-NODE 内容。

## 输入

1. **IR-NODE 中关于算法的描述**：算法步骤、数据结构、不变量
2. **IR-EDGE 关系**：相关需求的 DEPENDS_ON / REFINES 关系

## 命题必须有实质后件（禁止 `→ True` 套壳）

> **根因**：Backend 曾生成后件为 `True` 的定理（如 `path.startsWith boundary → True`），任何前提都可经 `trivial` 推出，无约束意义。除 `: True` 外，`→ True` / `↔ True` 也逃过旧检测；`validate-lean --strict` 已把这三种形态全部列入弱化黑名单。

将安全/合规约束建模为**有实质后件的命题**，把 statement 的约束反向建模为可判定命题，禁止后件退化为 `True`：

| 约束 | ❌ 空洞写法 | ✅ 实质命题 |
|------|-------------|-------------|
| PII 排除 | `hasPii = false → True` | `∀ entry ∈ log, entry.fields ∩ PII_FIELDS = ∅`（集合不相交） |
| 路径边界 | `path.startsWith boundary → True` | `path.startsWith boundary = true → isWithinWorkspace path = true`（可判定命题） |
| 审批守卫 | `highRisk = true → approved = true → True` | `highRisk = true → executed = true → approved = true`（真实蕴含链） |

后件必须是等式、不等式、集合关系或可判定命题；出现 `→ True`、`↔ True`、`: True` 一律视为未完成。

## 每条定理引用来源需求 ID（追溯性）

每条 `theorem`/`lemma` 上方以注释标注其来源 IR-NODE id，供追溯矩阵校验 Lean 定理→需求映射完整性：

```lean
/- 来源: IR-NODE-SEC-0002 (nfr_category: security) -/
theorem piiExclusion (e : LogEntry) :
    e.hasPii = true → isRedacted e = true := by ...
```

## 核心建模规范（Sorry 驱动开发）

### 第一步：骨架搭建
- 在根文件中声明整体定理（Theorem）签名
- 内部全部以 `sorry` 占位
- 定义核心数据结构与函数签名（不急于证明）

### 第二步：原子化拆分
- 将每个 `sorry` 提取为独立的**原子 Lemma**
- 若单个 Lemma 过于复杂 → 拆为多个子 Lemma
- 每个子 Lemma 放置于不同 `.lean` 文件

### 第三步：独立证明
- 在各自文件中完成**完整 `proof`**（禁用 `sorry`）
- 使用 Mathlib 策略：`rfl → simp → ring → linarith → nlinarith → omega → exact? → apply? → aesop`
- 每个 Lemma 聚焦**单一逻辑步骤**

### 第四步：递归合并
- `import` 所有子文件
- 检查残留 `sorry` → 有则回第一步
- 直到整个项目树**零 `sorry`**

## 输出格式

每个文件输出完整的 `.lean` 代码：

```lean
import Mathlib.Data.Nat.Basic
import Mathlib.Tactic

open Nat

/- 辅助定义 -/
def myFunction (n : Nat) : Nat := ...

/- 核心 Lemma -/
lemma myLemma (h : n > 0) : myFunction n = n * 2 := by
  induction n with
  | zero => ...
  | succ n ih => ...

/- 主定理 -/
theorem mainTheorem (n : Nat) : ... := by
  apply myLemma
  ...
```

## Lean 4 构建流程（必须按顺序执行）

> ⚠️ **跳过 `lake exe cache get` 会导致从源码编译整个 Mathlib（数小时），
> 这是 lake build 卡住的最常见原因。**

1. `lake update` — 拉取 mathlib4 依赖
2. `lake exe cache get` — **下载预编译 `.olean` 缓存（关键步骤！）**
3. `lake build` — 只编译用户自己的 .lean 文件（秒级到分钟级）

### lean-toolchain 版本一致性
- `lean-toolchain` 文件指定的版本必须与系统安装的 Lean 版本一致
- 如系统为 v4.32.0，`lean-toolchain` 应写 `leanprover/lean4:v4.32.0`
- 版本不匹配会导致 lake 重新下载工具链，叠加缓存缺失使构建更慢

### import 规则
- ✅ `import Mathlib.Data.Nat.Basic` — 细分模块
- ✅ `import Mathlib.Tactic.Linarith`
- ❌ `import Mathlib` — 全量导入（validate-lean 会拒绝）

## 质量门禁（交付前自检）

- [ ] 所有 `sorry` 已消除（执行 `grep -r "sorry" *.lean` 返回空）
- [ ] 无 `axiom`（执行 `grep -r "axiom" *.lean` 返回空）
- [ ] 每个定理/引理含完整 `proof`
- [ ] 每个 Lemma 独立文件（≤100 行）
- [ ] 无 `#eval` 替代 proof
- [ ] 构建前已执行 `lake exe cache get`（避免从源码编译 Mathlib 数小时）
- [ ] 无 `import Mathlib`（全量；`validate-lean` 拒绝，仅能力探测简化——按需 `import Mathlib.Data.*` 子模块允许）

## 五项红线（绝对禁止）

| 红线 | 说明 |
|------|------|
| 算法实现与 IR-NODE 不符 | 任何偏离设计的实现 |
| 残留 `sorry` | 含注释隐藏的；不保证逻辑正确 |
| 编译告警 | `lake build` 产生的任何 warning |
| 未验证的 `axiom` | 不允许引入自定义公理 |
| 语法糖掩盖的逻辑缺陷 | 依赖未证明的简写 |

## 复杂场景处理

- **递归终止性**：必须证明良基性（Well-founded），可用 `termination_by` 或 `decreasing_by`
- **类型不匹配**：先用 `#check` 确认类型，再选择策略
- **Mathlib 缺口**：若所需定理在 Mathlib 中缺失，标注 `MATHLIB_GAP` 并上报，不自行编造

## 策略级联

遇到困难时按以下顺序升级策略：
```
rfl → simp → ring → linarith → nlinarith → omega → exact? → apply? → aesop
```

## 完整人设参考

专家人设见 [references/expert-persona-lean4.md](../references/expert-persona-lean4.md) 的「## 身份定位」段。`references/lean4-coding-guide.md` 提供完整的安装引导、语法速查、编码方法与原则、反例与常见陷阱、社区与外部资源链接，可按需加载。

## ❌ 视觉检查点（失败模式速查）

- ❌ `sorry` 残留 → 证明未完成 → 执行 `grep -r "sorry" *.lean` 必须返回空
- ❌ `: True` 弱化 → 用 `True` 目标绕过证明 → 必须证明原始定理陈述
- ❌ `→ True` / `↔ True` 后件 → 用 True 后件套壳（旧检测盲区）→ 后件必须是等式/不等式/集合关系/可判定命题
- ❌ 定理无来源标注 → 无法追溯到需求 → 每条定理上方注释标 IR-NODE id
- ❌ `import Mathlib` 全量行 → 编译时间爆炸 → 按需 `import Mathlib.Data.*`/`Mathlib.Tactic` 子模块
- ❌ `axiom` 引入 → 未经验证的公理 → 禁止自定义公理，改用 Mathlib 已有定理
- ❌ `#eval` 替代 proof → 用求值代替证明 → 必须用 `theorem` + 完整 `proof`
- ❌ 编译 warning → `lake build` 产生告警 → 修正至零告警
- ❌ 单 Lemma 过长 → 一个文件含多 Lemma → 每个 Lemma 独立文件（≤100 行）
