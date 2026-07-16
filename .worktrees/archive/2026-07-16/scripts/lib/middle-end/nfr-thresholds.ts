import type { NFRCategory, NFRThreshold } from '../../types/srs-ir.js';

interface ThresholdPattern {
  regex: RegExp;
  metric: string;
  opGroup: number;
  valGroup: number;
  unitGroup: number;
  defaultOp: '<' | '<=' | '>' | '>=' | '==';
  defaultUnit: string;
}

function parseOperator(raw: string | undefined, fallback: '<' | '<=' | '>' | '>=' | '=='): '<' | '<=' | '>' | '>=' | '==' {
  if (!raw) return fallback;
  const t = raw.trim().toLowerCase();
  if (/^(<|lt|less\s+than|低于|小于)$/.test(t)) return '<';
  if (/^(<=|≤|lte|不超过|不大于|最多|at\s+most)$/.test(t)) return '<=';
  if (/^(>|gt|greater\s+than|大于|高于|超过|exceed)/.test(t)) return '>';
  if (/^(>=|≥|gte|至少|不少于|不低于|at\s+least)$/.test(t)) return '>=';
  if (/^(==|=|等于|equals?|exactly|刚好|恰好)$/.test(t)) return '==';
  return fallback;
}

function normalizeUnit(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  const t = raw.trim().toLowerCase();
  if (t === 'milliseconds' || t === 'millisecond' || t === '毫秒') return 'ms';
  if (t === 'seconds' || t === 'second' || t === 'sec' || t === 's' || t === '秒') return 's';
  if (t === 'minutes' || t === 'minute' || t === 'min' || t === '分钟') return 'min';
  if (t === 'hours' || t === 'hour' || t === 'hr' || t === '小时') return 'h';
  if (t === 'days' || t === 'day' || t === 'd' || t === '天' || t === '日') return 'd';
  if (t === 'milliseconds' || t === '毫秒') return 'ms';
  if (t === 'percent' || t === 'pct') return '%';
  if (t === '万' || t === '萬元' || t === '万次' || t === '万条') return '万';
  if (t === '亿') return '亿';
  if (t === 'bits' || t === 'bit' || t === '位') return 'bit';
  if (t === 'bytes' || t === 'byte' || t === 'B' || t === 'b' || t === '字节') return 'byte';
  if (t === 'KB' || t === 'kB' || t === 'kb' || t === '千字节') return 'KB';
  if (t === 'MB' || t === 'mb' || t === '兆') return 'MB';
  if (t === 'GB' || t === 'gb') return 'GB';
  if (t === 'Mbps') return 'Mbps';
  if (t === 'Gbps') return 'Gbps';
  if (t === 'reqs/s' || t === 'req/sec' || t === '次/秒' || t === '条/秒') return 'reqs/s';
  return t.toLowerCase();
}

