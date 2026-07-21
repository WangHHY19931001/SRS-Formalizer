# ADR-0009: Data-Flow Signals — Persisted in IR vs. Ephemeral Analysis

| Status | Date | Author |
|:------:|:----:|:------:|
| Proposed | 2026-07-21 | srs-formalizer |

## Context

设计草案 [Data-Flow Review Hints](../superpowers/specs/2026-07-21-dataflow-review-hints-design.md) 提出:从 requirement 节点抽取数据实体与读写关系,检出死点/边界/gap/环路四类可疑单元,以强提示(warning)驱动 BDD/TLA+ agent 加强审视。

分析本身要用一张**数据流投影图**(节点=数据实体,边=produces/consumes/mutates)。核心架构决策是:**这张图的边该不该落进 `srs-ir.json`?**

约束来自现有 IR 不可变性契约(见 `references/ir-schema-reference.md` §5):
- Frontend `assemble-ir` 生成 IR 后只读,不再修改结构
- Middle-end 只允许写回受限字段(M3 `nfrProfile`、M5 `edges` 冲突判决、M6 `meta.riskScore`)
- Backend 纯读消费

因此"数据流边进不进 IR"决定了它由谁产生、能不能进 Cypher 图谱、能不能被追溯矩阵消费——影响面远超一个旁路报告。

## Decision

**采用方案 A:数据流信号进 IR。** 新增 `data_entity` 节点与 `produces`/`consumes`/`mutates` 边,由 **Frontend 抽取阶段**一次性写入 IR;Middle-end 新增只读旁路 `analyze-dataflow` 消费它们产出 `dataflow.json`(恒为 warning)。

理由:
1. **数据流图是一等图谱,不是临时中间量。** 13 个根本问题里 Q6/Q7/Q8(内部行为、系统交互、外部交互)本质都是数据流问题;若数据流边不进 IR,就无法进 Cypher、无法被追溯矩阵和跨图一致性检查消费,价值大打折扣。
2. **抽取归属 Frontend 符合三阶段架构。** 数据实体与读写关系是从需求文本抽取的**事实**,与 requirement 节点同源;放在 Frontend 抽取阶段一次成型,符合"Frontend 负责事实抽取、Middle-end 负责分析"的分工。
3. **不破坏不可变性契约。** 数据流边在 `assemble-ir` 阶段随其他边一次性写入;Middle-end `analyze-dataflow` 与现有 `analyze-structure` 一样只读 IR、只写分析报告,契约不变。

## Consequences

### Positive
- 数据流图可进 Cypher(`srs-graph.cypher`)、被追溯矩阵和跨图一致性检查消费
- `analyze-dataflow` 保持纯只读旁路,与 `analyze-structure` 定位一致,契约清晰
- 数据流边成为一等公民,后续可支撑 Q6/Q7/Q8 的自动回答

### Negative
- 触及 Frontend 抽取流程与 IR schema(新增 1 节点类型 + 3 边类型),改动面比纯中端旁路大
- Frontend 抽取阶段需承担数据实体识别与归一,增加抽取复杂度
- IR schema 版本需要考虑升级(`2.0.0` → `2.1.0`),旧 IR 无数据流边时 `analyze-dataflow` 须优雅降级(空图不报错)

### Risks/Mitigations
- **Risk**: 实体归一不准导致数据流边错误,污染一等图谱 → **Mitigation**: 归一强制依赖现有 `glossary`/`crossRefs`,无证据不合并;上线前 shadow 模式度量假阳性率达标再开注入
- **Risk**: schema 变更影响现存 IR → **Mitigation**: 新增字段全部可选,定为向后兼容的 minor 升级(2.0.0 → 2.1.0);`assemble-ir` 版本校验放宽为接受 2.x(推荐选项 A);`analyze-dataflow` 对无 `data_entity` 的旧 IR 返回空 findings 而非报错。完整迁移落点见设计草案「Schema Migration」节
- **Risk**: Frontend 抽取成本上升 → **Mitigation**: 数据实体抽取并入现有 requirement 解析,不新增独立 LLM pass

## Alternatives Considered

| Alternative | Pros | Cons | Reason for Rejection |
|------------|------|------|---------------------|
| **B. 数据流边不进 IR,由 `analyze-dataflow` 临时抽取** | 完全不碰 Frontend 与 schema;改动面最小 | 数据流边无法进 Cypher/追溯矩阵/跨图一致性;Q6/Q7/Q8 无法消费;每次分析重复抽取 | 价值受限,数据流沦为一次性中间量,违背"数据流图是一等图谱"判断 |
| **C. Middle-end 写回数据流边到 IR** | 不改 Frontend | 破坏 IR 不可变性契约(Middle-end 越权写结构);与现有 M 阶段写权限模型冲突 | 违反不可变性契约,架构不一致 |
| **D. 独立的 `dataflow.json` 图谱,与 IR 平行** | IR 不变 | 双图谱同步困难;追溯矩阵需额外拼接;实体 id 与 IR 节点 id 易漂移 | 引入双源真相,维护成本高 |

## Related Documents

- [Data-Flow Review Hints Design Spec](../superpowers/specs/2026-07-21-dataflow-review-hints-design.md)
- [IR Schema Reference](../../.claude/skills/srs-formalizer/references/ir-schema-reference.md)
- [ADR-0007: Middle-end Parallelization](0007-middle-end-parallelization.md)
- [ADR-0008: Semantic Consistency Checker](0008-semantic-consistency-checker.md)
