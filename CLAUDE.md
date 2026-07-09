# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

srs-formalizer — 将 SRS 文档转化为形式化产出（Cypher · Gherkin · TLA+ · Lean 4）的 AI Agent 技能。

## 构建与测试

```bash
cd .claude/skills/srs-formalizer/scripts

npm install                          # 仅 typescript + @types/node（零运行时依赖）
npx tsc --noEmit                     # strict 模式, 0 errors 必须
npx tsx --test __tests__/*.test.ts   # 320 tests, 0 fail 必须
```

**运行单个测试文件：**
```bash
npx tsx --test __tests__/init.test.ts
npx tsx --test __tests__/validate-jsonl.test.ts
```

`package.json` 提供了快捷脚本：`npm run typecheck` 和 `npm test`。

## 架构

七阶段流水线 `S0→S1→S2→S3→S4→S5→S6`，每阶段有 gate condition。TS 脚本做确定性机械工作，LLM 子代理做语义判断，编排者做流程决策。

```
scripts/
├── index.ts       # CLI 入口（注册表模式, 31 命令, 全部 refuseDirectInvocation）
├── commands/      # 31 条命令（每文件 ≤300 行目标, ≤500 行硬上限）
├── lib/           # 19 核心模块 + 5 子模块
│   ├── cli.ts           # 参数解析、毒值拒绝、路径安全校验（新代码用此文件）
│   ├── security.ts      # 路径安全校验（与 cli.ts 功能重复，保留用于独立导入场景）
│   ├── graph.ts         # 图数据结构
│   ├── jsonl.ts         # JSONL 读写与校验
│   ├── anti-skill.ts    # Anti-Skill 安全约束注入
│   ├── skir-builder.ts  # SkIR 构建
│   ├── probe/           # 能力探测（types + 8 维度探针 + 8 评分器）
│   ├── llm/             # 稳定性测试（config + stability）
│   ├── cross-graph/     # 跨图验证问题定义
│   ├── verify-gate/     # 三级门禁（shared + checks-s1/r3/final）
│   └── architecture/    # 架构图构建
├── types/         # JsonlRecord, CliResult, ShardIndex, SkillIR（20+ 字段）
├── __tests__/     # 38 文件, 320 测试
└── templates/     # check.sh.template
```

## 关键约束

| # | 约束 | 说明 |
|:--:|------|------|
| 1 | 零运行时 npm 依赖 | 仅 `typescript` + `@types/node` 为 devDeps |
| 2 | strict TS | `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch` |
| 3 | 0 `any` | 错误类型使用 `unknown` + `instanceof Error` |
| 4 | 文件大小 | ≤300 行（目标）, ≤500 行（硬上限） |
| 5 | `path.join()` 强制 | 禁止字符串拼接路径。手写路径切割（如 `validate-lean.ts` 曾用 `split('/')`）已修复为 `path.dirname`/`path.join` |
| 6 | 毒值拒绝 | `undefined/null/NaN/[object Object]` 在入口 `validateNoPoisonArgs` 拦截 |
| 7 | 所有命令经 `index.ts` | `refuseDirectInvocation` 阻止直接调用（31/31） |
| 8 | `--output` vs `--workdir` | `init` 用 `--output`, 其余用 `--workdir`。例外：`validate-lean` 不使用 `--workdir`，从 `--file` 路径向上查找 lakefile |
| 9 | `.srs_formalizer` 强制 | `validateWorkDir` 校验 basename |
| 10 | 所有写入限工作目录 | `isPathSafe` + `assertSafePath` 双校验 |

## 产物建模约束

### TLA+ 建模（S5，条件触发：并发/分布式/共识协议）

**拆解方法：**
- 层次化建模三级递进：L1 系统内外交互抽象 → L2 子系统内部行为 + 上下同级交互抽象 → L3 原子化子系统行为抽象。可推广至 4/5/6 级或更多，每个下级子系统视为独立系统继续拆解。
- 拆解判定：先写 TLA+，分析变量组合；组合结果 >1k 时考虑拆，>1w 时必须拆。

