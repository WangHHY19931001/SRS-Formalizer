# V-Model Test Fixture 生成实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 从 BDD/TLA+/Lean 4 形式化产出生成 5 框架测试夹具骨架，TS 做结构提取 + LLM 做语义填充。

**架构：** 薄命令 `generate-test-fixtures` dispatch 到 `lib/fixture-gen/` 模块。TS 解析源文件 AST 提取结构信息，生成含 `<!-- LLM_FILL -->` 标记的骨架文件。5 框架（Cucumber/Playwright/Pytest/JUnit/fast-check）各自有模板。

**技术栈：** TypeScript 5.5+ strict, Node.js ≥20, 零运行时依赖, `node:test`

---

## 文件结构

### 新建文件

| 文件 | 职责 | 预估行数 |
|------|------|:--------:|
| `scripts/lib/fixture-gen/types.ts` | 共享类型：`FixtureGenResult`, `FixtureFile`, `CoverageReport`, `ParsedScenario`, `ParsedTheorem` | ~50 |
| `scripts/lib/fixture-gen/bdd.ts` | 解析 .feature → 提取 scenarios/params → 按框架生成骨架 | ~250 |
| `scripts/lib/fixture-gen/tla.ts` | 解析 .tla → 提取 VARIABLES/CONSTANTS/INVARIANT → 按框架生成 | ~180 |
| `scripts/lib/fixture-gen/lean.ts` | 解析 .lean → 提取 theorem/类型签名 → 按框架生成 | ~160 |
| `scripts/lib/fixture-gen/coverage.ts` | 扫描 test_fixtures/ 与源产出交叉 → 覆盖率报告 | ~80 |
| `scripts/commands/generate-test-fixtures.ts` | 薄编排：参数解析 → dispatch 到 lib 模块 | ~80 |
| `scripts/commands/fixture-coverage.ts` | 薄编排：调用 coverage.ts | ~60 |
| `scripts/__tests__/fixture-gen/bdd.test.ts` | BDD fixture 生成单元测试 | ~120 |
| `scripts/__tests__/fixture-gen/tla.test.ts` | TLA+ fixture 生成单元测试 | ~100 |
| `scripts/__tests__/fixture-gen/lean.test.ts` | Lean 4 fixture 生成单元测试 | ~80 |
| `scripts/__tests__/generate-test-fixtures.test.ts` | 端到端集成测试 | ~120 |
| `scripts/__tests__/fixture-coverage.test.ts` | 覆盖率命令测试 | ~60 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `scripts/index.ts:85-86` | +2 命令注册入口 |
| `scripts/index.ts:7-43` | USAGE +2 行命令描述 |
| `scripts/types/index.ts` | 不修改（新类型在 `lib/fixture-gen/types.ts`） |

---

## 任务 1：共享类型

**文件：**
- 创建：`scripts/lib/fixture-gen/types.ts`

- [ ] **步骤 1：创建 types.ts**

```typescript
// === Fixture generation shared types ===

/** Supported test frameworks */
export type Framework = 'cucumber' | 'playwright' | 'pytest' | 'junit' | 'fast-check';

/** Fixture generation levels */
export type FixtureLevel = 'acceptance' | 'integration' | 'unit' | 'property';

/** Source type for fixture generation */
export type FixtureSource = 'bdd' | 'tla' | 'lean' | 'auto';

/** A parsed scenario from BDD .feature file */
export interface ParsedScenario {
  name: string;
  requirementId: string;
  given: string[];
  when: string[];
  then: string[];
  params: string[];  // extracted <param_name> placeholders
}

/** A parsed theorem from Lean 4 .lean file */
export interface ParsedTheorem {
  name: string;
  typeSignature: string;
  imports: string[];
}

/** A parsed TLA+ spec structure */
export interface ParsedTlaSpec {
  specName: string;
  variables: string[];
  constants: string[];
  invariants: string[];
  init: string;
  next: string;
}

/** A single generated fixture file */
export interface FixtureFile {
  path: string;       // relative to output dir
  content: string;
}

/** Result of fixture generation */
export interface FixtureGenResult {
  files_created: number;
  output_dir: string;
  source_files_used: string[];
  files: FixtureFile[];
}

/** Coverage report entry for a missing requirement */
export interface MissingEntry {
  requirement: string;
  reason: string;
}

/** Coverage report */
export interface CoverageReport {
  total_requirements: number;
  bdd_fixtures_generated: number;
  tla_fixtures_generated: number;
  lean_fixtures_generated: number;
  coverage_pct: number;
  missing: MissingEntry[];
}
```

- [ ] **步骤 2：验证类型编译通过**

运行：`npx tsc --noEmit`
预期：0 errors

- [ ] **步骤 3：Commit**

```bash
git add scripts/lib/fixture-gen/types.ts
git commit -m "feat(fixture-gen): add shared types for test fixture generation

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 任务 2：BDD Fixture 生成器

**文件：**
- 创建：`scripts/lib/fixture-gen/bdd.ts`
- 创建：`scripts/__tests__/fixture-gen/bdd.test.ts`

- [ ] **步骤 1：编写失败的测试**

```typescript
// scripts/__tests__/fixture-gen/bdd.test.ts
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { generateBddFixtures, parseFeature } from '../../lib/fixture-gen/bdd.js';
import type { Framework } from '../../lib/fixture-gen/types.js';

const SAMPLE_FEATURE = `# SYSTEM: SRS
# TRACE: PENDING
Feature: 用户模块

  Scenario: R1-REQ-0001: 用户登录
    Given the user <user_id> exists
    When the user submits credentials with <password>
    Then the system grants access

  Scenario: R1-REQ-0002: 用户注册
    Given the user <email> is not registered
    When the user submits registration form
    Then the account is created
`;

describe('parseFeature', () => {
  it('extracts scenarios with params', () => {
    const scenarios = parseFeature(SAMPLE_FEATURE);
    assert.equal(scenarios.length, 2);
    assert.equal(scenarios[0].requirementId, 'R1-REQ-0001');
    assert.deepEqual(scenarios[0].params, ['user_id', 'password']);
    assert.equal(scenarios[1].requirementId, 'R1-REQ-0002');
    assert.deepEqual(scenarios[1].params, ['email']);
  });

  it('returns empty array for feature with no scenarios', () => {
    const scenarios = parseFeature('Feature: Empty\n');
    assert.equal(scenarios.length, 0);
  });
});

