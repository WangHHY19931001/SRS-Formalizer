# S4 BDD 生成 — 验收清单（严格模式）

- [ ] validate-bdd --strict --promote 成功：feature 文件数 ≥ 模块数
- [ ] 每个 .feature 文件含 `# SYSTEM:` `# TRACE:` 头部标注
- [ ] 每个 Scenario 含 Given / When / Then
- [ ] **无 `<THEN_PLACEHOLDER>` 残留（gherkin-lint 严格模式）**
- [ ] **无 GAP / TODO / FIXME / UNDEFINED 标记**
- [ ] **无 TBD / 待定 / 未定义 / 待实现 文本**
- [ ] 每个 Then 含 `# verification_method:` 标注
- [ ] validate-bdd PASS
- [ ] **gherkin-lint 严格模式全部通过**（20 条规则）
- [ ] Agent 生成 + validate-bdd PASS（behavior-graph）
