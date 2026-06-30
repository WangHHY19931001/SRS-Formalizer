# SRS-Formalizer S2 阶段实现计划

> 面向 AI 代理的工作者：使用 superpowers:subagent-driven-development 逐任务实现。步骤使用 `- [ ]` 语法跟踪进度。

**目标：** 实现 SRS-Formalizer 技能 S2 阶段——需求提取。含 2 个 TS 脚本（inject-prompt、validate-jsonl）+ 7 个 LLM 子代理提示词（3 执行者 + 3 校验者 + 1 编排者）。

**架构：** V 模型——TS 脚本测试先行（L4→L3→L2），全部 RED 后编码 GREEN。提示词采用行为基线法（无提示词 vs 有提示词的 LLM 输出差异验证）。TS 脚本纯确定性，提示词通过交接契约约束子代理。

**技术栈：** TypeScript 5.5+（strict）、Node.js ≥20（`node --test`）、零外部 npm 依赖

---

## S2 与 S1 的关键差异

| 维度 | S1 | S2 |
|------|-----|-----|
| 脚本类型 | 文件系统操作 + 文本处理 | 模板注入防护 + JSONL 格式校验 |
| 测试方式 | 纯 `node --test` | TS 脚本：`node --test`；提示词：行为基线法 |
| 复杂度 | 文件 I/O 为主 | 模板注入防护是关键安全点 |
| 新增提示词 | 1 个（编排者） | 7 个（含子代理交接契约） |

## 提示词测试方法论（行为基线法）

LLM 子代理提示词无法用 `node --test` 验证。采用行为基线法：

```
Step A: 无提示词 → 给 LLM 任务 → 收集输出（BASELINE: 无提示词时的基线行为）
Step B: 有提示词 → 给 LLM 相同任务 → 收集输出
Step C: 对比 A vs B → 提示词是否改变了 LLM 的行为方向？
```

**通过标准：**
- 有提示词时输出必须包含 `id` 字段匹配 `R[123]-[A-Za-z0-9_.]+-\d{4}` 格式
- 有提示词时 `category` 必须在允许枚举内
- 有提示词时输出为合法 JSONL（每行一条 JSON）
- 无提示词时输出格式自由（基线对比用）

---

## 任务顺序（V 模型）

```
Phase A:  [任务 1-2]   最小基础设施（jsonl.ts 扩展）
Phase A.5:[任务 3-4]   ⭐ 测试正确性设计（可追溯矩阵 + 行为基线设计）
Phase B:  [任务 5-9]   ⭐ 全部测试先行（L4→L3→L2 TS测试 + 提示词行为基线）
Phase C:  [任务 10]    两阶段确认（TS RED + 提示词基线记录）
Phase D:  [任务 11-16] 提示词编写（全部 7 个提示词）
Phase E:  [任务 17-18] TS 编码（TDD GREEN）
Phase F:  [任务 19]    编排者提示词
Phase G:  [任务 20]    逐级回归校验 → S2 完成
```

---

## Phase A：最小基础设施

### 任务 1：扩展 jsonl.ts 添加 validateJsonlRecord 函数

**文件：**
- 修改：`.claude/skills/srs-formalizer/scripts/lib/jsonl.ts`

**说明：** validate-jsonl.ts 需要共享的校验逻辑。先在 jsonl.ts 中添加 `validateJsonlRecord` 函数。

- [ ] **步骤 1：在 jsonl.ts 末尾追加校验函数**

```typescript
/**
 * 校验单条 JSONL 记录。返回错误数组，空数组表示通过。
 */
export function validateJsonlRecord(
  record: JsonlRecord,
  index: number
): string[] {
  const errors: string[] = [];
  const prefix = `record[${index}]`;

  // ① 必填字段存在
  if (!record.id) errors.push(`${prefix}: missing required field "id"`);
  if (!record.statement) errors.push(`${prefix}: missing required field "statement"`);
  if (!record.source_file) errors.push(`${prefix}: missing required field "source_file"`);

  // ② id 格式: R[123]-[A-Za-z0-9_.]+-\d{4}
  if (record.id && !/^R[123]-[A-Za-z0-9_.]+-\d{4}$/.test(record.id)) {
    errors.push(`${prefix}: invalid id format "${record.id}", expected R[123]-[A-Za-z0-9_.]+-NNNN`);
  }

  // ③ category 枚举
  const validCategories = ['explicit', 'implicit', 'relational'];
  if (record.category && !validCategories.includes(record.category)) {
    errors.push(`${prefix}: invalid category "${record.category}", must be one of: ${validCategories.join(', ')}`);
  }

  // ④ 空 statement
  if (record.statement && record.statement.trim() === '') {
    errors.push(`${prefix}: statement is empty`);
  }

  // ⑤ confidence 枚举
  const validConfidences = ['high', 'medium', 'low'];
  if (record.confidence && !validConfidences.includes(record.confidence)) {
    errors.push(`${prefix}: invalid confidence "${record.confidence}"`);
  }

  return errors;
}
```

