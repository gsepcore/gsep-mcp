import path from 'path';
import { GSEP, SQLiteStorageAdapter } from '@gsep/core';
import type { GSEPMcpConfig } from './config.js';

type GenomeInstance = Awaited<ReturnType<typeof GSEP.quickStart>>;

interface GenomeCacheEntry {
  genome: GenomeInstance;
  createdAt: number;
  lastAccessedAt: number;
}

const instances = new Map<string, GenomeCacheEntry>();

export async function getGenome(genomeId: string, config: GSEPMcpConfig) {
  pruneGenomeCache(config);

  const cached = instances.get(genomeId);
  if (cached) {
    cached.lastAccessedAt = Date.now();
    return cached.genome;
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
    dashboardPort: 0,
  });

  instances.set(genomeId, {
    genome,
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
  });
  enforceMaxGenomes(config);

  if (config.logLevel !== 'silent') {
    console.error(`[GSEP-MCP] Genome "${genomeId}" initialized (preset: ${config.preset})`);
  }

  return genome;
}

export function listGenomes(): string[] {
  return Array.from(instances.keys());
}

export function getGenomeCacheStats(config?: GSEPMcpConfig) {
  const now = Date.now();
  const entries = Array.from(instances.entries()).map(([id, entry]) => ({
    id,
    ageMs: now - entry.createdAt,
    idleMs: now - entry.lastAccessedAt,
  }));

  return {
    activeGenomes: instances.size,
    maxGenomes: config?.maxGenomes ?? null,
    genomeTtlMs: config?.genomeTtlMs ?? null,
    entries,
  };
}

export function pruneGenomeCache(config: Pick<GSEPMcpConfig, 'genomeTtlMs' | 'maxGenomes'>, now = Date.now()): number {
  let removed = 0;

  for (const [id, entry] of instances.entries()) {
    if (now - entry.lastAccessedAt > config.genomeTtlMs) {
      instances.delete(id);
      removed++;
    }
  }

  removed += enforceMaxGenomes(config);
  return removed;
}

export function clearGenomeCache(): void {
  instances.clear();
}

function enforceMaxGenomes(config: Pick<GSEPMcpConfig, 'maxGenomes'>): number {
  let removed = 0;

  while (instances.size > config.maxGenomes) {
    const oldest = Array.from(instances.entries())
      .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt)[0];
    if (!oldest) break;
    instances.delete(oldest[0]);
    removed++;
  }

  return removed;
}
