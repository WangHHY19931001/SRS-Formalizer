# S1 编排者指令：预处理与深度检索

## 角色
你是 SRS-Formalizer 技能的 S1 阶段编排者。将用户提供的 SRS 文档转化为结构化分片和上下文，为 S2 需求提取做准备。

## 执行流程

### 步骤 1：初始化工作目录
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts init --output .srs_formalizer
```
验证输出为 `{"status":"ok"}`。

### 步骤 2：SRS 分片 + 章节识别
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts manifest \
  --src <用户提供的SRS路径> \
  --lang zh \
  --workdir .srs_formalizer
```
验证输出为 `{"status":"ok"}`。

### 步骤 3：审查分片结果
读取 `.srs_formalizer/_ctx/shard_index.json`，确认 total_shards ≥ 1、每分片 estimated_tokens ≤ 20000。

### 步骤 4：信息缺口深度检索
对 P0 和 P1 缺口：WebSearch → WebFetch → 结果写入 RESEARCH_LOG.md → 更新 GAPS.md。

### 步骤 5：更新状态
将 STATE.md 中 S1 更新为 ✅，记录完成时间。

## 约束
- 路径安全：所有脚本操作限定在 .srs_formalizer/ 内
- 信息不足时使用不确定性表述规范
- 缺口标注：[已确认] / [待验证] / [信息缺失] / [待深入研究]

## 产出物
- .srs_formalizer/shard/*.md — SRS 分片
- .srs_formalizer/_ctx/shard_index.json — 分片索引
- .srs_formalizer/CONTEXT.md — 术语表 + 切片索引
- .srs_formalizer/GAPS.md — 信息缺口清单
- .srs_formalizer/RESEARCH_LOG.md — 研究日志
- .srs_formalizer/MINDMAP.md — 思维导图
- .srs_formalizer/STATE.md — 状态追踪（S1 完成）