- [ ] **步骤 2：验证 tsc + 现有测试无回归**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsc --noEmit && node --test
```

预期：25/25 PASS，零 tsc 错误。

- [ ] **步骤 3：Commit**

```bash
git add .claude/skills/srs-formalizer/scripts/lib/jsonl.ts
git commit -m "feat(s2): add validateJsonlRecord function to jsonl lib"
```

---

### 任务 2：创建 S2 提示词目录 + 测试夹具目录

- [ ] **步骤 1：创建目录**

```bash
mkdir -p .claude/skills/srs-formalizer/tests/fixtures/s2-shards
```

说明：S2 测试需要模拟 S1 的分片输出作为输入物料。

- [ ] **步骤 2：创建 S2 测试分片夹具**

```bash
cat > .claude/skills/srs-formalizer/tests/fixtures/s2-shards/user_module_S1.md << 'EOF'
### §3.1.1 用户注册

系统应支持手机号注册和邮箱注册两种方式。

### §3.1.2 用户登录

系统应支持密码登录和短信验证码登录。
EOF

cat > .claude/skills/srs-formalizer/tests/fixtures/s2-shards/order_module_S1.md << 'EOF'
### §3.2.1 创建订单

用户选择商品后可创建订单，系统应锁定库存。

### §3.2.2 支付订单

系统应支持微信支付和支付宝支付。
EOF
```

- [ ] **步骤 3：Commit**

```bash
git add .claude/skills/srs-formalizer/tests/fixtures/s2-shards/
git commit -m "chore(s2): add S2 shard fixtures and directory structure"
```

---

## Phase A.5：测试正确性设计

### 任务 3：S2 测试可追溯矩阵

**文件：**
- 创建：`.claude/skills/srs-formalizer/tests/traceability-s2.md`

- [ ] **步骤 1：编写 S2 可追溯矩阵**

```markdown
# 测试可追溯矩阵 — S2 阶段

## TS 脚本测试

### inject-prompt.ts 测试（L2：__tests__/inject-prompt.test.ts）

| 测试用例 | SRS 来源 | 验证类型 | 预期 RED 原因 |
|---------|---------|---------|-------------|
| replaces {{PARAM}} placeholders with values | §5.3 处理逻辑 | 确定性保证 | Cannot find module |
| escapes user-input {{ and }} to prevent injection | §5.3 模板注入防护 | 安全校验 | 同上 |
| rejects template path outside prompts/ directory | §5.3 路径校验（白名单） | 输入校验 | 同上 |
| handles missing --template argument | §5.3 输入规格 | 输入校验 | 同上 |
| handles missing --params argument | §5.3 输入规格 | 输入校验 | 同上 |
| returns prompt text on stdout (no file written) | §5.3 输出 | 确定性保证 | 同上 |

### validate-jsonl.ts 测试（L2：__tests__/validate-jsonl.test.ts）

| 测试用例 | SRS 来源 | 验证类型 | 预期 RED 原因 |
|---------|---------|---------|-------------|
| validates correct JSONL as valid | §5.4 检查项① | 确定性保证 | Cannot find module |
| rejects invalid JSON lines | §5.4 检查项① | 错误处理 | 同上 |
| rejects records with missing required fields | §5.4 检查项② | 输入校验 | 同上 |
| rejects invalid id format | §5.4 检查项③ | 输入校验 | 同上 |
| rejects invalid category enum | §5.4 检查项④ | 输入校验 | 同上 |
| rejects empty statement | §5.4 检查项⑤ | 输入校验 | 同上 |
| detects duplicate ids | §5.4 检查项⑥ | 错误处理 | 同上 |
| rejects file path outside .srs_formalizer | §5.4 路径校验 | 输入校验 | 同上 |
| returns valid JSON with errors/warnings/record_count | §5.4 输出格式 | 确定性保证 | 同上 |

## 提示词行为基线测试

### executor-R1.md 基线

| 测试场景 | 无提示词预期 | 有提示词预期 |
|---------|------------|------------|
| 给定分片文本，提取显式需求 | 自由格式文本 | JSONL，每行含 id/category/statement/source_file/confidence |
| 空分片输入 | 可能返回空或报错 | 返回空 JSONL 或含 warning 的 {"valid":false} |

### executor-R2.md 基线

| 测试场景 | 无提示词预期 | 有提示词预期 |
|---------|------------|------------|
| 给定显式需求列表，推导隐式需求 | 自由格式 | JSONL，category=implicit，含 DERIVED_FROM 引用 |

### verifier-R1.md 基线

| 测试场景 | 无提示词预期 | 有提示词预期 |
|---------|------------|------------|
| 审查 executor-R1 输出，检测编造和遗漏 | 自由格式评论 | 结构化 REJECTED/APPROVED + 具体问题列表 |
```

- [ ] **步骤 2：Commit**

```bash
git add .claude/skills/srs-formalizer/tests/traceability-s2.md
git commit -m "docs(s2): add S2 test traceability matrix"
```

---

### 任务 4：提示词行为基线设计（BASELINE-S2.md）

**文件：**
- 创建：`.claude/skills/srs-formalizer/tests/BASELINE-S2.md`

- [ ] **步骤 1：编写 S2 行为基线规格**

```markdown
# S2 提示词行为基线

