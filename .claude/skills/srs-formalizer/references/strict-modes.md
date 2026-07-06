# SRS-Formalizer 严格模式与收敛循环

## S4 BDD 严格模式（gherkin-lint）

BDD 校验使用 `gherkin-lint`（[GitHub](https://github.com/vsiakka/gherkin-lint)）。默认启用严格模式。

**格式要求：**
- 必须采用独立 `.feature` 文件格式建模，**不接受 Markdown 模式描述 BDD**
- 必须有完整步骤（Given → When → Then → And），必须完整定义状态和状态转换

**gherkin-lint 规则（20 条，配置 `templates/.gherkin-lintrc-strict`）：**
- **禁止 GAP**：检测 `GAP`、`TODO`、`FIXME`、`TBD` 标记
- **禁止 PLACEHOLDER**：检测 `<THEN_PLACEHOLDER>`、`<GIVEN_PLACEHOLDER>` 等占位符
- **禁止未定义**：检测 `UNDEFINED`、`待定`、`未定义`、`待实现`
- **禁止未使用变量**：Scenario Outline 变量必须全部使用
- **强制逻辑顺序**：Given → When → Then → And

**质量门禁（全部必须通过）：**
- 不允许 `error`、`failed`、`undefined`、`untested`、步骤缺失——出现则需处理修正
- 不允许占位实现、简化实现、错误实现
- 行为图谱 `build-behavior-graph` 必须成功构建（含 Feature/Scenario/Action 节点）

**SRS 一致性问题：** 建模必须符合 SRS 设计并进一步细化。出现问题先检查建模与设计一致性；一致但仍有问题则与用户交互修正设计。

## S5 TLA+ 严格模式

TLA+ 使用内置 `tla2tools-1.7.4.jar`（`tools/` 目录）。仅需 Java（不限 OS）。

- **禁止死锁（黑洞）**：`-deadlock` 标志
- **禁止无限状态**：状态空间必须有限
- **禁止奇迹**：不允许不可能的状态转换
- **禁止未定义**：TypeOK 不变式强制执行
- **禁止活锁（停滞）**：Stuttering 检测

## S5 Lean 4 平台限制

| 平台         |         支持         |
| ------------ | :------------------: |
| Linux x86_64 |          ✅          |
| macOS ARM64  |          ✅          |
| Windows      | ❌ 禁止（使用 WSL2） |

安装后执行 `lake exe cache get` 下载 mathlib4 最新版编译缓存（避免从源码编译）。要求使用 mathlib4 最新版本。

Lean 4 必须使用拆分证明四步法（骨架→拆分→递归至0 sorry），详见 `references/lean4-coding-guide.md`。

## S6 跨图一致性验证（10 个根本问题）

S6 收敛循环验证全部图谱是否可联合回答 10 个根本问题（详见 `lib/cross-graph-verifier.ts`）：

|  #  | 问题                                                             | 联合图谱               |
| :-: | ---------------------------------------------------------------- | ---------------------- |
| Q1  | 它是什么？（本质定义、核心定位）                                 | 需求 + 系统架构        |
| Q2  | 它做什么？（核心功能、主要作用）                                 | 需求 + 行为            |
| Q3  | 它能做什么？（具体能力、应用场景）                               | 需求 + 行为 + TLA+     |
| Q4  | 它为什么可以这样？（技术原理、论文URL、开源URL，含 Lean 4 建模） | Lean + 需求 + 联网搜索 |
| Q5  | 能不能和其他软件/工具联合使用？                                  | 系统架构 + TLA+        |
| Q6  | 它的内部行为是怎样的（TLA+ 多层子系统建模）                      | TLA+ + 系统架构        |
| Q7  | 它与其他系统如何交互（BDD+TLA+ 联合建模）                        | 行为 + TLA+            |
| Q8  | 它与外部如何交互（BDD+TLA+ 联合建模）                            | 行为 + TLA+ + 系统架构 |
| Q9  | 它的工作边界是什么（联合建模+边界条件）                          | 行为 + TLA+ + 系统架构 |
| Q10 | 它的兜底方案是什么（降级/回滚/恢复）                             | 需求 + 行为 + 系统架构 |

### 验证机制

- **节点标签匹配**：每道问题要求图谱包含相关类型的节点（如 Q1-Q3 要求 `Requirement`/`Feature` 标签，Q4 要求 `Theorem`/`Proof` 标签）
- **跨图边**：多图问题检查 `system-architecture.json` 中是否存在跨层连接（IMPLEMENTS/FORMALIZES/PROVES/REFINES）
- **最小节点阈值**：深层分析问题（如 Q6 TLA+ 内部行为）要求 ≥5 个相关节点

### 收敛循环

不可回答 → 回退对应阶段修复。≥3 次未收敛 → 苏格拉底拷问（联网搜索 + 可选项 + 推荐）+ 人类决策。

**一致定义**：全部 10 个问题可回答 + 跨层边 > 0 + 高置信度 ≥ 7/10 + verify-gate FINAL 通过。
