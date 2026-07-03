# CLAUDE.md

srs-formalizer 项目——将 SRS 文档转化为形式化产出（Cypher · Gherkin · TLA+ · Lean 4）的 AI Agent 技能。

## 项目指引

- **设计文档**: `docs/DESIGN.md` 是唯一事实依据。设计决策、架构约束、规则合规均记录于此。代码变更必须先更新设计文档。
- **规则体系**: `rules/index.md` 是入口。开发前必须遵守 `rules/skill/` 下的结构、安全、跨平台、验证规则。
- **技能位置**: `.claude/skills/srs-formalizer/`——SKILL.md 是 L1+L2 指令（~3,800 tokens），L3 资源按需加载。

## 构建与测试

```bash
cd .claude/skills/srs-formalizer/scripts

npm install                          # 仅 typescript + @types/node (零运行时依赖)
npx tsc --noEmit                     # strict 模式, 0 errors 必须
npx tsx --test __tests__/*.test.ts   # 299 tests, 0 fail 必须
```

## 架构

七阶段流水线: `S0→S1→S2→S3→S4→S5→S6`。每阶段有 gate condition。

```
scripts/
├── index.ts       # CLI 入口 (注册表模式, 31 命令, 31/31 refuseDirectInvocation)
├── commands/      # 31 条命令
├── lib/           # 19 核心模块 + probe/llm/cross-graph/verify-gate/architecture
├── types/         # JsonlRecord, CliResult, ShardIndex, SkillIR (20+ 字段)
└── __tests__/     # 35 文件, 299 测试
```

## 关键约束

| # | 约束 | 说明 |
|:--:|------|------|
| 1 | 零运行时 npm 依赖 | 仅 `typescript` + `@types/node` 为 devDeps |
| 2 | strict TS | `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch` |
| 3 | 0 `any` | 错误类型使用 `unknown` + `instanceof Error` |
| 4 | 文件大小 | ≤300 行（目标）, ≤500 行（硬上限） |
| 5 | `path.join()` 强制 | 禁止字符串拼接路径 |
| 6 | 毒值拒绝 | `undefined/null/NaN/[object Object]` 在入口 `validateNoPoisonArgs` 拦截 |
| 7 | 所有命令经 `index.ts` | `refuseDirectInvocation` 阻止直接调用 (31/31) |
| 8 | `--output` vs `--workdir` | `init` 用 `--output`, 其余用 `--workdir` |
| 9 | `.srs_formalizer` 强制 | `validateWorkDir` 校验 basename |
| 10 | 所有写入限工作目录 | `isPathSafe` + `assertSafePath` 双校验 |

## 常规约定

- Commit: Conventional Commits（中文或英文），`Co-Authored-By: Claude <noreply@anthropic.com>`
- 提交前: `tsc --noEmit` 0 errors + 299 tests pass
- CLI 参数解析: 所有命令使用 `safeParseArg` from `lib/cli.ts`
- 代码变更: 先更新 `docs/DESIGN.md`，再改代码
- `capability-probe` 探针仅在有工具链时生成 TLA+/Lean 4 维度
- `security.ts` 与 `cli.ts` 路径函数重复——新代码用 `cli.ts`
- `scripts/templates/check.sh.template` 不在主 `templates/` 下

## Superpowers-ZH

详见 `rules/superpowers-zh.md`——技能列表、触发条件与使用方式。
