# 执行者-Backend：Gherkin 发射器

## 调用时机

1. **何时调用**：当 orchestrator 完成 Backend B1（Cypher 生成）并通过 `validate-cypher` 后
2. **不调用**：B1 未通过门禁时；IR 无 `requirement`/`nfr` 节点时；BDD 骨架未就位时
3. **上下游衔接**：上游=`srs-ir.json` + BDD 骨架（含 `<THEN_PLACEHOLDER>`） → 本执行者产出 `.feature` 文件 → 下游=`validate-bdd --strict --promote` + B3 TLA+ 生成

## 角色

> 专家人设见 [references/expert-persona-bdd.md](../references/expert-persona-bdd.md) 的「## 身份定位」段。

## 任务

为 BDD 骨架中的 `<THEN_PLACEHOLDER>` 填充具体的 Then 步骤和 verification_method。将行为描述转化为可执行的验收条件。

## 输入

1. **BDD 骨架文件**（.feature）：包含 Feature/Scenario/Given/When 定义，其中 Then 部分为 `<THEN_PLACEHOLDER>`
2. **对应 SRS-IR 节点**：与 Feature 相关的 IR-NODE（需求）和 IR-EDGE（关系）
3. **NFR 标注**：IR-NODE 中带 `nfr_category` 的节点，用于自动生成 NFR 场景

## 四级严格校验体系

所有 BDD 输出须通过四级校验（任一失败即打回 Frontend 重新提取）：

| 阶段 | 检查内容 | 工具/方法 |
|------|----------|-----------|
| **Phase 1** | TS 基础校验：占位符替换、字段完整性、格式合规 | TypeScript 脚本 |
| **Phase 2** | TS NFR 校验：NFR 场景覆盖率、场景原子性 | TypeScript 脚本 |
| **Phase 3** | gherkin-lint：Gherkin 语法正确性、命名规范 | gherkin-lint CLI |
| **Phase 4** | Gherklin：语义完整性、Example 覆盖率、边界值覆盖 | Gherklin CLI |

### 打回 Frontend 流程

若任一阶段失败：
1. 错误报告自动关联到对应的 IR-NODE id
2. 将 IR-NODE id 列表 + 校验错误返回 Frontend 阶段（Agent 按 executor-frontend-parse.md 重新分片提取）
3. Frontend 按 Mode B 逐行修正被标记的 IR-NODE
4. 修正完成后重新触发生成 → 重新进入四级校验

## 核心建模规范

### 格式铁律
- **严格禁止**使用 Markdown 表格、自然语言描述替代 Gherkin 模型
- 必须输出独立的 **Gherkin Feature 文件**（`.feature`）
- Feature 文件按**业务能力**组织，非技术结构

### Given-When-Then 原子化

| 步骤 | 要求 |
|------|------|
| **Given（前置状态）** | 完整枚举所有影响当前场景的系统状态变量及初始值，确保状态可重现 |
| **When（触发事件）** | 明确动作发起者（用户/外部系统）及具体交互指令，不可模糊 |
| **Then（预期结果）** | 细化到具体字段变化、界面反馈或下游接口调用。**严禁**"系统正常""处理成功"等模糊表述 |

### 场景设计原则
- **独立性**：每个场景可独立运行，不依赖其他场景的执行结果
- **原子性**：每个场景聚焦于**单一行为**的验证
- **声明式风格**：描述系统的**预期行为**（What），而非实现细节（How）
- **具体示例**：使用具体数据示例，非抽象描述

### NFR 场景自动生成指导

对于每个带 `nfr_category` 的 IR-NODE，自动生成对应的 NFR 验证场景：

| NFR 类别 | 典型场景 |
|----------|----------|
| `performance` | 并发用户数验证、响应时间阈值验证、吞吐量验证 |
| `security` | 认证失败锁定、权限越权拦截、数据脱敏验证 |
| `availability` | 故障恢复场景、数据持久化验证、重试机制验证 |
| `compatibility` | 跨浏览器渲染验证、跨平台行为一致、接口向后兼容 |
| `maintainability` | 日志完整性验证、健康检查端点验证 |
| `compliance` | 审计日志不可篡改验证、数据保留策略验证 |

每个 NFR 场景必须：
- 有明确的量化阈值（来自 IR-NODE statement 或标记 `<THRESHOLD>`）
- 与功能场景可独立运行
- 标注 `# verification_method` 和 `# nfr_category`

## 输出格式

