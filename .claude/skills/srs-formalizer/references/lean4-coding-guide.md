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
```

### 0.2 macOS ARM64 (Apple Silicon)

```bash
# 安装 elan + lake
curl https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh -sSf | sh -s -- -y
source ~/.zshrc

# 创建项目并获取最新 mathlib4
mkdir ~/lean4-project && cd ~/lean4-project
lake init
echo 'require mathlib from git "https://github.com/leanprover-community/mathlib4.git"' >> lakefile.lean
lake update
```

### 0.3 验证安装

```bash
lean --version    # 应显示 Lean 4.x
lake --version    # 应显示 Lake 4.x
```

### 0.4 平台限制

| 平台 | 状态 | 说明 |
|------|:----:|------|
| Linux x86_64 | ✅ | 完整支持（elan + lake + mathlib4） |
| macOS ARM64 (Apple Silicon) | ✅ | 完整支持（elan + lake + mathlib4） |
| macOS x86_64 (Intel) | ⚠️ | 可用但非推荐配置 |
| Windows | ❌ | **禁止使用**。Lean 4 没有 Windows 上便于使用的发行版。请使用 WSL2 (Linux x86_64) |

### 0.5 离线 / 网络受限环境

使用技能内置的 elan 离线安装包：

```bash
# Linux x86_64
tar -xzf tools/lean-4-linux-x86_64.tar.gz -C ~/.elan/
export PATH="$HOME/.elan/bin:$PATH"

# macOS ARM64
tar -xzf tools/lean-4-macos-arm64.tar.gz -C ~/.elan/
export PATH="$HOME/.elan/bin:$PATH"
```

> **注意**: 预置离线包为基础工具链。首次使用 `lake update` 获取最新 mathlib4 仍需网络。

---

## 1. 拆分证明方法论

### 1.1 Step 1: 编写证明骨架

第一步编写证明骨架（带 `sorry`），清晰标注证明策略。

```lean4
theorem main_property (n : ℕ) : n * 2 = n + n := by
  induction n with
  | zero => rfl
  | succ n ih =>
    -- proof strategy: use induction hypothesis + ring
    sorry
```

### 1.2 Step 2: 拆分 sorry 为独立文件

将每个 `sorry` 变为独立的 `.lean` 文件进行证明。

### 1.3 Step 3: 无法单文件则继续拆分

如果一个 theorem/lemma 无法在单个文件中证明，拆分为多个文件分别进行 theorem/lemma 证明，然后 `import`。

### 1.4 Step 4: 递归循环

如果还有 `sorry`，回到 Step 1 继续拆分。递归至无 `sorry` 残留。

### 1.5 质量标准

Lean 4 必须通过工具检查。不允许：
- 算法实现错误
- 不完整实现
- `sorry`
- 告警（warnings）
- `axiom`

允许使用 `mathlib`。必须使用 `theorem` + 完整 proof。每个 lemma 应独立文件证明。

### 1.6 实现要求

Lean 4 不接受占位实现、简化实现、错误实现。

### 1.7 SRS 一致性

Lean 4 建模必须符合 SRS 的设计。对于符合设计仍然有问题的，需要报告人类，提出可选项对 SRS 进行修正。此部分允许联网搜索深度调研，但必须基于事实工作。产出写入 `SRS_PATCHES.md`。

---

## 2. 编码最佳实践

### 2.1 四阶段工作流

**Phase 1: Structure Before Solving** — 提纲先行。用 `have` 声明和带文档的 `sorry` 勾勒证明策略，然后才写 tactic。

**Phase 2: Helper Lemmas First** — 自下而上构建基础设施。提取可复用组件为独立 lemma。

**Phase 3: Incremental Filling** — 一次填一个 `sorry`，每填一个就 `lake build` 验证。

**Phase 4: Type Class Management** — synthesis 失败时用 `haveI` / `letI` 添加显式实例。

### 2.2 策略级联

按以下顺序尝试自动化策略，每个失败后才尝试下一个：

```
rfl → simp → ring → linarith → nlinarith → omega → exact? → apply? → aesop
```

### 2.3 have vs let 选择

- `have`：用于命题和证明项（值被"遗忘"——视为证明完成）
- `let`：用于数据定义（值被保留以供后续引用）
- 对数据用 `have` 是常见陷阱——丢失了可计算的值

### 2.4 证明结构

单文件 >100 行 → 必须拆分为多个 lemma。
`have` 块 >30 行 → 提取为独立 lemma。

### 2.5 mathlib 导入最小化

只导入实际使用的模块。`import Mathlib`（全量导入）禁止。

### 2.6 lake build 流程

每次修改后立即 `lake build`，不要积攒多个修改一起编译。

---

## 3. LLM 常见错误

基于 benchflow-ai（AI 定理证明评测框架）、FormalMATH（5560 题，最高 16.5%）和 FormalProofBench（33.5%）的发现：

| # | 错误类型 | 说明 | 规避方法 |
|---|---------|------|---------|
| 1 | **单体证明** | >100 行单体 proof 未拆分 | 每个 lemma ≤100 行 |
| 2 | **sorry 残留增长** | 递归拆分时 sorry 越拆越多 | 每轮 lake build 确认 sorry 计数递减 |
| 3 | **simulate 未验证** | 使用 `#eval` 模拟而非 `theorem` 证明 | 禁止 `#eval` 替代 proof |
| 4 | **mathlib 版本不匹配** | 引用当前 mathlib 不存在的 lemma | lake build 报错时检查 mathlib 版本 |

---

## 4. 检查清单

- [ ] lake build 通过？
- [ ] 0 `sorry`？
- [ ] 0 `axiom`？
- [ ] 0 warnings？
- [ ] 每个 lemma 独立文件？
- [ ] proof 使用 theorem + 完整 tactic？
- [ ] 与 SRS 设计一致？
