export interface JsonlRecord {
    /** 格式: R[123]-[A-Za-z0-9_.]+-\d{4} */
    id: string;
    category: 'explicit' | 'implicit' | 'relational';
    statement: string;
    source_file: string;
    confidence: 'high' | 'medium' | 'low';
    metadata?: Record<string, unknown>;
}
export interface CliResult {
    status: 'ok' | 'error';
    message?: string;
    data?: unknown;
}
export interface SecurityLogEntry {
    timestamp: string;
    operation: 'read' | 'write' | 'delete';
    path: string;
    allowed: boolean;
    reason?: string;
}
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
    char_count: number;
    estimated_tokens: number;
}
export interface GapEntry {
    priority: 'P0' | 'P1' | 'P2' | 'P3';
    type: 'unsolved_issue' | 'undefined_term' | 'missing_reference' | 'incomplete_section';
    description: string;
    source_chapter: string;
}
