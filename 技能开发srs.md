# 技能开发需求说明书（SRS-Formalizer v3.5 — 完整冻结版）

## 文档状态

| 字段 | 内容 |
|------|------|
| **版本** | v3.5 |
| **状态** | ✅ 已冻结 |
| **最后更新** | 2026-06-30 |
| **适用范围** | AI Agent 技能开发（LLM 编排者 + TypeScript 确定性脚本混合架构） |
| **工作目录** | 项目根目录下的 `.srs_formalizer/`（安全沙箱，详见 §12.9） |


## 1. 文档概述

| 字段 | 内容 |
|------|------|
| **技能名称** | `srs-formalizer` |
| **技能类型** | Agent 技能（LLM 编排者自主执行） |
| **触发条件** | 用户提供 SRS（软件需求规格说明）文档集，要求生成形式化产出 |
| **输入项** | SRS 文档集（HTML / 单 Markdown / 多目录 Markdown 包） |
| **输出项（4项）** | ① 需求知识图谱（Cypher 脚本）、② BDD（Gherkin `.feature` 文件）、③ TLA+ 形式化规约（条件触发）、④ Lean 4 算法证明（条件触发） |
| **辅助产出** | `STATE.md`、`GAPS.md`、`MINDMAP.md`、`RESEARCH_LOG.md`、`ERRORS.md`、`SRS_PATCHES.md`、`brainstorm_context.json`/`.md`、`security_log.jsonl` |
| **下游消费** | 所有产出物（特别是 `brainstorm_context`）作为 `superpowers:brainstorming` 技能的输入 |
| **架构原则** | **TS 脚本做确定性机械工作；LLM 子代理做语义判断；编排者做流程决策** |
| **依赖策略** | **仅复用 `superpowers-zh` 原子技能**（详见 §10）；TS 脚本为技能自带，无外部 npm 包依赖 |


## 2. 方法论底座

### 2.1 苏格拉底式决策树拷问（S1~S2 阶段激活）

| 规则 | 内容 | 落地方式 |
|------|------|----------|
| **规则一：分支穷尽** | 将模糊目标视为决策树，AI 不生成枝叶，而是沿每个 if-else 分支追问，直到覆盖所有潜在变量和极端情况 | 拷问覆盖度 <100% 时，禁止进入 S2 执行阶段 |
| **规则二：单线程聚焦** | 每次只抛 1 个问题，附带 AI 推荐答案；用户通过"同意/修改/否决"三选一快速推进 | 每轮消息只含 1 个问题，禁止批量问卷 |
| **规则三：信息自足** | 遵循"能查就不问"原则：AI 必须优先扫描已有上下文；只有无法从客观事实中推导的主观决策点才抛给人类 | 拷问前强制读取 `CONTEXT.md` 和 `STATE.md` |

### 2.2 多渠道信息检索与信息缺口管理（S1 阶段激活）

当 SRS 文档存在信息缺失时，技能自动启动深度研究检索机制：

| 检索渠道 | 用途 | 工具映射 |
|----------|------|----------|
| 网络搜索 | 获取行业标准、规范、最新技术动态 | `WebSearch` |
| 网页抓取 | 获取引用链接的完整内容 | `WebFetch` |
| 内部文档 | 扫描项目历史文档、已有设计记录 | `Read`（项目内文件） |

**信息完整性标注体系**：

| 标记 | 含义 | 使用场景 |
|------|------|----------|
| `[已确认]` | 多个可靠来源证实 | 信息已交叉验证 |
| `[待验证]` | 单一来源或需进一步确认 | 暂未找到第二来源佐证 |
| `[信息缺失]` | 该领域暂未找到可靠资料 | 检索后无结果，需用户补充 |
| `[待深入研究]` | 可以进一步展开的方向 | 超出当前研究深度，可后续扩展 |

**不确定性表述规范**（技能强制输出要求）：
- "根据现有资料..."
- "目前可获取的信息表明..."
- "有观点认为...，但也有观点指出..."
- "该领域尚存在争议，主要观点包括..."

### 2.3 研究状态追踪与思维导图总览（贯穿全流程）

| 文件 | 内容 | 更新时机 |
|------|------|----------|
| `STATE.md` | 当前阶段、完成度百分比、已确认分支数、待研究分支数、信息缺失点统计 | 每个子任务完成后更新 |
| `MINDMAP.md` | 思维导图式结构总览，展示 SRS→产出物的映射关系 | S1 阶段创建，S2~S6 持续更新 |
| `GAPS.md` | 所有信息缺口清单（含检索记录、建议补充来源） | 任意阶段发现缺口时追加 |
| `RESEARCH_LOG.md` | 检索策略、渠道、结果汇总（含引用来源明细） | S1 阶段及后续按需补充 |


## 3. 输入规格（Input Specification）

| 维度 | 规格说明 |
|------|----------|
| **原始格式** | 支持三种形态：① 单个 HTML 文件、② 单个 Markdown 文件、③ 多目录多文档 Markdown 包（含交叉引用） |
| **预处理** | 若为多目录包，自动扫描根目录寻找 `README.md` / `index.md` 作为主入口；若无，则按文件名字母序合并所有 `.md` 文件。合并时递归解析 `[](./xxx.md)` 相对路径链接 |
| **章节识别** | 内置解析器识别：`§1.4 术语表`、`§2.9 模块能力矩阵`、`§3.1 功能需求`、`§7 尚未解决问题`、`附录A 技术选型`。若章节编号不标准，通过标题关键词模糊匹配 |
| **信息缺口触发** | 若识别到 §7 尚未解决问题、未定义术语、引用外部规范但未提供原文，自动启动深度研究检索 |
| **分片策略** | 按模块能力矩阵或功能需求切分，每片 ≤ 2万 Token；分片结果写入 `CONTEXT.md` |
| **Token 预算** | 单目标超 12 万 Token 强制拆解为多个子目标分别处理 |


