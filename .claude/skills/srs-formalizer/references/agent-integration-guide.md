# Agent Integration Guide

## 适用场景

当编码智能体执行 Bootstrap 或项目初始化时加载本文档，获取将 srs-formalizer 技能集成到各平台 hook/规则系统的指令。

---

## 一、技能目录部署（15 个平台）

基于 **agentskills.io** 开放标准（2025-12 V1.0），SKILL.md 格式全平台通用。仅需将技能目录复制/链接到各平台的技能路径。

| 平台 | 项目级路径 | 全局级路径 | 触发机制 |
|------|-----------|-----------|---------|
| **Claude Code** | `.claude/skills/srs-formalizer/` | `~/.claude/skills/srs-formalizer/` | description 匹配 + `/srs-formalizer` 显式调用 |
| **Cursor** | `.cursor/skills/srs-formalizer/` | `~/.cursor/skills/srs-formalizer/` | description 匹配 |
| **Codex CLI** | `.agents/skills/srs-formalizer/` | `~/.agents/skills/srs-formalizer/` | description 匹配 |
| **Gemini CLI** | `.gemini/skills/srs-formalizer/` | `~/.gemini/skills/srs-formalizer/` | description 匹配 |
| **Windsurf** | `.windsurf/skills/srs-formalizer/` | `~/.codeium/windsurf/skills/srs-formalizer/` | description 匹配 |
| **GitHub Copilot** | `.github/skills/srs-formalizer/` | `~/.copilot/skills/srs-formalizer/` | description 匹配 |
| **Antigravity** | `.agy/skills/srs-formalizer/` | `~/.gemini/antigravity/skills/srs-formalizer/` | `agy plugin install` |
| **Qoder (通义灵码)** | `.qoder/skills/srs-formalizer/` | `~/.qoder/skills/srs-formalizer/` | Rules 系统 + Skill API |
| **Trae / Trae CN** | `.trae/skills/srs-formalizer/` | `~/.trae/skills/srs-formalizer/` | description 匹配 |
| **Kiro** | `.kiro/skills/srs-formalizer/` | `~/.kiro/skills/srs-formalizer/` | description 匹配 |
| **OpenCode** | `.opencode/skills/srs-formalizer/` | `~/.config/opencode/skills/srs-formalizer/` | description 匹配 |
| **Qwen Code** | `.qwen/skills/srs-formalizer/` | `~/.qwen/skills/srs-formalizer/` | description 匹配 |
| **OpenClaw** | `.openclaw/skills/srs-formalizer/` | `~/.openclaw/skills/srs-formalizer/` | description 匹配 |
| **Hermes Agent** | `.hermes/skills/srs-formalizer/` | `~/.hermes/skills/srs-formalizer/` | 递归加载 + 自改进 |
| **DeerFlow 2.0** | `.iflow/skills/srs-formalizer/` | `~/.iflow/skills/srs-formalizer/` | iFlow CLI 管理 |

> **便捷方案**：`.agents/skills/` 是跨工具约定——Cursor、Copilot、Gemini、Codex、Windsurf 均扫描此目录。仅 Claude Code 需单独部署到 `.claude/skills/`。

---

## 二、一键部署脚本

```bash
#!/bin/bash
# install-srs-formalizer.sh — 部署到当前项目所有检测到的平台
SKILL_SRC="$(cd "$(dirname "$0")" && pwd)"
SKILL_NAME="srs-formalizer"

# 项目级部署
for dir in .claude .cursor .agents .gemini .windsurf .github .agy .qoder .trae .kiro .opencode .qwen .openclaw .hermes .iflow; do
  target="$dir/skills/$SKILL_NAME"
  if [ -d "$dir" ] || mkdir -p "$(dirname "$target")" 2>/dev/null; then
    rm -rf "$target"
    cp -r "$SKILL_SRC" "$target" 2>/dev/null && echo "✅ $target" || true
  fi
done
```

---

## 三、规则/AGENTS.md 注入

在项目的 `AGENTS.md` 或 `CLAUDE.md` 中添加以下规则，确保智能体遇到 SRS 文档时自动触发技能：