1. 输出完整的 .feature 文件内容，所有 `<THEN_PLACEHOLDER>` 需被替换
2. 每条 Then 步骤后标注 `# verification_method: <方法>`
3. NFR 场景额外标注 `# nfr_category: <类别>`
4. 允许的 verification_method 值：`api_check` | `ui_check` | `db_check` | `log_check` | `output_check`
5. 当场景有多个 Then 步骤时，每个步骤必须独立标注

## Then 步骤语义化转换规则（强制，禁止复述需求原文）

> **根因**：Backend 曾以「模板填充代替语义推导」，`Then` 直接复述 IR-NODE 的 statement（如 `Then 系统必须使用确定性验证……`）。这类步骤语法合规但语义空洞，不可执行、不可转成测试。`validate-bdd --strict` 已加入复述检测（含指令性情态词 `必须/应当/shall/must` 且无否定的 Then 步骤将告警），下列规则强制落地。

将需求 statement 转化为**可观测行为断言**，禁止把 statement 原样抄进 `Then`：

| IR-NODE statement 形态 | 转换规则 | 示例 |
|------------------------|----------|------|
| 「必须 X」/「shall X」 | `Then <X 发生后可观测的结果/状态/输出>` | statement=「系统必须记录审计日志」→ `Then 审计日志新增一条含操作者、时间戳、动作的记录 # verification_method: log_check` |
| 「不得 Y」/「must not Y」/「禁止 Y」 | **额外生成**否定断言 `And the system does not <Y>` | statement=「未授权用户不得访问资源」→ `Then 请求返回 403 状态码` + `And 资源内容不出现在响应体中` |
| 数值/阈值约束 | 精确数值断言 | 「响应时间 < 200ms」→ `Then 响应时间 ≤ 200 ms # verification_method: api_check` |

### Then 铁律

1. 每个 `Then` 必须以**可观测的系统状态、字段变化、状态码或输出**结尾——严禁「系统应正常工作」「处理成功」类断言，也严禁把 statement 中的「必须/应当/shall/must」句原样复述。
2. 优先精确数值断言（「返回状态码 200」而非「返回成功」）。
3. IR-NODE 未定义阈值 → 用 `<THRESHOLD>` 标记待补，禁止自行编造。
4. 不得删除或修改已有 Given/When 步骤。
5. 同一 Feature 文件内所有 Scenario 必须覆盖完整。

## When 步骤绑定具体触发事件（禁止万能占位）

`When` 必须绑定**具体触发事件**，从 IR-NODE 的 `module` + `statement` 推导真实动作与发起者。

- ❌ 禁止 `When the system processes the requirement` / `When 系统处理需求` 类万能占位（`validate-bdd --strict` 直接判为 error）。
- ✅ 从 statement 提取动作动词与发起者：statement=「用户提交订单后系统扣减库存」→ `When 用户提交包含 3 件商品的订单`。
- 同一模块内不同 Scenario 的 `When` 必须体现行为差异，禁止 11 个模块共用同一 When 骨架。

## 否定约束场景（security/approval/governance/audit/compliance 强制）

对齐冻结资产核心价值：**边界约束往往比正向流程更关键**。凡 Feature 涉及 security / approval / governance / audit / compliance / 授权 领域，**必须**至少包含一条否定约束场景（`validate-bdd --strict` 缺失即 error）。

```gherkin
Scenario: 审批未决期间保持挂起 RID-BDD-GOV-APPROVAL-002
  Given an action is waiting on approval
  When no approval outcome has yet been provided
  Then execution remains held for that approval-controlled action
  And the system does not behave as though unresolved approval were implicit consent
```

否定断言可用 `不得/禁止/does not/must not/cannot/is denied/is rejected/is blocked/is held` 等表达。

## Feature 业务意图说明（追溯性）

每个 Feature 顶部补一段业务意图说明，声明该能力「为谁、解决什么、边界在哪」，提升可读性与追溯性（对齐冻结资产）：

```gherkin
Feature: 审批治理
  作为治理子系统，在高风险动作执行前强制人工审批，
  未获批准前一律挂起，防止把「未决」误当「默许」。
```

## 功能链 Feature（端到端行为验证）

除按子系统平铺外，从 IR 的 `traces_to` / `depends_on` 边推导**跨模块行为链**（如 input→intent→plan→dispatch），在 `outputs/bdd/draft/chains/` 下生成端到端场景，补足单模块视角缺失的端到端行为验证。

## 零容忍红线

以下任何一项出现即为不合格：
- `ERROR`（步骤未绑定/语法错误）
- `FAILED`（断言失败）
- `UNDEFINED`（未定义步骤）
- `UNTESTED`（未覆盖场景）
- 任何步骤缺失
- `TODO` 步骤或空实现
- 简化版断言（如仅检查 HTTP 200 而不验证响应体）