## 4. TypeScript 脚本层架构总览

### 4.1 设计原则

| 原则 | 说明 |
|------|------|
| **确定性优先** | TS 脚本只做输入→输出的纯函数式转换，不涉及 LLM 调用、不产生随机性、不依赖外部 API |
| **语义与机械分离** | 所有需要语义判断的工作由 LLM 子代理完成；TS 脚本负责准备子代理的输入数据、校验产出、执行确定性转换 |
| **可重入性** | 所有脚本可重复执行；若目标文件已存在，可选择覆盖或跳过 |
| **错误可恢复** | 脚本失败时输出结构化错误（JSON 格式），编排者可据此决定重试或回退 |
| **只读查询** | `query-graph.ts` 所有操作均为只读，不修改图谱文件 |
| **路径安全** | 所有文件操作限定在 `.srs_formalizer/` 工作目录内（白名单豁免除外，详见 §12.9） |

### 4.2 脚本目录结构

```
srs-formalizer/
├── skill.md                         # 技能主定义文件
├── prompts/
│   ├── orchestrator_stage_S1.md     # 编排者S1阶段指令
│   ├── orchestrator_stage_S2.md     # 编排者S2阶段指令
│   ├── orchestrator_stage_S3.md     # 编排者S3阶段指令
│   ├── orchestrator_stage_S4.md     # 编排者S4阶段指令
│   ├── orchestrator_stage_S5.md     # 编排者S5阶段指令
│   ├── orchestrator_stage_S6.md     # 编排者S6阶段指令
│   ├── executor-R1.md               # R1 显式提取
│   ├── executor-R2.md               # R2 隐式推导
│   ├── executor-R3.md               # R3 关系推导
│   ├── executor-R4-verify.md        # R4 矛盾检测
│   ├── executor-R4-clarify.md       # R4 信号澄清
│   ├── executor-R5.md               # R5 BDD 充实
│   ├── verifier-R1.md               # R1 校验者
│   ├── verifier-R2.md               # R2 校验者
│   ├── verifier-R3.md               # R3 校验者
│   ├── verifier-R4.md               # R4 校验者
│   ├── verifier-R5.md               # R5 校验者
│   ├── debug-tlc.md                 # TLC反例分析
│   └── debug-lean.md                # Lean错误诊断
├── scripts/
│   ├── index.ts                     # CLI 入口（命令分发）
│   ├── commands/
│   │   ├── init.ts                  # 初始化工作目录
│   │   ├── manifest.ts              # SRS 分片 + 章节识别
│   │   ├── inject-prompt.ts         # 填充子代理提示词模板
│   │   ├── validate-jsonl.ts        # JSONL 格式校验
│   │   ├── build-graph.ts           # 从 JSONL 构建图谱
│   │   ├── analyze-structure.ts     # 结构完整性分析
│   │   ├── merge-structure.ts       # 结构补全合并
│   │   ├── analyze-graph.ts         # 语义去重分析
│   │   ├── merge-analysis.ts        # 语义判定合并
│   │   ├── export-cypher.ts         # 导出 Cypher 脚本
│   │   ├── generate-bdd.ts          # 生成 BDD .feature 骨架
│   │   ├── validate-bdd.ts          # BDD 格式校验
│   │   ├── verify-gate.ts           # 确定性硬门禁检查
│   │   └── query-graph.ts           # 图谱查询与遍历接口
│   ├── lib/
│   │   ├── graph.ts                 # 图数据结构（节点/边/邻接表）
│   │   ├── traversal.ts             # 图遍历算法（BFS/DFS/孤立检测/聚类/路径查找）
│   │   ├── jsonl.ts                 # JSONL 读写 + 校验工具
│   │   ├── cypher.ts                # Cypher 语句生成器
│   │   └── bdd.ts                   # Gherkin 生成器 + 校验器
│   ├── types/
│   │   └── index.ts                 # 共享类型定义
│   ├── package.json                 # 仅依赖 typescript + @types/node
│   └── tsconfig.json
└── templates/
    └── check.sh.template            # 验收闸门脚本模板
```


## 5. TypeScript 脚本详细规格

### 5.1 `init.ts` — 初始化工作目录

| 属性 | 规格 |
|------|------|
| **输入** | `--output <path>` — 必须为项目根目录下的 `.srs_formalizer` |
| **输出** | 创建 `.srs_formalizer/` 及子目录；写入初始 `STATE.md` 模板 |
| **路径校验** | 目标路径必须为 `.srs_formalizer/`（相对于项目根目录），否则拒绝执行 |
| **确定性保证** | 幂等操作：目录已存在则跳过 |
| **错误处理** | 输出结构化 JSON `{"status": "ok"}` 或 `{"status": "error", "message": "..."}` |

### 5.2 `manifest.ts` — SRS 分片 + 章节识别

