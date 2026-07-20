# TLA+ 编码参考指南

本指南为 srs-formalizer S5 阶段的 TLA+ 子代理提供编码规范，涵盖语法速查、编写原则、编码方法、反例与常见错误、工业实践及外部资源。

---

## 0. 前置条件

### 0.1 环境要求

TLA+ 仅需 Java 运行环境（Java 11+），**不限制操作系统**（Linux / macOS / Windows 均可）。

```bash
java -version
```

### 0.2 工具获取

仅使用内置 `tools/tla2tools-1.7.4.jar`，不联网、不引入外部 JAR。

### 0.3 验证命令（SANY + TLC）

```bash
# SANY 语法解析
java -cp tools/tla2tools-1.7.4.jar tla2sany.SANY <file>.tla

# TLC 模型检测
java -cp tools/tla2tools-1.7.4.jar tlc2.TLC -config <file>.cfg <file>.tla

# 技能 CLI
npx tsx index.ts validate-tla --name <module> --strict --promote --workdir <wd>
```

---

## 1. 核心参考资源

| 资源 | 说明 | URL |
|------|------|-----|
| TLA+ 官网 | 官方首页，汇聚所有核心资源 | https://lamport.azurewebsites.net/tla/tla.html |
| 学习 TLA+ | 官方学习资源汇总，含视频课程 | https://lamport.azurewebsites.net/tla/learning.html |
| TLA+ Wiki | 社区驱动的维基百科式资源 | https://docs.tlapl.us/ |
| Learn TLA+ | 免费在线教程，分三部分系统讲解 | https://learntla.com/ |
| TLA+ 速查表 (PDF) | 语言构造快速参考 | https://lamport.azurewebsites.net/tla/summary-standalone.pdf |
| Specifying Systems | Lamport 所著权威参考书（免费在线） | https://lamport.azurewebsites.net/tla/book.html |

---

## 2. 语法说明

### 2.1 模块结构

每个 TLA+ 规范以模块为单位组织：

```tla
---- MODULE ModuleName ----
EXTENDS Naturals, TLC          \* 引入其他模块
CONSTANT Max                   \* 常量参数
VARIABLES x, y                 \* 状态变量

Init == x = 0 /\ y = 0         \* 初始谓词
Next == x' = x + 1 /\ y' = y + x  \* 下一状态动作
Spec == Init /\ [][Next]_<<x, y>>  \* 系统规范

====
```

模块必须包含 `---- MODULE name ----` 头部和 `====` 尾部。`====` 之后的内容被 TLA+ 忽略，可用作"草稿空间"存放临时代码。

### 2.2 注释语法

- **块注释**：`(* 注释内容 *)`，不可嵌套
- **行注释**：`\* 行尾注释`

### 2.3 核心语法元素

