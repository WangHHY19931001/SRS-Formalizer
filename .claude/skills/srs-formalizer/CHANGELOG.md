# Changelog

## [0.5.7] - 2026-07-09

### Changed

- **文件拆分重构**：16 个超 300 行的文件按自然边界拆分为 39 个子模块，全部 ≤283 行。
  - **Graph 模块统一四文件模式**（`tla-graph/`、`lean-graph/`、`behavior-graph/`）：`types.ts` → `parser.ts` → `builder.ts` → `cypher.ts`，原始文件缩为 re-export 聚合。
  - **SkIR 拆分**（`skir/`）：独立 YAML 解析器 `yaml.ts`（142 行）→ `parser.ts` → `builder.ts`。
  - **Architecture 拆分**：`graph-utils.ts` + `validator.ts`（从 `commands/validate-architecture.ts` 迁入）+ `processors/{arch1,arch2,arch3}.ts`。
  - **Cross-graph 拆分**：`graph-loader.ts` + `scorer.ts` + `verifier.ts` + `questions-def.ts` + `socratic.ts`。
  - **Stability 拆分**（`llm/stability/`）：`types.ts` + `manifest.ts` + `scoring.ts` + `eval.ts` + `report.ts`。
  - **System-architecture 拆分**：`builder.ts` + `cross-layer.ts` + `consistency.ts` + `cypher.ts`。
- **命令文件精简**（7 个）：业务逻辑提取到 `lib/`，`main()` 函数平均从 ~400 行减至 ~80 行。
  - `analyze-graph.ts` → NLP 工具提取到 `lib/text-analysis.ts`，提示词模板提取到 `lib/prompt-templates.ts`
  - `manifest.ts` → 章节解析提取到 `lib/chapter-parser.ts`，分片逻辑提取到 `lib/sharder.ts`
  - `merge-analysis.ts` + `merge-structure.ts` → 图操作提取到 `lib/graph-operations.ts`
  - `query-graph.ts` → BFS/2-hop 遍历提取到 `lib/graph-algorithms.ts`（后合并 `traversal.ts`）
  - `verify-skill-integrity.ts` + `pack-skill.ts` → 共享加解密逻辑提取到 `lib/skill-integrity.ts`
  - `validate-architecture.ts` → 校验逻辑迁入 `lib/architecture/validator.ts`

### Fixed

- **跨文件去重**：`sanitizeId`（3→1 处）收敛到 `lib/id-utils.ts`；`ensureDir`/`writeJsonlFile`（2→1 处）收敛到 `lib/fs-utils.ts`；`jaccardSimilarity`（2→1 处）收敛到 `lib/graph-algorithms.ts`
- **图算法统一**：`traversal.ts` + `graph-traversal.ts` → `lib/graph-algorithms.ts`，移除死代码 `findPath`
- **循环依赖修复**：`cross-graph-verifier.ts` ↔ `questions.ts` 通过共享 `lib/cross-graph/types.ts` 消除互引用
- **`refuseDirectInvocation` 守卫补全**：6 个命令文件此前仅有 `import` 但未调用，现已全部补全

### Metrics

- 测试：320 pass / 0 fail
- 文件行数：全部 ≤283 行（最大 `guided-extract.ts`）
- 命令模块：全部 ≤119 行
- 净减少 ~2100 行（去重 + 消除冗余 + 死代码移除）

## [0.5.6] - 2026-07-09

### Fixed

- **verify-gate 源重扫安全修复**：堵住"残留图谱 JSON 使含缺陷的形式化产物通过 FINAL 门禁"的安全盲区。门禁与构建期不再仅凭图谱 JSON 存在性放行。
  - Lean（B3）：`checkLeanGraphExists` 与 `build-lean-graph` 在 `lean-proof-graph.json` 存在检查之外，重扫 `5_formal/proofs/*.lean`——去注释后按词边界匹配 `sorry`/`axiom`，命中即 fail；`axiom` 由 warn 提升为 fail。
  - TLA+（B3-TLA+）：`checkTlaGraphExists` 与 `build-tla-graph` 重扫 `5_formal/specs/*.tla`——仅在注释区域匹配禁止占位标记 `GAP`/`TODO`/`FIXME`/`TBD`/`待定`/`未定义`/`待实现`（ASCII 大写词边界 + CJK 字面），命中即 fail。语义型简化（弱不变式、缩小状态空间、伪代码代替 .tla）无单一文本特征，仍由 SANY/TLC 与人工审查负责。

