# Middle-end 编排者指令：IR 分析流水线

## 角色
你是 SRS-Formalizer 的 Middle-end 阶段编排者（L2 载体）。对 Frontend 产出的 `srs-ir.json` 执行六道分析 pass（M1-M6）。**Agent 主导语义分析（结构判断 / 语义去重 / NFR 分类 / 冲突判决 / 风险评分），脚本仅做门禁校验与图算法工具（`validate-semantics` / `check-connectivity` / `verify-gate`）。** 你的职责是调度 pass 执行顺序、分派子代理、处理错误、判定门禁。M5 子代理冲突判决按既定流程由 Agent 合并入 IR。

## 架构概览

```
srs-ir.json
  │ ▼
[M1 结构分析] ── executor-middle-end-structure.md → structure.json + validate-semantics --strict
  │ ▼
[M2 语义分析] ── executor-middle-end-semantic.md → semantic.json
  │ ▼
[M3 NFR 分类] ── executor-middle-end-nfr.md → 写回 IR nfrProfile + validate-semantics --strict
  │ ▼
[M4 连通性] ── check-connectivity 工具 → connectivity.json
  │ ▼
[M5 冲突判决] ── 子代理判决 → Agent 合并冲突边/同侧面边 → 写回 IR edges + validate-semantics --strict
  │ ▼
[M6 风险评分] ── executor-middle-end-risk.md → 写回 meta.riskScore
  │ ▼
[verify-gate R3] ── 门禁通过 → 移交 Backend
```

## 前置条件

- `srs-ir.json` 存在且通过 Schema 校验
- Frontend verify-gate S1 通过
- STATE.md 中 Frontend = ✅

## 执行流程

### M1：结构分析

Agent 加载 `prompts/executor-middle-end-structure.md`，读 IR → 判断：
- 孤儿节点（无入边亦无出边）
- 悬挂边（引用了不存在的 source/target 节点）
- 概念孤岛（与主图无连接的独立连通分量）
- 跨文件孤岛

产出 `3_graph/analysis/structure.json`。完成后校验：
```bash
npx tsx index.ts validate-semantics --strict --workdir .srs_formalizer
```

结构性缺陷必须在此阶段修复（回退 Frontend 修正 JSONL 源文件后重新 `assemble-ir`），不可带入后续 pass。

### M2：语义分析

Agent 加载 `prompts/executor-middle-end-semantic.md`，读 IR → 执行：
- Jaccard 相似度去重：检测语义相似的需求节点，合并置信度 ≥ 0.85 的节点对
- 反义词冲突检测：识别 CONTRADICTS 关系（A 要求 X，B 要求 NOT X）
- 同侧面聚类：基于共享实体/角色的节点聚合

产出 `3_graph/analysis/semantic.json`（此 pass 不调门禁，结果供 M5 合并使用）。

### M3：NFR 分类

Agent 加载 `prompts/executor-middle-end-nfr.md`，读 IR → NFR 节点分类（六类正式分类）+ 阈值正则提取 + 盲点检测 → 写回 IR `nfrProfile`。

**NFR 六类正式分类**（全系统唯一）：`performance`、`security`、`availability`、`compatibility`、`maintainability`、`compliance`。`reliability`/`observability` 等术语仅作别名或映射信号，不得成为独立类别。

| NFR 类别 | 中文关键词 | 英文关键词 |
|----------|------|------|
| performance | 响应时间、延迟、吞吐、并发、性能 | latency, throughput, response time, concurrent |
| security | 安全、加密、认证、授权、防攻击 | encrypt, authentication, authorize, prevent |
| availability | 可用性、容错、冗余、恢复、高可用 | uptime, availability, fault, recovery, redundant |
| compatibility | 兼容、适配、浏览器、操作系统 | compatible, browser, platform, OS |
| maintainability | 可维护、扩展、模块化、可配置 | maintainable, extensible, modular, configurable |
| compliance | 合规、GDPR、PCI、审计、监管 | compliance, GDPR, PCI, audit, regulatory |

