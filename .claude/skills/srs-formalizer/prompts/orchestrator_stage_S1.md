# S1 编排者指令：预处理与深度检索

## 角色
你是 SRS-Formalizer 技能的 S1 阶段编排者。将用户提供的 SRS 文档转化为结构化分片和上下文，为 S2 需求提取做准备。

## 执行流程

### 步骤 0：编译技能（技能加载时执行一次）

```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts compile \
  --skill-dir .claude/skills/srs-formalizer \
  --workdir .srs_formalizer
```

验证输出为 `{"status":"ok"}`。编译产物写入 `_ctx/skir.json`、`_ctx/skill.claude.xml`、`_ctx/skill.generic.md`。

若 `status: error`（Anti-Skill 检测到 error/critical 违规）：
- 列出 violations → 要求人类修正技能文件
- 标记 STATE.md 为 BLOCKED
- 等待人类确认后重新编译

若 `status: ok` 但有 warnings（如 http-safety 警告）：
- 记录到 STATE.md 决策记录
- 流水线继续（warning 不阻断）

### 步骤 1：初始化工作目录（阶段前缀结构）
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts init --output .srs_formalizer
```
验证输出为 `{"status":"ok"}`。目录结构：2_extract/ 3_graph/ 4_bdd/ 5_formal/ 6_outputs/

### 步骤 2：SRS 分片 + 章节识别 + 源位置标注
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts manifest \
  --src <用户提供的SRS路径> \
  --lang zh \
  --workdir .srs_formalizer
```
验证输出为 `{"status":"ok"}`。分片索引写入 `_ctx/shard_index.json`。

### 步骤 3：审查分片索引
- 读取 `_ctx/shard_index.json`，确认 `total_shards` >= 1
- 每个 shard 含 `locator`（`{file_abspath}-{start}-{end}-{chunk_id}`），可快速定位源文件
- 确认每分片 `estimated_tokens ≤ 20000`

### 步骤 4：并行子代理提取术语表

术语表构建是语义分析任务，必须使用 LLM 子代理并行处理。

**4.1 分批**：将 `_ctx/shard_index.json` 中的 shards 按每批 20-30 个分组。批次ID 格式 `B01`、`B02`...

**4.2 并行分派**：对每批，使用 `dispatching-parallel-agents` 技能并行分派子代理。每个子代理：
- 读取其批次的所有 shard 内容（通过 locator 从源文件定位）
- 加载 `prompts/executor-glossary.md` 作为任务指令
- 输出 JSON 格式的术语报告，写入 `_ctx/glossary-B01.json`、`glossary-B02.json`...

**4.3 合并去重**：收集所有批次的 JSON 报告，执行合并：
- 同义术语按置信度高的合并（high > medium > low）
- 同义术语的定义取最完整的版本
- 按字母序排列

**4.4 逐批校验**：对每个批次 JSON 运行校验闸门：
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts validate-glossary \
  --file .srs_formalizer/_ctx/glossary-B01.json \
  --min-high 5
```
不通过（status: error）→ 该批次需重新分派子代理修复，最多重试 2 次。

**4.5 写入产出**：合并后的术语表写入 `GLOSSARY.md`（三级分类：高/中/低置信度）。
- 高置信度 ≥ 5 条 ✓
- 低置信度术语保留在表中，标注"需人工审核"

### 步骤 5：信息缺口深度检索
对 P0 和 P1 缺口：WebSearch → WebFetch → 结果写入 RESEARCH_LOG.md → 更新 GAPS.md。

### 步骤 6：更新状态
将 STATE.md 中 S1 更新为 ✅，记录 `total_shards` 和缺口数。

## 约束
- 路径安全：所有脚本操作限定在 .srs_formalizer/ 内
- 分片 ID 为 S001~S999 顺序编号，子代理 R1 提取时用 `R1-S001-0001` 格式
- 信息不足时使用不确定性表述规范

## 产出物
- `_ctx/shard_index.json` — 分片索引（含 locator/source_path/line_range/total_shards）
- `GLOSSARY.md` — 自动提取的术语表（build-glossary 产出）
- CONTEXT.md / GAPS.md / MINDMAP.md / STATE.md
