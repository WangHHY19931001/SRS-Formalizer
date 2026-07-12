# V-Model Zero-Gap Test Fixtures 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 消除 V-Model 右支 5 个 gap（G1-G5），实现 "SRS → 形式化 → 一键生成全套 runnable 测试夹具" 闭环。

**架构：** 新增 template-engine 基础设施 + 15 个模板文件，然后逐个实现 TLC 反例解析器、Hypothesis 属性测试、Playwright Page Object、追溯矩阵命令、NFR fixture 模板。所有新代码遵循现有 `lib/fixture-gen/` 模式。

**技术栈：** TypeScript 5.5+ strict, Node.js ≥20, 零运行时依赖, `node:test` + `assert/strict`

---

## 文件结构

### 新建文件（~10 个 TS + 15 个模板 + 6 个测试）

| 文件 | 职责 | 预估行数 |
|------|------|:--------:|
| `lib/fixture-gen/template-engine.ts` | 加载 `.template` 文件 + `{{var}}` 占位符替换 | ~80 |
| `lib/fixture-gen/tla-counterexample.ts` | 解析 TLC `.trace` 文件 + 生成反例测试 | ~120 |
| `lib/fixture-gen/traceability.ts` | 构建 SRS→图谱→fixture 逐需求追溯矩阵 | ~120 |
| `commands/generate-vmodel-matrix.ts` | CLI 命令：输出 Markdown/Cypher 追溯矩阵 | ~150 |
| `templates/test-fixtures/cucumber/steps.ts.template` | Cucumber step definitions 模板 | ~30 |
| `templates/test-fixtures/cucumber/world.ts.template` | Cucumber CustomWorld 模板 | ~15 |
| `templates/test-fixtures/cucumber/fixtures.ts.template` | Cucumber test data 模板 | ~10 |
| `templates/test-fixtures/playwright/spec.ts.template` | Playwright test.describe 模板 | ~20 |
| `templates/test-fixtures/playwright/fixtures.ts.template` | Playwright custom fixtures 模板 | ~10 |
| `templates/test-fixtures/playwright/page.ts.template` | Playwright Page Object 模板 | ~20 |
| `templates/test-fixtures/pytest/test_module.py.template` | Pytest test 模板 | ~15 |
| `templates/test-fixtures/pytest/conftest.py.template` | Pytest conftest 模板 | ~8 |
| `templates/test-fixtures/pytest/test_hypothesis.py.template` | Hypothesis 属性测试模板 | ~15 |
| `templates/test-fixtures/junit/Test.java.template` | JUnit test class 模板 | ~20 |
| `templates/test-fixtures/junit/Fixture.java.template` | JUnit fixture 模板 | ~10 |
| `templates/test-fixtures/fast-check/property.ts.template` | fast-check property 模板 | ~20 |
| `templates/test-fixtures/fast-check/arbitraries.ts.template` | fast-check arbitraries 模板 | ~10 |
| `templates/test-fixtures/nfr/performance.py.template` | NFR 性能测试模板 | ~15 |
| `templates/test-fixtures/nfr/security.java.template` | NFR 安全测试模板 | ~15 |
| `templates/test-fixtures/nfr/concurrency.ts.template` | NFR 并发测试模板 | ~15 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `lib/fixture-gen/types.ts` | +`TlcTraceEntry`, +`TraceabilityEntry` 类型 |
| `lib/fixture-gen/bdd.ts` | `generatePlaywright()` 输出 +Page Object 文件 |
| `lib/fixture-gen/lean.ts` | `generatePytest()` 新增 Hypothesis 分支 |
| `commands/generate-test-fixtures.ts` | +`--nfr` 参数 + NFR fixture 生成 |
| `commands/index.ts` | +`generate-vmodel-matrix` 注册 + USAGE 更新 |

### 测试文件

| 文件 | 新增测试数 |
|------|:----------:|
| `__tests__/fixture-gen/template-engine.test.ts` | 4 |
| `__tests__/fixture-gen/tla-counterexample.test.ts` | 8 |
| `__tests__/fixture-gen/traceability.test.ts` | 6 |
| `__tests__/fixture-gen/nfr.test.ts` | 4 |
| `__tests__/generate-vmodel-matrix.test.ts` | 5 |
| `__tests__/fixture-gen/bdd.test.ts` (修改) | +2 |
| `__tests__/fixture-gen/lean.test.ts` (修改) | +2 |
| **总计** | **31** |

---

## 任务 1：类型扩展 + 模板引擎

**文件：**
- 修改：`scripts/lib/fixture-gen/types.ts:1-59`
- 创建：`scripts/lib/fixture-gen/template-engine.ts`
- 创建：`scripts/__tests__/fixture-gen/template-engine.test.ts`
- 创建：15 个 `scripts/templates/test-fixtures/**/*.template` 文件

- [ ] **步骤 1：在 types.ts 末尾追加新类型**

```typescript
// 在 types.ts 末尾追加（文件从 59 行增长到 ~80 行）

/** A single entry from a TLC counterexample trace */
export interface TlcTraceEntry {
  step: number;
  state: Record<string, string>;
  violatedInvariant?: string;
}

/** A row in the V-Model traceability matrix */
export interface TraceabilityEntry {
  requirementId: string;
  requirementTitle: string;
  graphNodes: string[];
  bddScenarios: string[];
  tlaInvariants: string[];
  leanTheorems: string[];
  fixtureFiles: string[];
  coverageStatus: 'full' | 'partial' | 'none';
}
```

- [ ] **步骤 2：编写 template-engine 测试**

```typescript
// __tests__/fixture-gen/template-engine.test.ts
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { loadTemplate, renderTemplate } from '../../lib/fixture-gen/template-engine.js';

describe('renderTemplate', () => {
  it('replaces single placeholder', () => {
    const result = renderTemplate('Hello {{NAME}}!', { NAME: 'World' });
    assert.equal(result, 'Hello World!');
  });

  it('replaces multiple placeholders', () => {
    const result = renderTemplate('{{A}} and {{B}}', { A: 'X', B: 'Y' });
    assert.equal(result, 'X and Y');
  });

  it('leaves unmatched placeholders as-is', () => {
    const result = renderTemplate('{{A}} {{B}}', { A: 'X' });
    assert.equal(result, 'X {{B}}');
  });

  it('handles empty template', () => {
    const result = renderTemplate('', {});
    assert.equal(result, '');
  });
});

describe('loadTemplate', () => {
  it('loads a known template', () => {
    const tmpl = loadTemplate('cucumber', 'world.ts');
    assert.ok(tmpl.length > 0, 'Template should not be empty');
  });

  it('throws on missing template', () => {
    assert.throws(
      () => loadTemplate('cucumber', 'nonexistent.ts'),
      /Template not found/,
    );
  });
});
```

- [ ] **步骤 3：运行测试确认失败**

运行：`cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/fixture-gen/template-engine.test.ts`
预期：FAIL — `Cannot find module '../../lib/fixture-gen/template-engine.js'`

