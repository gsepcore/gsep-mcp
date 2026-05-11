import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getGenome } from '../genomeManager.js';
import type { GSEPMcpConfig } from '../config.js';
import { extractApiKey, validateKey } from './http.js';

type ChatMessage = {
  role: 'system' | 'developer' | 'user' | 'assistant' | 'tool';
  content?: unknown;
  name?: string;
};

type ChatCompletionRequest = {
  model?: string;
  messages?: ChatMessage[];
  stream?: boolean;
  user?: string;
  gsep_genome_id?: string;
};

type ResponsesRequest = {
  model?: string;
  input?: unknown;
  stream?: boolean;
  user?: string;
  gsep_genome_id?: string;
};

export function registerGatewayRoutes(app: FastifyInstance, config: GSEPMcpConfig) {
  app.get('/v1/models', async (req, reply) => {
    const auth = await authorizeGateway(req, config);
    if (!auth.valid) return sendGatewayAuthError(reply);

    return {
      object: 'list',
      data: [{
        id: config.model ?? modelForProvider(config.llmProvider),
        object: 'model',
        created: 0,
        owned_by: 'gsep',
      }],
    };
  });

  app.post('/v1/chat/completions', async (req, reply) => {
    const auth = await authorizeGateway(req, config);
    if (!auth.valid) return sendGatewayAuthError(reply);

    const body = req.body as ChatCompletionRequest;
    if (body.stream) {
      return reply.code(400).send(errorResponse('stream_not_supported', 'GSEP Gateway currently supports non-streaming chat completions.'));
    }
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return reply.code(400).send(errorResponse('invalid_request', 'messages must be a non-empty array.'));
    }

    const model = body.model ?? config.model ?? modelForProvider(config.llmProvider);
    const genomeId = resolveGenomeId(req, body.gsep_genome_id, model);
    const userId = body.user ?? header(req, 'x-gsep-user-id') ?? 'gateway-user';
    const prompt = messagesToTranscript(body.messages);
    const genome = await getGenome(genomeId, { ...config, model });
    const result = await genome.chatWithStatus(prompt, {
      userId,
      taskType: header(req, 'x-gsep-task-type') ?? 'gateway-chat',
    });

    const text = typeof result === 'string' ? result : result.content ?? String(result);
    const created = Math.floor(Date.now() / 1000);
    const promptTokens = estimateTokens(prompt);
    const completionTokens = estimateTokens(text);

    return {
      id: `chatcmpl-gsep-${crypto.randomUUID()}`,
      object: 'chat.completion',
      created,
      model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
      gsep: metadata(result, genomeId),
    };
  });

  app.post('/v1/responses', async (req, reply) => {
    const auth = await authorizeGateway(req, config);
    if (!auth.valid) return sendGatewayAuthError(reply);

    const body = req.body as ResponsesRequest;
    if (body.stream) {
      return reply.code(400).send(errorResponse('stream_not_supported', 'GSEP Gateway currently supports non-streaming responses.'));
    }

    const input = inputToText(body.input);
    if (!input) {
      return reply.code(400).send(errorResponse('invalid_request', 'input is required.'));
    }

    const model = body.model ?? config.model ?? modelForProvider(config.llmProvider);
    const genomeId = resolveGenomeId(req, body.gsep_genome_id, model);
    const userId = body.user ?? header(req, 'x-gsep-user-id') ?? 'gateway-user';
    const genome = await getGenome(genomeId, { ...config, model });
    const result = await genome.chatWithStatus(input, {
      userId,
      taskType: header(req, 'x-gsep-task-type') ?? 'gateway-response',
    });

    const text = typeof result === 'string' ? result : result.content ?? String(result);
    const inputTokens = estimateTokens(input);
    const outputTokens = estimateTokens(text);

    return {
      id: `resp_gsep_${crypto.randomUUID()}`,
      object: 'response',
      created_at: Math.floor(Date.now() / 1000),
      status: 'completed',
      model,
      output: [{
        id: `msg_gsep_${crypto.randomUUID()}`,
        type: 'message',
        status: 'completed',
        role: 'assistant',
        content: [{ type: 'output_text', text }],
      }],
      output_text: text,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
      },
      gsep: metadata(result, genomeId),
    };
  });
}

async function authorizeGateway(req: FastifyRequest, config: GSEPMcpConfig) {
  if (!config.gatewayAuthRequired) return { valid: true };
  const key = extractApiKey({ url: req.url, headers: req.headers });
  return validateKey(key, {
    validationUrl: config.keyValidationUrl,
    failOpen: config.httpAuthFailOpen,
  });
}

function sendGatewayAuthError(reply: FastifyReply) {
  return reply.code(401).send(errorResponse('unauthorized', 'GSEP Gateway API key required.'));
}

function errorResponse(code: string, message: string) {
  return {
    error: {
      message,
      type: 'gsep_gateway_error',
      code,
    },
  };
}

function messagesToTranscript(messages: ChatMessage[]): string {
  return messages
    .map((message) => {
      const name = message.name ? `:${message.name}` : '';
      return `${message.role}${name}: ${contentToText(message.content)}`;
    })
    .join('\n');
}

function inputToText(input: unknown): string {
  if (typeof input === 'string') return input;
  if (Array.isArray(input)) {
    return input.map(contentToText).filter(Boolean).join('\n');
  }
  return contentToText(input);
}

function contentToText(content: unknown): string {
  if (content === undefined || content === null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(contentToText).filter(Boolean).join('\n');
  if (typeof content === 'object') {
    const record = content as Record<string, unknown>;
    if (typeof record.text === 'string') return record.text;
    if (typeof record.input_text === 'string') return record.input_text;
    if (typeof record.output_text === 'string') return record.output_text;
    if (typeof record.content === 'string') return record.content;
  }
  return JSON.stringify(content);
}

function resolveGenomeId(req: FastifyRequest, explicitGenomeId: string | undefined, model: string): string {
  return explicitGenomeId
    ?? header(req, 'x-gsep-genome-id')
    ?? `gateway-${sanitizeId(model)}`;
}

function sanitizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'default';
}

function header(req: FastifyRequest, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function modelForProvider(provider: GSEPMcpConfig['llmProvider']): string {
  switch (provider) {
    case 'anthropic':
      return 'claude-sonnet-4-5';
    case 'openai':
      return 'gpt-4o-mini';
    case 'ollama':
      return 'llama3.1';
    case 'none':
      return 'gsep-protected';
  }
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function metadata(result: unknown, genomeId: string) {
  const gsep = typeof result === 'object' && result !== null && 'gsep' in result
    ? (result as { gsep?: unknown }).gsep
    : null;
  return { genome_id: genomeId, status: gsep };
}
