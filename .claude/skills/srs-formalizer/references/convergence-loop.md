# 跨图收敛循环参考

> 本文件为 Backend 编排者（`prompts/orchestrator_backend.md`）的跨图验证参考。定义 13 个根本问题、联合图谱映射、收敛判据与规模自适应迭代规则。编排者通过组合 `query-graph` 查询与读取各 verified 报告回答 13 个 Q，作为 FINAL 门禁的语义覆盖判据。

## 13 个根本问题（Q1-Q13）

| # | 问题 |
|:--:|------|
| Q1 | 它是什么？（本质定义、核心定位） |
| Q2 | 它做什么？（核心功能、主要作用） |
| Q3 | 它能做什么？（具体能力、应用场景） |
| Q4 | 它为什么可以这样？（技术原理、实现逻辑、理论支撑、论文URL、开源实现URL，涉及算法通过 Lean 4 建模） |
| Q5 | 能不能和其他软件/工具联合使用？（集成场景、联动能力） |
| Q6 | 它的内部行为是怎样的？（TLA+ 多层子系统建模） |
| Q7 | 它与其他系统如何交互？（BDD+TLA+ 联合建模） |
| Q8 | 它与外部如何交互？（BDD+TLA+ 联合建模） |
| Q9 | 它的工作边界是什么？（联合建模+边界条件） |
| Q10 | 它的兜底方案是什么？（降级、回滚、恢复） |
| Q11 | 它的性能约束是什么？（延迟、吞吐、并发上限） |
| Q12 | 它的安全边界在哪里？（认证/授权/审计/加密边界） |
| Q13 | 它的容量与扩展极限是什么？（数据量、用户数、节点数上限） |

## 联合图谱映射

| # | 所需图谱 |
|:--:|------|
| Q1 | 需求图谱 + 系统架构 |
| Q2 | 需求图谱 + 行为图谱 |
| Q3 | 需求图谱 + 行为 + TLA+ |
| Q4 | Lean 证明 + 需求图谱 |
| Q5 | 系统架构 + TLA+ |
| Q6 | TLA+ + 系统架构 |
| Q7 | 行为图谱 + TLA+ |
| Q8 | 行为图谱 + TLA+ + 系统架构 |
| Q9 | 行为图谱 + TLA+ + 系统架构 |
| Q10 | 需求图谱 + 行为图谱 + 系统架构 |
| Q11 | 需求图谱 + TLA+（PerfLatencyInv） |
| Q12 | 需求图谱 + Lean（SecurityInv/ComplianceInv） |
| Q13 | 系统架构 + TLA+（AvailInv/CompatInv） |

## 收敛定义

- **全部 13 个 Q 可回答**：追溯矩阵 `outputs/reports/traceability.md` 中无 `-` 标记的行（无缺口行）
- **high-confidence ≥ 9/13**：至少 9 个问题高置信度
- **NFR 覆盖率 ≥ 80%**：6 类 NFR（performance/security/availability/compatibility/maintainability/compliance）标注覆盖率
- **`verify-gate --stage FINAL` pass**：仅接受 verified 产物且 `sourceHash` 匹配当前内容

## 规模自适应迭代

| `total_shards` | max_iterations | parallelism |
|:--:|:--:|:--:|
| ≤50 | 3 | 1 |
| 51-100 | 5 | 2 |
| >100 | 8 | 4 |

强制 NFR 分维度并行。每次迭代追加 `outputs/reports/convergence-log.jsonl`（编排者维护，非脚本产出）。

## 超限处理（if-then）

| 触发条件 | 一线修复 | 仍失败兜底 |
|---------|---------|-----------|
| 当前轮次 `< max_iterations` 且未收敛 | 检查未回答 Q 的联合图谱是否齐全 → 补充查询或重新生成对应 verified 产物 → 下一轮迭代 | — |
| 达到 `max_iterations` 仍未收敛 | 检查 high-confidence 比例与 NFR 覆盖率：若 `≥7/13` 且 `NFR≥60%` → 允许标记 `partial_convergence` 并继续 FINAL；否则 → 苏格拉底拷问最大分歧点 | 仍无法收敛 → 🛑 **STOP**：标记 STATE.md `BLOCKED`，列出所有未解决项，等待人类确认是否加轮或收工 |
| `verify-gate --stage FINAL` 失败 | 检查 `sourceHash` 不匹配项 → 定位过期/草稿/跨类型产物 → 回退对应 Backend 步骤重新生成 → 重新 `--strict --promote` | 连续 2 次修复失败 → 🛑 **STOP**：禁止提交草稿或过期报告，等待人类决策 |