- [ ] **步骤 4：创建 template-engine.ts**

```typescript
// lib/fixture-gen/template-engine.ts
/**
 * Template engine for fixture generation.
 * Loads .template files and renders {{var}} placeholders.
 * Zero dependencies — uses TS string replace.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const TEMPLATES_DIR = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  '..', '..', 'templates', 'test-fixtures',
);

/**
 * Load a template file by framework and name.
 * @param framework - e.g. 'cucumber', 'playwright', 'pytest', 'junit', 'fast-check', 'nfr'
 * @param templateName - e.g. 'steps.ts', 'world.ts', 'test_module.py'
 * @returns template content string
 */
export function loadTemplate(framework: string, templateName: string): string {
  const filePath = path.join(TEMPLATES_DIR, framework, templateName + '.template');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Template not found: ${framework}/${templateName}.template`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Render a template by replacing {{VAR}} placeholders.
 * Unmatched placeholders are left as-is.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}
```

- [ ] **步骤 5：运行测试确认通过**

运行：`npx tsx --test __tests__/fixture-gen/template-engine.test.ts`
预期：PASS（6 tests）

- [ ] **步骤 6：创建 15 个模板文件**

逐个创建以下文件，内容从现有 `bdd.ts`/`tla.ts`/`lean.ts` 的内联字符串中提取，替换硬编码值为 `{{var}}` 占位符：

**cucumber/steps.ts.template** — 从 `bdd.ts:84-91` 提取
```
import { Given, When, Then } from '@cucumber/cucumber';

{{STEP_DEFS}}
```

**cucumber/world.ts.template** — 从 `bdd.ts:92-101`
```
import { setWorldConstructor } from '@cucumber/cucumber';

class CustomWorld {
  currentUser?: { id: string; role: string };
  // LLM_FILL: add world state properties
}

setWorldConstructor(CustomWorld);
export default CustomWorld;
```

**cucumber/fixtures.ts.template** — 从 `bdd.ts:103-108`
```
{{FIXTURE_EXPORTS}}
```

**playwright/spec.ts.template** — 从 `bdd.ts:136-143`
```
import { test, expect } from '@playwright/test';

test.describe('{{MODULE}}', () => {

{{TESTS}}

});
```

**playwright/fixtures.ts.template** — 从 `bdd.ts:145-152`
```
import { test as base } from '@playwright/test';

export const test = base.extend<{/* LLM_FILL: custom fixtures */}>({
  // LLM_FILL: define custom fixtures
});

export { expect };
```

**playwright/page.ts.template** — 新增 Page Object 模板
```
import type { Page } from '@playwright/test';

export class {{PAGE_OBJECT_CLASS}} {
  constructor(private page: Page) {}

  async navigate() {
    await this.page.goto('/* LLM_FILL: URL */');
  }

  async getState() {
    // LLM_FILL: extract page state
    return {};
  }
}
```

**pytest/test_module.py.template** — 从 `bdd.ts:162-169`
```
"""{{MODULE}} test fixtures — generated by srs-formalizer"""

{{TESTS}}
```

**pytest/conftest.py.template** — 从 `bdd.ts:171`
```
"""Shared fixtures for {{MODULE}}"""

import pytest

# LLM_FILL: define shared fixtures
```

**pytest/test_hypothesis.py.template** — 新增 Hypothesis 模板
```
"""{{MODULE}} property tests — Hypothesis based"""

from hypothesis import given, strategies as st

{{HYPOTHESIS_TESTS}}
```

**junit/Test.java.template** — 从 `bdd.ts:190-198`
```
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class {{CLASS_NAME}} {

{{METHODS}}

}
```

**junit/Fixture.java.template** — 从 `bdd.ts:200-204`
```
// LLM_FILL: define shared test fixtures for {{MODULE}}
public class {{FIXTURE_CLASS}} {
    // LLM_FILL: fixture methods
}
```

**fast-check/property.ts.template** — 从 `bdd.ts:233-239`
```
import * as fc from 'fast-check';

describe('{{MODULE}}', () => {

{{PROPS}}

});
```

**fast-check/arbitraries.ts.template** — 新增
```
// LLM_FILL: define custom arbitraries for {{MODULE}}
{{ARBITRARIES}}
```

**nfr/performance.py.template** — 新增
```
"""{{MODULE}} performance tests — NFR fixtures"""
import pytest
import time

@pytest.mark.performance
def test_response_time():
    """Verify response time < threshold."""
    # LLM_FILL: define SUT and threshold
    start = time.time()
    # result = sut.operation()
    elapsed = time.time() - start
    assert elapsed < 1.0  # LLM_FILL: adjust threshold
```

**nfr/security.java.template** — 新增
```
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class {{CLASS_NAME}}SecurityTest {

    @Test
    void rejectsSqlInjection() {
        // LLM_FILL: test SQL injection prevention
    }

    @Test
    void rejectsXssPayload() {
        // LLM_FILL: test XSS prevention
    }
}
```

**nfr/concurrency.ts.template** — 新增
```
import * as fc from 'fast-check';