| 属性 | 规格 |
|------|------|
| **输入** | `--src <path>` — SRS 源文件/目录（白名单：可读取项目任意位置）；`--lang zh\|en`；`--workdir <path>` — 工作目录（必须为 `.srs_formalizer/`） |
| **处理逻辑** | ① 若为目录，扫描合并为临时上下文；② 识别章节标题；③ 按 §2.9 或 §3.1 切分；④ 每片 ≤ 2万 Token |
| **输出** | 写入 `.srs_formalizer/shard/*.md`；`.srs_formalizer/_ctx/shard_index.json` |
| **路径校验** | 输出路径强制在 `.srs_formalizer/` 内；输入路径仅用于读取 |
| **确定性保证** | 相同输入 → 相同分片输出（基于内容哈希） |
| **错误处理** | 若章节识别失败，输出 warning 并全文切分 |

### 5.3 `inject-prompt.ts` — 填充子代理提示词模板

| 属性 | 规格 |
|------|------|
| **输入** | `--template <path>` — 模板路径（白名单：仅限技能包 `prompts/` 目录）；`--params <json>` |
| **处理逻辑** | 将 `{{PARAM}}` 占位符替换为实际值；对用户输入中的 `{{` 和 `}}` 进行转义，防止模板注入 |
| **输出** | stdout 返回完整提示词文本（不写入文件） |
| **路径校验** | 模板路径必须位于技能包的 `prompts/` 目录内 |
| **确定性保证** | 纯字符串替换，无副作用 |

### 5.4 `validate-jsonl.ts` — JSONL 格式校验

| 属性 | 规格 |
|------|------|
| **输入** | `--file <path>` — 必须为 `.srs_formalizer/` 内的 JSONL 文件；`--schema <path>`（可选） |
| **检查项** | ① 每行为合法 JSON；② 必填字段存在；③ `id` 格式匹配 `R[123]-[A-Za-z0-9_.]+-\d{4}`；④ `category` 在允许枚举内；⑤ 无空 `statement`；⑥ 无重复 `id` |
| **输出** | `{"valid": true/false, "errors": [...], "warnings": [...], "record_count": N}` |
| **路径校验** | 文件路径必须位于 `.srs_formalizer/` 内 |
| **确定性保证** | 纯校验逻辑 |

### 5.5 `build-graph.ts` — 从 JSONL 构建图谱

| 属性 | 规格 |
|------|------|
| **输入** | `--workdir <path>` — 工作目录（`.srs_formalizer/`） |
| **处理逻辑** | ① 读取 `.srs_formalizer/r1-explicit/`、`r2-implicit/`、`r3-relational/` 下所有 JSONL；② 按 `id` 去重；③ 创建节点；④ 建立边；⑤ 生成邻接表和反向索引 |
| **输出** | `.srs_formalizer/graph/graph.json` |
| **路径校验** | 所有读写路径均在 `.srs_formalizer/` 内 |
| **确定性保证** | 相同 JSONL → 相同图谱 |

### 5.6 `analyze-structure.ts` — 结构完整性分析

| 属性 | 规格 |
|------|------|
| **输入** | `--workdir <path>` — 工作目录（`.srs_formalizer/`） |
| **图遍历算法** | ① 孤立需求检测（入度=0且出度=0）；② 逻辑gap检测（悬挂边）；③ 概念gap检测（聚类中概念出现次数=1） |
| **输出** | `.srs_formalizer/analysis/orphan_nodes.jsonl`、`dangling_edges.jsonl`、`concept_islands.jsonl`、`subagent_prompts/structure_gap_analysis.md` |
| **路径校验** | 所有读写路径均在 `.srs_formalizer/` 内 |
| **确定性保证** | 图遍历完全确定 |

### 5.7 `merge-structure.ts` — 结构补全合并

| 属性 | 规格 |
|------|------|
| **输入** | `--workdir <path>` — 工作目录（`.srs_formalizer/`）；补全建议来自子代理（JSONL） |
| **处理逻辑** | ① 读取子代理补全建议；② `add_relation` → 新增边；③ `fix_dangling` → 修正边目标；④ `add_requirement` → 新增 `:SupplementalRequirement` 节点；⑤ 记录变更日志 |
| **输出** | `.srs_formalizer/graph/graph.structure_fixed.json`；`.srs_formalizer/graph/structure_merge_log.jsonl` |
| **路径校验** | 所有读写路径均在 `.srs_formalizer/` 内 |
| **确定性保证** | 相同建议 → 相同合并结果 |

### 5.8 `analyze-graph.ts` — 语义去重分析

| 属性 | 规格 |
|------|------|
| **输入** | `--workdir <path>` — 工作目录（`.srs_formalizer/`） |
| **图遍历算法** | ① 相似度计算（Jaccard）；② 社区检测；③ 反义检测；④ 同对象多侧面检测 |
| **输出** | `.srs_formalizer/analysis/suspected_duplicates.jsonl`、`suspected_conflicts.jsonl`、`same_aspect_clusters.jsonl`、`subagent_prompts/duplicate_analysis.md`、`conflict_analysis.md`、`aspect_analysis.md` |
| **路径校验** | 所有读写路径均在 `.srs_formalizer/` 内 |
| **确定性保证** | 算法完全确定 |

### 5.9 `merge-analysis.ts` — 语义判定合并

| 属性 | 规格 |
|------|------|
| **输入** | `--workdir <path>` — 工作目录（`.srs_formalizer/`） |
| **处理逻辑** | ① `duplicate` → 合并节点；② `conflict` → 新增 `:CONFLICTS_WITH` 边；③ `same_aspect` → 新增 `:SAME_ASPECT` 边 |
| **输出** | `.srs_formalizer/graph/graph.merged.json`；`.srs_formalizer/graph/merge_log.jsonl` |
| **路径校验** | 所有读写路径均在 `.srs_formalizer/` 内 |
| **确定性保证** | 相同判定 → 相同合并结果 |