## 示例

### 输入骨架
```gherkin
Feature: 用户登录
  Scenario: 有效凭据登录
    Given 用户在登录页面
    When 用户输入有效用户名和密码并点击登录
    Then <THEN_PLACEHOLDER>
```

### 对应 IR-NODE
```jsonl
{"id":"IR-NODE-AUTH-0001","category":"explicit","statement":"3.1.1 用户使用注册邮箱和密码登录，成功后跳转至控制台页面","confidence":"high"}
```

### 输出
```gherkin
Feature: 用户登录
  Scenario: 有效凭据登录
    Given 用户在登录页面
    When 用户输入有效用户名和密码并点击登录
    Then 系统返回 200 状态码 # verification_method: api_check
    Then 用户跳转至控制台页面 # verification_method: ui_check
    Then 页面标题显示"控制台" # verification_method: ui_check

  Scenario: 连续失败锁定 # nfr_category: security
    Given 用户已连续 5 次输入错误密码
    When 用户第 6 次输入错误密码
    Then 账户被锁定 15 分钟 # verification_method: api_check # nfr_category: security
    Then 系统返回 423 状态码 # verification_method: api_check # nfr_category: security
```

## 数据流审视清单（若有）

编排者可能注入命中当前模块的**数据流审视提示**（来自 M1.5 `analyze-dataflow` 产出的 `3_graph/analysis/dataflow.json`，spec 2026-07-21）。

> ⚠️ **注入门控（shadow 模式上线前提）**：这些提示**默认不注入**——只有 `_ctx/dataflow_injection_gate.json` 的 `injectionEnabled: true`（经 `analyze-dataflow --assess` 评估实体归一假阳性率达标并人工签署）后，编排者才注入本清单。门控关闭时本节为空，正常继续，不受影响。

清单注入后是 warning 级提示，非硬门禁，但你**必须**按 `reviewActions` 转成具体场景：

| finding 类型 | BDD 必须做什么 |
|--------------|---------------|
| `gap`（数据被消费但无上游产生） | 显式覆盖"该数据缺失/为空"的边界场景；若来自外部系统则在 Given 声明为外部输入并标注信任边界 |
| `dead_data`（数据产生但无人消费） | 覆盖"该数据产生后是否真被使用"的场景；确认无消费者则在追溯中标记冗余候选 |
| `boundary`（外部输入/最终输出） | 入边界：安全相关场景补鉴权 Given；出边界：覆盖持久化/审计断言 |

注入清单按 `relatedNodes` 与当前 Feature 模块节点求交集过滤；清单为空表示当前模块无数据流提示，正常继续。

## 完整人设参考

专家人设见 [references/expert-persona-bdd.md](../references/expert-persona-bdd.md) 的「## 身份定位」段。`references/bdd-coding-guide.md` 提供 Gherkin 语法参考、声明式 vs 过程式的对比示例、Scenario Outline 数据驱动模式和常用 BDD 框架对照表，可按需加载。

## ❌ 视觉检查点（失败模式速查）

- ❌ 占位符 `<LLM_FILL_*>`/`<THEN_PLACEHOLDER>` 残留 → 未填充 Then 步骤 → 全部替换为具体断言
- ❌ 阈值数值化缺失 → 用模糊表述"快速响应" → 必须含具体数值或 `<THRESHOLD>` 标记
- ❌ Given/When/Then 顺序错乱 → 步骤缺失或重排 → 严格保持 Given → When → Then 顺序
- ❌ 模糊断言 → "系统正常"/"处理成功" → 细化到具体字段/状态码/界面反馈
- ❌ `TODO` 步骤或空实现 → 未完成场景 → 删除或补全，禁止 `TODO`
- ❌ NFR 场景缺 `verification_method` → 标注遗漏 → 每个 Then 步骤必须独立标注
- ❌ 简化版断言 → 仅检查 HTTP 200 不验证响应体 → 必须验证完整响应契约
- ❌ Then 复述需求原文 → 含「必须/应当/shall/must」且无否定的 statement 原样抄入 → 转为可观测行为断言（见「Then 步骤语义化转换规则」）
- ❌ 万能 When 占位 → `When the system processes the requirement` → 绑定 IR-NODE 推导的具体触发事件与发起者
- ❌ 约束域缺否定场景 → security/approval/governance/audit/compliance 无「系统不得……」场景 → 强制补至少 1 条否定约束场景
