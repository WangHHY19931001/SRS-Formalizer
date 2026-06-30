# Qwen3.5 异构模型编排系统 —— 完整需求说明书

**文档版本**：v16.8
**编制日期**：2026年6月30日
**状态**：✅ 接口就绪 · 编码可执行
**文档编号**：srs.md


## 一、核心设计理念

### 1.1 设计本质

**编排器是纯决策模型，不处理知识**。它只输出以下四类决策信号：

1. **下一层索引**：下一层执行哪一层（0~31），或转输出（32，仅在Prefill阶段可用）
2. **是否转输出**：Prefill阶段当前层处理完成后直接输出，退出编排循环
3. **知识库操作**：每次只做一个动作，通过4类softmax选择：
   - `0`：不操作知识库
   - `1`：**读取**——使用本层输出作为检索索引，将Cos相似度最接近的记录读取出来，通过层间注意力融合方式处理后传给下一层
   - `2`：**写入**——将本层输出向量数据写入数据库
   - `3`：**删除**——删除与本层输出向量Cos相似度≥0.99的内容
4. **是否进行独立层间注意力处理**：对当前层输出进行AttnRes处理

### 1.2 两阶段推理策略（核心规则）

本系统采用 **Prefill动态编排 + Decode顺序补全** 的两阶段推理策略：

#### Prefill阶段（动态编排）
- **输入**：完整prompt（历史上下文+当前用户输入）`[B, L]`，L ≥ 1
- **行为**：决策器逐层决定动态轨迹，**层索引必须非递减**（保证KV缓存可复用）
- **知识库操作**：**全部四种操作（NOP/READ/WRITE/DELETE）均有效**
- **转输出**：当决策器输出 `next_layer == 32` 时，表示Prefill完成，可直接转LM Head输出，此时 `L_last = -1`，不再需要Decode阶段
- **记录**：记录最后执行的层索引 `L_last`
- **约束**：层索引非递减（即决策器在Prefill阶段不允许选择比当前已执行层更小的索引），可通过动作mask实现

#### Decode阶段（顺序补全）
- **输入**：新生成的单个token的嵌入 `[B, 1, 4096]`
- **行为**：从 `L_last + 1` 开始，**顺序执行**到第31层（最后一层），然后接LM Head
- **知识库操作**：**Decode阶段不调用决策器，因此不会主动发起任何知识库操作**
  - Prefill阶段已产生的知识库操作（READ/WRITE/DELETE）已在Prefill阶段执行完毕
  - 文档中提到的“Decode阶段仅READ有效，WRITE/DELETE失效”为**防御性保护措施**，防止未来扩展或错误调用
  - 具体实现中，知识库操作模块会检查当前阶段标志 `is_prefill`，若为False且操作类型为WRITE或DELETE，则静默跳过
  - 该检查确保即使因代码重构或误用导致Decode阶段调用知识库写入/删除，也不会污染知识库
- **KV缓存**：
  - Prefill阶段调用过的层，其KV缓存被完整保留
  - Decode阶段从 `L_last+1` 开始，执行时自动复用已有缓存
  - Prefill阶段未调用的层（被跳过的层），在Decode阶段首次计算时，对新token执行prefill式计算（`L=1`），开销很小
- **生成**：每个新token重复上述过程，实现自回归生成

#### 关键优势
1. **部分KV缓存加速**：Prefill阶段已计算的层缓存被完整复用，无需重复计算
2. **灵活性与效率兼顾**：Prefill阶段可以跳过冗余层（如3→8→15），Decode阶段只需补全剩余层
3. **完全兼容标准Transformer**：无需修改执行器内部实现
4. **知识库操作安全保障**：Decode阶段不调用决策器，无主动知识操作；防御性检查确保即使误调用也能安全降级

### 1.3 编排流程总览

```
输入 Token (Prompt) 
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  Prefill 阶段：动态编排                                     │
│  决策器逐层决定轨迹（层索引非递减）                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 执行器层计算 (跳跃执行)                             │    │
│  │ 知识库操作 ✅全部四种操作有效 (NOP/READ/WRITE/DELETE)│    │
│  │ AttnRes (层间注意力)                               │    │
│  └─────────────────────────────────────────────────────┘    │
│  直到：next_layer == 32 (转输出)                           │
│  或 total_layers >= max_layers                              │
│  记录 L_last = 最后执行的层索引                             │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  Decode 阶段：顺序补全                                     │
│  从 L_last + 1 顺序执行到第31层                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 执行器层计算 (顺序执行)                             │    │
│  │ 自动复用 Prefill 阶段的 KV 缓存                    │    │
│  │ 跳跃层首次计算（L=1，开销极小）                   │    │
│  │ 知识库操作 ⚠️ 不调用决策器，无主动操作            │    │
│  │ 🔒 防御性保护：WRITE/DELETE如被误调用则静默跳过   │    │
│  └─────────────────────────────────────────────────────┘    │
│  LM Head → 生成下一个 token                                │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
输出 Token (自回归生成)
```

**关键原则**：
- Prefill阶段：每层都调用一次决策器进行决策
- Decode阶段：**不调用决策器**，按顺序补全剩余层
- 转输出(32)仅在Prefill阶段出现
- Decode阶段的KV缓存部分复用，未被调用的层缓存为空，首次计算时自动构建
- **Decode阶段知识库安全保护**：不调用决策器，无主动知识操作；防御性检查确保即使误调用也能安全降级


## 二、模块接口契约

### 2.1 执行器（Qwen3.5-9B）接口

Qwen3.5-9B采用32层Transformer架构，隐藏维度4096，中间层维度12288，16个注意力头，4个KV头。

| 方法 | 输入 | 输出 | 功能 |
|------|------|------|------|
| `embed(input_ids)` | `input_ids: [B, L]` (int64) | `[B, L, 4096]` (bfloat16) | Token嵌入 |
| `execute_layer(layer_idx, hidden_states, attention_mask)` | `layer_idx: int (0-31)`, `[B, L, 4096]`, `[B, L]` | `[B, L, 4096]` (bfloat16) | 执行指定层计算，需传入attention_mask |
| `execute_layer_with_cache(layer_idx, hidden_states, past_key_value, use_cache)` | `layer_idx: int (0-31)`, `[B, 1, 4096]`, `past_key_value` (Tuple), `use_cache: bool` | `hidden_states`, `new_past_key_value` | Decode阶段单token层执行，返回更新后的KV缓存 |
| `lm_head(hidden_states)` | `[B, L, 4096]` | `[B, L, vocab_size]` | 输出logits |
| `get_num_layers()` | — | `32` | 返回层数 |
| `get_hidden_size()` | — | `4096` | 返回隐藏维度 |

