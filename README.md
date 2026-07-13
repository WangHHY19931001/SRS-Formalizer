# SRS-Formalizer

将 SRS（软件需求规格说明）文档形式化为工程产物的 AI Agent 技能，采用**编译器架构**。

## 编译器模型

```
SRS → Frontend (Parse→Shard→Extract→IR) → Middle-end (6 passes) → Backend (12 Emitters) → 输出产物
```

| 产出 | Emitter | 触发 |
|------|------|:--:|
| 需求知识图谱 | CypherEmitter | 必选 |
| BDD 测试骨架 | GherkinEmitter | 必选 |
| TLA+ 形式化规约 | TLAEmitter | **全模块强制** |
| Lean 4 定理证明 | LeanEmitter | 条件（安全/合规） |
| 测试夹具 | FixtureEmitter | 可选 |
| 追溯矩阵 | TraceabilityMatrixEmitter | 必选 |
| 覆盖率报告 | CoverageEmitter | 可选 |
| 反例测试 | CounterexampleEmitter | 有条件 |

## 快速开始

```bash
git clone https://github.com/WangHHY19931001/SRS-Formalizer.git
cd SRS-Formalizer/.claude/skills/srs-formalizer/scripts
npm install

# 前端: SRS → IR
npx tsx index.ts init --output .srs_formalizer
npx tsx index.ts manifest --src <srs-file> --lang zh --workdir .srs_formalizer
npx tsx index.ts build-ir --workdir .srs_formalizer

# 中端: IR 分析
npx tsx index.ts tag-nfr --workdir .srs_formalizer
npx tsx index.ts score-risk --workdir .srs_formalizer

# 后端：发射草稿/确定性产物
npx tsx index.ts emit --group graphs --workdir .srs_formalizer
npx tsx index.ts emit --group bdd --workdir .srs_formalizer
npx tsx index.ts emit --group formal --workdir .srs_formalizer

# 严格验证草稿；仅成功后提升为 verified
npx tsx index.ts validate-bdd --strict --promote --workdir .srs_formalizer
npx tsx index.ts validate-tla --name <module> --strict --promote --workdir .srs_formalizer
npx tsx index.ts validate-lean --strict --promote --workdir .srs_formalizer
npx tsx index.ts verify-gate --workdir .srs_formalizer --stage FINAL

# 运行测试
npx tsx --test __tests__/*.test.ts
```

## 产物生命周期

形式化产物不能从 draft 直接进入 FINAL。Emitter 只生成 draft 或确定性分析产物：

- `outputs/bdd/draft` → `outputs/bdd/verified`
- `outputs/tlaplus/draft` → `outputs/tlaplus/verified`
- `outputs/lean4/draft` → `outputs/lean4/verified`
- `outputs/graphs`、`outputs/fixtures`、`outputs/reports` 为确定性产物目录。

使用各自的 `validate-… --strict --promote` 命令完成审计、工具链验证、验证报告写入与原子提升。`verify-gate --stage FINAL` 仅接受 verified 源文件及其成功验证报告；security/compliance NFR 还要求 Lean 4 verified 产物。

## CLI 命令分组

| 组 | 命令 | 说明 |
|------|------|------|
| **Frontend** | `manifest`, `guided-extract`, `inject-prompt`, `build-ir` | SRS → IR |
| **Middle-end** | `analyze-structure`, `analyze-graph`, `tag-nfr`, `check-connectivity`, `merge-analysis`, `score-risk` | IR 分析 |
| **Backend** | `emit --name/--group` | IR → draft、verified 或确定性产物；`--group all` 取代 `emit-all` |
| **Validate** | `validate-jsonl`, `validate-architecture`, `validate-cypher`, `validate-bdd --strict --promote`, `validate-tla --strict --promote`, `validate-lean --strict --promote`, `verify-gate` | 仅验证成功的形式化产物可提升至 verified |

## 设计文档

完整的技能设计位于 **[docs/DESIGN.md](docs/DESIGN.md)**——唯一事实依据（Single Source of Truth）。

## 技术栈

- **TypeScript 5.5+** strict 模式
- **Node.js ≥20** ESM
- **零运行时 npm 依赖** — devDeps: typescript, @types/node, gherkin-lint, gherklin
- 测试：Node.js 原生 `node:test`（480 用例, 0 fail）
- IR：SRS-IR v2.0.0（强类型中间表示）
- 编译器模型：SkCC (arXiv:2605.03353) 启发
- 形式化工具：内置 tla2tools-1.7.4.jar + Lean 4 + gherkin-lint + Gherklin

## 安全设计

| 层级 | 机制 |
|:--:|------|
| 编译期 | Anti-Skill 注入（7 条规则） |
| 入口 | validateNoPoisonArgs + refuseDirectInvocation |
| 文件系统 | validateWorkDir + isPathSafe + assertSafePath |
| 流程 | 9 stage_gates + HITL |

## 评估

| 框架 | 结果 |
|------|:--:|
| SKILL-RUBRIC v0.1.5 | **B+** (7.4/10) |
| OWASP AST10 | **9/10** 通过 |
| SkillAudit | **Low Risk** |

## 许可

MIT