```markdown
## SRS 处理规则（srs-formalizer）

当用户提供或创建 SRS 文档（.md/.html 格式，含"需求规格说明"、"功能需求"、
"§"分节标记、"软件需求"、"系统需求"等特征）时：

1. 立即加载 srs-formalizer 技能
2. 先运行 Frontend F1 阶段 — 扫描 SRS 结构、检测 TLA+/Lean 触发条件、报告用户
3. 用户确认后按 F1-F5 → M1-M6 → B1-B7 流水线执行
4. 每阶段产物通过 verify-gate 后才进入下一阶段
5. 若工具链缺失（Java/Lean 4），对应阶段标记不可用，不阻塞主线
```

---

## 四、各平台特殊配置

### Claude Code — Hook 注册

```json
// .claude/settings.json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "targets": ["*.md"],
      "hook": {
        "type": "command",
        "command": "grep -q '需求规格\|§[0-9]' \"${CLAUDE_PLUGIN_FILE}\" && echo '⚠️ SRS detected. Run: /srs-formalizer' || true"
      }
    }]
  }
}
```

### Qoder — Rules 三级系统

Qoder 使用 Rules 而非 skills 目录。通过 API 上传技能 zip：

```bash
# 上传技能
curl -X POST "https://lingma.aliyun.com/api/v1/cloud/skills" \
  -H "Authorization: Bearer <token>" \
  -F "file=@srs-formalizer.zip"

# 绑定到 Agent
curl -X PUT "https://lingma.aliyun.com/api/v1/cloud/agents/<agent_id>" \
  -H "Content-Type: application/json" \
  -d '{"skills": ["srs-formalizer"]}'
```

Qoder Rules 三级优先级：**Project > Team > Global**。建议在项目级 `.qoder/rules/srs.md` 添加触发规则。

### Antigravity — Plugin 安装

```bash
agy plugin install --source .claude/skills/srs-formalizer/
```

### Hermes Agent — 自改进特性

Hermes 支持从任务执行中自动创建/改进 SKILL.md。部署后无需额外配置——智能体首次使用 srs-formalizer 后会根据实际效果自动优化提示词。

---

## 五、跨平台技能管理工具

### swarmskills（支持 ~45 平台）

```bash
npm install -g swarmskills
swarmskills tools list --detected         # 检测所有已安装平台
swarmskills sync srs-formalizer --to all  # 同步到全部平台
swarmskills mcp                           # 启动 MCP 服务器
```

### skill-flow（工作流编排）

```bash
npm install -g skill-flow
skill-flow add source --type local --path .claude/skills/srs-formalizer
skill-flow deploy --targets claude-code,cursor,trae,kiro,qoder
skill-flow doctor  # 诊断部署状态
```

---

## 六、工具链依赖检查

| 工具 | 必需 | 检查命令 | 缺失处理 |
|------|------|---------|---------|
| Node.js ≥20 | ✅ | `node --version` | 安装指引 → ERRORS.md |
| TypeScript 5.5+ | ✅ | `npx tsc --version` | `npm install` |
| Java (TLC) | B3 | `java -version` | 标记 TLA+ 不可用 |
| Lean 4 (lake) | B4 | `lake --version` | 标记 Lean 4 不可用 |

---

## 七、集成检查清单

- [ ] 技能目录已部署到目标平台的 skills 路径
- [ ] AGENTS.md / CLAUDE.md 中已加入 SRS 触发规则
- [ ] `npm install` 已执行（仅 typescript + @types/node）
- [ ] `npm test` 200 测试全通过
- [ ] （可选）Claude Code hook 已注册
- [ ] （可选）Qoder API 已上传技能 zip
- [ ] （可选）swarmskills / skill-flow 已配置跨平台同步

## 八、常见问题

| 问题 | 平台 | 解决 |
|------|------|------|
| 技能未被触发 | 全部 | 检查 AGENTS.md 规则是否包含 SRS 关键词 |
| `init` 已归档 | 全部 | Bootstrap 无脚本，Agent 手动创建工作目录（幂等保留已有文件） |
| TLA+/Lean 跳过 | 全部 | 安装对应工具链或确认跳过正确 |
| validate-jsonl REJECTED | 全部 | LLM 输出偏离填空模板——检查 executor prompt |
| Claude Code 不扫描 `.agents/` | Claude Code | 需单独部署到 `.claude/skills/` |
| Qoder 不识别 SKILL.md | Qoder | 使用 API 上传 zip 或配置 Rules |
