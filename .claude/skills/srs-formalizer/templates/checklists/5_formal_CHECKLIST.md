# S5 形式化 — 验收清单

## TLA+（条件触发）
- [ ] 触发条件已确认（S0 Discovery 报告）
- [ ] 工具链就绪：Java + TLC 可用
- [ ] SANY 语法检查通过
- [ ] TLC 模型检查通过
- [ ] 层次化建模：L1→L2→... 按拆解阈值拆分
- [ ] TLC 验证：无死锁、无不变量违反、无状态爆炸
- [ ] SPECS.md 索引已更新

## Lean 4（条件触发）
- [ ] 触发条件已确认
- [ ] 工具链就绪：elan + lake 可用
- [ ] lake build 通过：无错误、无告警
- [ ] 0 sorry 检查：证明中无未完成的 sorry
- [ ] 证明骨架 → 拆分 sorry → 递归至无 sorry
- [ ] lake build 通过：无错误、无告警、无 sorry、无 axiom
- [ ] PROOFS.md 索引已更新
