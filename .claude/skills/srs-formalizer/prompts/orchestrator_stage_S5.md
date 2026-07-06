# S5 编排者指令：形式化（条件触发）

## 快速退出检查（必须首先执行）

读取 `.srs_formalizer/STATE.md` 中的触发判定：

- [ ] `S5_TLA_TRIGGER: no` AND `S5_LEAN_TRIGGER: no` → **立即退出**，输出 `S5:SKIPPED` 到 STATE.md，直接进入 S6。不执行任何形式化步骤。
- [ ] `S5_TLA_TRIGGER: yes` → 执行下方 TLA+ 建模流程
- [ ] `S5_LEAN_TRIGGER: yes` → 执行下方 Lean 4 证明流程
- [ ] 任一流程执行完毕 → 更新 STATE.md 对应状态，进入 S6

**禁止在触发条件为 no 时执行形式化。** 这浪费 token 且产出无意义的形式化内容。

## 前置检查
1. 读取 .srs_formalizer/PLAN.md 启用矩阵，确认哪些模块触发 TLA+/Lean 4
2. 工具链就绪检查：
   - **TLA+**: `java -version`（不限 OS，仅需 Java 11+）
   - **Lean 4**: `lake --version`（❌ Windows 不支持，仅 Linux x86_64 / macOS ARM64）
     首次安装后执行 `lake exe cache get` 下载 mathlib4 编译缓存（避免从源码编译）
3. 缺失工具链 → 输出安装指引至 ERRORS.md，标记对应模块不可用
4. **平台限制**：Lean 4 在 Windows 上禁止使用（引导用户安装 WSL2）

## TLA+ 层次化建模（条件触发）

触发条件：微服务协作/并行进程/分布式锁/共识协议/跨服务状态机

TLA+ 工具：技能内置 `tools/tla2tools-1.7.4.jar`，仅需 Java（不限 OS）。
首次运行时自动尝试下载最新版；下载失败则使用内置版。

**层次化拆解方法：**
- L1 系统内外交互抽象 → L2 子系统内部行为 + 上下同级交互抽象 → L3 原子化子系统行为抽象
- 可推广至 4/5/6 级或更多，每个下级子系统视为独立系统继续拆解
- 拆解判定：先写 TLA+，分析变量组合；组合结果 >1k 时考虑拆，>1w 时必须拆

**执行流程：**

1. LLM 子代理按层级编写 .tla
2. **调试前先删除旧的轨迹文件（`.stl`）和状态文件（`.tlc`）**
3. **每级严格验证（先语法检查，再模型检查）**：
   ```bash
   npx tsx .claude/skills/srs-formalizer/scripts/index.ts validate-tla --file <file>.tla --workdir .srs_formalizer
   ```
   严格模式检查：SANY 语法通过 → TLC 模型检查 → 死锁（-deadlock）/ 状态爆炸 / 违法不变式(TypeOK) / 活锁 / 奇迹（不可能的状态转换）
4. 失败 → debug-tlc 子代理定位根因 → 修正后回到步骤 2（重新验证）
5. 全部通过 → 冻结 .tla 文件
6. 构建系统交互图谱：
   ```bash
   npx tsx .claude/skills/srs-formalizer/scripts/index.ts build-tla-graph --workdir .srs_formalizer
   ```
   产物: `5_formal/tla-interaction-graph.json` + `6_outputs/knowledge_graph/tla-interaction.cypher`
7. 写入 SPECS.md 索引

**质量门禁：** 不允许占位实现、简化实现、错误实现。不允许死锁（正常系统不允许死锁，死锁或矛盾分支需定位根因修正）。

**SRS 不一致升级流程：** 如果符合 SRS 设计但仍然有问题（死锁、违反不变式、状态爆炸）：
1. **不修改 TLA+ 代码绕过问题**
2. 写入 `SRS_PATCHES.md`，格式：
   ```
   ## SRS 不一致报告
   - 矛盾: <描述>
   - SRS 引用: <章节>
   - 可选项:
     A. <方案A> — 推荐 ✓
     B. <方案B>
     C. <方案C>
   - 事实依据: <联网搜索的论文/开源 URL>
   ```
3. **允许联网搜索深度调研**，基于事实工作
4. 等待人类确认后按确认方案修改

## Lean 4 拆分证明（条件触发）