describe('{{MODULE}} concurrency', () => {
  it('no race conditions', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        // LLM_FILL: test concurrent access safety
        return true;
      })
    );
  });
});
```

- [ ] **步骤 7：运行全量测试确认无回归**

运行：`npx tsx --test __tests__/*.test.ts __tests__/fixture-gen/*.test.ts`
预期：全部 PASS（353 + 6 新 = 359）

- [ ] **步骤 8：Commit**

```bash
git add scripts/lib/fixture-gen/types.ts scripts/lib/fixture-gen/template-engine.ts \
  scripts/__tests__/fixture-gen/template-engine.test.ts \
  scripts/templates/test-fixtures/
git commit -m "feat(fixture-gen): add template engine and 15 template files

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 任务 2：TLC 反例解析器（G1）

**文件：**
- 创建：`scripts/lib/fixture-gen/tla-counterexample.ts`
- 创建：`scripts/__tests__/fixture-gen/tla-counterexample.test.ts`

- [ ] **步骤 1：编写测试**

```typescript
// __tests__/fixture-gen/tla-counterexample.test.ts
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseTlcTrace, generateCounterexampleFixtures } from '../../lib/fixture-gen/tla-counterexample.js';

const SAMPLE_TRACE = `State 1: <Initial state>
x = 0
y = 0

State 2: <Next state>
x = 1
y = 2

State 3: <Next state>
x = 2
y = 5

Violation: Invariant SafetyInv violated.
`;

describe('parseTlcTrace', () => {
  it('parses multi-state trace', () => {
    const entries = parseTlcTrace(SAMPLE_TRACE);
    assert.equal(entries.length, 3);
    assert.equal(entries[0]?.step, 0);
    assert.equal(entries[0]?.state['x'], '0');
    assert.equal(entries[2]?.state['y'], '5');
  });

  it('extracts violated invariant', () => {
    const entries = parseTlcTrace(SAMPLE_TRACE);
    assert.equal(entries[entries.length - 1]?.violatedInvariant, 'SafetyInv');
  });

  it('returns empty for empty trace', () => {
    assert.deepEqual(parseTlcTrace(''), []);
  });

  it('handles trace without violation', () => {
    const trace = `State 1: <Initial state>\nx = 0\n`;
    const entries = parseTlcTrace(trace);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.violatedInvariant, undefined);
  });
});

describe('generateCounterexampleFixtures', () => {
  const entries = parseTlcTrace(SAMPLE_TRACE);

  it('generates pytest counterexample test', () => {
    const files = generateCounterexampleFixtures(entries, 'TestSpec', 'pytest');
    assert.equal(files.length, 1);
    assert.ok(files[0]?.path.includes('counterexample'));
    assert.ok(files[0]?.content.includes('def test_step_'));
    assert.ok(files[0]?.content.includes('SafetyInv'));
  });

  it('generates junit counterexample test', () => {
    const files = generateCounterexampleFixtures(entries, 'TestSpec', 'junit');
    assert.equal(files.length, 1);
    assert.ok(files[0]?.content.includes('@Test'));
    assert.ok(files[0]?.content.includes('CounterexampleTest'));
  });

  it('generates fast-check counterexample test', () => {
    const files = generateCounterexampleFixtures(entries, 'TestSpec', 'fast-check');
    assert.equal(files.length, 1);
    assert.ok(files[0]?.content.includes('fc.'));
  });

  it('throws on unsupported framework', () => {
    assert.throws(
      () => generateCounterexampleFixtures(entries, 'Spec', 'pytest' as never),
    );
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：`npx tsx --test __tests__/fixture-gen/tla-counterexample.test.ts`
预期：FAIL — `Cannot find module`

- [ ] **步骤 3：实现 tla-counterexample.ts**

```typescript
// lib/fixture-gen/tla-counterexample.ts
/**
 * TLC counterexample trace parser and fixture generator.
 * Parses .trace files from TLC model checker output and generates
 * reproducible integration test skeletons.
 */

import type { FixtureFile, TlcTraceEntry } from './types.js';

/** Parse a TLC .trace file into structured entries */
export function parseTlcTrace(traceContent: string): TlcTraceEntry[] {
  if (!traceContent.trim()) return [];

  const entries: TlcTraceEntry[] = [];
  const stateBlocks = traceContent.split(/(?=^State \d+:)/m);

  let violatedInvariant: string | undefined;
  const violationMatch = traceContent.match(/Violation:\s*(\w+)\s+violated/);
  if (violationMatch?.[1]) {
    violatedInvariant = violationMatch[1];
  }

  for (const block of stateBlocks) {
    const stepMatch = block.match(/^State (\d+):/);
    if (!stepMatch?.[1]) continue;

    const state: Record<string, string> = {};
    const lines = block.split('\n');
    for (const line of lines) {
      const kvMatch = line.match(/^\s+(\w+)\s*=\s*(.+)$/);
      if (kvMatch?.[1] && kvMatch?.[2]) {
        state[kvMatch[1]] = kvMatch[2].trim();
      }
    }

    const step = parseInt(stepMatch[1], 10) - 1;
    entries.push({
      step,
      state,
      violatedInvariant: step === entries.length && entries.length === stateBlocks.filter(b => b.match(/^State \d+:/)).length - 1
        ? violatedInvariant
        : undefined,
    });
  }

  // Fix: set violatedInvariant on last entry only
  if (entries.length > 0 && violatedInvariant) {
    entries[entries.length - 1] = {
      ...entries[entries.length - 1]!,
      violatedInvariant,
    };
  }

  return entries;
}

