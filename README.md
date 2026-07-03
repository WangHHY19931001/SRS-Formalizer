# SRS-Formalizer

将 SRS（软件需求规格说明）文档形式化为四项工程产物的 AI Agent 技能：

| 产出 | 格式 | 阶段 | 触发 |
|------|------|:--:|------|
| 需求知识图谱 | Neo4j Cypher | S3 | 必选 |
| BDD 测试骨架 | Gherkin `.feature` | S4 | 必选 |
| TLA+ 形式化规约 | `.tla` | S5 | 条件（并发/分布式/共识协议） |
| Lean 4 定理证明 | `.lean` | S5 | 条件（安全关键/密码学/自定义算法） |

## 快速开始

```bash
git clone https://github.com/WangHHY19931001/SRS-Formalizer.git
cd SRS-Formalizer/.claude/skills/srs-formalizer/scripts
npm install

# 初始化工作目录
npx tsx index.ts init --output .srs_formalizer

# 索引化分片
npx tsx index.ts manifest --src <srs-file-or-dir> --lang zh --workdir .srs_formalizer

# 运行测试
npx tsx --test __tests__/*.test.ts
```

## 七阶段流水线

```
S0(发现确认) → S1(预处理) → S2(需求提取+7子阶段) → S3(图谱构建)
             → S4(BDD生成) → S5(形式化/条件触发) → S6(验收闸门+收敛循环)
```

每个阶段有对应的 CLI 命令和硬性 gate condition，不通过阻断后续。

TS 脚本做确定性机械工作，LLM 子代理做语义判断，编排者做流程决策。

## 设计文档

完整的技能设计位于 **[docs/DESIGN.md](docs/DESIGN.md)**——它是技能开发的唯一事实依据（Single Source of Truth）。

## 技术栈

- **TypeScript 5.5+** strict 模式（`noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`）
- **Node.js ≥20** ESM
- **零运行时 npm 依赖**——仅 `typescript` + `@types/node` 为 devDeps
- 测试：Node.js 原生 `node:test`（299 用例）
- 编译管线：SkIR（对标 SkCC, arXiv:2605.03353）→ Claude XML + Generic MD 双发射器
- 形式化工具：内置 `tla2tools-1.7.4.jar`（SANY 2.2 + TLC2 2026.05.18）+ Lean 4 + gherkin-lint

## 目录结构

```
.claude/skills/srs-formalizer/
├── SKILL.md                 # L1+L2 指令（~3,800 tokens）
├── CHANGELOG.md             # 版本变更
├── agent-card.json          # A2A Protocol v1.0
├── BASELINE.md              # TDD RED 基线
│
├── scripts/                 # TypeScript 工具链
│   ├── index.ts             # CLI 入口（注册表, 31 命令）
│   ├── package.json         # 零运行时依赖（仅 devDeps）
│   ├── tsconfig.json        # strict 模式
│   ├── commands/            # 31 条命令
│   │   ├── guided-extract.ts
│   │   ├── capability-probe.ts
│   │   ├── stability-test.ts
│   │   └── ...
│   ├── lib/                 # 19 核心 + 5 子模块
│   │   ├── cli.ts           # 参数安全 + 毒值拒绝 + 路径校验
│   │   ├── graph.ts         # 图数据结构
│   │   ├── jsonl.ts         # JSONL 读写
│   │   ├── anti-skill.ts    # 安全约束注入
│   │   ├── skir-builder.ts  # SkIR 构建
│   │   ├── cross-graph-verifier.ts
│   │   ├── tla-validator.ts
│   │   ├── probe/           # 能力探测（types + questions/ + scorer/）
│   │   ├── llm/             # 稳定性测试（config + stability）
│   │   ├── cross-graph/     # 跨图验证问题定义
│   │   ├── verify-gate/     # 三级门禁（shared + checks-s1/r3/final）
│   │   └── architecture/    # 架构图构建
│   ├── types/               # index.ts（JSONL 类型）+ skir.ts（SkillIR 20+ 字段）
│   ├── __tests__/           # 35 文件, 299 测试
│   └── templates/           # check.sh.template
│
├── prompts/                 # 25 LLM 提示词
│   ├── orchestrator_stage_S0~S6.md  # 7 编排者
│   ├── executor-R1~R5.md           # 6 执行者（R4 拆为 clarify+verify）
│   ├── executor-arch-1~3.md        # 3 架构分解
│   ├── executor-glossary.md
│   ├── verifier-R1~R5.md           # 5 验证者
│   ├── verifier-arch.md
│   └── debug-lean.md, debug-tlc.md # 2 诊断
│
├── references/              # 12 参考文档
├── templates/               # 18 产出模板（.template + .gherkin-lintrc* + checklists/）
├── tests/                   # Golden + 验收用例 + 可追溯性矩阵
├── tools/                   # tla2tools-1.7.4.jar (SANY 2.2 + TLC2 2026.05.18)
├── examples/                # 端到端 walkthrough
└── docs/                    # DESIGN.md（唯一事实依据）
```

## 31 条 CLI 命令