describe('generateBddFixtures', () => {
  it('generates cucumber step definitions', () => {
    const files = generateBddFixtures(SAMPLE_FEATURE, '用户模块', 'cucumber');
    assert.ok(files.length > 0);
    const stepsFile = files.find(f => f.path.includes('steps'));
    assert.ok(stepsFile, 'Should have steps file');
    assert.ok(stepsFile!.content.includes("Given('the user"));
    assert.ok(stepsFile!.content.includes('LLM_FILL'));
  });

  it('generates playwright spec', () => {
    const files = generateBddFixtures(SAMPLE_FEATURE, '用户模块', 'playwright');
    const specFile = files.find(f => f.path.includes('.spec.'));
    assert.ok(specFile, 'Should have spec file');
    assert.ok(specFile!.content.includes('test('));
  });

  it('generates pytest test file', () => {
    const files = generateBddFixtures(SAMPLE_FEATURE, '用户模块', 'pytest');
    const testFile = files.find(f => f.path.includes('test_'));
    assert.ok(testFile, 'Should have test file');
    assert.ok(testFile!.content.includes('def test_'));
    assert.ok(testFile!.content.includes('LLM_FILL'));
  });

  it('generates junit test class', () => {
    const files = generateBddFixtures(SAMPLE_FEATURE, '用户模块', 'junit');
    const testFile = files.find(f => f.path.includes('Test.java'));
    assert.ok(testFile, 'Should have Test.java');
    assert.ok(testFile!.content.includes('@Test'));
  });

  it('generates fast-check properties', () => {
    const files = generateBddFixtures(SAMPLE_FEATURE, '用户模块', 'fast-check');
    const propFile = files.find(f => f.path.includes('.property.'));
    assert.ok(propFile, 'Should have property file');
    assert.ok(propFile!.content.includes('fc.'));
  });

  it('throws on unknown framework', () => {
    assert.throws(
      () => generateBddFixtures(SAMPLE_FEATURE, 'mod', 'unknown' as Framework),
      /Unknown framework/,
    );
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：`npx tsx --test __tests__/fixture-gen/bdd.test.ts`
预期：FAIL — module not found

- [ ] **步骤 3：实现 bdd.ts**

```typescript
// scripts/lib/fixture-gen/bdd.ts
/**
 * BDD fixture generator.
 * Parses .feature files and generates framework-specific test skeletons
 * with LLM_FILL markers for semantic content.
 */

import type { Framework, FixtureFile, ParsedScenario } from './types.js';

/** Parse Gherkin scenarios from .feature content */
export function parseFeature(content: string): ParsedScenario[] {
  const scenarios: ParsedScenario[] = [];
  const scenarioBlocks = content.split(/(?=^\s{2}Scenario:)/m);

  for (const block of scenarioBlocks) {
    const headerMatch = block.match(/^\s{2}Scenario:\s+(.+)$/m);
    if (!headerMatch?.[1]) continue;

    const header = headerMatch[1].trim();
    const idMatch = header.match(/^([\w-]+):/);
    const requirementId = idMatch?.[1] ?? 'UNKNOWN';

    const given: string[] = [];
    const when: string[] = [];
    const then: string[] = [];
    const params: string[] = [];

    const lines = block.split('\n');
    let currentStep: 'given' | 'when' | 'then' | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('Given ')) {
        currentStep = 'given';
        given.push(trimmed.slice(6));
      } else if (trimmed.startsWith('When ')) {
        currentStep = 'when';
        when.push(trimmed.slice(5));
      } else if (trimmed.startsWith('Then ')) {
        currentStep = 'then';
        then.push(trimmed.slice(5));
      } else if (trimmed.startsWith('And ') && currentStep) {
        const stepText = trimmed.slice(4);
        if (currentStep === 'given') given.push(stepText);
        else if (currentStep === 'when') when.push(stepText);
        else then.push(stepText);
      }
    }

    // Extract <param> placeholders from all steps
    const allSteps = [...given, ...when, ...then];
    for (const step of allSteps) {
      const paramMatches = step.matchAll(/<(\w+)>/g);
      for (const m of paramMatches) {
        if (m[1] && !params.includes(m[1])) params.push(m[1]);
      }
    }

    scenarios.push({ name: header, requirementId, given, when, then, params });
  }

  return scenarios;
}

/** Generate fixture files for a given framework */
export function generateBddFixtures(
  featureContent: string,
  moduleName: string,
  framework: Framework,
): FixtureFile[] {
  const scenarios = parseFeature(featureContent);
  const safeName = moduleName.replace(/[/\\?%*:|"<>]/g, '_');

  switch (framework) {
    case 'cucumber': return generateCucumber(scenarios, safeName);
    case 'playwright': return generatePlaywright(scenarios, safeName);
    case 'pytest': return generatePytest(scenarios, safeName);
    case 'junit': return generateJunit(scenarios, safeName);
    case 'fast-check': return generateFastCheck(scenarios, safeName);
    default: throw new Error(`Unknown framework: ${framework}`);
  }
}

// ── Cucumber ──────────────────────────────────────────────────────────────

function generateCucumber(scenarios: ParsedScenario[], module: string): FixtureFile[] {
  const steps = scenarios.map(s => {
    const stepDefs = s.given.map(g => buildStepDef('Given', g))
      .concat(s.when.map(w => buildStepDef('When', w)))
      .concat(s.then.map(t => buildStepDef('Then', t)));
    return stepDefs.join('\n\n');
  }).join('\n\n');

  const world = `import { setWorldConstructor } from '@cucumber/cucumber';

class CustomWorld {
  currentUser?: { id: string; role: string };
  // LLM_FILL: add world state properties
}

setWorldConstructor(CustomWorld);
export default CustomWorld;
`;

  const fixtures = scenarios.map(s => {
    const params = s.params.length > 0
      ? s.params.map(p => `  // LLM_FILL: generate test data for ${p}`).join('\n')
      : '  // LLM_FILL: generate test data';
    return `export const ${toCamelCase(s.requirementId)}_data = {\n${params}\n};`;
  }).join('\n\n');

  return [
    { path: `steps/${module}_steps.ts`, content: `import { Given, When, Then } from '@cucumber/cucumber';\n\n${steps}\n` },
    { path: 'support/world.ts', content: world },
    { path: `fixtures/${module}_data.ts`, content: fixtures + '\n' },
  ];
}

function buildStepDef(keyword: string, stepText: string): string {
  const pattern = stepText
    .replace(/<(\w+)>/g, '{string}')
    .replace(/"/g, '\\"');
  const params = [...stepText.matchAll(/<(\w+)>/g)].map(m => m[1]);
  const args = params.map(p => `${p}: string`).join(', ');
  return `${keyword}('${pattern}', async function (${args}) {\n  // LLM_FILL: implement step\n  throw new Error('Not implemented — LLM must fill');\n});`;
}

// ── Playwright ────────────────────────────────────────────────────────────

function generatePlaywright(scenarios: ParsedScenario[], module: string): FixtureFile[] {
  const tests = scenarios.map(s => {
    const body = s.params.length > 0
      ? s.params.map(p => `    // LLM_FILL: setup ${p}`).join('\n')
      : '    // LLM_FILL: implement test';
    return `  test('${escapeStr(s.name)}', async ({ page }) => {\n${body}\n  });`;
  }).join('\n\n');

  const spec = `import { test, expect } from '@playwright/test';

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

  return [
    { path: `tests/${module}.spec.ts`, content: spec },
    { path: `fixtures/${module}.fixtures.ts`, content: fixtures },
  ];
}

// ── Pytest ────────────────────────────────────────────────────────────────

function generatePytest(scenarios: ParsedScenario[], module: string): FixtureFile[] {
  const tests = scenarios.map(s => {
    const params = s.params.map(p => `    ${p} = "LLM_FILL_VALUE"  # LLM_FILL: replace`).join('\n');
    const body = params.length > 0 ? params + '\n    ' : '    ';
    return `def test_${toSnakeCase(s.requirementId)}():\n${body}# LLM_FILL: implement assertion\n    pass`;
  }).join('\n\n');

  const testFile = `"""${module} test fixtures — generated by srs-formalizer"""\n\n${tests}\n`;

  const conftest = `"""Shared fixtures for ${module}"""\n\nimport pytest\n\n# LLM_FILL: define shared fixtures\n`;

  return [
    { path: `tests/test_${module.replace(/[/\\?%*:|"<>]/g, '_')}.py`, content: testFile },
    { path: 'conftest.py', content: conftest },
  ];
}

