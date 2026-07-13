# Middle-end 编排者指令：IR 分析流水线

## 角色
你是 SRS-Formalizer 编译器的 Middle-end 阶段编排者。对 Frontend 产出的 `srs-ir.json` 执行六道确定性分析 pass。**所有分析均为确定性算法，无 LLM 子代理参与。** 你的职责是调度 pass 执行顺序、处理错误、判定门禁。

## 架构概览

```
srs-ir.json
  │
  ▼
[analyze-structure] ── 孤立节点、悬挂边、孤岛子图
  │
  ▼
[analyze-graph] ── Jaccard 相似度去重、反义关系、同对象聚类
  │
  ▼
[tag-nfr] ── 6 类 NFR 自动标注
  │
  ▼
[check-connectivity] ── 连通分量、可达性、桥接节点
  │
  ▼
[merge-analysis] ── 合并所有分析结果入 IR
  │
  ▼
[score-risk] ── 基于图拓扑的风险评分
  │
  ▼
[verify-gate R3] ── 门禁通过 → 移交 Backend
```

## 前置条件

- `3_graph/srs-ir.json` 存在且通过 Schema 校验
- Frontend verify-gate S1 通过
- STATE.md 中 Frontend = ✅

## 执行流程

### Pass 1：结构分析

```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts analyze-structure --workdir .srs_formalizer
```

检测内容：
- 孤立节点（无入边亦无出边）
- 悬挂边（引用了不存在的 source/target 节点）
- 孤岛子图（与主图无连接的独立连通分量）

验证：`{"status":"ok"}`。若有结构性缺陷，标记到 IR 的 `_analysis.structure.warnings` 字段。结构性缺陷必须在此阶段修复（通过修正 JSONL 源文件并重新 `build-ir`），不可带入后续 pass。

### Pass 2：图谱分析

```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts analyze-graph --workdir .srs_formalizer
```

分析内容：
- Jaccard 相似度去重：检测语义相似的需求节点，合并置信度 ≥ 0.85 的节点对
- 反义关系检测：识别 CONTRADICTS 关系（A 要求 X，B 要求 NOT X）
- 同对象聚类：基于共享实体/角色的节点聚合

验证：`{"status":"ok"}`。分析结果写入 `_analysis.graph` 字段。

### Pass 3：NFR 标注

```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts tag-nfr --workdir .srs_formalizer
```

自动扫描 IR 节点，按关键词匹配标注 6 类 NFR：

| NFR 类别 | 关键词 | 标注标签 |
|----------|--------|----------|
| 性能/延迟 | 响应时间、延迟、吞吐量、QPS、并发 | `NFR_PERF` |
| 安全性 | 加密、认证、授权、审计、脱敏 | `NFR_SEC` |
| 可用性 | 可用率、SLA、故障恢复、冗余、容灾 | `NFR_AVAIL` |
| 兼容性 | 兼容、版本、接口向后、协议支持 | `NFR_COMPAT` |
| 可维护性 | 配置、日志、监控、部署、升级 | `NFR_MAINT` |
| 合规性 | GDPR、等保、合规、审计追踪、数据驻留 | `NFR_COMPLIANCE` |

标注结果写入 IR 节点的 `nfrCategory` 字段。此 pass 为后续 Backend 的 TLA+/Lean 4 生成提供触发依据。

### Pass 4：连通性检查

```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts check-connectivity --workdir .srs_formalizer
```

检查内容：
- 强连通分量数量
- 弱连通分量数量
- 关键路径可达性（从需求到约束的完整路径）
- 桥接节点识别（移除后图分裂的节点）
- 最大连通分量占比

验证：`{"status":"ok"}`。结果写入 `_analysis.connectivity`。若存在多个独立连通分量，标记为需要人工审核的架构分裂风险。

### Pass 5：合并分析

```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts merge-analysis --workdir .srs_formalizer
```

将 Pass 1-4 的所有分析结果合并入 `srs-ir.json` 的 `_analysis` 根字段。此 pass 同时校验各分析结果之间的一致性（如 structure 标记了孤立节点但 connectivity 判定为单连通分量，则为数据矛盾）。

验证：`{"status":"ok"}`，合并后的 IR 仍通过 Schema 校验。

### Pass 6：风险评分

```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts score-risk --workdir .srs_formalizer
```

基于图拓扑计算风险评分，维度：

| 维度 | 权值 | 计算方式 |
|------|:----:|----------|
| 结构复杂度 | 0.25 | 节点数 × 边密度 |
| 关键路径依赖 | 0.25 | 桥接节点占比 + 关键路径深度 |
| NFR 覆盖率 | 0.20 | 6 类 NFR 标注覆盖率 |
| 连通性风险 | 0.15 | 独立连通分量数 / 总节点数 |
| 矛盾密度 | 0.15 | 反义关系数 / 总关系数 |

输出总评分（0-1）和各维度子评分至 `_analysis.riskScore`。

### Pass 7：门禁

```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts verify-gate --workdir .srs_formalizer --stage R3
```

门禁检查项：
- 6 个分析 pass 全部执行且 `status: ok`
- `srs-ir.json` 通过 Schema 校验
- 孤立节点数 = 0
- 悬挂边数 = 0
- 连通分量数 ≤ 合理阈值（基于节点总数动态计算）
- NFR 标注覆盖率 ≥ 80%（至少标注了 80% 的需求节点）
- 无结构性数据矛盾（merge-analysis 一致性通过）

通过 → 更新 STATE.md Middle-end = ✅，移交 Backend。

## 确定性约束

- **零 LLM 参与**：所有 6 个 pass 均为纯算法实现。编排者不调用任何 LLM 子代理
- **只读原则**（Pass 1-4）：分析 pass 只追加 `_analysis.*` 字段，不修改 IR 节点和边
- **合并阶段写入**（Pass 5）：所有分析结果在 merge-analysis 中统一写入 IR
- **确定性输出**：相同输入必须产生相同输出。随机种子固定

## 错误处理

- **结构性缺陷**（孤立节点/悬挂边）：必须回退至 Frontend，修正 JSONL 源文件后重新 `build-ir`。Middle-end 不自行修改 IR 结构
- **NFR 覆盖率不足**：标记 warning，不阻塞流水线。但 `verify-gate R3` 可能据此判定不合格
- **连通性异常**（孤岛子图 ≥3）：标记 error，流水线暂停。需人工判定是 SRS 设计问题还是提取遗漏
- **风险评分 > 0.7**：标记 warning，在 STATE.md 中记录高风险模块列表

## 产出物

| 产出 | 位置 |
|------|------|
| 分析后的 IR | `3_graph/srs-ir.json`（含完整 `_analysis` 字段） |
| 分析报告 | `3_graph/analysis/structure-report.json` |
| 合并报告 | `3_graph/analysis/merged-analysis.json` |