触发条件：非常见算法/安全关键/密码学协议/金融核心/自定义数据结构

**平台限制**：❌ Windows 禁止使用。✅ Linux x86_64 / macOS ARM64。
详细安装指南：`references/lean4-coding-guide.md`。

### 拆分证明四步法（强制遵循）

**Step 1：编写证明骨架（带 sorry）**
LLM 子代理编写 theorem 声明和证明策略框架，用 `sorry` 标记未完成部分。

**Step 2：拆分 sorry 为独立文件**
将每个 `sorry` 变为独立的 `.lean` 文件进行证明。每个 lemma 独立文件。

**Step 3：无法单文件则继续拆分**
如果一个 theorem/lemma 无法在单个文件中搞定，拆分为多个文件分别进行 theorem/lemma 证明，然后 `import`。

**Step 4：递归循环**
如果还有 `sorry`，回到 Step 1 继续拆分。递归至 0 个 sorry。

### 硬门禁（全部必须通过）

| # | 检查 | 命令 |
|:--:|------|------|
| 1 | 0 sorry | `grep -r "sorry" *.lean` → 空 |
| 2 | 0 axiom | `grep -r "axiom" *.lean` → 空 |
| 3 | 0 warnings | lake build 输出无 warning |
| 4 | lake build 通过 | exit 0 |
| 5 | theorem + 完整 proof | 每个声明含完整 tactic proof |
| 6 | 每个 lemma 独立文件 | 无 >100 行单体证明 |

允许使用 mathlib4（最新版）。

### SRS 不一致升级流程

如果符合 SRS 设计但仍然有问题（逻辑矛盾、不可证明、类型不匹配）：
1. **不修改 Lean 代码绕过问题**
2. 写入 `SRS_PATCHES.md`，格式：
   ```
   ## SRS 不一致报告
   - 矛盾: <描述>
   - SRS 引用: <章节>
   - 可选项:
     A. <方案A> — 推荐 ✓
     B. <方案B>
     C. <方案C>
   - 事实依据: <联网搜索的论文/开源 URL>
   ```
3. **允许联网搜索深度调研**，基于事实工作
4. 等待人类确认后按确认方案修改

### 验证

```bash
# lake build 验证
npx tsx .claude/skills/srs-formalizer/scripts/index.ts validate-lean --file <file>.lean

# 构建算法序列图谱
npx tsx .claude/skills/srs-formalizer/scripts/index.ts build-lean-graph --workdir .srs_formalizer
```
产物: `5_formal/lean-proof-graph.json` + `6_outputs/knowledge_graph/lean-proof.cypher`

### 质量标准

- ✅ 允许使用 mathlib4（最新版）
- ✅ 每个 lemma ≤100 行（独立文件）
- ✅ 策略级联：`rfl → simp → ring → linarith → nlinarith → omega → exact? → apply? → aesop`
- ❌ 禁止占位实现、简化实现、错误实现
- ❌ 禁止 `#eval` 替代 proof
- ❌ 禁止 `import Mathlib`（全量导入）
- ❌ 算法实现错误、不完整实现
- ✅ 每个修改后立即 `lake build`，不积攒

写入 PROOFS.md 索引。

## 约束
- 工具链缺失时优雅降级（标记不可用而非阻塞）
- **TLA+ 严格模式**：不允许死锁（黑洞）、无限状态、奇迹、未定义、活锁。不允许占位实现、简化实现、错误实现。调试前先删除轨迹文件和状态文件。先通过 SANY 语法检查后才允许执行 TLC 模型检查
- **TLA+ 拆解阈值**：变量组合 >1k 建议拆，>1w 强制拆。层次化 L1→L2→L3，可推广至 4/5/6+ 级
- **Lean 4 平台限制**：Windows 禁止，引导使用 WSL2
- **Lean 4 拆分证明**：四步循环——骨架 sorry → 独立文件证明 → 拆分多文件 import → 递归至 0 sorry。0 sorry、0 axiom、0 warning 必须
- Lean 拆分递归深度无上限
- **SRS 设计缺陷**：TLA+ 和 Lean 4 均必须暂停等用户确认。写入 `SRS_PATCHES.md`（含矛盾描述、SRS 引用、可选项 A/B/C、事实依据），允许联网搜索深度调研，基于事实工作