### Added

- 共享扫描器 `scanTlaSourceForPlaceholders` / `stripTlaCode`（`lib/verify-gate/shared.ts`），与 Lean 侧 `scanLeanSourceForPlaceholders` 对称（机制相反：Lean 去注释匹配代码 token，TLA+ 保留注释匹配标记，避免 `CONSTANT GAP` 等代码标识误报）。
- 新增测试 `verify-gate-tla-source.test.ts`，并在 `verify-gate-source-scan.test.ts` / `build-tla-graph.test.ts` 追加用例。测试总数 299 → 320（38 文件）。

## [0.5.5] - 2026-07-07

### Added

- **专家人设体系**（§24 DESIGN.md + 4 个 L3 参考文件）：
  - `references/expert-persona-bdd.md` — BDD 行为建模专家：身份定位、Given-When-Then 原子化规范、场景设计原则（独立性/原子性/声明式风格）、零容忍红线（ERROR/FAILED/UNDEFINED/UNTESTED/TODO/占位）、AI 增强实践、问题排查与上报路径
  - `references/expert-persona-tlaplus.md` — TLA+ 并发系统建模专家：层次化拆解法（L1-L4+ 定义 + 拆解数学判定硬指标：>1k 启动拆解, >1w 强制拆解）、SANY→TLC 验证顺序、四重通过标准、状态爆炸应对策略、根因分析与上报
  - `references/expert-persona-lean4.md` — Lean 4 定理证明专家：Sorry 驱动开发四步逆向流程、五项红线（零 sorry/axiom/warning/偏离实现/语法糖掩盖缺陷）、策略级联（rfl→simp→ring→...→aesop）、复杂递归良基性处理、关键上报节点
- **专家协作契约** `references/collaboration-contract.md`：
  - 协作工作流（ASCII 流程图）、需求细化联动机制（BDD→TLA+, BDD→Lean 4, TLA+↔Lean 4）
  - 冲突仲裁优先级（Lean 4 > TLA+ > BDD）+ 四种具体仲裁场景
  - 统一交付标准（各自交付物 + 一致性矩阵/差异分析/SRS 修正建议联合交付物）
  - 上报条件（SRS 缺陷/隐含假设/需求矛盾/跨专家分歧）与格式模板
- **领域专用子代理提示词**（3 个）：
  - `prompts/executor-bdd.md` — BDD 行为建模执行者（注入完整 BDD 专家人设，替换 executor-R5 在 S4 的调度角色）
  - `prompts/executor-tlaplus.md` — TLA+ 并发系统建模执行者（注入完整 TLA+ 专家人设，含输出格式模板和质量自检清单）
  - `prompts/executor-lean4.md` — Lean 4 定理证明执行者（注入完整 Lean 4 专家人设，含 Sorry 驱动开发流程和五项红线）
- DESIGN.md 新增 §24 专家人设体系 + §25 专家协作契约（~330 行）
- DESIGN.md §4.3/4.4/4.5 各新增专家人设交叉引用
- DESIGN.md §16 跨图验证新增协作契约交叉引用
- **编码参考指南完善**（3 份）：
  - `references/bdd-coding-guide.md` — Gherkin 语法速查、声明式 vs 过程式对比、Scenario Outline 数据驱动模式、常用 BDD 框架对照表
  - `references/tlaplus-coding-guide.md` — 重组合并：语法说明 + 编写原则 + 编码最佳实践 + 反例与 LLM 常见错误 + 工业案例 + 外部资源（~380 行）
  - `references/lean4-coding-guide.md` — 重组合并：核心语法与声明 + 编码方法与原则 + 反例与常见陷阱 + 社区资源 + 外部资源（~290 行）
- **渐进式披露模式**：三个 executor 提示词末尾各新增「完整人设参考」节——子代理持有精简版人设，可按需自行加载完整人设和编码指南

### Changed

