# V-Model Test Fixture 生成设计

> **Issue**: [#1 V-Model Integration: Generate Test Fixtures from SRS-Formalizer Outputs](https://github.com/WangHHY19931001/SRS-Formalizer/issues/1)
> **日期**: 2026-07-11
> **状态**: 待实现
> **版本**: 0.6.0（计划）

---

## 1. 目标

将 SRS-Formalizer 升级为 V-Model 完整工具链的一部分，实现从形式化产出到 runnable 测试夹具的零隙指导。

**核心价值**：AI Agent 可真正实现"读 SRS → 形式化 → 一键生成全套测试夹具"。

**迭代策略**：分阶段交付，BDD 为首版重点，TLA+/Lean 4 紧随其后。

## 2. 架构决策

| 决策 | 选择 | 理由 |
|------|------|------|
| TS/LLM 分工 | **混合模式** | TS 做结构骨架 + 简单映射，LLM 做语义填充。与现有 THEN_PLACEHOLDER 模式一致 |
| 命令架构 | **方案 C：薄编排 + lib 分层** | 一个入口命令 dispatch 到 lib 模块，与现有 `index.ts → commands/ → lib/` 模式一致 |
| 迭代范围 | **分阶段，BDD 先行** | BDD 最成熟（有 .feature 输出），降低复杂度，快速交付可用价值 |
| 框架支持 | **全量框架** | Cucumber、Playwright、Pytest、JUnit、fast-check 首版全部支持 |
| 输出位置 | **独立目录** | `<workdir>/test_fixtures/<level>/<framework>/`，与现有 4_bdd/、5_formal/ 并列 |

## 3. CLI 命令设计

### 3.1 `generate-test-fixtures`

```
generate-test-fixtures
  --level <acceptance|integration|unit|property>   # 必选
  --framework <cucumber|playwright|pytest|junit|fast-check>  # 必选
  --workdir <path>    # 必选，.srs_formalizer 工作目录
  --source <bdd|tla|lean|auto>  # 可选，默认 auto
```

**level ↔ source 默认映射**：

| level | 默认 source | 理由 |
|-------|------------|------|
| acceptance | bdd | BDD .feature → acceptance test fixtures |
| integration | tla | TLA+ counterexample → integration test sequences |
| unit | bdd | BDD scenarios → unit test 骨架 |
| property | lean | Lean theorems → property-based test fixtures |

**输出目录**：`<workdir>/test_fixtures/<level>/<framework>/`

**返回**：`{ status, data: { files_created, output_dir, source_files_used } }`

**错误处理**：源文件不存在 → `{ status: 'error', message: '...' }`

### 3.2 `fixture-coverage`

```
fixture-coverage --workdir <path>
```

扫描 `test_fixtures/` 与源产出的交叉，返回：

```json
{
  "total_requirements": 42,
  "bdd_fixtures_generated": 38,
  "tla_fixtures_generated": 5,
  "lean_fixtures_generated": 3,
  "coverage_pct": 90.5,
  "missing": [
    { "requirement": "R1-0023", "reason": "no BDD scenario" }
  ]
}
```

首版仅做计数级覆盖报告，不做复杂 traceability matrix。

## 4. BDD Fixture 生成（首版重点）

### 输入

`<workdir>/4_bdd/features/*.feature`（已验证的 Gherkin 文件）。

### TS 确定性层

`lib/fixture-gen/bdd.ts` 对每个 .feature 文件：

1. 解析 Gherkin AST：提取 Feature、Scenario、Given/When/Then steps
2. 提取参数占位符：识别 `<参数名>` 模式
3. 按框架生成结构骨架

### 框架产物

| 框架 | 产物 |
|------|------|
| Cucumber | `steps/<module>_steps.ts`、`support/world.ts`、`fixtures/<module>_data.ts` |
| Playwright | `tests/<module>.spec.ts`、`fixtures/<module>.fixtures.ts` |
| Pytest | `tests/test_<module>.py`、`conftest.py` |
| JUnit | `src/test/java/<Module>Test.java`、`fixtures/<Module>Fixture.java` |
| fast-check | `properties/<module>.property.ts` |

### LLM 语义层

TS 骨架包含 `<!-- LLM_FILL: 描述 -->` 注释标记，LLM 子代理在 S4/S5/S6 阶段填充：

- Cucumber: 每个 step 的实际断言逻辑
- Playwright: 页面交互序列
- Pytest: 断言表达式
- JUnit: assertion 语句
- fast-check: arbitrary 定义和 property 逻辑

### 输出示例（Cucumber）

```typescript
// <!-- LLM_FILL: Given the user is logged in with role "admin" -->
Given('the user is logged in with role {string}', async function (role: string) {
  // LLM_FILL: 实现登录逻辑，设置 this.currentUser
  throw new Error('Not implemented — LLM must fill');
});
```

### 文件大小约束

每个生成的 fixture 文件 ≤300 行。超出时自动拆分。

## 5. TLA+ Fixture 生成

### 输入

`<workdir>/5_formal/specs/*.tla`（已验证的 TLA+ 规约）。

### TS 确定性层

`lib/fixture-gen/tla.ts`：

1. 解析 .tla 文件：提取 VARIABLES、CONSTANTS、INIT、NEXT、INVARIANT
2. 利用 `validate-tla.ts` 的 6 种 violation 枚举
3. 按框架生成：

| 框架 | 产物 | 映射规则 |
|------|------|---------|
| Pytest | `tests/test_<spec>_invariants.py` | VARIABLES → fixture 参数, INVARIANT → assert |
| JUnit | `InvariantTest.java` | CONSTANTS → @Parameterized, INVARIANT → @Test |
| fast-check | `properties/<spec>.property.ts` | VARIABLES → Arbitrary 组合, NEXT → property |

### LLM 语义层

- TLC counterexample 轨迹 → 可重现的并发测试场景
- 不变量 → 共享 assertion library

### 约束

- 仅在 .tla 文件存在时生成，否则返回 `data.skipped: true`
- 不依赖 Java/TLC 运行时，纯文件解析

## 6. Lean 4 Fixture 生成

### 输入

`<workdir>/5_formal/proofs/*.lean`（已验证的 Lean 4 证明）。

### TS 确定性层

`lib/fixture-gen/lean.ts`：

1. 解析 .lean 文件：提取 theorem/lemma 名称、类型签名、import 列表
2. 提取 pre/post conditions
3. 按框架生成：

| 框架 | 产物 | 映射规则 |
|------|------|---------|
| Pytest | `tests/test_<proof>_properties.py` | theorem 名 → test 函数名, 类型签名 → 参数化输入 |
| JUnit | `PropertyTest.java` | theorem → @Test, type → assertion |
| fast-check | `properties/<proof>.property.ts` | theorem → property(), type → arbitrary |

### LLM 语义层

- Theorem 类型签名 → QuickCheck-style property 定义
- Pre/post conditions → assertion 逻辑

### 约束

- 仅在 .lean 文件存在时生成
- 不依赖 elan/lake 运行时，纯文件解析
- Platform-gated: 仅 Linux x86_64 / macOS ARM64

## 7. 目录结构与文件清单

### 新增文件

```
scripts/
├── commands/
│   ├── generate-test-fixtures.ts    # ~80 行（薄编排）
│   └── fixture-coverage.ts          # ~60 行
├── lib/
│   └── fixture-gen/                 # 新目录
│       ├── types.ts                 # ~40 行，共享类型
│       ├── bdd.ts                   # ~250 行
│       ├── tla.ts                   # ~180 行
│       ├── lean.ts                  # ~160 行
│       └── coverage.ts              # ~80 行
├── __tests__/
│   ├── generate-test-fixtures.test.ts   # ~120 行
│   ├── fixture-coverage.test.ts         # ~60 行
│   └── fixture-gen/
│       ├── bdd.test.ts                  # ~100 行
│       ├── tla.test.ts                  # ~80 行
│       └── lean.test.ts                 # ~80 行
└── templates/
    └── test-fixtures/
        ├── cucumber/
        │   ├── steps.ts.template
        │   ├── world.ts.template
        │   └── fixtures.ts.template
        ├── playwright/
        │   ├── spec.ts.template
        │   └── fixtures.ts.template
        ├── pytest/
        │   ├── test_module.py.template
        │   └── conftest.py.template
        ├── junit/
        │   ├── Test.java.template
        │   └── Fixture.java.template
        └── fast-check/
            ├── property.ts.template
            └── arbitraries.ts.template
```

### 更新文件

| 文件 | 变更 |
|------|------|
| `scripts/index.ts` | +2 命令注册，+2 行 USAGE |
| `scripts/types/index.ts` | +`FixtureGenResult`、`CoverageReport` 类型 |
| `templates/checklists/4_bdd_CHECKLIST.md` | +fixture 生成检查项 |
| `templates/checklists/5_formal_CHECKLIST.md` | +fixture 生成检查项 |

### 约束

- 所有新文件 ≤300 行
- 零新增 npm 依赖
- 新增 ~8 个测试文件，预计 +60~80 测试用例

## 8. 测试策略

### 单元测试

- `bdd.test.ts`：3 种 Gherkin 输入（有效/无效/空）
- `tla.test.ts`：mock .tla 文件（不同 violation 类型）
- `lean.test.ts`：mock .lean 文件（skip on non-Linux/macOS）
- `generate-test-fixtures.test.ts`：端到端 temp dir 测试

### 集成测试

- 扩展 `tests/assertions/eval-spec.yaml`，新增 S4/S5 fixture 生成断言

### 回归保护

- 现有 320 测试必须保持 0 fail
- `tsc --noEmit` 必须保持 0 errors

## 9. 实现顺序

1. **Phase 1**: BDD fixture 生成（`lib/fixture-gen/bdd.ts` + 模板 + 测试）
2. **Phase 2**: TLA+ fixture 生成（`lib/fixture-gen/tla.ts` + 测试）
3. **Phase 3**: Lean 4 fixture 生成（`lib/fixture-gen/lean.ts` + 测试）
4. **Phase 4**: 覆盖报告 + checklist 更新 + 集成测试
5. **Phase 5**: CLI 命令注册 + 端到端验证

## 10. 风险与缓解

| 风险 | 缓解 |
|------|------|
| Gherkin 解析复杂度 | 使用简单正则 + 状态机，不引入 parser 库（零依赖约束） |
| TLA+ 变量提取不完整 | 仅提取顶层 VARIABLES，不尝试完整语义分析 |
| Lean 4 类型签名解析 | 仅提取 theorem 名和基本类型，复杂类型留给 LLM |
| 生成的 fixture 代码不可运行 | 这是预期行为——TS 骨架 + LLM 填充才完整 |
| 文件大小超 300 行 | 自动拆分机制，按 scenario/theorem 分文件 |
