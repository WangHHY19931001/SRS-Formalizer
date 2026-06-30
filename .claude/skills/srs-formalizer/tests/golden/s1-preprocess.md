# L4 验收用例：S1 预处理

## 场景 1：中文 SRS 单文件 → 分片 + 缺口报告

### 输入

文件 `tests/fixtures/srs-sample-zh.md`（见任务 7）

### 执行

1. `npx tsx index.ts init --output .srs_formalizer`
2. `npx tsx index.ts manifest --src tests/fixtures/srs-sample-zh.md --lang zh --workdir .srs_formalizer`

### 验收断言

| # | 断言 | 条件 |
|---|------|------|
| A1 | 分片数量 ≥ 2 | 按模块切分：用户模块、订单模块 |
| A2 | 每个分片 ≤ 20000 Token | char_count / 1.5 ≤ 20000 |
| A3 | `shard_index.json` 中 `language = "zh"` | — |
| A4 | gaps 数组非空 | §7 有 2 个未解决问题 → P0 缺口 |
| A5 | 首个 gap 的 `priority = "P0"` | — |
| A6 | `CONTEXT.md` 含术语 "SKU"、"OMS" | 来自 §1.4 |
| A7 | 分片文件名含模块标识 | 如 `用户模块_S1.md` |
| A8 | `source_hash` 非空且长度 = 64 | SHA256 十六进制 |

## 场景 2：确定性与幂等性

两次 `manifest` 执行 → 相同 `source_hash`、相同分片数、相同分片内容。
两次 `init` 执行 → 第二次仍返回 `{"status":"ok"}`。

## 场景 3：路径安全拒绝

执行 `manifest --src <fixture> --lang zh --workdir /tmp/evil_dir`
预期返回 `{"status":"error","message":"...must be .srs_formalizer..."}`，退出码非零。

## 场景 4：参数缺失拒绝

- `init`（无 `--output`）
- `manifest`（无 `--src`）
- `manifest`（无 `--workdir`）

全部返回 `{"status":"error"}`，退出码非零。
