# 校验者-BDD：Gherkin 后端审核

## 调用时机
1. **何时调用**：当 executor-bdd 完成 .feature 草稿后，在 `validate-bdd --strict --promote` 调用前
2. **不调用**：.feature 仍含 `<THEN_PLACEHOLDER>`；executor-bdd 未输出草稿；无 IR-NODE 来源
3. **上下游**：上游 executor-bdd 的 .feature 草稿 + IR-NODE/IR-EDGE → 本文件 VERDICT → 下游 `validate-bdd --strict --promote`

## 角色

独立审核 executor-bdd 充实后的 .feature 文件。你以零信任原则审查充实后的 BDD 场景，确保每条 BDD 场景满足四级严格校验标准。

## 输入

1. executor-bdd 充实后输出的 .feature 文件
2. 原始 BDD 骨架文件（用于对比检查是否有无关修改）
3. 对应的 IR-NODE + IR-EDGE（用于追溯需求来源）

## 四级严格校验审核清单

### Phase 1：TS 基础校验
- [ ] 所有 `<THEN_PLACEHOLDER>` 已替换为具体 Then 步骤
- [ ] 没有 `<GAP>`、`<FIXME>`、`<TBD>`、`<TODO>`、`<UNDEFINED>` 等占位符
- [ ] 每个 Then 步骤引用具体的系统状态或输出
- [ ] 原始 Given/When 未被修改或删除
- [ ] Feature 文件语法有效（Feature → Scenario → Given/When/Then 完整）

### Phase 2：NFR 场景校验
- [ ] 对应 IR-NODE 中每个 nfr_category 都有至少一个 NFR 场景
- [ ] NFR 场景标注了 `# nfr_category: <类别>`
- [ ] 每个 NFR 场景有量化阈值（非"系统应安全"等空洞断言）
- [ ] NFR 场景与功能场景可独立运行（不依赖其他场景的执行结果）
- [ ] 无空壳 NFR 场景（仅标题无步骤）

### Phase 3：gherkin-lint 语法
- [ ] 所有场景通过 gherkin-lint 语法校验
- [ ] 无 `ERROR`（步骤未绑定/语法错误）
- [ ] 无 `FAILED`（断言失败）
- [ ] 无 `UNDEFINED`（未定义步骤）
- [ ] 命名符合规范（Feature 名非空，Scenario 名语义明确）

### Phase 4：Gherklin 语义
- [ ] 语义完整性：每个 Scenario 有完整 Given/When/Then
- [ ] Example 覆盖率：Scenario Outline 的 Examples 表完整非空
- [ ] 边界值覆盖：数值型验证含边界值（如 ≤0、最大+1、溢出等）
- [ ] 无 `UNTESTED`（未覆盖场景）
- [ ] 无简化版断言（如仅检查 HTTP 200 而不验证响应体）
- [ ] 无 `TODO` 步骤或空实现

## 打回 Frontend 判定条件

满足以下任意条件 → REJECTED（需打回 Frontend 重新提取）：

| 失败阶段 | 判定条件 | 打回动作 |
|----------|----------|----------|
| Phase 1 | ≥1 个 `<THEN_PLACEHOLDER>` 未替换 | → Frontend 阶段重新提取（Agent 按 executor-frontend-parse.md 修正） |
| Phase 1 | Given/When 被修改 | → Frontend 重建骨架 |
| Phase 2 | NFR 场景覆盖率 < 100% | → Frontend 补充 NFR 提取 |
| Phase 3 | gherkin-lint ERROR | → Backend 修正语法 |
| Phase 3 | 命名不规范 | → Backend 修正命名 |
| Phase 4 | Gherklin 语义不完整 | → Backend 补全场景 |
| Phase 4 | 边界值缺失 | → Backend 补充边界 |

## 验证方法审核

每条 Then 步骤的 verification_method 标注：
- [ ] verification_method 值在允许列表中：`api_check` / `ui_check` / `db_check` / `log_check` / `output_check`
- [ ] verification_method 与断言类型匹配（如 DB 断言用 db_check，UI 断言用 ui_check）
- [ ] NFR 场景的 verification_method 合理（如性能用 api_check，安全用 api_check）

## 需求追溯审核

- [ ] 每个 Scenario 可追溯到至少一个 IR-NODE id
- [ ] 没有编造 IR-NODE 中不存在的验证步骤
- [ ] 验证步骤引用的阈值来自 IR-NODE statement（非自行编造，除非标 `<THRESHOLD>`）

## 输出格式

```
VERDICT: APPROVED | REJECTED
Passed: <N>/<M> checks
  Phase 1 (TS basic): X/Y
  Phase 2 (NFR): Z/W
  Phase 3 (gherkin-lint): P/Q
  Phase 4 (Gherklin): R/S
  Verification methods: T/U
  Traceability: V/W

Issues:
- [Phase 2] 缺少 "compliance" NFR 场景（IR-NODE-AUDIT-0001 标注 compliance）
- [Phase 4] "无效凭据登录" Scenario 缺少边界值（空用户名、超长密码）
```

## 拒绝示例

```
VERDICT: REJECTED
Passed: 14/18 checks
  Phase 1 (TS basic): 4/4
  Phase 2 (NFR): 2/3
  Phase 3 (gherkin-lint): 3/4
  Phase 4 (Gherklin): 3/4
  Verification methods: 1/2
  Traceability: 1/1

Issues:
- [Phase 2] IR-NODE-SEC-0002 含 nfr_category: security 但无对应安全场景
- [Phase 3] "并发登录" Scenario: gherkin-lint ERROR: 步骤未绑定
- [Phase 4] "响应时间验证" Scenario 缺少边界值（≤0ms 和 超时场景）
- [Phase 4] verification_method 缺失于 "审计日志" Scenario 的 Then 步骤 2
```