// ── JUnit ─────────────────────────────────────────────────────────────────

function generateJunit(scenarios: ParsedScenario[], module: string): FixtureFile[] {
  const className = toPascalCase(module) + 'Test';
  const methods = scenarios.map(s => {
    const body = s.params.length > 0
      ? s.params.map(p => `        // LLM_FILL: setup ${p}`).join('\n')
      : '        // LLM_FILL: implement test';
    return `    @Test\n    void ${toCamelCase(s.requirementId)}() {\n${body}\n    }`;
  }).join('\n\n');

  const testClass = `import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ${className} {

${methods}

}
`;

  const fixtureClass = `// LLM_FILL: define shared test fixtures for ${module}
public class ${toPascalCase(module)}Fixture {
    // LLM_FILL: fixture methods
}
`;

  return [
    { path: `src/test/java/${className}.java`, content: testClass },
    { path: `fixtures/${toPascalCase(module)}Fixture.java`, content: fixtureClass },
  ];
}

// ── fast-check ────────────────────────────────────────────────────────────

function generateFastCheck(scenarios: ParsedScenario[], module: string): FixtureFile[] {
  const props = scenarios.map(s => {
    const arbitraries = s.params.length > 0
      ? s.params.map(p => `  const ${p}Arb = fc.string();  // LLM_FILL: refine arbitrary`).join('\n')
      : '  // LLM_FILL: define arbitraries';
    return `describe('${s.requirementId}', () => {
  it('${escapeStr(s.name)}', () => {
${arbitraries}

    fc.assert(
      fc.property(fc.tuple(/* LLM_FILL: tuple of arbitraries */), (${s.params.join(', ')}) => {
        // LLM_FILL: implement property
        return true;
      })
    );
  });
});`;
  }).join('\n\n');

  const propFile = `import * as fc from 'fast-check';

describe('${module}', () => {

${props}

});
`;

  return [
    { path: `properties/${module.replace(/[/\\?%*:|"<>]/g, '_')}.property.ts`, content: propFile },
  ];
}

// ── Helpers ───────────────────────────────────────────────────────────────

function toCamelCase(s: string): string {
  return s.replace(/[-_](\w)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(\w)/, (_, c: string) => c.toLowerCase());
}