### 5.10 `export-cypher.ts` — 导出 Cypher 脚本

| 属性 | 规格 |
|------|------|
| **输入** | `--workdir <path>` — 工作目录（`.srs_formalizer/`） |
| **处理逻辑** | 遍历所有节点生成 `CREATE` 语句；遍历所有边生成关系语句；添加唯一性约束 |
| **输出** | `outputs/knowledge_graph/schema.cypher`（在工作目录内） |
| **路径校验** | 输出路径在 `.srs_formalizer/` 内 |
| **确定性保证** | 相同图谱 → 相同 Cypher |

### 5.11 `generate-bdd.ts` — 生成 BDD 骨架

| 属性 | 规格 |
|------|------|
| **输入** | `--workdir <path>` — 工作目录（`.srs_formalizer/`） |
| **处理逻辑** | 按 `Module` 分组 → 生成 Feature → 为每个 Requirement 生成 Scenario，Then 为 `<THEN_PLACEHOLDER>` |
| **输出** | `.srs_formalizer/features/<module>.feature` |
| **路径校验** | 输出路径在 `.srs_formalizer/` 内 |
| **确定性保证** | 相同图谱 → 相同骨架 |

### 5.12 `validate-bdd.ts` — BDD 格式校验

| 属性 | 规格 |
|------|------|
| **输入** | `--workdir <path>` — 工作目录（`.srs_formalizer/`） |
| **检查项** | ① Gherkin 语法合法；② 含 Given/When/Then；③ 无 `<THEN_PLACEHOLDER>` 残留；④ 每个 Then 标注 `verification_method` |
| **输出** | `{"valid": true/false, "errors": [...], "warnings": [...]}` |
| **路径校验** | 读取路径在 `.srs_formalizer/features/` 内 |
| **确定性保证** | 纯校验逻辑 |

### 5.13 `verify-gate.ts` — 确定性硬门禁

| 属性 | 规格 |
|------|------|
| **输入** | `--workdir <path>` — 工作目录（`.srs_formalizer/`）；`--stage R1\|R2\|R3\|R4\|R5\|FINAL` |
| **检查项** | ① JSONL 存在性；② ID 唯一性；③ 记录数守恒；④ `source_file` 存在性（SRS源在外部，仅验证路径有效性）；⑤ 图谱可加载（R3+）；⑥ BDD 通过（R5+） |
| **输出** | `{"pass": true/false, "checks": {...}, "errors": [...]}`；退出码 0 表示通过 |
| **路径校验** | 工作目录必须在 `.srs_formalizer/` 内 |
| **确定性保证** | 纯校验逻辑 |

### 5.14 `query-graph.ts` — 图谱查询与遍历接口

| 属性 | 规格 |
|------|------|
| **设计目标** | 为 `superpowers:brainstorming` 技能提供结构化、只读的图谱查询接口 |
| **输入** | `--workdir <path>` — 工作目录（`.srs_formalizer/`）；`--query <type>`；`--params <json>` |
| **查询类型** | `get-node`、`get-neighbors`、`get-module`、`list-modules`、`find-path`、`get-context`、`export-brainstorm` |
| **输出** | 查询结果 JSON（stdout）；`export-brainstorm` 输出至 `.srs_formalizer/outputs/brainstorming/` |
| **路径校验** | 所有读写路径在 `.srs_formalizer/` 内 |
| **确定性保证** | 所有查询为纯只读操作；相同查询参数 → 相同输出 |
| **性能要求** | 单次查询 ≤ 5秒；路径查找 BFS 复杂度 O(V+E) |


## 6. 子代理语义分析接口规范

### 6.1 结构补全子代理接口

**输入格式**（由 `analyze-structure.ts` 生成）：
```markdown
| 缺陷ID | 类型 | 节点/边ID | 上下文 | SRS原文引用 |
|--------|------|-----------|--------|-------------|
| ORPHAN-001 | 孤立需求 | R1-S003-0007 | "系统应支持多因素认证" | §3.2.1 |

## 输出格式（JSONL）
{"gap_id": "...", "suggestion_type": "add_relation|fix_dangling|add_requirement", "suggestion": "...", "reasoning": "...", "confidence": "high|medium|low"}
```

### 6.2 语义去重子代理接口

**输入格式**（由 `analyze-graph.ts` 生成）：
```markdown
| 对ID | 节点A | 节点B | 相似度 |
|------|-------|-------|--------|
| DUP-001 | R1-S001-0001: "..." | R1-S001-0012: "..." | 0.82 |

## 输出格式（JSONL）
{"pair_id": "...", "verdict": "duplicate|unique|partial_overlap|conflict|consistent|same_aspect|different", "reasoning": "...", "recommended_action": "merge|add_conflict_edge|add_aspect_edge|none"}
```

### 6.3 子代理输出校验规则

| 校验项 | 违规处理 |
|--------|----------|
| `pair_id` / `gap_id` 必须存在于原始清单 | 跳过该条，记录警告 |
| `verdict` / `suggestion_type` 必须为枚举值 | 拒绝全部，退出码非零 |
| `reasoning` 非空且长度 ≥ 10 字符 | 拒绝该条 |
| `recommended_action` 与 `verdict` 逻辑一致 | 不一致则自动修正并记录警告 |

### 6.4 子代理文件操作约束

