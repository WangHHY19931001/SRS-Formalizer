# 多平台激活适配参考

> AI 有能力但缺乏"制度约束"。仅靠 SKILL.md description 匹配，激活率约 25%。本文档提供 15 个平台的强制激活方案，将激活率提升到 90%+。未列出的平台参见末尾"抽象兜底参考"。

---

## 一、平台速查

| 平台 | 激活机制 | 配置文件 | 推荐方案 |
|------|---------|---------|---------|
| Claude Code | Hooks | `.claude/settings.json` | UserPromptSubmit 强制评估 |
| Cursor | Rules (.mdc) | `.cursor/rules/*.mdc` | alwaysApply + globs |
| Codex CLI | Hooks | `hooks.json` | UserPromptSubmit 扫描 |
| Gemini/Antigravity | Plugins + TOML | `.gemini/commands/*.toml` | `/srs-formalizer` 命令 |
| Windsurf | Rules | `.windsurfrules` 或 `.windsurf/rules/` | always-on + 关键词 |
| GitHub Copilot | Instructions | `.github/copilot-instructions.md` | 规则注入 |
| Qoder | Rules API | `.qoder/rules/srs.md` | Always Apply |
| Trae | Rules | `.trae/rules/srs-formalizer.md` | 项目规则 |
| Kiro | Rules | `.kiro/rules/` | 文件约定 |
| OpenCode | Rules | `.opencode/rules/` | AGENTS.md 兼容 |
| Qwen Code | Rules | `.qwen/rules/` | 文件约定 |
| OpenClaw | Rules | `.openclaw/rules/` | 文件约定 |
| Hermes Agent | Skills（自改进） | `~/.hermes/skills/` | 首次使用后自优化 |
| DeerFlow 2.0 | Skills | `.iflow/skills/` | iFlow CLI |
| Aider | Conventions | `CONVENTIONS.md` | 项目约定文件 |

---

## 二、Claude Code — Hook 强制评估

### UserPromptSubmit 钩子（激活率 25%→90%）

创建 `.claude/hooks/srs-eval.js`：

```javascript
const SRS_KEYWORDS = [
  'SRS', '需求规格', '软件需求', '系统需求', '功能需求',
  '需求文档', '需求分析', '形式化', '知识图谱', 'BDD',
  'Gherkin', 'TLA+', 'Lean', 'Cypher', 'Neo4j',
  'srs.md', '需求说明书', '规格说明', '§1.', '§2.',
];

export default async function({ prompt }) {
  const text = prompt.toLowerCase();
  const matched = SRS_KEYWORDS.filter(kw => text.includes(kw.toLowerCase()));
  if (matched.length === 0) return { activate: false };

  console.log(`\n🔍 SRS 关键词命中: ${matched.slice(0,3).join(', ')}`);

  return {
    activate: true,
    skill: 'srs-formalizer',
    reason: `检测到 SRS 关键词: ${matched.slice(0, 3).join(', ')}`,
  };
}
```

`.claude/settings.json`：
```json
{
  "hooks": {
    "UserPromptSubmit": [{ "hook": "hooks/srs-eval.js" }]
  }
}
```

---

## 三、Cursor — Rules (.mdc) 自动附加

Created `.cursor/rules/srs-formalizer.mdc`：

```yaml
---
description: "SRS formalization — requirement extraction, knowledge graph, BDD, TLA+, Lean 4"
globs: ["**/*srs*.md", "**/*需求*.md", "**/*规格*.md", "**/*SRS*.md"]
alwaysApply: false
---
# SRS Formalizer Activation Rule

When the user provides or references an SRS document:

1. Load skill: srs-formalizer (from .cursor/skills/srs-formalizer/)
2. Run S0 Discovery first — scan structure, detect TLA+/Lean triggers, report to user
3. After user confirmation, execute S1→S6 pipeline
4. Each stage must pass verify-gate before next stage

**Keyword triggers**: SRS, 需求规格, 软件需求, §1., §2., 功能需求, Gherkin, TLA+, Lean, Cypher, 形式化, 知识图谱, BDD
```

---

## 四、Codex CLI — hooks.json

