# Qwen3.5 异构模型编排系统 —— 完整需求说明书

**文档版本**：v11.4
**编制日期**：2026年6月29日
**状态**：正式版
**文档编号**：srs.md


## 一、系统概述

### 1.1 系统本质定义

**Qwen3.5 异构模型编排系统** 是一套 **“可自主管理外部记忆的认知编排架构”** 。其核心本质是：使用一个极轻量级的 **MiniMind-3 (64M)** 模型作为**认知调度器（Cognitive Scheduler）** ，它不仅负责对 **Qwen3.5-9B 执行器** 的 Transformer 层进行动态编排调度，还**自主决策对外部向量数据库的完整生命周期管理**——包括查询、写入、修改和删除。

**系统定位**：这是一个具备 **“自主记忆管理能力”** 的推理系统，能够在训练和推理过程中动态扩展、更新和优化自身知识库，实现 **“终身学习（Lifelong Learning）”** 的能力闭环。

| 组件 | 规格 | 角色 | 训练状态 | 显存占用 |
|------|------|------|---------|---------|
| **认知调度器** | MiniMind-3, 64M | 大脑：调度 + 知识管理决策 | **可训练** | ~0.13 GB |
| **执行器** | Qwen3.5-9B | 肌肉：计算执行 | **完全冻结** | ~18 GB |
| **向量知识库** | LanceDB | 记忆：外部知识存储 | **离线构建** | **0 GB (磁盘)** |
| **知识管理头** | 轻量 MLP (~20M) | 知识操作参数生成 | **可训练** | ~0.04 GB |
| **知识融合层** | 轻量 Cross-Attention (~10M) | 知识注入与融合 | **可训练** | ~0.02 GB |

### 1.2 核心设计理念

本系统区别于传统 RAG 系统的核心创新在于：调度器能够自主决定是否检索、何时写入、何时修改、何时删除知识，实现完整的 CRUD 生命周期管理。

**核心理念**：让调度器像人类一样，能够自主决定：
- **什么时候查**（需要信息时主动检索）
- **什么时候记**（遇到新知识时主动存储）
- **什么时候改**（发现知识过时时主动修正）
- **什么时候忘**（发现错误信息时主动删除）

### 1.3 与前沿研究的对齐

| 研究方向 | 核心工作 | 本系统的对应 |
|---------|---------|-------------|
| 动态层路由 | BUDDY (arXiv:2606.09514) | 轻量调度器实现动态层选择 |
| 自主记忆管理 | MemGPT / MemWalker | **调度器自主控制知识库 CRUD** |
| 终身学习 | Online Continual Learning | **推理时知识动态更新** |
| 检索增强生成 | RAG + 向量数据库 | LanceDB 外部知识库 |
| 注意力残差 | Kimi (arXiv:2603.15031) | Block AttnRes 集成 |
| 轻量模型生态 | MiniMind (42K+ Stars) | MiniMind-3 作为调度器 |


## 二、核心功能

### 2.1 功能总览

```
输入 → Token嵌入 → 编排循环（最多256步）→ 输出
         │
         ├── 调度器五元决策：
         │   ├── 层调度：调用哪一层？是否循环？是否退出？
         │   └── 知识操作：查询/写入/修改/删除/无操作
         ├── 执行器执行：单层计算 + AttnRes融合
         └── 知识库操作：检索/写入/更新/删除记录
```

### 2.2 核心功能列表

| 编号 | 功能 | 描述 | 优先级 |
|------|------|------|--------|
| FR1 | 动态层选择 | 调度器可自由选择执行器任意一层 | P0 |
| FR2 | 三种层操作类型 | EXECUTE / LOOP / EXIT | P0 |
| FR3 | 循环控制 | LOOP 支持 1~9 次 | P0 |
| FR4 | 五阶段步数扩展 | 32→64→128→192→256 | P0 |
| FR5 | 知识查询（Read） | 从向量数据库检索 Top-K 相关知识 | P0 |
| FR6 | 知识写入（Create） | 将新知识编码后存入向量数据库 | P0 |
| FR7 | 知识修改（Update） | 更新向量数据库中已有记录 | P0 |
| FR8 | 知识删除（Delete） | 删除向量数据库中的指定记录 | P0 |
| FR9 | 知识操作参数生成 | 调度器生成 CRUD 所需参数 | P0 |
| FR10 | 知识融合门控 | 可训练轻量门控，控制知识注入强度 | P0 |
| FR11 | 离线知识索引构建 | 使用 Qwen3-Embedding + Qwen3.6-27B 两阶段清洗构建 | P0 |
| FR12 | 执行轨迹记录 | 记录每步 (layer, op, knowledge_op) | P1 |
| FR13 | 注意力残差融合 | AttnRes 动态加权融合 | P0 |
| FR14 | Block AttnRes | block_size=8 分块计算 | P0 |

