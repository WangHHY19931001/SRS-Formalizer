# Gherkin-Lint 参考指南

`srs-formalizer` S4 阶段使用 `gherkin-lint` 校验 BDD `.feature` 文件质量。
本指南供 S4 子代理参考。

---

## 1. 安装

```bash
npm install -g gherkin-lint
```

## 2. 基本用法

```bash
# 校验当前目录下所有 .feature 文件
gherkin-lint

# 指定配置文件
gherkin-lint -c .gherkin-lintrc

# 忽略特定路径
gherkin-lint -i "**/node_modules/**"

# 指定规则目录
gherkin-lint -r ./my-rules/
```

## 3. srs-formalizer 推荐配置

### 3.1 标准模式（`.gherkin-lintrc`）

技能在 `init` 时生成到工作目录 `4_bdd/` 下。

### 3.2 严格模式（`.gherkin-lintrc-strict`）

严格模式启用所有 20 条可配置规则，**不允许 GAP、未定义、PLACEHOLDER**：

- 禁止 `<THEN_PLACEHOLDER>`、`<GIVEN_PLACEHOLDER>`、`<WHEN_PLACEHOLDER>` 等占位符
- 禁止 `GAP`、`TODO`、`FIXME`、`UNDEFINED`、`TBD`、`待定`、`未定义`、`待实现` 标记
- 强制所有 Scenario 有完整的 Given → When → Then 步骤
- 强制所有 Scenario Outline 的变量都被使用

```bash
gherkin-lint -c .claude/skills/srs-formalizer/templates/.gherkin-lintrc-strict .srs_formalizer/4_bdd/
```

### 3.3 srs-formalizer 标准配置

技能在 `init` 时生成 `.gherkin-lintrc` 到工作目录 `4_bdd/` 下：

```json
{
  "no-unnamed-features": "on",
  "no-unnamed-scenarios": "on",
  "no-trailing-spaces": "on",
  "no-dupe-feature-names": "on",
  "no-dupe-scenario-names": ["on", "anywhere"],
  "no-scenario-outlines-without-examples": "on",
  "no-unused-variables": "on",
  "no-empty-file": "on",
  "one-feature-per-file": "on",
  "indentation": ["on", {
    "Feature": 0,
    "Scenario": 0,
    "Step": 2,
    "Examples": 0,
    "example": 2,
    "given": 2,
    "when": 2,
    "then": 2,
    "and": 2,
    "but": 2
  }],
  "new-line-at-eof": ["on", "yes"],
  "max-scenarios-per-file": ["on", { "maxScenarios": 20 }],
  "scenario-size": ["on", { "stepsPerScenario": 15 }],
  "use-and": "on",
  "keywords-in-logical-order": "on"
}
```

### 规则说明

| 规则 | 用途 | 为什么重要 |
|------|------|------|
| `no-unnamed-features` | Feature 必须有名称 | 知识图谱需要 Feature 名作为节点 |
| `no-unnamed-scenarios` | Scenario 必须有名称 | 行为图谱需要 Scenario 名作为节点 |
| `no-dupe-scenario-names` | 禁止重复场景名 | 避免图谱节点冲突 |
| `indentation` | 统一缩进格式 | 自动化解析依赖格式一致性 |
| `keywords-in-logical-order` | Given→When→Then 顺序 | 确保因果链可追踪 |
| `no-unused-variables` | 检测未使用变量 | `<PLACEHOLDER>` 残留检测 |
| `use-and` | 重复关键字改为 And | 提高可读性和解析准确性 |
| `scenario-size` | 限制步骤数 | 避免过于复杂的场景（建议拆分） |

## 4. 强制规则（不可关闭）

以下规则始终生效，无需在配置中声明：

| 规则 | 说明 |
|------|------|
| `no-empty-file` | 拒绝空文件 |
| `no-tags-on-backgrounds` | Background 不允许有 tag |
| `one-feature-per-file` | 每个文件只允许一个 Feature |
| `up-to-one-background-per-file` | 每个文件最多一个 Background |
| `no-multiline-steps` | 禁止多行步骤 |

## 5. 忽略文件

创建 `.gherkin-lintignore`（每行一个 glob）：

```
**/node_modules/**
**/dist/**
**/.srs_formalizer/**
```

或使用 CLI：`gherkin-lint -i "**/node_modules/**"`

## 6. 与技能集成

### 6.1 validate-bdd 命令

技能内置的 `validate-bdd` 提供轻量格式校验。当 `gherkin-lint` 可用时，额外执行：

```bash
cd 4_bdd && gherkin-lint -c .gherkin-lintrc
```

### 6.2 CI 集成

```bash
# 校验所有 feature 文件
npx gherkin-lint -c .claude/skills/srs-formalizer/templates/.gherkin-lintrc \
  -i "**/node_modules/**" \
  .srs_formalizer/4_bdd/
```

## 7. 常见错误与修复

| 错误 | 原因 | 修复 |
|------|------|------|
| `no-unnamed-features` | Feature 缺少名称 | 添加 `Feature: <名称>` |
| `no-unnamed-scenarios` | Scenario 缺少名称 | 添加 `Scenario: <名称>` |
| `keywords-in-logical-order` | 步骤顺序错误 | 调整为 Given → When → Then → And |
| `no-unused-variables` | 模板变量未使用 | 填充或删除 `<PLACEHOLDER>` |
| `indentation` | 缩进不一致 | 统一使用 2 空格缩进 |
| `no-dupe-scenario-names` | 重复场景名 | 添加序号或模块前缀区分 |

## 8. 自定义规则

如需添加技能专属规则，在 `rules/` 目录下创建 JS 文件：

```javascript
// rules/no-placeholder-steps.js
const rule = {
  name: 'no-placeholder-steps',
  run: function(feature) {
    const errors = [];
    feature.children?.forEach(child => {
      if (child.scenario) {
        child.scenario.steps?.forEach(step => {
          if (step.text?.includes('<THEN_PLACEHOLDER>') ||
              step.text?.includes('<TODO')) {
            errors.push({
              message: `Placeholder detected in step: "${step.text}"`,
              rule: 'no-placeholder-steps',
              line: step.location?.line || 0,
            });
          }
        });
      }
    });
    return errors;
  }
};

module.exports = rule;
```

使用：`gherkin-lint -r ./rules/`

## 9. 升级替代：gplint

`gplint` 是 `gherkin-lint` 的活跃 fork，额外支持：

- `--fix` 自动修复
- 错误/警告分级
- Gherkin 6+ `Rule` 关键字
- 表格对齐校验
- 更多内置规则

```bash
npm install -g gplint
gplint --fix .srs_formalizer/4_bdd/
```

> **建议**：srs-formalizer 优先使用 `gplint`（功能更完整）。如不可用则回退到 `gherkin-lint`。
