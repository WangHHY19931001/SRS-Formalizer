// === JSONL 基础记录类型 ===
export interface JsonlRecord {
  /** 格式: R[123]-[A-Za-z0-9_.]+-\d{4} */
  id: string;
  category: 'explicit' | 'implicit' | 'relational';
  statement: string;
  source_file: string;
  confidence: 'high' | 'medium' | 'low';
  metadata?: Record<string, unknown>;
}

// === CLI 命令统一返回类型 ===
export interface CliResult {
  status: 'ok' | 'error';
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
  version: '1.0';
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
