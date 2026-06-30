# 编码智能体自动适配自配置

## 何时加载

编码智能体在执行 `/init`、项目初始化、或首次部署本技能时，应读取本文档以自动完成平台检测和激活机制配置。

## Step 1：平台检测

按以下优先级检测当前环境中的编码智能体平台：

| 检测方法 | 判定为 |
|---------|--------|
| 环境变量 `CLAUDE_CODE_SESSION_ID` 存在 | **Claude Code** |
| `~/.cursor/` 目录存在，或当前 IDE 为 Cursor | **Cursor** |
| `~/.codex/` 目录存在，或环境变量 `CODEX_SESSION` 存在 | **Codex CLI** |
| `~/.gemini/antigravity-cli/` 目录存在，或 `agy` 命令可用 | **Antigravity** |
| `~/.codeium/windsurf/` 目录存在 | **Windsurf** |
| `~/.qoder/` 目录存在，或 `lingma` 命令可用 | **Qoder** |
| `~/.trae/` 目录存在 | **Trae** |
| `~/.kiro/` 目录存在 | **Kiro** |
| `~/.config/opencode/` 目录存在 | **OpenCode** |
| `~/.qwen/` 目录存在 | **Qwen Code** |
| `~/.openclaw/` 目录存在 | **OpenClaw** |
| `~/.hermes/` 目录存在 | **Hermes Agent** |
| `~/.iflow/` 目录存在，或 `iflow` 命令可用 | **DeerFlow 2.0** |
| `~/.aider.conf.yml` 存在，或 `aider` 命令可用 | **Aider** |
| `.github/copilot-instructions.md` 已存在 | **GitHub Copilot** |
| `$TERM_PROGRAM` 或 `$VSCODE_CWD` 等 IDE 环境变量 | 从 IDE 推断平台 |

> 如果无法确定平台，跳至 **Step 5 抽象兜底**。

## Step 2：根据检测结果执行对应配置

### Claude Code

```bash
mkdir -p .claude/hooks

cat > .claude/hooks/srs-eval.js << 'HOOKEOF'
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
  return {
    activate: true,
    skill: 'srs-formalizer',
    reason: `SRS keywords: ${matched.slice(0, 3).join(', ')}`,
  };
}
HOOKEOF

# 写入 settings.json（合并现有配置）
node -e "
const fs=require('fs');
const cfg=fs.existsSync('.claude/settings.json')?JSON.parse(fs.readFileSync('.claude/settings.json','utf8')):{};
cfg.hooks=cfg.hooks||{};
cfg.hooks.UserPromptSubmit=[{hook:'hooks/srs-eval.js'}];
fs.writeFileSync('.claude/settings.json',JSON.stringify(cfg,null,2));
"
echo "✅ Claude Code: UserPromptSubmit hook configured"
```

### Cursor

```bash
mkdir -p .cursor/rules

cat > .cursor/rules/srs-formalizer.mdc << 'MDCEOF'
---
description: "SRS formalization — requirement extraction, knowledge graph, BDD, TLA+, Lean 4"
globs: ["**/*srs*.md", "**/*需求*.md", "**/*规格*.md", "**/*SRS*.md"]
alwaysApply: false
---
# SRS Formalizer Activation
When user provides or references an SRS document:
1. Load skill srs-formalizer from .cursor/skills/srs-formalizer/
2. Run S0 Discovery → report → confirm
3. Execute S1→S6 pipeline with verify-gate at each stage
4. Never skip stages or run out of order
MDCEOF

echo "✅ Cursor: .mdc rule configured with glob patterns"
```

### Codex CLI

```bash
mkdir -p .codex/hooks

cat > .codex/hooks/srs-activate.py << 'PYEOF'
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
PYEOF

# 写入 hooks.json
node -e "
const fs=require('fs');
const cfg=fs.existsSync('hooks.json')?JSON.parse(fs.readFileSync('hooks.json','utf8')):{hooks:{}};
cfg.hooks.UserPromptSubmit=[{hooks:[{type:'command',command:'python3 .codex/hooks/srs-activate.py'}]}];
fs.writeFileSync('hooks.json',JSON.stringify(cfg,null,2));
"
echo "✅ Codex CLI: hooks.json + Python activation configured"
```

### Antigravity

```bash
mkdir -p .gemini/commands

cat > .gemini/commands/srs-formalizer.toml << 'TOMLEOF'
description = "SRS formalization pipeline: preprocess→extract→graph→BDD→formal→gate"
prompt = """
Load skill srs-formalizer. Execute full S0→S6 pipeline.
Run verify-gate before each stage transition.
Args: {{args}}
"""
TOMLEOF

echo "✅ Antigravity: TOML command /srs-formalizer configured"
```

