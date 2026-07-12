# V-Model Zero-Gap Test Fixtures — 设计规格

> **Issue**: [#2 — v gap](https://github.com/WangHHY19931001/SRS-Formalizer/issues/2)
> **日期**: 2026-07-12
> **状态**: 待审批
> **范围**: 全模块化（7 个子任务，~20 文件变更）

---

## 1. 目标

消除 SRS-Formalizer V-Model 左右支不对称：左支（需求→图谱→形式化规约）已完备，右支（测试 fixture 生成）存在 5 个 gap。本次修复后，AI Agent 可实现 "SRS → 形式化 → 一键生成全套 runnable 测试夹具" 闭环。

### 1.1 Gap 清单

| # | Gap | 当前状态 | 目标状态 |
|---|-----|----------|----------|
| G1 | TLC 反例 → 可重现测试 | 静态骨架，无反例解析 | 解析 `.trace` 文件，生成反例驱动的集成测试 |
| G2 | Hypothesis 属性测试 | pytest 输出为 `test_*(): pass` | `@given` 装饰的属性测试骨架 |
| G3 | Playwright Page Object | bare `test()` 块 | Page Object 模式 + 测试文件 |
| G4 | 模板文件 | 内联 TS 字符串插值 | `templates/test-fixtures/` 下 15 个 `.template` 文件 |
| G5 | V-Model 追溯矩阵 | 仅目录级布尔覆盖 | 逐需求 Markdown + Cypher 追溯矩阵 |

### 1.2 约束

- 零运行时 npm 依赖（仅 devDeps）
- 所有新文件 ≤300 行
- `path.join()` only
- 0 `any`
- 测试必须全程通过（353 → ~375）

---

## 2. 架构变更总览

```
新增文件（8）：
  lib/fixture-gen/tla-counterexample.ts   # G1: TLC 反例解析
  lib/fixture-gen/traceability.ts          # G5: 追溯矩阵构建
  lib/fixture-gen/template-engine.ts       # G4: 模板引擎
  commands/generate-vmodel-matrix.ts       # G5: CLI 命令
  templates/test-fixtures/                 # G4: 15 个模板文件
    cucumber/{steps,world,fixtures}.ts.template
    playwright/{spec,fixtures,page}.ts.template
    pytest/{test_module,conftest,test_hypothesis}.py.template
    junit/{Test,Fixture}.java.template
    fast-check/{property,arbitraries}.ts.template
    nfr/{performance,security,concurrency}.*.template

修改文件（6）：
  lib/fixture-gen/bdd.ts                   # G3: +Page Object 生成
  lib/fixture-gen/lean.ts                  # G2: +Hypothesis 生成
  lib/fixture-gen/types.ts                 # +TlcTraceEntry, TraceabilityEntry
  commands/generate-test-fixtures.ts       # +--nfr 参数
  commands/index.ts                        # +generate-vmodel-matrix 注册

测试文件（~6 新 + 2 修改）：
  __tests__/fixture-gen/tla-counterexample.test.ts
  __tests__/fixture-gen/traceability.test.ts
  __tests__/fixture-gen/template-engine.test.ts
  __tests__/fixture-gen/nfr.test.ts
  __tests__/generate-vmodel-matrix.test.ts
  __tests__/fixture-gen/bdd.test.ts        # +Page Object 测试
  __tests__/fixture-gen/lean.test.ts       # +Hypothesis 测试

文档文件（4）：
  docs/DESIGN.md                           # 新增 V-Model 章节
  CHANGELOG.md                             # v0.7.0
  README.md                                # 命令表 + 测试数
  AGENTS.md                                # 测试数
```

---

## 3. 详细设计

### 3.1 TLC 反例解析器（G1）

**文件**: `lib/fixture-gen/tla-counterexample.ts`（~120 行）

**输入格式**：TLC 生成的 `.trace` 文件，格式为：
```
State 1: <Initial state>
variable1 = value1
variable2 = value2

State 2: <Next state>
variable1 = value1'
...
Violation: Invariant SafetyInv violated.
```

**接口**：
```typescript
interface TlcTraceEntry {
  step: number
  state: Record<string, string>
  violatedInvariant?: string
}

parseTlcTrace(traceContent: string): TlcTraceEntry[]
generateCounterexampleFixtures(
  trace: TlcTraceEntry[],
  specName: string,
  framework: 'pytest' | 'junit' | 'fast-check'
): FixtureFile[]
```

**解析逻辑**：
1. 按 `State N:` 分割为步骤
2. 每步提取 `variable = value` 键值对
3. 末尾提取 `Violation: XXX violated.` 为违规不变式名

**输出**：
- `pytest`: `tests/test_<spec>_counterexample.py` — 每步一个 `test_step_N()` + 变量断言
- `JUnit`: `src/test/java/<Spec>CounterexampleTest.java` — `@Test` 步骤序列
- `fast-check`: `properties/<spec>_counterexample.property.ts` — 从反例状态生成收缩器

**与 `tla.ts` 的关系**：互补不替换。`tla.ts` 从 .tla 源码生成静态骨架；本模块从 .trace 反例生成动态测试。

---

### 3.2 Hypothesis 属性测试（G2）

**文件**: `lib/fixture-gen/lean.ts`（修改，+40 行）

**变更**：`generatePytest()` 新增 Hypothesis 分支

```typescript
// 新增函数
function generateHypothesis(theorems: ParsedTheorem[]): FixtureFile {
  // 对每个定理：
  // 1. 从 typeSignature 提取参数类型
  // 2. 映射到 Hypothesis strategy：
  //    - Nat/Int → st.integers()
  //    - String → st.text()
  //    - List α → st.lists(st.integers())
  //    - 未知 → st.integers()（LLM_FILL 标记）
  // 3. 生成 @given 装饰的测试函数
}
```

**输出示例**：
```python
from hypothesis import given, strategies as st

@given(st.integers())
def test_add_commutative_property(x):
    # LLM_FILL: 验证加法交换律
    result = add(x, 0)
    assert result == x  # LLM_FILL: 补充后置条件
```

**触发条件**：当 `lean.ts` 检测到定理类型签名含多态类型时，优先生成 Hypothesis 而非空 pytest。

---

### 3.3 Playwright Page Object（G3）

**文件**: `lib/fixture-gen/bdd.ts`（修改，+50 行）

**变更**：`generatePlaywright()` 输出从 1 文件变为 2 文件

```typescript
// 新增：Page Object 文件
function generatePageObject(
  scenarios: ParsedScenario[],
  moduleName: string
): FixtureFile {
  return {
    path: `pages/${moduleName}.page.ts`,
    content: `
export class ${pascalCase(moduleName)}Page {
  constructor(private page: Page) {}
  // LLM_FILL: 根据 Given/When 推断元素和操作
  async navigate() { await this.page.goto('/* LLM_FILL */') }
  async getState() { /* LLM_FILL */ return {} }
}`
  }
}
```

**测试文件修改**：`spec.ts.template` 增加 Page Object import 和 beforeEach 初始化。

---

### 3.4 模板文件抽取（G4）

**文件**: `lib/fixture-gen/template-engine.ts`（~80 行）

**接口**：
```typescript
function loadTemplate(framework: string, templateName: string): string
function renderTemplate(template: string, vars: Record<string, string>): string
```

**模板语法**：Mustache 风格 `{{var}}`，零依赖（TS 正则替换）。

**占位符**：
- `{{MODULE}}` — 模块名
- `{{SCENARIOS}}` — 场景列表
- `{{THEOREMS}}` — 定理列表
- `{{VARIABLES}}` — TLA+ 变量
- `{{LLM_FILL}}` — LLM 填充标记
- `{{PAGE_OBJECT_CLASS}}` — Page Object 类名

**模板文件清单**（15 个）：

| 框架 | 文件 |
|------|------|
| cucumber | `steps.ts.template`, `world.ts.template`, `fixtures.ts.template` |
| playwright | `spec.ts.template`, `fixtures.ts.template`, `page.ts.template` |
| pytest | `test_module.py.template`, `conftest.py.template`, `test_hypothesis.py.template` |
| junit | `Test.java.template`, `Fixture.java.template` |
| fast-check | `property.ts.template`, `arbitraries.ts.template` |
| nfr | `performance.py.template`, `security.java.template`, `concurrency.ts.template` |

**迁移策略**：
1. 创建模板文件 + template-engine
2. 逐个重构 `bdd.ts`、`tla.ts`、`lean.ts` 调用 template-engine
3. 删除内联字符串
4. 测试全程通过

---

### 3.5 V-Model 追溯矩阵（G5）

**新文件**：
- `lib/fixture-gen/traceability.ts`（~120 行）
- `commands/generate-vmodel-matrix.ts`（~150 行）

**接口**：
```typescript
interface TraceabilityEntry {
  requirementId: string
  requirementTitle: string
  graphNodes: string[]         // 从 3_graph/ JSONL 提取
  bddScenarios: string[]       // 从 4_bdd/*.feature 提取
  tlaInvariants: string[]      // 从 5_formal/*.tla 提取
  leanTheorems: string[]       // 从 5_formal/*.lean 提取
  fixtureFiles: string[]       // 从 test_fixtures/ 提取
  coverageStatus: 'full' | 'partial' | 'none'
}

buildTraceabilityMatrix(workDir: string): TraceabilityEntry[]
```

**CLI**：
```bash
npx tsx index.ts generate-vmodel-matrix --workdir <dir> --format markdown
npx tsx index.ts generate-vmodel-matrix --workdir <dir> --format cypher
```

**数据流**：
```
3_graph/*.jsonl ──┐
4_bdd/*.feature ──┼──→ buildTraceabilityMatrix() ──→ Markdown / Cypher
5_formal/*.tla  ──┤
5_formal/*.lean ──┤
test_fixtures/  ──┘
```

**Markdown 输出格式**：
```markdown
| 需求 ID | 标题 | 图节点 | BDD | TLA+ | Lean | Fixture | 状态 |
|---------|------|--------|-----|------|------|---------|------|
| REQ-001 | 登录验证 | N1,N2 | S1,S2 | Inv1 | Thm1 | 3 files | ✅ full |
| REQ-002 | 权限控制 | N3 | S3 | — | — | 1 file | ⚠️ partial |
```

**Cypher 输出**：生成 `CREATE (r:Requirement)-[:HAS_NODE]->(n:Node)` 等语句，可导入 Neo4j。

**与 `fixture-coverage.ts` 的关系**：`fixture-coverage` 保持 count-level 覆盖率报告不变。追溯矩阵是更细粒度的逐需求视图，两者互补。未来可合并为统一入口，但本次不做。

---

### 3.6 NFR Fixture 模板

**触发**：`generate-test-fixtures --nfr` 扫描 SRS 中的 NFR 章节。

**关键词匹配**：
- 性能：`性能`、`响应时间`、`吞吐量`、`latency`、`throughput`
- 安全：`安全`、`注入`、`XSS`、`CSRF`、`authentication`
- 并发：`并发`、`竞态`、`死锁`、`concurrency`、`deadlock`

**模板**：
- `nfr/performance.py.template`：pytest 响应时间断言 + `@pytest.mark.performance`
- `nfr/security.java.template`：JUnit 输入验证 + 注入测试
- `nfr/concurrency.ts.template`：fast-check 竞态条件属性测试

---

## 4. 测试计划

### 4.1 新增测试

| 测试文件 | 测试数 | 覆盖 |
|----------|:------:|------|
| `tla-counterexample.test.ts` | 8 | trace 解析、3 框架生成、空 trace、格式错误、不变式提取 |
| `traceability.test.ts` | 6 | 矩阵构建、Markdown 输出、Cypher 输出、空数据、部分覆盖 |
| `template-engine.test.ts` | 4 | 占位符替换、缺失模板、嵌套变量、空模板 |
| `nfr.test.ts` | 4 | 关键词扫描、3 框架 NFR 生成、无 NFR 章节 |
| `generate-vmodel-matrix.test.ts` | 5 | CLI happy path、--format、缺少 --workdir、空 workdir、非 .srs_formalizer |
| **小计** | **27** | |

### 4.2 扩展测试

| 测试文件 | 新增 | 覆盖 |
|----------|:----:|------|
| `bdd.test.ts` | +2 | Page Object 生成、多场景 Page Object |
| `lean.test.ts` | +2 | Hypothesis 生成、多态类型 |
| **小计** | **4** | |

### 4.3 总计

- 新增：27 + 4 = **31 个测试**
- 目标总数：353 + 31 = **~384 个测试**

---

## 5. 验收标准

1. `npx tsc --noEmit` — 0 errors
2. `npx tsx --test __tests__/*.test.ts __tests__/fixture-gen/*.test.ts` — 全部通过（~384 tests）
3. `generate-test-fixtures --level acceptance --framework cucumber` — 生成含 Page Object 的 Cucumber fixture
4. `generate-test-fixtures --level integration --framework pytest` — 解析 .trace 文件生成反例测试
5. `generate-test-fixtures --level property --framework pytest` — 生成 Hypothesis `@given` 测试
6. `generate-test-fixtures --nfr --framework pytest` — 生成 NFR fixture
7. `generate-vmodel-matrix --format markdown` — 输出追溯矩阵表格
8. `generate-vmodel-matrix --format cypher` — 输出 Cypher 语句
9. 所有模板文件可独立编辑，template-engine 正确渲染
10. 无 `any` 类型，无运行时依赖，所有文件 ≤300 行

---

## 6. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| TLC `.trace` 格式变体多 | 解析失败 | 支持主流格式，未知格式返回空 + 警告 |
| 模板文件数量多（15 个） | 维护负担 | 统一占位符语法，template-engine 统一处理 |
| 追溯矩阵数据源分散 | 覆盖不完整 | 扫描失败的源标记为 `unknown`，不阻断 |
| Hypothesis strategy 映射不全 | 类型推断错误 | 未知类型用 `st.integers()` + `LLM_FILL` |
| Page Object 推断不准确 | 生成的 Page Object 无用 | `LLM_FILL` 标记，LLM 子代理负责填充 |

---

## 7. 实现顺序

1. **template-engine.ts** + 模板文件（G4）— 基础设施，其他模块依赖
2. **tla-counterexample.ts**（G1）— 独立模块，无外部依赖
3. **lean.ts Hypothesis**（G2）— 小改动，独立
4. **bdd.ts Page Object**（G3）— 小改动，依赖模板引擎
5. **traceability.ts** + **generate-vmodel-matrix.ts**（G5）— 独立模块
6. **NFR 模板** + **--nfr 参数** — 独立
7. **测试** — 每步同步编写
8. **文档** — 最后统一更新