function toPascalCase(s: string): string {
  const camel = toCamelCase(s);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

function toSnakeCase(s: string): string {
  return s.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

function escapeStr(s: string): string {
  return s.replace(/'/g, "\\'");
}
```

- [ ] **步骤 4：运行测试确认通过**

运行：`npx tsx --test __tests__/fixture-gen/bdd.test.ts`
预期：PASS — all tests pass

- [ ] **步骤 5：Commit**

```bash
git add scripts/lib/fixture-gen/bdd.ts scripts/__tests__/fixture-gen/bdd.test.ts
git commit -m "feat(fixture-gen): add BDD fixture generator with 5 framework support

Parses Gherkin .feature files, extracts scenarios and parameters,
generates framework-specific test skeletons with LLM_FILL markers.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 任务 3：TLA+ Fixture 生成器

**文件：**
- 创建：`scripts/lib/fixture-gen/tla.ts`
- 创建：`scripts/__tests__/fixture-gen/tla.test.ts`

- [ ] **步骤 1：编写失败的测试**

```typescript
// scripts/__tests__/fixture-gen/tla.test.ts
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { generateTlaFixtures, parseTlaSpec } from '../../lib/fixture-gen/tla.js';

const SAMPLE_TLA = `---- MODULE TestSpec ----
VARIABLES x, y
CONSTANTS MaxVal, SetS

Init == x = 0 /\\ y = 0
Next == x' = x + 1 /\\ y' = y
TypeOK == x \\in 0..MaxVal /\\ y \\in 0..MaxVal
====
`;

describe('parseTlaSpec', () => {
  it('extracts variables and constants', () => {
    const spec = parseTlaSpec(SAMPLE_TLA);
    assert.deepEqual(spec.variables, ['x', 'y']);
    assert.deepEqual(spec.constants, ['MaxVal', 'SetS']);
    assert.equal(spec.specName, 'TestSpec');
  });

  it('extracts invariants', () => {
    const spec = parseTlaSpec(SAMPLE_TLA);
    assert.ok(spec.invariants.includes('TypeOK'));
  });
});

describe('generateTlaFixtures', () => {
  it('generates pytest invariant tests', () => {
    const files = generateTlaFixtures(SAMPLE_TLA, 'pytest');
    assert.ok(files.length > 0);
    const testFile = files.find(f => f.path.includes('test_'));
    assert.ok(testFile);
    assert.ok(testFile!.content.includes('def test_'));
    assert.ok(testFile!.content.includes('LLM_FILL'));
  });

  it('generates junit invariant tests', () => {
    const files = generateTlaFixtures(SAMPLE_TLA, 'junit');
    const testFile = files.find(f => f.path.includes('Test.java'));
    assert.ok(testFile);
    assert.ok(testFile!.content.includes('@Test'));
  });

  it('generates fast-check properties', () => {
    const files = generateTlaFixtures(SAMPLE_TLA, 'fast-check');
    const propFile = files.find(f => f.path.includes('.property.'));
    assert.ok(propFile);
    assert.ok(propFile!.content.includes('fc.'));
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：`npx tsx --test __tests__/fixture-gen/tla.test.ts`
预期：FAIL — module not found

- [ ] **步骤 3：实现 tla.ts**

```typescript
// scripts/lib/fixture-gen/tla.ts
/**
 * TLA+ fixture generator.
 * Parses .tla files to extract variables, constants, invariants,
 * and generates framework-specific integration test skeletons.
 */

import type { Framework, FixtureFile, ParsedTlaSpec } from './types.js';

/** Parse a TLA+ spec to extract key elements */
export function parseTlaSpec(content: string): ParsedTlaSpec {
  const specNameMatch = content.match(/----\s*MODULE\s+(\w+)\s+----/);
  const specName = specNameMatch?.[1] ?? 'UnknownSpec';

  const variables: string[] = [];
  const varMatch = content.match(/VARIABLES\s+([\w\s,]+)/);
  if (varMatch?.[1]) {
    variables.push(...varMatch[1].split(',').map(v => v.trim()).filter(Boolean));
  }

  const constants: string[] = [];
  const constMatch = content.match(/CONSTANTS\s+([\w\s,]+)/);
  if (constMatch?.[1]) {
    constants.push(...constMatch[1].split(',').map(c => c.trim()).filter(Boolean));
  }

  const invariants: string[] = [];
  const invRegex = /^(\w+)\s*==/gm;
  let m: RegExpExecArray | null;
  while ((m = invRegex.exec(content)) !== null) {
    if (m[1] && m[1] !== 'Init' && m[1] !== 'Next' && m[1] !== specName) {
      invariants.push(m[1]);
    }
  }

  const initMatch = content.match(/Init\s*==\s*(.+)/);
  const nextMatch = content.match(/Next\s*==\s*(.+)/);

  return {
    specName,
    variables,
    constants,
    invariants,
    init: initMatch?.[1]?.trim() ?? '',
    next: nextMatch?.[1]?.trim() ?? '',
  };
}

/** Generate fixture files for a given framework */
export function generateTlaFixtures(tlaContent: string, framework: Framework): FixtureFile[] {
  const spec = parseTlaSpec(tlaContent);
  const safeName = spec.specName.replace(/[/\\?%*:|"<>]/g, '_');

  switch (framework) {
    case 'pytest': return generatePytest(spec, safeName);
    case 'junit': return generateJunit(spec, safeName);
    case 'fast-check': return generateFastCheck(spec, safeName);
    default: throw new Error(`Unsupported framework for TLA+: ${framework}. Use pytest, junit, or fast-check.`);
  }
}

function generatePytest(spec: ParsedTlaSpec, name: string): FixtureFile[] {
  const fixtures = spec.variables.map(v => `@pytest.fixture\ndef ${v}():\n    # LLM_FILL: generate valid ${v} values\n    return 0`).join('\n\n');

  const tests = spec.invariants.map(inv => {
    const asserts = spec.variables.map(v => `    # LLM_FILL: assert ${inv} holds for ${v}`).join('\n');
    return `def test_invariant_${inv.toLowerCase()}(${spec.variables.join(', ')}):\n${asserts}\n    pass`;
  }).join('\n\n');

  const content = `"""${name} invariant tests — generated from TLA+ spec"""\n\nimport pytest\n\n${fixtures}\n\n${tests}\n`;
  return [{ path: `tests/test_${name}_invariants.py`, content }];
}

function generateJunit(spec: ParsedTlaSpec, name: string): FixtureFile[] {
  const className = name + 'InvariantTest';
  const fields = spec.variables.map(v => `    // LLM_FILL: define ${v} fixture`).join('\n');
  const tests = spec.invariants.map(inv =>
    `    @Test\n    void ${inv.toLowerCase()}_holds() {\n        // LLM_FILL: assert invariant ${inv}\n    }`
  ).join('\n\n');

  const content = `import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ${className} {
${fields}

${tests}
}
`;
  return [{ path: `src/test/java/${className}.java`, content }];
}

function generateFastCheck(spec: ParsedTlaSpec, name: string): FixtureFile[] {
  const arbitraries = spec.variables.map(v => `  const ${v}Arb = fc.integer();  // LLM_FILL: refine`).join('\n');
  const props = spec.invariants.map(inv =>
    `describe('${inv}', () => {\n  it('holds under all transitions', () => {\n${arbitraries}\n\n    fc.assert(\n      fc.property(fc.tuple(/* LLM_FILL */), (${spec.variables.join(', ')}) => {\n        // LLM_FILL: check ${inv}\n        return true;\n      })\n    );\n  });\n});`
  ).join('\n\n');

  const content = `import * as fc from 'fast-check';\n\ndescribe('${name}', () => {\n\n${props}\n\n});\n`;
  return [{ path: `properties/${name}.property.ts`, content }];
}
```

- [ ] **步骤 4：运行测试确认通过**

运行：`npx tsx --test __tests__/fixture-gen/tla.test.ts`
预期：PASS

- [ ] **步骤 5：Commit**

```bash
git add scripts/lib/fixture-gen/tla.ts scripts/__tests__/fixture-gen/tla.test.ts
git commit -m "feat(fixture-gen): add TLA+ fixture generator

Parses .tla specs for variables/constants/invariants, generates
integration test skeletons for pytest/junit/fast-check.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 任务 4：Lean 4 Fixture 生成器

**文件：**
- 创建：`scripts/lib/fixture-gen/lean.ts`
- 创建：`scripts/__tests__/fixture-gen/lean.test.ts`

- [ ] **步骤 1：编写失败的测试**

```typescript
// scripts/__tests__/fixture-gen/lean.test.ts
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { generateLeanFixtures, parseLeanFile } from '../../lib/fixture-gen/lean.js';

const SAMPLE_LEAN = `import Mathlib

theorem add_zero (n : Nat) : n + 0 = n := by
  simp

theorem mul_one (n : Nat) : n * 1 = n := by
  ring
`;

describe('parseLeanFile', () => {
  it('extracts theorem names and type signatures', () => {
    const theorems = parseLeanFile(SAMPLE_LEAN);
    assert.equal(theorems.length, 2);
    assert.equal(theorems[0].name, 'add_zero');
    assert.ok(theorems[0].typeSignature.includes('Nat'));
    assert.equal(theorems[1].name, 'mul_one');
  });

  it('extracts imports', () => {
    const theorems = parseLeanFile(SAMPLE_LEAN);
    assert.ok(theorems[0].imports.includes('Mathlib'));
  });
});

describe('generateLeanFixtures', () => {
  it('generates pytest property tests', () => {
    const files = generateLeanFixtures(SAMPLE_LEAN, 'pytest');
    assert.ok(files.length > 0);
    const testFile = files.find(f => f.path.includes('test_'));
    assert.ok(testFile);
    assert.ok(testFile!.content.includes('def test_'));
    assert.ok(testFile!.content.includes('LLM_FILL'));
  });

  it('generates fast-check properties', () => {
    const files = generateLeanFixtures(SAMPLE_LEAN, 'fast-check');
    const propFile = files.find(f => f.path.includes('.property.'));
    assert.ok(propFile);
    assert.ok(propFile!.content.includes('fc.'));
  });

  it('generates junit property tests', () => {
    const files = generateLeanFixtures(SAMPLE_LEAN, 'junit');
    const testFile = files.find(f => f.path.includes('Test.java'));
    assert.ok(testFile);
    assert.ok(testFile!.content.includes('@Test'));
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：`npx tsx --test __tests__/fixture-gen/lean.test.ts`
预期：FAIL — module not found

- [ ] **步骤 3：实现 lean.ts**

```typescript
// scripts/lib/fixture-gen/lean.ts
/**
 * Lean 4 fixture generator.
 * Parses .lean files to extract theorems and type signatures,
 * and generates property-based test skeletons.
 */

import type { Framework, FixtureFile, ParsedTheorem } from './types.js';

/** Parse a Lean 4 file to extract theorems */
export function parseLeanFile(content: string): ParsedTheorem[] {
  const theorems: ParsedTheorem[] = [];
  const imports: string[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('import ')) {
      imports.push(trimmed.slice(7).trim());
    }
  }

  const theoremRegex = /^(?:private\s+|protected\s+)?theorem\s+(\w+)\s*(?:\([^)]*\)\s*)?:\s*(.+?)(?:\s*:=|$)/gm;
  let match: RegExpExecArray | null;
  while ((match = theoremRegex.exec(content)) !== null) {
    if (match[1] && match[2]) {
      theorems.push({
        name: match[1],
        typeSignature: match[2].trim(),
        imports: [...imports],
      });
    }
  }

  return theorems;
}

/** Generate fixture files for a given framework */
export function generateLeanFixtures(leanContent: string, framework: Framework): FixtureFile[] {
  const theorems = parseLeanFile(leanContent);
  const safeName = theorems[0]?.name
    ? theorems[0].name.replace(/[/\\?%*:|"<>]/g, '_')
    : 'lean_proof';

  switch (framework) {
    case 'pytest': return generatePytest(theorems, safeName);
    case 'junit': return generateJunit(theorems, safeName);
    case 'fast-check': return generateFastCheck(theorems, safeName);
    default: throw new Error(`Unsupported framework for Lean 4: ${framework}. Use pytest, junit, or fast-check.`);
  }
}

function generatePytest(theorems: ParsedTheorem[], name: string): FixtureFile[] {
  const tests = theorems.map(t => {
    const params = extractParams(t.typeSignature);
    const args = params.map(p => `    ${p} = 0  # LLM_FILL: generate valid input`).join('\n');
    return `def test_${t.name}():\n${args}\n    # LLM_FILL: verify ${t.name}\n    pass`;
  }).join('\n\n');

  const content = `"""${name} property tests — generated from Lean 4 proofs"""\n\n${tests}\n`;
  return [{ path: `tests/test_${name}_properties.py`, content }];
}

function generateJunit(theorems: ParsedTheorem[], name: string): FixtureFile[] {
  const className = name.charAt(0).toUpperCase() + name.slice(1) + 'PropertyTest';
  const tests = theorems.map(t =>
    `    @Test\n    void ${t.name}_holds() {\n        // LLM_FILL: verify ${t.name}\n    }`
  ).join('\n\n');

  const content = `import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ${className} {

${tests}

}
`;
  return [{ path: `src/test/java/${className}.java`, content }];
}

function generateFastCheck(theorems: ParsedTheorem[], name: string): FixtureFile[] {
  const props = theorems.map(t => {
    const params = extractParams(t.typeSignature);
    const arbitraries = params.map(p => `  const ${p}Arb = fc.integer();  // LLM_FILL: refine`).join('\n');
    return `describe('${t.name}', () => {
  it('property holds', () => {
${arbitraries}

    fc.assert(
      fc.property(fc.tuple(/* LLM_FILL */), (${params.join(', ')}) => {
        // LLM_FILL: check ${t.name}
        return true;
      })
    );
  });
});`;
  }).join('\n\n');

  const content = `import * as fc from 'fast-check';\n\ndescribe('${name}', () => {\n\n${props}\n\n});\n`;
  return [{ path: `properties/${name}.property.ts`, content }];
}

/** Extract parameter names from a Lean type signature like `(n : Nat) → n + 0 = n` */
function extractParams(sig: string): string[] {
  const params: string[] = [];
  const paramRegex = /\((\w+)\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = paramRegex.exec(sig)) !== null) {
    if (m[1]) params.push(m[1]);
  }
  return params;
}
```

- [ ] **步骤 4：运行测试确认通过**

运行：`npx tsx --test __tests__/fixture-gen/lean.test.ts`
预期：PASS

- [ ] **步骤 5：Commit**

```bash
git add scripts/lib/fixture-gen/lean.ts scripts/__tests__/fixture-gen/lean.test.ts
git commit -m "feat(fixture-gen): add Lean 4 fixture generator

Parses .lean files for theorem names and type signatures,
generates property-based test skeletons.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 任务 5：覆盖率报告

**文件：**
- 创建：`scripts/lib/fixture-gen/coverage.ts`
- 创建：`scripts/__tests__/fixture-coverage.test.ts`

- [ ] **步骤 1：编写失败的测试**

```typescript
// scripts/__tests__/fixture-coverage.test.ts
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { computeCoverage } from '../../lib/fixture-gen/coverage.js';

const TMP = path.join(os.tmpdir(), `srs-coverage-test-${Date.now()}`);

describe('computeCoverage', () => {
  it('returns zero coverage when no fixtures exist', () => {
    const workDir = path.join(TMP, 'empty');
    fs.mkdirSync(path.join(workDir, '4_bdd', 'features'), { recursive: true });
    fs.mkdirSync(workDir, { recursive: true });

    const report = computeCoverage(workDir);
    assert.equal(report.total_requirements, 0);
    assert.equal(report.coverage_pct, 100); // 0/0 = 100%
  });

  it('counts BDD fixtures correctly', () => {
    const workDir = path.join(TMP, 'bdd');
    const featDir = path.join(workDir, '4_bdd', 'features');
    const fixDir = path.join(workDir, 'test_fixtures', 'acceptance', 'cucumber');
    fs.mkdirSync(featDir, { recursive: true });
    fs.mkdirSync(fixDir, { recursive: true });

    // 2 scenarios in feature
    fs.writeFileSync(path.join(featDir, 'mod.feature'), `Feature: mod\n\n  Scenario: R1-REQ-0001: test\n    Given x\n    When y\n    Then z\n\n  Scenario: R1-REQ-0002: test2\n    Given x\n    When y\n    Then z\n`);

    // 1 fixture file (covers 2 scenarios approximately)
    fs.writeFileSync(path.join(fixDir, 'mod_steps.ts'), 'steps');

    const report = computeCoverage(workDir);
    assert.equal(report.total_requirements, 2);
    assert.ok(report.bdd_fixtures_generated > 0);
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：`npx tsx --test __tests__/fixture-coverage.test.ts`
预期：FAIL — module not found

- [ ] **步骤 3：实现 coverage.ts**

```typescript
// scripts/lib/fixture-gen/coverage.ts
/**
 * Coverage report generator.
 * Scans test_fixtures/ and compares against source产出 to compute coverage.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CoverageReport, MissingEntry } from './types.js';

/** Count Scenario lines in a .feature file */
function countScenarios(featurePath: string): number {
  try {
    const content = fs.readFileSync(featurePath, 'utf-8');
    return (content.match(/^\s{2}Scenario:/gm) ?? []).length;
  } catch {
    return 0;
  }
}

/** Count .tla files in a directory */
function countTlaFiles(dir: string): number {
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith('.tla')).length;
  } catch {
    return 0;
  }
}

/** Count .lean files in a directory */
function countLeanFiles(dir: string): number {
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith('.lean')).length;
  } catch {
    return 0;
  }
}

