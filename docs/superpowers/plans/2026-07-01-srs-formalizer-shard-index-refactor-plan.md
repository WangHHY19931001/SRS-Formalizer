# srs-formalizer v0.5.0 Shard Index Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor sharding from physical file splitting to index-based addressing — `ShardEntry.locator` identifies shards by `{file_abspath}-{start}-{end}-{chunk_id}`, preserving original format content (HTML/Markdown) with zero modification, eliminating `1_shard/` directory.

**Architecture:** `manifest.ts` gathers source files independently (no merge), builds `ShardEntry[]` with `locator` and line ranges, writes only `shard_index.json`. `inject-prompt.ts` gains `--shard-id` to auto-resolve content from original source files. `identifyChapters` dispatches by file type (`.md` → `#` headers, `.html` → `<h1>`–`<h6>` + `id`).

**Tech Stack:** TypeScript 5.5+ (strict), Node.js ≥20, ESM, zero external deps.

## Global Constraints

- TypeScript strict mode (`noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`)
- Zero external npm dependencies (only `typescript` + `@types/node`)
- All file operations limited to `.srs_formalizer/` working directory
- CLI commands return `CliResult` JSON (`{status: 'ok'|'error', message?: string, data?: unknown}`)
- Code follows existing patterns: `parseArg(args, name)` for CLI, async `main(args): Promise<CliResult>`, dynamic import in `index.ts`
- Tests use `npx tsx --test` with `node:test` + `node:assert`
- TDD: write failing tests first, verify RED, implement, verify GREEN, commit
- **Key principle**: HTML content is NEVER modified — only used to detect heading boundaries

---

### Task 1: Add `locator` to ShardEntry type

**Files:**
- Modify: `.claude/skills/srs-formalizer/scripts/types/index.ts`

**Interfaces:**
- Produces: `ShardEntry.locator: string` — consumed by Tasks 2 (manifest), 3 (inject-prompt), 6 (verify-gate)

- [ ] **Step 1: Add locator field**

```typescript
// In scripts/types/index.ts, add to ShardEntry interface (after the `file` line):
export interface ShardEntry {
  id: string;
  file: string;
  /** 分片定位符: {file_absolute_path}-{start_line}-{end_line}-{chunk_id} */
  locator: string;
  module: string;
  chapter_ref: string;
  source_path: string;
  source_start_line: number;
  source_end_line: number;
  char_count: number;
  estimated_tokens: number;
}
```

