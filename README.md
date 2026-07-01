# SRS-Formalizer

将 SRS（软件需求规格说明）文档转化为四类形式化产出的 AI Agent 技能：
**需求知识图谱**（Cypher）· **BDD 测试骨架**（Gherkin）· **TLA+ 规约** · **Lean 4 证明**

## 快速开始

```bash
# 安装依赖
cd .claude/skills/srs-formalizer/scripts && npm install

# 初始化工作目录
npx tsx index.ts init --output .srs_formalizer

# 索引化分片（支持 .md / .html / 多目录包）
npx tsx index.ts manifest --src <srs-file-or-dir> --lang zh --workdir .srs_formalizer

# 编译技能（v0.4.0+，安全注入 + 平台发射）
npx tsx index.ts compile --skill-dir .claude/skills/srs-formalizer --workdir .srs_formalizer

# 运行测试
npm test
```

## 流水线架构

```
S0(发现确认) → S1(索引化分片) → S2(需求提取+架构7子阶段) → S3(图谱构建)
→ S4(BDD生成) → S5(形式化/条件触发) → S6(验收闸门)
```

| 阶段 | 输入 | 产出 |
|------|------|------|
| **S0** Discovery | SRS 文档 | 分析报告 + TLA+/Lean 触发判定 |
| **S1** Preprocess | 原始 SRS | `shard_index.json`（索引化分片，**不创建物理文件**） |
| **S2** Extract | 分片索引 | R1 显式/R2 隐式/R3 关系需求 JSONL + 架构 JSONL |
| **S3** Graph | 需求 JSONL | 知识图谱 → Cypher 导出 |
| **S4** BDD | 图谱 | `.feature` 文件 |
| **S5** Formal | 图谱 + 触发条件 | TLA+ `.tla` / Lean `.lean`（条件触发） |
| **S6** Gate | 全阶段产物 | 验收报告 + 头脑风暴上下文 |

## 18 个 CLI 命令

| 命令 | 阶段 | 功能 |
|------|:----:|------|
| `init` | S1 | 初始化 `.srs_formalizer/` 工作目录 |
| `manifest` | S1 | SRS 索引化分片 + 章节识别 + 缺口检测 |
| `compile` | 加载时 | 编译 SKILL.md → SkIR + Anti-Skill 注入 + 平台发射 |
| `inject-prompt` | S2 | 模板参数注入（支持 `--shard-id` 自动解析） |
| `validate-jsonl` | S2 | JSONL 6 项格式校验 |
| `validate-architecture` | S2 | 架构 JSONL 6 项校验 + 循环检测 |
| `build-graph` | S3 | JSONL → 需求知识图谱 |
| `build-architecture` | S3 | 架构 JSONL → 架构图节点 |
| `analyze-structure` | S3 | 孤立/悬挂/孤岛检测 |
| `merge-structure` | S3 | 结构补全合并 |
| `analyze-graph` | S3 | Jaccard 去重 + 反义检测 + 同对象聚类 |
| `merge-analysis` | S3 | 语义判定合并 |
| `export-cypher` | S3 | 图谱 → Neo4j Cypher 脚本 |
| `generate-bdd` | S4 | 图谱 → Gherkin BDD 骨架 |
| `validate-bdd` | S4 | Gherkin 格式校验 |
| `query-graph` | S6 | 图谱只读查询（7 种） |
| `verify-gate` | S1/S3/S6 | 三级硬门禁检查 |
| `capability-probe` | S0 | LLM 能力探测（出题+判分） |

## 安装技能

```bash
# 项目级安装
cp -r .claude/skills/srs-formalizer /your-project/.claude/skills/

# 或从 zip 分发
unzip srs-formalizer-v0.5.0.zip -d /your-project/
```

## 技术栈

- **TypeScript 5.5+**（strict 模式）
- **Node.js ≥20**（ESM）
- **零外部 npm 依赖**（仅 `typescript` + `@types/node`）
- **测试**：Node.js 原生 `node:test` + `node:assert`（255 用例）

## 版本历史

| 版本 | 日期 | 关键变更 |
|------|------|---------|
| **0.5.0** | 2026-07-01 | 分片索引化重构——`ShardEntry.locator` 格式 `{file_abspath}-{start}-{end}-{chunk_id}`，移除 `1_shard/` 目录，HTML 格式保留，`inject-prompt --shard-id` 自动解析 |
| **0.4.0** | 2026-07-01 | SkCC 方法论集成——`compile` 命令、SkIR 中间表示、Anti-Skill 安全注入（7 条规则）、Claude XML + Generic MD 双发射器 |
| **0.3.0** | 2026-06-30 | 分片源位置标注、安全 ID（ASCII-only）、目录结构重构（阶段前缀） |
| **0.2.0** | 2026-06-30 | S2 阶段：inject-prompt、validate-jsonl、executor/verifier 提示词 |
| **0.1.0** | 2026-06-30 | S1 基础设施：init、manifest、类型定义、安全库 |

## 目录结构

```
.claude/skills/srs-formalizer/
├── SKILL.md              # 技能定义
├── CHANGELOG.md          # 版本变更
├── scripts/              # TypeScript 工具链
│   ├── index.ts          # CLI 入口
│   ├── commands/         # 18 个命令
│   ├── lib/              # 库模块（graph, jsonl, bdd, anti-skill, emitters...）
│   ├── types/            # 类型定义（JsonlRecord, ShardEntry, SkIR...）
│   └── __tests__/        # 255 个测试
├── prompts/              # LLM 提示词（编排者 + 执行者 + 校验者）
├── references/           # 参考文档
├── templates/            # 产出模板 + CHECKLIST
└── tests/                # 验收用例 + Golden 文件
```

## 参考

- **SkCC 论文**: [arXiv:2605.03353](https://arxiv.org/abs/2605.03353) — 编译方法论基础
- **SkillsBench**: [arXiv:2602.12670](https://arxiv.org/abs/2602.12670) — Agent 技能基准
- **Agent Skills 规范**: [agentskills.io](https://agentskills.io/)
