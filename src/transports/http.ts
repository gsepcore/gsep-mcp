import Fastify from 'fastify';
import cors from '@fastify/cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GSEPMcpConfig } from '../config.js';
import { getGenomeCacheStats, pruneGenomeCache } from '../genomeManager.js';
import { registerGatewayRoutes } from './gateway.js';

// In-memory cache to avoid calling the Worker on every request
const keyCache = new Map<string, { valid: boolean; email?: string; plan?: string; cachedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface AuthValidationOptions {
  validationUrl: string;
  failOpen: boolean;
}

export async function validateKey(
  key: string,
  options: AuthValidationOptions
): Promise<{ valid: boolean; email?: string; plan?: string }> {
  if (!key) return { valid: false };

  // Check cache first
  const cached = keyCache.get(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  try {
    const res = await fetch(`${options.validationUrl}?key=${encodeURIComponent(key)}`);
    const data = await res.json() as any;

    if (data.valid) {
      keyCache.set(key, { valid: true, email: data.email, plan: data.plan, cachedAt: Date.now() });
    }

    return data;
  } catch {
    if (options.failOpen) {
      console.error('[GSEP-MCP] Warning: key validation service unreachable — allowing request because GSEP_HTTP_AUTH_FAIL_OPEN=true');
      return { valid: true };
    }

    console.error('[GSEP-MCP] Warning: key validation service unreachable — rejecting request');
    return { valid: false };
  }
}

export function clearAuthCache() {
  keyCache.clear();
}

export function extractApiKey(req: { url: string; headers: Record<string, string | string[] | undefined> }): string {
  const url = new URL(req.url, 'http://localhost');
  const queryKey = url.searchParams.get('key');
  if (queryKey) return queryKey;

  const headerKey = req.headers['x-gsep-api-key'];
  if (typeof headerKey === 'string' && headerKey.trim()) return headerKey.trim();

  const authorization = req.headers.authorization;
  if (typeof authorization === 'string') {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) return match[1].trim();
  }

  return '';
}

export interface HttpSessionEntry {
  transport: StreamableHTTPServerTransport;
  createdAt: number;
  lastSeenAt: number;
}

export async function cleanupExpiredSessions(
  sessions: Map<string, HttpSessionEntry>,
  config: Pick<GSEPMcpConfig, 'sessionTtlMs'>,
  now = Date.now()
): Promise<number> {
  let removed = 0;

  for (const [id, entry] of sessions.entries()) {
    if (now - entry.lastSeenAt > config.sessionTtlMs) {
      sessions.delete(id);
      removed++;
      try {
        await entry.transport.close();
      } catch {
        // Best effort: expired sessions should not break request handling.
      }
    }
  }

  return removed;
}

export async function buildHttpApp(createServer: () => McpServer, config: GSEPMcpConfig) {
  const app = Fastify({ logger: config.logLevel === 'debug' });

  await app.register(cors, { origin: true });

  if (config.gatewayEnabled) {
    registerGatewayRoutes(app, config);
  }

  // Session map — one transport per session, persisted across requests
  const sessions = new Map<string, HttpSessionEntry>();

  const cleanupTimer = setInterval(() => {
    void cleanupExpiredSessions(sessions, config);
    pruneGenomeCache(config);
  }, config.sessionCleanupIntervalMs);
  cleanupTimer.unref?.();

  app.addHook('onClose', async () => {
    clearInterval(cleanupTimer);
  });

  app.all('/mcp', async (req, reply) => {
    // P2: request ID for tracing
    reply.header('x-request-id', crypto.randomUUID());
    await cleanupExpiredSessions(sessions, config);
    pruneGenomeCache(config);

    const key = extractApiKey({ url: req.url, headers: req.headers });

    const auth = config.httpAuthRequired
      ? await validateKey(key, {
        validationUrl: config.keyValidationUrl,
        failOpen: config.httpAuthFailOpen,
      })
      : { valid: true };

    if (!auth.valid) {
      reply.code(401).send({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: key
            ? 'Invalid API key. Get yours at gsepcore.com/connect'
            : 'API key required. Get yours at gsepcore.com/connect',
        },
        id: null,
      });
      return;
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Existing session — reuse transport
    if (sessionId && sessions.has(sessionId)) {
      const entry = sessions.get(sessionId)!;
      entry.lastSeenAt = Date.now();
      reply.hijack();
      await entry.transport.handleRequest(req.raw, reply.raw, req.body);
      return;
    }

    // New session — only allow on initialize request
    const body = req.body as any;
    const requestId = body?.id ?? null;
    if (!isInitializeRequest(body)) {
      reply.code(400).send({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Must initialize before sending other requests' },
        id: requestId,
      });
      return;
    }

    if (sessions.size >= config.maxSessions) {
      reply.code(503).send({
        jsonrpc: '2.0',
        error: {
          code: -32002,
          message: `Too many active MCP sessions. Limit is ${config.maxSessions}.`,
        },
        id: requestId,
      });
      return;
    }

    // Create transport for new session
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (id) => {
        const now = Date.now();
        sessions.set(id, {
          transport,
          createdAt: now,
          lastSeenAt: now,
        });
        if (config.logLevel !== 'silent') {
          console.error(`[GSEP-MCP] Session started: ${id} (user: ${auth.email}, plan: ${auth.plan})`);
        }
      },
    });

    transport.onclose = () => {
      const id = (transport as any).sessionId;
      if (id) {
        sessions.delete(id);
      }
    };

    // Fresh McpServer per session — prevents "Already connected to a transport" error
    const server = createServer();
    await server.connect(transport);
    reply.hijack();
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });

  // P2: Readiness probe — 200 when LLM is configured, 503 when degraded
  app.get('/ready', async (_req, reply) => {
    const llmOk = config.llmProvider !== 'none';
    const genomeStats = getGenomeCacheStats(config);
    reply.code(llmOk ? 200 : 503).send({
      status: llmOk ? 'ready' : 'degraded',
      checks: {
        server: 'ok',
        llm: llmOk ? 'ok' : 'no_provider_configured',
        sessions: sessions.size <= config.maxSessions ? 'ok' : 'over_limit',
        genomes: genomeStats.activeGenomes <= config.maxGenomes ? 'ok' : 'over_limit',
      },
    });
  });

  // P2: Prometheus-compatible metrics
  app.get('/metrics', async (_req, reply) => {
    const genomeStats = getGenomeCacheStats(config);
    const lines = [
      '# HELP gsep_active_sessions Current active MCP sessions',
      '# TYPE gsep_active_sessions gauge',
      `gsep_active_sessions ${sessions.size}`,
      '# HELP gsep_max_sessions Configured maximum active MCP sessions',
      '# TYPE gsep_max_sessions gauge',
      `gsep_max_sessions ${config.maxSessions}`,
      '# HELP gsep_active_genomes Current active cached genomes',
      '# TYPE gsep_active_genomes gauge',
      `gsep_active_genomes ${genomeStats.activeGenomes}`,
      '# HELP gsep_max_genomes Configured maximum cached genomes',
      '# TYPE gsep_max_genomes gauge',
      `gsep_max_genomes ${config.maxGenomes}`,
    ];
    reply.header('content-type', 'text/plain; version=0.0.4').send(lines.join('\n') + '\n');
  });

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    server: 'gsep-mcp',
    version: '1.0.9',
    sessions: sessions.size,
    max_sessions: config.maxSessions,
    session_ttl_ms: config.sessionTtlMs,
    session_cleanup_interval_ms: config.sessionCleanupIntervalMs,
    genomes: getGenomeCacheStats(config).activeGenomes,
    max_genomes: config.maxGenomes,
    genome_ttl_ms: config.genomeTtlMs,
    tools: [
      'gsep_chat',
      'gsep_scan_input',
      'gsep_scan_output',
      'gsep_scan_actions',
      'gsep_before_llm',
      'gsep_after_llm',
      'gsep_before_tool',
      'gsep_after_tool',
      'gsep_get_status',
      'gsep_record_feedback',
    ],
    provider: config.llmProvider,
    preset: config.preset,
    gateway_enabled: config.gatewayEnabled,
    gateway_auth_required: config.gatewayAuthRequired,
    auth_required: config.httpAuthRequired,
    auth_fail_open: config.httpAuthFailOpen,
  }));

  return { app, sessions };
}