所有子代理的输出必须写入 `.srs_formalizer/` 目录内，由编排者通过交接契约和提示词强制约束。子代理不得访问工作目录外的任何路径。


## 7. 工作流（六阶段 + TS 集成）

### 7.1 S1 阶段：预处理与深度检索
```
[编排者] 读取 SRS（白名单：外部路径）→ 识别格式
    ↓
[TS] init --output .srs_formalizer → 创建工作目录
[TS] manifest --src <SRS路径> --workdir .srs_formalizer → 分片
    ↓（产出：.srs_formalizer/shard/*.md + _ctx/shard_index.json）
[编排者] 识别信息缺口（优先级P0~P3）→ 并行执行 WebSearch/WebFetch
    ↓（检索结果写入 .srs_formalizer/GAPS.md + search_results.jsonl）
[编排者] 更新 .srs_formalizer/STATE.md（S1 完成）
```

### 7.2 S2 阶段：需求提取
```
[编排者] 获取分片清单（每批 ≤3）
    ↓
[TS] inject-prompt --template prompts/executor-R1.md → 填充提示词
    ↓（提示词含工作目录约束）
[子代理] 执行者-R1/R2/R3 → 产出 JSONL 至 .srs_formalizer/r1-explicit/ 等
    ↓
[TS] validate-jsonl --file .srs_formalizer/r1-explicit/*.jsonl → 格式校验
[子代理] 校验者-R1/R2/R3 → 独立审核
    ↓（APPROVED 后）
[编排者] 更新 .srs_formalizer/STATE.md
```

### 7.3 S3 阶段：图谱构建 → 结构补全 → 语义去重 → 导出
```
[TS] build-graph --workdir .srs_formalizer
[TS] analyze-structure --workdir .srs_formalizer
    ↓（产出缺陷清单 + 子代理提示词至 .srs_formalizer/analysis/）
[子代理] 结构补全子代理 → 产出补全建议 JSONL 至 .srs_formalizer/analysis/
[TS] merge-structure --workdir .srs_formalizer
[TS] analyze-graph --workdir .srs_formalizer
[子代理] 语义去重子代理 → 产出判决 JSONL 至 .srs_formalizer/analysis/
[TS] merge-analysis --workdir .srs_formalizer
[TS] export-cypher --workdir .srs_formalizer
[TS] verify-gate --workdir .srs_formalizer --stage R3
[编排者] 更新 .srs_formalizer/STATE.md、MINDMAP.md
```

### 7.4 S4 阶段：BDD 生成与充实
```
[TS] generate-bdd --workdir .srs_formalizer
[TS] inject-prompt --template prompts/executor-R5.md
[子代理] 执行者-R5 → 填充 Then + verification_method
[TS] validate-bdd --workdir .srs_formalizer
[编排者] 更新 .srs_formalizer/BEHAVIORS.md、STATE.md
```

### 7.5 S5 阶段：条件触发形式化
```
[编排者] 读取 .srs_formalizer/PLAN.md 启用矩阵；检查工具链就绪
    ↓
=== TLA+ 层次化建模 ===
[编排者] 清理旧轨迹/状态文件（*.traj, *.state）— 在工作目录内
[子代理] TLA+ 执行者 → 按层级编写 .tla，写入 .srs_formalizer/specs/
    ↓（每级）[系统] tlc → 检查变量组合数
[系统] tlc → 验证死锁/不变量/活性/状态空间
    ├─ 失败 → [子代理] 定位根因
    │   ├─ 根因在SRS设计 → .srs_formalizer/SRS_PATCHES.md → 暂停，用户确认
    │   └─ 根因在规约 → 修正 → 重新tlc
    └─ 全部通过 → 冻结
[编排者] 写入 .srs_formalizer/SPECS.md
    ↓
=== Lean 4 拆分证明 ===
[子代理] Lean 4 执行者 → 编写证明骨架（带 sorry），写入 .srs_formalizer/proofs/
[子代理] 拆分每个 sorry 为独立 .lean 文件 → 编写完整 proof
[系统] lake build → 在工作目录内验证
[编排者] 写入 .srs_formalizer/PROOFS.md
[编排者] 更新 .srs_formalizer/STATE.md（S5 完成）
```

### 7.6 S6 阶段：验收闸门 + 头脑风暴上下文导出
```
[TS] verify-gate --workdir .srs_formalizer --stage FINAL
[TS] validate-bdd --workdir .srs_formalizer
[子代理] 校验者 → 最终语义审查
    ↓
[TS] query-graph --workdir .srs_formalizer --query export-brainstorm
    ↓（产出 .srs_formalizer/outputs/brainstorming/）
[编排者] 更新 .srs_formalizer/MINDMAP.md 全部状态为 ✅
[编排者] 输出最终交付物清单
```


## 8. 四类产出物详细规格

### 8.1 产出1：需求知识图谱（Cypher 脚本）
| 维度 | 规格 |
|------|------|
| **数据来源** | S2 阶段 JSONL（R1/R2/R3） |
| **图结构** | 节点：`:Requirement`、`:ImplicitRequirement`、`:RelationalRequirement`、`:Actor`、`:Module`、`:Constraint`、`:SupplementalRequirement`；关系：`:DERIVED_FROM`、`:CONFLICTS_WITH`、`:REFINES`、`:DEPENDS_ON`、`:SATISFIES`、`:SAME_ASPECT` |
| **最终交付格式** | Neo4j 可导入的 Cypher 脚本（`.cypher`），位于 `.srs_formalizer/outputs/knowledge_graph/` |
| **等价性保证** | 节点总数 ≥ R1 显式需求数；无孤立节点（除非用户确认保留） |