`hooks.json`（项目根目录或 `~/.codex/`）：

```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "hooks": [{
        "type": "command",
        "command": "python3 .codex/hooks/srs-activate.py"
      }]
    }],
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{
        "type": "command",
        "command": "python3 .codex/hooks/pre-tool-use.py"
      }]
    }]
  }
}
```

`.codex/hooks/srs-activate.py`：
```python
import sys, json

SRS_KEYWORDS = [
    'SRS', '需求规格', '软件需求', '系统需求', '功能需求',
    '需求文档', '形式化', '知识图谱', 'BDD', 'Gherkin', 'TLA+', 'Lean', 'Cypher'
]

prompt = sys.stdin.read()
matched = [kw for kw in SRS_KEYWORDS if kw.lower() in prompt.lower()]

result = {
    "hookSpecificOutput": {
        "hookEventName": "UserPromptSubmit",
        "srsDetected": len(matched) > 0,
        "matchedKeywords": matched[:5],
        "suggestedSkill": "srs-formalizer" if matched else None
    }
}
print(json.dumps(result))
```

---

## 五、Antigravity（原 Gemini CLI）— TOML 命令 + Plugin

### TOML 命令

`.gemini/commands/srs-formalizer.toml`：

```toml
description = "SRS 形式化全流程：预处理→需求提取→图谱构建→BDD生成→形式化→验收"
prompt = """
Load skill: srs-formalizer (from .gemini/skills/srs-formalizer/)

Execute the full pipeline:
1. S0 Discovery — scan SRS structure, detect TLA+/Lean triggers
2. S1 Preprocessing — Agent Bootstrap（手动创建 workdir 结构）
3. S2 Extraction — R1→Arch-1→R2→Arch-2→R3-1→Arch-3→R3-2
4. S3 Graph — Agent 生成 Cypher → validate-cypher
5. S4 BDD — Agent 生成 BDD → validate-bdd
6. S5 Formal — TLA+/Lean (conditional)
7. S6 Gate — verify-gate FINAL

Run verify-gate before each stage transition.
Args: {{args}}
"""
```

### Plugin 安装

```bash
agy plugin install --source .gemini/skills/srs-formalizer/
```

---

## 六、Windsurf — `.windsurfrules`

```markdown
# SRS Formalizer — Always-On Rule

## Trigger Keywords
SRS, 需求规格, 软件需求, 功能需求, §1., §2., 形式化, 知识图谱,
BDD, Gherkin, TLA+, Lean, Cypher, Neo4j

## When Detected
1. Load skill: srs-formalizer from .windsurf/skills/srs-formalizer/
2. Run S0 Discovery → report → confirm → S1→S6 pipeline
3. verify-gate at each stage boundary

## Tech Stack Lock
- TypeScript 5.5+ (strict mode)
- Node.js ≥ 20
- Zero external npm dependencies (only typescript + @types/node)
```

---

## 七、GitHub Copilot — Instructions

`.github/copilot-instructions.md`：

```markdown
## SRS Processing Rule

When a user provides or references an SRS document (files containing
"需求规格", "软件需求", "§1.", "功能需求", "SRS", etc.):

1. Load srs-formalizer skill
2. Start with S0 Discovery — confirm triggers with user
3. Execute S1→S6 pipeline with gate checks
4. Never skip stages or run out of order
```

---

## 八、Qoder — Rules 系统

Qoder 使用三级 Rules 系统（Project > Team > Global）。
在 `.qoder/rules/srs-formalizer.md` 创建项目级 Always Apply 规则：

```markdown
# SRS Formalizer — Always Apply

触发条件（任一满足即激活）：
- 用户上传/引用 .md 文件且含"需求规格"、"§1."、"功能需求"
- 用户消息含 SRS、形式化、知识图谱、BDD、TLA+、Lean、Cypher
- 文件名为 `*srs*.md` 或 `*需求*.md`

激活后执行：
1. 加载技能 `srs-formalizer`
2. S0 Discovery → S1→S6 流水线
3. 每阶段 verify-gate 门禁
```

---