/** Generate fixture files from a parsed counterexample trace */
export function generateCounterexampleFixtures(
  trace: TlcTraceEntry[],
  specName: string,
  framework: 'pytest' | 'junit' | 'fast-check',
): FixtureFile[] {
  const safeName = specName.replace(/[/\\?%*:|"<>]/g, '_');
  switch (framework) {
    case 'pytest': return generatePytest(trace, safeName);
    case 'junit': return generateJunit(trace, safeName);
    case 'fast-check': return generateFastCheck(trace, safeName);
  }
}

function generatePytest(trace: TlcTraceEntry[], name: string): FixtureFile[] {
  const invariant = trace[trace.length - 1]?.violatedInvariant ?? 'Unknown';
  const steps = trace.map(entry => {
    const assertions = Object.entries(entry.state)
      .map(([k, v]) => `    assert ${k} == ${v}  # LLM_FILL: verify state`)
      .join('\n');
    return `def test_step_${entry.step}():
    """Verify state at step ${entry.step}"""
${assertions}
    pass`;
  }).join('\n\n');

  const content = `"""${name} counterexample test — generated from TLC trace"""
"""Violated invariant: ${invariant}"""

${steps}
`;
  return [{ path: `tests/test_${name}_counterexample.py`, content }];
}

function generateJunit(trace: TlcTraceEntry[], name: string): FixtureFile[] {
  const className = name + 'CounterexampleTest';
  const invariant = trace[trace.length - 1]?.violatedInvariant ?? 'Unknown';
  const methods = trace.map(entry => {
    const assertions = Object.entries(entry.state)
      .map(([k, v]) => `        assertEquals(${v}, ${k}); // LLM_FILL: verify`)
      .join('\n');
    return `    @Test
    void step${entry.step}() {
${assertions}
    }`;
  }).join('\n\n');

  const content = `import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ${className} {
    // Violated invariant: ${invariant}

${methods}
}
`;
  return [{ path: `src/test/java/${className}.java`, content }];
}

function generateFastCheck(trace: TlcTraceEntry[], name: string): FixtureFile[] {
  const invariant = trace[trace.length - 1]?.violatedInvariant ?? 'Unknown';
  const lastEntry = trace[trace.length - 1];
  const vars = lastEntry ? Object.keys(lastEntry.state) : [];
  const arbitraries = vars.map(v => `    const ${v}Arb = fc.integer();  // LLM_FILL: refine`).join('\n');

  const content = `import * as fc from 'fast-check';

describe('${name} counterexample', () => {
  it('reproduces ${invariant} violation', () => {
${arbitraries}

    fc.assert(
      fc.property(fc.tuple(/* LLM_FILL */), (${vars.join(', ')}) => {
        // LLM_FILL: replay counterexample steps
        return true;
      })
    );
  });
});
`;
  return [{ path: `properties/${name}_counterexample.property.ts`, content }];
}
```

- [ ] **步骤 4：运行测试确认通过**

运行：`npx tsx --test __tests__/fixture-gen/tla-counterexample.test.ts`
预期：PASS（8 tests）

- [ ] **步骤 5：Commit**

```bash
git add scripts/lib/fixture-gen/tla-counterexample.ts \
  scripts/__tests__/fixture-gen/tla-counterexample.test.ts
git commit -m "feat(fixture-gen): add TLC counterexample parser and fixture generator

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 任务 3：Hypothesis 属性测试（G2）

**文件：**
- 修改：`scripts/lib/fixture-gen/lean.ts:51-59`（`generatePytest` 函数）
- 修改：`scripts/__tests__/fixture-gen/lean.test.ts`（+2 测试）

- [ ] **步骤 1：编写失败的测试**

在 `lean.test.ts` 末尾追加：

```typescript
describe('generateLeanFixtures - Hypothesis', () => {
  const HYPOTHESIS_CONTENT = `import Mathlib.Data.Nat.Basic

theorem add_zero (n : Nat) : n + 0 = n := by
  simp [Nat.add_zero]
`;

  it('generates hypothesis test for polymorphic theorem', () => {
    const files = generateLeanFixtures(HYPOTHESIS_CONTENT, 'pytest');
    const hypFile = files.find(f => f.path.includes('hypothesis'));
    assert.ok(hypFile, 'Should have hypothesis test file');
    assert.ok(hypFile!.content.includes('@given'));
    assert.ok(hypFile!.content.includes('st.integers()'));
  });

  it('generates hypothesis test with multiple params', () => {
    const content = `theorem add_comm (a b : Nat) : a + b = b + a := by
  omega`;
    const files = generateLeanFixtures(content, 'pytest');
    const hypFile = files.find(f => f.path.includes('hypothesis'));
    assert.ok(hypFile, 'Should have hypothesis file');
    assert.ok(hypFile!.content.includes('@given'));
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：`npx tsx --test __tests__/fixture-gen/lean.test.ts`
预期：FAIL — `hypFile` is undefined（没有 hypothesis 文件输出）

- [ ] **步骤 3：修改 lean.ts 的 generatePytest**

在 `lean.ts` 中，将 `generatePytest` 函数替换为：

```typescript
function generatePytest(theorems: ParsedTheorem[], name: string): FixtureFile[] {
  // Standard pytest tests
  const tests = theorems.map(t => {
    const params = extractParams(t.typeSignature);
    const args = params.map(p => `    ${p} = 0  # LLM_FILL: generate valid input`).join('\n');
    return `def test_${t.name}():\n${args}\n    # LLM_FILL: verify ${t.name}\n    pass`;
  }).join('\n\n');

  const testContent = `"""${name} property tests — generated from Lean 4 proofs"""\n\n${tests}\n`;

  // Hypothesis property-based tests
  const hypothesisTests = theorems
    .filter(t => extractParams(t.typeSignature).length > 0)
    .map(t => {
      const params = extractParams(t.typeSignature);
      const strategies = params.map(p => {
        const strat = inferStrategy(t.typeSignature, p);
        return `    ${p}_arb = ${strat}`;
      }).join('\n');
      const args = params.map(p => `${p}_arb`).join(', ');
      return `@given(${args})
def test_${t.name}_property(${params.join(', ')}):
    # LLM_FILL: verify ${t.name} property
    result = ${t.name}(${params.join(', ')})
    assert result  # LLM_FILL: add postcondition`;
    }).join('\n\n');

  const hypContent = `"""${name} property tests — Hypothesis based"""\n\nfrom hypothesis import given, strategies as st\n\n${hypothesisTests}\n`;

  return [
    { path: `tests/test_${name}_properties.py`, content: testContent },
    { path: `tests/test_${name}_hypothesis.py`, content: hypContent },
  ];
}

/** Infer Hypothesis strategy from Lean type signature */
function inferStrategy(sig: string, paramName: string): string {
  // Match `(paramName : Type)` patterns
  const typeRegex = new RegExp(`\\(${paramName}\\s*:\\s*(\\w+)\\)`);
  const match = sig.match(typeRegex);
  const typeName = match?.[1] ?? '';

  if (typeName === 'Nat' || typeName === 'Int' || typeName === 'ℕ' || typeName === 'ℤ') {
    return 'st.integers(min_value=0)';
  }
  if (typeName === 'String' || typeName === 'String.') {
    return 'st.text()';
  }
  if (typeName.startsWith('List') || typeName.startsWith('Array')) {
    return 'st.lists(st.integers())';
  }
  return 'st.integers()  # LLM_FILL: refine strategy';
}
```

- [ ] **步骤 4：运行测试确认通过**

运行：`npx tsx --test __tests__/fixture-gen/lean.test.ts`
预期：PASS（所有测试 + 2 新 Hypothesis 测试）

- [ ] **步骤 5：Commit**

```bash
git add scripts/lib/fixture-gen/lean.ts scripts/__tests__/fixture-gen/lean.test.ts
git commit -m "feat(fixture-gen): add Hypothesis property-based test generation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 任务 4：Playwright Page Object（G3）

**文件：**
- 修改：`scripts/lib/fixture-gen/bdd.ts:128-158`（`generatePlaywright` 函数）
- 修改：`scripts/__tests__/fixture-gen/bdd.test.ts`（+2 测试）

- [ ] **步骤 1：编写失败的测试**

在 `bdd.test.ts` 的 `describe('generateBddFixtures')` 末尾追加：

```typescript
  it('generates playwright page object', () => {
    const files = generateBddFixtures(SAMPLE_FEATURE, '用户模块', 'playwright');
    const pageFile = files.find(f => f.path.includes('page'));
    assert.ok(pageFile, 'Should have page object file');
    assert.ok(pageFile!.content.includes('Page'));
    assert.ok(pageFile!.content.includes('navigate'));
  });

  it('generates playwright spec with page object import', () => {
    const files = generateBddFixtures(SAMPLE_FEATURE, '用户模块', 'playwright');
    const specFile = files.find(f => f.path.includes('.spec.'));
    assert.ok(specFile!.content.includes('import'));
    assert.ok(specFile!.content.includes('Page'));
  });
```

- [ ] **步骤 2：运行测试确认失败**

运行：`npx tsx --test __tests__/fixture-gen/bdd.test.ts`
预期：FAIL — `pageFile` is undefined

- [ ] **步骤 3：修改 bdd.ts 的 generatePlaywright**

将 `bdd.ts` 的 `generatePlaywright` 函数替换为：

```typescript
function generatePlaywright(scenarios: ParsedScenario[], module: string): FixtureFile[] {
  const className = toPascalCase(module) + 'Page';
  const tests = scenarios.map(s => {
    const body = s.params.length > 0
      ? s.params.map(p => `    // LLM_FILL: setup ${p}`).join('\n')
      : '    // LLM_FILL: implement test';
    return `  test('${escapeStr(s.name)}', async ({ page }) => {\n    const ${module.replace(/[/\\?%*:|"<>]/g, '_')}Page = new ${className}(page);\n${body}\n  });`;
  }).join('\n\n');

  const spec = `import { test, expect } from '@playwright/test';
import { ${className} } from '../pages/${module.replace(/[/\\?%*:|"<>]/g, '_')}.page';

test.describe('${module}', () => {

${tests}

});
`;

  const fixtures = `import { test as base } from '@playwright/test';

export const test = base.extend<{/* LLM_FILL: custom fixtures */}>({
  // LLM_FILL: define custom fixtures
});

export { expect };
`;

  const pageObject = `import type { Page } from '@playwright/test';

export class ${className} {
  constructor(private page: Page) {}

  async navigate() {
    await this.page.goto('/* LLM_FILL: URL */');
  }

  async getState() {
    // LLM_FILL: extract page state
    return {};
  }
}
`;

  return [
    { path: `pages/${module.replace(/[/\\?%*:|"<>]/g, '_')}.page.ts`, content: pageObject },
    { path: `tests/${module.replace(/[/\\?%*:|"<>]/g, '_')}.spec.ts`, content: spec },
    { path: `fixtures/${module.replace(/[/\\?%*:|"<>]/g, '_')}.fixtures.ts`, content: fixtures },
  ];
}
```

- [ ] **步骤 4：运行测试确认通过**

运行：`npx tsx --test __tests__/fixture-gen/bdd.test.ts`
预期：PASS（所有测试 + 2 新 Page Object 测试）

- [ ] **步骤 5：Commit**

```bash
git add scripts/lib/fixture-gen/bdd.ts scripts/__tests__/fixture-gen/bdd.test.ts
git commit -m "feat(fixture-gen): add Playwright Page Object generation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 任务 5：追溯矩阵（G5）

