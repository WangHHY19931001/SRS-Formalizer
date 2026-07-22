# BDD 编码参考指南

编写 BDD（行为驱动开发）用例，核心是**使用统一、清晰的自然语言，将业务需求转化为可执行的规范**，以此在团队中建立共识。

## 核心概念：Gherkin 语法

BDD 用例使用 Gherkin 语言编写，采用 `Given-When-Then` 结构，让非技术人员也能轻松理解。

### 主要关键词（Primary Keywords）

这些关键词构建 `.feature` 文件的骨架结构。

| 关键词 | 别名 | 用途与说明 |
|:---|:---|:---|
| **`Feature`** | — | **文件顶级关键词**，描述一个软件功能。每个 `.feature` 文件只能有一个，后跟业务意图说明（为谁、解决什么、边界在哪）。 |
| **`Rule`** | — | **可选关键词**（Gherkin v6+），代表一条业务规则，用于在 Feature 内组织相关场景。适合将同一功能下的多条规则分组。 |
| **`Example`** | `Scenario` | **具体的测试用例**，描述一个业务规则下的一个具体例子。两个别名完全等价，`Scenario` 更常用。 |
| **`Background`** | — | 定义在当前 Feature（或 Rule）中，**每个场景运行前都会执行**的公共前置步骤，用于消除重复的 Given。每个文件最多一个。 |
| **`Scenario Outline`** | `Scenario Template` | **场景大纲/模板**，当同一场景需要用多组不同数据执行时使用。必须配合 `Examples` 表格。 |
| **`Examples`** | `Scenarios` | 必须紧跟在 `Scenario Outline` 后，**以表格形式**提供多组测试数据，每行驱动一次场景执行。 |

### 步骤关键词（Step Keywords）

这些关键词定义具体的操作步骤，是 Gherkin 最核心的部分。

| 关键词 | 用途与说明 | 示例 |
|:---|:---|:---|
| **`Given`** | **描述前置条件**：场景开始前的系统状态，必须完整枚举所有影响当前场景的状态变量及初始值，确保状态可重现。 | `Given 用户已完成实名认证` |
| **`When`** | **描述触发事件**：用户或外部系统执行的具体动作，必须明确动作发起者，**每个场景应只有一个 When**。 | `When 用户提交包含 3 件商品的订单` |
| **`Then`** | **描述预期结果**：必须细化到具体字段变化、状态码、界面反馈或下游接口调用。**严禁**"系统正常""处理成功"等模糊表述。 | `Then 系统返回 201 状态码且订单 ID 非空` |
| **`And`** | **连接词（正向）**：连接多个同类型步骤（如多个 Given 或多个 Then），使语句更通顺。其语义与它所连接的步骤类型一致。 | `And 库存数量减少 3` |
| **`But`** | **连接词（否定/对比）**：`And` 的否定形式，用于连接否定或对比性质的步骤，语义与它所连接的步骤类型一致。 | `But 购物车不清空` |
| **`*`（星号）** | **通配符**：可替代上述任意步骤关键词（Given/When/Then/And/But），适合列举性步骤，避免语义歧义。 | `* 系统记录操作日志` |

> `And` 和 `But` 不是独立的步骤类型，它们继承所连接步骤的语义。例如，跟在 `Given` 后的 `And` 等价于另一个 `Given`。

### 次要关键词（Secondary Keywords）

这些关键词为步骤提供额外的数据或元信息。

| 关键词 | 用途与说明 |
|:---|:---|
| **`"""`（文档字符串 Doc String）** | 传递**多行文本**作为步骤参数，常用于传入 JSON、XML、SQL 或长文本内容。三引号独占一行，内容保持原始缩进。 |
| **`\|`（数据表 Data Table）** | 在单个步骤后传递**结构化表格数据**作为参数，与 `Examples` 不同——Data Table 是单个步骤的参数，不驱动场景重复执行。 |
| **`@`（标签 Tag）** | 给 Feature、Rule、Scenario 等打标记，用于测试执行时的**筛选和分组**（如 `@smoke`、`@nfr`、`@security`）。 |
| **`#`（注释 Comment）** | 在 `.feature` 文件中添加**注释**，帮助团队成员理解意图。`#` 必须是行首第一个非空白字符。 |

### 本地化（Localization）

