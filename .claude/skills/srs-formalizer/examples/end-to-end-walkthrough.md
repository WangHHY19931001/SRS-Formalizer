# End-to-End Walkthrough: Formalizing an SRS with srs-formalizer

This walkthrough demonstrates the complete srs-formalizer pipeline using the
built-in Chinese SRS fixture `srs-sample-zh.md` (a requirements specification for
an online mall system). The fixture is located at:

```
.claude/skills/srs-formalizer/scripts/__tests__/fixtures/srs-sample-zh.md
```

**Prerequisites**

- Node.js >= 20
- `npx tsx` available in PATH (supplied by the `typescript` devDependency)
- Working directory: `.claude/skills/srs-formalizer/` (the skill root directory)

---

## Pipeline Overview

```
init  →  compile  →  manifest  →  inject-prompt  →  build-graph  →
export-cypher  →  generate-bdd  →  verify-gate
```

Eight commands that take a plain-text SRS through indexing, extraction, graph
construction, Cypher export, BDD generation, and final gate verification.

---

## Step 1: `init` -- Initialize the Work Directory

Create the `.srs_formalizer` directory tree with all stage subdirectories,
`STATE.md`, and per-stage `CHECKLIST.md` files.

**Command:**

```bash
npx tsx index.ts init --output .srs_formalizer
```

**Expected output (first run):**

```json
{"status":"ok"}
```

**Expected output (idempotent -- subsequent runs):**

```json
{"status":"ok","message":"目录已存在，跳过创建"}
```

**What it creates:**

```
.srs_formalizer/
├── _ctx/
├── 2_extract/r1-explicit/
├── 2_extract/r2-implicit/
├── 2_extract/r3-relational/
├── 2_extract/architecture/
├── 3_graph/graph/
├── 3_graph/analysis/subagent_prompts/
├── 4_bdd/features/
├── 5_formal/specs/
├── 5_formal/proofs/
├── 6_outputs/knowledge_graph/
├── 6_outputs/brainstorming/
├── backups/
├── STATE.md
└── CHECKLIST.md (per stage directory)
```

---

## Step 2: `compile` -- Compile SKILL.md into SkIR

Parse the skill's `SKILL.md`, build an Intermediate Representation (SkIR), inject
anti-skill safety constraints, validate the schema, and emit platform artifacts
(Claude XML and generic markdown).

**Command:**

```bash
npx tsx index.ts compile \
  --skill-dir . \
  --workdir .srs_formalizer
```

**Expected output (abridged):**

```json
{
  "status": "ok",
  "data": {
    "skir_path": "_ctx/skir.json",
    "emitted": [
      "skill.claude.xml",
      "skill.generic.md"
    ],
    "constraints_injected": 3,
    "security_level": "high",
    "source_hash": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
    "compiled_at": "2026-07-01T12:00:00.000Z"
  }
}
```

**What it produces in `_ctx/`:**

- `skir.json` -- full Skill Intermediate Representation
- `skill.claude.xml` -- Claude-platform XML artifact
- `skill.generic.md` -- generic markdown artifact

---

## Step 3: `manifest` -- Shard the SRS and Recognize Chapters

Index the fixture file into logical shards based on Markdown headings, detect
information gaps (e.g., unresolved issues from section 7), and write the
`shard_index.json`, `CONTEXT.md`, and `GAPS.md` files.

**Command:**

```bash
npx tsx index.ts manifest \
  --src scripts/__tests__/fixtures/srs-sample-zh.md \
  --lang zh \
  --workdir .srs_formalizer
```

**Expected output:**

```json
{
  "status": "ok",
  "data": {
    "shard_count": 8,
    "gap_count": 2,
    "source_hash": "f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3"
  }
}
```

**What it produces:**

| File | Description |
|------|-------------|
| `_ctx/shard_index.json` | Version 1.1 index with 8 shards, chapter titles, line ranges, token estimates |
| `CONTEXT.md` | Glossary terms extracted from the 术语表 table + module-index table |
| `GAPS.md` | Two P0 gaps detected from 尚未解决的问题 section |

The 8 shards correspond to:

| ID | Module | Lines (1-based) |
|----|--------|-----------------|
| S001 | 术语表 | 3-9 |
| S002 | 模块能力矩阵 | 10-16 |
| S003 | 功能需求 | 17-18 |
| S004 | 用户注册 | 19-22 |
| S005 | 用户登录 | 23-26 |
| S006 | 创建订单 | 27-30 |
| S007 | 支付订单 | 31-34 |
| S008 | 尚未解决问题 | 35-39 |