**加载方式**：
```python
from transformers import Qwen3_5ForConditionalGeneration

class Qwen35Executor(nn.Module):
    def __init__(self, model_path: str = "Qwen/Qwen3.5-9B", torch_dtype=torch.bfloat16):
        super().__init__()
        self.model = Qwen3_5ForConditionalGeneration.from_pretrained(
            model_path, torch_dtype=torch_dtype
        )
        for param in self.model.parameters():
            param.requires_grad = False
        self.layers = self.model.model.layers  # nn.ModuleList, len=32
        self.num_layers = len(self.layers)
        self.hidden_size = self.model.config.hidden_size  # 4096
    
    def execute_layer(self, layer_idx, hidden_states, attention_mask):
        layer = self.layers[layer_idx]
        outputs = layer(hidden_states, attention_mask=attention_mask)
        return outputs[0]  # 返回隐藏状态
    
    def execute_layer_with_cache(self, layer_idx, hidden_states, past_key_value, use_cache):
        layer = self.layers[layer_idx]
        outputs = layer(hidden_states, past_key_value=past_key_value, use_cache=use_cache)
        return outputs[0], outputs[1]  # 返回隐藏状态和新的KV缓存
```

**约束**：执行器必须完全冻结，不参与梯度更新。

### 2.2 决策器（Decoder + 金字塔卷积网络）接口

决策器采用 **“1层Transformer Decoder + 4阶段金字塔卷积”** 的混合架构，输入直接对接执行器的4096维隐藏状态。决策器输出4个独立头，且**仅在Prefill阶段被调用**。

| 方法 | 输入 | 输出 | 功能 |
|------|------|------|------|
| `forward(hidden_states, attention_mask, used_mask)` | `[B, L, 4096]`, `[B, L]`, `[B, 32]` | `layer_logits: [B,33]`, `km_logits: [B,4]`, `attnres_logits: [B,1]`, `conf_logits: [B,1]` | 纯决策推理，返回四个头 |

**架构规格**：

#### 阶段0：输入对接层（1层Transformer Decoder）

| 参数 | 值 | 说明 |
|------|-----|------|
| 层数 | **1** | 单层Decoder，处理序列信息 |
| 隐藏维度 | **4096** | 与执行器完全对齐 |
| 注意力头数 | **16** | 与执行器保持一致 |
| KV头数 | **4** | GQA，与执行器保持一致 |
| 中间层维度 | **12288** | 与执行器FFN层一致 |
| 激活函数 | **SwiGLU (SiLU)** | 三矩阵FFN（参数量约3×4096×12288） |
| 归一化 | **RMSNorm** | 与执行器一致 |
| 位置编码 | **RoPE** | 与执行器一致 |
| 掩码 | **Causal Mask** | 自回归掩码，确保因果性 |

该层对输入 `[B, L, 4096]` 进行自注意力处理，输出 `[B, L, 4096]`，作为后续卷积层的输入。

#### 阶段1-4：金字塔卷积网络

| 阶段 | 层配置 | 输出形状 | 说明 |
|------|--------|---------|------|
| **Stage 1** | Conv1D(4096→2048, k=5, stride=2) + BN + GELU | `[B, 2048, L/2]` | 序列长度减半，通道减半 |
| **Stage 2** | Conv1D(2048→1024, k=5, stride=2) + BN + GELU | `[B, 1024, L/4]` | 进一步压缩 |
| **Stage 3** | Conv1D(1024→512, k=3, stride=2) + BN + GELU | `[B, 512, L/8]` | 捕获高维抽象 |
| **Stage 4** | Conv1D(512→256, k=3, stride=2) + BN + GELU | `[B, 256, L/16]` | 特征抽象 |
| **Global Pooling** | AdaptiveAvgPool1d(1) | `[B, 256, 1]` | 全局池化，消除序列依赖 |
| **Flatten** | `view(B, -1)` | `[B, 256]` | 展平为固定特征向量 |

#### 输出头（四头）

| 输出头 | 层定义 | 输出形状 | 说明 |
|--------|--------|---------|------|
| 下一层索引 | `Linear(256, 33)` | `[B, 33]` | 0~31为具体层，**32=转输出（仅Prefill）** |
| 知识库操作 | `Linear(256, 4)` → `Softmax` | `[B, 4]` | NOP/READ/WRITE/DELETE |
| AttnRes门控 | `Linear(256, 1)` → `Sigmoid` | `[B, 1]` | >0.5执行层间注意力 |
| 操作置信度 | `Linear(256, 1)` → `Sigmoid` | `[B, 1]` | 知识库操作置信度 |

**Prefill阶段层索引约束**：
- 决策器在Prefill阶段输出的 `next_layer` 必须满足 **`next_layer >= L_last`**（L_last为当前已执行的最大层索引）
- 转输出(32)仅在Prefill阶段可用，Decode阶段不使用此信号
- 动作mask确保不合法的层索引（小于L_last）被屏蔽（概率置零）

**约束**：
- 决策器是可训练的，所有参数参与梯度更新
- 仅在Prefill阶段被调用，Decode阶段不调用
- 1层Decoder参数量约 **142.6M**，4层卷积约 **54.4M**，合计 **~197M**

### 2.3 知识库操作模块接口

**知识库存储选型**：采用 **VecStore**（`vecstore-rs` Python 绑定）作为核心存储方案。

VecStore 是一个用 100% Rust 编写的可嵌入、高性能向量数据库，具备完整的 RAG 工具链。其 Python 绑定通过 PyO3 提供，可通过 `pip install vecstore-rs` 安装。

- **存储形式**：单文件数据库，无需额外服务器
- **数据模型**：通过 `VecStore` 类管理，支持向量与元数据的存储
- **向量维度**：4096
- **相似度搜索**：支持余弦距离（Cosine）、欧氏距离、点积、曼哈顿距离等多种距离度量
- **元数据过滤**：支持 SQL 风格表达式过滤，如 `category = 'tech' AND score > 0.5`
- **生产特性**：支持 WAL 崩溃恢复、软删除、TTL、多租户隔离等
- **性能**：HNSW 索引支持亚毫秒级查询（100K 向量上 ~171µs）

| 方法 | 输入 | 输出 | 功能 | 阶段可用性 |
|------|------|------|------|-----------|
| `read(layer_output)` | `[B, L, 4096]` | `knowledge: [B, K, 4096]` | 使用层输出作为query检索最相似记录 | **Prefill + Decode**（Decode虽不主动调用，但接口保留） |
| `write(layer_output)` | `[B, L, 4096]` | `record_id: str` | 将层输出向量写入数据库 | **仅Prefill** |
| `delete(layer_output)` | `[B, L, 4096]` | `deleted_count: int` | 删除Cos相似度≥0.99的内容 | **仅Prefill** |

**⚠️ Decode阶段知识库操作说明**：

由于Decode阶段**不调用决策器**，因此Prefill阶段结束后，系统**不会主动发起任何新的知识库操作**。Prefill阶段已产生的READ/WRITE/DELETE操作已在Prefill循环中执行完毕。