**质量门禁（全部必须通过）：**
- 先通过 SANY 语法检查，再执行 TLC 模型检查
- 不允许死锁、状态爆炸、违法不变式、实现错误
- 不允许占位实现、简化实现、错误实现
- 调试前先删除旧的轨迹文件和状态文件

**死锁处理：** 正常系统不允许死锁。死锁或矛盾分支需定位根因修正。

**SRS 一致性问题：** 建模必须符合 SRS 设计。符合设计但仍有问题的，需报告人类并给出可选项供修正 SRS。此部分允许联网搜索深度调研，但必须基于事实。

### Lean 4 建模（S5，条件触发：安全关键/密码学/自定义算法）

**拆分证明方法（强制）：**
1. 编写证明骨架（带 `sorry`）
2. 将每个 `sorry` 变为独立文件证明
3. 若一个 theorem/lemma 无法搞定，拆分为多个文件分别证明，然后 `import`
4. 若仍有 `sorry`，回到步骤 1 继续拆分

**质量门禁（全部必须通过）：**
- 必须通过 `lake build` 编译验证
- 不允许算法实现错误、不完整实现、`sorry`、告警、`axiom`
- 不允许占位实现、简化实现、错误实现
- 允许使用 mathlib4（最新版）
- 必须使用 `theorem` + 完整 `proof`，每个 lemma 独立文件证明

**SRS 一致性问题：** 同上 TLA+ 规则——建模必须符合 SRS 设计，符合设计但仍有问题需报告人类并给出可选项。

### BDD 建模（S4，必选）

**格式要求：**
- 必须采用独立 `.feature` 文件格式建模，不接受 Markdown 模式描述
- 必须有完整步骤（Given/When/Then），必须完整定义状态和状态转换
- 必须通过 gherkin-lint 严格模式（20 条规则）

**质量门禁（全部必须通过）：**
- 不允许 `error`、`failed`、`undefined`、`untested`、步骤缺失
- 不允许占位实现（如 `THEN_PLACEHOLDER`）、简化实现、错误实现
- 出现问题先检查建模与设计一致性；一致但仍有问题则与用户交互修正设计

## 重要约定

- **设计文档**: `docs/DESIGN.md` 是唯一事实依据。设计决策、架构约束、规则合规均记录于此。代码变更必须先更新设计文档。
- **规则体系**: `rules/index.md` 是入口。开发前遵守 `rules/skill/` 下的结构、安全、跨平台、验证规则。
- **错误处理**: 所有命令使用 `try { safeParseArg() } catch { return { status: 'error', message } }` 模式，错误通过 `CliResult` 返回而非抛出异常。
- **CLI 输出格式**: 所有命令输出 JSON 到 stdout（`{ status, message?, data? }`），成功 `exit(0)`，失败 `exit(1)`。
- **`security.ts` 与 `cli.ts` 功能重复**：`validate-jsonl` 和 `validate-architecture` 独立导入 `security.ts`，其余命令用 `cli.ts`。新代码统一用 `cli.ts`。
- **`commands/commands/` 和 `commands/types/`** 是空目录（遗留产物），无实际内容。
- Commit: Conventional Commits，`Co-Authored-By: Claude <noreply@anthropic.com>`
- 提交前: `tsc --noEmit` 0 errors + 320 tests pass
- `capability-probe` 探针仅在有工具链时生成 TLA+/Lean 4 维度
- `scripts/templates/check.sh.template` 不在主 `templates/` 下

## 技能位置

`.claude/skills/srs-formalizer/` — `SKILL.md` 是 L1+L2 指令（~3,800 tokens），L3 资源按需加载。

## Superpowers-ZH

详见 `rules/superpowers-zh.md`——技能列表、触发条件与使用方式。