| 类别 | 语法示例 |
|------|---------|
| 模块声明 | `---- MODULE Name ----` / `====` |
| 操作符定义 | `op == ...` 或 `op(x, y) == ...` |
| 变量声明 | `VARIABLES x, y` |
| 集合字面量 | `{1, 2, 3, 4, 5}` |
| 前缀操作符 | `ENABLED`, `-x`, `~` (逻辑非) |
| 中缀操作符 | `\in`, `=`, `+`, `-`, `<` |
| 后缀操作符 | `'` (变量下一状态值) |
| 条件构造 | `IF condition THEN expr1 ELSE expr2` |
| 垂直对齐 | `/\` 表示合取列表，`\/` 表示析取列表 |

### 2.4 操作符 vs 函数

- **操作符**类似宏：无定义域，参数替换为表达式
- **函数**类似字典/映射，是有定义域的值，可用 `[x \in S |-> expr]` 构造

### 2.5 PlusCal

PlusCal 是 TLA+ 的算法描述层，更接近编程语言风格，适合初学者入门。PlusCal 算法会被翻译为 TLA+ 规范。注意：
- 避免 `while` 循环——每次迭代创建新状态
- 标签定义原子性——标签之间的所有内容是一个原子步骤
- macros 是语句复用的主要形式

---

## 3. 层次化建模方法论

### 3.1 层次定义

| 层级 | 名称 | 内容 |
|------|------|------|
| **L1** | 系统级 | 系统内外交互抽象 |
| **L2** | 子系统级 | 子系统内部行为 + 上下同级交互抽象 |
| **L3** | 原子级 | 原子化子系统行为抽象 |
| **L4+** | 递归拆解 | 每个下级子系统视为独立系统继续拆解 |

### 3.2 拆解阈值

先写 TLA+，分析变量组合。组合结果 > 1k 时考虑拆，> 1w 时必须拆。

### 3.3 文件头部标注

每个 TLA+ 文件头部必须标注自身所属系统和上下级文件关系：

```tla
---- MODULE OrderStateMachine ----
\* 所属系统: 在线商城 — 订单子系统
\* 上级: ../SystemLevel.tla
\* 同级: ./PaymentStateMachine.tla
\* 下级: ./atomic/StockLock.tla
====
```

### 3.4 死锁与调试

- 正常系统不允许死锁。死锁或矛盾分支需定位根因修正
- 调试前先删除旧的轨迹文件（`.stl`）和状态文件（`.tlc`）
- 编码顺序：先通过 SANY 语法检查，再执行 TLC 模型检查

### 3.5 质量标准

不允许：死锁、状态爆炸、违反不变式、实现错误、占位实现、简化实现、错误实现。

### 3.6 SRS 一致性

建模必须符合 SRS 设计。符合设计但仍有问题 → 报告人类 + 可选项 + 联网调研事实依据 → 产出写入 `SRS_PATCHES.md`。

---

## 4. 编写原则

### 4.1 核心原则

1. **清晰性优先**：规范是给人看的，其次才是给机器读的
2. **一致性**：保持命名、结构和风格的一致
3. **数学精确性**：用精确的数学语言描述系统
4. **设计验证**：验证设计而非性能，在设计阶段发现缺陷

### 4.2 模块化设计

- 将复杂系统分解为多个模块，每个模块负责一部分功能
- 从简单模型开始，逐步增加复杂性
- 公共类型和常量放在单独模块中

### 4.3 命名约定

| 类型 | 风格 | 示例 |
|------|------|------|
| 模块名 | PascalCase | `PaxosMadeSimple` |
| 常量 | 全大写蛇形 | `MAX_RETRIES` |
| 变量 | 小写蛇形 | `current_state` |
| 操作符 | PascalCase | `SendMessage` |
| 谓词 | 以 `Is` 开头 | `IsInitialized` |

### 4.4 为每个 CONSTANT 添加 ASSUME

```tla
CONSTANTS MaxRetry, Timeout
ASSUME MaxRetry \in Nat
ASSUME Timeout \in 1..100
```

### 4.5 注释策略

- 模块顶部添加功能说明
- 复杂算法前添加思路说明
- 非直观逻辑添加解释性注释
- 注释应说明"为什么"而非"是什么"

---

## 5. 编码方法与最佳实践

### 5.1 编写规范的顺序

Lamport 建议：选择抽象层次 → 定义变量 → 定义类型不变量和初始谓词 → 确定常量参数和假设。

### 5.2 TypeOK 不变式

TLA+ 是无类型的。每个 spec 必须包含 TypeOK 不变式覆盖所有变量：

```tla
TypeOK ==
  /\ counter \in 0..100
  /\ status \in {"idle", "processing", "done"}
```

### 5.3 派生优于存储

优先使用状态函数派生值，而非存储额外变量。每增加一个变量，状态空间指数增长：

```tla
\* 不推荐: VARIABLE count, is_full
\* 推荐:   VARIABLE count
\*         Full == count = MaxCapacity
```

### 5.4 细粒度原子性 + 卫语句风格

将动作推到正确性允许的最细粒度，暴露真实的并发交错。每个动作必须有明确的 guard：

```tla
Increment ==
  /\ counter < 100       \* guard
  /\ counter' = counter + 1
```

### 5.5 参数化动作 + 分解结构体

将 `\E` 量词移到 Next 层级，传递值给动作；分解结构体变量以支持独立更新：

```tla
\* 不推荐：单个复杂结构体
VARIABLE state
WorkerState == [queue: Seq(Msg), online: BOOLEAN]

\* 推荐：拆分为独立变量
VARIABLES worker_queue, worker_online
Types == /\ worker_queue \in [Worker -> Seq(Msg)]
        /\ worker_online \in [Worker -> BOOLEAN]

