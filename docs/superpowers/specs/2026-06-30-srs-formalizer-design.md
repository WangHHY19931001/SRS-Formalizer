# SRS-Formalizer 技能设计文档

## 文档状态

| 字段 | 内容 |
|------|------|
| **版本** | v1.1 |
| **状态** | ✅ 已确认 |
| **创建日期** | 2026-06-30 |
| **基于** | SRS-Formalizer v3.5（已冻结） |
| **技能名称** | `srs-formalizer` |
| **技能类型** | Agent 技能（LLM 编排者 + TypeScript 确定性脚本混合架构） |

---

## 1. 设计决策汇总

| # | 决策点 | 选择 | 原因 |
|---|--------|------|------|
| 1 | 实施策略 | C：按阶段串行（S1→S6） | SRS 六阶段依赖明确，串行可保证每阶段独立可执行 |
| 2 | 测试框架 | `node --test` + `assert` | 零外部依赖，符合 SRS §12 约束，TypeScript strict 模式静态检查 |
| 3 | 技能位置 | `.claude/skills/srs-formalizer/` | 集成到 superpowers-zh 生态 |
| 4 | 默认语言 | `zh` | 适配 superpowers-zh 中文生态 |
| 5 | 阶段交付 | A：全交付（脚本 + 提示词 + 模板） | 每阶段独立可执行 |
| 6 | 实施路径 | A：TDD 经典（红→绿→重构） | SRS 每个脚本声明了确定性保证，天然适配 TDD |
| 7 | Rust 加速 | 可选插件模式（TS 默认 + napi-rs 可选） | 仅加速 Jaccard 去重 + Louvain 社区检测两个热点 |

---

## 2. 完整目录结构

