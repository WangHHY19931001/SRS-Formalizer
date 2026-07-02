# Lean 4 编码指南

本指南为 srs-formalizer S5 阶段的 Lean 4 子代理提供编码规范和安装引导。

---

## 0. 安装 Lean 4 工具链

### 0.1 Linux x86_64

```bash
# 安装 elan（Lean 版本管理器）+ Lake 构建系统
curl https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh -sSf | sh -s -- -y
source ~/.profile

# 创建项目并获取最新 mathlib4
mkdir ~/lean4-project && cd ~/lean4-project
lake init
echo 'require mathlib from git "https://github.com/leanprover-community/mathlib4.git"' >> lakefile.lean
lake update

# 优先下载 mathlib4 编译缓存（避免从源码编译，节省数十分钟）
lake exe cache get
```

### 0.2 macOS ARM64 (Apple Silicon)

```bash
curl https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh -sSf | sh -s -- -y
source ~/.zshrc

mkdir ~/lean4-project && cd ~/lean4-project
lake init
echo 'require mathlib from git "https://github.com/leanprover-community/mathlib4.git"' >> lakefile.lean
lake update

# 优先下载 mathlib4 编译缓存（避免从源码编译，节省数十分钟）
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

## 1. 拆分证明方法论（强制遵循）

Lean 4 必须使用拆分建模方法。以下流程 **必须严格按序执行**。

### 1.1 Step 1：编写证明骨架（带 sorry）

第一步编写证明骨架，用 `sorry` 标记未完成的部分，清晰标注证明策略。

```lean4
theorem main_property (n : ℕ) : n * 2 = n + n := by
  induction n with
  | zero => rfl
  | succ n ih =>
    -- proof strategy: use induction hypothesis + ring
    sorry
```

### 1.2 Step 2：拆分 sorry 为独立文件

将每个 `sorry` 变为独立的 `.lean` 文件进行证明。每个 lemma 应独立文件证明。

```
MainTheorem.lean
├── Lemma_BaseCase.lean      -- sorry ①
├── Lemma_InductiveStep.lean -- sorry ②
└── Lemma_Helper.lean        -- sorry ③
```

### 1.3 Step 3：无法单文件则继续拆分

如果一个 theorem/lemma 无法在单个文件中搞定，拆分为多个文件分别证明，然后 `import`。

```lean4
-- Lemma_InductiveStep.lean
import Lemma_BaseCase
import Lemma_Helper

theorem inductive_step (ih : n * 2 = n + n) : (n+1) * 2 = (n+1) + (n+1) := by
  -- proof using imported lemmas
  ring
```

### 1.4 Step 4：递归循环

如果还有 `sorry`，回到 Step 1 继续拆分。递归至 **0 个 sorry**。

### 1.5 拆分阈值

- 单文件 > 100 行 → 必须拆分为多个 lemma
- 单个 `have` 块 > 30 行 → 提取为独立 lemma
- 单个 proof > 50 行 → 考虑拆分为子 lemma

---

## 2. 质量铁律

### 2.1 硬门禁（全部必须通过，违反即阻断）

| # | 要求 | 检查方式 |
|:--:|------|------|
| 1 | **无 sorry** | `grep -r "sorry" *.lean` → 0 results |
| 2 | **无 axiom** | `grep -r "axiom" *.lean` → 0 results |
| 3 | **无 warning** | `lake build 2>&1` → 0 warnings |
| 4 | **lake build 通过** | exit code 0 |
| 5 | **必须使用 theorem + 完整 proof** | 每个声明必须为 `theorem`，含完整 tactic proof |
| 6 | **每个 lemma 独立文件** | 不允许单体证明（>100 行单文件） |

### 2.2 绝对禁止

- ❌ 占位实现（如 `sorry`, `admit`）
- ❌ 简化实现（如用具体值代替通用类型）
- ❌ 错误实现（与 SRS 设计矛盾的证明）
- ❌ 全量导入 `import Mathlib`（只导入实际使用的模块）
- ❌ 用 `#eval` 替代 `theorem` 证明

### 2.3 允许

- ✅ 使用 mathlib4（最新版）
- ✅ 使用 `haveI` / `letI` 添加显式实例
- ✅ 使用 `lean` REPL 验证类型

---

## 3. SRS 一致性与人类升级

### 3.1 正常流程

Lean 4 建模必须符合 SRS 的设计。S5 阶段在已确认的 SRS 需求基础上进行定理证明。

### 3.2 发现 SRS 设计问题

如果建模过程中发现 **符合 SRS 设计但仍然有问题**（如逻辑矛盾、不变量不可证明、类型不匹配等）：

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
3. **此部分允许联网搜索深度调研**，但必须基于事实工作
4. 人类确认后，按照确认的方案修改（可能修改 SRS 或 Lean 证明）

---

## 4. 编码最佳实践

### 4.1 策略级联

```
rfl → simp → ring → linarith → nlinarith → omega → exact? → apply? → aesop
```

每个失败后才尝试下一个。

### 4.2 have vs let

- `have`：命题和证明项（值被"遗忘"）
- `let`：数据定义（值被保留以供引用）
- 对数据用 `have` 是常见陷阱

### 4.3 lake build 流程

每次修改后立即 `lake build`，不要积攒多个修改一起编译。

---

## 5. LLM 常见错误

| # | 错误 | 规避 |
|---|------|------|
| 1 | 单体证明 >100 行 | 每个 lemma ≤100 行 |
| 2 | sorry 越拆越多 | 每轮 lake build 确认 sorry 计数递减 |
| 3 | `#eval` 替代 proof | 禁止 `#eval`，必须用 `theorem` |
| 4 | mathlib 版本不匹配 | lake build 报错时检查版本 |
| 5 | 绕过 SRS 设计问题 | 遇到矛盾立即报告人类，不自行"修正" |

---

## 6. 检查清单

- [ ] lake build 通过（0 errors）
- [ ] 0 `sorry`（`grep -r "sorry" *.lean` 为空）
- [ ] 0 `axiom`（`grep -r "axiom" *.lean` 为空）
- [ ] 0 warnings
- [ ] 每个 lemma 独立文件
- [ ] 使用 `theorem` + 完整 `proof`（非 `#eval`）
- [ ] 符合 SRS 设计；如有矛盾已报告至 `SRS_PATCHES.md`
