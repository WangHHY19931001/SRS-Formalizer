# SRS-Formalizer 端到端使用引导

本文档通过一个真实的中文 SRS 文档 —— **在线商城系统**，完整演示 S0 → S6 全流程。

> **前置条件**：Node.js ≥20、TypeScript 5.5+。所有命令在 `.claude/skills/srs-formalizer/scripts/` 下执行。

## 示例 SRS 文档

`__tests__/fixtures/srs-sample-zh.md`：

```markdown
# 在线商城系统需求规格说明

## §1.4 术语表
| 术语 | 定义 |
|------|------|
| SKU | 库存量单位 |
| OMS | 订单管理系统 |

## §2.9 模块能力矩阵
| 模块 | 能力 |
|------|------|
| 用户模块 | 注册、登录、信息管理 |
| 订单模块 | 创建、支付、退款 |

## §3.1 功能需求
### §3.1.1 用户注册
系统应支持手机号注册和邮箱注册两种方式。
### §3.1.2 用户登录
系统应支持密码登录和短信验证码登录。
### §3.2.1 创建订单
用户选择商品后可创建订单，系统应锁定库存。
```

---

## S0 — 发现确认

**目的**：探测当前 LLM 是否具备形式化所需的推理能力。

```bash
# 生成能力探测题目（8 维度 × 50 题）
npx tsx index.ts capability-probe --mode generate --workdir /tmp/srs-demo/.srs_formalizer

# 由外部 Agent 或 LLM 答题后，评分
npx tsx index.ts capability-probe --mode score --workdir /tmp/srs-demo/.srs_formalizer
```

**产出**：`capability-probe/report.json` — 各维度分数，决定 S5 阶段是否触发 TLA+ / Lean 4。

---

## S1 — 预处理

### 1.1 初始化工作目录

```bash
npx tsx index.ts init --output /tmp/srs-demo/.srs_formalizer
```

**产出**：`.srs_formalizer/` 骨架，含阶段子目录和验收 CHECKLIST。

### 1.2 索引化分片

```bash
npx tsx index.ts manifest \
  --src __tests__/fixtures/srs-sample-zh.md \
  --lang zh \
  --workdir /tmp/srs-demo/.srs_formalizer
```

**产出**：
- `S1_shards/shard_index.json` — 分片索引（每片 ≤200 行，含章节识别 + 缺口报告）
- `S1_shards/` — 各分片内容文件

### 1.3 术语表

```bash
# 由 Agent 派发子代理从分片中并行提取术语
# 输出 GLOSSARY.md 后校验
npx tsx index.ts validate-glossary --file /tmp/srs-demo/.srs_formalizer/S2_glossary/GLOSSARY.md
```

**产出**：`S2_glossary/GLOSSARY.md` — 术语表（≥5 高置信度术语通过门禁）。

---

## S2 — 需求提取

### 2.1 R1 显式需求（逐行交互提取）

```bash
# Agent 使用 guided-extract 逐行提取需求
npx tsx index.ts guided-extract \
  --stage r1 \
  --shard-id <shard-id> \
  --workdir /tmp/srs-demo/.srs_formalizer
```

**产出**：`S2_extracted/r1_explicit.jsonl` — 显式功能需求记录。

### 2.2 R2 隐式需求 + R3 关系需求

```bash
npx tsx index.ts guided-extract --stage r2 --shard-id <shard-id> --workdir /tmp/srs-demo/.srs_formalizer
npx tsx index.ts guided-extract --stage r3 --shard-id <shard-id> --workdir /tmp/srs-demo/.srs_formalizer
```

**产出**：`S2_extracted/r2_implicit.jsonl`、`S2_extracted/r3_relationships.jsonl`

### 2.3 架构分解

```bash
npx tsx index.ts guided-extract --stage arch --shard-id <shard-id> --workdir /tmp/srs-demo/.srs_formalizer
```

**产出**：`S2_extracted/architecture.jsonl`

### 2.4 校验提取结果

```bash
npx tsx index.ts validate-jsonl --file /tmp/srs-demo/.srs_formalizer/S2_extracted/r1_explicit.jsonl --workdir /tmp/srs-demo/.srs_formalizer
npx tsx index.ts validate-architecture --file /tmp/srs-demo/.srs_formalizer/S2_extracted/architecture.jsonl
```

