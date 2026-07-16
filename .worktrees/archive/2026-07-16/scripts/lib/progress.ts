/**
 * progress.ts — CLI progress reporting, colored output, and timing utilities
 *
 * Provides:
 * - Colored console output (respects NO_COLOR and TTY detection)
 * - Step progress tracking with timing
 * - Summary report generation
 * - Resource usage monitoring
 */

const isTTY = process.stdout.isTTY && !process.env.NO_COLOR;
const isVerbose = process.argv.includes('--verbose') || process.env.VERBOSE === '1';

const COLORS = {
  reset: isTTY ? '\x1b[0m' : '',
  bold: isTTY ? '\x1b[1m' : '',
  dim: isTTY ? '\x1b[2m' : '',
  red: isTTY ? '\x1b[31m' : '',
  green: isTTY ? '\x1b[32m' : '',
  yellow: isTTY ? '\x1b[33m' : '',
  blue: isTTY ? '\x1b[34m' : '',
  magenta: isTTY ? '\x1b[35m' : '',
  cyan: isTTY ? '\x1b[36m' : '',
  gray: isTTY ? '\x1b[90m' : '',
};

const SYMBOLS = {
  ok: isTTY ? '✓' : '[OK]',
  warn: isTTY ? '⚠' : '[WARN]',
  error: isTTY ? '✗' : '[ERROR]',
  info: isTTY ? 'ℹ' : '[INFO]',
  pending: isTTY ? '○' : '[.]',
  running: isTTY ? '◐' : '[~]',
  arrow: isTTY ? '→' : '->',
};

export interface StepTimer {
  name: string;
  startTime: number;
  endTime?: number;
  status: 'pending' | 'running' | 'ok' | 'warn' | 'error' | 'skipped';
  message?: string;
}

export class ProgressReporter {
  private steps: StepTimer[] = [];
  private startTime = Date.now();
  private quiet: boolean;

  constructor(quiet = false) {
    this.quiet = quiet || !isTTY;
  }

  info(message: string): void {
    if (this.quiet) return;
    console.log(`${COLORS.cyan}${SYMBOLS.info}${COLORS.reset} ${message}`);
  }

  success(message: string): void {
    if (this.quiet) return;
    console.log(`${COLORS.green}${SYMBOLS.ok}${COLORS.reset} ${message}`);
  }

  warn(message: string): void {
    console.log(`${COLORS.yellow}${SYMBOLS.warn}${COLORS.reset} ${message}`);
  }

  error(message: string): void {
    console.error(`${COLORS.red}${SYMBOLS.error}${COLORS.reset} ${message}`);
  }

  header(title: string): void {
    if (this.quiet) return;
    const width = 60;
    console.log('');
    console.log(`${COLORS.bold}${COLORS.magenta}${'═'.repeat(width)}${COLORS.reset}`);
    console.log(`${COLORS.bold}${COLORS.magenta}  ${title}${COLORS.reset}`);
    console.log(`${COLORS.bold}${COLORS.magenta}${'═'.repeat(width)}${COLORS.reset}`);
    console.log('');
  }

  startStep(name: string): StepTimer {
    const step: StepTimer = { name, startTime: Date.now(), status: 'running' };
    this.steps.push(step);
    if (!this.quiet) {
      console.log(`${COLORS.blue}${SYMBOLS.running}${COLORS.reset} ${COLORS.dim}${name}...${COLORS.reset}`);
    }
    return step;
  }

  completeStep(step: StepTimer, status: StepTimer['status'] = 'ok', message?: string): void {
    const endTime = Date.now();
    step.endTime = endTime;
    step.status = status;
    if (message !== undefined) {
      step.message = message;
    }

    if (this.quiet) return;

    const duration = ((endTime - step.startTime) / 1000).toFixed(2);
    let color: string;
    let symbol: string;

    switch (status) {
      case 'ok':
        color = COLORS.green;
        symbol = SYMBOLS.ok;
        break;
      case 'warn':
        color = COLORS.yellow;
        symbol = SYMBOLS.warn;
        break;
      case 'error':
        color = COLORS.red;
        symbol = SYMBOLS.error;
        break;
      case 'skipped':
        color = COLORS.gray;
        symbol = SYMBOLS.pending;
        break;
      default:
        color = COLORS.dim;
        symbol = SYMBOLS.pending;
    }

    const msg = message ? ` — ${message}` : '';
    console.log(`\r${color}${symbol}${COLORS.reset} ${step.name} ${COLORS.gray}(${duration}s)${COLORS.reset}${msg}`);
  }

  summary(): { total: number; ok: number; warn: number; error: number; skipped: number; duration_s: number } {
    const total = this.steps.length;
    const ok = this.steps.filter(s => s.status === 'ok').length;
    const warn = this.steps.filter(s => s.status === 'warn').length;
    const error = this.steps.filter(s => s.status === 'error').length;
    const skipped = this.steps.filter(s => s.status === 'skipped').length;
    const duration_s = (Date.now() - this.startTime) / 1000;

    if (!this.quiet) {
      console.log('');
      console.log(`${COLORS.bold}Summary:${COLORS.reset} ${ok} ok, ${warn} warn, ${error} error, ${skipped} skipped in ${duration_s.toFixed(2)}s`);

      const mem = process.memoryUsage();
      if (isVerbose) {
        console.log(`${COLORS.dim}Memory: RSS ${(mem.rss / 1024 / 1024).toFixed(1)}MB, Heap ${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB${COLORS.reset}`);
      }
    }

    return { total, ok, warn, error, skipped, duration_s };
  }

  getResourceUsage(): { rss_mb: number; heap_used_mb: number; heap_total_mb: number; external_mb: number } {
    const mem = process.memoryUsage();
    return {
      rss_mb: mem.rss / 1024 / 1024,
      heap_used_mb: mem.heapUsed / 1024 / 1024,
      heap_total_mb: mem.heapTotal / 1024 / 1024,
      external_mb: mem.external / 1024 / 1024,
    };
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = ((ms % 60000) / 1000).toFixed(1);
  return `${mins}m ${secs}s`;
}

export const colors = COLORS;
export const symbols = SYMBOLS;
