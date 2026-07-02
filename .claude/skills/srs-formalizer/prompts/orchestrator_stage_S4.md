# S4 编排者指令：BDD 生成与充实

## 执行流程

### 步骤 1：生成 BDD 骨架
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts generate-bdd --workdir .srs_formalizer
```

### 步骤 2：子代理充实
对每个 .feature 文件：inject-prompt --template prompts/executor-R5.md → 分派 LLM 子代理 → 填充 Then 步骤。

### 步骤 3：格式校验
```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts validate-bdd --workdir .srs_formalizer
```

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
- 每个 .feature 文件独立（SRS §8.2）
- Then 步骤全部充实，无占位符残留
- 每个 Then 含 verification_method
- 行为图谱必须成功构建（含 Feature/Scenario/Action 节点）
