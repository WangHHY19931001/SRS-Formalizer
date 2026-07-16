// .claude/skills/srs-formalizer/scripts/lib/anti-skill.ts
// Anti-Skill Injector — compile-time safety constraint injection
// 对标 SkCC nexa-skill-core/src/analyzer/anti_skill.rs

import type { SkillIR, Constraint, ConstraintLevel } from '../types/skir.js';

export interface AntiPattern {
  id: string;
  trigger_keywords: string[];
  constraint_content: string;
  level: ConstraintLevel;
}

const RULES_SKCC_DEFAULT: AntiPattern[] = [
  {
    id: 'http-safety',
    trigger_keywords: ['HTTP', 'GET', 'POST', 'fetch', 'request', 'curl', 'wget'],
    constraint_content:
      'NEVER execute HTTP without timeout (10s). Max 3 retries on 403.',
    level: 'warning',
  },
  {
    id: 'loop-safety',
    trigger_keywords: ['while', 'loop', 'repeat', 'for ('],
    constraint_content:
      'ALL loops must have max iteration limit (1000). Implement counter + break condition.',
    level: 'error',
  },
  {
    id: 'db-destructive-safety',
    trigger_keywords: ['DROP', 'DELETE', 'TRUNCATE', 'rm -rf'],
    constraint_content:
      'NO destructive DB/FS operations without user confirmation. Show affected rows/files first.',
    level: 'critical',
  },
  {
    id: 'parse-safety',
    trigger_keywords: ['BeautifulSoup', 'HTML parse', 'innerHTML', 'eval('],
    constraint_content:
      'Do NOT parse raw JS variables with HTML parsers. Fallback to Regex.',
    level: 'warning',
  },
];

const RULES_SRS_SPECIFIC: AntiPattern[] = [
  {
    id: 'srs-writeback-safety',
    trigger_keywords: ['SRS_PATCHES.md', 'write to SRS', '修改原始SRS', 'writeFileSync', 'fs.write'],
    constraint_content:
      'NEVER modify original SRS file without user explicit confirmation. ' +
      'All writes MUST be limited to .srs_formalizer/ directory.',
    level: 'critical',
  },
  {
    id: 'verifier-isolation',
    trigger_keywords: ['verifier-R', 'executor-R', 'dispatch subagent', 'new session', '上下文隔离'],
    constraint_content:
      'Verifiers MUST execute in FRESH session. Executor output MUST NOT ' +
      'influence verifier judgment. Cross-contamination = automatic REJECTED.',
    level: 'error',
  },
  {
    id: 'integrity-gate-mandatory',
    trigger_keywords: ['stage transition', 'stage complete', 'pipeline', 'verify-gate'],
    constraint_content:
      'MUST run verify-skill-integrity BEFORE every stage transition. ' +
      'Tampering detected → auto-repair from .enc → BLOCK pipeline → notify human.',
    level: 'critical',
  },
];

const ALL_RULES: AntiPattern[] = [...RULES_SKCC_DEFAULT, ...RULES_SRS_SPECIFIC];

export function inject(skillIR: SkillIR): SkillIR {
  const allText = skillIR.procedures
    .map(p => p.instruction)
    .join(' ');

  const constraints: Constraint[] = [...skillIR.anti_skill_constraints];

  for (const rule of ALL_RULES) {
    const matched = rule.trigger_keywords.some(kw => allText.includes(kw));
    if (matched) {
      constraints.push({
        source: 'anti-skill-injector',
        content: rule.constraint_content,
        level: rule.level,
        scope: { type: 'global' },
      });
    }
  }

  return { ...skillIR, anti_skill_constraints: constraints };
}

export function getViolationsByLevel(
  ir: SkillIR,
  level: ConstraintLevel,
): Constraint[] {
  return ir.anti_skill_constraints.filter(c => c.level === level);
}