**shard_index.json structure (abridged):**

```json
{
  "version": "1.1",
  "source_path": "/absolute/path/to/srs-sample-zh.md",
  "source_hash": "f1e2d3c4...",
  "language": "zh",
  "total_chars": 468,
  "total_shards": 8,
  "shards": [
    {
      "id": "S001",
      "file": "S001",
      "locator": "/path/.../srs-sample-zh.md-3-9-001",
      "module": "术语表",
      "chapter_ref": "## \\u00a71.4 术语表",
      "source_path": "/absolute/path/to/srs-sample-zh.md",
      "source_start_line": 3,
      "source_end_line": 9,
      "char_count": 57,
      "estimated_tokens": 38
    }
  ],
  "gaps": [
    {
      "priority": "P0",
      "type": "unsolved_issue",
      "description": "退款流程中部分退款的时间窗口定义不明确",
      "source_chapter": "\\u00a77"
    },
    {
      "priority": "P0",
      "type": "unsolved_issue",
      "description": "库存锁定的超时释放策略待确定",
      "source_chapter": "\\u00a77"
    }
  ],
  "warnings": []
}
```

---

## Step 4: `inject-prompt` -- Inject a Sub-Agent Prompt with `--shard-id`

Fill the R1 executor template with real content from shard `S001` (术语表). The
`--shard-id` flag automatically resolves `{{SHARD_CONTENT}}` and `{{SHARD_ID}}`
from the `shard_index.json` and the original source file.

**Command:**

```bash
npx tsx index.ts inject-prompt \
  --template prompts/executor-R1.md \
  --shard-id S001 \
  --workdir .srs_formalizer
```

**Expected output (the filled template -- abridged):**

```json
{
  "status": "ok",
  "data": "# 执行者-R1：显式需求提取\n\n## 角色\n从 SRS 分片中提取显式功能需求。**你只有填空权，没有创造权。**\n\n## 输入\n- 分片内容：`\\n| 术语 | 定义 |\\n|------|------|\\n| SKU | 库存量单位 |\\n| OMS | 订单管理系统 |\\n`\n- 分片 ID：`S001`\n\n## 输出模板（逐字复制，只填 `<...>` 占位符）\n\n每行输出一条 JSON。\n\n```jsonl\n{\"id\":\"R1-<SAFE_ID>-<SEQ>\",\"category\":\"explicit\",\"statement\":\"<SRS原文>\",\"source_file\":\"<SHARD_ID>_S1.md\",\"confidence\":\"<CONF>\",\"metadata\":{}}\n```\n\n| 占位符 | 填充规则 | 示例 |\n|--------|---------|------|\n| `<SAFE_ID>` | 分片 ID 仅保留 ASCII 字母数字下划线，去除中文和特殊符 | `S001` |\n| `<SEQ>` | 4 位序号，从 0001 递增 | `0001` |\n| `<SRS原文>` | 直接引用 SRS 原文，最小改写 | `系统应支持手机号注册` |\n| `<SHARD_ID>` | 原样填入分片 ID | `S001` |\n| `<CONF>` | `high`（明确）/ `medium`（模糊）/ `low`（隐含） | `high` |\n\n## 硬性约束（违反 → validate-jsonl REJECTED）\n\n1. **key 名不可变**：`id` `category` `statement` `source_file` `confidence` `metadata`\n2. **category 只能是 `explicit`**\n3. **id 正则 `^R1-[A-Za-z0-9_.]+-\\d{4}$`**\n4. **metadata 必须是 `{}`**\n5. **每条一行**：JSON 后紧跟换行\n6. **空分片输出空文件**：0 字节\n\n## 文件操作约束\n输出写入 `.srs_formalizer/2_extract/r1-explicit/S001.jsonl`\n"
}
```

> The `data` field carries the filled template as a string. The agent (or a human
> operator) would pipe this output or pass it to a sub-agent that writes the
> JSONL file to `.srs_formalizer/2_extract/r1-explicit/S001.jsonl`.

---

## Step 5: `build-graph` -- Build the Knowledge Graph

Read all JSONL files from `2_extract/r1-explicit/`, `r2-implicit/`, and
`r3-relational/`, deduplicate by ID, and construct a requirement knowledge graph.
Outputs `graph.json` to `3_graph/graph/`.

This step assumes that extraction has been completed by sub-agents across all
shards, producing JSONL files under the extraction directories. Below is the
expected result after a full run with all extractors.

**Command:**

```bash
npx tsx index.ts build-graph --workdir .srs_formalizer
```

**Expected output (abridged -- nodes/edges elided for brevity):**

```json
{
  "status": "ok",
  "data": {
    "nodes": [
      {
        "id": "R1-S001-0001",
        "labels": [":Requirement"],
        "properties": {
          "statement": "系统应支持手机号注册和邮箱注册两种方式。",
          "source_file": "S004_S1.md",
          "confidence": "high",
          "category": "explicit"
        }
      },
      {
        "id": "R1-S001-0002",
        "labels": [":Requirement"],
        "properties": {
          "statement": "系统应支持密码登录和短信验证码登录。",
          "source_file": "S005_S1.md",
          "confidence": "high",
          "category": "explicit"
        }
      },
      {
        "id": "R1-S001-0003",
        "labels": [":Requirement"],
        "properties": {
          "statement": "用户选择商品后可创建订单，系统应锁定库存。",
          "source_file": "S006_S1.md",
          "confidence": "high",
          "category": "explicit"
        }
      },
      {
        "id": "R1-S001-0004",
        "labels": [":Requirement"],
        "properties": {
          "statement": "系统应支持微信支付和支付宝支付。",
          "source_file": "S007_S1.md",
          "confidence": "high",
          "category": "explicit"
        }
      }
    ],
    "edges": []
  }
}
```

> The `build-graph` command returns the full graph in its `data` field. The same
> graph is persisted to `3_graph/graph/graph.json` on disk.

---

## Step 6: `export-cypher` -- Export the Graph as a Cypher Script

Convert the knowledge graph into a reusable Cypher script for Neo4j import.
Includes unique constraints, `CREATE` node statements, and `MATCH ... CREATE`
edge statements.

**Command:**

```bash
npx tsx index.ts export-cypher --workdir .srs_formalizer
```

**Expected output:**

```json
{
  "status": "ok",
  "data": {
    "node_count": 4,
    "edge_count": 0,
    "output_path": "/absolute/path/.srs_formalizer/6_outputs/knowledge_graph/schema.cypher"
  }
}
```

**Generated Cypher script (`6_outputs/knowledge_graph/schema.cypher`):**

```cypher
// SRS-Formalizer Knowledge Graph
// Auto-generated Cypher script