Gherkin 支持多种自然语言，包括中文。使用非英语语言时，在文件开头声明：

```gherkin
# language: zh-CN
功能: 用户登录
  场景: 使用有效凭证登录
    假如 用户已注册
    当 用户输入正确的用户名和密码
    那么 用户跳转至控制台页面
```

常用中文关键词对照：`功能` = Feature，`场景` = Scenario，`假如`/`给定` = Given，`当` = When，`那么` = Then，`而且`/`并且` = And，`但是` = But。

## 编写最佳实践

### 1. 描述行为，而非实现 (Describe Behavior, Not Implementation)

场景应聚焦于**"做什么（What）"**，而不是**"怎么做（How）"**。避免在场景中描述具体的 UI 操作细节（如点击哪个按钮、在哪个输入框填值）。

**不佳示例（过程式）**：
```gherkin
Given 我访问 "/login" 页面
When 我在 "用户名" 字段输入 "Bob"
And 我在 "密码" 字段输入 "tester"
And 我点击 "登录" 按钮
Then 我应该看到 "欢迎" 页面
```

**更佳示例（声明式）**：
```gherkin
Given Bob 是已注册用户
When Bob 使用有效凭证登录
Then 他应该看到欢迎页面
```

声明式风格更专注于业务价值。当 UI 变更时，场景本身无需改动，只需修改底层的步骤定义（Step Definitions）。

### 2. 坚持"三部分"结构：羊头、蜂腰、蝎尾

| 部分 | 关键字 | 原则 |
|------|--------|------|
| **羊头** | Given | 负责设置场景（初始化数据、模拟依赖）。**保持精简**——过长的 Given 通常是代码设计问题的信号。 |
| **蜂腰** | When | **应该只有一行**，即触发被测操作的核心动作。清晰地划定了"准备"与"验证"的界限。 |
| **蝎尾** | Then | **是测试的精华所在**，负责结果验证。一个没有 Then 的用例毫无价值。 |

### 3. 保持场景的单一职责

**一个场景只测试一个业务规则**。如果一个场景中包含多个 `When-Then` 对，说明它可能正在测试多个功能，应将其拆分为独立的场景。

### 4. 团队协作，共同编写

BDD 的威力在于**协作**。场景应由业务人员、测试人员和开发人员共同讨论和编写，以确保大家对需求的理解一致。

## 完整示例（覆盖全部关键词）

**文件名：`订单结算.feature`**

```gherkin
@checkout @smoke
Feature: 订单结算
  作为电商平台的注册用户，
  我希望能够结算购物车中的商品，
  以便完成购买并获得订单确认。

  Background:
    Given 用户已登录且账户状态正常
    And 平台支付网关服务可用

  Rule: 购物车非空时才允许结算

    @happy-path
    Scenario: 购物车有商品时正常结算
      Given 购物车中有以下商品
        | 商品名称 | 数量 | 单价（元） |
        | 无线耳机 | 1    | 299        |
        | 充电线   | 2    | 39         |
      When 用户点击"立即结算"
      Then 系统返回 200 状态码
      And 订单总金额为 377 元
      But 购物车商品不自动清空（待支付确认后清空）

    @edge-case
    Scenario: 购物车为空时禁止结算
      Given 购物车中没有任何商品
      When 用户点击"立即结算"
      Then 系统返回 400 状态码
      And 响应体包含错误码 "CART_EMPTY"

  Rule: 支付凭证必须完整

    @security
    Scenario: 提交无效支付令牌时拒绝结算
      Given 用户持有已过期的支付令牌
      When 用户提交结算请求
      Then 系统返回 401 状态码
      And 响应体包含错误码 "TOKEN_EXPIRED"
      But 订单记录不写入数据库

    @data-driven
    Scenario Outline: 多种支付方式均可完成结算
      Given 购物车中有 1 件价值 <金额> 元的商品
      When 用户选择 <支付方式> 完成支付
      Then 系统返回 201 状态码
      And 订单状态为 "<订单状态>"

      Examples:
        | 支付方式   | 金额 | 订单状态 |
        | 支付宝     | 100  | PAID     |
        | 微信支付   | 200  | PAID     |
        | 银行卡     | 50   | PAID     |

  Rule: 系统须记录完整的操作审计日志

    @audit
    Scenario: 结算成功后写入审计日志
      Given 购物车中有 1 件商品
      When 用户完成结算
      Then 审计日志新增一条记录，内容如下
        """
        {
          "event": "ORDER_CREATED",
          "actor": "<user_id>",
          "timestamp": "<iso8601>",
          "amount": "<total>"
        }
        """
      * 日志记录不可篡改
```

