// .claude/skills/srs-formalizer/scripts/lib/emitter-claude-xml.ts
// Claude XML Emitter — SkIR → XML Semantic Layering
// 对标 SkCC nexa-skill-templates/templates/claude_xml.j2
// 学术依据: Claude +23% reasoning accuracy with XML tags (SkCC Section 3.3)

import type { SkillIR } from '../types/skir.js';

export class ClaudeXmlEmitter {
  emit(ir: SkillIR): string {
    const lines: string[] = [];

    // YAML frontmatter (required for Claude Code skill discovery)
    lines.push('---');
    lines.push(`name: ${ir.name}`);
    lines.push(`description: ${this.escapeXml(ir.description)}`);
    lines.push('---');
    lines.push('');

    // Root
    lines.push('<agent_skill>');

    // Metadata block
    lines.push('  <metadata>');
    lines.push(`    <name>${this.escapeXml(ir.name)}</name>`);
    lines.push(`    <version>${ir.version}</version>`);
    lines.push(`    <security_level>${ir.security_level}</security_level>`);
    lines.push(`    <mode>${ir.mode}</mode>`);
    lines.push('  </metadata>');
    lines.push('');

    // Intent
    lines.push(`  <intent>${this.escapeXml(ir.description)}</intent>`);
    lines.push('');

    // System constraint (HITL)
    if (ir.hitl_required) {
      lines.push('  <system_constraint>');
      lines.push('    Human-In-The-Loop REQUIRED for execution.');
      lines.push('    This skill is marked as requiring human confirmation.');
      lines.push('  </system_constraint>');
      lines.push('');
    }

    // MCP Servers
    if (ir.mcp_servers.length > 0) {
      lines.push('  <mcp_servers>');
      for (const srv of ir.mcp_servers) {
        lines.push(`    <server>${this.escapeXml(srv)}</server>`);
      }
      lines.push('  </mcp_servers>');
      lines.push('');
    }

    // Pre-conditions
    if (ir.pre_conditions.length > 0) {
      lines.push('  <pre_conditions>');
      for (const cond of ir.pre_conditions) {
        lines.push(`    <condition>${this.escapeXml(cond)}</condition>`);
      }
      lines.push('  </pre_conditions>');
      lines.push('');
    }

    // Context gathering
    if (ir.context_gathering.length > 0) {
      lines.push('  <context_gathering>');
      for (const step of ir.context_gathering) {
        lines.push(`    <step>${this.escapeXml(step)}</step>`);
      }
      lines.push('  </context_gathering>');
      lines.push('');
    }

    // Execution steps
    if (ir.procedures.length > 0) {
      lines.push('  <execution_steps>');
      for (const step of ir.procedures) {
        const critical = step.is_critical ? ' critical="true"' : '';
        lines.push(`    <step order="${step.order}"${critical}>${this.escapeXml(step.instruction)}</step>`);
      }
      lines.push('  </execution_steps>');
      lines.push('');
    }

    // Approaches (for mode-selector skills)
    if (ir.approaches.length > 0) {
      lines.push(`  <execution_approaches mode="${ir.mode}">`);
      for (const app of ir.approaches) {
        lines.push(`    <approach name="${this.escapeXml(app.name)}">${this.escapeXml(app.description)}</approach>`);
      }
      lines.push('  </execution_approaches>');
      lines.push('');
    }

    // Strict constraints (Anti-Skill)
    if (ir.anti_skill_constraints.length > 0) {
      lines.push('  <strict_constraints>');
      for (const c of ir.anti_skill_constraints) {
        lines.push(`    <anti_pattern source="${c.source}" level="${c.level}">${this.escapeXml(c.content)}</anti_pattern>`);
      }
      lines.push('  </strict_constraints>');
      lines.push('');
    }

    // Permissions
    if (ir.permissions.length > 0) {
      lines.push('  <permissions>');
      for (const p of ir.permissions) {
        const desc = p.description ? ` ${this.escapeXml(p.description)}` : '';
        lines.push(`    <permission kind="${p.kind}" scope="${this.escapeXml(p.scope)}" read_only="${p.read_only}">${desc}</permission>`);
      }
      lines.push('  </permissions>');
      lines.push('');
    }

    // Examples
    if (ir.few_shot_examples.length > 0) {
      lines.push('  <examples>');
      for (const ex of ir.few_shot_examples) {
        const titleAttr = ex.title ? ` title="${this.escapeXml(ex.title)}"` : '';
        lines.push(`    <example${titleAttr}>`);
        lines.push(`      <input>${this.escapeXml(ex.user_input)}</input>`);
        lines.push(`      <output>${this.escapeXml(ex.agent_response)}</output>`);
        lines.push('    </example>');
      }
      lines.push('  </examples>');
      lines.push('');
    }

    // Fallbacks
    if (ir.fallbacks.length > 0) {
      lines.push('  <fallbacks>');
      for (const fb of ir.fallbacks) {
        lines.push(`    <strategy>${this.escapeXml(fb)}</strategy>`);
      }
      lines.push('  </fallbacks>');
      lines.push('');
    }

    // Post-conditions
    if (ir.post_conditions.length > 0) {
      lines.push('  <post_conditions>');
      for (const cond of ir.post_conditions) {
        lines.push(`    <condition>${this.escapeXml(cond)}</condition>`);
      }
      lines.push('  </post_conditions>');
      lines.push('');
    }

    // Extra sections
    if (ir.extra_sections.length > 0) {
      lines.push('  <additional_context>');
      for (const sec of ir.extra_sections) {
        lines.push(`    <section title="${this.escapeXml(sec.title)}">`);
        lines.push(sec.content);
        lines.push('    </section>');
      }
      lines.push('  </additional_context>');
      lines.push('');
    }

    lines.push('</agent_skill>');
    return lines.join('\n') + '\n';
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
