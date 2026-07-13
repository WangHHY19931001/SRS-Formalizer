# Lean 4 + Mathlib4 编码参考指南

本指南为 srs-formalizer Backend 阶段的 Lean 4 子代理提供完整的编码规范，涵盖 NFR 触发条件、安装引导、语法速查、拆分证明方法论、编码原则、反例与常见陷阱、参考实践及外部资源。

---

## NFR 触发条件（决定是否执行 Lean 4 建模）

Lean 4 建模**不是全模块强制**，而是按 SRS 中是否包含以下 NFR 关键词触发：

| 关键词 | 类别 |
|--------|------|
| `security`, `encryption`, `authentication`, `authorization`, `cryptography` | security |
| `compliance`, `GDPR`, `HIPAA`, `SOC2`, `ISO27001`, `regulatory` | compliance |
| `audit`, `traceability`, `non-repudiation` | 审计/不可抵赖 |

**触发规则**：SRS 中任一模块包含上述任一关键词 → 对该模块**强制生成** Lean 4 证明。不含触发关键词的模块跳过 Lean 4 建模。

---

## 0. 安装 Lean 4 工具链

### 0.1 Linux x86_64

```bash
curl https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh -sSf | sh -s -- -y
source ~/.profile

mkdir ~/lean4-project && cd ~/lean4-project
lake init
echo 'require mathlib from git "https://github.com/leanprover-community/mathlib4.git"' >> lakefile.lean
lake update
lake exe cache get   # 优先下载编译缓存，避免从源码编译
```

### 0.2 macOS ARM64 (Apple Silicon)

```bash
curl https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh -sSf | sh -s -- -y
source ~/.zshrc

mkdir ~/lean4-project && cd ~/lean4-project
lake init
echo 'require mathlib from git "https://github.com/leanprover-community/mathlib4.git"' >> lakefile.lean
lake update
lake exe cache get
```

### 0.3 验证安装

```bash
lean --version    # Lean 4.x
lake --version    # Lake 4.x
```

### 0.4 平台限制

| 平台 | 状态 | 说明 |
|------|:----:|------|
| Linux x86_64 | ✅ | 完整支持 |
| macOS ARM64 | ✅ | 完整支持 |
| macOS x86_64 | ⚠️ | 可用但非推荐 |
| Windows | ❌ | 禁止使用，请使用 WSL2 |

---

## 1. 核心语法与声明

### 1.1 顶层声明

Lean 4 的顶层声明包括定义（`def`）、定理（`theorem`）、缩写（`abbrev`）、不透明定义（`opaque`）、归纳类型（`inductive`）、共归纳类型（`coinductive`）、结构体（`structure`）和类型类（`class`）。

```lean
def add (x y : Nat) : Nat := x + y

theorem add_comm (x y : Nat) : x + y = y + x := by
  simp_arith
```

### 1.2 命令与修饰符

声明可带修饰符：文档注释、属性、可见性修饰符、`protected` 等。

```lean
@[simp] protected def double (x : Nat) : Nat := 2 * x
```

### 1.3 语法类别

Lean 的语法系统通过 `syntax` 和 `declare_syntax_cat` 扩展。最常见的语法类别是 `term`。解析系统将源代码转换为 `Syntax` 对象，保留源码位置信息。

### 1.4 类型宇宙与 `Type*`

Mathlib4 推荐使用 `Type*` 而非旧式 `Type _`。`Type _` 放在冒号之前是代码异味——它隐藏了哪些类型应在同一宇宙中。

```lean
-- 推荐
def id {α : Type*} (x : α) : α := x

-- 不推荐（旧式）
def id {α : Type _} (x : α) : α := x
```

---

## 2. 拆分证明方法论（强制遵循）

### 2.1 Step 1：编写证明骨架（带 sorry）

用 `sorry` 标记未完成部分，清晰标注证明策略：

```lean
theorem main_property (n : ℕ) : n * 2 = n + n := by
  induction n with
  | zero => rfl
  | succ n ih =>
    -- proof strategy: use induction hypothesis + ring
    sorry
```

### 2.2 Step 2：拆分 sorry 为独立文件

每个 `sorry` → 独立 `.lean` 文件。每个 lemma 独立文件证明。

```
MainTheorem.lean
├── Lemma_BaseCase.lean      -- sorry ①
├── Lemma_InductiveStep.lean -- sorry ②
└── Lemma_Helper.lean        -- sorry ③
```

### 2.3 Step 3：无法单文件则继续拆分

若一个 theorem/lemma 无法在单个文件中搞定 → 拆分为多个文件分别证明 → `import`。

```lean
-- Lemma_InductiveStep.lean
import Lemma_BaseCase
import Lemma_Helper

theorem inductive_step (ih : n * 2 = n + n) : (n+1) * 2 = (n+1) + (n+1) := by
  ring
```

### 2.4 Step 4：递归循环

若仍有 `sorry` → 回到 Step 1 继续拆分。递归至 **0 个 sorry**。

