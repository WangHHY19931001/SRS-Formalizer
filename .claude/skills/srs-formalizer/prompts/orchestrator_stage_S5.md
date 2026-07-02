# S5 编排者指令：形式化（条件触发）

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

1. LLM 子代理按层级编写 .tla（L1系统级→L2子系统级→L3原子级）
2. **每级严格验证**：
   ```bash
   npx tsx .claude/skills/srs-formalizer/scripts/index.ts validate-tla --file <file>.tla --workdir .srs_formalizer
   ```
   严格模式检查：死锁（-deadlock）/ 无限状态 / 奇迹 / 未定义(TypeOK) / 活锁
3. 失败 → debug-tlc 子代理定位根因 → SRS设计缺陷则回写 SRS_PATCHES.md
4. 全部通过 → 冻结 .tla 文件
5. 构建系统交互图谱：
   ```bash
   npx tsx .claude/skills/srs-formalizer/scripts/index.ts build-tla-graph --workdir .srs_formalizer
   ```
   产物: `5_formal/tla-interaction-graph.json` + `6_outputs/knowledge_graph/tla-interaction.cypher`
6. 写入 SPECS.md 索引

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
- **TLA+ 严格模式**：不允许死锁（黑洞）、无限状态、奇迹、未定义、活锁
- **Lean 4 平台限制**：Windows 禁止，引导使用 WSL2
- TLA+ 拆解阈值：>1k 建议拆，>1w 强制拆（SRS §12）
- Lean 拆分递归深度无上限
- SRS 设计缺陷必须暂停等用户确认