**文件：**
- 创建：`scripts/lib/fixture-gen/traceability.ts`
- 创建：`scripts/commands/generate-vmodel-matrix.ts`
- 创建：`scripts/__tests__/fixture-gen/traceability.test.ts`
- 创建：`scripts/__tests__/generate-vmodel-matrix.test.ts`
- 修改：`scripts/commands/index.ts`（注册新命令 + USAGE）

- [ ] **步骤 1：编写 traceability 测试**

```typescript
// __tests__/fixture-gen/traceability.test.ts
import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { buildTraceabilityMatrix, formatMarkdown, formatCypher } from '../../lib/fixture-gen/traceability.js';

let tmpDir: string;

function setupWorkDir(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-test-'));
  // Create standard directories
  fs.mkdirSync(path.join(tmpDir, '3_graph'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '4_bdd'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '5_formal', 'specs'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, '5_formal', 'proofs'), { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'test_fixtures'), { recursive: true });
  return tmpDir;
}

beforeEach(() => { tmpDir = setupWorkDir(); });
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

describe('buildTraceabilityMatrix', () => {
  it('returns empty array for empty workdir', () => {
    const matrix = buildTraceabilityMatrix(tmpDir);
    assert.ok(Array.isArray(matrix));
    assert.equal(matrix.length, 0);
  });

  it('extracts requirements from graph JSONL', () => {
    const jsonl = JSON.stringify({ id: 'REQ-001', title: '登录验证', type: 'requirement' });
    fs.writeFileSync(path.join(tmpDir, '3_graph', 'reqs.jsonl'), jsonl);
    const matrix = buildTraceabilityMatrix(tmpDir);
    assert.ok(matrix.length > 0);
    assert.equal(matrix[0]?.requirementId, 'REQ-001');
  });

  it('links BDD scenarios to requirements', () => {
    fs.writeFileSync(path.join(tmpDir, '3_graph', 'reqs.jsonl'),
      JSON.stringify({ id: 'REQ-001', title: 'Test', type: 'requirement' }));
    fs.writeFileSync(path.join(tmpDir, '4_bdd', 'login.feature'),
      'Feature: Login\n  Scenario: R1-REQ-001: Login test\n    Given preconditions\n    When action\n    Then result\n');
    const matrix = buildTraceabilityMatrix(tmpDir);
    assert.ok(matrix[0]?.bddScenarios.length > 0);
  });

  it('computes coverage status correctly', () => {
    fs.writeFileSync(path.join(tmpDir, '3_graph', 'reqs.jsonl'),
      JSON.stringify({ id: 'REQ-001', title: 'Test', type: 'requirement' }));
    const matrix = buildTraceabilityMatrix(tmpDir);
    assert.equal(matrix[0]?.coverageStatus, 'none');
  });
});

describe('formatMarkdown', () => {
  it('generates markdown table', () => {
    const md = formatMarkdown([{
      requirementId: 'REQ-001', requirementTitle: 'Test',
      graphNodes: [], bddScenarios: [], tlaInvariants: [],
      leanTheorems: [], fixtureFiles: [], coverageStatus: 'none',
    }]);
    assert.ok(md.includes('| REQ-001'));
    assert.ok(md.includes('requirementId'));
  });
});

describe('formatCypher', () => {
  it('generates cypher CREATE statements', () => {
    const cypher = formatCypher([{
      requirementId: 'REQ-001', requirementTitle: 'Test',
      graphNodes: ['N1'], bddScenarios: [], tlaInvariants: [],
      leanTheorems: [], fixtureFiles: [], coverageStatus: 'partial',
    }]);
    assert.ok(cypher.includes('CREATE'));
    assert.ok(cypher.includes('REQ-001'));
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：`npx tsx --test __tests__/fixture-gen/traceability.test.ts`
预期：FAIL — `Cannot find module`

- [ ] **步骤 3：实现 traceability.ts**

```typescript
// lib/fixture-gen/traceability.ts
/**
 * V-Model traceability matrix builder.
 * Scans workdir for graph nodes, BDD scenarios, TLA+/Lean specs,
 * and fixture files to build per-requirement coverage matrix.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TraceabilityEntry } from './types.js';

/** Build traceability matrix from workdir */
export function buildTraceabilityMatrix(workDir: string): TraceabilityEntry[] {
  const requirements = extractRequirements(workDir);
  if (requirements.length === 0) return [];

  const bddScenarios = extractBddScenarios(workDir);
  const tlaInvariants = extractTlaInvariants(workDir);
  const leanTheorems = extractLeanTheorems(workDir);
  const fixtureFiles = extractFixtureFiles(workDir);

  return requirements.map(req => {
    const linkedBdd = bddScenarios.filter(s => s.includes(req.id));
    const linkedTla = tlaInvariants.filter(i => true); // TLA+ invariants are spec-level
    const linkedLean = leanTheorems.filter(t => true); // Lean theorems are proof-level
    const linkedFixtures = fixtureFiles.filter(f => true); // All fixtures are requirement-level

    const coverageStatus: TraceabilityEntry['coverageStatus'] =
      linkedBdd.length > 0 && (linkedTla.length > 0 || linkedLean.length > 0) && linkedFixtures.length > 0
        ? 'full'
        : linkedBdd.length > 0 || linkedFixtures.length > 0
        ? 'partial'
        : 'none';

    return {
      requirementId: req.id,
      requirementTitle: req.title,
      graphNodes: req.nodes,
      bddScenarios: linkedBdd,
      tlaInvariants: linkedTla,
      leanTheorems: linkedLean,
      fixtureFiles: linkedFixtures,
      coverageStatus,
    };
  });
}