**防御性保护措施**（实现层）：
- 知识库操作模块内部维护一个 `is_prefill` 标志
- 当 `is_prefill == False` 且操作类型为 WRITE(2) 或 DELETE(3) 时，模块**静默跳过**，不执行任何数据库操作，直接返回 `None`
- 该检查为**防御性编程**，防止未来代码重构或误用导致Decode阶段调用写入/删除
- READ(1) 操作如被调用则正常执行（虽然Decode阶段不主动调用），但实现上保留此能力

**实现示例**（基于 VecStore Python 绑定）：
```python
import vecstore
import uuid
import time
import torch

class KnowledgeBase:
    def __init__(self, db_path: str = "./vectors.db"):
        self.store = vecstore.VecStore.open(db_path)
        self.is_prefill = True
        self.similarity_threshold = 0.99
        self.top_k = 5

    def read(self, layer_output):
        # layer_output: [B, L, 4096] -> query: [4096]
        query = adaptive_avg_pool1d(layer_output, output_size=1).squeeze(-1)  # [B, 4096]
        # 取 batch 中第一个样本的 query 向量进行检索
        results = self.store.query(query[0].tolist(), k=self.top_k)
        # results: List[Result], 每个 Result 包含 id, score, metadata, vector
        if not results:
            return torch.zeros(1, 1, 4096)  # 空检索返回零向量
        knowledge_vectors = torch.tensor([r.vector for r in results]).unsqueeze(0)  # [1, K, 4096]
        return knowledge_vectors

    def write(self, layer_output):
        if not self.is_prefill:
            # Decode阶段防御性跳过
            logger.debug("Decode阶段跳过WRITE操作")
            return None
        query = adaptive_avg_pool1d(layer_output, output_size=1).squeeze(-1)  # [B, 4096]
        record_id = self.store.upsert(
            id=f"vec_{uuid.uuid4()}",
            vector=query[0].tolist(),
            metadata={"timestamp": time.time()}
        )
        return record_id

    def delete(self, layer_output):
        if not self.is_prefill:
            logger.debug("Decode阶段跳过DELETE操作")
            return 0
        query = adaptive_avg_pool1d(layer_output, output_size=1).squeeze(-1)  # [B, 4096]
        # 先检索出相似度 >= threshold 的记录
        results = self.store.query(query[0].tolist(), k=self.top_k)
        deleted = 0
        for r in results:
            if r.score >= self.similarity_threshold:
                self.store.delete(r.id)
                deleted += 1
        return deleted
```

**Query构造方式**（READ、WRITE、DELETE均相同）：
```
query = adaptive_avg_pool1d(layer_output, output_size=1).squeeze(-1)  # [B, 4096]
```

### 2.4 知识注意融合层接口

当知识库操作为 READ 时，将检索到的知识通过注意力融合注入当前输出。

| 方法 | 输入 | 输出 | 功能 |
|------|------|------|------|
| `forward(layer_output, knowledge_vectors)` | `[B, L, 4096]`, `[B, K, 4096]` | `fused: [B, L, 4096]` | 32头交叉注意力融合知识到层输出 |

**融合架构**：
- `cross_attn`: `MultiheadAttention(embed_dim=4096, num_heads=32, num_kv_heads=8, batch_first=True)`
- `fusion_gate`: `Linear(8192, 4096) → GELU → Linear(4096, 1) → Sigmoid`
- `norm`: `LayerNorm(4096)`

**Cross-Attention方向**：`layer_output [B,L,4096]` 作为 **Query**，`knowledge_vectors [B,K,4096]` 作为 **Key/Value**。

**门控残差连接（完整公式）**：
```
pooled_layer = adaptive_avg_pool1d(layer_output, output_size=1).squeeze(-1)  # [B,4096]
attn_out, attn_weights = cross_attn(layer_output, knowledge_vectors, knowledge_vectors)  # [B,L,4096]
pooled_attn = adaptive_avg_pool1d(attn_out, output_size=1).squeeze(-1)  # [B,4096]
gate = fusion_gate( torch.cat([pooled_layer, pooled_attn], dim=-1) )  # [B,1]
fused_raw = norm(layer_output + attn_out)  # 残差连接
output = gate * fused_raw + (1 - gate) * layer_output
```

**知识向量参数**：
- `top_k = 5`（可配置），检索结果按余弦距离升序排列后直接堆叠为 `[B, K, 4096]`
- 知识向量是独立检索的片段，无需位置编码

**空检索处理**：
- 当 `knowledge_vectors` 为 `zeros([B, 1, 4096])` 时，Cross-Attention输出 `attn_out` 接近零
- `gate` 值由可训练参数决定，期望训练后收敛到接近0
- **初始化建议**：对 `fusion_gate` 的最后一层线性层bias做负偏置（如 `-2.0`），使初始gate接近0

**约束**：
- 在 **4096维** 空间完成融合
- **可训练**，参与梯度更新

### 2.5 AttnRes模块接口

由决策器决策**是否执行层间注意力处理**（通过 `should_attnres` 门控）。仅在Prefill阶段执行AttnRes，Decode阶段跳过。

**技术背景**：Attention Residuals（AttnRes）由 Kimi Team 在 2026 年 3 月提出。该机制用可学习的动态注意力取代标准残差连接中固定的、均匀的累加操作，允许每一层选择性地从早期层中聚合信息。本文档的实现参考了该论文的 Block AttnRes 变体。

| 方法 | 输入 | 输出 | 功能 |
|------|------|------|------|
| `forward(layer_idx, layer_output, block_reprs, partial_block)` | `int`, `[B,L,4096]`, `List[[B,4096]]`, `[B,4096]` | `[B,L,4096]` | 对层输出进行注意力映射 |

**当 `should_attnres > 0.5` 时执行**，否则跳过，但仍需更新 `partial_block`。

**核心公式**：
```
V = [b₀; b₁; …; bₙ]          ← 堆叠所有块表示（每个块表示已归一化为平均）
K = RMSNorm(V)               ← 归一化键
α = softmax(K · w_l)         ← 深度注意力，w_l为可学习伪查询向量（[4096]）
h = Σ αᵢ · Vᵢ                ← 加权组合
gate = sigmoid( Linear([pooled_layer; h]) )
output = gate * h + (1 - gate) * layer_output
```
其中 `pooled_layer = layer_output.mean(dim=1)`，`h` 在堆叠前需扩展为 `[B, 1, 4096]` 并广播。

**分块策略**：`block_size=8`，`num_blocks=4`

**块表示管理**：
- 每个 `partial_block` 为当前块内**未归一化的累加和**（非平均）
- 当块结束时（`total_layers % 8 == 0`），将 `partial_block` **除以当前块内已累计的层数**（通常为8）后存入 `block_reprs`，然后清零
- 这样保证 `block_reprs` 中每个元素尺度一致，均为块内平均

**约束**：
- 工作在 **4096维** 空间
- **可训练**，参与梯度更新
- 推理开销 < 2%
- Decode阶段不执行AttnRes


