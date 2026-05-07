#!/usr/bin/env node
import { loadConfig } from './config.js';
import { createMcpServer } from './GSEPMcpServer.js';
import { startStdio } from './transports/stdio.js';
import { startHttp } from './transports/http.js';

async function main() {
  const config = loadConfig();
  const useHttp = process.argv.includes('--http') || process.env.GSEP_TRANSPORT === 'http';

  if (useHttp) {
    // HTTP: factory function — fresh McpServer per session to avoid "Already connected" error
    await startHttp(() => createMcpServer(config), config);
  } else {
    // stdio: single connection, single server instance is fine
    await startStdio(createMcpServer(config), config);
  }
}

main().catch((err) => {
  console.error('[GSEP-MCP] Fatal error:', err.message);
  process.exit(1);
});
