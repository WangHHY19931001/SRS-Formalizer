# 执行者-Frontend-Arch：架构分解

## 角色

基于 SRS-IR 节点集合识别 Module/Actor/Constraint 层次，构建系统架构树。合并原 Arch-1（初分解）+ Arch-2（精化）+ Arch-3（终核）功能。**只填空。**

## 输入

- SRS-IR 节点集合：`{{IR_NODES}}`
- SRS-IR 边集合（用于 Arch-3 终核）：`{{IR_EDGES}}`
- 分片总数：`{{TOTAL_SHARDS}}`

## 动态架构轮次

| 分片总数 | 架构轮次 |
|----------|----------|
| <50 | 3 轮（基础 → 精化 → 终核） |
| 50-99 | 4 轮（基础 → 精化 → 终核 → NFR 传播） |
| ≥100 | 5 轮（基础 → 精化 → 终核 → NFR 传播 → 跨模块调和） |

## 输出格式

所有架构记录统一使用以下模板：

```jsonl
{"id":"ARCH-SYS-<SEQ>","round":<ROUND>,"type":"<TYPE>","name":"<NAME>","parent":<PARENT>,"contains":["<IR_NODE_ID>",...],"reasoning":"<REASON>","nfr_tags":["<NFR_CAT>",...]}
```

| 占位符 | 规则 |
|--------|------|
| `<SEQ>` | 4 位序号，跨轮次全局递增 |
| `<ROUND>` | 架构轮次编号 1–5 |
| `<TYPE>` | `module` / `actor` / `constraint` |
| `<NAME>` | 仅 ASCII 模块名 |
| `<PARENT>` | `null`（顶层）或 `"父模块名"`（带引号字符串） |
| `<IR_NODE_ID>` | 真实存在的 IR-NODE id（匹配 `^IR-NODE-[A-Za-z0-9_.]+-\d{4}$`） |
| `<REASON>` | ≥20 字符识别依据 |
| `<NFR_CAT>` | 可选的 NFR 类别列表 |

## 各轮次详细规范

### Round 1：基础分解

从 IR-NODE 集合中识别 Module/Actor/Constraint 层次。

模块边界判断准则：

**何时拆分模块：**
- 职责分离：同一 IR 节点中描述了两个不同功能领域
- 数据所有权：不同实体拥有和管理不同数据
- 接口清晰：模块间交互可通过明确接口定义
- 独立演进：一组需求可由独立团队开发

**何时合并模块：**
- 强耦合：修改一个模块必须同时修改另一个
- 数据共享：两个模块频繁交换同一数据集
- 单一入口：多个模块总被同时访问

分解优先级：
1. 优先识别 **actor**（外部角色）：用户类型、外部系统
2. 再识别一级 **module**（顶层系统模块）
3. 逐层细化子模块（最多 4 层）
4. 最后标注跨模块 **constraint**

硬性约束：
1. type 仅 module/actor/constraint
2. parent 为 null 或同文件中存在的模块名
3. contains 数组中 id 匹配 `^IR-NODE-[A-Za-z0-9_.]+-\d{4}$`
4. 全部 IR-NODE 必须被分配且仅分配一次
5. 层次 ≤4 层，CONTAINS 无环

### Round 2：精化（基于隐式需求）

基于 IR-NODE（category=implicit）发现遗漏的模块、新约束、层次修正。

增量操作：
```jsonl
{"id":"ARCH-SYS-<SEQ>","round":2,"action":"add_module|add_constraint|add_actor|reparent|merge","target":"<受影响模块名>","name":"<新名称>","parent":"<父模块名>","contains":["IR-NODE-xxx"],"reasoning":"<原因>"}
```

重点检查：
1. implicit 节点的 affected_module 在 Round-1 中是否存在？→ 不存在则 add_module
2. 隐式需求推导的安全/数据约束是否暴露出遗漏模块？
3. Round-1 的 Constraint 是否需要传播到新发现的模块？
4. 是否有 IR 节点不属于任何已有模块？→ add_module 或 reparent

### Round 3：终核（基于关系推导）

基于 IR-EDGE 关系发现结构矛盾，输出最终修正。

增量操作：
```jsonl
{"id":"ARCH-SYS-<SEQ>","round":3,"action":"add_module|reparent|split|add_dependency_layer|fix_cycle","target":"<受影响模块名>","detail":"<修正描述>","reasoning":"<基于IR-EDGE矛盾的证据>"}
```

重点检查：
1. CONFLICTS_WITH 的 source_module 和 target_module 归属是否正确？→ reparent
2. DEPENDS_ON 是否跨越多层？→ add_dependency_layer
3. source_module==target_module 但关系为 DEPENDS_ON？→ split
4. source_module→target_module 和 target_module→source_module 同时存在？→ fix_cycle

### Round 4：NFR 传播（仅分片 ≥50 时执行）

将 nfr_tags 从 IR-NODE 传播到所属架构节点：

- 遍历所有含 `nfr_category` 的 IR-NODE
- 向上传播到其直接父模块
- 若父模块已有不同 NFR 类别则合并
- 跨模块 NFR（如全局安全性）标注为 `constraint`

### Round 5：跨模块调和（仅分片 ≥100 时执行）

检测跨模块矛盾并调和：
- 同一 NFR 类别在不同模块中有冲突阈值
- 同一完整性约束在不同模块中有不同实现要求
- 架构层次过深（>4 层）→ 建议扁平化

## 文件操作约束

所有轮次输出写入 `.srs_formalizer/2_extract/architecture/arch.jsonl`，同一文件按轮次追加。

## 示例

### 输入 IR-NODE（节选）
```jsonl
{"id":"IR-NODE-USR-0001","category":"explicit","statement":"用户通过邮箱注册账号","metadata":{}}
{"id":"IR-NODE-USR-0002","category":"explicit","statement":"用户通过邮箱密码登录","metadata":{}}
{"id":"IR-NODE-DATA-0001","category":"explicit","statement":"系统将用户数据加密存储","metadata":{}}
{"id":"IR-NODE-USR-0003","category":"explicit","statement":"管理员可查看所有用户列表","metadata":{}}
```

### 输出
```jsonl
{"id":"ARCH-SYS-0001","round":1,"type":"actor","name":"User","parent":null,"contains":["IR-NODE-USR-0001","IR-NODE-USR-0002"],"reasoning":"终端用户是系统的主要外部角色，通过邮箱完成注册和登录","nfr_tags":[]}
{"id":"ARCH-SYS-0002","round":1,"type":"actor","name":"Admin","parent":null,"contains":["IR-NODE-USR-0003"],"reasoning":"管理员是拥有额外权限的特殊用户角色，可查看用户列表","nfr_tags":[]}
{"id":"ARCH-SYS-0003","round":1,"type":"module","name":"UserManagement","parent":null,"contains":["IR-NODE-USR-0001","IR-NODE-USR-0002","IR-NODE-USR-0003"],"reasoning":"用户管理和权限控制构成独立的功能模块，包含 User 和 Admin 两个角色","nfr_tags":[]}
{"id":"ARCH-SYS-0004","round":1,"type":"constraint","name":"DataEncryption","parent":null,"contains":["IR-NODE-DATA-0001"],"reasoning":"用户数据加密存储是一条跨模块架构约束，适用于所有数据持久化操作","nfr_tags":["security"]}
```
