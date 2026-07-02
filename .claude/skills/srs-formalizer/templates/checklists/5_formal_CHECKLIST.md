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
- [ ] **拆分证明方法确认**：
  - [ ] Step 1: 编写证明骨架（带 sorry）✅
  - [ ] Step 2: 每个 sorry 拆分为独立 lemma 文件 ✅
  - [ ] Step 3: 无法单文件则继续拆分子文件，用 `import` 组合 ✅
  - [ ] Step 4: 递归至 0 个 sorry ✅
- [ ] **硬门禁**：
  - [ ] 0 sorry（`grep -r "sorry" *.lean` 为空）
  - [ ] 0 axiom（`grep -r "axiom" *.lean` 为空）
  - [ ] 0 warnings（lake build 输出无 warning）
  - [ ] lake build 通过（exit 0）
  - [ ] 使用 `theorem` + 完整 proof（非 `#eval`）
  - [ ] 每个 lemma 独立文件（无 >100 行单体证明）
- [ ] 允许使用 mathlib4（最新版）
- [ ] **SRS 一致性**：
  - [ ] 符合 SRS 设计
  - [ ] 如有矛盾 → 已报告至 `SRS_PATCHES.md`（含可选项 + 事实依据）
  - [ ] 已等待人类确认
- [ ] build-lean-graph PASS → `5_formal/lean-proof-graph.json`
- [ ] PROOFS.md 索引已更新
