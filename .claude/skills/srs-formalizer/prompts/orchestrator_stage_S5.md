# S5 编排者指令：形式化（条件触发）

## 前置检查
1. 读取 .srs_formalizer/PLAN.md 启用矩阵，确认哪些模块触发 TLA+/Lean 4
2. 工具链就绪检查：Java(TLC) / elan+lake(Lean 4)
3. 缺失工具链 → 输出安装指引至 ERRORS.md，标记对应模块不可用

## TLA+ 层次化建模（条件触发）

触发条件：微服务协作/并行进程/分布式锁/共识协议/跨服务状态机

1. LLM 子代理按层级编写 .tla（L1系统级→L2子系统级→L3原子级）
2. 每级 SANY + TLC 验证：死锁/不变量/活性
3. 失败 → debug-tlc 子代理定位根因 → SRS设计缺陷则回写 SRS_PATCHES.md
4. 全部通过 → 冻结 .tla 文件
5. 构建系统交互图谱：
   npx tsx .claude/skills/srs-formalizer/scripts/index.ts build-tla-graph --workdir .srs_formalizer
   产物: 5_formal/tla-interaction-graph.json + 6_outputs/knowledge_graph/tla-interaction.cypher
6. 写入 SPECS.md 索引

## Lean 4 拆分证明（条件触发）

触发条件：非常见算法/安全关键/密码学协议/金融核心/自定义数据结构

1. LLM 子代理编写证明骨架（带 sorry）
2. 拆分每个 sorry 为独立 .lean 文件
3. lake build 验证
4. 失败 → debug-lean 子代理定位根因
5. 递归至无 sorry 残留
6. 构建算法序列图谱：
   npx tsx .claude/skills/srs-formalizer/scripts/index.ts build-lean-graph --workdir .srs_formalizer
   产物: 5_formal/lean-proof-graph.json + 6_outputs/knowledge_graph/lean-proof.cypher
   检查: axiom_count = 0, sorry_count = 0
7. 写入 PROOFS.md 索引

## 约束
- 工具链缺失时优雅降级（标记不可用而非阻塞）
- TLA+ 拆解阈值：>1k 建议拆，>1w 强制拆（SRS §12）
- Lean 拆分递归深度无上限
- SRS 设计缺陷必须暂停等用户确认
