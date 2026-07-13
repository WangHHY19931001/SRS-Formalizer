# 子项目 1：IR Schema + Frontend — 实现计划

**日期**: 2026-07-13 | **范围**: 编译器架构重构 Phase 1
**来源**: `docs/DESIGN.md` §4, §5
**前置**: 旧代码已 zip 归档（7 条命令 + 42 个旧测试 + lib/sharder.ts/lib/chapter-parser.ts + lib/graph.ts 中旧节点构建逻辑）

---

## 1. 范围

新增 SRS-IR 类型系统 + Frontend 四个 Pass，替代旧 S1-S3。

### 1.1 交付物

| 类别 | 文件 | 操作 | 行数 |
|------|------|:--:|:--:|
| **类型** | `types/srs-ir.ts` | 新建 | 200 |
| **Frontend lib** | `lib/frontend/nfr-keywords.ts` | 新建 | 60 |
| | `lib/frontend/parser.ts` | 新建 | 200 |
| | `lib/frontend/sharder.ts` | 新建 | 220 |
| | `lib/frontend/round-calculator.ts` | 新建 | 80 |
| | `lib/frontend/builder.ts` | 新建 | 250 |
| **CLI** | `commands/manifest.ts` | 重写 | 180 |
| | `commands/build-ir.ts` | 新建 | 120 |
| | `commands/guided-extract.ts` | 扩展 | +80 |
| **入口** | `index.ts` | 扩展 | +5 |
| **测试** | `__tests__/srs-ir-types.test.ts` | 新建 | 180 |
| | `__tests__/frontend-nfr-keywords.test.ts` | 新建 | 150 |
| | `__tests__/frontend-parser.test.ts` | 新建 | 200 |
| | `__tests__/frontend-sharder.test.ts` | 新建 | 200 |
| | `__tests__/frontend-builder.test.ts` | 新建 | 280 |
| | `__tests__/frontend-round-calculator.test.ts` | 新建 | 80 |
| | `__tests__/manifest.test.ts` | 新建 | 200 |
| | `__tests__/build-ir.test.ts` | 新建 | 200 |
| | `__tests__/guided-extract.test.ts` | 扩展 | +100 |

### 1.2 淘汰

| 文件 | 操作 |
|------|:--:|
| `commands/build-graph.ts` | zip 归档 |
| `commands/export-cypher.ts` | zip 归档 |
| `commands/generate-bdd.ts` | zip 归档 |
| `commands/build-behavior-graph.ts` | zip 归档 |
| `commands/build-tla-graph.ts` | zip 归档 |
| `commands/build-lean-graph.ts` | zip 归档 |
| `commands/build-system-architecture.ts` | zip 归档 |
| `lib/sharder.ts` | zip 归档 |
| `lib/chapter-parser.ts` | zip 归档 |
| `__tests__/build-graph.test.ts` | zip 归档 |
| `__tests__/export-cypher.test.ts` | zip 归档 |
| `__tests__/generate-bdd.test.ts` | zip 归档 |
| + 其他 4 个被淘汰命令的测试 | zip 归档 |
| `types/index.ts` 中 ShardEntry/GapEntry/ShardIndex 旧版本 | 保留但标记 deprecated（仍被 `guided-extract` 消费） |

---

## 2. 技术设计

### 2.1 `types/srs-ir.ts`

完整类型如 DESIGN.md §4 定义。关键点：

- `IRNodeType` 为联合枚举：`'requirement' | 'nfr' | 'architecture' | 'bdd_scenario' | 'tla_action' | 'tla_invariant' | 'lean_theorem' | 'lean_lemma'`
- `IREdgeType` 为联合枚举：`'depends_on' | 'refines' | 'conflicts_with' | 'derived_from' | 'same_aspect' | 'contains' | 'nfr_impacts' | 'nfr_constrains' | 'cross_file_depends' | 'verifies' | 'implements' | 'proves' | 'traces_to'`
- `NFRCategory = 'performance' | 'security' | 'availability' | 'compatibility' | 'maintainability' | 'compliance'`
- `SRSIR.version` 固定为 `'2.0.0'`
- 不包含运行时验证逻辑——类型守卫 (`isIRNode`, `isIREdge`) 放在 `builder.ts` 中