| 命令 | 阶段 | 功能 |
|------|:--:|------|
| `init` | S1 | 初始化工作目录 |
| `manifest` | S1 | 索引化分片 + 章节识别 |
| `guided-extract` | S2 | 两步模式逐行 JSONL 提取 |
| `inject-prompt` | S2 | 模板参数注入 |
| `validate-jsonl` | S2 | JSONL 格式校验（6 项） |
| `validate-architecture` | S2 | 架构 JSONL 校验 |
| `validate-glossary` | S1 | 术语表校验（8 项） |
| `build-graph` | S3 | JSONL → 需求知识图谱 |
| `build-architecture` | S3 | 架构 JSONL → 架构图 |
| `analyze-structure` / `merge-structure` | S3 | 结构分析 + 合并 |
| `analyze-graph` / `merge-analysis` | S3 | 语义分析 + 合并 |
| `export-cypher` | S3 | 图谱 → Cypher 脚本 |
| `validate-cypher` | S3 | Cypher 校验（4 项） |
| `generate-bdd` | S4 | 图谱 → BDD 骨架 |
| `validate-bdd` | S4 | Gherkin 严格模式（20 条规则） |
| `build-behavior-graph` | S4 | BDD → 行为图谱 |
| `build-tla-graph` | S5 | TLA+ → 交互图谱 |
| `build-lean-graph` | S5 | Lean 4 → 证明依赖图谱 |
| `validate-tla` | S5 | SANY + TLC 严格模式 |
| `validate-lean` | S5 | lake build 验证 |
| `build-system-architecture` | S6 | 系统架构合成 |
| `query-graph` | S6 | 图谱只读查询 |
| `verify-gate` | S1/S3/S6 | 三级硬门禁 |
| `validate-checklist` | S0-6 | CHECKLIST 校验 + 修复 |
| `capability-probe` | S0 | LLM 能力探测（8 维, 条件生成） |
| `stability-test` | 评估 | 跨 LLM 稳定性测试（σ/Δ） |
| `compile` | 编译 | SKILL.md → SkIR + Anti-Skill + 多平台发射 |
| `pack-skill` | 维护 | 加密备份（AES-256-GCM） |
| `verify-skill-integrity` | 维护 | 完整性校验 + 自动修复 |

完整参数见 `references/quick-reference.md`。

## 关键设计约束

- **零运行时 npm 依赖**——自包含，不引入供应链风险
- **TS 脚本只做确定性转换**——不调 LLM，不产生随机数
- **所有文件操作限定 `.srs_formalizer/`**——路径安全双校验
- **Poison value 拒绝**——`undefined/null/NaN/[object Object]` 在入口拦截
- **31/31 命令 `refuseDirectInvocation`**——禁止绕过 CLI 入口
- **0 `any` 类型**——strict TypeScript，`unknown` + `instanceof Error`
- **S5 快速退出**——无形式化需求时自动跳过，节省 token
- **能力探测条件生成**——TLA+/Lean 探针仅在有工具链时生成

## 安全设计

| 层级 | 机制 |
|:--:|------|
| 编译期 | Anti-Skill 注入（7 条规则, 94.8% 触发率）+ 10 Fail-Fast |
| 入口 | `validateNoPoisonArgs` + `safeParseArg` + `refuseDirectInvocation` |
| 文件系统 | `validateWorkDir` + `isPathSafe` + `assertSafePath` |
| 流程 | 9 个 `stage_gates` + HITL + `verify-skill-integrity` |
| 备份 | SHA-256 哈希 + AES-256-GCM 加密 `.enc` 备份 |

## 评估

| 框架 | 结果 |
|------|:--:|
| SKILL-RUBRIC v0.1.5 | **B+** (7.4/10) — framework 类型 |
| OWASP AST10 | **9/10** 通过 |
| SkillAudit | **Low Risk** (安全 95/100) |

## 安装技能

```bash
cp -r .claude/skills/srs-formalizer /your-project/.claude/skills/
```

## 版本

| 版本 | 日期 | 关键变更 |
|------|------|----------|
| 0.5.3 | 2026-07-03 | 能力探测工具链条件生成 + 语法降级评分、stability-test、A2A Agent Card、路径 Bug 修复 |
| 0.5.2 | 2026-07-02 | TLA+ 严格模式、Lean 4 拆分证明、gherkin-lint 20 条规则、S6 跨图验证 |
| 0.5.0 | 2026-07-01 | 分片索引化重构、移除物理分片目录 |
| 0.4.0 | 2026-07-01 | SkCC 集成：compile、SkIR、Anti-Skill、双发射器 |

完整变更历史见 [CHANGELOG.md](.claude/skills/srs-formalizer/CHANGELOG.md)。

## 参考

- 设计文档：[docs/DESIGN.md](docs/DESIGN.md)
- SkCC：[arXiv:2605.03353](https://arxiv.org/abs/2605.03353)
- SkillsBench：[arXiv:2602.12670](https://arxiv.org/abs/2602.12670)
- OWASP AST10：[owasp.org](https://owasp.org/www-project-agentic-skills-top-10/)
- SKILL-RUBRIC：[GitHub](https://github.com/acnlabs/OpenPersona/blob/main/docs/SKILL-RUBRIC.md)

## 许可

MIT