```
.claude/skills/srs-formalizer/
│
├── SKILL.md                          # ① 技能入口文件
│                                    #   YAML frontmatter + 编排者行为规则
│                                    #   <500 行，行为自足
│
├── scripts/                          # ② TS 确定性脚本
│   ├── package.json                 #   typescript + @types/node（零其他依赖）
│   ├── tsconfig.json                #   strict 全家桶
│   ├── index.ts                     #   CLI 入口（命令分发）
│   ├── commands/                    #   14 个命令脚本
│   │   ├── init.ts                  #   [S1] 初始化工作目录
│   │   ├── manifest.ts              #   [S1] SRS 分片 + 章节识别
│   │   ├── inject-prompt.ts         #   [S2] 填充提示词模板
│   │   ├── validate-jsonl.ts        #   [S2] JSONL 格式校验
│   │   ├── build-graph.ts           #   [S3] 从 JSONL 构建图谱
│   │   ├── analyze-structure.ts     #   [S3] 结构完整性分析
│   │   ├── merge-structure.ts       #   [S3] 结构补全合并
│   │   ├── analyze-graph.ts         #   [S3] 语义去重分析
│   │   ├── merge-analysis.ts        #   [S3] 语义判定合并
│   │   ├── export-cypher.ts         #   [S3] 导出 Cypher 脚本
│   │   ├── generate-bdd.ts          #   [S4] 生成 BDD 骨架
│   │   ├── validate-bdd.ts          #   [S4] BDD 格式校验
│   │   ├── verify-gate.ts           #   [S1] 确定性硬门禁（随阶段扩充）
│   │   └── query-graph.ts           #   [S6] 图谱查询与遍历接口
│   ├── lib/                         #   共享库
│   │   ├── graph.ts                 #   [S3] 图数据结构（节点/边/邻接表）
│   │   ├── traversal.ts             #   [S3] 图遍历算法（BFS/DFS/孤立检测/聚类/路径查找）
│   │   ├── jsonl.ts                 #   [S1] JSONL 读写 + 校验工具
│   │   ├── cypher.ts                #   [S3] Cypher 语句生成器
│   │   ├── bdd.ts                   #   [S4] Gherkin 生成器 + 校验器
│   │   ├── security.ts              #   [S1] 路径安全校验 + 审计日志
│   │   └── native-bridge.ts         #   [S3] Rust 后端抽象接口（可选加速）
│   ├── types/
│   │   └── index.ts                 #   共享类型定义（随阶段扩充）
│   ├── __tests__/                   # ③ 脚本单元测试
│   │   ├── init.test.ts
│   │   ├── manifest.test.ts
│   │   ├── validate-jsonl.test.ts
│   │   ├── build-graph.test.ts
│   │   ├── ...
│   │   └── fixtures/                #   测试夹具
│   └── native/                      #   Rust 加速后端（可选）
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs               #   napi-rs 入口
│           ├── similarity.rs        #   Jaccard/Cosine 相似度
│           ├── community.rs         #   Louvain 社区检测
│           └── graph.rs             #   图数据结构
│
├── tests/                            # ④ 黄金全流程用例
│   ├── golden/                      #   每阶段 ≥3 个场景
│   │   ├── s1-preprocess.md
│   │   ├── s2-extraction.md
│   │   ├── s3-graph.md
│   │   ├── s4-bdd.md
│   │   ├── s5-formal.md
│   │   └── s6-gate.md
│   ├── fixtures/                    #   测试输入物料
│   │   ├── srs-sample-zh.md
│   │   ├── srs-sample-en.md
│   │   └── srs-multi-dir/
│   └── assertions/
│       └── eval-spec.yaml           #   评估规格
│
├── prompts/                          #   子代理提示词（L3: 按需加载）
│   ├── orchestrator_stage_S1.md
│   ├── orchestrator_stage_S2.md
│   ├── orchestrator_stage_S3.md
│   ├── orchestrator_stage_S4.md
│   ├── orchestrator_stage_S5.md
│   ├── orchestrator_stage_S6.md
│   ├── executor-R1.md
│   ├── executor-R2.md
│   ├── executor-R3.md
│   ├── executor-R4-verify.md
│   ├── executor-R4-clarify.md
│   ├── executor-R5.md
│   ├── verifier-R1.md
│   ├── verifier-R2.md
│   ├── verifier-R3.md
│   ├── verifier-R4.md
│   ├── verifier-R5.md
│   ├── debug-tlc.md
│   └── debug-lean.md
│
├── references/                       # ⑤ 参考文档（L3: 按需加载）
│   ├── srs-chapter-guide.md         #   SRS 章节识别规范
│   ├── cypher-syntax.md             #   Cypher 语法参考
│   ├── gherkin-syntax.md            #   Gherkin 语法参考
│   ├── tlaplus-guide.md             #   TLA+ 编写指南
│   └── lean4-guide.md               #   Lean 4 编写指南
│
├── templates/                        # ⑥ 产出模板
│   ├── STATE.md.template
│   ├── CONTEXT.md.template
│   ├── MINDMAP.md.template
│   ├── GAPS.md.template
│   ├── RESEARCH_LOG.md.template
│   ├── PLAN.md.template
│   ├── ERRORS.md.template
│   ├── SRS_PATCHES.md.template
│   ├── BEHAVIORS.md.template
│   ├── SPECS.md.template
│   ├── PROOFS.md.template
│   ├── security_log.jsonl.template
│   └── check.sh.template
│
├── CHANGELOG.md                      # ⑦ 变更追踪（semver）
└── BASELINE.md                       # ⑧ 基线记录（RED 阶段基线 + 版本对比）
```

---

## 3. S1 阶段详细设计

### 3.1 共享基础设施

#### package.json

```json
{
  "name": "srs-formalizer-scripts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test --experimental-test-coverage __tests__/",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/node": "^20.0.0"
  }
}
```

#### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "outDir": "dist",
    "rootDir": ".",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

#### 共享类型（S1 最小集）