### 2.2 `lib/frontend/nfr-keywords.ts`

```typescript
export const NFR_KEYWORDS: Record<NFRCategory, { zh: string[]; en: string[] }> = {
  performance: {
    zh: ['响应时间', '延迟', '吞吐', '并发', '性能', 'QPS', 'TPS'],
    en: ['latency', 'throughput', 'response time', 'concurrent', 'performance']
  },
  security: {
    zh: ['安全', '加密', '认证', '授权', '防攻击', '审计', '脱敏'],
    en: ['encrypt', 'authentication', 'authorize', 'prevent', 'audit']
  },
  // ... 其余四类
};

export function detectNFRCategories(text: string, lang: 'zh' | 'en'): NFRCategory[];

export function computeNFRWeight(text: string, lang: 'zh' | 'en'): number;
```

### 2.3 `lib/frontend/parser.ts`

三个导出函数：

```typescript
export function identifyChapters(content: string, sourcePath: string): ChapterInfo[];
export function detectCrossRefs(content: string, chapters: ChapterInfo[]): CrossRef[];
export function scanNFR(content: string, lang: 'zh' | 'en'): NFRProfile;
```

- `identifyChapters`: 移植自旧 `chapter-parser.ts`，新增 12 个 NFR 关键词到 `KEYWORD_PATTERNS`
- `detectCrossRefs`: 四种引用模式正则：`/参见[§第](\S+)/`（显式）, `/#{1,6}\s*(.+)/g` 收集所有标题 → 匹配引用, 术语引用（`| 术语 |` 表格）, 隐式依赖（同文件内模块名引用）
- `scanNFR`: 按段落计算 NFR 类别命中数 → 构建 `NFRProfile`（含 `weightedShards` 预留字段，权重由 sharder 填充）

### 2.4 `lib/frontend/sharder.ts`

```typescript
export const MAX_SHARD_LINES = 200;

export function buildShardIndex(
  absSrc: string, content: string, chapters: ChapterInfo[],
  lang: 'zh' | 'en', nfrProfile: NFRProfile
): ShardIndex;
```

- 分片逻辑移植自旧 `sharder.ts` 的递归算法
- `ShardEntry` 新增 `nfr_weight?: number` — 对每个 shard 调用 `computeNFRWeight`
- `ShardIndex` 新增 `cross_references: CrossRef[]` 和 `nfr_profile: NFRProfile`
- `ShardIndex.version` 固定为 `'1.1'`
- 段落回退（`forceSplitByParagraphs`）逻辑保留

### 2.5 `lib/frontend/round-calculator.ts`

```typescript
export function calculateArchRounds(totalShards: number, crossRefCount: number): number;
```

- `totalShards = 0 → 3`, `≥ 100 → 5`, 线性插值
- `crossRefCount > 50 → +1` 轮
- 返回值范围 [2, 5]

### 2.6 `lib/frontend/builder.ts`

```typescript
export function buildIR(workDir: string): SRSIR;
export function validateIR(ir: SRSIR): ValidationResult;
```

**buildIR 流程：**
1. `readAllJsonl(workDir)`: 遍历 `2_extract/` 下所有 JSONL → `JsonlRecord[]`
2. `deduplicate()`: 按 `id` 去重
3. `buildNodes()`: JsonlRecord → IRNode 映射：
   - `category='explicit' → labels=[':Requirement']`
   - `category='implicit' → labels=[':ImplicitRequirement']`
   - `category='relational' → labels=[':RelationalRequirement']`
   - `metadata.nfrCategory → labels.push(':NFR...'), type='nfr'`
4. `buildEdges()`: metadata.relation → IREdge 映射
5. `mergeCrossRefs()`: 读取 `shard_index.json` → IR.crossRefs
6. `mergeNFRProfile()`: 同上 → IR.nfrProfile
7. `mergeGaps()` + `mergeGlossary()`
8. **`validateIR(ir)`** — 完整性验证，失败则返回 error

**validateIR 规则：**
- 每个 `IREdge.source` 和 `IREdge.target` 必须在 `IRNode[]` 中存在（悬挂引用 → fail）
- `nfrProfile.detectedCategories.length` 对应的 `IRNode.type === 'nfr'` 数量 ≥ 预期值的 50%（不足 → warning）
- `SRSIR.version !== '2.0.0'` → fail
- `IRMeta.buildTimestamp` 非空 → pass