// === Constraints ===
CREATE CONSTRAINT IF NOT EXISTS FOR (n:Requirement) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (n:Module) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT IF NOT EXISTS FOR (n:Actor) REQUIRE n.id IS UNIQUE;

// === Nodes ===
CREATE (:Requirement {id: "R1-S001-0001", statement: "系统应支持手机号注册和邮箱注册两种方式。", source_file: "S004_S1.md", confidence: "high", category: "explicit"});
CREATE (:Requirement {id: "R1-S001-0002", statement: "系统应支持密码登录和短信验证码登录。", source_file: "S005_S1.md", confidence: "high", category: "explicit"});
CREATE (:Requirement {id: "R1-S001-0003", statement: "用户选择商品后可创建订单，系统应锁定库存。", source_file: "S006_S1.md", confidence: "high", category: "explicit"});
CREATE (:Requirement {id: "R1-S001-0004", statement: "系统应支持微信支付和支付宝支付。", source_file: "S007_S1.md", confidence: "high", category: "explicit"});

// === Edges ===
```

---

## Step 7: `generate-bdd` -- Generate Gherkin BDD Skeleton

Generate `.feature` files from the knowledge graph, grouped by module. Each
requirement node becomes a `Scenario` with `Given` / `When` / `Then` placeholders.

**Command:**

```bash
npx tsx index.ts generate-bdd --workdir .srs_formalizer
```

**Expected output:**

```json
{
  "status": "ok",
  "data": {
    "features_created": 1,
    "modules": ["Unknown"],
    "total_requirements": 4
  }
}
```

> When nodes lack a `module` property, they are grouped into the `"Unknown"`
> module. After architecture decomposition (the `build-architecture` command),
> nodes would be assigned to specific modules like `"用户模块"` or `"订单模块"`,
> producing multiple `.feature` files.

**Generated feature file (`4_bdd/features/Unknown.feature`):**

```gherkin
# SYSTEM: SRS
# TRACE: PENDING
# TLA_REFS: PENDING
# LEAN_REFS: PENDING

