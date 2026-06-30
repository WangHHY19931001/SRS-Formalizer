# 测试可追溯矩阵 — S1 阶段

## 图例

| 验证类型 | 含义 |
|---------|------|
| 确定性保证 | 验证相同输入→相同输出（函数式契约） |
| 输入校验 | 验证非法输入被拒绝（参数/路径/语言） |
| 错误处理 | 验证异常路径返回结构化错误 |
| 边界条件 | 验证边界值行为（空输入/极值） |
| 幂等性 | 验证重复执行不产生副作用 |

## 四层覆盖矩阵

### init.ts 测试（L2 模块测试：__tests__/init.test.ts）

| 测试用例 | SRS 来源 | 验证类型 | 预期 RED 原因 |
|---------|---------|---------|-------------|
| creates .srs_formalizer with all required subdirectories | §5.1 输出 | 确定性保证 | Cannot find module '../commands/init.js' |
| is idempotent — runs twice successfully | §5.1 幂等操作 | 幂等性 | 同上 |
| rejects non-.srs_formalizer output path | §5.1 路径校验 | 输入校验 | 同上 |
| writes STATE.md with required fields | §5.1 输出模板 | 确定性保证 | 同上 |
| handles missing --output argument | §5.1 必填参数 | 输入校验 | 同上 |

### manifest.ts 测试（L2 模块测试：__tests__/manifest.test.ts）

| 测试用例 | SRS 来源 | 验证类型 | 预期 RED 原因 |
|---------|---------|---------|-------------|
| processes single markdown SRS and creates shards | §5.2 处理逻辑 | 确定性保证 | Cannot find module '../commands/manifest.js' |
| produces valid shard_index.json | §5.2 输出 | 确定性保证 | 同上 |
| detects P0 gaps from §7 unresolved issues | §5.2 缺口触发 | 确定性保证 | 同上 |
| writes CONTEXT.md with glossary terms | §5.2 章节识别 | 确定性保证 | 同上 |
| is deterministic — same input, same output | §5.2 确定性保证 | 确定性保证 | 同上 |
| rejects invalid --workdir | §5.2 路径校验 | 输入校验 | 同上 |
| handles missing required args | §5.2 CLI 规格 | 输入校验 | 同上 |
| errors gracefully on nonexistent src file | §5.2 错误处理 | 错误处理 | 同上 |

### security.ts 测试（L2 模块测试：__tests__/security.test.ts）

| 测试用例 | SRS 来源 | 验证类型 | 预期 RED 原因 |
|---------|---------|---------|-------------|
| isPathSafe returns true inside workdir | §12.9.3 路径校验 | 确定性保证 | Cannot find module '../lib/security.js' |
| isPathSafe returns false outside workdir | §12.9.3 拒绝外部 | 边界条件 | 同上 |
| assertSafePath throws on unsafe paths | §12.9.3 违规处理 | 错误处理 | 同上 |
| validateWorkDir accepts only .srs_formalizer | §12.9 核心原则 | 输入校验 | 同上 |

### jsonl.ts 测试（L2 模块测试：__tests__/jsonl.test.ts）

| 测试用例 | SRS 来源 | 验证类型 | 预期 RED 原因 |
|---------|---------|---------|-------------|
| readJsonl parses valid JSONL | §5.4 合法 JSON | 确定性保证 | Cannot find module '../lib/jsonl.js' |
| readJsonl skips empty lines | §5.4 空行忽略 | 边界条件 | 同上 |
| readJsonl throws on invalid JSON | §5.4 非法 JSON | 错误处理 | 同上 |
| writeJsonl creates parent directories | §5.4 自动创建目录 | 边界条件 | 同上 |
| readJsonl rejects paths outside workdir | §12.9.3 路径校验 | 输入校验 | 同上 |

### index.ts 测试（L2 模块测试：__tests__/index.test.ts）

| 测试用例 | SRS 来源 | 验证类型 | 预期 RED 原因 |
|---------|---------|---------|-------------|
| prints usage on --help | §4.2 CLI 入口 | 确定性保证 | Cannot find module './commands/init.js' |
| prints usage on no args | §4.2 CLI 入口 | 边界条件 | 同上 |
| errors on unknown command | §4.2 CLI 入口 | 错误处理 | 同上 |

## 三层交叉覆盖

| L3 eval-spec ID | 覆盖的 L2 测试 | 对应的 L4 验收场景 |
|----------------|---------------|------------------|
| s1_init_basic | init.creates_dirs, init.writes_STATE | 场景 1 |
| s1_init_idempotent | init.idempotent | 场景 2 |
| s1_init_reject_bad_path | init.rejects_bad_path | 场景 3 |
| s1_manifest_single_md | manifest.processes, manifest.valid_index, manifest.P0_gaps, manifest.CONTEXT | 场景 1 |
| s1_manifest_deterministic | manifest.deterministic | 场景 2 |
| s1_manifest_reject_bad_workdir | manifest.rejects_invalid_workdir | 场景 3 |
| s1_manifest_nonexistent_src | manifest.errors_nonexistent | 场景 3 |
| nc_init_no_output_arg | init.missing_output | 场景 4 |
| nc_manifest_no_src | manifest.missing_args | 场景 4 |
| nc_manifest_no_workdir | manifest.missing_args | 场景 4 |