- **编排者提示词升级**：
  - `orchestrator_stage_S4.md`：新增「专家人设加载」步骤（Read expert-persona-bdd.md）+ 子代理改用 `inject-prompt executor-bdd.md`
  - `orchestrator_stage_S5.md`：新增「专家人设加载」步骤（TLA+/Lean 4 双人设）+ 子代理改用 `inject-prompt executor-tlaplus.md` / `executor-lean4.md`
  - `orchestrator_stage_S6.md`：新增「协作契约加载」步骤（Read collaboration-contract.md）
- SKILL.md：version 0.5.2→0.5.5；L3-Ref 表 +7 行（3 人设 + 契约 + 3 编码指南）；L3-Exec 表 +3 行（3 领域执行者）
- README.md：版本历史新增 0.5.5；目录树更新（25→28 prompts, 12→17 refs）；新增「专家人设与协作」章节
- DESIGN.md：版本号 0.5.4→0.5.5；prompt 类型表新增「执行者-领域」行
- BDD、TLA+、Lean 4 三个领域完全分离——各有独立人设文件 + 独立执行者 prompt，编排者按阶段注入

## [0.5.4] - 2026-07-07

### Added

- **BDD 建模约束完善**：强制独立 `.feature` 文件格式（拒绝 Markdown 模式）、完整 Given/When/Then + 状态/状态转换定义、零 `error/failed/undefined/untested`/步骤缺失门禁、SRS 一致性交互升级流程
- **TLA+ 建模约束完善**：层次化拆解方法（L1→L2→L3 可推广至 N 级）、变量组合拆解阈值（>1k 考虑拆 / >1w 强制拆）、调试前轨迹/状态文件删除、先 SANY 语法检查后 TLC 模型检查的严格顺序、SRS 一致性升级流程（可选项 + 联网调研）
- **Lean 4 建模约束完善**：拆分证明四步循环（骨架 sorry → 独立文件证明 → 拆分多文件 import → 递归至 0 sorry）、SRS 一致性升级流程
- SKILL.md S4/S5 章节从一行指针展开为完整约束
- DESIGN.md 新增 §4.3-4.6 产物建模约束章节（~120 行）
- README.md 新增产物建模硬性约束表
- CLAUDE.md 重构：新增建模约束章节 + 单测试运行命令 + 安全约定

### Changed

- `references/strict-modes.md` S4 BDD 区新增格式要求、质量门禁、SRS 一致性处理
- `prompts/orchestrator_stage_S4.md` 约束区新增完整门禁清单 + SRS 一致性处理
- `prompts/orchestrator_stage_S5.md` TLA+ 区新增层次化拆解、轨迹清理、SRS 升级流程；约束区统一更新
- SKILL.md frontmatter `version` 从 0.5.2 → 0.5.4

## [0.5.2] - 2026-07-02

### Added

- `guided-extract --line '<json>'` 模式：单次 CLI 调用处理一行 JSON，校验通过则追加到输出文件，返回 OK/ERR/DONE。agent 用 `run_command` 即可逐行调用，无需交互式 I/O。

### Fixed

- `index.ts` validate-tla 和 validate-lean 命令使用未定义变量导致崩溃，修复为与其他 27 个命令一致的模式
- `guided-extract.ts` VALID_ID_RE 正则仅允许大写字母，放宽为与 jsonl.ts 一致的 `^R[123]-[A-Za-z0-9_.]+-\d{4}$`
- `SKILL.md` 版本号从 0.5.1 更新为 0.5.2
- `executor-R1.md`/`executor-R2.md`/`executor-R3.md` 的 `source_file` 模板引用不存在的物理分片文件，修复为使用分片 ID

## [0.5.1] - 2026-07-01

### Added

- TLA+ 编码指南 (`references/tlaplus-coding-guide.md`)
- Lean 4 编码指南 (`references/lean4-coding-guide.md`)
- 端到端使用示例 (`examples/end-to-end-walkthrough.md`)
- capability-probe 50 题扩展（8 维度 × 5~10 题，TLA+/Lean 4 工具链验证）

### Changed

- README 新增 Golden 标准参考、端到端示例引导、目录参考
- 5_formal_CHECKLIST 新增 SANY/TLC/lake build 工具链检查项

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