- [ ] **Step 2: Verify typecheck**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsc --noEmit
```
Expected: no errors (locator is a non-breaking addition — no existing code references it yet)

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/srs-formalizer/scripts/types/index.ts
git commit -m "feat(types): add locator field to ShardEntry for index-based shard addressing

Format: {file_abspath}-{start_line}-{end_line}-{chunk_id}
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Rewrite manifest.ts — collectSourceFiles + buildShardIndex + identifyChaptersHtml

**Files:**
- Modify: `.claude/skills/srs-formalizer/scripts/commands/manifest.ts`
- Modify: `.claude/skills/srs-formalizer/scripts/__tests__/manifest.test.ts`

**Interfaces:**
- Consumes: `ShardEntry.locator` from Task 1
- Produces: `collectSourceFiles(absSrc: string): string[]`, `buildShardIndex(content, chapters, sourcePath, lang): ShardEntry[]`, `identifyChapters(content: string, sourcePath: string): ChapterInfo[]`

- [ ] **Step 1: Add `collectSourceFiles` function**

Add after the existing `parseArg` helper:

```typescript
function collectSourceFiles(absSrc: string): string[] {
  const stat = fs.statSync(absSrc);

  if (!stat.isDirectory()) {
    return [absSrc];
  }

  // Directory: collect all .md and .html files (do NOT merge)
  const files = fs.readdirSync(absSrc)
    .filter(f => /\.(md|html|htm)$/i.test(f))
    .sort()
    .map(f => path.join(absSrc, f));

  if (files.length === 0) {
    return [absSrc];
  }
  return files;
}
```

- [ ] **Step 2: Add `identifyChaptersHtml` function**

Add before the existing `identifyChapters`:

```typescript
function identifyChaptersHtml(content: string): ChapterInfo[] {
  const chapters: ChapterInfo[] = [];
  const lines = content.split('\n');

  const headingRe = /<h([1-6])(?:\s+[^>]*?\bid\s*=\s*["']([^"']+)["'])?[^>]*>(.*?)<\/h\1>/gi;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    headingRe.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = headingRe.exec(line)) !== null) {
      const level = parseInt(match[1]!, 10);
      const idAttr = match[2] || undefined;
      const title = match[3]!.replace(/<[^>]+>/g, '').trim();

      chapters.push({
        title: title || (idAttr || `h${level}`),
        level,
        line: i,
        raw: line.trim(),
      });
    }
  }

  return chapters;
}
```

- [ ] **Step 3: Modify `identifyChapters` to dispatch by file type**

Change the existing function signature and add dispatch:

```typescript
function identifyChapters(content: string, sourcePath: string): ChapterInfo[] {
  if (sourcePath.endsWith('.html') || sourcePath.endsWith('.htm')) {
    return identifyChaptersHtml(content);
  }
  // Existing markdown logic unchanged below...
  const chapters: ChapterInfo[] = [];
  const lines = content.split('\n');
  // ...rest of original function unchanged...
}
```

- [ ] **Step 4: Replace `shardContent` with `buildShardIndex`**

Replace the entire `shardContent` function with:

```typescript
function buildShardIndex(
  content: string,
  chapters: ChapterInfo[],
  sourcePath: string,
  lang: 'zh' | 'en',
): ShardEntry[] {
  const lines = content.split('\n');
  const absPath = path.resolve(sourcePath);
  const entries: ShardEntry[] = [];

  const moduleChapters = chapters.filter(ch => ch.level === 2 || ch.level === 3);

  if (moduleChapters.length === 0) {
    // Full file as single shard
    const charCount = content.length;
    entries.push({
      id: '', file: '',  // filled in by main() during renumbering
      locator: `${absPath}-1-${lines.length}-001`,
      module: '全文',
      chapter_ref: '全文',
      source_path: absPath,
      source_start_line: 1,
      source_end_line: lines.length,
      char_count: charCount,
      estimated_tokens: estimateTokens(content, lang),
    });
    return entries;
  }

  for (let i = 0; i < moduleChapters.length; i++) {
    const ch = moduleChapters[i]!;
    const nextCh = moduleChapters[i + 1];
    const startLine = ch.line + 1;   // 1-based
    const endLine = nextCh ? nextCh.line : lines.length;

    const shardLines = lines.slice(startLine - 1, endLine);
    const shardText = shardLines.join('\n');
    const chunkId = '001';

    entries.push({
      id: '', file: '',
      locator: `${absPath}-${startLine}-${endLine}-${chunkId}`,
      module: ch.title,
      chapter_ref: ch.raw,
      source_path: absPath,
      source_start_line: startLine,
      source_end_line: endLine,
      char_count: shardText.length,
      estimated_tokens: estimateTokens(shardText, lang),
    });
  }

  return entries;
}
```

- [ ] **Step 5: Modify `main()` — replace merged-content flow with per-file flow**

In `main()`, replace lines ~245-290 (from content reading through file writing):

```typescript
  // Collect source files
  const sourceFiles = collectSourceFiles(absSrc);
  const allShards: ShardEntry[] = [];
  const warnings: string[] = [];
  let totalGaps: GapEntry[] = [];

  for (const sourcePath of sourceFiles) {
    let content: string;
    try {
      content = fs.readFileSync(sourcePath, 'utf-8');
    } catch (err) {
      return { status: 'error', message: `Failed to read ${sourcePath}: ${(err as Error).message}` };
    }

    // HTML files: keep raw content, do NOT strip tags
    const chapters = identifyChapters(content, sourcePath);
    if (chapters.length === 0) {
      warnings.push(`${sourcePath}: 未识别到章节，全文作为单分片`);
    }

    const shards = buildShardIndex(content, chapters, sourcePath, lang);
    allShards.push(...shards);

    const fileGaps = detectGaps(content, chapters);
    totalGaps = totalGaps.concat(fileGaps);
  }

  // Renumber shards with sequential IDs
  const total = allShards.length;
  for (let i = 0; i < allShards.length; i++) {
    const s = allShards[i]!;
    s.id = `S${String(i + 1).padStart(3, '0')}`;
    s.file = s.id;
  }

  // Write shard_index.json (no 1_shard/ directory)
  const sourceHash = crypto.createHash('sha256').update(
    sourceFiles.map(f => fs.readFileSync(f, 'utf-8')).join('')
  ).digest('hex');

  const index: ShardIndex = {
    version: '1.1',
    source_path: absSrc,
    source_hash: sourceHash,
    language: lang,
    total_chars: allShards.reduce((sum, s) => sum + s.char_count, 0),
    total_shards: allShards.length,
    shards: allShards,
    gaps: totalGaps,
    warnings,
  };

  const ctxDir = path.join(workDir, '_ctx');
  if (!fs.existsSync(ctxDir)) fs.mkdirSync(ctxDir, { recursive: true });
  fs.writeFileSync(path.join(ctxDir, 'shard_index.json'), JSON.stringify(index, null, 2), 'utf-8');