## 方法论

每个执行者/校验者提示词的验证分三步：

1. **无提示词基线**：给 LLM 子代理原始任务，不提供任何提示词模板，收集输出。
2. **有提示词**：通过 inject-prompt.ts 填充模板后提供给 LLM 子代理，收集输出。
3. **对比**：验证有提示词输出满足 JSONL 格式、枚举约束、交接契约。

## executor-R1 基线

### 输入材料
文件：tests/fixtures/s2-shards/user_module_S1.md

### 无提示词任务
"从以下文本中提取所有显式功能需求：<分片内容>"

### 有提示词任务
通过 inject-prompt.ts --template prompts/executor-R1.md --params '{"shard_content":"<分片>","shard_id":"user_module"}'

### 基线通过条件
- [ ] 有提示词输出每行为合法 JSON
- [ ] 每条含 id（格式 R1-<module>-\d{4}）
- [ ] 每条 category = "explicit"
- [ ] 每条 statement 非空
- [ ] 每条 source_file 指向分片文件
- [ ] 每条 confidence 为 high/medium/low

## executor-R2 基线

### 通过条件
- [ ] category = "implicit"
- [ ] 每条含 DERIVED_FROM 引用（指向 R1 记录 id）

## executor-R3 基线

### 通过条件
- [ ] category = "relational"
- [ ] 识别 DEPENDS_ON / REFINES / CONFLICTS_WITH 关系

## verifier-R1/R2/R3 基线

### 通过条件
- [ ] 输出含 APPROVED 或 REJECTED
- [ ] REJECTED 时含具体问题列表
- [ ] 检测到编造（hallucination）时明确标注
```

- [ ] **步骤 2：Commit**

```bash
git add .claude/skills/srs-formalizer/tests/BASELINE-S2.md
git commit -m "docs(s2): add S2 prompt behavior baseline specification"
```

---

## Phase B：全部测试先行

### 任务 5：L4 验收用例 — S2 端到端

**文件：**
- 创建：`.claude/skills/srs-formalizer/tests/golden/s2-extraction.md`

- [ ] **步骤 1：编写 S2 验收用例**

````markdown
# L4 验收用例：S2 需求提取

## 场景 1：中文分片 → R1 显式需求提取

### 前置条件
S1 已完成，`.srs_formalizer/shard/` 下有分片文件。

### 执行
1. `inject-prompt --template prompts/executor-R1.md --params '{"shard_content":"...","shard_id":"user_module"}'`
2. LLM 子代理执行 executor-R1 提示词
3. 子代理输出写入 `.srs_formalizer/r1-explicit/user_module.jsonl`
4. `validate-jsonl --file .srs_formalizer/r1-explicit/user_module.jsonl`

### 验收断言
| # | 断言 | 条件 |
|---|------|------|
| A1 | validate-jsonl 返回 valid=true | 无格式错误 |
| A2 | record_count >= 2 | 用户模块至少 2 条需求（注册+登录） |
| A3 | 每条 id 匹配 R1-user_module-0001 格式 | — |
| A4 | 每条 category = "explicit" | — |
| A5 | 无重复 id | — |
| A6 | 每条 statement 非空且原文可追溯到分片 | — |

## 场景 2：R2 隐式需求推导

### 验收断言
| A7 | category = "implicit" | — |
| A8 | 每条含 metadata.derived_from | 指向 R1 记录 id |

## 场景 3：R3 关系需求推导

### 验收断言
| A9 | category = "relational" | — |
| A10 | 含 DEPENDS_ON 或 REFINES 关系 | — |

## 场景 4：校验者拒绝编造数据

### 执行
给 executor-R1 分片中不存在的需求描述。校验者应 REJECTED。

### 验收断言
| A11 | verifier 输出含 REJECTED | — |
| A12 | verifier 列出具体编造项 | — |

## 场景 5：模板注入防护

### 执行
inject-prompt --params '{"shard_content":"用户输入 {{malicious}} 内容"}'
### 验收断言
| A13 | 输出中 {{malicious}} 保持原样（未展开） | — |
| A14 | 输出中原有的 {{PARAM}} 正确替换 | — |
````

- [ ] **步骤 2：Commit**

```bash
git add .claude/skills/srs-formalizer/tests/golden/s2-extraction.md
git commit -m "test(s2): add L4 acceptance test cases (5 scenarios, 14 assertions)"
```

---

### 任务 6：L3 集成断言 — S2 eval-spec 扩展

**文件：**
- 修改：`.claude/skills/srs-formalizer/tests/assertions/eval-spec.yaml`
- 新增 S2 测试用例

- [ ] **步骤 1：在 eval-spec.yaml 末尾追加 S2 用例**

```yaml
  # === S2 tests ===
  - id: s2_inject_basic
    description: "inject-prompt replaces placeholders correctly"
    command: "npx tsx index.ts inject-prompt --template prompts/executor-R1.md --params '{\"shard_content\":\"test\",\"shard_id\":\"S001\"}'"
    assert:
      - status: ok
      - stdout_not_empty: true
      - stdout_not_contains: "{{shard_content}}"
      - stdout_not_contains: "{{shard_id}}"

  - id: s2_inject_injection_protection
    description: "inject-prompt escapes user {{ }} in input"
    command: "npx tsx index.ts inject-prompt --template prompts/executor-R1.md --params '{\"shard_content\":\"{{malicious}}\",\"shard_id\":\"S001\"}'"
    assert:
      - status: ok
      - stdout_contains: "{{malicious}}"

  - id: s2_inject_reject_bad_template
    description: "inject-prompt rejects template outside prompts/"
    command: "npx tsx index.ts inject-prompt --template /etc/passwd --params '{}'"
    assert:
      - status: error

  - id: s2_validate_valid_jsonl
    description: "validate-jsonl accepts valid records"
    command: "npx tsx index.ts validate-jsonl --file .srs_formalizer/r1-explicit/valid.jsonl"
    assert:
      - valid: true
      - record_count: 2

  - id: s2_validate_bad_id_format
    description: "validate-jsonl rejects invalid id format"
    command: "npx tsx index.ts validate-jsonl --file .srs_formalizer/r1-explicit/bad_id.jsonl"
    assert:
      - valid: false
      - errors_count_gte: 1

  - id: s2_validate_duplicate_ids
    description: "validate-jsonl detects duplicate ids"
    command: "npx tsx index.ts validate-jsonl --file .srs_formalizer/r1-explicit/dupes.jsonl"
    assert:
      - valid: false
      - errors_contain: "duplicate"

  - id: s2_validate_reject_bad_path
    description: "validate-jsonl rejects path outside workdir"
    command: "npx tsx index.ts validate-jsonl --file /tmp/outside.jsonl"
    assert:
      - status: error