**产出**：校验报告（格式 + 完整性 6 项检查）。

---

## S3 — 图谱构建

### 3.1 构建需求知识图谱

```bash
npx tsx index.ts build-graph --workdir /tmp/srs-demo/.srs_formalizer
```

**产出**：`S3_graph/requirement_graph.json` — 需求节点 + 关系边。

### 3.2 结构分析

```bash
npx tsx index.ts analyze-structure --workdir /tmp/srs-demo/.srs_formalizer
```

**产出**：`S3_graph/structure_issues.json` — 孤立/悬挂/孤岛检测报告。

### 3.3 语义分析 + 去重

```bash
npx tsx index.ts analyze-graph --workdir /tmp/srs-demo/.srs_formalizer
```

**产出**：`S3_graph/analysis_issues.json` — Jaccard 去重、反义检测、同对象聚类。

### 3.4 合并子代理修复

```bash
npx tsx index.ts merge-structure --workdir /tmp/srs-demo/.srs_formalizer
npx tsx index.ts merge-analysis --workdir /tmp/srs-demo/.srs_formalizer
```

### 3.5 导出 Cypher

```bash
npx tsx index.ts export-cypher --workdir /tmp/srs-demo/.srs_formalizer
npx tsx index.ts validate-cypher --file /tmp/srs-demo/.srs_formalizer/S3_graph/requirement_graph.cypher --workdir /tmp/srs-demo/.srs_formalizer
```

**产出**：`S3_graph/requirement_graph.cypher` — Neo4j Cypher 导入脚本。

---

## S4 — BDD 生成

### 4.1 生成 Gherkin 骨架

```bash
npx tsx index.ts generate-bdd --workdir /tmp/srs-demo/.srs_formalizer
```

**产出**：`S4_bdd/*.feature` — Gherkin 行为驱动测试骨架文件。

### 4.2 校验 + 行为图谱

```bash
npx tsx index.ts validate-bdd --workdir /tmp/srs-demo/.srs_formalizer
npx tsx index.ts build-behavior-graph --workdir /tmp/srs-demo/.srs_formalizer
```

**产出**：`S4_bdd/behavior_graph.json` — 系统行为图谱。

---

## S5 — 形式化（条件触发）

> 仅当 S0 能力探测中 `logical_reasoning` ≥ 阈值时触发。

### TLA+ 规约

```bash
# 由 Agent 子代理生成 .tla 文件
# 确定性验证（需要安装 SANY + TLC）
npx tsx index.ts build-tla-graph --workdir /tmp/srs-demo/.srs_formalizer
```

**产出**：`S5_formal/*.tla`、`S5_formal/tla_interaction_graph.json`

### Lean 4 证明

```bash
# 由 Agent 子代理生成 .lean 文件
# 确定性验证（需要安装 Lean 4 + lake build）
npx tsx index.ts build-lean-graph --workdir /tmp/srs-demo/.srs_formalizer
```

**产出**：`S5_formal/*.lean`、`S5_formal/lean_proof_graph.json`

---

## S6 — 验收闸门

### 6.1 三级硬门禁

```bash
npx tsx index.ts verify-gate --stage S1 --workdir /tmp/srs-demo/.srs_formalizer
npx tsx index.ts verify-gate --stage R3 --workdir /tmp/srs-demo/.srs_formalizer
npx tsx index.ts verify-gate --stage FINAL --workdir /tmp/srs-demo/.srs_formalizer
```

### 6.2 系统架构图谱 + 收敛循环

```bash
npx tsx index.ts build-system-architecture --workdir /tmp/srs-demo/.srs_formalizer
```

**产出**：
- `S6_gate/system_architecture.json` — 四层合成系统架构图谱
- `S6_gate/consistency_report.json` — 跨层一致性报告
- `S6_gate/convergence_log.jsonl` — 收敛循环日志（≤5 次迭代）

---

## 自动化执行

以上所有步骤可由 Agent 自动编排：

```bash
npx tsx agent/index.ts \
  --llm-config test-llm-config.json \
  --task agent/task-srs-formalizer.md \
  --skills-dir .claude/skills \
  --work-dir /tmp/srs-demo/.srs_formalizer
```

Agent 读取 SKILL.md 后自主发现流水线阶段，按序调用 CLI 命令完成全流程。
