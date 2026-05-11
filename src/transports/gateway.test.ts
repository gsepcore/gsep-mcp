import { afterEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GSEPMcpConfig } from '../config.js';
import { getGenome } from '../genomeManager.js';
import { buildHttpApp, clearAuthCache } from './http.js';

vi.mock('../genomeManager.js', () => ({
  getGenome: vi.fn(),
}));

const config: GSEPMcpConfig = {
  llmProvider: 'openai',
  apiKey: 'sk-test',
  model: 'gpt-test',
  storagePath: '/tmp/gsep-mcp-test',
  httpPort: 0,
  httpHost: '127.0.0.1',
  httpAuthRequired: false,
  httpAuthFailOpen: false,
  keyValidationUrl: 'https://validator.example/validate',
  gatewayEnabled: true,
  gatewayAuthRequired: false,
  preset: 'full',
  logLevel: 'silent',
};

describe('OpenAI-compatible gateway', () => {
  afterEach(() => {
    clearAuthCache();
    vi.restoreAllMocks();
  });

  it('lists the configured model', async () => {
    const { app } = await buildHttpApp(() => ({}) as McpServer, config);

    const response = await app.inject({ method: 'GET', url: '/v1/models' });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.object).toBe('list');
    expect(body.data[0].id).toBe('gpt-test');

    await app.close();
  });

  it('wraps chat completions through GSEP chatWithStatus', async () => {
    const chatWithStatus = vi.fn().mockResolvedValue({
      content: 'Protected hello',
      gsep: { health: 'ok' },
    });
    vi.mocked(getGenome).mockResolvedValue({ chatWithStatus } as never);
    const { app } = await buildHttpApp(() => ({}) as McpServer, config);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      headers: { 'x-gsep-genome-id': 'gateway-agent', 'x-gsep-user-id': 'user-1' },
      payload: {
        model: 'gpt-test',
        messages: [
          { role: 'system', content: 'Be helpful.' },
          { role: 'user', content: 'Hello' },
        ],
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.object).toBe('chat.completion');
    expect(body.choices[0].message.content).toBe('Protected hello');
    expect(body.gsep.genome_id).toBe('gateway-agent');
    expect(chatWithStatus).toHaveBeenCalledWith(
      'system: Be helpful.\nuser: Hello',
      { userId: 'user-1', taskType: 'gateway-chat' },
    );

    await app.close();
  });

  it('wraps Responses API calls through GSEP chatWithStatus', async () => {
    const chatWithStatus = vi.fn().mockResolvedValue('Protected response');
    vi.mocked(getGenome).mockResolvedValue({ chatWithStatus } as never);
    const { app } = await buildHttpApp(() => ({}) as McpServer, config);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      payload: {
        model: 'gpt-test',
        input: 'Write a safe deployment plan.',
        gsep_genome_id: 'responses-agent',
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.object).toBe('response');
    expect(body.output_text).toBe('Protected response');
    expect(body.gsep.genome_id).toBe('responses-agent');

    await app.close();
  });

  it('rejects streaming requests explicitly', async () => {
    const { app } = await buildHttpApp(() => ({}) as McpServer, config);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: { stream: true, messages: [{ role: 'user', content: 'Hello' }] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('stream_not_supported');

    await app.close();
  });

  it('uses gateway auth when enabled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ valid: true, email: 'user@example.com', plan: 'pro' }),
    }));
    vi.mocked(getGenome).mockResolvedValue({
      chatWithStatus: vi.fn().mockResolvedValue('Authenticated response'),
    } as never);
    const { app } = await buildHttpApp(() => ({}) as McpServer, {
      ...config,
      gatewayAuthRequired: true,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      headers: { authorization: 'Bearer gsep-key' },
      payload: { messages: [{ role: 'user', content: 'Hello' }] },
    });

    expect(response.statusCode).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();

    await app.close();
  });
});