```typescript
// === JSONL 基础类型 ===
export interface JsonlRecord {
  id: string;           // 格式: R[123]-[A-Za-z0-9_.]+-\d{4}
  category: 'explicit' | 'implicit' | 'relational';
  statement: string;
  source_file: string;
  confidence: 'high' | 'medium' | 'low';
  metadata?: Record<string, unknown>;
}

// === CLI 命令返回类型 ===
export interface CliResult {
  status: 'ok' | 'error';
  message?: string;
  data?: unknown;
}

// === 安全日志条目 ===
export interface SecurityLogEntry {
  timestamp: string;
  operation: 'read' | 'write' | 'delete';
  path: string;
  allowed: boolean;
  reason?: string;
}

// === 分片索引 ===
export interface ShardIndex {
  version: '1.0';
  source_path: string;
  source_hash: string;
  language: 'zh' | 'en';
  total_chars: number;
  total_shards: number;
  shards: ShardEntry[];
  gaps: GapEntry[];
  warnings: string[];
}

export interface ShardEntry {
  id: string;
  file: string;
  module: string;
  chapter_ref: string;
  char_count: number;
  estimated_tokens: number;
}

export interface GapEntry {
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  type: 'unsolved_issue' | 'undefined_term' | 'missing_reference' | 'incomplete_section';
  description: string;
  source_chapter: string;
}
```

#### 路径安全校验（lib/security.ts）

```typescript
import * as path from 'node:path';

export function isPathSafe(targetPath: string, workDir: string): boolean {
  const resolved = path.resolve(targetPath);
  const workDirResolved = path.resolve(workDir);
  return resolved.startsWith(workDirResolved);
}

export function assertSafePath(targetPath: string, workDir: string): void {
  if (!isPathSafe(targetPath, workDir)) {
    throw new Error(
      `SecurityError: Path "${targetPath}" is outside work directory "${workDir}". Access denied.`
    );
  }
}
```

### 3.2 `init.ts` — 初始化工作目录

**CLI**: `npx tsx index.ts init --output .srs_formalizer`

| 属性 | 规格 |
|------|------|
| 输入校验 | 目标路径必须为 `.srs_formalizer`（相对于 cwd），否则拒绝 |
| 幂等性 | 目录已存在 → 跳过创建，仍输出 `{"status":"ok"}` |
| 产出 | 完整子目录结构 + 初始 `STATE.md` |

**创建的目录**：`shard/`, `_ctx/`, `r1-explicit/`, `r2-implicit/`, `r3-relational/`, `graph/`, `analysis/subagent_prompts/`, `features/`, `specs/`, `proofs/`, `outputs/knowledge_graph/`, `outputs/brainstorming/`, `backups/`

**测试用例**：
1. `--output` 为 `.srs_formalizer` → 创建成功
2. `--output` 为 `other_dir` → 拒绝，返回 error
3. 目录已存在 → 幂等
4. 验证 `STATE.md` 模板包含必需字段
5. 验证所有子目录均已创建

### 3.3 `manifest.ts` — SRS 分片 + 章节识别

**CLI**: `npx tsx index.ts manifest --src <path> --lang zh|en --workdir .srs_formalizer`

**五步处理流程**：

1. **输入合并**：目录→找入口→合并；单文件→直接读取；HTML→去标签
2. **章节识别**：精确匹配 `§1.4`/`§2.9`/`§3.1`/`§7`/`附录A`；模糊匹配标题关键词
3. **信息缺口检测**：§7 非空→P0；术语缺失→P1；外部引用→P2
4. **Token 估算 + 切分**：每片 ≤ 2万 Token，中文 1.5 字符/Token
5. **写入产出**：`shard/*.md` + `_ctx/shard_index.json` + `CONTEXT.md`

**测试用例**：单 Markdown、多目录包（有/无入口）、HTML、模糊章节、信息缺口检测、确定性验证（相同输入→相同分片）、路径安全拒绝

### 3.4 SKILL.md 骨架