/** Check if any fixture files exist for a given level/framework */
function hasFixtures(fixturesDir: string, level: string, framework: string): boolean {
  const dir = path.join(fixturesDir, level, framework);
  try {
    const files = fs.readdirSync(dir);
    return files.length > 0;
  } catch {
    return false;
  }
}

/** Compute coverage report for a workdir */
export function computeCoverage(workDir: string): CoverageReport {
  const featDir = path.join(workDir, '4_bdd', 'features');
  const tlaDir = path.join(workDir, '5_formal', 'specs');
  const leanDir = path.join(workDir, '5_formal', 'proofs');
  const fixturesDir = path.join(workDir, 'test_fixtures');

  // Count BDD scenarios
  let totalRequirements = 0;
  if (fs.existsSync(featDir)) {
    const features = fs.readdirSync(featDir).filter(f => f.endsWith('.feature'));
    for (const f of features) {
      totalRequirements += countScenarios(path.join(featDir, f));
    }
  }

  // Count TLA+ and Lean sources
  const tlaCount = countTlaFiles(tlaDir);
  const leanCount = countLeanFiles(leanDir);
  totalRequirements += tlaCount + leanCount;

  // Count fixtures generated
  let bddFixtures = 0;
  let tlaFixtures = 0;
  let leanFixtures = 0;

  if (fs.existsSync(fixturesDir)) {
    const frameworks = ['cucumber', 'playwright', 'pytest', 'junit', 'fast-check'];
    for (const fw of frameworks) {
      if (hasFixtures(fixturesDir, 'acceptance', fw)) bddFixtures++;
      if (hasFixtures(fixturesDir, 'unit', fw)) bddFixtures++;
      if (hasFixtures(fixturesDir, 'integration', fw)) tlaFixtures++;
      if (hasFixtures(fixturesDir, 'property', fw)) leanFixtures++;
    }
  }

  const covered = bddFixtures + tlaFixtures + leanFixtures;
  const coveragePct = totalRequirements === 0 ? 100 : Math.round((covered / totalRequirements) * 100);

  const missing: MissingEntry[] = [];
  if (bddFixtures === 0 && totalRequirements > 0) {
    missing.push({ requirement: 'BDD', reason: 'no BDD fixtures generated' });
  }
  if (tlaCount > 0 && tlaFixtures === 0) {
    missing.push({ requirement: 'TLA+', reason: 'no TLA+ fixtures generated' });
  }
  if (leanCount > 0 && leanFixtures === 0) {
    missing.push({ requirement: 'Lean 4', reason: 'no Lean 4 fixtures generated' });
  }

  return {
    total_requirements: totalRequirements,
    bdd_fixtures_generated: bddFixtures,
    tla_fixtures_generated: tlaFixtures,
    lean_fixtures_generated: leanFixtures,
    coverage_pct: coveragePct,
    missing,
  };
}
```

- [ ] **步骤 4：运行测试确认通过**

运行：`npx tsx --test __tests__/fixture-coverage.test.ts`
预期：PASS

- [ ] **步骤 5：Commit**

```bash
git add scripts/lib/fixture-gen/coverage.ts scripts/__tests__/fixture-coverage.test.ts
git commit -m "feat(fixture-gen): add coverage report generator

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 任务 6：CLI 命令 `generate-test-fixtures`

