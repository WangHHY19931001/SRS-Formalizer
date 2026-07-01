// .claude/skills/srs-formalizer/scripts/__tests__/emitter-claude-xml.test.ts
// Claude XML Emitter — test suite
import { describe, it } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { ClaudeXmlEmitter } from '../lib/emitter-claude-xml.js';
import type { SkillIR } from '../types/skir.js';

function makeIR(): SkillIR {
  return {
    name: 'test-skill',
    version: '1.0.0',
    description: 'A test skill for XML emission',
    mcp_servers: [],
    security_level: 'low',
    hitl_required: false,
    pre_conditions: [],
    post_conditions: [],
    fallbacks: [],
    permissions: [],
    context_gathering: [],
    procedures: [],
    approaches: [],
    mode: 'sequential',
    few_shot_examples: [],
    anti_skill_constraints: [],
    extra_sections: [],
    requires_yaml_optimization: false,
    pipeline_stages: [],
    capability_requirements: {},
    capability_tiers: [],
    platform_activation: {},
    stage_gates: [],
    source_path: '',
    source_hash: '',
    compiled_at: '',
  };
}

describe('ClaudeXmlEmitter', () => {
  it('emits YAML frontmatter with name and description', () => {
    const emitter = new ClaudeXmlEmitter();
    const ir = makeIR();
    const output = emitter.emit(ir);
    ok(output.startsWith('---\n'), 'should start with YAML frontmatter');
    ok(output.includes('name: test-skill'), 'should include name in frontmatter');
    ok(output.includes('description: A test skill for XML emission'), 'should include description in frontmatter');
  });

  it('wraps content in <agent_skill> root tag', () => {
    const emitter = new ClaudeXmlEmitter();
    const output = emitter.emit(makeIR());
    ok(output.includes('<agent_skill>'), 'should open agent_skill tag');
    ok(output.includes('</agent_skill>'), 'should close agent_skill tag');
    ok(output.indexOf('<agent_skill>') < output.lastIndexOf('</agent_skill>'), 'root tag should wrap content');
  });

  it('emits metadata block with version, security_level, mode', () => {
    const emitter = new ClaudeXmlEmitter();
    const ir = makeIR();
    ir.version = '2.1.0';
    ir.security_level = 'high';
    ir.mode = 'alternative';
    const output = emitter.emit(ir);
    ok(output.includes('<version>2.1.0</version>'));
    ok(output.includes('<security_level>high</security_level>'));
    ok(output.includes('<mode>alternative</mode>'));
  });

  it('emits intent from description', () => {
    const emitter = new ClaudeXmlEmitter();
    const ir = makeIR();
    ir.description = 'A skill for testing XML output';
    const output = emitter.emit(ir);
    ok(output.includes('<intent>A skill for testing XML output</intent>'));
  });

  it('emits system_constraint when hitl_required is true', () => {
    const emitter = new ClaudeXmlEmitter();
    const ir = makeIR();
    ir.hitl_required = true;
    const output = emitter.emit(ir);
    ok(output.includes('<system_constraint>'), 'should include system_constraint block');
    ok(output.includes('Human-In-The-Loop REQUIRED'), 'should mention HITL requirement');
  });

  it('omits system_constraint when hitl_required is false', () => {
    const emitter = new ClaudeXmlEmitter();
    const output = emitter.emit(makeIR());
    ok(!output.includes('<system_constraint>'), 'should omit system_constraint when not required');
  });

  it('emits mcp_servers block when servers present', () => {
    const emitter = new ClaudeXmlEmitter();
    const ir = makeIR();
    ir.mcp_servers = ['github.com', 'filesystem'];
    const output = emitter.emit(ir);
    ok(output.includes('<mcp_servers>'), 'should include mcp_servers block');
    ok(output.includes('<server>github.com</server>'));
    ok(output.includes('<server>filesystem</server>'));
  });

  it('emits pre_conditions block', () => {
    const emitter = new ClaudeXmlEmitter();
    const ir = makeIR();
    ir.pre_conditions = ['Node.js >= 18', 'Internet access'];
    const output = emitter.emit(ir);
    ok(output.includes('<pre_conditions>'), 'should include pre_conditions block');
    ok(output.includes('<condition>Node.js &gt;= 18</condition>'), 'should escape XML in condition');
    ok(output.includes('<condition>Internet access</condition>'));
  });

  it('emits context_gathering steps', () => {
    const emitter = new ClaudeXmlEmitter();
    const ir = makeIR();
    ir.context_gathering = ['Check current directory', 'Read config file'];
    const output = emitter.emit(ir);
    ok(output.includes('<context_gathering>'), 'should include context_gathering block');
    ok(output.includes('<step>Check current directory</step>'));
    ok(output.includes('<step>Read config file</step>'));
  });

  it('emits execution_steps with order and critical flag', () => {
    const emitter = new ClaudeXmlEmitter();
    const ir = makeIR();
    ir.procedures = [
      { order: 1, instruction: 'Step one', is_critical: false, constraints: [] },
      { order: 2, instruction: 'Step two', is_critical: true, constraints: [] },
    ];
    const output = emitter.emit(ir);
    ok(output.includes('<execution_steps>'), 'should include execution_steps block');
    ok(output.includes('<step order="1">Step one</step>'), 'should include non-critical step');
    ok(output.includes('<step order="2" critical="true">Step two</step>'), 'should mark critical step');
  });

  it('emits execution_approaches for mode-selector skills', () => {
    const emitter = new ClaudeXmlEmitter();
    const ir = makeIR();
    ir.mode = 'alternative';
    ir.approaches = [
      { name: 'fast', description: 'Quick execution', instructions: '' },
      { name: 'thorough', description: 'Detailed analysis', instructions: '' },
    ];
    const output = emitter.emit(ir);
    ok(output.includes('<execution_approaches mode="alternative">'));
    ok(output.includes('<approach name="fast">Quick execution</approach>'));
    ok(output.includes('<approach name="thorough">Detailed analysis</approach>'));
  });

  it('emits strict_constraints for anti-skill constraints', () => {
    const emitter = new ClaudeXmlEmitter();
    const ir = makeIR();
    ir.anti_skill_constraints = [
      { source: 'anti-skill-injector', content: 'No HTTP timeout', level: 'error', scope: { type: 'global' } },
      { source: 'user_defined', content: 'Must use HTTPS', level: 'critical', scope: { type: 'global' } },
    ];
    const output = emitter.emit(ir);
    ok(output.includes('<strict_constraints>'));
    ok(output.includes('<anti_pattern source="anti-skill-injector" level="error">No HTTP timeout</anti_pattern>'));
    ok(output.includes('<anti_pattern source="user_defined" level="critical">Must use HTTPS</anti_pattern>'));
  });

  it('emits permissions block', () => {
    const emitter = new ClaudeXmlEmitter();
    const ir = makeIR();
    ir.permissions = [
      { kind: 'network', scope: 'github.com', read_only: true, description: 'Fetch repositories' },
    ];
    const output = emitter.emit(ir);
    ok(output.includes('<permissions>'), 'should include permissions block');
    ok(output.includes('kind="network"'), 'should include permission kind');
    ok(output.includes('scope="github.com"'), 'should include permission scope');
    ok(output.includes('read_only="true"'), 'should include read_only flag');
    ok(output.includes('Fetch repositories'), 'should include permission description');
  });

  it('emits few-shot examples with optional title', () => {
    const emitter = new ClaudeXmlEmitter();
    const ir = makeIR();
    ir.few_shot_examples = [
      { title: 'Greeting', user_input: 'Hello', agent_response: 'Hi there!', tags: [] },
      { user_input: 'How are you?', agent_response: 'I am fine.', tags: [] },
    ];
    const output = emitter.emit(ir);
    ok(output.includes('<examples>'), 'should include examples block');
    ok(output.includes('title="Greeting"'), 'should include example title when present');
    ok(output.includes('<input>Hello</input>'));
    ok(output.includes('<output>Hi there!</output>'));
    ok(output.includes('<input>How are you?</input>'), 'should include example without title');
  });

  it('emits fallbacks block', () => {
    const emitter = new ClaudeXmlEmitter();
    const ir = makeIR();
    ir.fallbacks = ['Use local cache', 'Prompt user for input'];
    const output = emitter.emit(ir);
    ok(output.includes('<fallbacks>'), 'should include fallbacks block');
    ok(output.includes('<strategy>Use local cache</strategy>'));
    ok(output.includes('<strategy>Prompt user for input</strategy>'));
  });

  it('emits post_conditions block', () => {
    const emitter = new ClaudeXmlEmitter();
    const ir = makeIR();
    ir.post_conditions = ['Result saved to disk', 'Cleanup completed'];
    const output = emitter.emit(ir);
    ok(output.includes('<post_conditions>'), 'should include post_conditions block');
    ok(output.includes('<condition>Result saved to disk</condition>'));
    ok(output.includes('<condition>Cleanup completed</condition>'));
  });

  it('emits additional_context for extra sections', () => {
    const emitter = new ClaudeXmlEmitter();
    const ir = makeIR();
    ir.extra_sections = [
      { level: 1, title: 'Implementation Notes', content: 'Some additional context\nacross multiple lines' },
    ];
    const output = emitter.emit(ir);
    ok(output.includes('<additional_context>'));
    ok(output.includes('<section title="Implementation Notes">'));
    ok(output.includes('Some additional context'));
    ok(output.includes('across multiple lines'));
  });

  it('escapes XML special characters in text content', () => {
    const emitter = new ClaudeXmlEmitter();
    const ir = makeIR();
    ir.description = 'A & B < C > D "quote"';
    const output = emitter.emit(ir);
    ok(output.includes('&amp;'), 'should escape ampersand');
    ok(output.includes('&lt;'), 'should escape less-than');
    ok(output.includes('&gt;'), 'should escape greater-than');
    ok(output.includes('&quot;'), 'should escape double-quote');
    ok(!output.includes('& &lt;'), '& should not appear unescaped in text content (already replaced)');
  });

  it('omits all optional blocks when arrays are empty', () => {
    const emitter = new ClaudeXmlEmitter();
    const output = emitter.emit(makeIR());
    ok(!output.includes('<mcp_servers>'));
    ok(!output.includes('<pre_conditions>'));
    ok(!output.includes('<context_gathering>'));
    ok(!output.includes('<execution_steps>'));
    ok(!output.includes('<execution_approaches>'));
    ok(!output.includes('<strict_constraints>'));
    ok(!output.includes('<permissions>'));
    ok(!output.includes('<examples>'));
    ok(!output.includes('<fallbacks>'));
    ok(!output.includes('<post_conditions>'));
    ok(!output.includes('<additional_context>'));
  });

  it('handles minimal IR with only required fields', () => {
    const emitter = new ClaudeXmlEmitter();
    const output = emitter.emit(makeIR());
    // Required sections always present
    ok(output.startsWith('---\n'), 'should start with frontmatter');
    ok(output.includes('<agent_skill>'), 'should have root tag');
    ok(output.includes('<metadata>'), 'should have metadata');
    ok(output.includes('<intent>'), 'should have intent');
    ok(output.includes('</agent_skill>'), 'should close root tag');
  });

  it('produces well-formed output that ends with newline', () => {
    const emitter = new ClaudeXmlEmitter();
    const output = emitter.emit(makeIR());
    strictEqual(output.endsWith('\n'), true, 'output should end with newline');
  });

  it('includes permission description only when present', () => {
    const emitter = new ClaudeXmlEmitter();
    const ir = makeIR();
    ir.permissions = [
      { kind: 'filesystem', scope: '/tmp', read_only: false, description: 'Temp access' },
      { kind: 'network', scope: 'api.example.com', read_only: true },
    ];
    const output = emitter.emit(ir);
    ok(output.includes('Temp access'), 'should include description when present');
    ok(output.includes('read_only="false"'), 'second permission has read_only=false');
  });
});
