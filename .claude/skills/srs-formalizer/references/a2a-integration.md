# A2A Protocol 集成指南

> srs-formalizer 技能遵循 A2A Protocol v1.0（Linux Foundation），支持与其他 Agent 通过标准协议协作。

## Agent Card

技能根目录下的 `agent-card.json` 声明了本技能的 A2A Agent Card，包含：

- **能力声明**：接受的输入格式（Markdown/HTML）、产出的输出格式（JSONL/Cypher/Gherkin/TLA+/Lean）
- **任务类型**：srs-formalization、knowledge-graph-generation、bdd-generation、tla-specification、lean-proof
- **安全配置**：安全等级 `high`、HITL 强制审批、权限声明
- **端点**：CLI 类型，命令 `npx tsx index.ts`，工作目录 `.srs_formalizer`
- **门禁条件**：17 命令（10 Gate Validators + 7 Independent Tools）

## 多 Agent 协作模式

### 任务委派

其他 Agent 可通过 A2A Task 机制将 SRS 形式化任务委派给 srs-formalizer：

```json
{
  "task": {
    "type": "srs-formalization",
    "input": {
      "source": "/path/to/srs.md",
      "lang": "zh",
      "stages": ["frontend", "middle-end", "backend"]
    }
  }
}
```

### 结果汇总

srs-formalizer 产出的结构化文件可通过 A2A Artifact 机制传递给下游 Agent：

| 产出 | 格式 | 下游消费者 |
|------|------|-----------|
| 需求知识图谱 | `.cypher` | Neo4j 导入 Agent |
| BDD 测试骨架 | `.feature` | 测试执行 Agent |
| TLA+ 规约 | `.tla` | TLC 模型检测 Agent |
| Lean 4 证明 | `.lean` | lake build 验证 Agent |

### 与 MCP 的关系

- **MCP**：用于工具调用（srs-formalizer 的 CLI 命令通过 MCP Server 暴露）
- **A2A**：用于 Agent 协作（srs-formalizer 作为子 Agent 被编排者调用）

两者互补，非替代关系。详见 `rules/skill/cross-platform.md`。

## 部署

1. 将 `agent-card.json` 放置在技能根目录
2. 在编排者 Agent 中注册 srs-formalizer 的 Agent Card
3. 通过 A2A Task 机制发起形式化任务
4. 通过 A2A Artifact 接收形式化产物
