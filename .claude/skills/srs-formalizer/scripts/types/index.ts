// === JSONL 基础记录类型 ===
/**
 * 三态 provenance（守 Inversion 铁律）：
 * - `explicit-located`  源文档可逐字定位 → category: explicit
 * - `doc-derived`       文档可推导但非逐字 → category: implicit + confidence medium/low
 * - `needs-clarification` 文档推导不出的决策点 → 不进 IR，只能挂 GAPS.md
 */
export type Provenance = 'explicit-located' | 'doc-derived' | 'needs-clarification';

/** 架构树版本：v1 基础树 / v2 reparent·merge / v3 依赖层 */
export type ArchVersion = 1 | 2 | 3;

export interface JsonlRecord {
  /** 格式: R[123]-[A-Za-z0-9_.]+-\d{4} */
  id: string;
  category: 'explicit' | 'implicit' | 'relational';
  statement: string;
  source_file: string;
  /** P1-4: confidence 接受字符串枚举或 0~1 数值 */
  confidence: 'high' | 'medium' | 'low' | number;
  /**
   * 可选元数据。约定字段：
   * - `provenance?: Provenance` 三态标记（validate-jsonl 校验；needs-clarification 禁入 r-star/architecture）
   * - `arch_version?: ArchVersion` 架构记录所属架构树版本（validate-architecture 校验，与 id 前缀一致）
   * - `source_shard?: string` 溯源分片号（SNNN）
   */
  metadata?: Record<string, unknown>;
}

// === CLI 命令统一返回类型 ===
export interface CliResult {
  /** 'warn' 表示非阻塞发现（如数据流审视提示）：index.ts 视为成功退出码，但语义上区别于纯 'ok'。 */
  status: 'ok' | 'warn' | 'error';
  message?: string;
  data?: unknown;
}

// === 安全审计日志条目 ===
export interface SecurityLogEntry {
  timestamp: string;
  operation: 'read' | 'write' | 'delete';
  path: string;
  allowed: boolean;
  reason?: string;
}

// === 分片索引（manifest.ts 产出） ===
export interface ShardIndex {
  version: '1.0' | '1.1';
  source_path: string;
  source_hash: string;
  language: 'zh' | 'en';
  total_chars: number;
  total_shards: number;
  shards: ShardEntry[];
  gaps: GapEntry[];
  warnings: string[];
}

export interface ShardEntry {
  id: string;
  file: string;
  /** 分片定位符: {file_absolute_path}-{start_line}-{end_line}-{chunk_id} */
  locator: string;
  module: string;
  chapter_ref: string;
  /** 源文件绝对路径 */
  source_path: string;
  /** 源文件中的起始行号（1-based） */
  source_start_line: number;
  /** 源文件中的结束行号（1-based，含） */
  source_end_line: number;
  char_count: number;
  estimated_tokens: number;
}

export interface GapEntry {
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  type: 'unsolved_issue' | 'undefined_term' | 'missing_reference' | 'incomplete_section';
  description: string;
  source_chapter: string;
}

export interface GlossaryEntry {
  term: string;
  acronym?: string;
  definition: string;
  source_shard: string;
  confidence: 'high' | 'medium' | 'low';
  category: 'domain_concept' | 'acronym' | 'technical_entity' | 'business_entity' | 'defined_term';
}

export interface GlossaryBatch {
  batch_id: string;
  shards_covered: string[];
  terms: GlossaryEntry[];
  notes?: string;
}