### 8.2 产出2：BDD（Gherkin 特性文件）
| 维度 | 规格 |
|------|------|
| **文件头部标注（强制）** | `# SYSTEM: <系统名称>`、`# TRACE: <追踪号>`、`# TLA_REFS: <路径>`、`# LEAN_REFS: <路径>` |
| **建模要求** | ① 符合SRS设计并细化；② 独立`.feature`文件；③ 完整Given/When/Then；④ 完整定义状态和状态转换 |
| **通过标准** | ① 语法合法；② 步骤全定义；③ 场景全通过；④ 无占位符；⑤ 每个Then含`verification_method` |
| **交付位置** | `.srs_formalizer/features/*.feature` |
| **失败处理** | 建模与SRS一致→回写SRS→用户确认；不一致→修正建模 |

### 8.3 产出3：TLA+ 形式化建模（条件触发）
| 维度 | 规格 |
|------|------|
| **触发条件** | 微服务协作、并行进程、分布式锁、资源争抢、分布式事务、共识协议、跨服务状态机 |
| **层次化建模** | L1系统级→L2子系统级→L3原子级→...N级；拆解阈值：>1k考虑拆，>1w必须拆 |
| **文件头部标注** | `\* SYSTEM:`、`\* TRACE:`、`\* PARENT:`、`\* PEER:`、`\* CHILD:` |
| **建模要素** | `Init`、`Next`、`Spec`；≥1个`Invariant`、≥1个`Liveness` |
| **通过标准** | ① 语法检查通过；② 模型检查通过；③ 无死锁；④ 无状态爆炸；⑤ 无不变量违反；⑥ 无实现错误 |
| **交付位置** | `.srs_formalizer/specs/<层级>_<模块>.tla` |
| **失败处理** | 死锁/不变量违反→根因定位→SRS设计缺陷则回写SRS→用户确认→修正→重新验证 |

### 8.4 产出4：Lean 4 算法证明（条件触发）
| 维度 | 规格 |
|------|------|
| **触发条件** | 非常见算法、安全关键、密码学协议、金融核心、复杂调度、自定义数据结构 |
| **文件头部标注** | `-- SYSTEM:`、`-- TRACE:`、`-- ALGORITHM:` |
| **拆分工作流** | 骨架(sorry)→拆分为独立文件→import→逐个证明→递归至无sorry→lake build |
| **通过标准** | ① lake build成功；② 无实现错误；③ 无不完整实现；④ 无sorry残留；⑤ 无告警；⑥ 无axiom；⑦ 允许Mathlib |
| **交付位置** | `.srs_formalizer/proofs/*.lean`（含 `lakefile.lean`） |
| **失败处理** | lake build失败→根因定位→SRS设计缺陷则回写SRS→用户确认→修正→重新验证 |

### 8.5 SRS回写规范
| 步骤 | 动作 | 产出 |
|------|------|------|
| 1 | 检测缺陷，记录至`.srs_formalizer/ERRORS.md` | `ERRORS.md`增量 |
| 2 | 生成修正建议 | `.srs_formalizer/SRS_PATCHES.md` |
| 3 | **暂停自动执行**，提交用户审查 | 等待用户确认 |
| 4 | 用户确认后回写SRS（外部文件，白名单写入），标注`[SRS-FORMALIZER修正 YYYY-MM-DD]` | SRS更新（外部） |
| 5 | 记录至`.srs_formalizer/STATE.md` | `STATE.md`更新 |
| 6 | 从缺陷发现阶段重新执行 | 重新验证 |

**原则**：不自动修改SRS；可追溯；可回滚（`.srs_formalizer/SRS_backup_<timestamp>.md`）；闭环验证。


## 9. 校验与停止条件（双重门禁）

| 门禁层级 | 执行方式 | 检查内容 | 失败处理 |
|---------|---------|---------|---------|
| **硬门禁（Tier 2）** | `verify-gate.ts` | ID唯一性、计数守恒、文件存在性、图谱可加载、BDD格式 | 直接 FAILED，退回执行单元 |
| **软门禁（Tier 1）** | 校验者子代理 | 编造检测、遗漏扫描、分类合理性、TLA+反例、Lean证明 | REJECTED → ≤3次RETRY，>3次BLOCKED |

**终极停止条件**：
1. `verify-gate --stage FINAL` 通过
2. 校验者 APPROVED
3. TLA+ 触发模块 TLC 无反例、无死锁、无不变量违反
4. Lean 4 触发模块 `lake build` 通过，无 `sorry` 残留
5. `validate-bdd` 通过
6. `.srs_formalizer/GAPS.md` 中 `[信息缺失]` 项全部标注
7. `.srs_formalizer/MINDMAP.md` 全部模块状态为 ✅
8. 所有SRS回写已完成并经用户确认


## 10. 与 `superpowers-zh` 的集成映射（唯一外部依赖）

| `superpowers-zh` 技能 | 本技能调用场景 | 调用方式 |
|-----------------------|---------------|----------|
| `brainstorming` | S6 之后：产出作为其输入 | 下游技能输入 |
| `writing-plans` | S2~S4：规划提取步骤、导出策略 | 子代理任务 |
| `executing-plans` | S2 需求提取、S5 TLA+/Lean 编写 | 执行者子代理 |
| `verification-before-completion` | S4 BDD校验、S6 最终闸门 | 校验者子代理 |
| `test-driven-development` | S5：TLA+/Lean 作为测试先行驱动 | 方法论指导 |
| `systematic-debugging` | TLC反例/Lean错误/SRS缺陷根因定位 | 故障分析子代理 |
| `requesting-code-review` | S6：代码审查摘要；SRS_PATCHES.md 审查前摘要 | 审查报告生成 |