```

Remove the entire block that writes to `1_shard/` (the old `shardDir` logic, lines ~287-290).

- [ ] **Step 6: Update tests in manifest.test.ts**

The existing tests check `1_shard/` for physical files. Update to check `_ctx/shard_index.json`:

```typescript
// Replace: checking 1_shard/ directory existence
// With: checking _ctx/shard_index.json existence and locator field

// Example updated test assertion:
const indexPath = path.join(WORKDIR, '_ctx', 'shard_index.json');
ok(fs.existsSync(indexPath), 'shard_index.json must exist');
const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
ok(index.shards.length >= 2, 'must have at least 2 shards');
ok(index.shards[0].locator, 'each shard must have locator');
ok(index.shards[0].locator.includes(expectSourcePath), 'locator must contain source path');
ok(!fs.existsSync(path.join(WORKDIR, '1_shard')), '1_shard/ must NOT be created');
```

- [ ] **Step 7: Run tests — verify RED then GREEN**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/manifest.test.ts
```
Expected: RED (tests reference old file structure) → GREEN after implementation

- [ ] **Step 8: Commit**

```bash
git add .claude/skills/srs-formalizer/scripts/commands/manifest.ts .claude/skills/srs-formalizer/scripts/__tests__/manifest.test.ts
git commit -m "feat(manifest): refactor to index-based sharding with format preservation

- collectSourceFiles: independent file scanning, no merging
- buildShardIndex: ShardEntry[] with locator, no physical files
- identifyChaptersHtml: HTML heading recognition via <h1>-<h6>
- Remove HTML tag-stripping (original content preserved)
- Remove 1_shard/ directory output
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Enhance inject-prompt.ts with --shard-id

**Files:**
- Modify: `.claude/skills/srs-formalizer/scripts/commands/inject-prompt.ts`
- Modify: `.claude/skills/srs-formalizer/scripts/__tests__/inject-prompt.test.ts`

**Interfaces:**
- Consumes: `ShardIndex`, `ShardEntry` from Task 1; reads `_ctx/shard_index.json`
- Produces: `--shard-id <id>` parameter, auto-injects SHARD_CONTENT from source file

- [ ] **Step 1: Add --shard-id parsing and auto-resolution logic**

In `main()`, after existing `--params` parsing (~line 32):

```typescript
  const shardId = parseArg(args, '--shard-id');
  
  // Auto-resolve SHARD_CONTENT from shard_index.json when --shard-id is provided
  if (shardId) {
    if (!workDirArg) {
      return { status: 'error', message: '--workdir is required when --shard-id is used' };
    }
    
    let workDir: string;
    try {
      workDir = validateWorkDir(workDirArg);
    } catch (err) {
      return { status: 'error', message: (err as Error).message };
    }
    
    const indexPath = path.join(workDir, '_ctx', 'shard_index.json');
    if (!fs.existsSync(indexPath)) {
      return { status: 'error', message: `shard_index.json not found at ${indexPath}` };
    }
    
    let index: import('../types/index.js').ShardIndex;
    try {
      index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    } catch {
      return { status: 'error', message: 'Failed to parse shard_index.json' };
    }
    
    const shard = index.shards.find(s => s.id === shardId);
    if (!shard) {
      return { status: 'error', message: `Shard not found: ${shardId}` };
    }
    
    // Read content from original source file by line range
    if (!fs.existsSync(shard.source_path)) {
      return { status: 'error', message: `Source file not found: ${shard.source_path}` };
    }
    
    const srcContent = fs.readFileSync(shard.source_path, 'utf-8');
    const lines = srcContent.split('\n');
    const shardContent = lines.slice(shard.source_start_line - 1, shard.source_end_line).join('\n');
    
    // Inject (don't override if already in --params)
    if (!params['SHARD_CONTENT']) {
      params['SHARD_CONTENT'] = shardContent;
    }
    if (!params['SHARD_ID']) {
      params['SHARD_ID'] = shard.id;
    }
  }