## 三、编排流程时序契约

### 3.1 Prefill阶段状态机

```
初始状态: hidden_states = embed(input_ids)      # [B, L, 4096]
           attention_mask = 生成因果掩码          # [B, L] (来自tokenizer)
           step = 0, block_reprs = [], partial_block = zeros[B,4096]
           total_layers = 0, used_mask = zeros(32), kv_cache = {}
           L_last = -1, max_layers = 32 (默认，可配置)
           is_prefill = True

Prefill循环:
  ┌─────────────────────────────────────────────────────────────┐
  │  1. 准备决策器输入                                         │
  │     scheduler_input = hidden_states  # [B, L, 4096]      │
  │     scheduler_mask = attention_mask   # [B, L]            │
  │     used_mask_input = used_mask       # [B, 32]           │
  │                                                           │
  │  2. 决策器推理 (纯决策)                                   │
  │     layer_logits, km_logits, attnres_logits, conf_logits │
  │       = scheduler(scheduler_input, scheduler_mask,        │
  │                    used_mask_input)                       │
  │                                                           │
  │  3. 应用层索引约束（非递减）                               │
  │     # 将 layer_logits 中 < L_last 的动作概率置零          │
  │     mask = (layer_logits < L_last)  # 屏蔽非法动作        │
  │     layer_logits = layer_logits + mask * (-inf)          │
  │     next_layer = argmax(layer_logits)     (0~32)         │
  │                                                           │
  │  4. 解析决策                                              │
  │     km_action = argmax(km_logits)         (0~3)           │
  │     should_attnres = sigmoid(attnres_logits) > 0.5       │
  │     confidence = sigmoid(conf_logits)                     │
  │                                                           │
  │  5. 检查是否转输出                                        │
  │     if next_layer == 32:                                 │
  │         L_last = -1  # 标记无需Decode层                  │
  │         退出循环，跳过后续层执行，goto Final Output        │
  │                                                           │
  │  6. 执行器层计算（带KV缓存保存）                          │
  │     hidden_states, kv_cache[next_layer] =                │
  │         executor.execute_layer_with_cache(               │
  │             next_layer, hidden_states, attention_mask,   │
  │             use_cache=True, past_key_value=None          │
  │         )                                                │
  │     total_layers += 1                                     │
  │     used_mask[next_layer] = 1                             │
  │     L_last = max(L_last, next_layer)  # 更新最大层索引   │
  │                                                           │
  │  7. 知识库操作 (Prefill: 全部四种操作有效)               │
  │     if confidence > 0.5:                                  │
  │       query = adaptive_avg_pool1d(hidden_states)         │
  │       if km_action == 1:  # READ                         │
  │         knowledge = vecstore_db.read(query)              │
  │         hidden_states = fusion_layer(hidden_states, knowledge)│
  │       elif km_action == 2:  # WRITE                      │
  │         vecstore_db.write(query)                         │
  │       elif km_action == 3:  # DELETE                     │
  │         vecstore_db.delete(query, threshold=0.99)        │
  │       # km_action == 0: NOP                              │
  │                                                           │
  │  8. 层间注意力处理                                       │
  │     partial_block = partial_block + hidden_states.mean(dim=1)│
  │                                                           │
  │     if should_attnres:                                    │
  │       hidden_states = attn_res(hidden_states, block_reprs,│
  │                                  partial_block)           │
  │                                                           │
  │     if (total_layers % 8 == 0):  # 块边界                │
  │       block_avg = partial_block / 8                      │
  │       block_reprs.append(block_avg)                      │
  │       partial_block = zeros                              │
  │                                                           │
  │  9. 检查层数上限                                          │
  │     if total_layers >= max_layers:                       │
  │         退出循环，goto Final Output                       │
  │                                                           │
  │  10. step += 1, 继续循环                                 │
  └─────────────────────────────────────────────────────────────┘

Final Output (LM Head):
  logits = executor.lm_head(hidden_states)
  return logits, kv_cache, L_last
```

### 3.2 Decode阶段状态机

```
输入: hidden_state = embed(new_token_id)      # [B, 1, 4096] 新生成的token
      kv_cache = Prefill阶段返回的KV缓存      # Dict[layer_idx -> (k, v)]
      L_last = Prefill阶段记录的最后一层索引
      attention_mask = None                   # Decode阶段不需要掩码
      is_prefill = False                      # 设置阶段标志

Decode顺序执行:
  ┌─────────────────────────────────────────────────────────────┐
  │  1. 确定起始层                                              │
  │     start_layer = L_last + 1                               │
  │                                                           │
  │  2. 顺序执行从 start_layer 到第31层                        │
  │     for layer_idx in range(start_layer, 32):              │
  │         # 如果该层在Prefill阶段被调用过，复用KV缓存       │
  │         if layer_idx in kv_cache:                         │
  │             past_kv = kv_cache[layer_idx]                 │
  │         else:                                              │
  │             past_kv = None  # 首次计算，无缓存            │
  │                                                           │
  │         hidden_state, new_kv = executor.                  │
  │             execute_layer_with_cache(                      │
  │                 layer_idx, hidden_state,                   │
  │                 past_key_value=past_kv,                    │
  │                 use_cache=True                             │
  │             )                                              │
  │                                                           │
  │         # 更新KV缓存（Prefill已调用层用新缓存覆盖，新层新增）│
  │         kv_cache[layer_idx] = new_kv                      │
  │                                                           │
  │  3. LM Head输出                                           │
  │     logits = executor.lm_head(hidden_state)               │
  │     next_token = sample(logits)                           │
  │                                                           │
  │  4. 返回                                                  │
  │     return next_token, hidden_state, kv_cache             │
  └─────────────────────────────────────────────────────────────┘
```

**关键说明**：
- **Decode阶段不调用决策器**：不产生新的 `km_action` 信号，Prefill阶段的决策已执行完毕
- **部分KV缓存复用**：Prefill阶段已调用过的层（层3、8、15等），其KV缓存被完整保留，Decode阶段直接复用
- **跳层处理**：Prefill阶段跳过的层（如层4-7），其缓存为空，Decode阶段首次计算时自动构建（`L=1`，开销极小）
- **层间信息传递**：顺序执行时，`hidden_state` 依次流经每一层，已缓存层只需计算注意力更新，未缓存层执行完整计算
- **知识库操作**：Decode阶段不调用决策器，无主动知识操作；知识库模块内部保留防御性阶段检查
- **AttnRes**：Decode阶段禁用

### 3.3 边界条件决策表