**文件：**
- 创建：`scripts/commands/generate-test-fixtures.ts`
- 创建：`scripts/__tests__/generate-test-fixtures.test.ts`
- 修改：`scripts/index.ts:7-43`（USAGE）
- 修改：`scripts/index.ts:54-86`（COMMANDS）

- [ ] **步骤 1：编写失败的测试**

```typescript
// scripts/__tests__/generate-test-fixtures.test.ts
import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TMP = path.join(os.tmpdir(), `srs-fixtures-e2e-${Date.now()}`);

function createWorkDir(name: string): string {
  const workDir = path.join(TMP, name, '.srs_formalizer');
  fs.mkdirSync(path.join(workDir, '4_bdd', 'features'), { recursive: true });
  return workDir;
}

describe('generate-test-fixtures command', () => {
  before(() => { fs.mkdirSync(TMP, { recursive: true }); });
  after(() => { fs.rmSync(TMP, { recursive: true, force: true }); });

  it('generates cucumber fixtures from BDD features', async () => {
    const workDir = createWorkDir('cucumber');
    fs.writeFileSync(path.join(workDir, '4_bdd', 'features', 'mod.feature'),
      `Feature: mod\n\n  Scenario: R1-REQ-0001: test\n    Given user <id>\n    When action\n    Then result\n`);

    const { main } = await import('../commands/generate-test-fixtures.js');
    const result = await main(['--level', 'acceptance', '--framework', 'cucumber', '--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, unknown>;
    assert.equal((data as { files_created: number }).files_created, 3); // steps + world + fixtures
    assert.ok(fs.existsSync(path.join(workDir, 'test_fixtures', 'acceptance', 'cucumber', 'steps', 'mod_steps.ts')));
  });

  it('returns error for missing BDD features', async () => {
    const workDir = createWorkDir('no-features');

    const { main } = await import('../commands/generate-test-fixtures.js');
    const result = await main(['--level', 'acceptance', '--framework', 'cucumber', '--workdir', workDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('not found'));
  });

  it('rejects non-.srs_formalizer workdir', async () => {
    const badDir = path.join(TMP, 'bad');
    fs.mkdirSync(badDir, { recursive: true });

    const { main } = await import('../commands/generate-test-fixtures.js');
    const result = await main(['--level', 'acceptance', '--framework', 'cucumber', '--workdir', badDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('.srs_formalizer'));
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：`npx tsx --test __tests__/generate-test-fixtures.test.ts`
预期：FAIL — module not found

- [ ] **步骤 3：实现 generate-test-fixtures.ts**

```typescript
// scripts/commands/generate-test-fixtures.ts
/**
 * generate-test-fixtures — Generate test fixture skeletons from formal outputs.
 *
 * CLI: npx tsx index.ts generate-test-fixtures --level <level> --framework <fw> --workdir <dir>
 *
 * Reads BDD/TLA+/Lean outputs and generates framework-specific test skeletons
 * with LLM_FILL markers for semantic content.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliResult } from '../types/index.js';
import type { Framework, FixtureLevel, FixtureFile } from '../lib/fixture-gen/types.js';
import { safeParseArg, validateWorkDir, refuseDirectInvocation } from '../lib/cli.js';

const VALID_LEVELS: FixtureLevel[] = ['acceptance', 'integration', 'unit', 'property'];
const VALID_FRAMEWORKS: Framework[] = ['cucumber', 'playwright', 'pytest', 'junit', 'fast-check'];

const LEVEL_SOURCE_MAP: Record<FixtureLevel, 'bdd' | 'tla' | 'lean'> = {
  acceptance: 'bdd',
  integration: 'tla',
  unit: 'bdd',
  property: 'lean',
};

const FEATURE_DIR = '4_bdd/features';
const TLA_DIR = '5_formal/specs';
const LEAN_DIR = '5_formal/proofs';

function findFeatureFiles(workDir: string): string[] {
  const dir = path.join(workDir, FEATURE_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.feature')).sort()
    .map(f => path.join(dir, f));
}

function findTlaFiles(workDir: string): string[] {
  const dir = path.join(workDir, TLA_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.tla')).sort()
    .map(f => path.join(dir, f));
}

function findLeanFiles(workDir: string): string[] {
  const dir = path.join(workDir, LEAN_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.lean')).sort()
    .map(f => path.join(dir, f));
}

function writeFixtureFiles(outputDir: string, files: FixtureFile[]): void {
  for (const file of files) {
    const fullPath = path.join(outputDir, file.path);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, file.content, 'utf-8');
  }
}

export async function main(args: string[]): Promise<CliResult> {
  let levelArg: string | null;
  let frameworkArg: string | null;
  let workDirArg: string | null;
  let sourceArg: string | null;

  try {
    levelArg = safeParseArg(args, '--level');
    frameworkArg = safeParseArg(args, '--framework');
    workDirArg = safeParseArg(args, '--workdir');
    sourceArg = safeParseArg(args, '--source');
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  if (!levelArg) return { status: 'error', message: 'Missing required argument: --level' };
  if (!frameworkArg) return { status: 'error', message: 'Missing required argument: --framework' };
  if (!workDirArg) return { status: 'error', message: 'Missing required argument: --workdir' };

  if (!VALID_LEVELS.includes(levelArg as FixtureLevel)) {
    return { status: 'error', message: `Invalid --level: ${levelArg}. Must be one of: ${VALID_LEVELS.join(', ')}` };
  }
  if (!VALID_FRAMEWORKS.includes(frameworkArg as Framework)) {
    return { status: 'error', message: `Invalid --framework: ${frameworkArg}. Must be one of: ${VALID_FRAMEWORKS.join(', ')}` };
  }

  let workDir: string;
  try {
    workDir = validateWorkDir(workDirArg);
  } catch (err) {
    return { status: 'error', message: (err as Error).message };
  }

  const level = levelArg as FixtureLevel;
  const framework = frameworkArg as Framework;
  const source = (sourceArg as 'bdd' | 'tla' | 'lean' | null) ?? LEVEL_SOURCE_MAP[level];

  const outputDir = path.join(workDir, 'test_fixtures', level, framework);

  // Generate based on source type
  let allFiles: FixtureFile[] = [];
  let sourceFilesUsed: string[] = [];

  if (source === 'bdd') {
    const features = findFeatureFiles(workDir);
    if (features.length === 0) {
      return { status: 'error', message: `BDD features not found at ${FEATURE_DIR}/` };
    }
    const { generateBddFixtures } = await import('../lib/fixture-gen/bdd.js');
    for (const featPath of features) {
      const content = fs.readFileSync(featPath, 'utf-8');
      const moduleName = path.basename(featPath, '.feature');
      allFiles.push(...generateBddFixtures(content, moduleName, framework));
      sourceFilesUsed.push(featPath);
    }
  } else if (source === 'tla') {
    const tlaFiles = findTlaFiles(workDir);
    if (tlaFiles.length === 0) {
      return { status: 'error', message: `TLA+ specs not found at ${TLA_DIR}/` };
    }
    const { generateTlaFixtures } = await import('../lib/fixture-gen/tla.js');
    for (const tlaPath of tlaFiles) {
      const content = fs.readFileSync(tlaPath, 'utf-8');
      allFiles.push(...generateTlaFixtures(content, framework));
      sourceFilesUsed.push(tlaPath);
    }
  } else if (source === 'lean') {
    const leanFiles = findLeanFiles(workDir);
    if (leanFiles.length === 0) {
      return { status: 'error', message: `Lean 4 proofs not found at ${LEAN_DIR}/` };
    }
    const { generateLeanFixtures } = await import('../lib/fixture-gen/lean.js');
    for (const leanPath of leanFiles) {
      const content = fs.readFileSync(leanPath, 'utf-8');
      allFiles.push(...generateLeanFixtures(content, framework));
      sourceFilesUsed.push(leanPath);
    }
  }

  writeFixtureFiles(outputDir, allFiles);

  return {
    status: 'ok',
    data: {
      files_created: allFiles.length,
      output_dir: outputDir,
      source_files_used: sourceFilesUsed,
    },
  };
}

refuseDirectInvocation(import.meta.url);
```

- [ ] **步骤 4：运行测试确认通过**

运行：`npx tsx --test __tests__/generate-test-fixtures.test.ts`
预期：PASS

- [ ] **步骤 5：注册命令到 index.ts**

在 `scripts/index.ts` 的 USAGE 字符串中，`verify-skill-integrity` 行后添加：
```
  generate-test-fixtures  Generate test fixture skeletons from formal outputs
  fixture-coverage        Report test fixture coverage
```

在 COMMANDS 对象中，`compile:` 行后添加：
```typescript
"generate-test-fixtures": () => import("./commands/generate-test-fixtures.js"),
"fixture-coverage": () => import("./commands/fixture-coverage.js"),
```

- [ ] **步骤 6：验证 tsc 编译**

运行：`npx tsc --noEmit`
预期：0 errors

- [ ] **步骤 7：Commit**

```bash
git add scripts/commands/generate-test-fixtures.ts scripts/__tests__/generate-test-fixtures.test.ts scripts/index.ts
git commit -m "feat: register generate-test-fixtures and fixture-coverage commands

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 任务 7：CLI 命令 `fixture-coverage`

**文件：**
- 创建：`scripts/commands/fixture-coverage.ts`
- 修改：`scripts/__tests__/fixture-coverage.test.ts`（补充命令级测试）

- [ ] **步骤 1：编写失败的测试（命令级）**

在已有的 `scripts/__tests__/fixture-coverage.test.ts` 中追加：

```typescript
import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { computeCoverage } from '../../lib/fixture-gen/coverage.js';

const TMP = path.join(os.tmpdir(), `srs-coverage-test-${Date.now()}`);

describe('fixture-coverage command', () => {
  before(() => { fs.mkdirSync(TMP, { recursive: true }); });
  after(() => { fs.rmSync(TMP, { recursive: true, force: true }); });

  it('returns coverage report for workdir with fixtures', async () => {
    const workDir = path.join(TMP, 'cmd-test', '.srs_formalizer');
    const featDir = path.join(workDir, '4_bdd', 'features');
    const fixDir = path.join(workDir, 'test_fixtures', 'acceptance', 'cucumber');
    fs.mkdirSync(featDir, { recursive: true });
    fs.mkdirSync(fixDir, { recursive: true });
    fs.writeFileSync(path.join(featDir, 'mod.feature'),
      'Feature: mod\n\n  Scenario: R1-REQ-0001: test\n    Given x\n    When y\n    Then z\n');
    fs.writeFileSync(path.join(fixDir, 'mod_steps.ts'), 'steps');

    const { main } = await import('../commands/fixture-coverage.js');
    const result = await main(['--workdir', workDir]);

    assert.equal(result.status, 'ok');
    const data = result.data as Record<string, number>;
    assert.equal(data.total_requirements, 1);
    assert.ok(data.bdd_fixtures_generated > 0);
  });

  it('rejects non-.srs_formalizer workdir', async () => {
    const badDir = path.join(TMP, 'bad');
    fs.mkdirSync(badDir, { recursive: true });

    const { main } = await import('../commands/fixture-coverage.js');
    const result = await main(['--workdir', badDir]);

    assert.equal(result.status, 'error');
    assert.ok(result.message!.includes('.srs_formalizer'));
  });
});
```

- [ ] **步骤 2：运行测试确认失败**

运行：`npx tsx --test __tests__/fixture-coverage.test.ts`
预期：FAIL — module not found for command

- [ ] **步骤 3：实现 fixture-coverage.ts**

```typescript
// scripts/commands/fixture-coverage.ts
/**
 * fixture-coverage — Report test fixture coverage.
 *
 * CLI: npx tsx index.ts fixture-coverage --workdir <dir>
 *
 * Scans test_fixtures/ and compares against BDD/TLA+/Lean source outputs.
 */

