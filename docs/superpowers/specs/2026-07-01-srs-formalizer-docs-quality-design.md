# PLAN: srs-formalizer v0.5.1 — 文档完善 + 形式化质量保障

**日期**: 2026-07-01
**版本**: 1.0
**目标版本**: v0.5.1

---

## 0. 背景

基于三项改进意见：

- **5.2**：形式化产出（TLA+/Lean 4）缺乏质量保障机制。capability-probe 只评估基础能力，LLM 生成的语义正确率仅 8.6%（TLA+）~16.5%（Lean 4）
- **5.3**：缺少端到端使用示例、Golden 标准说明、references/templates 目录文档
- **能力探测强化**：全部 8 维度扩展到 5~10 题，难易分布，TLA+/Lean 4 使用工具链验证

## 1. 决策记录

| # | 决策点 | 选择 | 理由 |
|---|--------|------|------|
| 1 | S5 质量保障方式 | **工具链自动化门禁**（SANY+TLC / lake build），人工仅介入 SRS 设计缺陷 | 已有工具链验证能力，强制人工签名不必要 |
| 2 | TLA+ 编码指南 | 层次化建模 9 条方法论 + 10 条最佳实践 + 5 类 LLM 常见错误 | 基于 Murat Buffalo、FormaLLM、SysMoBench 研究 |
| 3 | Lean 4 编码指南 | 拆分证明 4 条方法论 + 6 条最佳实践 + 4 类 LLM 常见错误 | 基于 FormalMATH、Goedel-Prover、benchflow-ai 研究 |
| 4 | TLA+/Lean 4 探测 | 工具链验证（SANY+TLC / lake build），非 TS 正则 | 对标方法论"不接受占位实现"，必须工具链通过 |
| 5 | 无 mathlib 的 Lean 4 探测 | 7 题均禁止 mathlib，lake build 全部通过才算合格 | 减少依赖复杂度，评估基础证明能力 |
| 6 | 题量扩展 | 8 维度 × 5~10 题 = 50 题，按难度分布 | 当前每维度仅 1 题无法区分能力层次 |
| 7 | Tier 判定 | 取各维度**最低分**判定层级 | 最弱维度决定形式化质量上限 |

## 2. 文件变更

### 新增文件

| 文件 | 估计行数 | 职责 |
|------|:-------:|------|
| `references/tlaplus-coding-guide.md` | ~200 | TLA+ 层次化建模方法论 + 最佳实践 + LLM 常见错误 |
| `references/lean4-coding-guide.md` | ~180 | Lean 4 拆分证明方法论 + 工作流 + 策略级联 |
| `examples/end-to-end-walkthrough.md` | ~250 | 在线商城 SRS → 四类产出完整演示（8 步骤） |

### 修改文件

| 文件 | 改动量 | 说明 |
|------|:-----:|------|
| `README.md` | +80 行 | 端到端示例引导、Golden 标准说明、references/templates 目录详解 |
| `scripts/commands/capability-probe.ts` | +400 行 | 6 维度各扩展至 5~8 题 + 新增 2 形式化维度（共 50 题） |
| `scripts/types/skir.ts` 或 `scripts/types/index.ts` | +5 行 | CapabilityProfile 新增 `formal_tlaplus`、`formal_lean4` |
| `SKILL.md` | +5 行 | `capability_requirements` 新增 S5 形式化维度声明 |
| `CHANGELOG.md` | +15 行 | v0.5.1 条目 |
| `templates/checklists/5_formal_CHECKLIST.md` | +5 行 | 新增 SANY/TLC/lake build 工具链检查项 |

| **合计** | **~1,140 行** | 3 新增 + 6 修改 |

## 3. capability-probe 新增题目（50 题完整分布）

### 维度 1: instruction_following — 8 题（TS 正则判分）

| # | 难度 | 验证点 |
|---|:--:|--------|
| 1 | 易 | id 格式 + category + metadata（现题保留） |
| 2 | 易 | 少字段陷阱：禁止自增字段 |
| 3 | 中 | 含干扰文本 → 排除非需求内容 |
| 4 | 中 | 指定不同 id 前缀（R2-xxx-0001） |
| 5 | 中 | 空输入 → 输出空文件（0 字节） |
| 6 | 难 | 10 条混合需求 → 只提取 explicit |
| 7 | 难 | 特殊字符转义（Unicode/引号） |
| 8 | 难 | 给定错误模板 → 拒绝而非盲从 |