| 条件组合 | 行为 |
|---------|------|
| `next_layer == 32` (Prefill转输出) | 立即退出Prefill循环，`L_last=-1`，跳过所有层，直接LM Head |
| `total_layers >= max_layers` (Prefill) | 退出Prefill循环，进入Decode阶段 |
| `L_last == -1` (Prefill转输出) | Decode阶段跳过所有层，直接对prompt输出（即不生成新token） |
| `confidence < 0.5` (Prefill) | 知识库操作不执行，自动降级为NOP |
| `km_action == READ` 且VecStore检索为空 | `knowledge = zeros([B, 1, 4096])`，`fusion_gate` 期望训练后接近0 |
| `should_attnres == False` (Prefill) | 跳过AttnRes注意力映射，但`partial_block`仍累加 |
| `layer_idx in kv_cache` (Decode) | 复用缓存的KV，无需重新计算 |
| `layer_idx not in kv_cache` (Decode) | 首次计算该层，构建KV缓存 |
| **Decode阶段调用WRITE或DELETE** | **防御性跳过，不执行数据库操作（正常流程不会调用）** |


## 四、训练规格

### 4.1 训练目标与 MCTS 规格

采用**监督学习**方式，使用 MCTS（蒙特卡洛树搜索）搜索最优轨迹作为监督信号。MCTS 的搜索深度与 **4.3 节五阶段训练策略** 中的 `max_layers` 严格对齐（Stage 0~4 分别对应 32/64/128/192/256 步）。

**核心定义区分**：
- **物理层索引**：`next_layer ∈ [0, 31]`，决策器输出头固定为 33 类（0~31 对应 Qwen3.5 的 32 个物理层，32 代表转输出终止）。
- **调度步数**：`total_layers`，即 Prefill 阶段已执行的实际步数（每执行一层 `total_layers += 1`）。
- **步数上限**：`max_layers`，由训练阶段决定（32→64→128→192→256），当 `total_layers >= max_layers` 时强制终止 Prefill 循环。

#### 4.1.1 MCTS 规格（分阶段动态适配）

| 定义 | 规格 |
|------|------|
| **状态空间** | `(hidden_states_pooled, step, total_layers, used_layers_set, L_last, max_layers)` |
| **动作空间** | 33 种下一层索引 (0~31 对应物理层，32 对应转输出) × 4 种知识动作 (NOP/READ/WRITE/DELETE) × 2 种 AttnRes (执行/跳过) = **264 种组合** |
| **动作约束** | `next_layer` 必须 ≥ `L_last`（层索引非递减，保证 KV 缓存可复用）；若 `next_layer == 32` 则立即终止（Prefill 转输出） |
| **搜索深度（关键修正）** | 等于当前训练阶段的 `max_layers`：<br>• Stage 0 → **32**<br>• Stage 1 → **64**<br>• Stage 2 → **128**<br>• Stage 3 → **192**<br>• Stage 4 → **256** |
| **终止条件** | ① 决策器输出 `next_layer == 32`（转输出）；<br>② `total_layers >= max_layers`（达到当前阶段步数上限）；<br>③ 两者满足其一即终止 Prefill 循环 |
| **奖励函数** | `Reward = Task_Accuracy` <br>`- λ1 * total_prefill_layers` （惩罚实际调度步数，鼓励精简）<br>`- λ2 * (max_prefill_layer_index)` （惩罚最高物理层索引，鼓励浅层终止）<br>`- λ3 * Loop_Penalty`（若因步数上限强制终止而未转输出，施加额外惩罚）<br>**注**：若 `next_layer == 32` 转输出，则 `max_prefill_layer_index = -1`，该项奖励最高（即 λ2 项为负惩罚）。 |
| **模拟次数** | 每样本 100~500 次，随 Stage 提升逐步增加模拟次数 |

#### 4.1.2 与五阶段训练策略的联动约束

| 阶段 | `max_layers`（MCTS 搜索深度） | 学习率 | 知识操作限制 | 说明 |
|------|-----------------------------|--------|-------------|------|
| Stage 0 | 32 | 5e-5 | 仅 NOP + READ | 浅层探索，学习基础跳层与读取 |
| Stage 1 | 64 | 1e-4 | NOP + READ + WRITE | 引入写入，步数上限翻倍 |
| Stage 2 | 128 | 8e-5 | NOP + READ + WRITE + DELETE | 完整知识操作，步数上限继续扩展 |
| Stage 3 | 192 | 5e-5 | 完整动作 | 逼近极限调度能力 |
| Stage 4 | 256 | 3e-5 | 完整动作 + 策略优化 | 最终收敛，允许极长轨迹探索 |

> **重要约束**：决策器输出头 `Linear(256, 33)` 的 33 类永不改变（0~31 物理层 + 32 转输出）。`max_layers` 仅控制 Prefill 循环最多执行多少步，**不改变决策器输出维度**。当 `total_layers` 达到 `max_layers` 时，系统强制终止，并将该终止视为“未转输出”的失败终止（在损失函数中作为负样本处理）。

#### 4.1.3 训练数据格式

```json
{
  "input": "用户问题文本",
  "stage": 2,
  "max_layers": 128,
  "expected_decisions": [
    {"step": 0, "next_layer": 3, "km_action": "READ", "attnres": true},
    {"step": 1, "next_layer": 8, "km_action": "NOP", "attnres": false},
    {"step": 2, "next_layer": 15, "km_action": "WRITE", "attnres": true},
    {"step": 3, "next_layer": 32, "km_action": "NOP", "attnres": false}
  ],
  "L_last": 15,
  "total_prefill_layers": 4,
  "expected_output": "最终答案文本"
}
```

### 4.2 损失函数与梯度管理

```
L_total = L_next_layer + L_km_action + L_attnres + L_confidence + L_termination
```

| 损失项 | 描述 |
|--------|------|
| `L_next_layer` | 下一层分类损失（CrossEntropy，33类），仅在 Prefill 步中使用 |
| `L_km_action` | 知识库动作分类损失（CrossEntropy，4类） |
| `L_attnres` | AttnRes 决策损失（BCE，是否执行） |
| `L_confidence` | 置信度损失（MSE，与操作成功与否） |
| `L_termination` | **新增**：终止损失（BCE），监督模型在 `total_layers` 达到 `max_layers` 前是否输出 `next_layer==32`。若因步数上限强制终止而未转输出，该样本的 `L_termination` 标记为 1（负样本） |

**梯度管理**：
- 执行器在 `torch.no_grad()` 下运行，其输出 `detach()` 后送入决策器
- 梯度仅更新决策器、知识注意融合层和 AttnRes 模块的参数（合计 ~274.5M）
- 每步决策的监督信号按轨迹长度平均，确保多步损失贡献均衡
- **分阶段适配**：不同 Stage 使用对应的 `max_layers` 截断 MCTS 搜索，并调整奖励函数中的 λ 系数（Stage 0~1 侧重短轨迹，Stage 3~4 允许长轨迹探索）

