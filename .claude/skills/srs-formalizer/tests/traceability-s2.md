# 测试可追溯矩阵 — S2 阶段

## TS 脚本测试

### inject-prompt.ts 测试（L2：__tests__/inject-prompt.test.ts）

| 测试用例 | SRS 来源 | 验证类型 | 预期 RED 原因 |
|---------|---------|---------|-------------|
| replaces {{PARAM}} placeholders with values | §5.3 处理逻辑 | 确定性保证 | Cannot find module |
| escapes user-input {{ and }} to prevent injection | §5.3 模板注入防护 | 安全校验 | Cannot find module |
| rejects template path outside prompts/ directory | §5.3 路径校验（白名单） | 输入校验 | Cannot find module |
| handles missing --template argument | §5.3 输入规格 | 输入校验 | Cannot find module |
| handles missing --params argument | §5.3 输入规格 | 输入校验 | Cannot find module |
| handles invalid JSON in --params | §5.3 错误处理 | 输入校验 | Cannot find module |

### validate-jsonl.ts 测试（L2：__tests__/validate-jsonl.test.ts）

| 测试用例 | SRS 来源 | 验证类型 | 预期 RED 原因 |
|---------|---------|---------|-------------|
| validates correct JSONL as valid | §5.4 检查项① | 确定性保证 | Cannot find module |
| rejects invalid JSON lines | §5.4 检查项① | 错误处理 | Cannot find module |
| rejects records with missing required fields | §5.4 检查项② | 输入校验 | Cannot find module |
| rejects invalid id format | §5.4 检查项③ | 输入校验 | Cannot find module |
| rejects invalid category enum | §5.4 检查项④ | 输入校验 | Cannot find module |
| rejects empty statement | §5.4 检查项⑤ | 输入校验 | Cannot find module |
| detects duplicate ids | §5.4 检查项⑥ | 错误处理 | Cannot find module |
| rejects file path outside .srs_formalizer | §5.4 路径校验 | 输入校验 | Cannot find module |
| returns structured JSON output | §5.4 输出格式 | 确定性保证 | Cannot find module |
| handles missing --file argument | §5.4 错误处理 | 输入校验 | Cannot find module |

## 三层交叉覆盖

| L3 eval-spec ID | 覆盖的 L2 测试 | 对应的 L4 验收场景 |
|----------------|---------------|------------------|
| s2_inject_basic | inject.replaces_placeholders | 场景 1 |
| s2_inject_injection_protection | inject.escapes_user_input | 场景 5 |
| s2_inject_reject_bad_template | inject.rejects_bad_path | 场景 5 |
| s2_validate_valid_jsonl | validate.valid_jsonl | 场景 1 |
| s2_validate_bad_id | validate.invalid_id | 场景 1 |
| s2_validate_duplicates | validate.duplicate_ids | 场景 1 |
| s2_validate_reject_bad_path | validate.rejects_bad_path | — |