> **明确禁止**：不得调用 `linear-loop-orchestration`、`srs-extraction-md`、`deep-research` 或任何其他未列入上表的外部技能。


## 11. 产出文件体系总览

所有产出文件**必须**位于 `.srs_formalizer/` 目录内：

| 文件/目录 | 内容 | 更新时机 |
|-----------|------|----------|
| `.srs_formalizer/STATE.md` | 当前阶段、完成度、阻塞点、闭环日志、SRS回写记录 | 每个子任务完成后 |
| `.srs_formalizer/CONTEXT.md` | SRS术语表、模块切片索引 | S1 写入，S2~S4 补充 |
| `.srs_formalizer/PLAN.md` | 冻结执行计划 | 拷问结束后冻结 |
| `.srs_formalizer/ADR/` | 架构决策记录 | 每次触发条件判定后新增 |
| `.srs_formalizer/BEHAVIORS.md` | BDD分层建模索引 + 三性状态 + 追踪号映射 | S4 写入 |
| `.srs_formalizer/SPECS.md` | TLA+规约索引 | S5 写入 |
| `.srs_formalizer/PROOFS.md` | Lean 4证明索引 | S5 写入 |
| `.srs_formalizer/MINDMAP.md` | 思维导图式结构总览 + 状态标记 | S1创建，S2~S6持续更新 |
| `.srs_formalizer/GAPS.md` | 信息缺口追踪 | 任意阶段发现缺口时追加 |
| `.srs_formalizer/RESEARCH_LOG.md` | 检索策略、渠道、结果汇总 | S1及按需补充 |
| `.srs_formalizer/ERRORS.md` | 冲突、校验失败、工具链缺失、TLC反例、Lean错误 | 任意阶段触发错误时追加 |
| `.srs_formalizer/SRS_PATCHES.md` | SRS修正建议 | S5发现设计缺陷时生成 |
| `.srs_formalizer/SRS_backup_<timestamp>.md` | SRS回写前版本快照 | SRS回写前自动生成 |
| `.srs_formalizer/security_log.jsonl` | 所有文件操作审计日志 | 每次文件读写操作后追加 |
| `.srs_formalizer/outputs/brainstorming/` | 头脑风暴上下文 | S6生成 |
| `.srs_formalizer/check.sh` | 终极验收脚本 | S6生成 |


## 12. 非功能性需求

| 约束 | 规格 |
|------|------|
| **上下文隔离** | 校验者角色必须在新会话执行；S5执行阶段清空拷问历史 |
| **Token预算分配** | 编排者15%、执行者45%、校验者20%、故障分析10%、联网搜索5%、缓冲5% |
| **上下文压缩** | 大SRS摘要化；历史裁剪（≥S4且轮次>20）；冗余去重；紧急截断（>90%时暂停） |
| **错误重试上限** | 单阶段REJECTED≤3轮；连续2次相同错误触发断路器 |
| **TS运行环境** | Node.js ≥20；仅依赖typescript + @types/node |
| **TS性能** | 单次执行≤30秒；图遍历O(V+E)；查询≤5秒 |
| **查询接口只读** | `query-graph.ts`所有操作为只读 |
| **SRS回写** | 不得自动修改；必须经用户确认；每次备份 |
| **TLA+拆解阈值** | >1k建议拆解，>1w强制拆解 |
| **Lean拆分递归** | 深度无上限，直至所有`sorry`消除 |
| **工具链依赖** | Java（TLC）、Lean 4（elan + lake）；缺失时输出安装指引至 `.srs_formalizer/ERRORS.md` |
| **工作目录安全沙箱** | 所有文件操作限定在 `.srs_formalizer/` 内；白名单豁免详见 §12.9 |

### 12.9 工作目录安全沙箱（文件系统边界控制）

#### 12.9.1 核心原则

| 原则 | 说明 |
|------|------|
| **默认拒绝** | 所有文件读写操作默认仅允许在 `.srs_formalizer/` 目录内进行 |
| **显式白名单** | 仅以下操作可访问工作目录外的路径 |
| **越界即阻断** | 任何越界访问尝试触发安全拦截，记录至 `.srs_formalizer/ERRORS.md`，暂停执行 |
| **路径规范化** | 所有路径在操作前经过 `path.resolve()` 规范化，防止 `../` 路径遍历攻击 |

#### 12.9.2 白名单豁免（允许越界操作）

| 豁免操作 | 说明 | 工具/方式 |
|---------|------|----------|
| **联网搜索** | `WebSearch` / `WebFetch` 为工具调用，不涉及本地文件系统 | 编排者工具调用 |
| **读取原始SRS** | 用户提供的SRS源文件（可能位于项目任意位置） | `Read` 工具，仅限 `--src` 参数指定的路径 |
| **读取技能模板** | `prompts/` 目录下的模板文件（位于技能包内） | `Read` 工具，仅限技能包路径 |
| **读取技能说明** | `skill.md` 主技能文件 | `Read` 工具，仅限技能包路径 |
| **读取技能参考** | `references/` 目录下的参考文档 | `Read` 工具，仅限技能包路径 |
| **运行技能脚本** | 执行 `scripts/` 目录下的 TypeScript 脚本 | `Bash` / `npm run`，仅限技能包路径 |
| **SRS回写** | 用户确认后将修正写回原始SRS文件 | `Edit` 工具，仅限原始SRS路径 |

