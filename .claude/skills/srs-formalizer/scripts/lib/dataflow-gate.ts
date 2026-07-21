/**
 * dataflow-gate.ts — 数据流提示"注入门控"（spec 2026-07-21 上线前提 / ADR-0009 风险缓解）
 *
 * spec 硬性上线前提：实体归一的假阳性率必须先达标，否则提示噪声会让 agent
 * 学会性无视。故层次 2（BDD/TLA+ executor 注入）默认**关闭**，处于 shadow 模式——
 * `analyze-dataflow` 照常产出 `dataflow.json` 供人工评估，但不注入下游。
 *
 * 只有当人工评估假阳性率 ≤ 阈值并签署后，写入 `_ctx/dataflow_injection_gate.json`，
 * 层次 2 注入才被允许。本模块提供门控的读取、评估判定与序列化（纯逻辑，I/O 由调用方做）。
 */

export const DEFAULT_FALSE_POSITIVE_THRESHOLD = 0.15;

export interface DataFlowInjectionGate {
  /** 是否允许层次 2 注入。仅当评估达标且人工签署时为 true。 */
  injectionEnabled: boolean;
  /** 评估的假阳性率（0~1）：人工判定的误报数 / 总 findings 数。 */
  falsePositiveRate: number;
  /** 达标阈值（默认 0.15）。falsePositiveRate ≤ threshold 才可开启。 */
  threshold: number;
  /** 评估样本量（findings 总数）。样本过小不足以支撑开启。 */
  sampleSize: number;
  /** 人工签署者标识（非空即视为已签署）。 */
  assessedBy: string;
  /** 签署时间（ISO 8601）。 */
  assessedAt: string;
  /** 评估理由/说明。 */
  reason?: string;
}

export const INJECTION_GATE_FILENAME = 'dataflow_injection_gate.json';

/** 未评估时的默认门控：shadow 模式（注入关闭）。 */
export function defaultGate(): DataFlowInjectionGate {
  return {
    injectionEnabled: false,
    falsePositiveRate: 1,
    threshold: DEFAULT_FALSE_POSITIVE_THRESHOLD,
    sampleSize: 0,
    assessedBy: '',
    assessedAt: '',
    reason: 'not assessed — shadow mode (injection disabled by default)',
  };
}

export interface AssessmentInput {
  falsePositiveRate: number;
  sampleSize: number;
  assessedBy: string;
  threshold?: number;
  reason?: string;
  minSampleSize?: number;
}

export interface AssessmentResult {
  gate: DataFlowInjectionGate;
  errors: string[];
}

/**
 * 依据人工评估输入判定是否可开启注入，并生成门控对象。
 * 开启条件（全部满足）：
 *   - assessedBy 非空（有人签署）
 *   - falsePositiveRate ∈ [0,1] 且 ≤ threshold
 *   - sampleSize ≥ minSampleSize（默认 10，样本太小不足以支撑结论）
 * 任一不满足 → injectionEnabled=false，errors 说明原因（仍返回可写入的 shadow 门控）。
 */
export function assessInjectionGate(input: AssessmentInput): AssessmentResult {
  const threshold = input.threshold ?? DEFAULT_FALSE_POSITIVE_THRESHOLD;
  const minSampleSize = input.minSampleSize ?? 10;
  const errors: string[] = [];

  if (typeof input.falsePositiveRate !== 'number' || input.falsePositiveRate < 0 || input.falsePositiveRate > 1) {
    errors.push(`falsePositiveRate must be in [0,1], got ${input.falsePositiveRate}`);
  }
  if (typeof input.sampleSize !== 'number' || input.sampleSize < 0) {
    errors.push(`sampleSize must be a non-negative number, got ${input.sampleSize}`);
  }
  if (!input.assessedBy || input.assessedBy.trim() === '') {
    errors.push('assessedBy is required (human sign-off)');
  }
  if (errors.length === 0 && input.falsePositiveRate > threshold) {
    errors.push(`falsePositiveRate ${input.falsePositiveRate} exceeds threshold ${threshold} — keep shadow mode, tighten extraction first`);
  }
  if (errors.length === 0 && input.sampleSize < minSampleSize) {
    errors.push(`sampleSize ${input.sampleSize} below minimum ${minSampleSize} — insufficient evidence to enable injection`);
  }

  const enabled = errors.length === 0;
  const gate: DataFlowInjectionGate = {
    injectionEnabled: enabled,
    falsePositiveRate: input.falsePositiveRate,
    threshold,
    sampleSize: input.sampleSize,
    assessedBy: input.assessedBy ?? '',
    assessedAt: new Date().toISOString(),
    reason: input.reason ?? (enabled ? 'assessed within threshold — injection enabled' : 'assessment did not meet gate — shadow mode retained'),
  };
  return { gate, errors };
}