```yaml
---
name: srs-formalizer
description: 当用户提供 SRS（软件需求规格说明）文档并要求生成形式化产出时使用——包括需求知识图谱、BDD 特性文件、TLA+ 形式化规约或 Lean 4 算法证明。触发条件：用户上传或引用 SRS 文档（HTML/Markdown/多目录包），要求"形式化"、"生成知识图谱"、"生成 BDD"、"TLA+ 建模"、"Lean 证明"。
---

# SRS Formalizer

## 概述

将 SRS 文档转化为四类形式化产出：需求知识图谱（Cypher）、BDD（Gherkin）、TLA+ 规约（条件触发）、Lean 4 证明（条件触发）。TS 脚本做机械工作，LLM 子代理做语义判断，编排者做流程决策。

## 工作流（六阶段）

1. **S1 预处理** → 分片 + 信息缺口检索
2. **S2 需求提取** → R1 显式/R2 隐式/R3 关系提取 + 校验
3. **S3 图谱构建** → 结构补全 → 语义去重 → Cypher 导出
4. **S4 BDD 生成** → 骨架生成 → 子代理充实 → 格式校验
5. **S5 形式化** → TLA+ 层次建模/TLC 验证 + Lean 4 拆分证明（条件触发）
6. **S6 验收闸门** → 硬门禁 + 头脑风暴上下文导出

## 核心原则

- TS 脚本只做确定性转换
- 所有文件操作限定在 `.srs_formalizer/` 工作目录内
- 子代理输出必须通过 JSONL 格式校验
- SRS 回写必须经用户确认

## 依赖技能

**必需背景：** superpowers:test-driven-development、superpowers:verification-before-completion
```

---

## 4. Rust 加速方案

### 4.1 加速范围

仅对两个计算密集型热点使用 Rust：

| 操作 | 算法 | TS 预估耗时 | Rust 加速比 | 值得加速 |
|------|------|------------|------------|----------|
| 语义去重 | Jaccard 成对比较 O(N²) | 2-30s | 24-300x | ✅ |
| 社区检测 | Louvain 模块度优化 | 1-10s | 2.7-5x | ✅ |
| 孤立检测 | BFS O(V+E) | <5ms | 1.3-4x | ❌ |
| 悬挂边检测 | O(E) | <5ms | — | ❌ |
| 概念孤岛 | 聚类计数 O(V) | <5ms | — | ❌ |
| 路径查找 | BFS O(V+E) | <10ms | 1.3-4x | ❌ |
| 图谱构建 | HashMap O(V+E) | <10ms | — | ❌ |
| Cypher 导出 | 遍历+字符串 O(V+E) | <50ms | — | ❌ |

### 4.2 架构

采用 **TS 默认 + napi-rs 可选** 插件模式。`native-bridge.ts` 自动检测编译产物：存在则使用 Rust 后端，否则降级纯 TS。两种后端通过完全相同测试用例。

### 4.3 实施时机

S1~S2 纯 TS → S3 前期 TS 实现全部算法并通过测试 → S3 优化期添加 Rust 后端

---

## 5. V 模型开发流程

采用 V 模型进行项目开发管理：测试用例先行（从上到下），开发从下到上，验收用前置用例逐级校验。

### 5.1 V 模型映射

```
需求分析（SRS v3.5 已冻结）          验收测试（tests/golden/s6-gate.md）
      │                                       ↑
      ▼                                       │
  概要设计（S1~S6 六阶段架构）        集成测试（tests/golden/s1~s5 + assertions/）
      │                                       ↑
      ▼                                       │
  详细设计（每脚本契约/输入输出规格）    模块测试（scripts/__tests__/ 每脚本对应）
      │                                       ↑
      ▼                                       │
  编码（TS 实现） ─────────────────→  单元测试（node --test 确定性验证）
```

### 5.2 每阶段测试用例编写顺序（自上而下）

```
Step 1: tests/golden/<stage>.md         # 验收级：端到端场景（输入→预期产出）
Step 2: tests/assertions/eval-spec.yaml # 集成级：pass/fail 断言 + negative_controls
Step 3: scripts/__tests__/<cmd>.test.ts # 模块级：每脚本契约验证
Step 4: 编码 <cmd>.ts                   # 开发（红→绿→重构）
Step 5: node --test 验证                # 模块级回归
Step 6: 集成验证                        # 组合脚本链路
Step 7: 验收验证                        # 用 Step 1-2 的前置用例逐级校验
```