## 九~十三、Trae / Kiro / OpenCode / Qwen Code / OpenClaw — AGENTS.md 统一方案

这 5 个平台均兼容 `AGENTS.md` 标准。在项目根目录创建：

```markdown
# AGENTS.md — SRS 处理规则

## srs-formalizer 激活

当检测到 SRS 文档特征时（含"需求规格"、"§"分节标记、"功能需求"等），
激活 srs-formalizer 技能，执行 S0→S6 流水线。

每个平台特定目录：
- Trae:    .trae/skills/srs-formalizer/
- Kiro:    .kiro/skills/srs-formalizer/
- OpenCode:.opencode/skills/srs-formalizer/
- QwenCode:.qwen/skills/srs-formalizer/
- OpenClaw:.openclaw/skills/srs-formalizer/
```

> **Claude Code 兼容**：`ln -s AGENTS.md CLAUDE.md`

---

## 十四、Hermes Agent — 自改进技能

Hermes 支持自动学习。部署后无需额外配置：

```bash
# 技能放这里即可，Hermes 递归加载
cp -r srs-formalizer ~/.hermes/skills/

# 首次使用后，Hermes 会根据执行效果自动优化 SKILL.md
# 无需手动维护激活规则
```

---

## 十五、DeerFlow 2.0 — iFlow CLI

```bash
# 安装
iflow skill install --source .claude/skills/srs-formalizer/

# 触发
iflow run --skill srs-formalizer "处理这份 SRS 文档"
```

---

## 十六、Aider — CONVENTIONS.md

```markdown
# CONVENTIONS.md
## SRS Processing
When user provides SRS document → activate srs-formalizer skill.
Run: aider --skill srs-formalizer
```

---

## 十七、抽象兜底参考（未列出平台的通用方案）

对于本文档未覆盖的编码智能体，按以下优先级尝试：

### 优先级 1：AGENTS.md（20+ 平台通用）

```markdown
# AGENTS.md
## SRS 处理
当用户提供 SRS 文档（特征：含"需求规格"、"§"分节、"功能需求"等），
激活 srs-formalizer 技能。S0 发现→S1→S6 流水线。阶段门禁强制。
```

### 优先级 2：项目根目录约定文件

按以下顺序检查目标平台支持的约定文件：
1. `AGENTS.md` — 最广泛支持
2. `CLAUDE.md` — Claude Code / Cursor / Windsurf
3. `CONVENTIONS.md` — Aider / 通用

### 优先级 3：Skills 目录探测

尝试以下路径部署技能，多数平台扫描其中至少一个：
- `.agents/skills/` — 跨工具约定（5+ 平台）
- `.claude/skills/` — Claude Code
- `skills/` — 通用回退

### 优先级 4：运行时注入

如果平台不支持任何约定文件，在用户 prompt 中显式注入：

```
[SYSTEM] 当检测到 SRS 文档时，使用 srs-formalizer 技能处理。
该技能位于 {path}/SKILL.md，包含 S0→S6 六阶段流水线。
```

### 优先级 5：MCP 服务器分发

通过 MCP 协议分发技能上下文：

```json
{
  "mcpServers": {
    "srs-formalizer": {
      "command": "node",
      "args": ["server.js"],
      "env": { "SKILL_PATH": "/path/to/srs-formalizer" }
    }
  }
}
```

---

## 十八、跨平台验证清单

- [ ] SKILL.md 的 `description` 字段包含 SRS/需求/规格/形式化 等高频关键词
- [ ] AGENTS.md 已创建（覆盖 20+ 平台）
- [ ] `ln -s AGENTS.md CLAUDE.md`（Claude Code 兼容）
- [ ] Claude Code: UserPromptSubmit hook 已配置
- [ ] Cursor: `.cursor/rules/srs-formalizer.mdc` 已配置
- [ ] Codex: `hooks.json` + srs-activate.py 已配置
- [ ] Antigravity: `.gemini/commands/srs-formalizer.toml` 已创建
- [ ] Windsurf: `.windsurfrules` 已加入 SRS 规则
- [ ] Qoder: `.qoder/rules/srs-formalizer.md` Always Apply
- [ ] 168 测试全部通过