/** Format matrix as Markdown table */
export function formatMarkdown(matrix: TraceabilityEntry[]): string {
  const header = '| requirementId | requirementTitle | graphNodes | bddScenarios | tlaInvariants | leanTheorems | fixtureFiles | coverageStatus |';
  const sep = '|---|---|---|---|---|---|---|---|';
  const rows = matrix.map(r =>
    `| ${r.requirementId} | ${r.requirementTitle} | ${r.graphNodes.join(', ') || '—'} | ${r.bddScenarios.join(', ') || '—'} | ${r.tlaInvariants.join(', ') || '—'} | ${r.leanTheorems.join(', ') || '—'} | ${r.fixtureFiles.length} | ${r.coverageStatus} |`
  );
  return [header, sep, ...rows].join('\n');
}

/** Format matrix as Cypher CREATE statements */
export function formatCypher(matrix: TraceabilityEntry[]): string {
  const lines: string[] = [];
  for (const r of matrix) {
    lines.push(`CREATE (r:Requirement {id: '${r.requirementId}', title: '${r.requirementTitle}'})`);
    for (const n of r.graphNodes) {
      lines.push(`CREATE (r)-[:HAS_NODE]->(:Node {id: '${n}'})`);
    }
    for (const s of r.bddScenarios) {
      lines.push(`CREATE (r)-[:HAS_SCENARIO]->(:Scenario {name: '${s}'})`);
    }
  }
  return lines.join('\n');
}

// ── Private helpers ──────────────────────────────────────────────────────

interface ReqInfo { id: string; title: string; nodes: string[] }

function extractRequirements(workDir: string): ReqInfo[] {
  const graphDir = path.join(workDir, '3_graph');
  if (!fs.existsSync(graphDir)) return [];

  const reqs: ReqInfo[] = [];
  const files = fs.readdirSync(graphDir).filter(f => f.endsWith('.jsonl'));

  for (const file of files) {
    const lines = fs.readFileSync(path.join(graphDir, file), 'utf-8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const rec = JSON.parse(line) as Record<string, unknown>;
        if (rec['type'] === 'requirement' && typeof rec['id'] === 'string') {
          reqs.push({
            id: rec['id'],
            title: typeof rec['title'] === 'string' ? rec['title'] : rec['id'],
            nodes: [rec['id']],
          });
        }
      } catch { /* skip malformed lines */ }
    }
  }
  return reqs;
}

function extractBddScenarios(workDir: string): string[] {
  const bddDir = path.join(workDir, '4_bdd');
  if (!fs.existsSync(bddDir)) return [];

  const scenarios: string[] = [];
  const files = fs.readdirSync(bddDir).filter(f => f.endsWith('.feature'));

  for (const file of files) {
    const content = fs.readFileSync(path.join(bddDir, file), 'utf-8');
    const matches = content.matchAll(/Scenario(?:\s+Outline)?:\s+(.+)/g);
    for (const m of matches) {
      if (m[1]) scenarios.push(m[1].trim());
    }
  }
  return scenarios;
}

function extractTlaInvariants(workDir: string): string[] {
  const tlaDir = path.join(workDir, '5_formal', 'specs');
  if (!fs.existsSync(tlaDir)) return [];

  const invariants: string[] = [];
  const files = fs.readdirSync(tlaDir).filter(f => f.endsWith('.tla'));

  for (const file of files) {
    const content = fs.readFileSync(path.join(tlaDir, file), 'utf-8');
    const matches = content.matchAll(/^(\w*(?:Inv|TypeOK|Safety|Liveness)\w*)\s*==/gm);
    for (const m of matches) {
      if (m[1]) invariants.push(m[1]);
    }
  }
  return invariants;
}

function extractLeanTheorems(workDir: string): string[] {
  const leanDir = path.join(workDir, '5_formal', 'proofs');
  if (!fs.existsSync(leanDir)) return [];

  const theorems: string[] = [];
  const files = fs.readdirSync(leanDir).filter(f => f.endsWith('.lean'));

  for (const file of files) {
    const content = fs.readFileSync(path.join(leanDir, file), 'utf-8');
    const matches = content.matchAll(/^theorem\s+(\w+)/gm);
    for (const m of matches) {
      if (m[1]) theorems.push(m[1]);
    }
  }
  return theorems;
}

function extractFixtureFiles(workDir: string): string[] {
  const fixDir = path.join(workDir, 'test_fixtures');
  if (!fs.existsSync(fixDir)) return [];

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(path.relative(fixDir, full));
    }
  };
  walk(fixDir);
  return files;
}
```

- [ ] **步骤 4：运行测试确认通过**

运行：`npx tsx --test __tests__/fixture-gen/traceability.test.ts`
预期：PASS（6 tests）

- [ ] **步骤 5：编写 CLI 测试**

```typescript
// __tests__/generate-vmodel-matrix.test.ts
import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { main } from '../commands/generate-vmodel-matrix.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmatrix-test-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('generate-vmodel-matrix CLI', () => {
  it('returns error for missing --workdir', async () => {
    const result = await main([]);
    assert.equal(result.status, 'error');
    assert.ok(result.message?.includes('--workdir'));
  });

  it('returns error for non-.srs_formalizer workdir', async () => {
    const result = await main(['--workdir', '/tmp']);
    assert.equal(result.status, 'error');
  });

  it('generates markdown output', async () => {
    // Create .srs_formalizer marker
    fs.mkdirSync(path.join(tmpDir, '.srs_formalizer'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '3_graph'), { recursive: true });
    const result = await main(['--workdir', tmpDir, '--format', 'markdown']);
    assert.equal(result.status, 'ok');
    assert.ok(result.data);
  });

  it('generates cypher output', async () => {
    fs.mkdirSync(path.join(tmpDir, '.srs_formalizer'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '3_graph'), { recursive: true });
    const result = await main(['--workdir', tmpDir, '--format', 'cypher']);
    assert.equal(result.status, 'ok');
    assert.ok(result.data);
  });

  it('defaults to markdown format', async () => {
    fs.mkdirSync(path.join(tmpDir, '.srs_formalizer'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '3_graph'), { recursive: true });
    const result = await main(['--workdir', tmpDir]);
    assert.equal(result.status, 'ok');
  });
});
```

- [ ] **步骤 6：运行 CLI 测试确认失败**

运行：`npx tsx --test __tests__/generate-vmodel-matrix.test.ts`
预期：FAIL — `Cannot find module`

- [ ] **步骤 7：实现 generate-vmodel-matrix.ts**

```typescript
// commands/generate-vmodel-matrix.ts
/**
 * generate-vmodel-matrix.ts — V-Model traceability matrix CLI
 *
 * CLI: npx tsx index.ts generate-vmodel-matrix --workdir <dir> [--format markdown|cypher]
 */