#### 12.9.3 路径安全校验规则

**所有 TS 脚本在执行任何文件操作前，必须执行路径安全校验：**

```typescript
function isPathSafe(targetPath: string, workDir: string): boolean {
  const resolved = path.resolve(targetPath);
  const workDirResolved = path.resolve(workDir);
  
  // 1. 检查是否在工作目录内
  if (resolved.startsWith(workDirResolved)) return true;
  
  // 2. 检查是否在白名单豁免路径内
  if (isWhitelisted(resolved)) return true;
  
  return false; // 拒绝
}
```

| 校验场景 | 校验方式 | 违规处理 |
|---------|---------|----------|
| 脚本写入文件 | 目标路径必须 `startsWith(.srs_formalizer/)` | 抛出异常，退出码非零 |
| 脚本读取文件（非SRS源） | 目标路径必须 `startsWith(.srs_formalizer/)` | 抛出异常，退出码非零 |
| 脚本读取SRS源 | 目标路径必须是用户指定的 `--src` 参数 | 仅允许读取，禁止写入 |
| 脚本读取技能模板 | 目标路径必须 `startsWith(<skill_root>/prompts/)` | 仅允许读取，禁止写入 |
| 子代理文件操作 | 由编排者通过交接契约约束 | 越界尝试 → 编排者捕获并终止 |

#### 12.9.4 越界行为处理策略

| 越界类型 | 检测时机 | 处理方式 |
|---------|---------|----------|
| TS脚本尝试写入工作目录外 | 脚本执行时 | 抛出 `SecurityError`，退出码非零；编排者记录 `.srs_formalizer/ERRORS.md`，暂停 |
| TS脚本尝试读取非白名单路径 | 脚本执行时 | 抛出 `SecurityError`，退出码非零；编排者记录 `ERRORS.md`，暂停 |
| 子代理被诱导访问外部路径 | 编排者审影子代理产出 | 检测到产出中引用外部路径 → REJECTED，返回修正指令 |
| 编排者误调用外部路径 | 编排者自身决策 | 通过脚本内置安全校验拦截 |

#### 12.9.5 TS脚本实现要求

所有 `scripts/commands/*.ts` 中的脚本必须：

1. **在 `main()` 函数开头执行路径校验**，验证所有输入输出路径
2. **拒绝接受 `../` 或绝对路径**（除白名单豁免外），统一使用 `--workdir` 参数
3. **输出安全日志**：每次文件操作记录至 `.srs_formalizer/security_log.jsonl`
4. **使用 `--workdir` 参数**：脚本通过 `process.chdir(workDir)` 将运行上下文锁定到 `.srs_formalizer/`


## 13. 工具链就绪检查

| 工具 | 检查命令 | 缺失时处理 |
|------|---------|-----------|
| Node.js ≥20 | `node --version` | 安装指引至 `.srs_formalizer/ERRORS.md`，暂停 |
| TLA+ Toolbox（tlc） | `java -jar tla2tools.jar` | 下载指引，标记不可用 |
| Lean 4（elan + lake） | `lake --version` | 安装指引，标记不可用 |


## 14. 产物关联矩阵

| 产出物 | 头部标注 | 引用方式 | 回写SRS条件 |
|--------|---------|---------|------------|
| **BDD `.feature`** | SYSTEM, TRACE, TLA_REFS, LEAN_REFS | 相对路径/PENDING | 步骤失败且建模与SRS一致 |
| **TLA+ `.tla`** | SYSTEM, TRACE, PARENT, PEER, CHILD | SRS追踪号；上下级TLA路径 | TLC发现死锁/不变量违反 |
| **Lean 4 `.lean`** | SYSTEM, TRACE, ALGORITHM | SRS追踪号；import子文件 | lake build失败且SRS算法规约有误 |
| **`brainstorm_context.json`** | — | 引用`graph.merged.json`全量 | — |


## 15. 需求冻结确认

| 审查项 | 状态 |
|--------|------|
| 输入规格 | ✅ |
| 方法论底座（苏格拉底+深度研究） | ✅ |
| TS脚本层架构（14个脚本） | ✅ |
| 结构补全→语义去重→导出（S3三阶段） | ✅ |
| TLA+层次化建模+拆解阈值 | ✅ |
| Lean拆分证明工作流 | ✅ |
| BDD/TLA+/Lean头部标注 | ✅ |
| SRS回写规范 | ✅ |
| 四类产出物规格 | ✅ |
| 子代理接口规范 | ✅ |
| 双重门禁 | ✅ |
| 提示词工程（分层/版本/注入防护） | ✅ |
| 上下文预算管理 | ✅ |
| 验证工程（三层/可观测性/质量门禁） | ✅ |
| 智能体交接协议 | ✅ |
| 驾驭工程（行为边界/防漂移/回退） | ✅ |
| Loop工程（三层反馈/断路器/反模式防御） | ✅ |
| 联网搜索分析 | ✅ |
| **工作目录安全沙箱（白名单+路径校验+审计）** | ✅ |
| `superpowers-zh`唯一依赖 | ✅ |
| 产物关联矩阵 | ✅ |
| 非功能性需求 | ✅ |
| 工具链就绪检查 | ✅ |