### 2.3 知识操作类型定义

| 操作 | 符号 | 说明 | 所需参数 |
|------|------|------|---------|
| **NOP** | ∅ | 无操作 | 无 |
| **READ** | R | 从向量数据库检索知识 | `query_vector`, `top_k` |
| **WRITE** | W | 向向量数据库写入新知识 | `key`, `value`, `metadata` |
| **UPDATE** | U | 更新已有知识记录 | `record_id`, `new_value`, `new_metadata` |
| **DELETE** | D | 删除指定知识记录 | `record_id` 或 `query_condition` |


## 三、模型规格

### 3.1 执行器模型（Qwen3.5-9B）

| 属性 | 规格 |
|------|------|
| 参数量 | 9B（90亿参数） |
| 层数 | 32 层 |
| 隐藏维度 | 4,096 |
| 训练状态 | **完全冻结** |

**加载方式**：`Qwen3_5ForConditionalGeneration`

### 3.2 调度器模型（MiniMind-3 64M）

| 属性 | 规格 | 说明 |
|------|------|------|
| 参数量 | **64M** | 极轻量 |
| 层数 | **8 层** | 足够处理复杂决策 |
| 训练状态 | **可训练** | — |

**开源参考**：[jingyaogong/minimind](https://github.com/jingyaogong/minimind)

### 3.3 向量知识库组件

| 组件 | 规格 | 说明 |
|------|------|------|
| **嵌入模型** | Qwen3-Embedding-4B/8B | 离线向量化 |
| **向量数据库** | **LanceDB** | 磁盘优先架构，支持 CRUD |
| **存储位置** | 本地 SSD | **不占用 GPU 显存** |

### 3.4 数据清洗模型（Qwen3.6-27B）

| 属性 | 规格 | 说明 |
|------|------|------|
| 参数量 | **27B (Dense)** | 稠密架构 |
| 上下文窗口 | **262,144 tokens** | 原生支持 |
| 部署方式 | **vLLM 张量并行 (TP=4)** | 4×RTX PRO 6000 |
| 推理精度 | **BF16** | 全精度 |

**选型理由**：Qwen3.6-27B 是阿里于 2026 年 4 月开源的旗舰稠密模型，在编程和推理基准上表现卓越，原生 262K 上下文，适合超长文档清洗。


## 四、数据清洗与知识库构建（两阶段流水线）

### 4.1 清洗模型部署（张量并行 TP=4）

利用全部 4 张 RTX PRO 6000 以张量并行方式运行 Qwen3.6-27B BF16：

```bash
docker run -d \
    --name vllm-qwen36 \
    --gpus '"device=0,1,2,3"' \
    -p 8000:8000 \
    -v /path/to/Qwen3.6-27B:/Qwen3.6-27B \
    --shm-size=32gb \
    vllm/vllm-openai:latest \
    --model /Qwen3.6-27B \
    --tensor-parallel-size 4 \
    --max-model-len 262144 \
    --gpu-memory-utilization 0.95
```

4×96GB = 384GB 总显存，Qwen3.6-27B BF16 约需 54GB，单卡安全裕度 ~27-38%。

### 4.2 两阶段清洗流程

采用 **“两遍清洗”** 策略，保证数据质量：

```
原始数据集 (多种格式) ──► 数据准备 ──► 原始语料库 (Parquet)
                                    │
                                    ▼
                         第一遍：深度清洗 ──► 中间数据 (Parquet)
                                    │
                                    ▼
                         第二遍：去重清洗 ──► 最终数据 (Parquet)
```

| 步骤 | 操作 | 处理方式 | 产出 |
|------|------|---------|------|
| **步骤 1** | **数据准备** | **合并多源数据集，格式统一** | **原始语料库 (Parquet)** |
| **步骤 2** | **第一遍清洗** | **深度清洗** | 中间语料库 (Parquet) |
| **步骤 3** | **第二遍清洗** | **去重清洗** | 最终语料库 (Parquet) |

### 4.3 步骤 1：数据准备 → 原始语料库 (Parquet)

| 任务 | 描述 | 处理方式 |
|------|------|---------|
| **数据合并** | 合并 OpenThoughts3-1.2M、Honey-Data-15M、MSAgent-Bench 等数据集 | 自定义脚本 |
| **格式统一** | 统一字段名称、数据类型、格式规范 | 自定义脚本 |
| **Schema 定义** | 定义 Parquet Schema（字段类型、是否可为空等） | PyArrow Schema |
| **质量初筛** | 移除格式错误、字段严重缺失的样本 | 规则过滤 |

**原始语料库 Parquet Schema**：

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `input` | string | 输入指令/问题 |
| `expected_output` | string | 期望输出/答案 |
| `expected_trajectory` | list[struct] | MCTS 搜索轨迹 |
| `knowledge_ops` | list[struct] | 知识操作轨迹 |
| `source` | string | 数据来源（OpenThoughts3/Honey-Data/MSAgent-Bench 等） |
| `task_type` | string | 任务类型（math/code/agent/reasoning 等） |
| `quality_score` | float | 初始质量评分（0-1） |

**代码示例**：

```python
import pyarrow as pa
import pyarrow.parquet as pq
import pandas as pd
from datasets import load_dataset

# 定义 Schema
schema = pa.schema([
    ('input', pa.string()),
    ('expected_output', pa.string()),
    ('expected_trajectory', pa.list_(
        pa.struct([
            ('layer', pa.int32()),
            ('op', pa.string()),
            ('loop', pa.int32())
        ])
    )),
    ('knowledge_ops', pa.list_(
        pa.struct([
            ('step', pa.int32()),
            ('op', pa.string()),
            ('key', pa.string()),
            ('value', pa.string()),
            ('record_id', pa.string())
        ])
    )),
    ('source', pa.string()),
    ('task_type', pa.string()),
    ('quality_score', pa.float64())
])

# 读取多源数据并合并
datasets = []
for source in ['OpenThoughts3', 'Honey-Data', 'MSAgent-Bench']:
    df = load_source_data(source)  # 自定义加载函数
    datasets.append(df)

raw_df = pd.concat(datasets, ignore_index=True)

# 质量初筛
raw_df = raw_df[raw_df['quality_score'] > 0.3]

# 输出为 Parquet
raw_table = pa.Table.from_pandas(raw_df, schema=schema)
pq.write_table(raw_table, 'raw_corpus.parquet', compression='snappy')
```

### 4.4 步骤 2：第一遍深度清洗 → 中间语料库 (Parquet)

| 任务 | 描述 | 处理方式 |
|------|------|---------|
| **数据标准化** | 统一日期、编号等字段格式 | Qwen3.6-27B 指令批量处理 |
| **实体解析** | 识别并归一化同义实体 | Qwen3.6-27B 模式识别 |
| **缺失值补全** | 为缺失字段提供合理填充 | Qwen3.6-27B 上下文推断 |
| **质量评分** | 为每条数据重新生成 0-1 质量分数 | Qwen3.6-27B 质量评估 |
| **格式校验** | 检查数据是否符合预设格式 | 规则 + 模型校验 |

**代码示例**：

```python
import pandas as pd
import pyarrow.parquet as pq

# 读取原始 Parquet
df = pd.read_parquet('raw_corpus.parquet', engine='pyarrow')

# 调用 Qwen3.6-27B API 进行深度清洗
cleaned = []
for idx, row in df.iterrows():
    result = qwen36_deep_clean(row)  # 调用清洗模型
    cleaned.append(result)

# 质量过滤：仅保留 quality_score > 0.5
cleaned_df = pd.DataFrame(cleaned)
cleaned_df = cleaned_df[cleaned_df['quality_score'] > 0.5]

# 输出为中间 Parquet
cleaned_df.to_parquet('intermediate_cleaned.parquet', engine='pyarrow', compression='snappy')
```

### 4.5 步骤 3：第二遍去重清洗 → 最终语料库 (Parquet)

| 任务 | 描述 | 处理方式 |
|------|------|---------|
| **语义去重** | 识别并移除语义重复的样本 | Qwen3.6-27B 相似度判断 |
| **内容去重** | 移除完全相同的样本 | 哈希匹配 |
| **冲突解决** | 处理矛盾或冲突的知识条目 | Qwen3.6-27B 冲突检测 |
| **质量过滤** | 移除质量评分低于阈值的样本 | 阈值过滤 |

**代码示例**：

```python
import pandas as pd

# 读取中间 Parquet
df = pd.read_parquet('intermediate_cleaned.parquet', engine='pyarrow')

# 内容去重（基于 input 和 expected_output 的哈希）
df['content_hash'] = df.apply(
    lambda x: hash(f"{x['input']}{x['expected_output']}"), axis=1
)
df = df.drop_duplicates(subset=['content_hash'])

# 语义去重（使用 Qwen3.6-27B 判断相似度）
deduped = []
for idx, row in df.iterrows():
    if not is_semantic_duplicate(row, deduped):  # 调用模型判断
        deduped.append(row)

# 质量过滤：quality_score > 0.6
final_df = pd.DataFrame(deduped)
final_df = final_df[final_df['quality_score'] > 0.6]

# 输出为最终 Parquet
final_df.to_parquet('final_cleaned.parquet', engine='pyarrow', compression='snappy')
```

### 4.6 清洗输出格式：Parquet

两遍清洗均采用 **Parquet 格式** 存储，选择理由如下：

| 特性 | JSONL | Parquet |
|------|-------|---------|
| 存储方式 | 行式存储（文本） | **列式存储（二进制）** |
| 压缩效率 | 无内置压缩 | **高压缩比，节省 30-70% 空间** |
| 读取性能 | 逐行解析，I/O 密集 | **列式读取，只读所需列** |
| 数据类型 | 无 Schema，需推断 | **自带 Schema，类型安全** |
| 断点续传 | 不支持 | **支持** |
| 过滤下推 | 不支持 | **支持，减少 I/O** |

### 4.7 知识库构建流程（清洗完成后）

| 步骤 | 操作 | 工具/方法 | 产出 |
|------|------|----------|------|
| **1. 数据准备** | 合并多源数据集 | 自定义脚本 | **原始语料库 (Parquet)** |
| **2. 第一遍清洗** | 深度清洗（标准化、实体解析、质量评分） | Qwen3.6-27B (TP=4) | **中间语料库 (Parquet)** |
| **3. 第二遍清洗** | 去重清洗（语义去重 + 内容去重） | Qwen3.6-27B (TP=4) | **最终语料库 (Parquet)** |
| **4. 文本分块** | 分割为 512 tokens，重叠 50 tokens | RecursiveCharacterTextSplitter | 文本块 |
| **5. 向量化** | Qwen3-Embedding 转为向量 | Qwen3-Embedding-4B/8B | 向量 + 文本块 |
| **6. 索引构建** | 存入 LanceDB | LanceDB | LanceDB 知识库 |

### 4.8 清洗质量标准

| 指标 | 目标值 |
|------|--------|
| 数据完整性 | 关键字段缺失率 < 1% |
| 格式一致性 | 格式统一率 > 99% |
| 内容准确性 | 错误率 < 0.5% |
| 去重率 | ≥ 30%（语义去重 + 内容去重） |
| 处理效率 | ≥ 1000 条/分钟（TP=4） |
| 原始 → 最终数据留存率 | 60-70% |


## 五、系统架构设计

### 5.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          系统架构总览                                        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        认知调度器 (MiniMind-3)                      │   │
│  │  ┌─────────────────────────┐  ┌─────────────────────────────────┐  │   │
│  │  │   层调度头              │  │   知识管理头                    │  │   │
│  │  │   ├── layer_head       │  │   ├── op_head (5类)             │  │   │
│  │  │   ├── op_head (3类)    │  │   ├── key_encoder              │  │   │
│  │  │   └── loop_head        │  │   ├── value_encoder            │  │   │
│  │  └─────────────────────────┘  │   └── confidence_head          │  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│              ┌─────────────────────┼─────────────────────┐                  │
│              ▼                     ▼                     ▼                  │
│  ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐        │
│  │   Qwen3.5-9B      │ │   知识融合层      │ │   向量知识库      │        │
│  │   执行器          │ │   (可训练)        │ │   (LanceDB)       │        │
│  │   (完全冻结)      │ │   ┌─────────────┐ │ │   ┌─────────────┐ │        │
│  │   ┌─────────────┐ │ │   │Cross-Attn   │ │ │   │ 向量索引    │ │        │
│  │   │ Layer 0     │ │ │   │   + Gate    │ │ │   │ 元数据      │ │        │
│  │   │ ...         │ │ │   └─────────────┘ │ │   └─────────────┘ │        │
│  │   │ Layer 31    │ │ │                   │ │                   │        │
│  │   └─────────────┘ │ │                   │ │   支持 CRUD:      │        │
│  └───────────────────┘ └───────────────────┘ └───────────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 核心组件代码

```python
# 知识管理头
class KnowledgeManagementHead(nn.Module):
    def __init__(self, hidden_size: int = 768, embed_dim: int = 4096):
        super().__init__()
        self.op_head = nn.Linear(hidden_size, 5)
        self.key_encoder = nn.Sequential(
            nn.Linear(hidden_size, hidden_size * 2),
            nn.GELU(),
            nn.Linear(hidden_size * 2, embed_dim)
        )
        self.value_encoder = nn.Sequential(
            nn.Linear(hidden_size, hidden_size * 2),
            nn.GELU(),
            nn.Linear(hidden_size * 2, embed_dim)
        )
        self.confidence_head = nn.Linear(hidden_size, 1)

# 知识融合层
class KnowledgeFusionLayer(nn.Module):
    def __init__(self, dim: int):
        super().__init__()
        self.cross_attn = nn.MultiheadAttention(dim, num_heads=8)
        self.fusion_gate = nn.Sequential(
            nn.Linear(dim * 2, dim),
            nn.GELU(),
            nn.Linear(dim, 1),
            nn.Sigmoid()
        )
```


## 六、硬件配置与显存估算

### 6.1 核心硬件：4×NVIDIA RTX PRO 6000

| 属性 | 规格 | 说明 |
|------|------|------|
| **显存容量** | **96GB GDDR7**（单卡） | 4 卡共 384GB |
| **显存带宽** | **1792 GB/s** | — |
| **Tensor Core** | **第五代** | FP4/FP8 加速 |
| **FP32 算力** | **125 TFLOPS** | — |
| **接口** | **PCI Express 5.0 16X** | — |

### 6.2 显存估算

| 用途 | 显存需求 | 可用显存 | 硬件配置 |
|------|---------|---------|---------|
| **数据清洗 (TP=4)** | ~60-70 GB/卡 | **96 GB/卡** | 4×RTX PRO 6000 |
| **模型训练 (单卡)** | ~26 GB | **96 GB** | 单张 RTX PRO 6000 |
| **推理部署 (单卡)** | ~26 GB | **96 GB** | 单张 RTX PRO 6000 |

**训练显存详细估算（单卡）** ：

| 组件 | 显存占用 |
|------|---------|
| 执行器 (Qwen3.5-9B, 冻结) | 18 GB |
| 调度器 + 知识管理头 + 融合层 (~99M 可训练) | ~0.20 GB |
| 梯度 + 优化器状态 | ~1.20 GB |
| 激活值 | ~4-6 GB |
| **总计** | **~23-26 GB** |


## 七、训练设计

### 7.1 五阶段渐进式训练策略

| 阶段 | 最大步数 | 核心目标 | 学习率 | 知识操作学习 |
|------|---------|---------|--------|-------------|
| **Stage 0** | 32 | 蒸馏对齐 + 融合层预训练 | 5e-5 | 仅 READ |
| **Stage 1** | 64 | 行为克隆 | 1e-4 | READ + WRITE |
| **Stage 2** | 128 | 中等长度编排 | 8e-5 | READ + WRITE + UPDATE |
| **Stage 3** | 192 | 长程编排 | 5e-5 | 完整 CRUD |
| **Stage 4** | 256 | 强化学习微调 | 3e-5 | 完整 CRUD + 策略优化 |

### 7.2 可训练参数汇总

| 组件 | 参数量 | 训练状态 |
|------|--------|---------|
| 调度器 (MiniMind-3) | 64M | **可训练** |
| 知识管理头 | ~20M | **可训练** |
| 知识融合层 | ~10M | **可训练** |
| 投影层 + 决策头 | ~5M | **可训练** |
| **可训练参数合计** | **~99M** | — |
| 执行器 (Qwen3.5-9B) | 9B | **完全冻结** |

### 7.3 损失函数

```
L_total = L_schedule + L_knowledge + L_fusion + L_attnres
```

| 损失项 | 描述 | 权重 |
|--------|------|------|
| `L_schedule` | 层调度监督损失（交叉熵） | 1.0 |
| `L_knowledge` | 知识操作监督损失（5类分类） | 0.5 |
| `L_knowledge_enc` | 键/值编码重建损失（MSE） | 0.1 |
| `L_fusion` | 知识融合监督损失 | 0.1 |
| `L_attnres` | AttnRes 正则化损失 | 0.1 |

### 7.4 训练启动命令（单卡）

```bash
#!/bin/bash
STAGE=${1:-0}

case $STAGE in
  0) MAX_STEPS=32; LR=5e-5; EPOCHS=4 ;;
  1) MAX_STEPS=64; LR=1e-4; EPOCHS=3 ;;
  2) MAX_STEPS=128; LR=8e-5; EPOCHS=3 ;;
  3) MAX_STEPS=192; LR=5e-5; EPOCHS=3 ;;
  4) MAX_STEPS=256; LR=3e-5; EPOCHS=3 ;;
esac

python train_orchestrator.py \
    --scheduler_model "./models/minimind-3" \
    --executor_model "./models/Qwen3.5-9B" \
    --stage $STAGE \
    --max_steps $MAX_STEPS \
    --learning_rate $LR \
    --num_epochs $EPOCHS \
    --batch_size 8 \
    --grad_accum 4 \
    --bf16 \
    --output_dir "./output_stage${STAGE}"
```


## 八、部署设计

### 8.1 vLLM 推理部署（单卡）

```bash
python -m vllm.entrypoints.openai.api_server \
    --model ./exported_model \
    --tensor-parallel-size 1 \
    --dtype bfloat16 \
    --max-model-len 4096 \
    --port 8000 \
    --host 0.0.0.0 \
    --trust-remote-code
```

### 8.2 LanceDB 部署

```python
import lancedb
db = lancedb.connect("./knowledge_db")
table = db.create_table("knowledge", data, mode="overwrite")
```


## 九、评估指标

| 指标 | 目标值 |
|------|--------|
| 工具调用准确率 | ≥ 90% |
| 推理准确率 (GSM8K) | ≥ 85% |
| READ 操作准确率 | ≥ 80% |
| WRITE 操作正确率 | ≥ 85% |
| 平均编排步数 | < 64 |
| 知识检索延迟 | < 50ms |


## 十、项目里程碑

| 阶段 | 任务 | 硬件 | 周期 |
|------|------|------|------|
| **Phase 0** | **数据清洗 + 知识库构建 + 概念验证** | **4×RTX PRO 6000 (TP=4)** | **1-2周** |
| │ ├── 数据准备（合并 → 原始 Parquet） | 单卡 CPU/GPU | — |
| │ ├── 第一遍清洗（深度清洗 → 中间 Parquet） | 4×RTX PRO 6000 | — |
| │ ├── 第二遍清洗（去重清洗 → 最终 Parquet） | 4×RTX PRO 6000 | — |
| │ ├── 向量化 + LanceDB 索引构建 | 单卡 RTX PRO 6000 | — |
| │ └── 调度器概念验证 (Qwen3.5-9B) | 单卡 RTX PRO 6000 | — |
| Phase 1 | 阶段0蒸馏训练 (K=32) | 单卡 RTX PRO 6000 | 1周 |
| Phase 2 | 阶段1训练 (K=64) + MCTS | 单卡 RTX PRO 6000 | 1.5周 |
| Phase 3 | 阶段2训练 (K=128) | 单卡 RTX PRO 6000 | 1周 |
| Phase 4 | 阶段3训练 (K=192) | 单卡 RTX PRO 6000 | 1周 |
| Phase 5 | 阶段4训练 (K=256) + RL | 单卡 RTX PRO 6000 | 1周 |
| Phase 6 | 模型导出 + vLLM部署 | 单卡 RTX PRO 6000 | 1周 |

**总工期**：约 9.5-10.5 周


## 十一、风险与应对

| 风险 | 概率 | 应对措施 |
|------|------|---------|
| 知识操作决策不收敛 | 中 | MCTS 搜索 + 课程学习 |
| 错误知识写入污染记忆 | 中 | 置信度阈值 + Qwen3.6-27B 两遍清洗校验 |
| 知识误删除 | 中 | 软删除（标记而非物理删除） |
| 向量检索延迟 | 低 | HNSW 索引 + LanceDB 磁盘架构 |
| TP=4 通信开销 | 低 | vLLM 原生支持张量并行 |
| Parquet 读写兼容性 | 低 | 使用标准 PyArrow + Hugging Face Datasets |
| 多源数据合并时 Schema 冲突 | 低 | 统一 Schema 定义 + 字段映射表 |


## 十二、附录

### A. 知识操作指令集

| 操作码 | 操作 | 参数 | 返回值 |
|--------|------|------|--------|
| 0 | NOP | — | — |
| 1 | READ | `query`, `top_k` | `[vectors]`, `[metadata]` |
| 2 | WRITE | `key`, `value`, `metadata` | `record_id` |
| 3 | UPDATE | `record_id`, `new_value`, `new_metadata` | `success` |
| 4 | DELETE | `record_id` | `success` |

### B. 关键参数汇总

| 参数 | 值 |
|------|-----|
| 调度器 | MiniMind-3 (64M) |
| 执行器 | Qwen3.5-9B |
| 数据清洗模型 | Qwen3.6-27B (BF16, TP=4) |
| 嵌入模型 | Qwen3-Embedding-4B/8B |
| 向量数据库 | LanceDB |
| 清洗策略 | **两遍清洗：深度清洗 → 去重清洗** |
| 数据格式 | **Parquet（Schema 统一）** |
| 可训练参数 | ~99M |
| 步数扩展 | 32→64→128→192→256 |
| 最大循环 | 9 |
| **GPU** | **4×NVIDIA RTX PRO 6000 (96GB)** |

### C. Parquet Schema 定义

```python
import pyarrow as pa

schema = pa.schema([
    ('input', pa.string()),
    ('expected_output', pa.string()),
    ('expected_trajectory', pa.list_(
        pa.struct([
            ('layer', pa.int32()),
            ('op', pa.string()),
            ('loop', pa.int32())
        ])
    )),
    ('knowledge_ops', pa.list_(
        pa.struct([
            ('step', pa.int32()),
            ('op', pa.string()),
            ('key', pa.string()),
            ('value', pa.string()),
            ('record_id', pa.string())
        ])
    )),
    ('source', pa.string()),
    ('task_type', pa.string()),
    ('quality_score', pa.float64())
])
```

### D. 参考文献与开源实现

| 技术 | 论文/文档 | 开源实现 |
|------|----------|---------|
| Attention Residuals | arXiv:2603.15031 | [MoonshotAI/Attention-Residuals](https://github.com/MoonshotAI/Attention-Residuals) |
| Qwen3.6-27B | — | [Qwen/Qwen3.6-27B](https://huggingface.co/Qwen) |
| LanceDB | [lancedb.com](https://lancedb.com) | [lancedb/lancedb](https://github.com/lancedb/lancedb) |
| MiniMind-3 | — | [jingyaogong/minimind](https://github.com/jingyaogong/minimind) |
| vLLM | [docs.vllm.ai](https://docs.vllm.ai) | [vllm-project/vllm](https://github.com/vllm-project/vllm) |
| Parquet | [parquet.apache.org](https://parquet.apache.org) | Apache Arrow / PyArrow |


*文档结束*