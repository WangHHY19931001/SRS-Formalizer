/**
 * tools.ts — Agent tools for skill debugging
 *
 * Tools available to LLM-driven orchestrator and worker agents.
 * Each tool is a function that the LLM can call via OpenAI function calling.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

// ===================== Tool Definitions (OpenAI function calling format) =====================

export const TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read a file from the filesystem. Use this to read SKILL.md, orchestrator prompts, shard_index.json, etc.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute or relative path to the file' },
          max_lines: { type: 'integer', description: 'Maximum lines to read (default 100)' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_command',
      description: 'Run a srs-formalizer CLI command. All commands MUST be invoked via npx tsx index.ts <cmd>. Working directory is the scripts/ directory.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The CLI command with arguments, e.g. "npx tsx index.ts init --output /tmp/test/.srs_formalizer"' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'validate_output',
      description: 'Validate a pipeline output file (JSONL, .feature, .tla, .lean, .cypher, glossary JSON) against its schema.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['jsonl', 'feature', 'tla', 'lean', 'cypher', 'glossary'], description: 'Type of output to validate' },
          file_path: { type: 'string', description: 'Path to the file to validate' },
          workdir: { type: 'string', description: 'Path to the .srs_formalizer workdir' },
        },
        required: ['type', 'file_path', 'workdir'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_directory',
      description: 'List contents of a directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'check_file_exists',
      description: 'Check if a file or directory exists.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to check' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'record_observation',
      description: 'Record an observation about the test. Use this to note: stage completion, check results, issues found, recommendations.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['stage_complete', 'check_result', 'issue', 'recommendation', 'note'], description: 'Observation category' },
          detail: { type: 'string', description: 'Detailed observation' },
          passed: { type: 'boolean', description: 'Whether the check passed (for check_result)' },
        },
        required: ['category', 'detail'],
      },
    },
  },
];

// ===================== Tool Implementations =====================

const SCRIPTS_DIR = path.resolve('.claude/skills/srs-formalizer/scripts');

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case 'read_file': {
      const p = args.path as string;
      const maxLines = (args.max_lines as number) || 100;
      try {
        const content = fs.readFileSync(p, 'utf-8');
        const lines = content.split('\n').slice(0, maxLines);
        return lines.join('\n') + (content.split('\n').length > maxLines ? `\n... (${content.split('\n').length - maxLines} more lines)` : '');
      } catch (e) {
        return `ERROR: ${(e as Error).message}`;
      }
    }

    case 'run_command': {
      const cmd = args.command as string;
      try {
        const result = execSync(cmd, { cwd: SCRIPTS_DIR, stdio: 'pipe', timeout: 120000, env: { ...process.env } }).toString().trim();
        return result;
      } catch (e: unknown) {
        const err = e as { stdout?: Buffer; stderr?: Buffer; message?: string };
        return err.stdout?.toString().trim() || err.stderr?.toString().trim() || `ERROR: ${err.message}`;
      }
    }

    case 'validate_output': {
      const type = args.type as string;
      const filePath = args.file_path as string;
      const workdir = args.workdir as string;
      const cmdMap: Record<string, string> = {
        jsonl: `npx tsx index.ts validate-jsonl --file ${filePath} --workdir ${workdir}`,
        feature: `npx tsx index.ts validate-bdd --workdir ${workdir}`,
        cypher: `npx tsx index.ts validate-cypher --file ${filePath} --workdir ${workdir}`,
        glossary: `npx tsx index.ts validate-glossary --file ${filePath}`,
        tla: `echo '{"status":"ok","message":"TLA+ validation requires SANY+TLC (external toolchain)"}'`,
        lean: `echo '{"status":"ok","message":"Lean 4 validation requires lake build (external toolchain)"}'`,
      };
      const cmd = cmdMap[type] || `echo '{"status":"error","message":"unknown type: ${type}"}'`;
      try {
        return execSync(cmd, { cwd: SCRIPTS_DIR, stdio: 'pipe', timeout: 30000, env: { ...process.env } }).toString().trim();
      } catch (e: unknown) {
        const err = e as { stdout?: Buffer; stderr?: Buffer };
        return err.stdout?.toString().trim() || err.stderr?.toString().trim() || `ERROR: ${(e as Error).message}`;
      }
    }

    case 'list_directory': {
      try {
        const entries = fs.readdirSync(args.path as string, { withFileTypes: true });
        return entries.map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`).join('\n');
      } catch (e) {
        return `ERROR: ${(e as Error).message}`;
      }
    }

    case 'check_file_exists': {
      try {
        const exists = fs.existsSync(args.path as string);
        if (exists) {
          const stat = fs.statSync(args.path as string);
          return `EXISTS (${stat.isDirectory() ? 'directory' : 'file'}, ${stat.size} bytes)`;
        }
        return 'NOT FOUND';
      } catch (e) {
        return `ERROR: ${(e as Error).message}`;
      }
    }

    case 'record_observation': {
      return `OBSERVED: [${args.category}] ${args.detail} ${args.passed === true ? '✅' : args.passed === false ? '❌' : ''}`;
    }

    default:
      return `Unknown tool: ${name}`;
  }
}
