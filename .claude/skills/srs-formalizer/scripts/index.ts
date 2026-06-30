#!/usr/bin/env node
/**
 * SRS-Formalizer CLI 入口。
 * 子命令模式：node index.ts <command> [options]
 */

const USAGE = `Usage: npx tsx index.ts <command> [options]

Commands:
  init      Initialize .srs_formalizer working directory
  manifest  Shard SRS and recognize chapters

Options:
  --help    Show this help message
`;

function printUsage(): void {
  console.log(USAGE);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    printUsage();
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case 'init': {
      const { main: initMain } = await import('./commands/init.js');
      const result = await initMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    case 'manifest': {
      const { main: manifestMain } = await import('./commands/manifest.js');
      const result = await manifestMain(args.slice(1));
      console.log(JSON.stringify(result));
      process.exit(result.status === 'ok' ? 0 : 1);
    }
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