\* 参数化动作
Process(w) == ...
Next == \E w \in Worker: Process(w)
```

### 5.6 安全性与活性分离

活性检查更慢且不能使用对称集。创建单独的模型配置文件，用小常量仅检查活性属性。

### 5.7 使用 `@` 简写

```tla
[f EXCEPT ![key] = @ + 1]  \* 而非 f[key] + 1
```

### 5.8 注入 Bug 验证不变式强度

如果不变量从不失败，它可能太弱。故意注入已知 Bug 验证不变式能否捕获。

### 5.9 最小化建模

从最小规格开始，只添加必要的组件。"删除应该带来愉悦"（Murat Buffalo, 2025）。

---

## 6. 反例与常见错误

### 6.1 定义与等式混淆

使用 `=` 代替 `==` 进行定义会导致解析错误。定义操作符始终用 `==`。

### 6.2 集合元素类型不一致

TLC 要求集合元素类型一致。`{1, 2, TRUE}` 会引发运行时错误。嵌套集合也要求所有元素嵌套层次和类型一致。

### 6.3 "非法知识"陷阱（最常见）

TLA+ 的全局共享内存模型容易让人写出读取全局状态的守卫，而真实进程无法原子地观察这些状态。

### 6.4 操作符优先级问题

TLA+ 有 76 个中缀操作符，优先级是偏序关系。复杂表达式需用括号明确分组。

### 6.5 活性属性检查错误

初学者常将公平约束 `F` 与行为规范 `Spec` 合取，然后尝试检查属性 `F` 本身。

### 6.6 字符串索引

TLC 对 `"abc"[1]` 的求值会报错——TLA+ 语义未定义字符串索引。

### 6.7 LLM 常见建模错误

基于 FormaLLM 研究（30 模型，205 规格，语义正确率 8.6%）和 SysMoBench：

| # | 错误类型 | 说明 | 规避方法 |
|---|---------|------|---------|
| 1 | **教科书建模** | Spec 进入系统永远不会到达的状态 | 对照 SRS 原文逐行检查每个状态转换 |
| 2 | **过度原子化** | 多个真实操作融合为单个原子守卫 | 每个 SRS 需求对应的操作应是独立的 Next 子句 |
| 3 | **遗漏公平性约束** | TLC 总可以永远 stutter | 使用 `WF_vars` / `SF_vars` |
| 4 | **不变式太弱** | `TRUE` 永远不违反 | TypeOK 之外至少一个正确性不变式 |
| 5 | **PlusCal while 循环** | 循环展开导致状态爆炸 | 用整体序列重赋值替代 while |

---

## 7. 工业实践与学习示例

### 7.1 工业应用案例

- **Amazon AWS**：核心算法验证
- **Microsoft Cosmos DB**：设计验证
- **ZooKeeper**：使用 TLA+ 建模细粒度行为并用 TLC 验证
- **Apache BookKeeper**：复制协议的形式化规范

### 7.2 学习示例

- **DieHard 规范**：经典入门示例，展示最小 TLA+ 语法子集
- **两阶段提交（2PC）**：TLA+ 视频课程第 6 讲
- **分布式环终止检测**：GitHub 教程，每次提交引入一个新概念

### 7.3 代码示例仓库

- **TLA+ Examples**：https://github.com/tlaplus/Examples
- **awesome-tla+**：https://github.com/tlaplus/awesome-tlaplus

---

## 8. 外部资源

### 8.1 官方与文档

| 资源 | URL |
|------|-----|
| TLA+ 官网 | https://lamport.azurewebsites.net/tla/tla.html |
| 视频课程 | https://lamport.azurewebsites.net/video/videos.html |
| 工业应用案例 | https://lamport.azurewebsites.net/tla/industrial-use.html |
| 高级主题 | https://lamport.azurewebsites.net/tla/advanced.html |

### 8.2 工具

| 工具 | URL |
|------|-----|
| TLA+ Toolbox (IDE) | https://lamport.azurewebsites.net/tla/toolbox.html |
| VS Code 插件 | https://marketplace.visualstudio.com/items?itemName=alygin.vscode-tlaplus |
| TLC 模型检查器 | https://lamport.azurewebsites.net/tla/tools.html |

### 8.3 社区

| 社区 | URL |
|------|-----|
| TLA+ Google Group | https://groups.google.com/forum/#!forum/tlaplus |
| TLA+ Subreddit | https://www.reddit.com/r/tlaplus/ |
| TLA+ GitHub | https://github.com/tlaplus/tlaplus |
| TLA+ 基金会 | https://foundation.tlapl.us/ |

### 8.4 学术参考

- **Stephan Merz, "The Specification Language TLA+"**：https://members.loria.fr/SMerz/papers/tla+logic2008.pdf
- **"The Module Structure of TLA+"** (1996)：https://lamport.azurewebsites.net/tla/xmxx99-07-16.pdf

---

## 9. 检查清单

交付前必须逐项确认：

- [ ] SANY 语法检查通过？
- [ ] TLC 模型检查通过？
- [ ] 无死锁？
- [ ] 无状态爆炸？
- [ ] TypeOK 不变式覆盖所有变量？
- [ ] 至少一个正确性不变式？
- [ ] 注入 Bug 能被捕获？
- [ ] 与 SRS 设计一致？
- [ ] 文件头部标注完整（所属系统、上下级关系）？
- [ ] 无占位实现、简化实现、错误实现？
