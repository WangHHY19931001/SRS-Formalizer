---
alwaysApply: true
---

# Agent Skill 安全与 HITL

> 本规则约束 `.trae/skills/` 下所有 SKILL.md 的安全约束与人工审批机制。

## Anti-Skill Injection 安全约束

### 四类强制反模式（编译期拦截）

下列四类操作在 Procedures 中出现时，AntiSkillInjector 强制注入安全约束；未声明对应 `permissions` 即判为 Critical 错误。

| 类别 | 触发示例 | 默认反模式数 | 强制约束 |
|------|----------|--------------|----------|
| **HTTP** | 无超时、无认证、明文传输 | http-timeout / http-auth / html-parse 等 | 必须声明 `permissions: network`，强制超时阈值 |
| **循环** | `while True`、无退出条件的递归 | 死循环检测 | 必须声明最大迭代次数 |
| **数据库** | 无事务的级联操作、SQL 拼接 | db-cascade / db-transaction / sql-injection | 必须声明 `permissions: db`，禁止字符串拼接 SQL |
| **解析** | 不安全的 HTML / JSON 解析 | html-parse（BeautifulSoup 无沙盒） | 必须声明解析器与超时 |

### 默认反模式库（11 个，编译期加载）

`AntiPatternLibrary` 默认包含：`http-timeout` / `http-auth` / `html-parse` / `db-cascade` / `db-transaction` / `sql-injection` / `file-delete` / `file-overwrite` / `git-force` / `git-history` / 死循环检测。

**扩展原则**：项目可扩展反模式库，但**禁止删除默认反模式**。新增反模式必须经过 PR review + 安全审计。

### toxic flows 三要素防御

一个 skill 被判定为 toxic flow 当且仅当同时满足三要素：

1. **访问私有数据**（读取 `.env` / 密钥 / 用户隐私 / 数据库敏感字段）
2. **不可信来源指令**（解析外部网页 / 用户粘贴内容 / MCP 外部响应）
3. **可外部通信**（HTTP 请求 / 写入共享路径 / 调用 webhook）

**防御规则**：三要素中只要阻断任一即解除 toxic 风险。设计 skill 时必须在 `metadata.toxic_flow_analysis` 显式标注三要素状态（见 structure.md frontmatter 模板）。三要素全为 true 的 skill 自动升级为 `security_level: critical`，禁止自动执行。

## 安全等级与 HITL 审批

### 四级安全等级

| 等级 | 审计行为 | HITL 要求 | 适用场景 |
|------|----------|-----------|----------|
| `low` | 仅基础格式校验 | 否 | 纯查询、只读操作、无副作用计算 |
| `medium` | 权限声明检查 | 否（默认） | 文件读写、受控网络访问、本地命令执行 |
| `high` | 强制 HITL + 高危词汇扫描 | **是** | 数据库 DDL、生产环境部署、批量删除 |
| `critical` | 禁止自动执行 | **是**（必须人工审批） | 不可逆操作、涉及凭证、toxic flow 三要素全满足 |

### HITL 触发条件（任一满足即触发）

1. `hitl_required: true` 显式声明
2. `security_level` 为 `high` 或 `critical`
3. Procedures 中出现高危关键词（见下节）
4. `permissions` 中包含 `db:*:ALTER` / `db:*:DROP` / `exec:shutdown` 等 Critical 级 scope
5. toxic flow 三要素全为 true

### 高危关键词严重度（统一四级输出）

**重要**：本节定义的四级严重度同时适用于：(a) 编译期 Anti-Skill 扫描结果；(b) Reviewer 模式 skill 的审查输出。两者必须使用同一套分级，禁止出现两套不一致的标准。

| 严重度 | 关键词示例（编译期扫描） | Reviewer 输出含义 | 缺权限时行为 |
|--------|--------------------------|-------------------|--------------|
| **Critical** | `rm -rf` / `format` / `DROP` / `TRUNCATE` / `GRANT` / `shutdown` / `reboot` | 阻断性缺陷，禁止发布 | 编译失败，禁止发布 |
| **Error** | `delete file` / `DELETE` / `ALTER` | 必须修复 | 编译失败，必须补声明权限 |
| **Warning** | `UPDATE` | 建议修改 | 编译告警，记录但放行 |
| **Info** | — | 仅供参考 | 不影响编译 |

**与 chinese-code-review skill 协同**：Reviewer 类 skill 的输出分级应与本节四级保持一致；若现有 skill 使用三级（Error/Warning/Info），改版时必须升级为四级以对齐编译期扫描。

## Fail-Fast 编译拦截纪律

下列情况必须 Fail-Fast，**禁止"先发布后修复"**：

1. `name` / `description` / `metadata.pattern` 字段缺失或格式不合规
2. `description` 包含 XML 标签（攻击面）
3. `metadata.pattern` 声明的模式与 SKILL.md 正文结构不匹配（如声明 `pipeline` 但无 gate condition）
4. `permissions` 声明与 Procedures 中实际操作不匹配
5. Critical 级高危关键词未声明对应权限
6. `pre_conditions` / `post_conditions` 在 `security_level ≥ high` 时缺失
7. toxic flow 三要素全为 true 但 `security_level` 未升至 `critical`
8. MCP 依赖声明但 `mcp_servers` 字段缺失
9. 嵌套深度 ≥ 3 但目标为 Gemini Backend 时未启用 YAML 优化
10. L2 正文超过 5000 token 上限且未下沉到 L3 资源

**与 project/rules.md 的协同**：项目规则要求"提交代码前必须通过 lint 和 typecheck"。skill 开发同等严格——提交 SKILL.md 前必须通过本规则全部 Fail-Fast 检查。