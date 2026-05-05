#!/usr/bin/env node
import { loadConfig } from './config.js';
import { createMcpServer } from './GSEPMcpServer.js';
import { startStdio } from './transports/stdio.js';
import { startHttp } from './transports/http.js';

async function main() {
  const config = loadConfig();
  const server = createMcpServer(config);
  const useHttp = process.argv.includes('--http') || process.env.GSEP_TRANSPORT === 'http';

  if (useHttp) {
    await startHttp(server, config);
  } else {
    await startStdio(server, config);
  }
}

main().catch((err) => {
  console.error('[GSEP-MCP] Fatal error:', err.message);
  process.exit(1);
});