### 5.3 S1 阶段 V 模型执行计划

| 步骤 | 产出 | 内容 |
|------|------|------|
| Step 1 | `tests/golden/s1-preprocess.md` | 验收用例：中文 SRS 样本输入→分片输出+缺口报告 |
| Step 2 | `tests/assertions/eval-spec.yaml` | 集成断言：shard 数量、章节匹配率、GAPS P0 标记 |
| Step 3 | `scripts/__tests__/init.test.ts` | init 模块用例：创建目录/幂等/路径拒绝/STATE.md 模板完整性 |
| Step 4 | `scripts/__tests__/manifest.test.ts` | manifest 模块用例：合并/分片/章节识别/缺口检测/确定性 |
| Step 5 | 编码 `init.ts` | TDD 红→绿→重构 |
| Step 6 | 编码 `manifest.ts` | TDD 红→绿→重构 |
| Step 7 | 模块验证 `node --test` | init + manifest 全部用例通过 |
| Step 8 | 集成验证 | init→manifest 链路 + 路径安全边界 |
| Step 9 | 验收验证 | 用 Step 1 的黄金用例端到端校验 |

### 5.4 测试层级定义

| 层级 | 位置 | 验证目标 | 执行方式 | 速度 |
|------|------|---------|---------|------|
| **L4 验收** | `tests/golden/` | 阶段端到端：真实 SRS→完整产出 | LLM 编排者执行 + 断言检查 | 分钟级 |
| **L3 集成** | `tests/assertions/` | 多脚本链路：数据流正确性 | eval-spec.yaml + node 脚本 | 秒级 |
| **L2 模块** | `scripts/__tests__/` | 单脚本契约：CLI 参数/IO/错误路径 | `node --test` | 毫秒级 |
| **L1 单元** | 编码过程中 TDD | 函数级确定性：纯函数输入→输出 | `node --test` 内联 | 毫秒级 |

### 5.5 模块测试覆盖目标

每个 `commands/*.ts` 脚本必须覆盖：
- 正常输入 → 正确输出
- 边界条件（空输入、超大输入、特殊字符）
- 错误路径（路径违规、格式错误、缺失必填字段）
- 确定性验证（相同输入→相同输出）

---

## 6. 实施顺序（阶段串行 × V 模型）

```
S1 预处理 ──→ S2 需求提取 ──→ S3 图谱构建 ──→ S4 BDD ──→ S5 形式化 ──→ S6 验收
   2 脚本         4 脚本          7 脚本       2 脚本       条件触发      2 脚本
   + 基础设施     + 提示词        + 图算法     + 充实       + TLA+/Lean   + 导出
   + 5 模板       + 校验者        + Rust优化   + 校验       + 验证        + 闸门
```

每阶段内部执行：验收用例 → 集成用例 → 模块用例 → 编码 → 逐级回归校验。
每阶段交付物 = TS 脚本 + 测试（全部四级） + 编排者提示词 + 子代理提示词 + 模板。

---

## 7. 文件清单总览（八大件）

| # | 要件 | 对应位置 | 状态 |
|---|------|---------|------|
| ① | 技能入口文件 | `SKILL.md` | 骨架（后续阶段补充） |
| ② | 脚本 | `scripts/commands/` (14) + `scripts/lib/` (7) | S1: 2 命令 + 2 库 |
| ③ | 脚本测试 | `scripts/__tests__/` + `fixtures/` | 每脚本对应一个 |
| ④ | 黄金全流程用例 | `tests/golden/` + `tests/assertions/eval-spec.yaml` | 每阶段 ≥3 场景 |
| ⑤ | 参考 | `references/` (5 文件) | S1: srs-chapter-guide.md |
| ⑥ | 模板 | `templates/` (13 文件) | S1: 5 模板 |
| ⑦ | 变更追踪 | `CHANGELOG.md` | semver 规范 |
| ⑧ | 基线记录 | `BASELINE.md` | RED 阶段基线 |
