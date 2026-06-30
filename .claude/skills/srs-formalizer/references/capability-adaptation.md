# LLM 能力分级适配方案

## 背景

基于 AgentBench（8 大类 23 项任务）、SkillAudit（23 职业类别×多维度评估）、SkillsBench（87 任务×8 领域）等 2026 年研究，LLM 在 Agent 技能场景下不是"强/弱"二分，而是**多维能力画像**。同一模型在指令遵循上出色，在形式化推理上可能完全失败。

本方案为 srs-formalizer 的 7 个阶段定义能力需求和分级适配策略，编码智能体可根据实际使用的 LLM 能力自动选择合适的执行模式。

---

## 一、能力维度定义

| 维度 | 说明 | 评估方法 |
|------|------|---------|
| **指令遵循** (instruction_following) | 严格按 prompt 模板输出、不增减字段 | validate-jsonl 通过率 |
| **结构化输出** (structured_output) | 生成合法 JSONL、字段类型正确 | JSON parse 成功率 |
| **精度** (precision) | 不编造、不遗漏、原文可追溯 | verifier 编造/遗漏检查 |
| **层次推理** (hierarchical_reasoning) | 识别系统→子系统→模块的层次 | 架构 COVERAGE 检查 |
| **归纳能力** (induction) | 从个体需求归纳模块边界和约束 | 模块归属合理性 |
| **创造性推理** (creative_reasoning) | 从显式需求推导隐式需求 | derived_from 链合理性 |
| **安全意识** (safety_awareness) | 识别安全/数据完整性隐式需求 | 安全相关 R2 覆盖率 |
| **逻辑推理** (logical_reasoning) | 推导 DEPS_ON/REFINES/CONFLICTS_WITH | R3 关系与架构一致性 |
| **矛盾检测** (contradiction_detection) | 发现跨模块需求冲突 | CONFLICTS_WITH 准确率 |
| **形式化推理** (formal_reasoning) | TLA+ 规约编写、不变量设计 | TLC 通过率 |
| **定理证明** (theorem_proving) | Lean 4 proof 编写、sorry 消除 | lake build 通过率 |
| **文本分析** (text_analysis) | 扫描 SRS 结构、识别缺口 | GAPS.md 准确性 |

---

## 二、分级定义

| 层级 | 分数 | 标签 | 含义 |
|------|------|------|------|
| **Tier 3（强）** | ≥80 | `full_auto` | LLM 自主执行，编排者做流程决策 |
| **Tier 2（中）** | 50-79 | `guided` | LLM 执行+verifier 密集审核+人工抽查 |
| **Tier 1（弱）** | <50 | `human_in_loop` | 每步人工确认，或跳过该阶段 |

### 能力分数估算

编码智能体可根据使用的模型信息估算：

| 模型 | 估计分数 | 建议 Tier |
|------|---------|----------|
| Claude Opus 4.x / GPT-5.x | 85-95 | Tier 3 |
| Claude Sonnet 4.x / DeepSeek-V3 | 65-80 | Tier 2-3 |
| GPT-4o / Qwen3.5-72B | 55-70 | Tier 2 |
| Claude Haiku / Qwen3.5-7B | 35-50 | Tier 1 |
| 本地小模型 (<7B) | <35 | Tier 1（仅 S0,S1） |

> 精确评估建议运行 SkillsBench 或 AgentBench 的对应子集。本表为经验估计。

---

## 三、各阶段分级适配

### S0 — Discovery（文本分析+推理）

| Tier | 行为 |
|------|------|
| 3 | 自动扫描 SRS→识别章节→检测 TLA+/Lean 触发→生成报告→等待确认 |
| 2 | 自动扫描→生成报告→**人工审查 TLA+/Lean 触发判断**→确认 |
| 1 | **人工指定**所有参数（路径、语言、触发条件），不依赖 LLM 判断 |

### S1 — 预处理（纯 TS 确定性，不依赖 LLM）

所有 Tier 相同——TS 脚本执行。

### S2.1 — R1 显式需求提取

| Tier | 适配 |
|------|------|
| 3 | 填空模板 → TS 门禁 → verifier 抽查 10% → APPROVED |
| 2 | 填空模板 → TS 门禁 → **verifier 逐条全量审核** → 修正循环 |
| 1 | 填空模板 → TS 门禁 → **人工逐条审核** → 修正 |

### S2.2 — 架构分解-1

| Tier | 适配 |
|------|------|
| 3 | LLM 自主生成 arch-1 → validate-architecture → verifier-arch 审核 |
| 2 | LLM 生成 → validate-architecture → **人工审查模块归属** → 修正 |
| 1 | **人工编写 arch-1.jsonl**，LLM 不参与 |

### S2.3 — R2 隐式需求推导

| Tier | 适配 |
|------|------|
| 3 | LLM 自主推导 → TS 门禁 → verifier 审核 |
| 2 | LLM 推导 → TS 门禁 → **verifier 逐条打回不合理推导** |
| 1 | **跳过 R2**（标记为人力待补），不阻塞管道 |