function buildPatterns(): Record<NFRCategory, ThresholdPattern[]> {
  return {
    performance: [
      { regex: /(?:响应时间|response[_ ]?time)[^\d]*?(≤|<=|<|≥|>=|>)\s*(\d+(?:\.\d+)?)\s*(ms|s|秒|毫秒)/i, metric: 'response_time', opGroup: 1, valGroup: 2, unitGroup: 3, defaultOp: '<=', defaultUnit: 'ms' },
      { regex: /(?:延迟|latency)[^\d]{0,20}?(小于|less\s+than|≤|<=|<)\s*(\d+(?:\.\d+)?)\s*(ms|s|秒|毫秒)/i, metric: 'latency', opGroup: 1, valGroup: 2, unitGroup: 3, defaultOp: '<=', defaultUnit: 'ms' },
      { regex: /(?:吞吐|throughput)[^\d]*?(≥|>=|>)\s*(\d+(?:\.\d+)?)\s*(?:\/s|万?\/s|reqs?\/s|次\/秒|条\/秒)?/i, metric: 'throughput', opGroup: 1, valGroup: 2, unitGroup: 3, defaultOp: '>=', defaultUnit: 'reqs/s' },
      { regex: /(?:并发|concurrent)[^\d]{0,10}?(≥|>=|>|≤|<=|<)\s*(\d+(?:\.\d+)?)\s*(万)?/i, metric: 'concurrency', opGroup: 1, valGroup: 2, unitGroup: 3, defaultOp: '>=', defaultUnit: 'users' },
      { regex: /(QPS|TPS|qps|tps)[^\d]*?(≥|>=|>)\s*(\d+(?:\.\d+)?)/i, metric: 'throughput', opGroup: 2, valGroup: 3, unitGroup: 0, defaultOp: '>=', defaultUnit: 'reqs/s' },
    ],
    security: [
      { regex: /(?:AES)[- ]?(\d+)(?:[- ]?bit|\s*位)?/i, metric: 'encryption_strength', opGroup: 0, valGroup: 1, unitGroup: 0, defaultOp: '>=', defaultUnit: 'bit' },
      { regex: /(?:RSA|ECC)[- ]?(\d+)(?:[- ]?bit|\s*位)?/i, metric: 'key_length', opGroup: 0, valGroup: 1, unitGroup: 0, defaultOp: '>=', defaultUnit: 'bit' },
      { regex: /(\d+)(?:\s*位|\s*[- ]?bit)\s*(?:加密|encrypt)/i, metric: 'encryption_strength', opGroup: 0, valGroup: 1, unitGroup: 0, defaultOp: '>=', defaultUnit: 'bit' },
      { regex: /(?:密钥|key)\s*(?:长度|length|size)[^\d]*?(≥|>=|>)\s*(\d+)(?:\s*位|\s*bit)?/i, metric: 'key_length', opGroup: 1, valGroup: 2, unitGroup: 0, defaultOp: '>=', defaultUnit: 'bit' },
      { regex: /(?:加密强度|crypto\s*strength)[^\d]*?(≥|>=|>)\s*(\d+)/i, metric: 'encryption_strength', opGroup: 1, valGroup: 2, unitGroup: 0, defaultOp: '>=', defaultUnit: 'bit' },
    ],
    availability: [
      { regex: /(?:可用性|availability|uptime)[^\d]*?(≥|>=|>)\s*(\d+(?:\.\d+)?)\s*(%|percent)?/i, metric: 'availability', opGroup: 1, valGroup: 2, unitGroup: 3, defaultOp: '>=', defaultUnit: '%' },
      { regex: /(?:恢复|recovery|restore|RTO)[^\d]*?(?:时间|time)[^\d]{0,15}?(≤|<=|<|within)\s*(\d+(?:\.\d+)?)\s*(min|minute|minutes|h|hour|hours|s|second|seconds|分钟|小时|秒|天|d)/i, metric: 'recovery_time', opGroup: 1, valGroup: 2, unitGroup: 3, defaultOp: '<=', defaultUnit: 'min' },
      { regex: /(?:MTTR|mean\s*time\s*to\s*repair)[^\d]*?(≤|<=|<)\s*(\d+(?:\.\d+)?)\s*(min|h|hour|hours|秒|分|时)/i, metric: 'MTTR', opGroup: 1, valGroup: 2, unitGroup: 3, defaultOp: '<=', defaultUnit: 'h' },
      { regex: /(?:MTBF|mean\s*time\s*between\s*failure)[^\d]*?(≥|>=|>)\s*(\d+(?:\.\d+)?)\s*(h|hour|hours|d|day|days|时|天)/i, metric: 'MTBF', opGroup: 1, valGroup: 2, unitGroup: 3, defaultOp: '>=', defaultUnit: 'h' },
    ],
    compatibility: [
      { regex: /(?:兼容|compatible|supports?)\s*(?:IE|Internet\s*Explorer|Chrome|Firefox|Safari|Edge)[^\d]*?(\d+)(?:\+)?/i, metric: 'browser_version', opGroup: 0, valGroup: 1, unitGroup: 0, defaultOp: '>=', defaultUnit: 'version' },
      { regex: /(?:支持|兼容|supports?|compatible)\s*(?:iOS|Android|iPadOS)[^\d]*?(\d+(?:\.\d+)?)(?:\+)/i, metric: 'os_version', opGroup: 0, valGroup: 1, unitGroup: 0, defaultOp: '>=', defaultUnit: 'version' },
      { regex: /(?:分辨率|resolution|screen)[^\d]*?(≥|>=|>)\s*(\d+)\s*[x×]\s*(\d+)/i, metric: 'resolution', opGroup: 1, valGroup: 2, unitGroup: 0, defaultOp: '>=', defaultUnit: 'px' },
    ],
    maintainability: [
      { regex: /(?:覆盖率|coverage)[^\d]*?(≥|>=|>)\s*(\d+(?:\.\d+)?)\s*(%|percent)?/i, metric: 'coverage', opGroup: 1, valGroup: 2, unitGroup: 3, defaultOp: '>=', defaultUnit: '%' },
      { regex: /(?:部署|deploy)[^\d]*?(?:时间|time)[^\d]{0,10}?(≤|<=|<|within)\s*(\d+(?:\.\d+)?)\s*(min|minute|minutes|h|hour|hours|s|second|seconds|分|时)/i, metric: 'deploy_time', opGroup: 1, valGroup: 2, unitGroup: 3, defaultOp: '<=', defaultUnit: 'min' },
      { regex: /(?:代码行数|lines?\s*of\s*code|LOC)[^\d]*?(≤|<=|<)\s*(\d+(?:\.\d+)?)\s*(万)?/i, metric: 'lines_of_code', opGroup: 1, valGroup: 2, unitGroup: 3, defaultOp: '<=', defaultUnit: 'lines' },
      { regex: /(?:圈复杂度|cyclomatic\s*complexity)[^\d]*?(≤|<=|<)\s*(\d+)/i, metric: 'cyclomatic_complexity', opGroup: 1, valGroup: 2, unitGroup: 0, defaultOp: '<=', defaultUnit: '' },
    ],
    compliance: [
      { regex: /(?:保留|retention|保留期|retain)[^\d]*?(至少|≥|>=|>)\s*(\d+(?:\.\d+)?)\s*(年|月|天|日|year|month|day|y|m|d)/i, metric: 'retention_period', opGroup: 1, valGroup: 2, unitGroup: 3, defaultOp: '>=', defaultUnit: 'd' },
      { regex: /(?:审计|audit)[^\d]*?(?:频率|frequency)[^\d]*?(≤|<=|<|at\s*least\s*every)\s*(\d+(?:\.\d+)?)\s*(天|日|周|月|年|day|week|month|year)/i, metric: 'audit_frequency', opGroup: 1, valGroup: 2, unitGroup: 3, defaultOp: '<=', defaultUnit: 'd' },
      { regex: /(?:日志|log)[^\d]*?(?:保留|retention|保存|keep)[^\d]*?(≥|>=|>|at\s*least)\s*(\d+(?:\.\d+)?)\s*(天|日|月|年|day|month|year|d|m|y)/i, metric: 'log_retention', opGroup: 1, valGroup: 2, unitGroup: 3, defaultOp: '>=', defaultUnit: 'd' },
      { regex: /(?:密码强度|password\s*strength)[^\d]*?(≥|>=|>)\s*(\d+)/i, metric: 'password_strength', opGroup: 1, valGroup: 2, unitGroup: 0, defaultOp: '>=', defaultUnit: 'chars' },
    ],
  };
}