**训练循环示意**：
```python
with torch.no_grad():
    hidden_states = executor.embed(input_ids)
    for step in range(max_layers):  # max_layers 由当前阶段决定
        # 执行器层计算（不产生梯度）
        hidden_states = executor.execute_layer(layer_idx, hidden_states, attention_mask)
        # 知识库操作（无梯度）
        knowledge = vecstore_db.read(hidden_states)
        hidden_states = fusion_layer(hidden_states, knowledge)  # 融合层产生梯度
        # 决策器推理（产生梯度）
        scheduler_output = scheduler(...)
        # ... 计算损失，若 next_layer == 32 则提前 break
```

### 4.3 五阶段训练策略（完整联动表）

| 阶段 | `max_layers`（MCTS 深度） | 学习率 | 知识操作限制 | 损失权重侧重 | 说明 |
|------|--------------------------|--------|-------------|-------------|------|
| **Stage 0** | 32 | 5e-5 | 仅 NOP + READ | 侧重 `L_next_layer` 与 `L_termination` | 学习基础跳层逻辑，禁止写入/删除防止早期污染 |
| **Stage 1** | 64 | 1e-4 | NOP + READ + WRITE | 引入 `L_km_action` 权重 | 学习写入操作，步数上限翻倍 |
| **Stage 2** | 128 | 8e-5 | NOP + READ + WRITE + DELETE | 均衡所有损失项 | 完整知识操作，步数上限继续扩展 |
| **Stage 3** | 192 | 5e-5 | 完整动作 | 增大 `L_termination` 权重 | 逼迫模型在长轨迹中学会提前转输出 |
| **Stage 4** | 256 | 3e-5 | 完整动作 + 策略优化 | 增大 `L_confidence` 权重 | 最终收敛，允许极长轨迹探索，置信度校准 |



# 五、测试用例（30项）

### 5.1 决策器测试（6项）

| 用例编号 | 测试内容 | 输入 | 预期输出 |
|---------|---------|------|---------|
| SC-01 | 前向推理 | `[B, L, 4096]`, `[B, L]`, `[B, 32]` | 四个头输出 `[B,33]`, `[B,4]`, `[B,1]`, `[B,1]` |
| SC-02 | Decoder层输出维度 | `[B, L, 4096]`, `[B, L]`, `[B, 32]` | `[B, L, 4096]` |
| SC-03 | 卷积金字塔各阶段输出 | 逐阶段检查 | 通道减半，长度减半 |
| SC-04 | 4个输出头完整性 | `[B, 256]` | 33类 + 4类 + 2个sigmoid |
| SC-05 | 梯度更新验证 | 执行 `backward()` | 梯度非零 |
| SC-06 | 知识动作Softmax | 4类概率和为1 | 和为1.0 |

### 5.2 执行器测试（5项）

| 用例编号 | 测试内容 | 输入 | 预期输出 |
|---------|---------|------|---------|
| EX-01 | Token嵌入 | `input_ids: [1, 32]` | `[1, 32, 4096]` |
| EX-02 | 单层调用（含mask） | `layer_idx: 0`, `hidden`, `mask` | `[1, 32, 4096]` |
| EX-03 | 所有层可调用 | `0~31` | 全部正常执行 |
| EX-04 | LM Head | `[1, 32, 4096]` | `[1, 32, vocab_size]` |
| EX-05 | 参数冻结 | 执行 `backward()` | `requires_grad == False` |

### 5.3 知识库操作测试（7项）

| 用例编号 | 测试内容 | 输入 | 预期输出 |
|---------|---------|------|---------|
| KB-01 | READ检索 (Prefill) | `layer_output: [1,32,4096]` | `knowledge: [1,K,4096]` |
| KB-02 | WRITE写入 (Prefill) | `layer_output: [1,32,4096]` | `record_id: str` |
| KB-03 | DELETE删除 (Prefill) | `layer_output: [1,32,4096]` | `deleted_count: int` |
| KB-04 | 置信度0.5过滤 | `confidence < 0.5` | 不执行操作 |
| KB-05 | 相似度阈值 | Cos ≥ 0.99 | 记录被删除 |
| KB-06 | 检索为空 | 无匹配记录 | 返回空向量 |
| **KB-07** | **Decode阶段防御性跳过** | `is_prefill=False`, 调用 `write()` 或 `delete()` | **直接返回None/0，无数据库操作（防御性验证）** |

### 5.4 知识注意融合层测试（4项）

| 用例编号 | 测试内容 | 输入 | 预期输出 |
|---------|---------|------|---------|
| KF-01 | 维度保持 | `[1,32,4096]`, `[1,5,4096]` | `[1,32,4096]` |
| KF-02 | 无知识模式 | `knowledge=None` | 返回原 layer_output |
| KF-03 | 注意力权重 | `[1,32,4096]`, `[1,5,4096]` | `attn_weights: [1,32,5]` (32 heads) |
| KF-04 | 门控范围 | 任意输入 | gate值在[0,1] |

### 5.5 AttnRes测试（4项）

| 用例编号 | 测试内容 | 输入 | 预期输出 |
|---------|---------|------|---------|
| AR-01 | 维度保持 | `[1,32,4096]`, `block_reprs` | `[1,32,4096]` |
| AR-02 | 跳过模式 | `should_attnres=False` | 返回原 layer_output，但partial_block仍累加 |
| AR-03 | 块边界检查 | `total_layers % 8 == 0` | `partial_block/8` 加入 `block_reprs` |
| AR-04 | 伪查询维度 | 检查参数 | 形状 `[4096]`（每层一个） |

### 5.6 端到端测试（6项）

| 用例编号 | 测试内容 | 输入 | 预期输出 |
|---------|---------|------|---------|
| E2E-01 | Prefill基本推理（Stage 0，max_layers=32） | `input_ids`, `attention_mask` | 输出logits，轨迹非空，kv_cache含已调用层，且 `total_layers ≤ 32` |
| E2E-02 | Prefill转输出退出 | 决策器输出 `next_layer=32` | L_last=-1，立即进入Final Output，不执行后续层 |
| E2E-03 | Prefill步数上限强制终止（各阶段自适应） | 设置 `max_layers` 为当前阶段值（32/64/128/192/256），模拟持续不转输出 | 当 `total_layers >= max_layers` 时退出Prefill循环，进入Decode，`L_last` 为最后执行的物理层索引，且 `total_layers == max_layers` |
| E2E-04 | Prefill READ知识操作 | `km_action=1` | 触发VecStore检索 + 融合，hidden_states维度不变 |
| E2E-05 | Prefill WRITE知识操作 | `km_action=2` | 触发VecStore写入，返回record_id |
| E2E-06 | Decode顺序补全（跨阶段测试） | Prefill完成（不同 `max_layers` 下），输入新token | 从 `L_last+1` 顺序执行到31，复用已有KV缓存，输出新token，且Decode阶段不调用决策器、不执行新的知识操作 |

