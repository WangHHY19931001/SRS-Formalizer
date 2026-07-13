# 文档同步修正 v1.0.0 — 实现计划

**日期**: 2026-07-13 | **范围**: 全部 ~30 文件对齐编译器 v1.0.0
**来源**: 三份子代理分析报告

## 1. 文件分组

| 组 | 操作 | 数量 |
|------|:--:|:--:|
| SKILL.md | 重写 | 1 |
| orchestrator | 删除旧 7 个 + 新建 3 个 | 10 |
| executor | 删除旧 7 个 + 新建 4 个 + 更新 4 个 | 15 |
| verifier | 删除旧 5 个 + 新建 2 个 + 更新 1 个 | 8 |
| debug | 更新 2 个 | 2 |
| references | 重写 2 个 + 更新 3 个 | 5 |

## 2. 关键内容变更

- 版本: 0.5.5→1.0.0, 模式: pipeline→compiler
- TLA+: 条件→全模块强制, 5→6 类 NFR 不变式
- BDD: 框架级→四级严格校验 (TS + NFR + gherkin-lint + Gherklin)
- CLI: build-graph→build-ir, 新增 emit/tag-nfr/score-risk
- 10→13 根本问题
- IR: 引用 srs-ir.json v2.0.0

## 3. 验证

所有文件内容引用需与实际代码/命令一致。无 typecheck 或测试要求（纯文档）。