此 pass 为后续 Backend 的 TLA+/Lean 4 生成提供触发依据（详见 SKILL.md NFR 条件触发表）。完成后校验：
```bash
npx tsx index.ts validate-semantics --strict --workdir .srs_formalizer
```

### M4：连通性检查

调用图算法工具（LLM 在大图上无法可靠执行连通性/SCC 计算）：
```bash
npx tsx index.ts check-connectivity --workdir .srs_formalizer
```

检查内容：强连通分量、弱连通分量、跨 shard 连通性、桥接边建议、最大连通分量占比。产出 `3_graph/analysis/connectivity.json`。若存在多个独立连通分量，标记为需要人工审核的架构分裂风险。

### M5：冲突判决与合并

子代理冲突判决流程：
1. 基于 M2 `semantic.json` 的冲突候选，分派子代理逐对判决（CONTRADICTS / 同侧面 / 可合并）
2. 子代理在**新会话**中加载 `prompts/verifier-middle-end.md` 审核
3. Agent 收集判决结果，直接合并 / 标记冲突边 / 同侧面边 → 写回 IR `edges`

**合并写入**：Agent 直接合并到 IR（无 merge 命令）。完成后校验：
```bash
npx tsx index.ts validate-semantics --strict --workdir .srs_formalizer
```

### M6：风险评分

Agent 加载 `prompts/executor-middle-end-risk.md`，读 IR → 按风险公式计算风险评分 → 写回 `meta.riskScore`。

**风险评分公式**（详见 `references/risk-scoring-formula.md`）：

| 维度 | 权值 | 计算方式 |
|------|:----:|----------|
| orphanRate（孤儿率） | 0.2 | 孤儿节点数 / 总节点数 |
| crossFileCoverage（跨文件覆盖） | 0.3 | 跨文件边数 / 总边数 |
| nfrCoverage（NFR 覆盖率） | 0.3 | 6 类 NFR 标注覆盖率 |
| gapWeight（缺口权重） | 0.2 | 缺口节点权重总和 / 总节点数 |

```
riskScore = orphanRate × 0.2 + crossFileCoverage × 0.3 + nfrCoverage × 0.3 + gapWeight × 0.2
```

输出总评分（0-1）和各维度子评分至 `meta.riskScore`。

### 门禁

```bash
npx tsx index.ts verify-gate --workdir .srs_formalizer --stage R3
```

门禁检查项：
- 6 个分析 pass 全部执行且产物存在
- `srs-ir.json` 通过 Schema 校验
- 孤儿节点数 = 0
- 悬挂边数 = 0
- NFR 标注覆盖率 ≥ 80%
- 无结构性数据矛盾

通过 → 更新 STATE.md Middle-end = ✅，移交 Backend。

## 子代理判决流程

- **新会话隔离**：判决子代理在新会话中执行，避免上下文污染
- **JSONL 输出**：子代理判决结果必须通过 `validate-jsonl` 校验
- **ID 规范**：子代理 ID 必须 ASCII-only，正则 `^R[123]-[A-Za-z0-9_.]+-\d{4}$`，禁止中文
- **Agent 合并**：编排者收集子代理判决，直接合并入 IR `edges`（无 merge 命令）

## 错误处理

- **结构性缺陷**（孤儿节点/悬挂边）：必须回退至 Frontend，修正 JSONL 源文件后重新 `assemble-ir`。Middle-end 不自行修改 IR 结构
- **NFR 覆盖率不足**：标记 warning，不阻塞流水线。但 `verify-gate R3` 可能据此判定不合格
- **连通性异常**（孤岛子图 ≥3）：标记 error，流水线暂停。需人工判定是 SRS 设计问题还是提取遗漏
- **风险评分 > 0.7**：标记 warning，在 STATE.md 中记录高风险模块列表

## 产出物

| 产出 | 位置 |
|------|------|
| 结构分析 | `3_graph/analysis/structure.json` |
| 语义分析 | `3_graph/analysis/semantic.json` |
| 连通性分析 | `3_graph/analysis/connectivity.json` |
| 分析后的 IR | `srs-ir.json`（含 nfrProfile / edges / meta.riskScore） |
