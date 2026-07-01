# Changelog

## [0.5.0] - 2026-07-01

### Changed
- **分片方案重构**: 从物理切文件改为索引化方案——`ShardEntry.locator` 格式 `{file_abspath}-{start}-{end}-{chunk_id}`，从原始 SRS 按行号范围定位分片内容
- **移除 `1_shard/` 目录**: 分片不再存储为物理文件，全部信息在 `_ctx/shard_index.json`
- **HTML 格式保留**: manifest 不再对 HTML 去标签，原始内容零修改，章节通过 `<h1>`~`<h6>` 识别
- **多文件独立索引**: 目录类型的 SRS 源不再合并文件，每个文件独立索引
- `inject-prompt` 新增 `--shard-id` 参数，自动从 shard_index.json 解析分片内容

### Fixed
- HTML 文档处理: 修复了 HTML 格式 SRS 无法正确处理的问题（去标签导致信息丢失）

### Removed
- `1_shard/` 目录及其物理分片文件

## [0.4.0] - 2026-07-01

### Added
- `compile` command: 四阶段编译流水线（Parse→IR Build→Inject→Emit）
- SkIR (Skill Intermediate Representation): 30+ 强类型字段，对标 SkCC (arXiv:2605.03353)
- Anti-Skill 注入器: 7 条安全规则（4 条 SkCC 通用 + 3 条 srs-formalizer 特有），三级 severity (warning/error/critical)
- Claude XML 语义分层发射器: `<execution_steps>`, `<strict_constraints>`, `<permissions>`, `<examples>` 标签
- Generic Markdown 发射器: 跨平台兜底（OpenCode, Cursor, Windsurf, Qoder 等 7+ 平台）
- 编译时 schema 校验: name(kebab-case), description(≤1024), security_level 枚举
- SKILL.md 新增 `security_level`, `permissions`, `compatibility` 字段（向后兼容）

### Changed
- 版本号: 0.3.0 → 0.4.0
- orchestrator_stage_S1.md: 新增步骤 0（compile）

### Security
- 编译时行为安全约束注入（94.8% 安全触发率基准，对标 SkCC）
- 安全三层级联：文件完整性 → IR 编译+Anti-Skill → 数据门禁

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
