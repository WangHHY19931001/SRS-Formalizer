---
name: srs-formalizer
description: 当用户提供 SRS（软件需求规格说明）文档并要求生成形式化产出时使用——包括需求知识图谱、BDD 特性文件、TLA+ 形式化规约或 Lean 4 算法证明。触发条件：用户上传或引用 SRS 文档（HTML/Markdown/多目录包），要求"形式化"、"生成知识图谱"、"生成 BDD"、"TLA+ 建模"、"Lean 证明"。
---

# SRS Formalizer

## 概述

将 SRS 文档转化为四类形式化产出：需求知识图谱（Cypher）、BDD（Gherkin）、TLA+ 规约（条件触发）、Lean 4 证明（条件触发）。TS 脚本做确定性机械工作，LLM 子代理做语义判断，编排者做流程决策。

## 工作流（六阶段）

1. **S1 预处理** — 初始化工作目录 + SRS 分片 + 章节识别 + 信息缺口检测
2. **S2 需求提取** — R1 显式 / R2 隐式 / R3 关系提取 + 校验者审核
3. **S3 图谱构建** — 结构补全 → 语义去重 → Cypher 导出
4. **S4 BDD 生成** — 骨架生成 → 子代理充实 Then 步骤 → 格式校验
5. **S5 形式化** — TLA+ 层次建模与 TLC 验证 + Lean 4 拆分证明（条件触发）
6. **S6 验收闸门** — 硬门禁检查 + 头脑风暴上下文导出

## S1 阶段：预处理

### 脚本

| 命令 | 功能 |
|------|------|
| `npx tsx index.ts init --output .srs_formalizer` | 初始化工作目录结构 |
| `npx tsx index.ts manifest --src <path> --lang zh\|en --workdir .srs_formalizer` | SRS 分片 + 章节识别 + 缺口检测 |

### 执行流程

1. `init` 创建 `.srs_formalizer/` 及全部子目录，写入初始 `STATE.md`
2. `manifest` 读取 SRS 源 → 合并 → 章节识别 → Token 切分 → 写入分片
3. 编排者根据 `GAPS.md` 执行联网检索（WebSearch / WebFetch）
4. 更新 `STATE.md` 标记 S1 完成

## 核心原则

- **TS 脚本只做确定性转换**，不调用 LLM、不产生随机性、不依赖外部 API
- **所有文件操作限定在 `.srs_formalizer/` 工作目录内**
- **子代理输出必须通过 JSONL 格式校验**
- **SRS 回写必须经用户确认**，禁止自动修改原始 SRS
- **仅依赖 `typescript` + `@types/node`**，无外部 npm 包

## 依赖技能

**必需背景：** superpowers:test-driven-development、superpowers:verification-before-completion
