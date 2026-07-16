# NFR 阈值提取指南

> **本文件是 NFR 阈值提取的参考指南**，Agent 在 Middle-end M3 阶段执行 NFR 节点分类、阈值正则提取、盲点检测时依据此文档。详细规范见 `docs/DESIGN.md` §4.3。
>
> NFR 阈值提取由 Agent 执行（非脚本），结果写回 SRS-IR 的 `nfrProfile` 与节点的 `properties.nfrThreshold`。

---

## 1. NFR 分类（全系统唯一六类）

DESIGN.md §4.3 规定全系统唯一的六类 NFR 分类：`performance`、`security`、`availability`、`compatibility`、`maintainability`、`compliance`。

SRS-IR 枚举、BDD 模板、TLA+ 不变式、Lean 定理、门禁与报告均只能使用这六项。`reliability`、`observability` 等术语可作为别名或映射信号，但不得成为独立类别。

### 1.1 六类 NFR 关键词表

| NFR 类别 | 中文关键词 | 英文关键词 |
|----------|-----------|-----------|
| performance | 响应时间、延迟、吞吐、并发、性能 | latency, throughput, response time, concurrent |
| security | 安全、加密、认证、授权、防攻击 | encrypt, authentication, authorize, prevent |
| availability | 可用性、容错、冗余、恢复、高可用 | uptime, availability, fault, recovery, redundant |
| compatibility | 兼容、适配、浏览器、操作系统 | compatible, browser, platform, OS |
| maintainability | 可维护、扩展、模块化、可配置 | maintainable, extensible, modular, configurable |
| compliance | 合规、GDPR、PCI、审计、监管 | compliance, GDPR, PCI, audit, regulatory |

---

## 2. 阈值提取流程

DESIGN.md §4.3 规定 NFR 阈值提取流程（Agent 执行）：

```
正则优先 → 启发式回退（关键词 + 数值邻近）→ 跳过不报错
```

### 2.1 三级流程

| 级别 | 方法 | 说明 |
|------|------|------|
| 1 | **正则优先** | 优先用正则模式匹配含数值阈值的 NFR 语句 |
| 2 | **启发式回退** | 正则未命中时，用关键词 + 数值邻近性判断 |
| 3 | **跳过不报错** | 启发式仍未命中则跳过该节点，不产生错误 |

### 2.2 正则模式来源

DESIGN.md §4.3 声明"六类 NFR 各 5 个正则模式"，但**未在 DESIGN.md 中枚举具体正则**，仅前向引用本参考文档。正则模式应基于以下来源构造：

1. **§1.1 关键词表**：每类的中英文关键词
2. **NFRThreshold 类型结构**（DESIGN.md §5.2）：

```typescript
interface NFRThreshold {
  metric: string;  value: number;  unit: string;
  operator: '<' | '<=' | '>' | '>=' | '==';
}
```

正则需匹配的关键要素：
- **metric**：从关键词派生（如"响应时间"、"latency"）
- **operator**：`<`、`<=`、`>`、`>=`、`==`（含中文"≤"、"≥"、"不超过"、"至少"等表述）
- **value**：数值
- **unit**：单位（如 `ms`、`%`、`次/秒`）

> **注意**：Agent 在运行时根据关键词表与 NFRThreshold 结构构造每类 5 个正则模式。DESIGN.md 未规定具体正则文本，Agent 不得编造未由关键词表支撑的模式。

---

## 3. 盲点检测

### 3.1 blindSpots 标记

六类 NFR 中未覆盖到的类别标记为 `blindSpot`，写入 `NFRProfile.blindSpots`：

```typescript
interface NFRProfile {
  detectedCategories: NFREntry[];
  weightedShards: NFRWeightedShard[];
  overallCoverage: number;
  blindSpots: NFRCategory[];  // 未覆盖到的 NFR 类别
}
```

### 3.2 判定规则

- 对六类 NFR 逐一检查是否在 `detectedCategories` 中出现
- 未出现的类别加入 `blindSpots` 数组
- `blindSpots` 不产生错误，仅作为风险信号供后续阶段参考

---

## 4. 产出与写回

### 4.1 Middle-end M3 阶段

| 步骤 | Agent 工作 | 产出 | 门禁/工具 |
|------|-----------|------|-----------|
| M3 | 读 IR → NFR 节点分类、阈值正则提取、盲点检测 → 写回 IR 的 `nfrProfile` | `srs-ir.json`（mutate nfrProfile） | `validate-semantics --strict` |

### 4.2 写回字段

- `nfrProfile.detectedCategories`：检测到的 NFR 类别及关键词命中
- `nfrProfile.blindSpots`：未覆盖的 NFR 类别
- `nfrProfile.overallCoverage`：NFR 覆盖率
- 节点 `properties.nfrCategory`：NFR 类别标注
- 节点 `properties.nfrThreshold`：提取的阈值结构

### 4.3 门禁约束

`validate-semantics --strict`（DESIGN.md §7.3）校验：
- NFR 类别必须为 §4.3 六类正式分类
- 阈值合法性（operator 枚举、value 数值类型）

---

## 5. NFR 条件触发形式化产物

DESIGN.md §4.3 规定 NFR 条件触发 TLA+/Lean 4（Agent 判断）：

| NFR 类别 | 触发条件 | 强制产物 |
|----------|----------|:--------:|
| performance | 关键词 ≥5 且 total_shards ≥100 | 强制 TLA+ |
| security/compliance | 关键词 ≥1 | 强制 Lean 4 |
| availability | 关键词 ≥3 | 建议 TLA+ |

不适用时 Agent 跳过对应产物生成。

> **注意**：此处的"关键词"计数来源为 §1.1 关键词表的命中次数，由 Frontend F1 阶段 NFR 关键词扫描产出，记录于 `NFRProfile.detectedCategories[].keywordHits`。
