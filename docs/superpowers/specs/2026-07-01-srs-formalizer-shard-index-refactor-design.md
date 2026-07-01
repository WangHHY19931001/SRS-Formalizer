# PLAN: srs-formalizer 分片方案重构 — 索引化 + 格式保留

**日期**: 2026-07-01
**版本**: 1.0
**目标版本**: v0.5.0

---

## 0. 决策记录

| # | 决策点 | 选择 | 理由 |
|---|--------|------|------|
| 1 | `1_shard/` 目录去留 | **完全移除** | 空目录是技术债务，阶段标记由 CHECKLIST.md 提供 |
| 2 | 下游获取分片内容 | **inject-prompt 增强** | 单点改动，编排者 prompt 不变，向后兼容 |
| 3 | 分片标识格式 | `{file_abspath}-{start_line}-{end_line}-{chunk_id}` | 人类可读，信息自包含 |
| 4 | locator 与 id | **B: locator 新字段，id 保留 S001** | `id` 作为简短引用，`locator` 提供精确定位 |
| 5 | locator 解析方式 | **使用结构化字段** | `source_path`/`source_start_line`/`source_end_line` 已有的结构化字段，`locator` 为人类标识 |
| 6 | 多源文件处理 | **每个源文件独立索引** | 不合并、不去标签，保留原始格式的完整信息 |
| 7 | 非 Markdown 章节识别 | **按文件类型分派识别器** | `.md` 用 `#` 标题，`.html` 用 `<h1>`~`<h6>` + `id` 属性 |
| 8 | HTML 内容处理 | **仅用标题定位分片边界，原始内容零修改** | HTML 保留所有标签、属性、结构 |

---

## 1. 总体架构

### 变更前

```
manifest --src srs.md
  → 合并多文件 + HTML去标签 → content (纯文本)
  → identifyChapters(content) → 按 # 标题
  → shardContent(content, chapters) → 1_shard/S*.md (物理文件)
```

### 变更后

```
manifest --src <file-or-dir>
  → collectSourceFiles(absSrc) → 每个源文件独立处理
  → 对每个源文件:
      content = fs.readFileSync(sourcePath) (零修改)
      chapters = identifyChapters(content, sourcePath) (按格式分派)
      buildShardIndex(content, chapters, sourcePath)
  → 写入 _ctx/shard_index.json (含 locator)
  → 不创建 1_shard/ 目录
```

### 下游变更

```
S2 变更前: inject-prompt --params '{"SHARD_CONTENT":"..."}'
S2 变更后: inject-prompt --shard-id S001 --workdir .srs_formalizer
           → 自动查找 shard_index.json → 读原始 SRS → 注入
```

---

## 2. ShardEntry 类型变更

```typescript
interface ShardEntry {
  id: string;              // "S001" (不变)
  file: string;            // "S001" (改为逻辑ID)
  locator: string;         // 新增: "/abs/path/srs.md-1-42-001"
  module: string;
  chapter_ref: string;
  source_path: string;
  source_start_line: number;  // 1-based
  source_end_line: number;    // 1-based, 含
  char_count: number;
  estimated_tokens: number;
}
```

`locator` 格式: `{file_absolute_path}-{start_line}-{end_line}-{chunk_id}`
示例: `/home/srs/在线商城.html-1-42-001`

---

## 3. manifest.ts 重构

### 3.1 新增 `collectSourceFiles(absSrc: string): string[]`
- 单文件: 直接返回
- 目录: 收集所有 `.md`/`.html`/`.htm`，不合并

### 3.2 新增 `buildShardIndex(content, chapters, sourcePath, lang): ShardEntry[]`
- 替代原 `shardContent`
- 不写入物理文件，只生成 ShardEntry 数组
- 每个 entry 的 `locator` = `{absPath}-{startLine+1}-{endLine}-001`

### 3.3 新增 `identifyChaptersHtml(content: string): ChapterInfo[]`
- 匹配 `<h1>`~`<h6>` + 可选 `id="§3.1.2"` 属性
- 标题内 HTML 标签剥离（仅提取纯文本作为 title）
- 无标题 → 返回空数组 → 全文单分片

### 3.4 修改 `identifyChapters` 签名
- 增加 `sourcePath: string` 参数，按扩展名分派识别器

