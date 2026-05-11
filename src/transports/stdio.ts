import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GSEPMcpConfig } from '../config.js';

export async function startStdio(server: McpServer, config: GSEPMcpConfig) {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  if (config.logLevel !== 'silent') {
    console.error('[GSEP-MCP] stdio transport started');
    console.error(`[GSEP-MCP] Provider: ${config.llmProvider} | Preset: ${config.preset}`);
    console.error('[GSEP-MCP] Tools: gsep_chat, gsep_scan_input, gsep_scan_output, gsep_scan_actions, gsep_before_llm, gsep_after_llm, gsep_before_tool, gsep_after_tool, gsep_get_status, gsep_record_feedback');
  }

  // Keep process alive
  process.stdin.resume();

  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });
}
