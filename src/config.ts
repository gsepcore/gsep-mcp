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
    preset: (process.env.GSEP_PRESET as GSEPMcpConfig['preset']) ?? 'full',
    logLevel: (process.env.GSEP_LOG_LEVEL as GSEPMcpConfig['logLevel']) ?? 'info',
  };
}

function detectProvider(): GSEPMcpConfig['llmProvider'] {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.OLLAMA_HOST || process.env.OLLAMA_BASE_URL) return 'ollama';
  // No LLM configured — server starts anyway, gsep_chat will fail gracefully
  return 'none';
}