### 2.7 `commands/manifest.ts`

完全重写。CLI 参数不变（`--src`, `--lang`, `--workdir`）。

```typescript
export async function main(args: string[]): Promise<CliResult> {
  // 1. parse args (safeParseArg)
  // 2. validateWorkDir
  // 3. collectSourceFiles
  // 4. for each source file:
  //    a. chapters = parser.identifyChapters(content, sourcePath)
  //    b. crossRefs = parser.detectCrossRefs(content, chapters)
  //    c. nfrProfile = parser.scanNFR(content, lang)
  //    d. shards = sharder.buildShardIndex(sourcePath, content, chapters, lang, nfrProfile)
  //    e. detectGaps → 增强 (含 cross_chapter_gap)
  // 5. 输出 shard_index.json (v1.1) + context/*
}
```

### 2.8 `commands/build-ir.ts`

新建。CLI：`npx tsx index.ts build-ir --workdir <path>`

```typescript
export async function main(args: string[]): Promise<CliResult> {
  // 1. safeParseArg('--workdir')
  // 2. validateWorkDir
  // 3. ir = builder.buildIR(workDir)   // 内部调用 validateIR
  // 4. 写入 srs-ir.json (JSON.stringify, null, 2)
  // 5. return { status: 'ok', data: { nodes: ir.meta.totalNodes, edges: ir.meta.totalEdges } }
}
```

### 2.9 `commands/guided-extract.ts` 扩展

新增三种提取类型验证器：

| 类型 | ID 前缀 | 新增字段验证 |
|------|------|------|
| `r3-cross` | `R3C-` | `cross_shard_refs: string[]` |
| `r4-nfr` | `R4N-` | `nfrCategory: NFRCategory`, `nfrThreshold?: {metric, value, unit, operator}` |
| `arch` (扩展) | — | `archType: 'NFRSecurityPolicy' \| 'NFRPerfConstraint' \| ...` |

Mode A/B 协议不变。逐行校验框架不变。

### 2.10 `index.ts` 注册表

```typescript
// 移除
// build-graph, export-cypher, generate-bdd,
// build-behavior-graph, build-tla-graph, build-lean-graph,
// build-system-architecture

// 新增
"build-ir": () => import("./commands/build-ir.js"),
```

---

## 3. 验证标准

### 3.1 编译

```bash
npx tsc --noEmit   # 0 errors
```

### 3.2 测试

```bash
npx tsx --test __tests__/srs-ir-types.test.ts
npx tsx --test __tests__/frontend-nfr-keywords.test.ts
npx tsx --test __tests__/frontend-parser.test.ts
npx tsx --test __tests__/frontend-sharder.test.ts
npx tsx --test __tests__/frontend-builder.test.ts
npx tsx --test __tests__/frontend-round-calculator.test.ts
npx tsx --test __tests__/manifest.test.ts
npx tsx --test __tests__/build-ir.test.ts
npx tsx --test __tests__/guided-extract.test.ts
```

~1590 行测试，预估 ~120 test cases，0 failures。

### 3.3 集成

```bash
npm test           # 全量 ~342 tests，0 failures（旧淘汰测试已移除，新测试已加入）
npm run typecheck  # 0 errors
```

### 3.4 端到端

```bash
mkdir -p /tmp/test_ir && npx tsx index.ts init --output /tmp/test_ir/.srs_formalizer
npx tsx index.ts manifest --src <test_srs.md> --lang zh --workdir /tmp/test_ir/.srs_formalizer
npx tsx index.ts build-ir --workdir /tmp/test_ir/.srs_formalizer
# 验证 /tmp/test_ir/.srs_formalizer/srs-ir.json 存在且合法
```

---

## 4. 不变约束

继承自 AGENTS.md + DESIGN.md：

- 零运行时 npm 依赖
- Strict TS, 0 `any`
- Max 300 lines/file
- `path.join()` only
- Poison values rejected
- `refuseDirectInvocation` guard on all commands
- CLI output: JSON to stdout, `{ status, message?, data? }`
- Commit: Conventional Commits + `Co-Authored-By`
