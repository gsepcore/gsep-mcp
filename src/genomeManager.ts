import path from 'path';
import { GSEP, getPreset } from '@gsep/core';
import type { GSEPMcpConfig } from './config.js';

// Cache genome instances — one per genome_id
const instances = new Map<string, Awaited<ReturnType<typeof GSEP.quickStart>>>();

export async function getGenome(genomeId: string, config: GSEPMcpConfig) {
  if (instances.has(genomeId)) {
    return instances.get(genomeId)!;
  }

  const llm = await buildLLMAdapter(config);
  const storagePath = path.join(config.storagePath, genomeId, 'gsep.sqlite');

  const genome = await GSEP.quickStart({
    name: genomeId,
    llm,
    preset: config.preset,
    storagePath,
  });

  instances.set(genomeId, genome);

  if (config.logLevel !== 'silent') {
    console.error(`[GSEP-MCP] Genome "${genomeId}" initialized (preset: ${config.preset})`);
  }

  return genome;
}

async function buildLLMAdapter(config: GSEPMcpConfig) {
  switch (config.llmProvider) {
    case 'anthropic': {
      const { ClaudeAdapter } = await import('@gsep/core/adapters-llm-anthropic');
      return new ClaudeAdapter({
        apiKey: config.apiKey!,
        model: config.model ?? 'claude-sonnet-4-5',
      });
    }
    case 'openai': {
      const { OpenAIAdapter } = await import('@gsep/core/adapters-llm-openai');
      return new OpenAIAdapter({
        apiKey: config.apiKey!,
        model: config.model ?? 'gpt-4o',
      });
    }
    case 'ollama': {
      const { OllamaAdapter } = await import('@gsep/core/adapters-llm-ollama');
      return new OllamaAdapter({
        model: config.model ?? 'llama3',
        baseUrl: process.env.OLLAMA_HOST ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
      });
    }
  }
}

export function listGenomes(): string[] {
  return Array.from(instances.keys());
}