Feature: Unknown

  Scenario: R1-S001-0001: 系统应支持手机号注册和邮箱注册两种方式。
    Given the requirement R1-S001-0001 is defined
    When the system is implemented according to the requirement
    Then <THEN_PLACEHOLDER>

  Scenario: R1-S001-0002: 系统应支持密码登录和短信验证码登录。
    Given the requirement R1-S001-0002 is defined
    When the system is implemented according to the requirement
    Then <THEN_PLACEHOLDER>

  Scenario: R1-S001-0003: 用户选择商品后可创建订单，系统应锁定库存。
    Given the requirement R1-S001-0003 is defined
    When the system is implemented according to the requirement
    Then <THEN_PLACEHOLDER>

  Scenario: R1-S001-0004: 系统应支持微信支付和支付宝支付。
    Given the requirement R1-S001-0004 is defined
    When the system is implemented according to the requirement
    Then <THEN_PLACEHOLDER>
```

---

## Step 8: `verify-gate` -- Run the Final Verification Gate

Execute the full suite of gate checks for the `FINAL` stage: STATE.md and
shard index existence, JSONL completeness in all extraction directories,
graph loadability, BDD validation, Cypher existence, and mindmap completion.

**Command:**

```bash
npx tsx index.ts verify-gate \
  --workdir .srs_formalizer \
  --stage FINAL
```

**Expected output:**

```json
{
  "status": "ok",
  "data": {
    "pass": true,
    "checks": {
      "STATE.md exists": { "passed": true, "detail": "Found" },
      "_ctx/shard_index.json exists": { "passed": true, "detail": "Found" },
      "r1-explicit has JSONL files": { "passed": true, "detail": "1 file(s)" },
      "Shard completeness": { "passed": true, "detail": "All 8 shards reference existing source files" },
      "1_shard/CHECKLIST.md complete": { "passed": true, "detail": "All 6/6 checked" },
      "2_extract/CHECKLIST.md complete": { "passed": true, "detail": "All 8/8 checked" },
      "3_graph/CHECKLIST.md complete": { "passed": true, "detail": "All 5/5 checked" },
      "JSONL existence (all subdirectories)": { "passed": true, "detail": "2_extract/r1-explicit: 1 file(s); 2_extract/r2-implicit: 1 file(s); 2_extract/r3-relational: 1 file(s)" },
      "Architecture JSONL exists": { "passed": true, "detail": "3 file(s)" },
      "ID uniqueness (no duplicates across files)": { "passed": true, "detail": "All IDs unique" },
      "Graph loadable": { "passed": true, "detail": "Loaded from graph/graph.json" },
      "Graph edge integrity": { "passed": true, "detail": "All 0 edges reference existing nodes" },
      "Node count >= R1 explicit requirements": { "passed": true, "detail": "4 nodes >= 4 R1 requirements" },
      "4_bdd/CHECKLIST.md complete": { "passed": true, "detail": "All 3/3 checked" },
      "5_formal/CHECKLIST.md complete": { "passed": true, "detail": "All 3/3 checked" },
      "6_outputs/CHECKLIST.md complete": { "passed": true, "detail": "All 4/4 checked" },
      "validate-bdd passes": { "passed": true, "detail": "All 1 .feature file(s) valid" },
      "graph.merged.json exists": { "passed": true, "detail": "Found" },
      "outputs/knowledge_graph/schema.cypher exists": { "passed": true, "detail": "Found" },
      "outputs/brainstorming/brainstorm_context.json exists": { "passed": true, "detail": "Found" },
      "MINDMAP.md all modules ✅": { "passed": true, "detail": "All modules marked complete" }
    },
    "errors": []
  }
}
```

---

## Summary

After completing all eight steps, your `.srs_formalizer/` directory contains:

| Artifact | Path | Description |
|----------|------|-------------|
| SkIR | `_ctx/skir.json` | Compiled skill intermediate representation |
| Shard Index | `_ctx/shard_index.json` | 8 indexed shards from the fixture SRS |
| Knowledge Graph | `3_graph/graph/graph.json` | Nodes (requirements) and edges |
| Cypher Script | `6_outputs/knowledge_graph/schema.cypher` | Importable Neo4j schema |
| BDD Features | `4_bdd/features/*.feature` | Gherkin skeleton per module |
| State | `STATE.md` | Pipeline progress tracker |
| Gaps | `GAPS.md` | Detected information gaps |
| Checklists | `*_CHECKLIST.md` | Stage completion checklists |
| Brainstorm Context | `6_outputs/brainstorming/brainstorm_context.json` | Full graph for brainstorming |

The pipeline is modular -- each command is independent and can be re-run as
sub-agents complete their work on individual extraction steps and analysis
stages.