export async function startHttp(createServer: () => McpServer, config: GSEPMcpConfig) {
  const { app, sessions } = await buildHttpApp(createServer, config);

  await app.listen({ port: config.httpPort, host: config.httpHost });

  if (config.logLevel !== 'silent') {
    console.error(`[GSEP-MCP] HTTP transport started on http://${config.httpHost}:${config.httpPort}`);
    console.error(`[GSEP-MCP] MCP endpoint: http://${config.httpHost}:${config.httpPort}/mcp`);
    console.error(`[GSEP-MCP] Health check: http://${config.httpHost}:${config.httpPort}/health`);
    console.error(`[GSEP-MCP] Readiness:    http://${config.httpHost}:${config.httpPort}/ready`);
    console.error(`[GSEP-MCP] Metrics:      http://${config.httpHost}:${config.httpPort}/metrics`);
    if (config.gatewayEnabled) {
      console.error(`[GSEP-MCP] OpenAI-compatible gateway: http://${config.httpHost}:${config.httpPort}/v1/chat/completions`);
    }
    console.error(`[GSEP-MCP] Provider: ${config.llmProvider} | Preset: ${config.preset}`);
    console.error(`[GSEP-MCP] Key validation: ${config.httpAuthRequired ? 'enabled' : 'disabled'} | fail-open: ${config.httpAuthFailOpen}`);
  }

  process.on('SIGINT', async () => {
    for (const entry of sessions.values()) {
      await entry.transport.close();
    }
    await app.close();
    process.exit(0);
  });
}
