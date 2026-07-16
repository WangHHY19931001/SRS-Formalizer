# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

srs-formalizer — 将 SRS 文档转化为形式化产出（Cypher · Gherkin · TLA+ · Lean 4）的 AI Agent 技能。

**架构**：编译器模型（Frontend → Middle-end → Backend）。所有产物从单一 SRS-IR (`srs-ir.json`) 派生。脚本只做门禁校验与专用算法，语义工作由 Agent 经 SKILL.md + prompts + references 完成。17 命令（10 门禁 + 7 工具）。

## 构建与测试

```bash
cd .claude/skills/srs-formalizer/scripts

npm install                          # devDeps: typescript, @types/node, gherkin-lint, gherklin
npm run typecheck                   # strict 模式, 0 errors 必须
npm test                            # 200 tests, 0 fail 必须
npm run evals                       # 工具链与生命周期确定性评估必须通过
```

**运行单个测试文件：**
```bash
npx tsx --test __tests__/assemble-ir.test.ts
npx tsx --test __tests__/srs-ir-types.test.ts
```

`package.json` 提供了快捷脚本：`npm run typecheck`、`npm test` 和 `npm run evals`。

## 架构

编译器三段式：**Frontend**（Parse → Shard → Extract → Build IR）→ **Middle-end**（6 analysis passes）→ **Backend**（Agent 生成产物 + validate-* 门禁）。

```
scripts/
├── index.ts             # CLI 入口（注册表模式, 全部 refuseDirectInvocation, 17 命令）
├── commands/            # 17 命令（10 门禁校验器 + 7 工具，全部 ≤300 行）
├── lib/
│   ├── verify-gate/        # 三级门禁 (S1/R3/FINAL)
│   ├── artifacts/          # 产物路径契约 + hash 绑定 + 提升
│   ├── middle-end/         # connectivity-checker (图连通性)
│   ├── bdd-validator.ts    # BDD Phase 1+2 校验
│   ├── bdd-tool-runner.ts  # BDD Phase 3+4 (gherkin-lint + Gherklin)
│   ├── tla-validator.ts    # TLA+ SANY+TLC 校验
│   ├── cli.ts              # 参数解析、毒值拒绝、路径安全
│   ├── security.ts         # 路径安全（与 cli.ts 重复，保留用于独立导入）
│   ├── graph.ts            # 图数据结构
│   ├── jsonl.ts            # JSONL 读写与校验
│   ├── graph-algorithms.ts # 统一图算法（BFS/连通分量/最短路径/2-hop/图加载/相似度）
│   ├── graph-operations.ts # 图合并/冲突边/同侧面边操作
│   ├── cypher.ts           # Cypher 语法校验
│   ├── id-utils.ts         # 共享 ID 清理
│   ├── fs-utils.ts         # 共享文件系统工具
│   ├── text-analysis.ts    # NLP 工具
│   ├── skill-integrity.ts  # 技能完整性加解密
│   └── checklists.ts       # 检查表工具
├── types/
│   ├── srs-ir.ts         # ★ SRS-IR 强类型（20+ 类型）
│   └── index.ts          # JsonlRecord, CliResult
├── __tests__/            # 200 测试
└── templates/            # 模板 + bdd-nfr-scenarios.json
```

## 关键约束

| # | 约束 | 说明 |
|:--:|------|------|
| 1 | 零运行时 npm 依赖 | devDeps: typescript, @types/node, gherkin-lint, gherklin |
| 2 | strict TS | `strict`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch` |
| 3 | 0 `any` | 错误类型使用 `unknown` + `instanceof Error` |
| 4 | 文件大小 | ≤300 行 |
| 5 | `path.join()` 强制 | 禁止字符串拼接路径 |
| 6 | 毒值拒绝 | `undefined/null/NaN/[object Object]` 入口拦截 |
| 7 | 所有命令经 `index.ts` | `refuseDirectInvocation` 阻止直接调用 |
| 8 | `--output` vs `--workdir` | Bootstrap 替代已归档的 init；所有保留命令用 `--workdir` |
| 9 | `.srs_formalizer` 强制 | `validateWorkDir` 校验 basename |
| 10 | 所有写入限工作目录 | `isPathSafe` + `assertSafePath` 双校验 |
| 11 | 形式化产物生命周期 | draft 只能经 `validate-… --strict --promote` 进入 verified；FINAL 重新计算 verified 内容 hash，并仅消费匹配 `sourceHash` 的成功报告 |
| 12 | 本地形式化工具链 | TLA+ 只使用内置 `tools/tla2tools-1.7.4.jar` 执行 SANY/TLC；Lean 必须是完整 Lake 项目，禁止验证器联网或补写候选输入 |

## 产物生命周期（强制）

Agent 只能写入 draft 或确定性目录，不能直接将 BDD、TLA+ 或 Lean 4 产物标记为 verified：

- BDD：`outputs/bdd/draft` → `outputs/bdd/verified`
- TLA+：`outputs/tlaplus/draft` → `outputs/tlaplus/verified`
- Lean 4：`outputs/lean4/draft` → `outputs/lean4/verified`
- 确定性产物：`outputs/graphs`、`outputs/fixtures`、`outputs/reports`

提升必须使用严格验证并写入成功报告：`validate-bdd --strict --promote`、`validate-tla --name <module> --strict --promote`、`validate-lean --strict --promote`。TLA+ 严格验证使用内置 JAR 真实执行 SANY 与 TLC，候选模块必须自带 matching `.cfg`；验证不会联网、下载工具或补写 cfg。Lean draft/verified 是带 `lakefile.lean` 或 `lakefile.toml` 的完整 Lake 项目。`verify-gate --stage FINAL` 仅消费 verified 内容及 `sourceHash` 与当前内容一致的验证报告；security/compliance NFR 强制要求 Lean verified 产物。



所有模块强制 TLA+ 覆盖。层次化 L1→L2→L3，IR 架构节点驱动拆解。6 类 NFR 不变式全部生成（有阈值填值，无阈值 LLM_FILL）。

## Lean 4 建模（条件触发）

security/compliance 关键词命中 → 强制。四步拆分证明循环。

## BDD 建模（必选 + 四级严格校验）

1. TS 基础结构校验 → 2. TS NFR 阈值校验 → 3. gherkin-lint 20 规则 → 4. Gherklin。任一失败打回 Frontend 重新提取需求。

## 重要约定

- **设计文档**: `docs/DESIGN.md` 是唯一事实依据。
- **错误处理**: `try/catch → { status, message }`，通过 CliResult 返回。
- **CLI 输出**: JSON 到 stdout (`{ status, message?, data? }`)，成功 exit(0)。
- Commit: Conventional Commits, `Co-Authored-By: Claude <noreply@anthropic.com>`
- 提交前: `npm run typecheck` 0 errors + `npm test` 200 tests pass + `npm run evals` pass
- TLA+ 覆盖所有模块，6 类 NFR 不变式必生成
