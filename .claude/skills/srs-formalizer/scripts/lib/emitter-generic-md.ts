// .claude/skills/srs-formalizer/scripts/lib/emitter-generic-md.ts
// Generic Markdown Emitter — SkIR → Standard Markdown
// 对标 SkCC kimi_md.j2 + gemini_md_v2.j2
// Covers: OpenCode, Cursor, Windsurf, Qoder, Codex, Gemini, Kimi, Antigravity

import type { SkillIR } from '../types/skir.js';

export class GenericMarkdownEmitter {
  emit(ir: SkillIR): string {
    const lines: string[] = [];

    // YAML frontmatter (required for cross-platform skill discovery)
    lines.push('---');
    lines.push(`name: ${ir.name}`);
    lines.push(`description: ${ir.description.slice(0, 200)}`);
    if (ir.version !== '0.1.0') {
      lines.push(`version: ${ir.version}`);
    }
    if (ir.mcp_servers.length > 0) {
      lines.push('mcp_servers:');
      for (const srv of ir.mcp_servers) {
        lines.push(`  - ${srv}`);
      }
    }
    lines.push('---');
    lines.push('');

    // Title
    lines.push(`# ${ir.name}`);
    lines.push('');
    lines.push(`**Version**: ${ir.version}`);
    lines.push(`**Security Level**: ${ir.security_level}`);
    lines.push('');

    // Description
    lines.push('## Description');
    lines.push('');
    lines.push(ir.description);
    lines.push('');

    // HITL notice
    if (ir.hitl_required) {
      lines.push('> **HITL REQUIRED**: This skill requires human approval before execution.');
      lines.push('');
    }

    // MCP
    if (ir.mcp_servers.length > 0) {
      lines.push('## MCP Dependencies');
      lines.push('');
      for (const srv of ir.mcp_servers) {
        lines.push(`- ${srv}`);
      }
      lines.push('');
    }

    // Permissions
    if (ir.permissions.length > 0) {
      lines.push('## Permissions');
      lines.push('');
      lines.push('| Kind | Scope | Read-Only | Description |');
      lines.push('|------|-------|-----------|-------------|');
      for (const p of ir.permissions) {
        lines.push(`| ${p.kind} | \`${p.scope}\` | ${p.read_only ? '✅' : '❌'} | ${p.description || '—'} |`);
      }
      lines.push('');
    }

    // Pre-conditions
    if (ir.pre_conditions.length > 0) {
      lines.push('## Pre-Conditions');
      lines.push('');
      for (const cond of ir.pre_conditions) {
        lines.push(`- ${cond}`);
      }
      lines.push('');
    }

    // Context gathering
    if (ir.context_gathering.length > 0) {
      lines.push('## Context Gathering');
      lines.push('');
      for (const item of ir.context_gathering) {
        lines.push(`- ${item}`);
      }
      lines.push('');
    }

    // Procedures
    if (ir.procedures.length > 0) {
      lines.push('## Procedures');
      lines.push('');
      for (const step of ir.procedures) {
        const critical = step.is_critical ? ' **[CRITICAL]**' : '';
        lines.push(`${step.order}. ${step.instruction}${critical}`);
      }
      lines.push('');
    }

    // Approaches
    if (ir.approaches.length > 0) {
      lines.push(`## Approaches (${ir.mode})`);
      lines.push('');
      for (const app of ir.approaches) {
        lines.push(`### ${app.name}`);
        lines.push('');
        lines.push(app.description);
        lines.push('');
        lines.push(app.instructions);
        lines.push('');
      }
    }

    // Safety constraints
    if (ir.anti_skill_constraints.length > 0) {
      lines.push('## Safety Constraints');
      lines.push('');
      for (const c of ir.anti_skill_constraints) {
        const marker = c.level === 'critical' ? '**[CRITICAL]** '
          : c.level === 'error' ? '**[ERROR]** '
          : '**[WARNING]** ';
        lines.push(`> ${marker}${c.content}`);
      }
      lines.push('');
    }

    // Fallbacks
    if (ir.fallbacks.length > 0) {
      lines.push('## Fallbacks');
      lines.push('');
      for (const fb of ir.fallbacks) {
        lines.push(`- ${fb}`);
      }
      lines.push('');
    }

    // Post-conditions
    if (ir.post_conditions.length > 0) {
      lines.push('## Post-Conditions');
      lines.push('');
      for (const cond of ir.post_conditions) {
        lines.push(`- ${cond}`);
      }
      lines.push('');
    }

    // Examples
    if (ir.few_shot_examples.length > 0) {
      lines.push('## Examples');
      lines.push('');
      for (const ex of ir.few_shot_examples) {
        if (ex.title) {
          lines.push(`### ${ex.title}`);
          lines.push('');
        }
        lines.push('**User**: ' + ex.user_input);
        lines.push('');
        lines.push('**Agent**:');
        lines.push(ex.agent_response);
        lines.push('');
      }
    }

    // Extra sections
    if (ir.extra_sections.length > 0) {
      for (const sec of ir.extra_sections) {
        const prefix = '#'.repeat(Math.min(sec.level + 1, 6));
        lines.push(`${prefix} ${sec.title}`);
        lines.push('');
        lines.push(sec.content);
        lines.push('');
      }
    }

    return lines.join('\n');
  }
}
