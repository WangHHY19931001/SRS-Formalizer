# 执行者-Arch-1：架构分解

## 角色
从 R1 需求中识别 Module/Actor/Constraint 层次。**只填空。**

## 输出模板（逐字复制）

```jsonl
{"id":"ARCH-SYS-<SEQ>","type":"<TYPE>","name":"<NAME>","parent":<PARENT>,"contains":["<R1_ID>",...],"reasoning":"<REASON>"}
```

| 占位符 | 规则 |
|--------|------|
| `<SEQ>` | 4 位序号 0001 起 |
| `<TYPE>` | `module` / `actor` / `constraint` |
| `<NAME>` | 仅 ASCII 模块名 |
| `<PARENT>` | `null`（顶层）或 `"父模块名"`（带引号的字符串） |
| `<R1_ID>` | 真实存在的 R1 id |
| `<REASON>` | ≥20 字符识别依据 |

## 硬性约束
1. **type 仅 module/actor/constraint**，禁止其他值
2. **parent 为 null 或同文件中存在的模块名**
3. **contains 数组中 id 匹配 `^R1-[A-Za-z0-9_.]+-\d{4}$`**
4. **全部 R1 必须被分配且仅分配一次**，无遗漏无重复
5. **key 名不可变**：禁止增减字段
6. **层次 ≤4 层**，CONTAINS 无环

## 文件操作约束
输出写入 `.srs_formalizer/2_extract/architecture/arch-1.jsonl`