```

Requires adding this import at the top:
```typescript
import * as path from 'node:path';
import { validateWorkDir } from '../lib/security.js';
```

- [ ] **Step 2: Add tests for --shard-id in inject-prompt.test.ts**

```typescript
// New test: auto-resolves SHARD_CONTENT from shard_index.json
it('auto-resolves SHARD_CONTENT when --shard-id is provided', async () => {
  // Setup: create a minimal SRS file + shard_index.json
  const srcFile = path.join(TMP, 'test-srs.md');
  fs.writeFileSync(srcFile, 'line 1\nline 2\nline 3\nline 4\nline 5\n', 'utf-8');
  
  const ctxDir = path.join(WORKDIR, '_ctx');
  fs.mkdirSync(ctxDir, { recursive: true });
  fs.writeFileSync(path.join(ctxDir, 'shard_index.json'), JSON.stringify({
    version: '1.1',
    source_path: TMP,
    source_hash: 'a'.repeat(64),
    language: 'zh',
    total_chars: 35,
    total_shards: 1,
    shards: [{
      id: 'S001', file: 'S001',
      locator: `${srcFile}-2-4-001`,
      module: 'test', chapter_ref: '# test',
      source_path: srcFile,
      source_start_line: 2,
      source_end_line: 4,
      char_count: 15,
      estimated_tokens: 10,
    }],
    gaps: [],
    warnings: [],
  }), 'utf-8');
  
  const result = await main([
    '--template', TEMPLATE_PATH,
    '--shard-id', 'S001',
    '--workdir', WORKDIR,
    '--params', '{}',
  ]);
  
  strictEqual(result.status, 'ok');
  const data = result.data as string;
  ok(data.includes('line 2'), 'Must include line 2 from source file');
  ok(data.includes('line 3'), 'Must include line 3 from source file');
  ok(data.includes('line 4'), 'Must include line 4 from source file');
  ok(!data.includes('line 1'), 'Must NOT include line 1 (outside range)');
  ok(!data.includes('line 5'), 'Must NOT include line 5 (outside range)');
});

// New test: does not override manually provided SHARD_CONTENT
it('does not override SHARD_CONTENT when already in --params', async () => {
  const result = await main([
    '--template', TEMPLATE_PATH,
    '--shard-id', 'S001',
    '--workdir', WORKDIR,
    '--params', '{"SHARD_CONTENT":"manual content"}',
  ]);
  
  strictEqual(result.status, 'ok');
  const data = result.data as string;
  ok(data.includes('manual content'), 'Must preserve manually provided content');
});

// New test: error on missing shard_index.json
it('returns error when shard_index.json does not exist', async () => {
  const emptyWorkdir = path.join(TMP, 'empty-workdir');
  fs.mkdirSync(emptyWorkdir, { recursive: true });
  
  const result = await main([
    '--template', TEMPLATE_PATH,
    '--shard-id', 'S001',
    '--workdir', emptyWorkdir,
    '--params', '{}',
  ]);
  
  strictEqual(result.status, 'error');
  ok(result.message!.includes('shard_index.json'));
});
```

- [ ] **Step 3: Run tests**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/inject-prompt.test.ts
```
Expected: RED → GREEN after implementation

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/srs-formalizer/scripts/commands/inject-prompt.ts .claude/skills/srs-formalizer/scripts/__tests__/inject-prompt.test.ts
git commit -m "feat(inject-prompt): add --shard-id for auto-resolving SHARD_CONTENT

Reads _ctx/shard_index.json, finds matching shard by id, reads original
source file by line range from structured fields. Does not override
manually provided SHARD_CONTENT. Respects workdir security boundary.
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Remove `1_shard/` from init.ts and validators

**Files:**
- Modify: `.claude/skills/srs-formalizer/scripts/commands/init.ts`
- Modify: `.claude/skills/srs-formalizer/scripts/commands/verify-gate.ts`

- [ ] **Step 1: Remove `'1_shard'` from init.ts SUBDIRS array**