### 3.5 移除 HTML 去标签逻辑
- 原第 264-276 行的 `.replace()` 链全部移除
- 原始 HTML 内容零修改地通过 `source_path` + 行号范围引用

---

## 4. inject-prompt.ts 增强

### 新增 `--shard-id` 参数

当提供 `--shard-id <id>` + `--workdir <path>` 时:

1. 读取 `_ctx/shard_index.json`
2. 查找 `shard.id === shardId` 的 ShardEntry
3. 从 `shard.source_path` 读取原始文件
4. `lines.slice(shard.source_start_line - 1, shard.source_end_line).join('\n')` 作为 `SHARD_CONTENT`
5. 若 `--params` 已含 `SHARD_CONTENT` → 不覆盖（手动模式优先）

---

## 5. 级联影响

### 修改文件

| 文件 | 改动量 | 说明 |
|------|:-----:|------|
| `scripts/types/index.ts` | +1 行 | `ShardEntry` 新增 `locator` |
| `scripts/commands/manifest.ts` | ~80 行 | 核心重构 |
| `scripts/commands/inject-prompt.ts` | ~40 行 | 新增 `--shard-id` |
| `scripts/commands/init.ts` | -1 行 | 移除 `'1_shard'` 子目录 |
| `scripts/commands/verify-gate.ts` | ~10 行 | `checkShardCompleteness` 适配 |
| `scripts/lib/checklists.ts` | ~5 行 | CHECKLIST 文本更新 |
| `SKILL.md` | ~10 行 | 目录结构图 + 工作流更新 |
| `prompts/orchestrator_stage_S1.md` | ~5 行 | 产出物描述 |
| `prompts/orchestrator_stage_S2.md` | ~5 行 | inject-prompt 调用更新 |
| `templates/checklists/1_shard_CHECKLIST.md` | ~3 行 | 移除物理文件检查 |
| `CHANGELOG.md` | ~15 行 | v0.5.0 条目 |
| `scripts/__tests__/manifest.test.ts` | ~40 行 | 适配新行为 |
| `scripts/__tests__/init.test.ts` | ~5 行 | 目录检查 |
| `scripts/__tests__/inject-prompt.test.ts` | ~30 行 | --shard-id 测试 |
| `scripts/__tests__/verify-gate.test.ts` | ~5 行 | 分片检查 |

**合计**: 15 文件, ~260 行变更

### 不需要修改的文件

- 所有 executor prompt（executor-R*.md）：`{{SHARD_CONTENT}}` 占位符不变，只是值由 inject-prompt 自动注入
- 所有 verifier prompt：同上
- executor-arch-*.md：不依赖分片
- build-graph.ts, analyze-*.ts, merge-*.ts：消费 JSONL，不消费分片
- export-cypher.ts, generate-bdd.ts：同上
- compile.ts, skir-*.ts, anti-skill.ts, emitter-*.ts：v0.4.0 新增，与分片无关

---

## 6. 验收标准

1. `manifest --src tests/fixtures/srs-sample-zh.md` 返回 `status: ok`，`shard_index.json` 所有 shard 含 `locator`
2. `manifest --src <html-file>` 不报错，HTML 内容零修改，章节按 `<h1>`~`<h6>` 正确识别
3. `manifest --src <multi-file-dir>` 每个源文件独立索引，不合并
4. `inject-prompt --shard-id S001 --workdir .srs_formalizer` 自动注入正确的 SHARD_CONTENT
5. `inject-prompt --shard-id S001 --params '{"SHARD_CONTENT":"custom"}'` 不覆盖手动值
6. `1_shard/` 目录不再被创建
7. `init` 不再创建 `1_shard/` 子目录
8. 所有现有测试通过（更新后），新增 5+ 测试
9. `typecheck` 通过
10. CHANGELOG v0.5.0 条目

---

## 7. 文件改动汇总

| 类型 | 文件数 | 代码行数(估) |
|------|:-----:|:----------:|
| 修改 TypeScript 源文件 | 5 | ~135 |
| 修改测试文件 | 4 | ~80 |
| 修改 Markdown 文档 | 6 | ~40 |
| **合计** | **15** | **~255** |
