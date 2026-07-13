# SRS-Formalizer 严格模式与收敛循环

## BDD 四级严格校验

BDD 校验使用四级全硬阻塞模式。通过 `validate-bdd --strict --promote` 审计 `outputs/bdd/draft`，并且只有成功时才会原子提升到 `outputs/bdd/verified`；不带 `--promote` 时只校验 verified 产物。任何一级失败即保留 draft 并打回 Frontend 重做。

### Phase 1: TS 基础结构校验

- Feature/Scenario 节点完整性
- Given/When/Then 三部曲存在性
- 步骤原子性检查（禁止复合步骤）

### Phase 2: TS NFR 专项校验

- 阈值数值校验（禁止模糊如 "很快"、"较大"）
- 认证前置条件校验（auth/authorization 场景需 Given 含 token/session）
- LLM_FILL 残留检测（禁止任何 `<LLM_FILL_*>` 占位符）
- 超时/重试上限数值化（必须为具体数字，非 "若干次"）

### Phase 3: gherkin-lint（20 条规则）

基于 `templates/.gherkin-lintrc-strict` 配置运行 gherkin-lint：
- 禁止 GAP：检测 `GAP`、`TODO`、`FIXME`、`TBD` 标记
- 禁止 PLACEHOLDER：检测 `<THEN_PLACEHOLDER>`、`<GIVEN_PLACEHOLDER>` 等占位符
- 禁止未定义：检测 `UNDEFINED`、`待定`、`未定义`、`待实现`
- 禁止未使用变量：Scenario Outline 变量必须全部使用
- 强制逻辑顺序：Given → When → Then → And

### Phase 4: Gherklin 语义校验

- 步骤定义与 Feature 文件一致性
- 跨场景词汇统一性检查
- 行为图谱完整性（隐含依赖检测）

### 质量门禁汇总

四项全部硬阻塞：

| 阶段 | 方式 | 失败后果 |
|------|------|----------|
| Phase 1 | TS 基础结构 | 打回 Frontend |
| Phase 2 | TS NFR 专项 | 打回 Frontend |
| Phase 3 | gherkin-lint 20 条 | 打回 Frontend |
| Phase 4 | Gherklin | 打回 Frontend |

- 不允许 `error`、`failed`、`undefined`、`untested`、步骤缺失
- 不允许占位实现、简化实现、错误实现

## TLA+ 全模块强制覆盖

TLA+ 使用内置 `tla2tools-1.7.4.jar`（`tools/` 目录）。仅需 Java（不限 OS）。

所有 SRS 模块强制生成 TLA+ 规约（不再基于触发条件过滤）。

### 质量门禁（`validate-tla --name <module> --strict --promote`）

命令只从 `outputs/tlaplus/draft` 读取指定模块及其 matching `.cfg`。SANY/TLC 与严格审计通过后，模块和验证报告才会进入 verified 生命周期。

- **禁止死锁（黑洞）**：`-deadlock` 标志
- **禁止无限状态**：状态空间必须有限
- **禁止奇迹**：不允许不可能的状态转换
- **禁止未定义**：TypeOK 不变式强制执行
- **禁止活锁（停滞）**：Stuttering 检测
- **6 类 NFR 不变式通过**：性能/安全/可靠性/可用性/可维护性/可观测性

### 拆解判据

- 状态组合 > 1,000 → 考虑拆解
- 状态组合 > 10,000 → 强制拆解

## Lean 4 NFR 触发条件

Lean 4 建模不再无条件触发，而是按以下 NFR 关键词触发：

| 触发关键词 | 类别 |
|------------|------|
| security, encryption, authentication, authorization, cryptography | security |
| compliance, GDPR, HIPAA, SOC2, ISO27001, regulatory | compliance |
| audit, traceability, non-repudiation | 审计/不可抵赖 |

含有上述关键词的 SRS 模块 → **强制生成 Lean 4 证明**。不含则跳过。

### 平台限制

| 平台         |         支持         |
| ------------ | :------------------: |
| Linux x86_64 |          ✅          |
| macOS ARM64  |          ✅          |
| Windows      | ❌ 禁止（使用 WSL2） |

安装后执行 `lake exe cache get` 下载 mathlib4 最新版编译缓存（避免从源码编译）。要求使用 mathlib4 最新版本。

Lean 4 严格交付流程为：Emitter 写入 `outputs/lean4/draft` → 人工/子代理完成项目本地证明 → `validate-lean --strict --promote` 审计并运行 `lake build` → 成功时原子提升至 verified。审计拒绝 `sorry`、`admit`、`axiom`、全量 `import Mathlib`、`: True` 弱化定理及编译 warning，详见 `references/lean4-coding-guide.md`。

## 跨图一致性验证（13 个根本问题）

验证循环验证全部图谱是否可联合回答 13 个根本问题：

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
| Q11 | 它的 NFR 约束如何验证（性能/安全/可靠性/可用性/可维护性/可观测性）| NFR + TLA+ + Lean      |
| Q12 | 合规性如何保证（GDPR/HIPAA/SOC2/ISO27001）                       | 需求 + Lean + 系统架构 |
| Q13 | 回溯链路是否完整（需求→设计→验证→证明）                          | 全部图谱               |

### 验证机制

- **节点标签匹配**：每道问题要求图谱包含相关类型的节点
- **跨图边**：多图问题检查跨层连接（IMPLEMENTS/FORMALIZES/PROVES/REFINES）
- **最小节点阈值**：深层分析问题要求 ≥5 个相关节点

### 收敛循环

不可回答 → 回退对应阶段修复。≥3 次未收敛 → 苏格拉底拷问（联网搜索 + 可选项 + 推荐）+ 人类决策。

**一致定义**：全部 13 个问题可回答 + 跨层边 > 0 + 高置信度 ≥ 7/13 + verify-gate FINAL 通过。
