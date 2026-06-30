/**
 * validate-cypher.ts — Cypher 脚本文件校验命令
 *
 * CLI: npx tsx index.ts validate-cypher --file <path>
 *
 * 校验 .cypher 文件：
 *   1. 文件非空
 *   2. 含 CREATE 或 MATCH 语句
 *   3. 每行分号结尾（或 CREATE/MATCH 后跟分号）
 *   4. 不含明显语法错误（如未闭合的引号、括号不匹配）
 *
 * 输出：{"status":"ok","data":{"valid":true/false,"errors":[...]}}
 */

import * as fs from 'node:fs';
import type { CliResult } from '../types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArg(args: string[], name: string): string | null {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1]!;
}

// ---------------------------------------------------------------------------
// Validation logic
// ---------------------------------------------------------------------------

/**
 * Count unclosed single quotes and double quotes in a line.
 * Handles basic escaping: \\' and \\" are not counted as unclosed.
 */
function countUnclosedQuotes(line: string): { single: number; double: number } {
  let single = false;
  let double = false;
  let escaped = false;

  for (const ch of line) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === "'" && !double) {
      single = !single;
    }
    if (ch === '"' && !single) {
      double = !double;
    }
  }

  return { single: single ? 1 : 0, double: double ? 1 : 0 };
}

/**
 * Check parentheses and bracket matching in a line.
 * Returns the number of unmatched closing parens/brackets or positive if unmatched opening.
 */
function checkBrackets(line: string): number {
  let depth = 0;
  for (const ch of line) {
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth < 0) return depth; // negative = unmatched closing
    }
  }
  return depth; // positive = unmatched opening
}

/**
 * Validate a Cypher script file.
 */
function validateCypher(content: string): string[] {
  const errors: string[] = [];
  const lines = content.split('\n');

  // Check 1: file non-empty
  const nonEmptyLines = lines.filter(l => l.trim() !== '');
  if (nonEmptyLines.length === 0) {
    errors.push('File is empty or contains only whitespace');
    return errors;
  }

  // Check 2: contains CREATE or MATCH statement
  const hasCreate = /\bCREATE\b/.test(content);
  const hasMatch = /\bMATCH\b/.test(content);
  if (!hasCreate && !hasMatch) {
    errors.push('File must contain at least one CREATE or MATCH statement');
  }

  // Track quote state across lines (for multi-line statements)
  let inSingleQuote = false;
  let inDoubleQuote = false;

  // Track statement state for semicolon checks (Check 3)
  let inStatement = false;
  let statementStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (trimmed === '' || trimmed.startsWith('//')) continue;

    // Detect start of a CREATE/MATCH statement
    // Only start tracking when not already inside a statement
    if (!inStatement && /^\s*(CREATE|MATCH)\b/.test(line)) {
      inStatement = true;
      statementStartLine = i + 1;
    }

    // Check if this line contains a statement terminator (semicolon)
    // A semicolon at the end of the line or on its own line terminates the statement
    if (inStatement) {
      const lineWithoutComments = line.split('//')[0]!.trim();
      if (lineWithoutComments.endsWith(';') || lineWithoutComments === ';') {
        inStatement = false;
      }
    }

    // Check 4: syntax errors - unclosed quotes
    const quoteState = countUnclosedQuotes(line);
    if (!inSingleQuote && !inDoubleQuote) {
      if (quoteState.single > 0) inSingleQuote = true;
      if (quoteState.double > 0) inDoubleQuote = true;
    } else {
      if (inSingleQuote) {
        inSingleQuote = quoteState.single > 0;
      }
      if (inDoubleQuote) {
        inDoubleQuote = quoteState.double > 0;
      }
    }

    // Brackets check per line (only when not inside quotes)
    if (!inSingleQuote && !inDoubleQuote) {
      const bracketDepth = checkBrackets(line);
      if (bracketDepth < 0) {
        errors.push(`Line ${i + 1}: unmatched closing bracket`);
      }
    }
  }

  // After processing all lines, check for unclosed statements
  if (inStatement) {
    errors.push(`Line ${statementStartLine}: CREATE/MATCH statement is not terminated with ";"`);
  }

  // After processing all lines, check for unclosed quotes
  if (inSingleQuote) {
    errors.push('Unclosed single quote at end of file');
  }
  if (inDoubleQuote) {
    errors.push('Unclosed double quote at end of file');
  }

  // Check for unbalanced brackets across the whole file
  let totalDepth = 0;
  for (const line of lines) {
    totalDepth += checkBrackets(line);
  }
  if (totalDepth > 0) {
    errors.push('Unmatched opening bracket(s) at end of file');
  } else if (totalDepth < 0) {
    errors.push('Unmatched closing bracket(s)');
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function main(args: string[]): Promise<CliResult> {
  const filePath = parseArg(args, '--file');

  if (!filePath) {
    return { status: 'error', message: 'Missing required argument: --file' };
  }

  if (!fs.existsSync(filePath)) {
    return { status: 'error', message: `File not found: ${filePath}` };
  }

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return { status: 'error', message: `Failed to read file: ${(err as Error).message}` };
  }

  const errors = validateCypher(content);

  return {
    status: 'ok',
    data: {
      valid: errors.length === 0,
      errors,
    },
  };
}