### 维度 2: structured_output — 7 题（TS JSON.parse 判分）

| # | 难度 | 验证点 |
|---|:--:|--------|
| 1 | 易 | valid_json + required_fields（现题） |
| 2 | 易 | 嵌套 metadata 正确 |
| 3 | 中 | 混乱编号文本 → 正确拆分 |
| 4 | 中 | 中英混杂 → Unicode 处理 |
| 5 | 中 | Markdown 表格 → 正确提取 |
| 6 | 难 | 矛盾信息 → 只提取一致部分 |
| 7 | 难 | 超长文本(>5000 字) → 无截断 |

### 维度 3: precision — 6 题（TS precision/recall vs 标准答案）

| # | 难度 | 验证点 |
|---|:--:|--------|
| 1 | 易 | 真假混合 → no_fabricated + no_missing（现题） |
| 2 | 中 | 需求+评论+示例混排 → 排除非需求 |
| 3 | 中 | 同义改写 → 去重 |
| 4 | 难 | "…同上"引用 → 跨行解析 |
| 5 | 难 | 需求在代码注释中 → 提取 |
| 6 | 难 | 3 条幻觉需求 → 精确定位假阳性 |

### 维度 4: hierarchical_reasoning — 5 题（TS F1 vs 标准答案）

| # | 难度 | 验证点 |
|---|:--:|--------|
| 1 | 易 | 8 需求 → 4 模块（现题） |
| 2 | 中 | 15 需求 → 5 模块（含跨模块） |
| 3 | 中 | 10 需求 → 3 层层次 |
| 4 | 难 | 20 需求含循环 → 分层+检测 |
| 5 | 难 | 平铺需求 → 自动推断模块 |

### 维度 5: logical_reasoning — 5 题（TS 关系图匹配）

| # | 难度 | 验证点 |
|---|:--:|--------|
| 1 | 易 | DEPENDS_ON（现题） |
| 2 | 中 | DEPENDS_ON + REFINES |
| 3 | 中 | CONFLICTS_WITH 矛盾检测 |
| 4 | 难 | 传递依赖（A→B→C） |
| 5 | 难 | 循环依赖识别 |

### 维度 6: creative_reasoning — 5 题（TS derived_from + reasoning 分析）

| # | 难度 | 验证点 |
|---|:--:|--------|
| 1 | 易 | derived_from_correct（现题） |
| 2 | 中 | 安全关键 → 安全约束 |
| 3 | 中 | 跨模块 → 集成约束 |
| 4 | 难 | 并发场景 → 并发控制需求 |
| 5 | 难 | 错误场景 → 容错需求 |

### 维度 7: formal_tlaplus — 7 题（SANY + TLC 工具链验证）

| # | 难度 | 题目 | 验证 |
|---|:--:|------|------|
| 1 | 易 | 简单计数器（Increment ≤100, Reset=0） | SANY + TLC |
| 2 | 易 | 开关切换（Toggle: on↔off） | SANY + TLC |
| 3 | 中 | 有界队列（MaxLen=5） | SANY + TLC |
| 4 | 中 | 互斥锁（2 进程） | SANY + TLC |
| 5 | 中 | 生产者-消费者（缓冲区=3） | SANY + TLC |
| 6 | 难 | 领导者选举（3 节点） | SANY + TLC + 活性 |
| 7 | 难 | 分布式锁（死锁检测） | SANY + TLC + 不变量 |

**每题判分**：SANY 通过(30) + TLC 通过(40) + mutation test 通过(30) = 100

### 维度 8: formal_lean4 — 7 题（lake build 工具链验证，禁止 mathlib）

| # | 难度 | 题目 | 验证 |
|---|:--:|------|------|
| 1 | 易 | `∀ n:ℕ, even n → even (n²)` | lake build |
| 2 | 易 | `sum [1..n] = n*(n+1)/2` | lake build |
| 3 | 中 | `rev (rev l) = l` | lake build |
| 4 | 中 | 鸽子洞原理（n+1 → ≥2） | lake build |
| 5 | 中 | `√2` 无理数 | lake build |
| 6 | 难 | Cantor 对角线 | lake build |
| 7 | 难 | 核是正规子群 | lake build |