import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir } from '../lib/cli.js';
import { refuseDirectInvocation } from '../lib/cli.js';
import { buildTraceabilityMatrix, formatMarkdown, formatCypher } from '../lib/fixture-gen/traceability.js';

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  let formatArg: string | null;

  try {
    workDirArg = safeParseArg(args, '--workdir');
    formatArg = safeParseArg(args, '--format');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!workDirArg) {
    return { status: 'error', message: 'Missing required argument: --workdir' };
  }

  let workDir: string;
  try {
    workDir = validateWorkDir(workDirArg);
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  const format = formatArg === 'cypher' ? 'cypher' : 'markdown';
  const matrix = buildTraceabilityMatrix(workDir);
  const output = format === 'cypher' ? formatCypher(matrix) : formatMarkdown(matrix);

  return {
    status: 'ok',
    data: {
      format,
      requirements_count: matrix.length,
      full_coverage: matrix.filter(r => r.coverageStatus === 'full').length,
      partial_coverage: matrix.filter(r => r.coverageStatus === 'partial').length,
      no_coverage: matrix.filter(r => r.coverageStatus === 'none').length,
      output,
    },
  };
}

refuseDirectInvocation(import.meta.url);
```

- [ ] **步骤 8：在 index.ts 注册新命令**

在 `index.ts` 的 `COMMANDS` 对象中追加：

```typescript
"generate-vmodel-matrix": () => import("./commands/generate-vmodel-matrix.js"),
```

在 `USAGE` 字符串中追加一行：

```
  generate-vmodel-matrix Generate V-Model traceability matrix (--workdir --format markdown|cypher)
```

- [ ] **步骤 9：运行全部测试确认通过**

运行：`npx tsx --test __tests__/*.test.ts __tests__/fixture-gen/*.test.ts`
预期：全部 PASS（353 + 4 + 8 + 6 + 5 = 376）

- [ ] **步骤 10：Commit**

```bash
git add scripts/lib/fixture-gen/traceability.ts \
  scripts/commands/generate-vmodel-matrix.ts \
  scripts/commands/index.ts \
  scripts/__tests__/fixture-gen/traceability.test.ts \
  scripts/__tests__/generate-vmodel-matrix.test.ts
git commit -m "feat(fixture-gen): add V-Model traceability matrix command

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 任务 6：NFR Fixture 模板（G4 补充）

**文件：**
- 修改：`scripts/commands/generate-test-fixtures.ts`（+`--nfr` 参数 + NFR 生成逻辑）
- 创建：`scripts/__tests__/fixture-gen/nfr.test.ts`

- [ ] **步骤 1：编写 NFR 测试**

```typescript
// __tests__/fixture-gen/nfr.test.ts
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { detectNfrTypes, generateNfrFixtures } from '../../lib/fixture-gen/nfr.js';
import type { Framework } from '../../lib/fixture-gen/types.js';

describe('detectNfrTypes', () => {
  it('detects performance keywords', () => {
    assert.ok(detectNfrTypes('系统响应时间应小于 200ms').includes('performance'));
  });

  it('detects security keywords', () => {
    assert.ok(detectNfrTypes('防止 SQL 注入攻击').includes('security'));
  });

  it('detects concurrency keywords', () => {
    assert.ok(detectNfrTypes('支持并发用户访问').includes('concurrency'));
  });

  it('returns empty for no NFR content', () => {
    assert.deepEqual(detectNfrTypes('用户可以登录'), []);
  });
});

describe('generateNfrFixtures', () => {
  it('generates pytest performance fixture', () => {
    const files = generateNfrFixtures(['performance'], 'test_mod', 'pytest');
    assert.ok(files.length > 0);
    assert.ok(files[0]?.content.includes('performance'));
  });

  it('generates junit security fixture', () => {
    const files = generateNfrFixtures(['security'], 'test_mod', 'junit');
    assert.ok(files.length > 0);
    assert.ok(files[0]?.content.includes('SecurityTest'));
  });

  it('generates fast-check concurrency fixture', () => {
    const files = generateNfrFixtures(['concurrency'], 'test_mod', 'fast-check');
    assert.ok(files.length > 0);
    assert.ok(files[0]?.content.includes('fc.'));
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：`npx tsx --test __tests__/fixture-gen/nfr.test.ts`
预期：FAIL — `Cannot find module '../../lib/fixture-gen/nfr.js'`

- [ ] **步骤 3：创建 nfr.ts**

```typescript
// lib/fixture-gen/nfr.ts
/**
 * NFR (Non-Functional Requirement) fixture generator.
 * Detects NFR types from text and generates corresponding test skeletons.
 */

import type { FixtureFile, Framework } from './types.js';

const NFR_KEYWORDS: Record<string, string[]> = {
  performance: ['性能', '响应时间', '吞吐量', 'latency', 'throughput', '延迟', '并发量'],
  security: ['安全', '注入', 'XSS', 'CSRF', 'authentication', '认证', '授权', '加密'],
  concurrency: ['并发', '竞态', '死锁', 'concurrency', 'deadlock', 'race condition', '线程'],
};

/** Detect NFR types from text content */
export function detectNfrTypes(text: string): string[] {
  const lower = text.toLowerCase();
  const types: string[] = [];
  for (const [nfrType, keywords] of Object.entries(NFR_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw.toLowerCase()))) {
      types.push(nfrType);
    }
  }
  return types;
}

