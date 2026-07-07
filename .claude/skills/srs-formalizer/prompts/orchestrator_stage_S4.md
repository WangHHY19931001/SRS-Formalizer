# S4 编排者指令：BDD 生成与充实

## 专家人设加载（首先执行）

在开始任何 BDD 相关工作前，加载 BDD 行为建模专家人设作为本阶段的决策上下文：

```
Read references/expert-persona-bdd.md
```

此人设定义了你作为 BDD 行为建模专家的身份定位、核心建模规范（格式铁律、Given-When-Then 原子化、场景设计原则）、质量门禁（零 ERROR/FAILED/UNDEFINED/UNTESTED/占位）、AI 增强实践，以及问题排查与上报路径。所有 S4 阶段的子代理分派、质量判定和上报决策均需以该人设的方法论和标准为依据。

## 执行流程

### 步骤 1：生成 BDD 骨架
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts generate-bdd --workdir .srs_formalizer
```

### 步骤 2：子代理充实（注入 BDD 专家人设）
对每个 .feature 文件：`inject-prompt --template prompts/executor-bdd.md` → 分派 LLM 子代理 → 填充 Then 步骤。

子代理将以 BDD 行为建模专家身份执行：遵循 Given-When-Then 原子化规范、场景独立性与原子性原则、零容忍红线（无 ERROR/FAILED/UNDEFINED/UNTESTED/TODO/占位），并对复合条件进行边界值分析和规则细化。

### 步骤 3：格式校验（严格模式）

#### 3.1 内置校验
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts validate-bdd --workdir .srs_formalizer
```

#### 3.2 gherkin-lint 严格模式（如果可用）
```bash
# 安装（首次）
npm install -g gherkin-lint 2>/dev/null || npm install -g gplint 2>/dev/null

# 严格模式校验（禁止 GAP/PLACEHOLDER/未定义）
cd .srs_formalizer/4_bdd && gherkin-lint -c ../../.claude/skills/srs-formalizer/templates/.gherkin-lintrc-strict
```
严格模式规则详见 `references/gherkin-lint-guide.md`。

若检测到 GAP、PLACEHOLDER、未定义等违规 → 回到步骤 2 重新充实。

### 步骤 4：校验者审核
inject-prompt --template prompts/verifier-R5.md → 分派新会话 LLM 子代理 → APPROVED/REJECTED 循环。

### 步骤 5：构建系统行为图谱
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts build-behavior-graph --workdir .srs_formalizer
```
验证输出为 `{"status":"ok"}`。产物：
- `4_bdd/behavior-graph.json` — 行为图谱（Feature/Scenario/Action 节点 + BELONGS_TO/HAS_STEP/DEPENDS_ON/VERIFIES 边）
- `6_outputs/knowledge_graph/behavior.cypher` — Cypher 导出

若 `build-behavior-graph` 返回 error（如仍有 `<THEN_PLACEHOLDER>`）→ 回到步骤 2 重新充实。

### 步骤 6：更新 BEHAVIORS.md + STATE.md

## 约束

**格式要求：**
- 每个 .feature 文件独立（SRS §8.2）
- **必须采用独立 `.feature` 文件格式建模，不接受 Markdown 模式描述 BDD**
- 必须有完整步骤（Given → When → Then → And），必须完整定义状态和状态转换

**质量门禁（全部必须通过）：**
- **严格模式**：无 GAP / PLACEHOLDER / UNDEFINED / 待定 / 未定义
- 不允许 `error`、`failed`、`undefined`、`untested`、步骤缺失——出现则需处理修正
- 不允许占位实现（如 `<THEN_PLACEHOLDER>`、`<GIVEN_PLACEHOLDER>`）、简化实现、错误实现
- Then 步骤全部充实，无占位符残留（gherkin-lint `no-restricted-patterns`）
- 每个 Then 含 `# verification_method:` 标注
- 行为图谱必须成功构建（含 Feature/Scenario/Action 节点）
- gherkin-lint 严格模式全部通过（全部 20 条可配置规则）

**SRS 一致性问题：** 建模必须符合 SRS 设计并进一步细化。出现问题先检查建模与设计一致性；一致但仍有问题则与用户交互修正设计。