import type { CliResult } from '../types/index.js';
import { safeParseArg, validateWorkDir, refuseDirectInvocation } from '../lib/cli.js';

export async function main(args: string[]): Promise<CliResult> {
  let workDirArg: string | null;
  try {
    workDirArg = safeParseArg(args, '--workdir');
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

  const { computeCoverage } = await import('../lib/fixture-gen/coverage.js');
  const report = computeCoverage(workDir);

  return { status: 'ok', data: report };
}

refuseDirectInvocation(import.meta.url);
```

- [ ] **步骤 4：运行测试确认通过**

运行：`npx tsx --test __tests__/fixture-coverage.test.ts`
预期：PASS

- [ ] **步骤 5：验证 tsc 编译**

运行：`npx tsc --noEmit`
预期：0 errors

- [ ] **步骤 6：Commit**

```bash
git add scripts/commands/fixture-coverage.ts scripts/__tests__/fixture-coverage.test.ts
git commit -m "feat: add fixture-coverage command

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 任务 8：全量验证 + 回归测试

- [ ] **步骤 1：运行全量 typecheck**

运行：`npx tsc --noEmit`
预期：0 errors

- [ ] **步骤 2：运行全量测试**

运行：`npx tsx --test __tests__/*.test.ts`
预期：所有测试通过（原有 320 + 新增 ~50 = ~370）

- [ ] **步骤 3：验证新文件 ≤300 行**

运行：`wc -l scripts/lib/fixture-gen/*.ts scripts/commands/generate-test-fixtures.ts scripts/commands/fixture-coverage.ts`
预期：所有文件 ≤300 行

- [ ] **步骤 4：最终 Commit**

```bash
git add -A
git commit -m "feat: V-Model test fixture generation (Issue #1)

Add generate-test-fixtures and fixture-coverage commands.
5 frameworks: Cucumber, Playwright, Pytest, JUnit, fast-check.
Sources: BDD (acceptance/unit), TLA+ (integration), Lean 4 (property).
TS structural extraction + LLM_FILL semantic markers.

Co-Authored-By: Claude <noreply@anthropic.com>"
```
