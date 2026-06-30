# Agent Integration Guide

## 适用场景

当编码智能体执行 `/init` 或项目初始化操作时，应加载本文档以了解如何将 srs-formalizer 技能集成到 hook 系统和规则系统中。

## 技能触发方式

### 方式 1：描述匹配（自动触发）

SKILL.md 的 `description` 字段包含触发关键词。当用户消息包含以下任意模式时，技能自动加载：

- "SRS" + "形式化" / "知识图谱" / "BDD" / "TLA+" / "Lean"
- 上传 .md / .html 文件 + 要求"生成需求文档"
- 提到"需求规格说明" + "提取" / "建模"

### 方式 2：Hook 注册（推荐，确保触发）

在项目 `.claude/settings.json` 或用户级 `~/.claude/settings.json` 中注册 hook：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "targets": ["*.md", "*.html"],
        "hook": {
          "type": "command",
          "command": "if grep -q '需求规格\|软件需求\|SRS\|Functional Requirements' \"${CLAUDE_PLUGIN_FILE}\"; then echo 'SRS detected. Consider running srs-formalizer.'; fi"
        }
      }
    ]
  }
}
```

### 方式 3：规则注入（项目级自动生效）

在项目 `CLAUDE.md` 中添加：

```markdown
## SRS 处理规则

当用户提供或创建 SRS 文档（.md/.html 格式，含"需求规格说明"、"功能需求"、"§"分节标记等特征）时：

1. 立即触发 superpowers:srs-formalizer 技能
2. 先运行 S0 Discovery（确认输入和触发条件）
3. 再按 S1→S6 流水线执行
4. 每阶段产物通过硬门禁后才进入下一阶段
```

## 工作目录约定

技能在工作目录 `.srs_formalizer/` 下运行。初始化命令：

```bash
npx tsx .claude/skills/srs-formalizer/scripts/index.ts init --output /path/to/project/.srs_formalizer
```

**路径安全**：所有脚本操作限定在 `.srs_formalizer/` 内，仅以下操作允许访问外部：
- 读取原始 SRS 文件（`--src` 参数指定的路径）
- 读取技能包内的模板和提示词
- 用户确认后的 SRS 回写

## 工具链依赖

| 工具 | 必需 | 检查命令 |
|------|------|---------|
| Node.js ≥20 | ✅ 是 | `node --version` |
| Java (TLC) | ❌ 仅 S5 TLA+ | `java -version` |
| Lean 4 (elan+lake) | ❌ 仅 S5 Lean | `lake --version` |

缺失工具链时，技能会输出安装指引到 `.srs_formalizer/ERRORS.md`，对应阶段标记为不可用。

## 集成检查清单

- [ ] 技能目录位于 `.claude/skills/srs-formalizer/` 或用户级 skills 目录
- [ ] SKILL.md 的 `description` 包含项目常见 SRS 关键词
- [ ] CLAUDE.md 中加入 SRS 处理规则
- [ ] 首次使用时运行 `npm install` 安装 typescript + @types/node
- [ ] 运行 `npm test` 确认 168 测试通过
- [ ] （可选）注册 PostToolUse hook 自动检测 SRS 文件

## 常见集成问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 技能未被触发 | description 关键词不匹配 | 在 CLAUDE.md 添加显式规则触发 |
| `init` 拒绝非 `.srs_formalizer` 路径 | 安全校验 | 确保 `--output` 以 `.srs_formalizer` 结尾 |
| TLA+/Lean 阶段跳过 | 工具链缺失 | 安装对应工具或确认跳过是正确的 |
| validate-jsonl REJECTED | LLM 输出不符合模板 | 检查 executor prompt 的填空模板是否被遵守 |