### 2.5 拆分阈值

- 单文件 > 100 行 → 必须拆分为多个 lemma
- 单个 `have` 块 > 30 行 → 提取为独立 lemma
- 单个 proof > 50 行 → 考虑拆分为子 lemma

---

## 3. 编码方法与原则

### 3.1 定理证明风格

优先使用 `have ... :=` 或 `suffices ... from/by` 的显式风格，避免 Lean 3 时代的"意识流"风格：

```lean
-- 推荐（Lean 4 风格）
example (p q : Prop) (hp : p) (hq : q) : p ∧ q := by
  have h₁ := hp
  have h₂ := hq
  exact ⟨h₁, h₂⟩

-- 不推荐（Lean 3 风格：have 不加赋值）
example (p q : Prop) (hp : p) (hq : q) : p ∧ q := by
  have h₁ : p; · exact hp
  have h₂ : q; · exact hq
  exact ⟨h₁, h₂⟩
```

### 3.2 策略级联

每个失败后才尝试下一个：

```
rfl → simp → ring → linarith → nlinarith → omega → exact? → apply? → aesop
```

### 3.3 have vs let

- `have`：命题和证明项（值被"遗忘"）
- `let`：数据定义（值被保留以供引用）
- 对数据用 `have` 是常见陷阱

### 3.4 文档字符串规范

Mathlib4 有官方文档字符串风格指南。文档字符串应保持一致的缩进，不包含前导空格。

### 3.5 代码质量与 Linting

Mathlib4 拥有全面的 linting 系统：

| Linter 集合 | 用途 |
|------------|------|
| `linter.mathlibStandardSet` | 所有 Mathlib 及下游项目的默认 linter |
| `linter.nightlyRegressionSet` | 捕获 nightly-testing 分支的回归 |
| `linter.weeklyLintSet` | 每周运行一次 |

文本级检查包括：行尾符、尾随空格、分号使用、不需要的 Unicode 字符等。

### 3.6 模块化设计

- 合理划分命名空间
- 使用 `import` 管理依赖
- 公共导入与私有导入之间留有空格
- 只导入实际使用的模块——禁止 `import Mathlib`（全量导入）

### 3.7 递归与终止

Lean 4 支持结构递归和良基递归。`termination_by` 子句用于指定测度函数：

```lean
def factorial : Nat → Nat
  | 0 => 1
  | n + 1 => (n + 1) * factorial n
decreasing_by simp_wf
```

### 3.8 lake build 流程

每次修改后立即 `lake build`，不要积攒多个修改一起编译。

---

## 4. 反例与常见陷阱

### 4.1 类型宇宙问题

使用 `Type _` 在冒号之前会隐藏宇宙关系，导致代码不够健壮。应改用 `Type*`。

### 4.2 点号表示法嵌套问题

嵌套的点号表示法可能导致类型错误。`c.foo.x` 可能失败——应使用 `(c.foo).x`。

### 4.3 默认参数与终止证明

当 `termination_by` 依赖带有默认值的参数时，可能出现终止证明失败：

```lean
--  termination_by 依赖带有默认值的参数时可能失败
def problematic (n : Nat := 0) : Nat :=
  if n = 0 then 0 else problematic (n - 1)
```

### 4.4 `noncomputable` 与 `unsafe`

非计算性定义（如依赖命题的函数）需要标记为 `noncomputable`，否则编译失败。

### 4.5 元变量与类型正确性

使用核心策略时可能创建类型不正确的项，通常发生在延迟赋值的元变量场景中。调试时注意 `isTypeCorrect` 检查。

### 4.6 LLM 常见建模错误

| # | 错误 | 规避 |
|---|------|------|
| 1 | 单体证明 >100 行 | 每个 lemma ≤100 行 |
| 2 | sorry 越拆越多 | 每轮 lake build 确认 sorry 计数递减 |
| 3 | `#eval` 替代 proof | 禁止 `#eval`，必须用 `theorem` |
| 4 | mathlib 版本不匹配 | lake build 报错时检查版本 |
| 5 | 绕过 SRS 设计问题 | 遇到矛盾立即报告人类，不自行"修正" |

---

## 5. 质量铁律

### 5.1 硬门禁（全部必须通过）

| # | 要求 | 检查方式 |
|:--:|------|------|
| 1 | **无 sorry** | `grep -r "sorry" *.lean` → 0 results |
| 2 | **无 axiom** | `grep -r "axiom" *.lean` → 0 results |
| 3 | **无 warning** | `lake build 2>&1` → 0 warnings |
| 4 | **lake build 通过** | exit code 0 |
| 5 | **theorem + 完整 proof** | 每个声明含完整 tactic proof |
| 6 | **每个 lemma 独立文件** | 不允许单体证明 >100 行 |
| 7 | **`#print axioms` 检查** | 最终定理不得依赖未验证的 axiom |

### 5.2 绝对禁止

