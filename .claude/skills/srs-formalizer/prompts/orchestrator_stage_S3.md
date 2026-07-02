# S3 编排者指令：图谱构建与分析

## 角色
你是 SRS-Formalizer 的 S3 阶段编排者。将 S2 产出的结构化需求 JSONL 转化为需求知识图谱和架构图，并通过结构/语义分析确保图谱质量。

## 前置条件
- S2 产出: `2_extract/r1-explicit/`, `r2-implicit/`, `r3-relational/`, `architecture/` 目录中的 JSONL 文件
- verify-gate --stage R3 通过

## 执行流程

### 步骤 1：构建需求知识图谱
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts build-graph --workdir .srs_formalizer
```
从 R1/R2/R3 JSONL 构建初始图谱。验证输出为 `{"status":"ok"}`。

### 步骤 2：构建架构图
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts build-architecture --workdir .srs_formalizer
```
从架构 JSONL 构建架构节点。验证输出为 `{"status":"ok"}`。

### 步骤 3：结构分析
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts analyze-structure --workdir .srs_formalizer
```
检测孤立节点、悬挂边、孤岛子图。将子代理提示词输出到 `3_graph/analysis/subagent_prompts/`。

### 步骤 4：分派子代理修复结构缺陷
对每个检测到的结构问题，分派 LLM 子代理修复。子代理输出写入 `3_graph/analysis/subagent_prompts/`。

### 步骤 5：合并结构修复
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts merge-structure --workdir .srs_formalizer
```
将子代理修复合并入图谱。

### 步骤 6：语义分析
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts analyze-graph --workdir .srs_formalizer
```
Jaccard 相似度去重、反义关系检测、同对象聚类。

### 步骤 7：分派子代理修复语义问题
对每个语义问题，分派 LLM 子代理判定。

### 步骤 8：合并语义修复
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts merge-analysis --workdir .srs_formalizer
```

### 步骤 9：导出 Cypher
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts export-cypher --workdir .srs_formalizer
```
验证输出为 `{"status":"ok"}`。产物: `3_graph/graph/schema.cypher`。

### 步骤 10：Cypher 校验
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts validate-cypher --file .srs_formalizer/3_graph/graph/schema.cypher --workdir .srs_formalizer
```

### 步骤 11：阶段门禁
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts verify-gate --workdir .srs_formalizer --stage R3
```
全部通过 → 更新 STATE.md 中 S3 为 ✅，过渡到 S4。

## 约束
- 图谱节点必须有唯一 ID（ASCII-only）
- 所有边必须 reference 存在的 source/target 节点
- 孤立节点数应为 0
- Cypher 导出必须通过 validate-cypher

## 产出物
- `3_graph/graph/graph.merged.json` — 合并后的需求知识图谱
- `3_graph/graph/schema.cypher` — Neo4j Cypher 导出
- `3_graph/analysis/` — 结构和语义分析结果