```typescript
// In init.ts, remove '1_shard' from SUBDIRS:
const SUBDIRS = [
  // '1_shard',   ← REMOVED
  '_ctx',
  // ... rest unchanged ...
];
```

- [ ] **Step 2: Update verify-gate checkShardCompleteness**

```typescript
// In verify-gate.ts, modify checkShardCompleteness:
// Instead of checking 1_shard/ for physical files, verify locator source_path exists
function checkShardCompleteness(workDir: string): CheckResult {
  try {
    const indexPath = path.join(workDir, '_ctx', 'shard_index.json');
    if (!fs.existsSync(indexPath)) {
      return { name: 'Shard completeness', passed: false, detail: 'shard_index.json not found' };
    }
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    const shards = index.shards || [];
    const missingSources: string[] = [];
    const seenSources = new Set<string>();
    
    for (const shard of shards) {
      const key = shard.source_path;
      if (seenSources.has(key)) continue;
      seenSources.add(key);
      if (!fs.existsSync(shard.source_path)) {
        missingSources.push(shard.source_path);
      }
    }
    
    return {
      name: 'Shard completeness',
      passed: missingSources.length === 0,
      detail: missingSources.length === 0
        ? `All ${shards.length} shards reference existing source files`
        : `Missing source files: ${missingSources.slice(0, 3).join(', ')}`,
    };
  } catch {
    return { name: 'Shard completeness', passed: false, detail: 'Could not verify shards' };
  }
}
```

- [ ] **Step 3: Run affected tests**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/init.test.ts __tests__/verify-gate.test.ts
```
Expected: PASS after implementation updates

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/srs-formalizer/scripts/commands/init.ts .claude/skills/srs-formalizer/scripts/commands/verify-gate.ts
git commit -m "refactor: remove 1_shard/ directory, update verifier for index-based shards

- init.ts: remove '1_shard' from SUBDIRS
- verify-gate.ts: checkShardCompleteness now verifies source_path existence
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Update orchestrator prompts and SKILL.md

**Files:**
- Modify: `.claude/skills/srs-formalizer/prompts/orchestrator_stage_S1.md`
- Modify: `.claude/skills/srs-formalizer/prompts/orchestrator_stage_S2.md`
- Modify: `.claude/skills/srs-formalizer/SKILL.md`
- Modify: `.claude/skills/srs-formalizer/templates/checklists/1_shard_CHECKLIST.md`

- [ ] **Step 1: Update orchestrator_stage_S1.md**

Change line 31 from:
```
验证输出为 `{"status":"ok"}`。目录结构：1_shard/ 2_extract/ 3_graph/ 4_bdd/ 5_formal/ 6_outputs/
```
To:
```
验证输出为 `{"status":"ok"}`。目录结构：2_extract/ 3_graph/ 4_bdd/ 5_formal/ 6_outputs/
```

Change lines 44-60 (the shard review steps and output sections):
```
### 步骤 3：审查分片索引
- 读取 `_ctx/shard_index.json`，确认 `total_shards` >= 1
- 每个 shard 含 `locator`（`{file_abspath}-{start}-{end}-{chunk_id}`），可快速定位源文件
- 确认每分片 `estimated_tokens ≤ 20000`

## 产出物
- `_ctx/shard_index.json` — 分片索引（含 locator/source_path/line_range/total_shards）
- CONTEXT.md / GAPS.md / MINDMAP.md / STATE.md
```

- [ ] **Step 2: Update orchestrator_stage_S2.md**

Change line 21 from:
```
对 1_shard/ 下每个分片：
```
To:
```
对 `_ctx/shard_index.json` 中每个分片：
```

Change lines 47-48 inject-prompt calls from `--params '{"SHARD_CONTENT":"..."}'` to:
```bash
inject-prompt --template prompts/executor-R1.md --shard-id <shard_id> --workdir .srs_formalizer
```

- [ ] **Step 3: Update SKILL.md**

Change directory structure diagram (lines ~90-106):
```
.srs_formalizer/
├── _ctx/                  # shard_index.json (索引化分片)
├── 2_extract/
│   ...
```
(Remove `├── 1_shard/` line entirely)

Add to section "S1 阶段: 预处理" table:
```markdown
| `manifest --src <path>` | 索引化分片 + 章节识别 (不创建物理文件) | S1 |
```

- [ ] **Step 4: Update 1_shard_CHECKLIST.md**

```markdown
# S1 预处理 — 验收清单

