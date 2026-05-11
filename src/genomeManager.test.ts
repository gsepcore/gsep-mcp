import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GSEPMcpConfig } from './config.js';
import {
  clearGenomeCache,
  getGenome,
  getGenomeCacheStats,
  listGenomes,
  pruneGenomeCache,
} from './genomeManager.js';
import { GSEP } from '@gsep/core';

vi.mock('@gsep/core', () => ({
  GSEP: {
    quickStart: vi.fn(async (options: { name: string }) => ({ id: options.name, name: options.name })),
  },
  SQLiteStorageAdapter: class SQLiteStorageAdapter {
    constructor(public readonly options: unknown) {}
  },
}));

const config: GSEPMcpConfig = {
  llmProvider: 'openai',
  apiKey: 'sk-test',
  storagePath: '/tmp/gsep-mcp-test',
  httpPort: 0,
  httpHost: '127.0.0.1',
  httpAuthRequired: false,
  httpAuthFailOpen: false,
  keyValidationUrl: 'https://validator.example/validate',
  gatewayEnabled: true,
  gatewayAuthRequired: false,
  sessionTtlMs: 30 * 60 * 1000,
  sessionCleanupIntervalMs: 60 * 1000,
  maxSessions: 500,
  genomeTtlMs: 1_000,
  maxGenomes: 2,
  preset: 'full',
  logLevel: 'silent',
};

describe('genomeManager resource safety', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.mocked(GSEP.quickStart).mockClear();
    clearGenomeCache();
  });

  afterEach(() => {
    clearGenomeCache();
    vi.useRealTimers();
  });

  it('reuses cached genomes and updates cache stats', async () => {
    const first = await getGenome('agent-1', config);
    vi.setSystemTime(100);
    const second = await getGenome('agent-1', config);

    expect(second).toBe(first);
    expect(GSEP.quickStart).toHaveBeenCalledOnce();
    expect(listGenomes()).toEqual(['agent-1']);
    expect(getGenomeCacheStats(config).activeGenomes).toBe(1);
  });

  it('evicts idle genomes after TTL', async () => {
    await getGenome('agent-1', config);
    vi.setSystemTime(config.genomeTtlMs + 1);

    const removed = pruneGenomeCache(config);

    expect(removed).toBe(1);
    expect(listGenomes()).toEqual([]);
  });

  it('evicts least recently used genomes when maxGenomes is exceeded', async () => {
    await getGenome('agent-1', config);
    vi.setSystemTime(100);
    await getGenome('agent-2', config);
    vi.setSystemTime(200);
    await getGenome('agent-1', config);
    vi.setSystemTime(300);
    await getGenome('agent-3', config);

    expect(listGenomes().sort()).toEqual(['agent-1', 'agent-3']);
  });

  it('disables dashboard auto-start for cached MCP genomes', async () => {
    await getGenome('agent-1', config);

    expect(GSEP.quickStart).toHaveBeenCalledWith(expect.objectContaining({
      name: 'agent-1',
      dashboardPort: 0,
    }));
  });
});
