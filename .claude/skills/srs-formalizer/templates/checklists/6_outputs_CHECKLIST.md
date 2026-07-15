# S6 验收闸门 — 最终清单（含跨图一致性）

## 硬门禁
- [ ] verify-gate --stage FINAL：全部 PASS
- [ ] build-system-architecture: `converged: true`
- [ ] cross-graph-report.json: `overall_converged: true`

## 十个根本问题（全部可回答）
- [ ] Q1 它是什么？（本质定义、核心定位）— 高置信度
- [ ] Q2 它做什么？（核心功能、主要作用）— 高置信度
- [ ] Q3 它能做什么？（具体能力、应用场景）— 高置信度
- [ ] Q4 它为什么可以这样？（技术原理、论文URL、开源URL，含Lean 4建模）— 中/高置信度
- [ ] Q5 能不能和其他软件/工具联合使用？（集成场景、联动能力）— 中/高置信度
- [ ] Q6 它的内部行为是怎样的（TLA+多层子系统建模）— 中/高置信度
- [ ] Q7 它与其他系统如何交互（BDD+TLA+联合建模）— 中/高置信度
- [ ] Q8 它与外部如何交互（BDD+TLA+联合建模）— 中/高置信度
- [ ] Q9 它的工作边界是什么（联合建模+边界条件）— 中/高置信度
- [ ] Q10 它的兜底方案是什么（降级、回滚、恢复）— 中/高置信度
- [ ] 高置信度 ≥ 7 / 10

## 产物完整性
- [ ] STATE.md 所有阶段 ✅
- [ ] MINDMAP.md 全部模块 ✅
- [ ] `outputs/graphs/` 下全部 5 个 .cypher 文件存在（srs-graph/behavior-graph/tla-interaction/lean-proof/traceability）
- [ ] `6_outputs/brainstorming/brainstorm_context.json` 存在
- [ ] `6_outputs/deliverables.md` 存在
- [ ] `6_outputs/convergence-log.jsonl` 记录完整（每次迭代均有日志）
- [ ] 全部分片 → R1 → 架构 → R2 → R3 → 图谱 → BDD 链路完整

## 不一致处理
- [ ] 若存在不可回答的问题：已尝试联网搜索确认事实（≥2次）
- [ ] 若仍不可回答：已生成苏格拉底拷问（3-4个可选项 + 推荐项）
- [ ] 已通过 STATE.md 向人类提问
- [ ] 迭代未超过 5 次；若达到 5 次 → STATE.md 标记 BLOCKED
