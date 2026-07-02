# S5 形式化 — 验收清单（严格模式）

## 前置
- [ ] S0 能力探测通过（TLA+/Lean 触发条件已确认）
- [ ] 平台检查：Lean 4 非 Windows 环境（❌ Windows 禁止）

## TLA+（条件触发）
- [ ] 工具链就绪：`java -version` 通过（不限 OS，仅需 Java 11+）
- [ ] SANY 语法检查通过（`validate-tla --file <file>.tla`）
- [ ] **TLC 严格模式全部通过**：
  - [ ] 无死锁（黑洞）— `-deadlock` 通过
  - [ ] 无无限状态 — 状态空间有界
  - [ ] 无奇迹 — 不允许不可能的状态转换
  - [ ] 未定义检查 — TypeOK 不变式未违反
  - [ ] 无活锁 — Stuttering 检测通过
- [ ] 层次化建模：L1→L2→... 按拆解阈值拆分（>1k 建议拆，>1w 强制拆）
- [ ] build-tla-graph PASS → `5_formal/tla-interaction-graph.json`
- [ ] SPECS.md 索引已更新

## Lean 4（条件触发）
- [ ] 工具链就绪：`lake --version` 通过（✅ Linux x86_64 / macOS ARM64）
- [ ] `validate-lean --file <file>.lean` 通过
- [ ] lake build 通过：无错误、无告警
- [ ] **0 sorry 检查**：证明中无未完成的 sorry
- [ ] **0 axiom 检查**：证明中无未证明的公理
- [ ] 证明骨架 → 拆分 sorry → 递归至无 sorry
- [ ] build-lean-graph PASS → `5_formal/lean-proof-graph.json`
- [ ] PROOFS.md 索引已更新
