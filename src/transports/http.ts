import Fastify from 'fastify';
import cors from '@fastify/cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GSEPMcpConfig } from '../config.js';

export async function startHttp(server: McpServer, config: GSEPMcpConfig) {
  const app = Fastify({ logger: config.logLevel === 'debug' });

  await app.register(cors, { origin: true });

  // MCP over HTTP (Streamable HTTP transport)
  app.all('/mcp', async (req, reply) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });

    reply.hijack();
    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    server: 'gsep-mcp',
    version: '1.0.0',
    tools: ['gsep_chat', 'gsep_scan_input', 'gsep_scan_output', 'gsep_scan_actions', 'gsep_get_status', 'gsep_record_feedback'],
    provider: config.llmProvider,
    preset: config.preset,
  }));

  await app.listen({ port: config.httpPort, host: config.httpHost });

  if (config.logLevel !== 'silent') {
    console.error(`[GSEP-MCP] HTTP transport started on http://${config.httpHost}:${config.httpPort}`);
    console.error(`[GSEP-MCP] MCP endpoint: http://${config.httpHost}:${config.httpPort}/mcp`);
    console.error(`[GSEP-MCP] Health check: http://${config.httpHost}:${config.httpPort}/health`);
    console.error(`[GSEP-MCP] Provider: ${config.llmProvider} | Preset: ${config.preset}`);
  }

  process.on('SIGINT', async () => {
    await app.close();
    await server.close();
    process.exit(0);
  });
}