- [ ] init 成功创建 `.srs_formalizer/` 及全部阶段目录
- [ ] manifest 成功生成索引化分片
- [ ] `_ctx/shard_index.json` 存在且 `total_shards ≥ 1`
- [ ] 每个 shard 含 `locator`（`{file_abspath}-{start}-{end}-{chunk_id}`）
- [ ] 每个 shard 的 `source_path` 指向的源文件存在
- [ ] GAPS.md 已生成，缺口已标注优先级
- [ ] CONTEXT.md 含术语表和切片索引
- [ ] STATE.md 当前阶段标记为 S1 完成
```

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/srs-formalizer/prompts/orchestrator_stage_S1.md \
        .claude/skills/srs-formalizer/prompts/orchestrator_stage_S2.md \
        .claude/skills/srs-formalizer/SKILL.md \
        .claude/skills/srs-formalizer/templates/checklists/1_shard_CHECKLIST.md
git commit -m "docs: update orchestrator, SKILL.md and checklists for shard index refactor

- Remove all 1_shard/ references from pipeline documentation
- S2 inject-prompt calls now use --shard-id instead of SHARD_CONTENT param
- CHECKLIST updated for locator-based verification
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Update checklists lib and CHANGELOG

**Files:**
- Modify: `.claude/skills/srs-formalizer/scripts/lib/checklists.ts`
- Modify: `.claude/skills/srs-formalizer/CHANGELOG.md`

- [ ] **Step 1: Update checklists.ts CANONICAL and content**

In `scripts/lib/checklists.ts`, update the `'1_shard'` entry in CHECKLISTS:

```typescript
'1_shard': `# S1 预处理 — 验收清单

- [ ] init 成功创建目录结构
- [ ] manifest 成功生成索引化分片
- [ ] _ctx/shard_index.json 存在且 total_shards >= 1
- [ ] 每个 shard 含 locator（{file_abspath}-{start}-{end}-{chunk_id}）
- [ ] 每个 shard 的 source_path 指向的源文件存在
- [ ] GAPS.md 已生成，缺口已标注优先级
- [ ] CONTEXT.md 含术语表和切片索引
- [ ] STATE.md 当前阶段标记为 S1 完成
`,
```

Update `CANONICAL['1_shard']`:
```typescript
'1_shard': {
  expected_count: 8,
  required_headers: ['S1', '预处理', '验收清单'],
  required_phrases: ['init 成功', 'manifest 成功', 'shard_index.json', 'total_shards', 'locator', 'source_path', 'GAPS.md', 'CONTEXT.md'],
},
```

- [ ] **Step 2: Update CHANGELOG.md**

Add at top:
```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/srs-formalizer/scripts/lib/checklists.ts .claude/skills/srs-formalizer/CHANGELOG.md
git commit -m "chore: update checklists lib and CHANGELOG for shard index refactor v0.5.0"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsx --test __tests__/*.test.ts
```
Expected: all tests PASS

- [ ] **Step 2: Run typecheck**

```bash
cd .claude/skills/srs-formalizer/scripts && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Smoke test — manifest HTML file**

```bash
cd /home/celebi/openspec_skill_create_dir
rm -rf /tmp/smoke-test-shard/.srs_formalizer
mkdir -p /tmp/smoke-test-shard/.srs_formalizer

# Use the HTML file that exposed the bug
npx tsx .claude/skills/srs-formalizer/scripts/index.ts manifest \
  --src reliable-dev-workflow/reliable-dev-workflow.html \
  --lang zh \
  --workdir /tmp/smoke-test-shard/.srs_formalizer
```
Expected: `{"status":"ok"}`, `shard_index.json` valid, no `1_shard/` created

- [ ] **Step 4: Smoke test — inject-prompt with --shard-id**

```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts inject-prompt \
  --template .claude/skills/srs-formalizer/prompts/executor-R1.md \
  --shard-id S001 \
  --workdir /tmp/smoke-test-shard/.srs_formalizer \
  --params '{}'
```
Expected: `{"status":"ok"}`, content contains actual HTML lines from the source file

- [ ] **Step 5: Verify no 1_shard/ created**

```bash
test ! -d /tmp/smoke-test-shard/.srs_formalizer/1_shard && echo "PASS: no 1_shard/" || echo "FAIL: 1_shard exists"
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: final verification — all tests pass, smoke test OK, no 1_shard/ created"
```
