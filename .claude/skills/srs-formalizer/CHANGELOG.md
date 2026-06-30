# Changelog

## [0.3.0] - 2026-06-30

### Added
- 分片源位置标注：每个分片头部含 `# source: <abs_path>:<line_start>-<line_end>`
- 分片安全顺序 ID（S001~S999），manifest 报告 total_shards
- ID 硬性约束：ASCII-only 正则 `^R[123]-[A-Za-z0-9_.]+-\d{4}$`

### Changed
- **目录结构重构**：阶段前缀（1_shard/ 2_extract/ 3_graph/ 4_bdd/ 5_formal/ 6_outputs/）
- **executor-R1/R2/R3 提示词加固**：显式禁止中文 ID、非法 category、添加硬性约束章节
- SKILL.md 更新：全命令快速参考、目录结构图、分片 ID 规则
- verify-gate 修复：`index.json` → `_ctx/shard_index.json`

### Fixed
- executor-R1 提示词：ID 含中文（150/272）→ 添加 ASCII-only 约束
- executor-R1 提示词：非法 category（36/272）→ 枚举硬性约束
- verify-gate.ts：错误的文件名检查 → shard_index.json

## [0.2.0] - 2026-06-30

### Added
- S2 阶段：inject-prompt.ts、validate-jsonl.ts、执行者 R1/R2/R3 + 校验者 R1/R2/R3 + 编排者提示词
- JSONL 校验函数：validateJsonlRecord（6 项检查）
- 提示词行为基线方法：无提示词 vs 有提示词 LLM 输出对比

### Changed
- 全部测试从 25 → 41 PASS

## [0.1.0] - 2026-06-30

### Added
- S1 阶段基础设施：package.json、tsconfig.json（strict 全家桶）
- 共享类型定义：JsonlRecord、CliResult、ShardIndex、GapEntry
- 路径安全库：isPathSafe、assertSafePath、validateWorkDir
- JSONL 工具库：readJsonl、writeJsonl、listJsonlFiles
- 命令脚本：init.ts、manifest.ts
- CLI 入口：index.ts
- SKILL.md 骨架、产出模板、参考文档
- L4/L3/L2 三级测试：25 用例
