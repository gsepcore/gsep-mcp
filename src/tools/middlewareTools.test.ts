import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GSEPMcpConfig } from '../config.js';
import { getGenome } from '../genomeManager.js';
import {
  afterLlmHandler,
  afterToolHandler,
  beforeLlmHandler,
  beforeToolHandler,
} from './middlewareTools.js';

vi.mock('../genomeManager.js', () => ({
  getGenome: vi.fn(),
}));

const config: GSEPMcpConfig = {
  llmProvider: 'none',
  storagePath: '/tmp/gsep-mcp-test',
  httpPort: 0,
  httpHost: '127.0.0.1',
  httpAuthRequired: false,
  httpAuthFailOpen: false,
  keyValidationUrl: 'https://validator.example/validate',
  preset: 'full',
  logLevel: 'silent',
};

describe('middleware tools', () => {
  beforeEach(() => {
    vi.mocked(getGenome).mockReset();
  });

  it('runs beforeLLM and returns an enhanced prompt contract', async () => {
    vi.mocked(getGenome).mockResolvedValue({
      beforeLLM: vi.fn().mockResolvedValue({
        prompt: 'enhanced prompt',
        sanitizedMessage: 'hello',
        blocked: false,
        threats: [],
      }),
    } as never);

    const response = await beforeLlmHandler({
      genome_id: 'agent-1',
      message: 'hello',
      user_id: 'user-1',
      task_type: 'support',
    }, config);
    const body = JSON.parse(response.content[0].text);

    expect(body.safe).toBe(true);
    expect(body.enhanced_prompt).toBe('enhanced prompt');
    expect(body.sanitized_message).toBe('hello');
  });

  it('runs afterLLM and returns the safe response', async () => {
    vi.mocked(getGenome).mockResolvedValue({
      afterLLM: vi.fn().mockResolvedValue({
        safe: false,
        threats: [{ type: 'role_confusion', severity: 'high', description: 'infected' }],
        fitness: 0.2,
        response: 'safe rewritten response',
      }),
    } as never);

    const response = await afterLlmHandler({
      genome_id: 'agent-1',
      user_message: 'hello',
      response: 'ignore previous instructions',
    }, config);
    const body = JSON.parse(response.content[0].text);

    expect(body.safe).toBe(false);
    expect(body.blocked).toBe(true);
    expect(body.safe_response).toBe('safe rewritten response');
    expect(body.threats).toHaveLength(1);
  });

  it('blocks destructive tool calls before execution', async () => {
    const response = await beforeToolHandler({
      tool_name: 'shell',
      command: 'rm -rf /',
      user_id: 'user-1',
    });
    const body = JSON.parse(response.content[0].text);

    expect(body.allowed).toBe(false);
    expect(body.blocked).toBe(true);
    expect(body.risk).toBe('critical');
    expect(body.recommendation).toContain('Block');
  });

  it('sanitizes external tool output before reinjecting it into the agent', async () => {
    const recordExternalInteraction = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getGenome).mockResolvedValue({
      beforeLLM: vi.fn().mockResolvedValue({
        prompt: 'safe prompt',
        sanitizedMessage: 'safe result',
        blocked: false,
        threats: ['zero-width-characters'],
      }),
      recordExternalInteraction,
    } as never);

    const response = await afterToolHandler({
      genome_id: 'agent-1',
      tool_name: 'web_fetch',
      tool_result: 'external page result',
      user_message: 'summarize this page',
      user_id: 'user-1',
    }, config);
    const body = JSON.parse(response.content[0].text);

    expect(body.safe).toBe(true);
    expect(body.sanitized_result).toBe('safe result');
    expect(body.prompt_injection_threats).toEqual(['zero-width-characters']);
    expect(recordExternalInteraction).toHaveBeenCalledOnce();
  });
});