**每题判分**：lake build 通过(40) + 0 sorry(30) + 0 axiom(15) + 0 warnings(15) = 100

## 4. 两个编码指南结构

### `references/tlaplus-coding-guide.md`

```
1. 层次化建模方法论（9 条规定）
   1.1 层次定义: L1 系统内外交互 → L2 子系统行为+同级交互 → L3 原子化
   1.2 拆解阈值: 变量组合>1k 考虑拆, >1w 必须拆
   1.3 文件头部标注: 自身系统 + 追踪号 + 上级/同级/下级路径
   1.4 死锁: 正常系统不允许
   1.5 调试流程: 先删轨迹/状态文件
   1.6 编码顺序: 先 SANY 语法 → 再 TLC 检查
   1.7 质量标准: 必须通过 SANY+TLC，不允许死锁/状态爆炸/违反不变式
   1.8 实现要求: 不接受占位/简化/错误实现
   1.9 SRS 一致性: 符合设计仍失败 → SRS_PATCHES.md → 人类介入
2. 编码最佳实践（10 条，基于 Murat Buffalo + LearnTLA）
3. LLM 常见错误（5 类，基于 FormaLLM + SysMoBench）
4. 检查清单
```

### `references/lean4-coding-guide.md`

```
1. 拆分证明方法论（4 条规定）
   1.1 Step 1: 编写证明骨架（带 sorry）
   1.2 Step 2: sorry 变独立文件证明
   1.3 Step 3: 无法单文件 → 拆多文件分别 theorem/lemma → import
   1.4 Step 4: 仍有 sorry → 回到 Step 1
   1.5 质量标准: lake build 通过，0 sorry/0 axiom/0 告警，允许 mathlib
   1.6 实现要求: 不接受占位/简化/错误实现
   1.7 SRS 一致性: 符合设计仍失败 → SRS_PATCHES.md → 人类介入
2. 编码最佳实践（6 条，基于 benchflow-ai + mathlib 风格）
3. LLM 常见错误（4 类，基于 FormalMATH + FormalProofBench）
4. 策略级联: rfl → simp → ring → linarith → nlinarith → omega → exact? → aesop
5. 检查清单
```

## 5. README 新增章节

- **端到端使用示例引导** — 指向 `examples/end-to-end-walkthrough.md`
- **Golden 标准参考** — `tests/golden/` 三文件表格 + 用途说明
- **目录参考** — `references/` 7 文件 + `templates/` 9 文件完整说明

## 6. 端到端示例结构（`examples/end-to-end-walkthrough.md`）

```
环境准备 → init → compile → manifest → S2 提取(S001 示例)
→ build-graph → analyze → merge → export-cypher
→ generate-bdd → validate-bdd
→ TLA+ 编写 → SANY → TLC（条件触发）
→ verify-gate FINAL
→ 产出物清单
```

## 7. 验收标准

1. `references/tlaplus-coding-guide.md` 含完整 9 条方法论 + 10 条最佳实践
2. `references/lean4-coding-guide.md` 含完整 4 步拆分方法论 + 6 条最佳实践
3. `examples/end-to-end-walkthrough.md` 含 8 步可执行演示
4. README 新增端到端示例引导、Golden 标准、目录参考三个章节
5. `capability-probe --mode generate` 输出 50 道题（8 维度）
6. `capability-probe --mode score` 对 TLA+ 提交正确执行 SANY + TLC 验证
7. `capability-probe --mode score` 对 Lean 4 提交正确执行 lake build 验证
8. 工具链缺失时对应维度标记 `unavailable`（不阻断其他维度）
9. 所有现有 255 测试通过，`typecheck` 通过
10. CHANGELOG v0.5.1 条目

## 8. 文件改动汇总

| 类型 | 文件数 | 代码行数(估) |
|------|:-----:|:----------:|
| 新增 Markdown | 3 | ~630 |
| 修改 TypeScript | 2 | ~405 |
| 修改 Markdown | 4 | ~105 |
| **合计** | **9** | **~1,140** |
