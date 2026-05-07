import Fastify from 'fastify';
import cors from '@fastify/cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GSEPMcpConfig } from '../config.js';

export async function startHttp(createServer: () => McpServer, config: GSEPMcpConfig) {
  const app = Fastify({ logger: config.logLevel === 'debug' });

  await app.register(cors, { origin: true });

  // Session map — one transport per session, persisted across requests
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  app.all('/mcp', async (req, reply) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Existing session — reuse transport
    if (sessionId && sessions.has(sessionId)) {
      const transport = sessions.get(sessionId)!;
      reply.hijack();
      await transport.handleRequest(req.raw, reply.raw, req.body);
      return;
    }

    // New session — only allow on initialize request
    const body = req.body as any;
    if (!isInitializeRequest(body)) {
      reply.code(400).send({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Must initialize before sending other requests' },
        id: body?.id ?? null,
      });
      return;
    }

    // Create transport for new session
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, transport);
        if (config.logLevel !== 'silent') {
          console.error(`[GSEP-MCP] Session started: ${id}`);
        }
      },
    });

    transport.onclose = () => {
      const id = (transport as any).sessionId;
      if (id) {
        sessions.delete(id);
        if (config.logLevel !== 'silent') {
          console.error(`[GSEP-MCP] Session closed: ${id}`);
        }
      }
    };

    // Fresh McpServer per session — prevents "Already connected to a transport" error
    const server = createServer();
    await server.connect(transport);
    reply.hijack();
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    server: 'gsep-mcp',
    version: '1.0.5',
    sessions: sessions.size,
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
    for (const transport of sessions.values()) {
      await transport.close();
    }
    await app.close();
    process.exit(0);
  });
}
