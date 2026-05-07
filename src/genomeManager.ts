import path from 'path';
import { GSEP, SQLiteStorageAdapter } from '@gsep/core';
import type { GSEPMcpConfig } from './config.js';

const instances = new Map<string, Awaited<ReturnType<typeof GSEP.quickStart>>>();

export async function getGenome(genomeId: string, config: GSEPMcpConfig) {
  if (instances.has(genomeId)) {
    return instances.get(genomeId)!;
  }

  if (config.llmProvider === 'none') {
    throw new Error(
      'No LLM provider configured for this genome. ' +
      'Pass your API key when calling gsep_chat: { genome_id, message, api_key: "sk-ant-..." }'
    );
  }

  const storagePath = path.join(config.storagePath, genomeId, 'gsep.sqlite');

  const genome = await GSEP.quickStart({
    name: genomeId,
    provider: config.llmProvider,
    apiKey: config.apiKey,
    model: config.model,
    ollamaHost: process.env.OLLAMA_HOST ?? process.env.OLLAMA_BASE_URL,
    preset: config.preset,
    storage: new SQLiteStorageAdapter({ path: storagePath }),
  });

  instances.set(genomeId, genome);

  if (config.logLevel !== 'silent') {
    console.error(`[GSEP-MCP] Genome "${genomeId}" initialized (preset: ${config.preset})`);
  }

  return genome;
}

export function listGenomes(): string[] {
  return Array.from(instances.keys());
}
