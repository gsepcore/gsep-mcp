import { afterEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GSEPMcpConfig } from '../config.js';
import {
  buildHttpApp,
  cleanupExpiredSessions,
  clearAuthCache,
  extractApiKey,
  type HttpSessionEntry,
  validateKey,
} from './http.js';

const baseConfig: GSEPMcpConfig = {
  llmProvider: 'none',
  storagePath: '/tmp/gsep-mcp-test',
  httpPort: 0,
  httpHost: '127.0.0.1',
  httpAuthRequired: true,
  httpAuthFailOpen: false,
  keyValidationUrl: 'https://validator.example/validate',
  gatewayEnabled: true,
  gatewayAuthRequired: true,
  sessionTtlMs: 30 * 60 * 1000,
  sessionCleanupIntervalMs: 60 * 1000,
  maxSessions: 500,
  genomeTtlMs: 60 * 60 * 1000,
  maxGenomes: 100,
  preset: 'full',
  logLevel: 'silent',
};

describe('HTTP transport auth', () => {
  afterEach(() => {
    clearAuthCache();
    vi.restoreAllMocks();
  });

  it('extracts API keys from query, x-gsep-api-key, and bearer auth', () => {
    expect(extractApiKey({ url: '/mcp?key=query-key', headers: {} })).toBe('query-key');
    expect(extractApiKey({ url: '/mcp', headers: { 'x-gsep-api-key': 'header-key' } })).toBe('header-key');
    expect(extractApiKey({ url: '/mcp', headers: { authorization: 'Bearer bearer-key' } })).toBe('bearer-key');
  });

  it('fails closed when validation service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(validateKey('gsep_test', {
      validationUrl: 'https://validator.example/validate',
      failOpen: false,
    })).resolves.toEqual({ valid: false });
  });

  it('can fail open only when explicitly configured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(validateKey('gsep_test', {
      validationUrl: 'https://validator.example/validate',
      failOpen: true,
    })).resolves.toEqual({ valid: true });
  });
});

describe('buildHttpApp', () => {
  afterEach(() => {
    clearAuthCache();
    vi.restoreAllMocks();
  });

  it('exposes health without opening a network port', async () => {
    const { app } = await buildHttpApp(() => ({}) as McpServer, {
      ...baseConfig,
      httpAuthRequired: false,
    });

    const response = await app.inject({ method: 'GET', url: '/health' });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.auth_required).toBe(false);
    expect(body.tools).toContain('gsep_chat');

    await app.close();
  });

  it('rejects MCP requests without a key when HTTP auth is required', async () => {
    const { app } = await buildHttpApp(() => ({}) as McpServer, baseConfig);

    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      payload: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.message).toContain('API key required');

    await app.close();
  });

  it('requires initialize before tool calls when auth is disabled', async () => {
    const { app } = await buildHttpApp(() => ({}) as McpServer, {
      ...baseConfig,
      httpAuthRequired: false,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      payload: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'gsep_get_status', arguments: {} },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toBe('Must initialize before sending other requests');

    await app.close();
  });

  it('cleans up expired sessions and closes their transports', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const sessions = new Map<string, HttpSessionEntry>([
      ['expired', {
        transport: { close } as never,
        createdAt: 1_000,
        lastSeenAt: 1_000,
      }],
      ['active', {
        transport: { close: vi.fn() } as never,
        createdAt: 2_000,
        lastSeenAt: 9_500,
      }],
    ]);

    const removed = await cleanupExpiredSessions(sessions, { sessionTtlMs: 5_000 }, 10_000);

    expect(removed).toBe(1);
    expect(sessions.has('expired')).toBe(false);
    expect(sessions.has('active')).toBe(true);
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects new MCP sessions when maxSessions is reached', async () => {
    const { app, sessions } = await buildHttpApp(() => ({}) as McpServer, {
      ...baseConfig,
      httpAuthRequired: false,
      maxSessions: 1,
    });
    sessions.set('existing', {
      transport: { close: vi.fn() } as never,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      payload: {
        jsonrpc: '2.0',
        id: 3,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().error.message).toContain('Too many active MCP sessions');

    await app.close();
  });

  it('reports resource limits in health and metrics', async () => {
    const { app } = await buildHttpApp(() => ({}) as McpServer, {
      ...baseConfig,
      httpAuthRequired: false,
      maxSessions: 7,
      maxGenomes: 11,
    });

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.json().max_sessions).toBe(7);
    expect(health.json().max_genomes).toBe(11);

    const metrics = await app.inject({ method: 'GET', url: '/metrics' });
    expect(metrics.body).toContain('gsep_max_sessions 7');
    expect(metrics.body).toContain('gsep_max_genomes 11');

    await app.close();
  });
});