### S2.4 — 架构精化-2

| Tier | 同 S2.2 |

### S2.5 — R3 关系推导-1

| Tier | 适配 |
|------|------|
| 3 | LLM 全关系推导（DEPENDS_ON+REFINES+CONFLICTS_WITH） |
| 2 | **仅推导 DEPENDS_ON+REFINES**，跳过 CONFLICTS_WITH（矛盾检测不可靠） |
| 1 | **跳过 R3**，图谱无边（标记为人力待补） |

### S2.6-2.7 — 架构终核+R3-2

| Tier | 适配 |
|------|------|
| 3 | 全量三次精化 |
| 2 | **跳过 arch-3+R3-2**，两次精化即可 |
| 1 | 跳过 |

### S3-S4 — 图谱构建+BDD 生成（纯 TS 确定性）

所有 Tier 相同——TS 脚本执行。

### S5 — 形式化（TLA+/Lean 4）

| Tier | 适配 |
|------|------|
| 3 | LLM 编写 TLA+/Lean → TLC/lake 验证 → 修正循环 |
| 2 | **仅 TLA+**（不变量检查较成熟），**跳过 Lean 4** |
| 1 | **跳过全部 S5** |

### S6 — 验收闸门

所有 Tier 相同。

---

## 四、能力探测系统（TS 出题→LLM 回答→TS 判分）

**不使用 LLM 自报告**——模型自评能力不可靠。采用标准化评估：

```
capability-probe --mode generate  → 输出 6 道标准化评估题（含 mini SRS 样本）
        ↓
编排者将题面发送给 LLM → LLM 返回 JSON 答案
        ↓
capability-probe --mode score --file <llm_answer.json>  → TS 脚本判分
        ↓
输出: capability_profile + estimated_tier + per-stage recommendations
```

### 六维度评估题

| 维度 | 题数 | 题型 |
|------|------|------|
| instruction_following | 1 | 给填空模板+3条需求→输出JSONL |
| structured_output | 1 | 给不规则文本→输出合法JSONL |
| precision | 1 | 6条需求含3条编造→只提取真实需求 |
| hierarchical_reasoning | 1 | 10条需求→归类到模块 |
| logical_reasoning | 1 | 4条需求→推导DEPENDS_ON关系 |
| creative_reasoning | 1 | 3条需求→推导1条隐式需求 |

每题评分 0-100。`capability_profile` = 各维度得分。`estimated_tier` = 综合六维度最低分判定。

### 使用示例

```bash
# 1. 生成评估题
npx tsx index.ts capability-probe --mode generate > probes.json

# 2. 编排者将 probes.json 中的每道题 prompt 发给 LLM
#    LLM 答案收集为 answers.json: {"answers": {"instruction_following-1": "...", ...}}

# 3. 判分
npx tsx index.ts capability-probe --mode score --file answers.json
# → {"capability_profile":{"instruction_following":100,...},"estimated_tier":"medium","recommendations":[...]}
```

---

## 五、编码智能体自动适配流程

智能体在首次执行 srs-formalizer 时应：

1. **运行能力探测**——`capability-probe --mode generate` → 发送给 LLM → `--mode score` 判分
2. **确定 Tier**——取各阶段所需维度的最低分，对照 Tier 阈值
3. **生成适配配置**——写入 `STATE.md` 的能力适配章节：
   ```markdown
   ## 能力适配
   | 阶段 | Tier | 模式 |
   |------|------|------|
   | S2.1 | 2 | guided（逐条全量审核） |
   | S2.2 | 2 | guided（人工审查归属） |
   | S2.5 | 1 | skipped |
   | S5 | 1 | skipped |
   ```
4. **执行时遵循**——编排者读取 STATE.md 的能力适配配置，按对应模式执行

---

## 五、能力降级信号

在运行过程中，以下信号表明当前 Tier 过高，应降级：

| 信号 | 阈值 | 动作 |
|------|------|------|
| validate-jsonl 连续 3 次 REJECTED | — | R1 降至 Tier 1（人工） |
| verifier 编造检测命中率 >30% | 30% | 降至 Tier 2，增加 verifier 审核密度 |
| arch 循环依赖检测命中 >5 | — | 降至 Tier 1（人工编写 arch） |
| R3 CONFLICTS_WITH 人工抽查误报率 >50% | 50% | 跳过 CONFLICTS_WITH |
| TLC 连续 3 次失败 | — | 标记 TLA+ 不可用 |

---

## 参考来源

- AgentBench: 8 类 23 项 Agent 任务基准
- SkillAudit (arXiv:2606.22613): 23 职业类别×多维度技能审计
- SkillsBench (arXiv:2602.12670): 87 任务×8 领域，技能加持 +16.6pp
- OpenSkillEval (arXiv:2605.23657): 600+ 任务×30 技能×19 配置
- SpatialTree (arXiv:2512.20617): 4 层级×27 子能力层次基准
- SkCC (arXiv:2605.03353): 跨框架技能编译，O(m×n)→O(m+n)