> **关键词使用说明**：
> - `Background` 中的步骤在每个 Scenario 执行前自动运行，避免重复 Given。
> - `Rule` 将同一 Feature 下的场景按业务规则分组（Gherkin v6+）。
> - `Scenario Outline` + `Examples` 以数据驱动方式执行同一场景多次。
> - Data Table（`|` 表格）作为单个步骤的参数传入，不驱动场景重复。
> - Doc String（`"""`）传递多行文本参数，保留原始格式。
> - `*`（星号）替代任意步骤关键词，适合列举性断言。
> - `@tag` 标签用于筛选执行（如 `--tags @smoke`）。

## 常用 BDD 框架参考

| 编程语言 | 推荐框架 | 说明 |
|:---|:---|:---|
| **Java** | Cucumber | 广泛使用，生态成熟 |
| **Python** | pytest-bdd | 与 pytest 无缝集成，适合 Python 项目 |
| **JavaScript/Node.js** | Cucumber.js | 官方支持，与 Cucumber 生态一致 |
| **Ruby** | Cucumber | BDD 理念发源地之一，Cucumber 最初即用 Ruby 编写 |
| **.NET (C#)** | SpecFlow | .NET 平台上的主流 BDD 框架 |

## 总结

编写优秀的 BDD 用例，核心在于**用业务语言沟通、关注行为而非细节、保持场景简洁且单一**。它不仅是测试，更是团队协作和需求澄清的工具。

## 语义质量指导（SRS-Formalizer 专属）

本节是 SRS-Formalizer 技能在标准 Gherkin 语法之上增加的语义质量要求。`validate-bdd --strict` 会检查这些规则。

### @RID 追溯标签

SRS-Formalizer 要求每个 Scenario 标注 @RID 标签，建立 BDD → IR 需求的双向追溯。

**格式**：`@RID-BDD-<子系统名>-<需求编号>-<场景序号>`

```gherkin
@RID-BDD-AuthService-REQ-0001-001
Scenario: 用户使用有效凭证登录
  Given 用户在登录页面
  When 用户输入有效的用户名和密码并点击登录
  Then 系统显示用户主页
```

**规则**：
- 每个 Scenario 至少一个 @RID 标签
- 否定场景用 `-NEG` 后缀：`@RID-BDD-AuthService-REQ-0001-NEG-001`
- Feature 文件头部用 `# TRACE: <IR-NODE id>` 标注覆盖的子系统

### 状态转换建模

每个 Scenario 应描述一个状态转换：初始状态（Given）→ 触发事件（When）→ 终态（Then）。

**规则**：
- Given 枚举影响当前场景的全部系统状态变量
- When 绑定具体触发事件（不是"用户操作"而是"点击提交按钮"）
- Then 断言转换后的系统状态（不是需求原文复述）
- 跨 Scenario 依赖用 `# TRACE: depends-on <ScenarioA>` 标注

### 复述检测（Then 铁律）

`validate-bdd --strict` 会检测 Then 步骤是否复述需求原文。

**禁止**：
```gherkin
# ❌ 复述——Then 含「必须/应当/shall/must」且无否定
Then 系统必须支持用户登录
```

**正确**：
```gherkin
# ✅ 可观测断言——描述转换后的系统状态
Then 系统显示用户主页
And 用户会话已创建
```

**转换规则**：
- 「必须 X」/「shall X」→ `Then <X 发生后可观测的结果/状态/输出>`
- 「不得 Y」/「must not Y」→ `Then the system does not <Y>`
- 数值约束 → 精确数值断言（阈值必须来自 SRS 设计事实，禁止编造）

### NFR 阈值溯源

NFR 场景中的数值阈值必须可追溯到 SRS 原始设计事实：

- ✅ `Then 响应时间 ≤ 200ms`（SRS 原文有此数值）
- ✅ `Then 响应时间 ≤ <THRESHOLD>ms`（SRS 未定义，标记待补）
- ❌ `Then 响应时间 ≤ 2000ms`（SRS 未提及 2000ms，Agent 编造）
