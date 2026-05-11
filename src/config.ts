import 'dotenv/config';
import os from 'os';
import path from 'path';

export interface GSEPMcpConfig {
  llmProvider: 'anthropic' | 'openai' | 'ollama' | 'none';
  apiKey?: string;
  model?: string;
  storagePath: string;
  httpPort: number;
  httpHost: string;
  httpAuthRequired: boolean;
  httpAuthFailOpen: boolean;
  keyValidationUrl: string;
  gatewayEnabled: boolean;
  gatewayAuthRequired: boolean;
  sessionTtlMs: number;
  sessionCleanupIntervalMs: number;
  maxSessions: number;
  genomeTtlMs: number;
  maxGenomes: number;
  preset: 'minimal' | 'standard' | 'conscious' | 'full';
  logLevel: 'silent' | 'info' | 'debug';
}

export function loadConfig(): GSEPMcpConfig {
  return {
    llmProvider: detectProvider(),
    apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY,
    model: process.env.GSEP_MODEL,
    storagePath: process.env.GSEP_STORAGE_PATH ?? path.join(os.homedir(), '.gsep-mcp'),
    httpPort: parseInt(process.env.GSEP_HTTP_PORT ?? '3100', 10),
    httpHost: process.env.GSEP_HTTP_HOST ?? '0.0.0.0',
    httpAuthRequired: parseBoolean(process.env.GSEP_HTTP_AUTH_REQUIRED, true),
    httpAuthFailOpen: parseBoolean(process.env.GSEP_HTTP_AUTH_FAIL_OPEN, false),
    keyValidationUrl: process.env.GSEP_KEY_VALIDATION_URL ?? 'https://gsep-mcp-api.luiggistattoo.workers.dev/validate',
    gatewayEnabled: parseBoolean(process.env.GSEP_GATEWAY_ENABLED, true),
    gatewayAuthRequired: parseBoolean(process.env.GSEP_GATEWAY_AUTH_REQUIRED, parseBoolean(process.env.GSEP_HTTP_AUTH_REQUIRED, true)),
    sessionTtlMs: parsePositiveInt(process.env.GSEP_SESSION_TTL_MS, 30 * 60 * 1000),
    sessionCleanupIntervalMs: parsePositiveInt(process.env.GSEP_SESSION_CLEANUP_INTERVAL_MS, 60 * 1000),
    maxSessions: parsePositiveInt(process.env.GSEP_MAX_SESSIONS, 500),
    genomeTtlMs: parsePositiveInt(process.env.GSEP_GENOME_TTL_MS, 60 * 60 * 1000),
    maxGenomes: parsePositiveInt(process.env.GSEP_MAX_GENOMES, 100),
    preset: (process.env.GSEP_PRESET as GSEPMcpConfig['preset']) ?? 'full',
    logLevel: (process.env.GSEP_LOG_LEVEL as GSEPMcpConfig['logLevel']) ?? 'info',
  };
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function detectProvider(): GSEPMcpConfig['llmProvider'] {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.OLLAMA_HOST || process.env.OLLAMA_BASE_URL) return 'ollama';
  // No LLM configured — server starts anyway, gsep_chat will fail gracefully
  return 'none';
}