- ❌ 占位实现（`sorry`, `admit`）
- ❌ 简化实现（用具体值代替通用类型）
- ❌ 错误实现（与 SRS 设计矛盾的证明）
- ❌ `import Mathlib`（全量导入）
- ❌ `#eval` 替代 `theorem` 证明
- ❌ 编译告警（warning）

### 5.3 允许

- ✅ 使用 mathlib4（最新版）
- ✅ 使用 `haveI` / `letI` 添加显式实例
- ✅ 使用 `lean` REPL 验证类型

---

## 6. SRS 一致性与人类升级

### 6.1 正常流程

Lean 4 建模必须符合 SRS 的设计。S5 阶段在已确认的 SRS 需求基础上进行定理证明。

### 6.2 发现 SRS 设计问题

如果建模过程中发现符合 SRS 设计但仍然有问题（逻辑矛盾、不变量不可证明、类型不匹配等）：

1. **不修改 Lean 代码绕过问题**
2. **报告人类**，写入 `SRS_PATCHES.md`：
   ```markdown
   ## SRS 不一致报告
   - 发现的矛盾: <描述>
   - 涉及的 SRS 章节: <引用>
   - 涉及的文件: <.lean 文件路径>
   - 可选项:
     A. <方案A> — 推荐 ✓
     B. <方案B>
     C. <方案C>
   - 事实依据: <联网搜索的论文/开源项目URL>
   ```
3. 允许联网搜索深度调研，基于事实工作
4. 人类确认后，按照确认的方案修改

---

## 7. 参考实践

### 7.1 标准工作流

1. 使用 Lake 创建新项目
2. 在 `lakefile.lean` 中声明 Mathlib 依赖
3. 遵循 Mathlib 风格指南编写代码
4. 运行 Linter：`lake exe lint-style`
5. 使用 `doc-gen4` 从源文件自动生成文档

### 7.2 策略编写

策略用于增量式地构建证明，将证明分解并在目标上逐步工作。元编程是扩展 Lean 功能的核心方式。

### 7.3 性能优化建议

- 对于已知大小的集合，预先分配足够容量
- 使用 `modify` 等函数避免中间结构创建
- 在性能关键路径上考虑使用可变数据结构

---

## 8. 外部资源

### 8.1 官方文档

| 资源 | URL | 说明 |
|------|-----|------|
| Lean 语言参考 | https://lean-lang.org/doc/reference/latest/ | 全面的语言参考手册 |
| Theorem Proving in Lean 4 | https://lean-lang.org/theorem_proving_in_lean4/ | 定理证明教程 |
| Functional Programming in Lean | https://lean-lang.org/functional_programming_in_lean/ | 函数式编程教程 |
| Lean 文档总览 | https://lean-lang.org/documentation/ | 所有文档的入口 |
| Lean 快速入门 | https://lean-lang.org/lean4/doc/quickstart.html | 安装与设置指南 |

### 8.2 社区与教学资源

| 资源 | URL | 说明 |
|------|-----|------|
| Mathematics in Lean | https://leanprover-community.github.io/mathematics_in_lean/ | 数学形式化资源 |
| Mathlib 贡献指南 | https://leanprover-community.github.io/contribute/index.html | 官方贡献指南 |
| Lean 社区学习资源 | https://leanprover-community.github.io/learn.html | 学习资源汇总 |
| Lean 4 入门教程 | https://www.uv.es/coslloen/Lean4/ | 涵盖基础语法和定理证明 |
| Lean4 元编程书籍 | https://github.com/arthurpaulino/lean4-metaprogramming-book | 元编程完整教程 |

### 8.3 交互与支持

| 资源 | URL | 说明 |
|------|-----|------|
| Lean Zulip | https://leanprover.zulipchat.com/ | 社区讨论与求助 |
| Lean Cookbook | https://reservoir.lean-lang.org/ | 代码片段与配方集合 |
| Lean4Game | https://www.leanprover.cn/ | 交互式 Lean 教程 |
| Mathlib 源码 | https://github.com/leanprover-community/mathlib4 | Mathlib4 官方仓库 |

---

## 9. 检查清单

交付前必须逐项确认：

- [ ] **NFR 触发确认**：确认当前模块含 security/compliance/audit 关键词，非误触发
- [ ] lake build 通过（0 errors）
- [ ] 0 `sorry`（`grep -r "sorry" *.lean` 为空）
- [ ] 0 `axiom`（`grep -r "axiom" *.lean` 为空）
- [ ] 0 warnings
- [ ] 每个 lemma 独立文件（≤100 行）
- [ ] 使用 `theorem` + 完整 `proof`（非 `#eval`）
- [ ] 无 `import Mathlib`（全量导入）
- [ ] 符合 SRS 设计；如有矛盾已报告至 `SRS_PATCHES.md`
- [ ] 每个修改后立即 `lake build`，不积攒
- [ ] 证明覆盖 security/compliance 属性（如适用）