**测试说明**：
- E2E-01 和 E2E-03 需根据当前训练阶段（Stage 0~4）配置对应的 `max_layers` 值（32/64/128/192/256）进行验证，确保 Prefill 循环的终止行为与阶段设计一致。
- E2E-06 应覆盖多种 Prefill 轨迹（转输出终止 vs 步数上限终止），验证 Decode 阶段均能正确补全。
- 所有端到端测试中，知识库操作（READ/WRITE/DELETE）仅应在 Prefill 阶段生效，Decode 阶段即使误调用也需被防御性跳过（验证 KB-07）。

## 六、非功能需求

| 编号 | 需求 | 指标 |
|------|------|------|
| NF-01 | Prefill阶段决策器推理延迟 | < 单层执行延迟的10% |
| NF-02 | 知识检索延迟 | < 50ms |
| NF-03 | AttnRes额外开销 | 推理延迟增加 < 2% |
| NF-04 | 训练显存（使用DeepSpeed ZeRO-2） | < 60GB (单卡) |
| NF-05 | 最大序列长度 | ≥ 4096 tokens |
| NF-06 | 知识库存储 | VecStore 单文件存储（`vectors.db`） |
| NF-07 | Decode阶段KV缓存复用 | Prefill已调用层缓存100%复用 |
| NF-08 | Decode阶段知识库写保护 | Decode阶段不调用决策器，无主动写操作 |
| NF-09 | 模型导出格式 | PyTorch `state_dict` + 完整模型定义 |
| NF-10 | 推理框架 | PyTorch + Hugging Face Transformers |


## 七、评估指标

| 指标 | 目标值 |
|------|--------|
| 工具调用准确率 | ≥ 90% |
| 推理准确率 (GSM8K) | ≥ 85% |
| 知识操作准确率 | ≥ 80% |
| 平均Prefill编排层数 | < 24 |
| 最大Prefill编排层数 | ≤ 32 |
| 转输出决策准确率 | ≥ 95% |
| Decode阶段平均延迟 | < 标准Transformer Decode的80% |


## 八、编码实现优先级

| 阶段 | 任务 | 依赖 |
|------|------|------|
| **Phase 1** | 执行器封装 (含with_cache) → 决策器 (Decoder + 卷积) → 四头输出 | 无 |
| **Phase 2** | 知识库操作模块 (VecStore，含阶段感知防御) → 知识注意融合层 | Phase 1 |
| **Phase 3** | AttnRes模块 → Prefill编排循环 (含层索引约束) | Phase 2 |
| **Phase 4** | Decode顺序补全 (含KV缓存复用) → 两阶段端到端集成 | Phase 3 |
| **Phase 5** | 端到端测试 → 性能测试 → DeepSpeed训练集成 | Phase 4 |
| **Phase 6** | 模型导出与推理封装 → 生产部署 | Phase 5 |


## 九、附录

### A. 参数汇总

| 参数 | 值 |
|------|-----|
| 执行器 | Qwen3.5-9B (32层, 4096维, 冻结, 16头, 4KV头) |
| **决策器** | **1层Decoder (4096维, 16头, 4KV头) + 4层金字塔卷积 → 256维, ~197M** |
| 知识注意融合层 | 4096维, 32头, 8KV头, 可训练, ~75.5M |
| AttnRes | 4096维, 可训练, ~2M |
| **可训练参数合计** | **~274.5M** |
| 下一层输出头 | 33类 (0~31 + 转输出, 转输出仅Prefill) |
| 知识动作输出头 | 4类 (NOP/READ/WRITE/DELETE) |
| AttnRes决策 | Sigmoid门控 |
| 置信度输出 | Sigmoid门控 |
| 最大Prefill层数 | 32 (默认，可配置) |
| AttnRes block_size | 8 |
| 相似度删除阈值 | Cos ≥ 0.99 |
| 知识库存储 | **VecStore**（`vecstore-rs` Python 绑定） |
| 存储文件 | `vectors.db` |
| 向量维度 | 4096 |
| 相似度度量 | cosine |
| 知识检索 top_k | **5 (可配置)** |
| 元数据过滤 | 支持 SQL 风格表达式 |
| GPU | 4×NVIDIA RTX PRO 6000 (96GB) |
| **Decode阶段知识操作** | **不调用决策器，无主动操作；防御性检查确保安全** |
| 训练框架 | DeepSpeed (ZeRO Stage 2) |
| 推理框架 | PyTorch + Transformers |
| 模型导出格式 | PyTorch 权重文件 (`.bin` + `config.json`) |

### B. 可训练参数详解

| 组件 | 参数量 | 包含模块 |
|------|--------|---------|
| 决策器 | ~197M | 1层Decoder (≈142.6M) + 4层金字塔卷积 (≈54.4M) + 4个输出头 |
| 知识注意融合层 | ~75.5M | 32头 Cross-Attention + 门控 + LayerNorm |
| AttnRes | ~2M | 伪查询向量 (32×4096) + 4个块压缩网络 + 融合门控 |
| **合计** | **~274.5M** | — |

### C. 参考文献