### Windsurf

```bash
cat >> .windsurfrules << 'WSEOF'

## SRS Formalizer
When SRS document detected (关键词: SRS, 需求规格, 软件需求, 功能需求,
§1., Gherkin, TLA+, Lean, Cypher, 形式化):
1. Load skill from .windsurf/skills/srs-formalizer/
2. S0 Discovery → confirm → S1→S6 pipeline
WSEOF

echo "✅ Windsurf: .windsurfrules updated"
```

### Qoder

```bash
mkdir -p .qoder/rules

cat > .qoder/rules/srs-formalizer.md << 'QEOF'
# SRS Formalizer — Always Apply

触发：用户上传/引用 .md 文件含"需求规格"、"§1."、"功能需求"。
激活后加载 srs-formalizer 技能，执行 S0→S6 流水线。
QEOF

echo "✅ Qoder: Always Apply rule configured"
```

### Hermes Agent

```bash
# Hermes 自改进——部署技能即可，首次使用后自动优化
echo "✅ Hermes Agent: 技能已部署到 ~/.hermes/skills/，将自改进"
```

## Step 3：部署技能到当前平台目录

```bash
SKILL_SRC=".claude/skills/srs-formalizer"
# 根据检测到的平台设置 TARGET
case "$DETECTED_PLATFORM" in
  claude-code) TARGET=".claude/skills/srs-formalizer" ;;
  cursor)      TARGET=".cursor/skills/srs-formalizer" ;;
  codex)       TARGET=".agents/skills/srs-formalizer" ;;
  antigravity) TARGET=".gemini/skills/srs-formalizer" ;;
  windsurf)    TARGET=".windsurf/skills/srs-formalizer" ;;
  qoder)       TARGET=".qoder/skills/srs-formalizer" ;;
  *)           TARGET=".agents/skills/srs-formalizer" ;;  # 跨平台回退
esac

rm -rf "$TARGET" && cp -r "$SKILL_SRC" "$TARGET"
echo "✅ Skill deployed to $TARGET"
```

## Step 4：创建/更新 AGENTS.md（跨平台兜底）

```bash
if ! grep -q "srs-formalizer" AGENTS.md 2>/dev/null; then
  cat >> AGENTS.md << 'AGENTSEOF'

## SRS Processing Rule (srs-formalizer)
When user provides/creates an SRS document (特征: "需求规格", "§"分节,
"功能需求", "软件需求"):
1. Activate srs-formalizer skill
2. Run S0 Discovery — scan, detect triggers, report, confirm
3. Execute S1→S6 pipeline, verify-gate at each stage
AGENTSEOF
  echo "✅ AGENTS.md updated with SRS rule"
fi

# Claude Code 兼容
[ ! -f CLAUDE.md ] && ln -s AGENTS.md CLAUDE.md 2>/dev/null
```

## Step 5：抽象兜底（无法确定平台时）

如果 Step 1 无法确定平台，按优先级依次尝试：

| 优先级 | 方案 | 操作 |
|--------|------|------|
| P1 | **AGENTS.md** | 在项目根目录创建/更新 AGENTS.md，写入 SRS 处理规则。20+ 平台兼容。 |
| P2 | **Skills 目录部署** | 将技能复制到 `.agents/skills/srs-formalizer/`——最广泛支持的路径 |
| P3 | **CLAUDE.md 符号链接** | `ln -s AGENTS.md CLAUDE.md` |
| P4 | **启动提示注入** | 在会话开始时口头告知智能体："本项目使用 srs-formalizer 技能处理 SRS 文档" |
| P5 | **MCP 分发** | 通过 MCP 服务器暴露技能上下文 |

## Step 6：验证配置生效

```bash
echo "=== Self-check ==="
echo "Platform: ${DETECTED_PLATFORM:-unknown}"
echo "Skill deployed: $([ -f \"$TARGET/SKILL.md\" ] && echo 'YES' || echo 'NO')"
echo "Activation configured: $([ -f \"$ACTIVATION_FILE\" ] && echo 'YES' || echo 'NO')"
echo "AGENTS.md: $([ -f AGENTS.md ] && echo 'YES' || echo 'NO')"
echo ""
echo "To verify full skill health:"
echo "  cd $TARGET/scripts && npm test"
```

## 配置后验证清单

- [ ] 平台已正确检测
- [ ] 技能已部署到平台特定目录
- [ ] 激活机制已配置（hook/rule/command 至少一项）
- [ ] AGENTS.md 已包含 SRS 处理规则
- [ ] `npm test` 168 测试全部通过
- [ ] 向智能体发送含"需求规格"的消息，确认技能被激活
