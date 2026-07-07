# S6 编排者指令：验收闸门 + 收敛循环 + 跨图一致性验证

## 协作契约加载（首先执行）

在开始跨图验证前，加载专家协作契约作为本阶段的决策上下文：

```
Read references/collaboration-contract.md
```

该契约定义了三位形式化专家（BDD/TLA+/Lean 4）的协作模式、需求细化联动机制（BDD→TLA+, BDD→Lean 4, TLA+↔Lean 4）、冲突仲裁机制（优先级：Lean 4 > TLA+ > BDD）与统一交付标准。当跨图一致性验证发现专家间分歧时，必须按契约规定的仲裁优先级和上报格式处理，**严禁擅自修改 SRS**。

## 收敛循环（迭代工程）

S6 阶段在全部四层图谱完成后执行系统架构合成和跨图一致性校验。
若发现缺口或不一致，回退到相应阶段迭代修复，直到全部通过或达到最大迭代次数。

```
                    ┌──────────────────────────────────────────────────┐
                    │  S6: build-system-architecture                   │
                    │  交叉引用四层图谱 → 一致性报告 + 跨图验证         │
                    └──────────────┬───────────────────────────────────┘
                                   │
                    ┌──────────────▼───────────────────────────────────┐
                    │  10 个根本问题全部可回答?                         │
                    │  (cross-graph-report.json)                       │
                    └──────────────┬───────────────────────────────────┘
                          │                    │
                         YES                  NO
                          │                    │
                    ┌─────▼──────┐    ┌───────▼──────────────────────┐
                    │ FINAL 验收  │    │ 回退到对应阶段:               │
                    │ 输出交付物  │    │ - 需求缺口 → S2               │
                    └────────────┘    │ - 行为缺口 → S4               │
                                      │ - 形式化缺口 → S5             │
                                      │ iteration++ (≤5)              │
                                      │                              │
                                      │ ≥3 次仍未收敛:               │
                                      │ → 苏格拉底拷问 + 可选项 + 推荐 │
                                      │ → 通知人类做决策              │
                                      └──────────────────────────────┘
```

## 执行流程

### 步骤 1：硬门禁检查
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts verify-gate --workdir .srs_formalizer --stage FINAL
```
不通过 → 修复阻塞项后重试。

### 步骤 2：构建系统架构图谱 + 跨图验证
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts build-system-architecture \
  --workdir .srs_formalizer \
  --iteration <N>
```
首次迭代 `--iteration 1`。

产物：
- `6_outputs/system-architecture.json` + `.cypher`
- `6_outputs/cross-graph-report.json`（跨图一致性验证报告）

### 步骤 3：审查跨图验证报告

读取 `6_outputs/cross-graph-report.json`，检查 `summary` 字段：

```
{
  "total_questions": 10,
  "answerable": 8,
  "unanswerable": 2,
  "high_confidence": 6,
  "low_confidence": 2,
  "needs_human": false,
  "human_questions": []
}
```

#### 3.1 十个根本问题

| # | 问题 | 所需图谱 |
|:--:|------|------|
| Q1 | 它是什么？（本质定义、核心定位） | 需求图谱 + 系统架构 |
| Q2 | 它做什么？（核心功能、主要作用） | 需求图谱 + 行为图谱 |
| Q3 | 它能做什么？（具体能力、应用场景） | 需求图谱 + 行为 + TLA+ |
| Q4 | 它为什么可以这样？（技术原理、实现逻辑、理论支撑、论文URL、开源实现URL，涉及算法通过Lean 4建模） | Lean 证明 + 需求图谱 |
| Q5 | 能不能和其他软件/工具联合使用？（集成场景、联动能力） | 系统架构 + TLA+ |
| Q6 | 它的内部行为是怎样的（TLA+多层子系统建模） | TLA+ + 系统架构 |
| Q7 | 它与其他系统如何交互（BDD+TLA+联合建模） | 行为图谱 + TLA+ |
| Q8 | 它与外部如何交互（BDD+TLA+联合建模） | 行为图谱 + TLA+ + 系统架构 |
| Q9 | 它的工作边界是什么（联合建模+边界条件） | 行为图谱 + TLA+ + 系统架构 |
| Q10 | 它的兜底方案是什么（降级、回滚、恢复） | 需求图谱 + 行为图谱 + 系统架构 |

#### 3.2 不可回答问题的处理

对于每个 `answerable: false` 的问题：

1. **联网搜索确认事实**（如涉及技术原理、论文、开源实现）：
   - 搜索相关论文、开源项目、技术文档
   - 补充到 `6_outputs/brainstorming/research.md`

2. **多轮无法确认 → 苏格拉底拷问**：
   - 每个缺口生成 3-4 个可选项
   - 给出推荐选项及理由
   - 通过 `STATE.md` 向人类提问

3. **人类确认后**：回退到对应阶段，补充建模，重新运行步骤 1-3

### 步骤 4：迭代循环

回退修复后，重新执行步骤 1-3：
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts build-system-architecture \
  --workdir .srs_formalizer \
  --iteration <N+1>
```

| 迭代 | 行为 |
|:--:|------|
| 1-2 | 自动回退修复（补充图谱、修正不一致） |
| 3-5 | 联网搜索 + 苏格拉底拷问（生成可选项） |
| 5 | 仍未收敛 → 标记 STATE.md BLOCKED，列出所有未解决项，等待人工介入 |

- 最大迭代次数: **5**
- 每次迭代追加 `6_outputs/convergence-log.jsonl`

### 步骤 5：最终验收（收敛后）
1. `overall_converged: true`（全部 10 个问题可回答）
2. `verify-gate --stage FINAL` 全部通过
3. `data.converged: true`（跨层一致性 + 跨图验证均通过）
4. Cypher 全量导出：requirement.cypher + behavior.cypher + tla-interaction.cypher + lean-proof.cypher + system-architecture.cypher
5. 更新 MINDMAP.md 全部模块为 ✅
6. 输出最终交付物清单至 `6_outputs/deliverables.md`

## 什么是"各产物都一致"

当以下条件**同时**满足时，各图谱产物视为一致：

1. **跨层边 > 0**：系统架构图谱中存在跨层连接（至少连接两种不同类型的节点层）
2. **全部 10 个根本问题可回答**（cross-graph-report.json 中 `unanswerable: 0`）
3. **高置信度 ≥ 7**：至少 7 个问题的置信度为 `high`
4. **verify-gate FINAL 通过**：无阻塞性错误
5. **convergence-log.jsonl 记录完整**：每次迭代均有日志

## 约束
- 最大 5 次迭代，超过则人工介入
- 每次迭代必须追加 convergence-log.jsonl + 更新 cross-graph-report.json
- 条件触发的图谱（TLA/Lean）不适用时对应的检查自动跳过（置信度为 N/A）
- 联网搜索的结果必须记录 URL 和时间戳
- 苏格拉底拷问必须提供 3-4 个可选项 + 推荐项