/** Generate NFR fixture files */
export function generateNfrFixtures(
  nfrTypes: string[],
  moduleName: string,
  framework: Framework,
): FixtureFile[] {
  const safeName = moduleName.replace(/[/\\?%*:|"<>]/g, '_');
  const files: FixtureFile[] = [];

  for (const nfrType of nfrTypes) {
    switch (nfrType) {
      case 'performance':
        files.push(...genPerformance(safeName, framework));
        break;
      case 'security':
        files.push(...genSecurity(safeName, framework));
        break;
      case 'concurrency':
        files.push(...genConcurrency(safeName, framework));
        break;
    }
  }
  return files;
}

function genPerformance(name: string, fw: Framework): FixtureFile[] {
  if (fw === 'pytest') {
    return [{
      path: `tests/test_${name}_performance.py`,
      content: `"""${name} performance tests — NFR fixtures"""\nimport pytest\nimport time\n\n@pytest.mark.performance\ndef test_response_time():\n    """Verify response time < threshold."""\n    # LLM_FILL: define SUT and threshold\n    start = time.time()\n    # result = sut.operation()\n    elapsed = time.time() - start\n    assert elapsed < 1.0  # LLM_FILL: adjust threshold\n`,
    }];
  }
  if (fw === 'junit') {
    return [{
      path: `src/test/java/${name}PerformanceTest.java`,
      content: `import org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.*;\n\nclass ${name}PerformanceTest {\n    @Test\n    void responseTimeWithinThreshold() {\n        // LLM_FILL: measure and assert response time\n    }\n}\n`,
    }];
  }
  return [{
    path: `properties/${name}.performance.property.ts`,
    content: `import * as fc from 'fast-check';\n\ndescribe('${name} performance', () => {\n  it('response time within threshold', () => {\n    fc.assert(\n      fc.property(fc.integer(), (load) => {\n        // LLM_FILL: measure response time under load\n        return true;\n      })\n    );\n  });\n});\n`,
  }];
}

function genSecurity(name: string, fw: Framework): FixtureFile[] {
  if (fw === 'pytest') {
    return [{
      path: `tests/test_${name}_security.py`,
      content: `"""${name} security tests — NFR fixtures"""\nimport pytest\n\ndef test_rejects_sql_injection():\n    """Verify SQL injection prevention."""\n    # LLM_FILL: test SQL injection\n    pass\n\ndef test_rejects_xss_payload():\n    """Verify XSS prevention."""\n    # LLM_FILL: test XSS prevention\n    pass\n`,
    }];
  }
  if (fw === 'junit') {
    return [{
      path: `src/test/java/${name}SecurityTest.java`,
      content: `import org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.*;\n\nclass ${name}SecurityTest {\n    @Test\n    void rejectsSqlInjection() {\n        // LLM_FILL: test SQL injection prevention\n    }\n\n    @Test\n    void rejectsXssPayload() {\n        // LLM_FILL: test XSS prevention\n    }\n}\n`,
    }];
  }
  return [{
    path: `properties/${name}.security.property.ts`,
    content: `import * as fc from 'fast-check';\n\ndescribe('${name} security', () => {\n  it('no injection vulnerabilities', () => {\n    fc.assert(\n      fc.property(fc.string(), (input) => {\n        // LLM_FILL: test input sanitization\n        return true;\n      })\n    );\n  });\n});\n`,
  }];
}

function genConcurrency(name: string, fw: Framework): FixtureFile[] {
  if (fw === 'pytest') {
    return [{
      path: `tests/test_${name}_concurrency.py`,
      content: `"""${name} concurrency tests — NFR fixtures"""\nimport pytest\nfrom concurrent.futures import ThreadPoolExecutor\n\ndef test_no_race_condition():\n    """Verify no race conditions under concurrent access."""\n    # LLM_FILL: test concurrent access\n    pass\n`,
    }];
  }
  if (fw === 'junit') {
    return [{
      path: `src/test/java/${name}ConcurrencyTest.java`,
      content: `import org.junit.jupiter.api.Test;\nimport static org.junit.jupiter.api.Assertions.*;\nimport java.util.concurrent.*;\n\nclass ${name}ConcurrencyTest {\n    @Test\n    void noRaceCondition() throws Exception {\n        // LLM_FILL: test concurrent access\n    }\n}\n`,
    }];
  }
  return [{
    path: `properties/${name}.concurrency.property.ts`,
    content: `import * as fc from 'fast-check';\n\ndescribe('${name} concurrency', () => {\n  it('no race conditions', () => {\n    fc.assert(\n      fc.property(fc.integer(), (seed) => {\n        // LLM_FILL: test concurrent access safety\n        return true;\n      })\n    );\n  });\n});\n`,
  }];
}
```

- [ ] **步骤 4：运行测试确认通过**

运行：`npx tsx --test __tests__/fixture-gen/nfr.test.ts`
预期：PASS（4 tests）

- [ ] **步骤 5：修改 generate-test-fixtures.ts 添加 --nfr**

在 `generate-test-fixtures.ts` 中：

1. 在 import 区追加：`import { detectNfrTypes, generateNfrFixtures } from '../lib/fixture-gen/nfr.js';`

2. 在 `main()` 函数中，`workDirArg` 解析后追加：
```typescript
let nfrFlag: string | null;
try {
  nfrFlag = safeParseArg(args, '--nfr');
} catch { nfrFlag = null; }
```

3. 在 `compatibleFrameworks` 检查之后，`sourceFiles.length === 0` 检查之前，追加 NFR 分支：
```typescript
// NFR fixture generation
if (nfrFlag !== null) {
  const shardDirs = [
    path.join(workDir, '1_input', 'shards'),
    path.join(workDir, '_ctx', 'shards'),
  ];
  const nfrText = shardDirs
    .filter(d => fs.existsSync(d))
    .flatMap(d => fs.readdirSync(d).filter(f => f.endsWith('.jsonl'))
      .map(f => fs.readFileSync(path.join(d, f), 'utf-8')))
    .join('\n');
  const nfrTypes = detectNfrTypes(nfrText);
  if (nfrTypes.length === 0) {
    return { status: 'error', message: 'No NFR keywords detected in SRS content' };
  }
  const nfrFiles = generateNfrFixtures(nfrTypes, 'nfr', framework);
  const written = writeFixtureFiles(workDir, level, framework, nfrFiles);
  return {
    status: 'ok',
    data: {
      files_created: written.length,
      output_dir: path.join('test_fixtures', level, framework),
      nfr_types: nfrTypes,
      files: written,
    },
  };
}
```

- [ ] **步骤 6：运行全量测试确认通过**

运行：`npx tsx --test __tests__/*.test.ts __tests__/fixture-gen/*.test.ts`
预期：全部 PASS（~380 tests）

- [ ] **步骤 7：Commit**

```bash
git add scripts/lib/fixture-gen/nfr.ts scripts/commands/generate-test-fixtures.ts \
  scripts/__tests__/fixture-gen/nfr.test.ts
git commit -m "feat(fixture-gen): add NFR fixture generation with --nfr flag

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 任务 7：文档更新 + 最终验证

**文件：**
- 修改：`CHANGELOG.md`
- 修改：`README.md`
- 修改：`AGENTS.md`
- 修改：`docs/DESIGN.md`（新增 V-Model 章节）

- [ ] **步骤 1：TypeScript 类型检查**

运行：`cd .claude/skills/srs-formalizer/scripts && npx tsc --noEmit`
预期：0 errors

- [ ] **步骤 2：全量测试**

运行：`npx tsx --test __tests__/*.test.ts __tests__/fixture-gen/*.test.ts`
预期：全部 PASS（~384 tests）

- [ ] **步骤 3：更新 CHANGELOG.md**

在 CHANGELOG.md 顶部追加 v0.7.0 条目（参照 `docs/superpowers/specs/2026-07-12-v-model-zero-gap-design.md` 的内容）。

- [ ] **步骤 4：更新 README.md**

- 命令表追加 `generate-vmodel-matrix`
- 测试数更新为 ~384
- 版本表追加 v0.7.0

- [ ] **步骤 5：更新 AGENTS.md**

- 测试数更新为 ~384
- 命令数更新为 34

- [ ] **步骤 6：Commit**

```bash
git add CHANGELOG.md README.md AGENTS.md
git commit -m "docs: update for v0.7.0 V-Model zero-gap release

Co-Authored-By: Claude <noreply@anthropic.com>"
```

- [ ] **步骤 7：推送**

```bash
git push origin main
```
