# S5 编排者指令：形式化（条件触发）

## 前置检查
1. 读取 .srs_formalizer/PLAN.md 启用矩阵，确认哪些模块触发 TLA+/Lean 4
2. 工具链就绪检查：
   - **TLA+**: `java -version`（不限 OS，仅需 Java 11+）
   - **Lean 4**: `lake --version`（❌ Windows 不支持，仅 Linux x86_64 / macOS ARM64）
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

1. LLM 子代理编写证明骨架（带 sorry）
2. 拆分每个 sorry 为独立 .lean 文件
3. **验证**：
   ```bash
   npx tsx .claude/skills/srs-formalizer/scripts/index.ts validate-lean --file <file>.lean
   ```
4. 失败 → debug-lean 子代理定位根因
5. 递归至无 sorry 残留
6. 构建算法序列图谱：
   ```bash
   npx tsx .claude/skills/srs-formalizer/scripts/index.ts build-lean-graph --workdir .srs_formalizer
   ```
   产物: `5_formal/lean-proof-graph.json` + `6_outputs/knowledge_graph/lean-proof.cypher`
   检查: `axiom_count = 0, sorry_count = 0`
7. 写入 PROOFS.md 索引

## 约束
- 工具链缺失时优雅降级（标记不可用而非阻塞）
- **TLA+ 严格模式**：不允许死锁（黑洞）、无限状态、奇迹、未定义、活锁
- **Lean 4 平台限制**：Windows 禁止，引导使用 WSL2
- TLA+ 拆解阈值：>1k 建议拆，>1w 强制拆（SRS §12）
- Lean 拆分递归深度无上限
- SRS 设计缺陷必须暂停等用户确认