export const THRESHOLD_PATTERNS: Record<NFRCategory, ThresholdPattern[]> = buildPatterns();

function heuristicExtract(statement: string): NFRThreshold | null {
  const numberInContext = /[^\d]{0,10}(\d+(?:\.\d+)?)\s*(ms|s|sec|seconds?|milliseconds?|min|minutes?|h|hours?|hr|d|days?|%|percent|万|亿|次|条|个|Mbps|Gbps|GB|MB|KB|byte|reqs?\/s|次\/秒)\b/i;
  const m = numberInContext.exec(statement);
  if (!m || m[1] === undefined) return null;
  const val = parseFloat(m[1]);
  const unit = normalizeUnit(m[2], '');
  let operator: '<' | '<=' | '>' | '>=' | '==' = '==';
  const before = statement.substring(0, m.index).toLowerCase();
  if (/(?:within|小于|低于|不超过|不大于|less\s+than|below|under|最多|≤|<=|<)/.test(before)) {
    operator = '<=';
  } else if (/(?:at\s+least|至少|不少于|不低于|以上|超过|大于|≥|>=|>)/.test(before)) {
    operator = '>=';
  }
  const metric = unit === '%' ? 'percentage' : unit === 'ms' ? 'duration' : unit === 's' ? 'duration' : 'numeric';
  return { metric, value: val, unit, operator };
}

export function extractThreshold(statement: string, category: NFRCategory): NFRThreshold | null {
  if (!statement || statement.trim().length === 0) return null;
  const patterns = THRESHOLD_PATTERNS[category] ?? [];
  for (const p of patterns) {
    const m = p.regex.exec(statement);
    if (!m) continue;
    if (m[p.valGroup] === undefined) continue;
    const val = parseFloat(m[p.valGroup]!);
    if (Number.isNaN(val)) continue;
    const operator = p.opGroup > 0 ? parseOperator(m[p.opGroup], p.defaultOp) : p.defaultOp;
    const unit = normalizeUnit(m[p.unitGroup], p.defaultUnit);
    return { metric: p.metric, value: val, unit, operator };
  }
  return heuristicExtract(statement);
}
