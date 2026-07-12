// Re-export canonical implementations from cli.ts to avoid duplication.
// Consumers (validate-jsonl.ts, validate-architecture.ts) import from here
// for backward compatibility.
export { isPathSafe, assertSafePath, validateWorkDir } from './cli.js';
