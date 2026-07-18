# 联网事实确认指南

> **本文件是 SRS-Formalizer 联网事实确认的参考指南**，Agent 在 Backend B7 收敛循环、`SRS_PATCHES.md` 流程、Q4 技术原理验证等需要"联网搜索确认事实"的场景下依据此文档。
>
> 策略借鉴 [agent-search](https://github.com/Mousaee/agent-search) 项目的四层降级抓取与多引擎选择思路，适配本仓库的工具集与硬约束。**不引入 agent-search 仓库本身**（v0.1.0、1 commit、Shell 脚手架、需 Docker/MCP 重依赖，违反本仓库零运行时依赖与自包含哲学）。

---

## 1. 适用场景

| 场景 | 触发位置 | 用途 |
|------|----------|------|
| B7 收敛循环 ≥3 次未收敛 | `orchestrator_backend.md` 苏格拉底升级 | 为不可回答的 Q1-Q13 寻找事实依据 |
| `SRS_PATCHES.md` 事实依据 | TLA+/Lean 发现设计缺陷 | 验证标准/协议/论文是否存在 |
| Q4 技术原理验证 | `strict-modes.md` 13 问 | 论文 URL / 开源 URL / 技术原理 |
| S1 deep research | `SKILL.md` network scope | 领域知识检索（仅 Brave Search） |

---

## 2. 工具集（受 `permissions.network.scope` 约束）

`SKILL.md` 声明的 network scope 仅 `https://api.search.brave.com/*`。可用工具层级：

| 层 | 工具 | 用途 | 配置 | 是否默认可用 |
|:--:|------|------|------|:------------:|
| 搜索 | Brave Search API | 关键词搜索，返回结果列表 | SKILL.md 已声明 | ✅ |
| 抓取 L1 | `web_fetch`（Agent 内置） | 静态页面抓取为 Markdown | 零配置 | ✅ |
| 抓取 L2 | Jina Reader `https://r.jina.ai/<url>` | JS 渲染页面降级抓取 | 需用户显式放行 network scope | ⚠️ 可选 |
| 抓取 L3 | Browser 工具 | 登录态/复杂渲染 | 本仓库未集成 | ❌ |

> **硬约束**：不引入 agent-search 的上游工具（`yt-dlp` / `bird` / `gh` / `xiaohongshu-mcp` / `douyin-mcp` / `feedparser` 等）。SRS 形式化场景用不到社交媒体/视频/招聘平台，引入它们违反零运行时依赖与最小权限原则。

---

## 3. 四层降级抓取（借鉴 agent-search Smart Fetch）

```
Layer 1: web_fetch（最快，静态页面）
 ↓ 失败 / 内容过短（<500 字符）/ JS 渲染提示
Layer 2: Brave Search 变换关键词重搜（见 §4）
 ↓ 仍无高质量结果
Layer 3: Jina Reader（https://r.jina.ai/<原始URL>）——仅当 network scope 已放行
 ↓ 仍失败 / scope 未放行
Layer 4: 标记"事实依据不可得"，写入 SRS_PATCHES.md 事实依据段，🛑 STOP 等人类确认
```

**判定规则**：
- Layer 1 抓取内容 <500 字符或含典型 JS 渲染提示（`Please enable JavaScript` / `Loading...`）→ 降级
- Layer 2 重搜 ≤3 次仍无 `high` 置信度结果 → 降级
- Layer 3 仅在用户显式放行 `https://r.jina.ai/*` scope 后可用；未放行直接跳到 Layer 4
- **禁止跳过 Layer 1-3 直接写"事实依据不可得"**

---

## 4. 多查询策略（借鉴 agent-search Search Strategy）

不同类型问题用不同查询构造。单次结果不足时**变换关键词**（同义词 / 中英切换 / `site:` 限定），≤3 次：

| 查询类型 | 推荐查询构造 | 示例 |
|----------|-------------|------|
| 技术原理 / 论文 | `<概念> paper` / `<概念> specification` | `consensus protocol paper` |
| 开源项目 / 库 | `<名称> github` / `<名称> site:github.com` | `raft site:github.com` |
| 标准 / 协议 / RFC | `<标准号> specification` / `RFC <编号>` | `RFC 5280 specification` |
| 行业阈值 / NFR 基准 | `<指标> industry benchmark` / `<指标> 业界 标准` | `response time industry benchmark` |
| 中文技术 | `<关键词> 技术博客` / `<关键词> site:cnblogs.com` | `分布式锁 site:cnblogs.com` |
| 合规框架 | `<框架> requirements` / `<框架> checklist` | `GDPR requirements checklist` |

**关键词变换原则**：
- 同义词：`latency` ↔ `response time` ↔ `延迟` ↔ `响应时间`
- 中英切换：中文 SRS 用英文查论文，英文 SRS 用中文查业界实践
- `site:` 限定：`site:arxiv.org` / `site:ieee.org` / `site:github.com` / `site:cnblogs.com`

---

## 5. 产出记录规范（强制）

每次联网事实确认必须记录以下字段，否则视为未完成：

| 字段 | 说明 | 示例 |
|------|------|------|
| `query` | 查询关键词 | `raft consensus paper` |
| `url` | 命中 URL（≥1） | `https://raft.github.io/raft.pdf` |
| `fetched_at` | 抓取时间戳（ISO 8601） | `2026-07-17T03:21:00Z` |
| `excerpt` | 关键摘录（≤200 字符） | `Raft is a consensus algorithm...` |
| `confidence` | 置信度 | `high` / `medium` / `low` |
| `layer` | 实际命中的抓取层 | `L1` / `L2` / `L3` |

**写入位置**：

| 场景 | 写入文件 | 格式 |
|------|---------|------|
| B7 收敛循环 | `outputs/reports/convergence-log.jsonl` | 每行一条 JSON，含上述字段 |
| `SRS_PATCHES.md` | `.srs_formalizer/SRS_PATCHES.md` 事实依据段 | Markdown 引用 + URL |
| Q4 技术原理 | `outputs/reports/cross-graph-report.json` Q4 字段 | JSON 对象，含 `paperUrl` / `openSourceUrl` |

---

## 6. 红灯（Agent 自检）

| 红灯 | 拦截机制 |
|------|---------|
| 编造 URL / 摘录 | Agent 自检 + 人类确认环节兜底 |
| 用内容农场 / 无来源博客作为"事实依据" | 置信度强制标 `low`，不得作为 SRS_PATCHES 唯一依据 |
| 跳过降级流程直接写"事实依据不可得" | 必须先尝试 Layer 1-3 并记录失败原因 |
| 引入 agent-search 上游工具（yt-dlp / bird / Docker MCP 等） | 违反零运行时依赖，硬约束拦截 |
| 联网搜索结果未记录 URL / 时间戳 | `orchestrator_backend.md` 约束第 10 条 |

---

## 7. 与硬约束的关系

| 硬约束 | 本指南如何遵守 |
|--------|---------------|
| 零运行时 npm 依赖 | 不引入任何 npm 包；agent-search 仓库不入依赖 |
| 脚本不依赖外部 API（v2.0.0） | 联网搜索由 **Agent** 执行，脚本仍只做门禁校验 |
| network scope 最小权限 | 默认仅 Brave Search；Jina Reader 需用户显式放行 |
| 技能完整性 SHA-256 校验 | 本指南作为 reference 纳入 MANIFEST.json（由 `pack-skill` 重建） |
| 自包含哲学 | 仅 vendored `tla2tools-1.7.4.jar`；不新增 vendored 二进制 |

---

## 8. 降级流程示例

**场景**：B7 收敛循环验证 Q4"它为什么可以这样？"——需确认 SRS 中提到的"Raft 共识算法"的论文依据。

```
1. Brave Search: "raft consensus paper"
   → 命中 https://raft.github.io/raft.pdf
2. web_fetch 抓取 https://raft.github.io/raft.pdf
   → 内容为 PDF 二进制，web_fetch 返回过短
   → 降级到 Layer 2
3. Brave Search 变换: "raft consensus algorithm site:arxiv.org"
   → 命中 https://arxiv.org/abs/1409.4265
4. web_fetch 抓取 https://arxiv.org/abs/1409.4265
   → 成功，摘录 "Raft is a consensus algorithm for managing a replicated log..."
   → confidence=high, layer=L1
5. 写入 cross-graph-report.json Q4 字段:
   { paperUrl: "https://arxiv.org/abs/1409.4265",
     openSourceUrl: "https://raft.github.io/",
     excerpt: "Raft is a consensus algorithm...",
     fetched_at: "2026-07-17T03:21:00Z",
     confidence: "high", layer: "L1" }
```

> **注意**：本指南不替代 `orchestrator_backend.md` 的收敛循环流程，仅为其联网搜索环节提供可重复执行的标准动作。
