# S6 编排者指令：验收闸门 + 收敛循环

## 收敛循环（迭代工程）

S6 阶段在全部四层图谱完成后执行系统架构合成和跨层一致性校验。
若发现缺口或不一致，回退到相应阶段迭代修复，直到全部通过或达到最大迭代次数。

```
                    ┌──────────────────────────────────────┐
                    │  S6: build-system-architecture       │
                    │  交叉引用四层图谱 → 一致性报告        │
                    └──────────────┬───────────────────────┘
                                   │
                    ┌──────────────▼───────────────────────┐
                    │  一致性检查全部通过?                   │
                    └──────────────┬───────────────────────┘
                          │                    │
                         YES                  NO
                          │                    │
                    ┌─────▼──────┐    ┌───────▼──────────┐
                    │ FINAL 验收  │    │ 回退到对应阶段:    │
                    │ 输出交付物  │    │ - 需求缺口 → S2   │
                    └────────────┘    │ - 行为缺口 → S4   │
                                      │ - 形式化缺口 → S5 │
                                      │ iteration++       │
                                      │ max 5 iterations  │
                                      └───────────────────┘
```

## 执行流程

### 步骤 1：硬门禁检查
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts verify-gate --workdir .srs_formalizer --stage FINAL
```
不通过 → 修复阻塞项后重试。

### 步骤 2：构建系统架构图谱
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts build-system-architecture \
  --workdir .srs_formalizer \
  --iteration <N>
```
首次迭代 `--iteration 1`。

产物: `6_outputs/system-architecture.json` + `6_outputs/knowledge_graph/system-architecture.cypher`

读取输出 JSON，检查 `data.converged` 字段：
- `converged: true` → 所有一致性检查通过，进入步骤 5（最终验收）
- `converged: false` → 检查 `data.checks` 中的失败项，按以下规则回退：

### 步骤 3：分析一致性报告，回退修复

| 失败检查 | 回退阶段 | 操作 |
|---------|:-------:|------|
| `requirement_coverage` | S4 | 补充缺失的 BDD 行为场景 → 重新 validate-bdd → build-behavior-graph |
| `no_placeholder_scenarios` | S4 | 充实 THEN_PLACEHOLDER → validate-bdd |
| `tla_systems_have_actions` | S5 | 补充 TLA+ Action 定义 → SANY+TLC → build-tla-graph |
| `lean_no_axioms` | S5 | 消除 axiom → lake build → build-lean-graph |
| `cross_layer_edges` (0 edges) | S2-S5 | 检查四层图谱是否都成功构建，缺失的重新生成 |
| 多类失败 | S2-S5 | 按优先级: S2(需求)→S4(行为)→S5(TLA)→S5(Lean) 顺序修复 |

### 步骤 4：迭代循环
回退修复后，重新执行步骤 1-3：
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts build-system-architecture \
  --workdir .srs_formalizer \
  --iteration <N+1>
```
- 最大迭代次数: **5**
- 每次迭代追加 `6_outputs/convergence-log.jsonl`
- 若迭代 5 次仍未收敛 → 标记 STATE.md 为 BLOCKED，列出未解决项，等待人工介入

### 步骤 5：最终验收（收敛后）
1. `verify-gate --stage FINAL` 全部通过
2. Cypher 全量导出：requirement.cypher + behavior.cypher + tla-interaction.cypher + lean-proof.cypher + system-architecture.cypher
3. 更新 MINDMAP.md 全部模块为 ✅
4. 输出最终交付物清单至 `6_outputs/deliverables.md`

## 约束
- 最大 5 次迭代，超过则人工介入
- 每次迭代必须追加 convergence-log.jsonl
- 条件触发的图谱（TLA/Lean）不适用时对应的检查自动通过