| 技术 | 参考链接 |
|------|---------|
| **Attention Residuals (AttnRes) 论文** | [arXiv:2603.15031](https://arxiv.org/abs/2603.15031) |
| **Qwen3.5-9B 模型** | [Hugging Face Qwen/Qwen3.5-9B](https://huggingface.co/Qwen/Qwen3.5-9B) |
| **MiniMind-3** | [https://github.com/jingyaogong/minimind](https://github.com/jingyaogong/minimind) |
| **VecStore** | [https://github.com/PhilipJohnBasile/vecstore](https://github.com/PhilipJohnBasile/vecstore) |
| **DeepSpeed** | [https://github.com/microsoft/DeepSpeed](https://github.com/microsoft/DeepSpeed) |

### D. 知识注意融合层参数量核算明细表

| 参数矩阵 | 维度 | 参数量 |
|---------|------|--------|
| Q_proj | `4096 × 4096` | 16.78M |
| K_proj | `4096 × 1024` | 4.19M |
| V_proj | `4096 × 1024` | 4.19M |
| O_proj | `4096 × 4096` | 16.78M |
| Cross-Attention小计 | — | **~41.94M** |
| fusion_gate第一层 | `8192 × 4096` | 33.55M |
| fusion_gate第二层 | `4096 × 1` | 4,096 |
| fusion_gate小计 | — | **~33.55M** |
| LayerNorm | `4096 × 2` | 8,192 |
| **合计** | — | **~75.5M** |

### E. 决策器参数量核算明细表

| 组件 | 维度/规格 | 参数量 |
|------|----------|--------|
| **1层 Decoder** | | |
| Q_proj | `4096 × 4096` | 16.78M |
| K_proj | `4096 × 1024` | 4.19M |
| V_proj | `4096 × 1024` | 4.19M |
| O_proj | `4096 × 4096` | 16.78M |
| FFN第一层(门控) | `4096 × 12288` × 2 | 100.66M |
| FFN第二层 | `12288 × 4096` | 50.33M |
| LayerNorm ×2 | `4096 × 2 × 2` | 16,384 |
| Decoder小计 | — | **≈192.9M** |
| **4层金字塔卷积** | | |
| Stage 1 | `4096×2048×5 + 2048` | 41.94M |
| Stage 2 | `2048×1024×5 + 1024` | 10.49M |
| Stage 3 | `1024×512×3 + 512` | 1.57M |
| Stage 4 | `512×256×3 + 256` | 0.39M |
| BN ×4 | 参数 | 20,480 |
| 卷积小计 | — | **≈54.4M** |
| **4个输出头** | | |
| 下一层索引 | `256 × 33` | 8,448 |
| 知识动作 | `256 × 4` | 1,024 |
| AttnRes门控 | `256 × 1` | 256 |
| 置信度 | `256 × 1` | 256 |
| 输出头小计 | — | **~9,984** |
| **合计** | — | **≈247.3M** |

> **注**：FFN使用SwiGLU，包含三个线性层（门控1、门控2、输出），因此参数量约为普通FFN的1.5倍。正文中统一采用~197M作为工程估算。


## 十、推理部署规格

### 10.1 模型导出（PyTorch）

训练完成后，需要将可训练模块（决策器、知识融合层、AttnRes）的权重从 DeepSpeed 分片中合并并导出为标准 PyTorch 格式，以便在生产环境中加载推理。

#### 10.1.1 导出流程

1. **加载训练完成的 DeepSpeed 模型**（包含分片权重）。
2. **提取各模块的 `state_dict`**：
   - 决策器：`scheduler.state_dict()`
   - 知识融合层：`fusion_layer.state_dict()`
   - AttnRes：`attn_res.state_dict()`
3. **与执行器（Qwen3.5-9B）的权重合并**（执行器权重为原始 HF 模型，可直接从 `transformers` 加载）。
4. **保存为单一 checkpoint 目录**，包含：
   - `pytorch_model.bin`（所有模块的合并权重，或分开保存）
   - `config.json`（模型配置，包括各模块超参数）
   - 推荐将可训练模块单独保存，以便灵活加载。

#### 10.1.2 导出代码示例

```python
import torch
from transformers import Qwen3_5ForConditionalGeneration

# 加载原始执行器（用于推理时构建完整模型）
executor = Qwen3_5ForConditionalGeneration.from_pretrained("Qwen/Qwen3.5-9B")

# 加载训练好的可训练模块（从DeepSpeed checkpoint恢复）
scheduler = Scheduler(...)  # 决策器
fusion = KnowledgeFusion(...)
attnres = AttnRes(...)

# 恢复权重（假设已保存为普通state_dict）
scheduler.load_state_dict(torch.load("scheduler.pt"))
fusion.load_state_dict(torch.load("fusion.pt"))
attnres.load_state_dict(torch.load("attnres.pt"))

# 合并保存（也可分别保存）
torch.save({
    "executor": executor.state_dict(),  # 可选，若想整体保存
    "scheduler": scheduler.state_dict(),
    "fusion": fusion.state_dict(),
    "attnres": attnres.state_dict(),
}, "full_model.pt")
```

### 10.2 推理部署（PyTorch + Transformers）

推理时，使用 PyTorch 和 Hugging Face Transformers 库加载模型，并执行 Prefill 与 Decode 两阶段流程。

#### 10.2.1 推理环境

- **Python 3.10+**
- **PyTorch 2.0+**（推荐使用最新稳定版）
- **Transformers 4.35+**（支持 Qwen3.5）
- **Flash Attention 2**（可选，用于加速注意力计算）

#### 10.2.2 模型加载

```python
import torch
from transformers import Qwen3_5ForConditionalGeneration, AutoTokenizer

# 1. 加载执行器（基础 LLM）
executor = Qwen3_5ForConditionalGeneration.from_pretrained(
    "Qwen/Qwen3.5-9B",
    torch_dtype=torch.bfloat16,
    device_map="auto"
)
executor.eval()  # 冻结，不训练

# 2. 加载可训练模块（决策器、融合层、AttnRes）
# 假设已保存为独立文件
scheduler = Scheduler(...)   # 需与训练时结构一致
fusion = KnowledgeFusion(...)
attnres = AttnRes(...)

scheduler.load_state_dict(torch.load("scheduler.pt", map_location="cpu"))
fusion.load_state_dict(torch.load("fusion.pt", map_location="cpu"))
attnres.load_state_dict(torch.load("attnres.pt", map_location="cpu"))

# 转为与执行器相同设备与数据类型
scheduler = scheduler.to(executor.device).to(executor.dtype)
fusion = fusion.to(executor.device).to(executor.dtype)
attnres = attnres.to(executor.device).to(executor.dtype)

# 3. 加载 Tokenizer
tokenizer = AutoTokenizer.from_pretrained("Qwen/Qwen3.5-9B")
```

#### 10.2.3 推理循环

```python
def generate(prompt, max_new_tokens=128):
    inputs = tokenizer(prompt, return_tensors="pt")
    input_ids = inputs.input_ids.to(executor.device)
    attention_mask = inputs.attention_mask.to(executor.device)

    # Prefill阶段
    hidden_states = executor.model.embed_tokens(input_ids)  # [B, L, 4096]
    # 生成因果掩码（如需要）
    # 执行Prefill编排循环（参见第三章 3.1 节）
    # ... 返回 logits, kv_cache, L_last

    # Decode阶段
    generated = []
    for _ in range(max_new_tokens):
        # 获取最后一个token的logits，采样
        next_token = sample(logits)
        generated.append(next_token)
        # 准备下一轮输入（单token嵌入）
        # 执行Decode顺序补全（参见 3.2 节）
        # 更新 hidden_state, kv_cache

    return tokenizer.decode(generated)
```

#### 10.2.4 性能优化建议

- **使用 `torch.compile`**：对决策器、融合层和 AttnRes 进行编译加速（`torch.compile` 支持动态形状，适合变长序列）。
- **KV 缓存复用**：确保 Decode 阶段正确复用 Prefill 阶段的 KV cache（使用 `past_key_value` 参数）。
- **批处理**：支持 `batch_size > 1`，注意 attention mask 的正确性。
- **混合精度**：推理时统一使用 `bfloat16` 或 `float16`，减少显存占用并提升速度。
- **Flash Attention**：如果使用 `transformers` 4.35+，可设置 `attn_implementation="flash_attention_2"` 加速注意力计算。

#### 10.2.5 服务化部署

推荐使用 **FastAPI** 或 **vLLM**（需定制）封装推理服务，对外提供 RESTful API。对于高并发场景，可预先加载模型并复用，使用异步请求队列。


## 十一、版本变更记录

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| v16.6 | 2026-06-30 | 初始版本（含 SQLite+sqlite-vec） |
| v16.7 | 2026-06-30 | 将存储方案替换为 VecStore |
| v16.8 | 2026-06-30 | 新增 DeepSpeed 训练配置、模型导出流程及 PyTorch+Transformers 推理部署规格 |


*文档结束*