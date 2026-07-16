# ShardIndex 格式规范

> **本文件是 ShardIndex 格式与分片算法的参考规范**，Agent 在 Frontend F1 阶段读 SRS、分片、产出 `shard_index.json` 时依据此文档。详细规范见 `docs/DESIGN.md` §6.2 与 §4.2。
>
> ShardIndex 是 Frontend 中间产物，由 Agent（非脚本）写入 `_ctx/shard_index.json`，供后续提取与 IR 装配消费。

---

## 1. 分片算法（DESIGN.md §4.2）

### 1.1 分片阈值

```
MAX_SHARD_LINES = 200
```

每个分片最大行数为 200 行。超过此阈值的章节需递归拆分。

### 1.2 递归分片策略

按以下顺序回退：

1. **按章节标题分割**（首选）
2. **章节回退**（标题分割后仍超长时）
3. **段落回退**（章节回退后仍超长时）

### 1.3 Token 估算公式

| 语言 | 估算公式 |
|------|----------|
| 中文 | `chars / 1.5` |
| 英文 | `chars / 4` |

`estimated_tokens` 字段据此计算。

### 1.4 shard ID 规则

- 格式：`S001`~`S999`
- 纯 ASCII
- 三位数字零填充

### 1.5 locator 格式

```
{file_abspath}-{start}-{end}-{chunk_id}
```

每个分片含 `locator` 字段，记录源文件绝对路径、起止行与 chunk ID。

### 1.6 R1 提取 ID 格式

```
R1-<shard_id>-NNNN
```

R1 显式需求提取 ID 由分片 ID 与四位序号组成。

---

## 2. ShardIndex Schema（DESIGN.md §6.2）

```typescript
interface ShardIndex {
  version: '1.1';
  source_path: string;  source_hash: string;
  language: 'zh' | 'en';  total_chars: number;  total_shards: number;
  shards: ShardEntry[];  gaps: GapEntry[];  warnings: string[];
  cross_references: CrossRef[];
  nfr_profile: NFRProfile;
}
```

### 2.1 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `version` | `'1.1'` | ShardIndex 版本号 |
| `source_path` | `string` | 源 SRS 文件路径 |
| `source_hash` | `string` | 源文件 hash |
| `language` | `'zh' \| 'en'` | 源文件语言 |
| `total_chars` | `number` | 源文件总字符数 |
| `total_shards` | `number` | 分片总数 |
| `shards` | `ShardEntry[]` | 分片条目数组 |
| `gaps` | `GapEntry[]` | 缺口条目数组 |
| `warnings` | `string[]` | 警告信息数组 |
| `cross_references` | `CrossRef[]` | 跨章引用数组 |
| `nfr_profile` | `NFRProfile` | NFR 概况（详见 `ir-schema-reference.md` §4.3） |

---

## 3. ShardEntry Schema

```typescript
interface ShardEntry {
  id: string;  file: string;  locator: string;
  source_path: string;  source_start_line: number;  source_end_line: number;
  module: string;  chapter_ref: string;
  char_count: number;  estimated_tokens: number;
  nfr_weight?: number;
}
```

### 3.1 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 分片 ID（`S001`~`S999`，纯 ASCII） |
| `file` | `string` | 分片所属文件 |
| `locator` | `string` | 定位符（`{file_abspath}-{start}-{end}-{chunk_id}`） |
| `source_path` | `string` | 源文件路径 |
| `source_start_line` | `number` | 源文件起始行 |
| `source_end_line` | `number` | 源文件结束行 |
| `module` | `string` | 所属模块 |
| `chapter_ref` | `string` | 章节引用 |
| `char_count` | `number` | 分片字符数 |
| `estimated_tokens` | `number` | 估算 token 数（中文 `chars/1.5`，英文 `chars/4`） |
| `nfr_weight` | `number?` | NFR 权重（可选） |

---

## 4. 关联类型

### 4.1 CrossRef

```typescript
interface CrossRef {
  sourceShard: string;  targetShard: string;
  refType: 'heading_ref' | 'term_ref' | 'explicit_see' | 'implicit_dep';
  anchorText: string;  confidence: number;
}
```

`cross_references` 字段记录分片间的跨章引用关系。

### 4.2 NFRProfile

```typescript
interface NFRProfile {
  detectedCategories: NFREntry[];
  weightedShards: NFRWeightedShard[];
  overallCoverage: number;
  blindSpots: NFRCategory[];
}
```

`nfr_profile` 字段记录 Frontend 阶段 NFR 关键词扫描结果。完整定义见 `ir-schema-reference.md` §4.3。

---

## 5. 产出路径与消费方

| 属性 | 值 |
|------|-----|
| 产出阶段 | Frontend F1 |
| 产出者 | Agent（非脚本） |
| 输出路径 | `_ctx/shard_index.json` |
| 门禁 | `validate-checklist --stage S1` |
| 消费方 | F2（按 shard 提取 JSONL）、`assemble-ir`（合并 crossRefs/nfrProfile/gaps/glossary） |

### 5.1 S1 门禁校验

`verify-gate --stage S1`（DESIGN.md §7.10）对 `shard_index.json` 执行**格式校验**（不再仅存在性检查），含分片完整性检查。

---

## 6. 动态架构轮次

Agent 根据 `totalShards` 决定架构分解轮次（DESIGN.md §4.2）：

| totalShards | 轮次 |
|-------------|------|
| <50 | 3 轮 |
| 50-99 | 4 轮 |
| ≥100 | 5 轮 |

若 `crossRefCount > 50`，额外 +1 轮。