negative_controls:
  # === S1 negative controls (unchanged) ===
  - id: nc_init_no_output_arg
    # ... existing ...

  # === S2 negative controls ===
  - id: nc_inject_no_template
    description: "inject-prompt without --template"
    command: "npx tsx index.ts inject-prompt --params '{}'"
    assert:
      - status: error

  - id: nc_validate_no_file
    description: "validate-jsonl without --file"
    command: "npx tsx index.ts validate-jsonl"
    assert:
      - status: error
```

- [ ] **步骤 2：Commit**

```bash
git add .claude/skills/srs-formalizer/tests/assertions/eval-spec.yaml
git commit -m "test(s2): add S2 integration assertions to eval-spec.yaml"
```

---

### 任务 7：L2 模块测试 — inject-prompt.test.ts

**文件：**
- 创建：`.claude/skills/srs-formalizer/scripts/__tests__/inject-prompt.test.ts`

- [ ] **步骤 1：创建测试（6 个用例）**

```typescript
import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TMP = path.join(os.tmpdir(), `srs-formalizer-inject-test-${Date.now()}`);

describe('inject-prompt command', () => {
  before(() => {
    fs.mkdirSync(TMP, { recursive: true });
    // Create a minimal test template
    const templateDir = path.join(TMP, 'prompts');
    fs.mkdirSync(templateDir, { recursive: true });
    fs.writeFileSync(
      path.join(templateDir, 'test-template.md'),
      'Shard: {{SHARD_ID}}\nContent:\n{{SHARD_CONTENT}}\nLang: {{LANG}}',
      'utf-8'
    );
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  it('replaces all {{PARAM}} placeholders', async () => {
    const { main } = await import('../commands/inject-prompt.js');
    const result = await main([
      '--template', path.join(TMP, 'prompts', 'test-template.md'),
      '--params', JSON.stringify({ SHARD_ID: 'S001', SHARD_CONTENT: 'hello world', LANG: 'zh' }),
    ]);
    assert.equal(result.status, 'ok');
    const output = result.data as string;
    assert.ok(output.includes('Shard: S001'));
    assert.ok(output.includes('Content:\nhello world'));
    assert.ok(output.includes('Lang: zh'));
    assert.ok(!output.includes('{{SHARD_ID}}'));
    assert.ok(!output.includes('{{SHARD_CONTENT}}'));
  });

  it('escapes user {{ and }} in param values to prevent injection', async () => {
    const { main } = await import('../commands/inject-prompt.js');
    const result = await main([
      '--template', path.join(TMP, 'prompts', 'test-template.md'),
      '--params', JSON.stringify({ SHARD_ID: 'S001', SHARD_CONTENT: '{{evil}}', LANG: 'zh' }),
    ]);
    assert.equal(result.status, 'ok');
    const output = result.data as string;
    // {{evil}} should remain literal, not be treated as a placeholder
    assert.ok(output.includes('{{evil}}'));
  });

  it('rejects template path outside prompts/ directory', async () => {
    const { main } = await import('../commands/inject-prompt.js');
    const result = await main([
      '--template', '/etc/passwd',
      '--params', '{}',
    ]);
    assert.equal(result.status, 'error');
  });

  it('handles missing --template argument', async () => {
    const { main } = await import('../commands/inject-prompt.js');
    const result = await main(['--params', '{}']);
    assert.equal(result.status, 'error');
  });

  it('handles missing --params argument', async () => {
    const { main } = await import('../commands/inject-prompt.js');
    const result = await main(['--template', path.join(TMP, 'prompts', 'test-template.md')]);
    assert.equal(result.status, 'error');
  });

  it('handles invalid JSON in --params', async () => {
    const { main } = await import('../commands/inject-prompt.js');
    const result = await main([
      '--template', path.join(TMP, 'prompts', 'test-template.md'),
      '--params', '{not valid json',
    ]);
    assert.equal(result.status, 'error');
  });
});
```

- [ ] **步骤 2：验证 tsc（预期：模块未找到错误 + inject-prompt 测试的 import 错误）**

- [ ] **步骤 3：Commit**

```bash
git add .claude/skills/srs-formalizer/scripts/__tests__/inject-prompt.test.ts
git commit -m "test(s2): add inject-prompt module tests (6 cases, RED pending impl)"
```

---

### 任务 8：L2 模块测试 — validate-jsonl.test.ts

**文件：**
- 创建：`.claude/skills/srs-formalizer/scripts/__tests__/validate-jsonl.test.ts`

- [ ] **步骤 1：创建测试（10 个用例）**

```typescript
import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TMP = path.join(os.tmpdir(), `srs-formalizer-validate-test-${Date.now()}`);
const WORKDIR = path.join(TMP, '.srs_formalizer');

describe('validate-jsonl command', () => {
  before(() => {
    fs.mkdirSync(path.join(WORKDIR, 'r1-explicit'), { recursive: true });
    fs.mkdirSync(path.join(WORKDIR, 'r2-implicit'), { recursive: true });
    fs.mkdirSync(path.join(WORKDIR, 'r3-relational'), { recursive: true });
  });

  after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  function writeJsonl(fileName: string, lines: string[]) {
    const filePath = path.join(WORKDIR, fileName);
    fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
    return filePath;
  }

  it('validates correct JSONL as valid', async () => {
    const filePath = writeJsonl('r1-explicit/valid.jsonl', [
      '{"id":"R1-S001-0001","category":"explicit","statement":"系统应支持注册","source_file":"s1.md","confidence":"high"}',
      '{"id":"R1-S001-0002","category":"explicit","statement":"系统应支持登录","source_file":"s1.md","confidence":"medium"}',
    ]);
    const { main } = await import('../commands/validate-jsonl.js');
    const result = await main(['--file', filePath, '--workdir', WORKDIR]);
    assert.equal(result.status, 'ok');
    assert.equal(result.data.valid, true);
    assert.equal(result.data.record_count, 2);
  });

  it('rejects invalid JSON lines', async () => {
    const filePath = writeJsonl('r1-explicit/bad.jsonl', [
      '{"id":"R1-S001-0001","category":"explicit","statement":"ok","source_file":"s1.md","confidence":"high"}',
      '{this is not json}',
    ]);
    const { main } = await import('../commands/validate-jsonl.js');
    const result = await main(['--file', filePath, '--workdir', WORKDIR]);
    assert.equal(result.status, 'ok');
    assert.equal(result.data.valid, false);
    assert.ok(result.data.errors.length > 0);
  });

  it('rejects records with missing required fields', async () => {
    const filePath = writeJsonl('r1-explicit/missing.jsonl', [
      '{"id":"R1-S001-0001","category":"explicit","source_file":"s1.md","confidence":"high"}',
    ]);
    const { main } = await import('../commands/validate-jsonl.js');
    const result = await main(['--file', filePath, '--workdir', WORKDIR]);
    assert.equal(result.data.valid, false);
    assert.ok(result.data.errors.some((e: string) => e.includes('statement')));
  });

  it('rejects invalid id format', async () => {
    const filePath = writeJsonl('r1-explicit/bad_id.jsonl', [
      '{"id":"bad-format","category":"explicit","statement":"test","source_file":"s1.md","confidence":"high"}',
    ]);
    const { main } = await import('../commands/validate-jsonl.js');
    const result = await main(['--file', filePath, '--workdir', WORKDIR]);
    assert.equal(result.data.valid, false);
    assert.ok(result.data.errors.some((e: string) => e.includes('id format')));
  });

  it('rejects invalid category enum', async () => {
    const filePath = writeJsonl('r1-explicit/bad_cat.jsonl', [
      '{"id":"R1-S001-0001","category":"unknown_type","statement":"test","source_file":"s1.md","confidence":"high"}',
    ]);
    const { main } = await import('../commands/validate-jsonl.js');
    const result = await main(['--file', filePath, '--workdir', WORKDIR]);
    assert.equal(result.data.valid, false);
  });

  it('rejects empty statement', async () => {
    const filePath = writeJsonl('r1-explicit/empty_stmt.jsonl', [
      '{"id":"R1-S001-0001","category":"explicit","statement":"  ","source_file":"s1.md","confidence":"high"}',
    ]);
    const { main } = await import('../commands/validate-jsonl.js');
    const result = await main(['--file', filePath, '--workdir', WORKDIR]);
    assert.equal(result.data.valid, false);
  });

  it('detects duplicate ids', async () => {
    const filePath = writeJsonl('r1-explicit/dupes.jsonl', [
      '{"id":"R1-S001-0001","category":"explicit","statement":"first","source_file":"s1.md","confidence":"high"}',
      '{"id":"R1-S001-0001","category":"explicit","statement":"second","source_file":"s2.md","confidence":"high"}',
    ]);
    const { main } = await import('../commands/validate-jsonl.js');
    const result = await main(['--file', filePath, '--workdir', WORKDIR]);
    assert.equal(result.data.valid, false);
  });

  it('rejects file path outside .srs_formalizer', async () => {
    const { main } = await import('../commands/validate-jsonl.js');
    const result = await main(['--file', '/tmp/outside.jsonl', '--workdir', WORKDIR]);
    assert.equal(result.status, 'error');
  });

  it('returns structured JSON output with errors/warnings/record_count', async () => {
    const filePath = writeJsonl('r1-explicit/mixed.jsonl', [
      '{"id":"R1-S001-0001","category":"explicit","statement":"valid","source_file":"s1.md","confidence":"high"}',
      '{"id":"bad-id","category":"explicit","statement":"bad id","source_file":"s1.md","confidence":"high"}',
    ]);
    const { main } = await import('../commands/validate-jsonl.js');
    const result = await main(['--file', filePath, '--workdir', WORKDIR]);
    assert.equal(result.status, 'ok');
    assert.equal(typeof result.data.valid, 'boolean');
    assert.ok(Array.isArray(result.data.errors));
    assert.ok(Array.isArray(result.data.warnings));
    assert.equal(typeof result.data.record_count, 'number');
    assert.equal(result.data.record_count, 2);
  });

  it('handles missing --file argument', async () => {
    const { main } = await import('../commands/validate-jsonl.js');
    const result = await main(['--workdir', WORKDIR]);
    assert.equal(result.status, 'error');
  });
});
```

- [ ] **步骤 2：验证 tsc（预期：模块未找到）**

- [ ] **步骤 3：Commit**

```bash
git add .claude/skills/srs-formalizer/scripts/__tests__/validate-jsonl.test.ts
git commit -m "test(s2): add validate-jsonl module tests (10 cases, RED pending impl)"
```

---

### 任务 9：提示词行为基线收集（无提示词 → LLM 裸输出）

**说明：** 这是提示词独有的测试步骤。在编写提示词之前，先收集 LLM 在没有任何提示词指导下的"裸输出"，作为行为基线。

**文件：**
- 更新：`.claude/skills/srs-formalizer/tests/BASELINE-S2.md`

- [ ] **步骤 1：运行无提示词基线测试（针对 executor-R1）**

给一个通用 LLM 子代理以下任务（不带任何 srs-formalizer 提示词）：

```
从以下文本中提取所有显式功能需求，以 JSONL 格式输出：

### §3.1.1 用户注册
系统应支持手机号注册和邮箱注册两种方式。

### §3.1.2 用户登录
系统应支持密码登录和短信验证码登录。
```

- [ ] **步骤 2：记录无提示词输出到 BASELINE-S2.md**

```markdown
### executor-R1 无提示词基线

**输入：** 用户模块分片（注册 + 登录）
**输出（摘要）：** [粘贴 LLM 实际输出]
**观察：**
- id 格式：___
- category 字段：___
- JSONL 合法性：___
- 编造内容：___
```

- [ ] **步骤 3：Commit 基线记录**

```bash
git add .claude/skills/srs-formalizer/tests/BASELINE-S2.md
git commit -m "test(s2): collect executor-R1 no-prompt baseline"
```

---

## Phase C：两阶段确认

### 任务 10：TS RED 确认 + 提示词基线确认

- [ ] **步骤 1：运行全部 TS 测试**

```bash
cd .claude/skills/srs-formalizer/scripts && node --test 2>&1
```

预期：S1 的 25 测试继续 PASS；S2 的 inject-prompt(6) + validate-jsonl(10) = 16 测试全部 FAIL（模块未找到）。

- [ ] **步骤 2：确认 RED 原因匹配**

| 文件 | 预期 RED | 实际 |
|------|---------|------|
| inject-prompt.test.ts (6) | Cannot find module | — |
| validate-jsonl.test.ts (10) | Cannot find module | — |

- [ ] **步骤 3：确认提示词基线已记录**

- [ ] **步骤 4：Commit**

```bash
git add .claude/skills/srs-formalizer/tests/BASELINE-S2.md
git commit -m "test(s2): two-stage confirmation — TS tests RED, prompt baseline recorded"
```

---

## Phase D：提示词编写

### 任务 11：executor-R1.md — 显式需求提取

**文件：**
- 创建：`.claude/skills/srs-formalizer/prompts/executor-R1.md`

- [ ] **步骤 1：编写 executor-R1 提示词**

```markdown
# 执行者-R1：显式需求提取

## 角色
你是需求提取执行者。从 SRS 分片中提取所有**显式声明**的功能需求。

## 输入
分片内容：
```
{{SHARD_CONTENT}}
```

分片 ID：{{SHARD_ID}}

## 输出要求

以 JSONL 格式输出（每行一条 JSON 记录）：

{"id": "R1-{{SHARD_ID}}-NNNN", "category": "explicit", "statement": "<原文需求描述>", "source_file": "{{SHARD_ID}}_S1.md", "confidence": "high|medium|low"}

## 规则

1. **id 格式**：`R1-<shard_id>-<4位序号>`，如 `R1-user_module-0001`
2. **category**：全部为 `explicit`
3. **statement**：直接引用 SRS 原文或最小改写，保持原意
4. **source_file**：使用分片 ID + `_S1.md` 后缀
5. **confidence**：
   - `high`：需求陈述明确无歧义
   - `medium`：需求存在但措辞模糊
   - `low`：需求隐含在上下文中
6. **只提取功能需求**：忽略说明性文字、示例、注释
7. **禁止编造**：不得添加 SRS 中不存在的需求

## 文件操作约束

输出必须写入 `.srs_formalizer/r1-explicit/{{SHARD_ID}}.jsonl`。
不得访问工作目录外的任何路径。
```

- [ ] **步骤 2：Commit**

```bash
git add .claude/skills/srs-formalizer/prompts/executor-R1.md
git commit -m "feat(s2): add executor-R1 prompt for explicit requirement extraction"
```

---

### 任务 12：executor-R2.md — 隐式需求推导

**文件：**
- 创建：`.claude/skills/srs-formalizer/prompts/executor-R2.md`

- [ ] **步骤 1：编写 executor-R2 提示词**

```markdown
# 执行者-R2：隐式需求推导

## 角色
从显式需求中推导**隐式需求**——SRS 未明确声明但实现必须满足的约束、前提条件和副作用。

## 输入

显式需求列表（R1 输出）：
```
{{R1_OUTPUT}}
```

分片上下文：
```
{{SHARD_CONTENT}}
```

## 输出格式

{"id": "R2-<source>-\d{4}", "category": "implicit", "statement": "<推导的需求>", "source_file": "<分片>", "confidence": "high|medium|low", "metadata": {"derived_from": "R1-xxx-0001"}}

## 推导规则

1. **安全约束**：如"系统应支持登录" → 隐式需求"系统应防止暴力破解"
2. **数据完整性**：如"系统应存储用户信息" → 隐式需求"系统应加密敏感字段"
3. **用户体验**：如"系统应发送通知" → 隐式需求"通知应有失败重试机制"
4. **禁止编造**：推导必须有明确的逻辑链条，标注 derived_from

## 文件操作约束
输出写入 `.srs_formalizer/r2-implicit/{{SOURCE_ID}}.jsonl`。
```

- [ ] **步骤 2：Commit**

---

### 任务 13：executor-R3.md — 关系需求推导

**文件：**
- 创建：`.claude/skills/srs-formalizer/prompts/executor-R3.md`

- [ ] **步骤 1：编写 executor-R3 提示词**

```markdown
# 执行者-R3：关系需求推导

## 角色
推导需求之间的**关系**：依赖（DEPENDS_ON）、细化（REFINES）、冲突（CONFLICTS_WITH）。

## 输入

全部需求列表（R1 + R2）：
```
{{ALL_REQUIREMENTS}}
```

## 输出格式

{"id": "R3-<source>-\d{4}", "category": "relational", "statement": "<关系描述>", "source_file": "<分片>", "confidence": "high|medium|low", "metadata": {"relation": "DEPENDS_ON|REFINES|CONFLICTS_WITH", "source_id": "R1-xxx-0001", "target_id": "R2-xxx-0002"}}

## 文件操作约束
输出写入 `.srs_formalizer/r3-relational/{{SOURCE_ID}}.jsonl`。
```

- [ ] **步骤 2：Commit**

---

### 任务 14：verifier-R1.md — 显式需求校验

**文件：**
- 创建：`.claude/skills/srs-formalizer/prompts/verifier-R1.md`

- [ ] **步骤 1：编写 verifier-R1 提示词**

```markdown
# 校验者-R1：显式需求审核

## 角色
独立审核 executor-R1 的输出。你是把关者，不是合作者。

## 输入

R1 输出文件：`.srs_formalizer/r1-explicit/{{SHARD_ID}}.jsonl`
原始分片：`{{SHARD_CONTENT}}`

## 检查项

1. **编造检测**：逐条对照分片原文。输出中是否有 SRS 不存在的内容？
2. **遗漏扫描**：分片中的需求是否全部被提取？遗漏了什么？
3. **分类合理性**：所有 category=explicit 是否正确？
4. **id 唯一性**：是否有重复 id？

## 输出

```
VERDICT: APPROVED | REJECTED

Issues:
- [编造] <描述> at <记录 id>
- [遗漏] <描述> from <原文引用>
- [分类错误] <描述> at <记录 id>

Summary: <通过/失败的记录数>
```
```

- [ ] **步骤 2：Commit**

---

### 任务 15：verifier-R2.md + verifier-R3.md

同上模式创建剩余两个校验者提示词。

---

### 任务 16：S2 编排者提示词（prompts/orchestrator_stage_S2.md）

**说明：** S2 编排者协调整个需求提取流程——取分片 → 分发给执行者 → 校验 → 重试直至全部 APPROVED。

**文件：**
- 创建：`.claude/skills/srs-formalizer/prompts/orchestrator_stage_S2.md`

- [ ] **步骤 1：编写 S2 编排者提示词（在 Phase F 任务 19 中完成）→ 随后续任务**

---

## Phase E：TS 编码（TDD GREEN）

### 任务 17：编码 inject-prompt.ts

**文件：**
- 创建：`.claude/skills/srs-formalizer/scripts/commands/inject-prompt.ts`

**规格（SRS §5.3）：** --template <path> + --params <json> → stdout 输出填充后的提示词。模板路径白名单仅限 prompts/ 目录。用户输入中的 {{ }} 转义防注入。纯字符串替换，无副作用。

**核心逻辑：**

```typescript
// 1. 解析 --template 和 --params
// 2. 校验模板路径必须在 prompts/ 目录内
// 3. 读取模板文件
// 4. 对 params 中的每个值，先转义 {{ → \{\{ 和 }} → \}\}，再替换模板中的占位符
// 5. stdout 输出（不写文件）
// 6. 返回 {"status":"ok","data":"<filled prompt>"}
```

- [ ] **步骤 1：TDD → 实现 → 6/6 PASS**
- [ ] **步骤 2：注册到 index.ts CLI 入口（新增 inject-prompt 命令）**
- [ ] **步骤 3：Commit**

### 任务 18：编码 validate-jsonl.ts

**文件：**
- 创建：`.claude/skills/srs-formalizer/scripts/commands/validate-jsonl.ts`

**规格（SRS §5.4）：** 6 项检查 → 结构化 JSON 输出。复用 `lib/jsonl.ts` 中的 `validateJsonlRecord`。

- [ ] **步骤 1：TDD → 实现 → 10/10 PASS**
- [ ] **步骤 2：注册到 index.ts CLI 入口**
- [ ] **步骤 3：Commit**

---

## Phase F：编排者提示词

### 任务 19：prompts/orchestrator_stage_S2.md

```markdown
# S2 编排者指令：需求提取

## 执行流程

### 步骤 1：获取分片清单
读取 `.srs_formalizer/_ctx/shard_index.json`，获取分片列表。

### 步骤 2：分批发给执行者（每批 ≤3 个分片）

对每个分片：
1. inject-prompt --template prompts/executor-R1.md → 输出填充后的提示词
2. 分派 LLM 子代理执行 executor-R1 提示词
3. 子代理输出 JSONL → 写入 `.srs_formalizer/r1-explicit/<shard_id>.jsonl`
4. validate-jsonl --file <path> → 格式校验

### 步骤 3：校验循环

对每个执行者输出：
1. inject-prompt --template prompts/verifier-R1.md → 输出填充后的提示词
2. 分派 LLM 子代理（新会话）执行校验者提示词
3. REJECTED → ≤3 次重试 → >3 次 BLOCKED

### 步骤 4：R2 隐式推导 + R3 关系推导
同流程。

### 步骤 5：更新 STATE.md

## 约束
- 校验者在新会话中执行（上下文隔离）
- 所有子代理输出限定在 .srs_formalizer/ 内
```

---

## Phase G：逐级回归校验

### 任务 20：全量回归 + S2 完成

- [ ] **步骤 1：全部 TS 测试**

```bash
cd .claude/skills/srs-formalizer/scripts && node --test
```
预期：25(S1) + 16(S2) = 41 PASS。

- [ ] **步骤 2：tsc strict**

```bash
npx tsc --noEmit
```
预期：零错误。

- [ ] **步骤 3：L3 集成验证** —— inject-prompt → validate-jsonl 链路

- [ ] **步骤 4：L4 验收** —— 对照 golden/s2-extraction.md 逐条验证

- [ ] **步骤 5：提示词行为基线对比** —— 有提示词 vs 无提示词

- [ ] **步骤 6：Commit + S2 完成**

---

## 自检

### 规格覆盖度
| SRS 章节 | 对应任务 | 状态 |
|---------|---------|------|
| §5.3 inject-prompt.ts | 任务 7, 17 | ✅ |
| §5.4 validate-jsonl.ts | 任务 1, 8, 18 | ✅ |
| §6.3 子代理输出校验规则 | 任务 1, 18 | ✅ |
| §6.4 子代理文件操作约束 | 任务 11-15（提示词交接契约） | ✅ |
| §7.2 S2 工作流 | 任务 16（编排者提示词） | ✅ |

### 占位符扫描：无 TODO/TBD。
### 类型一致性：validateJsonlRecord 在任务 1 定义，任务 18 使用。
