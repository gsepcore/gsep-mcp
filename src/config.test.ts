import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults HTTP auth to fail-closed mode', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('OLLAMA_HOST', '');
    vi.stubEnv('OLLAMA_BASE_URL', '');

    const config = loadConfig();

    expect(config.httpAuthRequired).toBe(true);
    expect(config.httpAuthFailOpen).toBe(false);
    expect(config.gatewayEnabled).toBe(true);
    expect(config.gatewayAuthRequired).toBe(true);
    expect(config.sessionTtlMs).toBe(30 * 60 * 1000);
    expect(config.sessionCleanupIntervalMs).toBe(60 * 1000);
    expect(config.maxSessions).toBe(500);
    expect(config.genomeTtlMs).toBe(60 * 60 * 1000);
    expect(config.maxGenomes).toBe(100);
    expect(config.keyValidationUrl).toContain('/validate');
  });

  it('allows local deployments to disable HTTP auth explicitly', () => {
    vi.stubEnv('GSEP_HTTP_AUTH_REQUIRED', 'false');
    vi.stubEnv('GSEP_HTTP_AUTH_FAIL_OPEN', 'true');
    vi.stubEnv('GSEP_GATEWAY_ENABLED', 'false');
    vi.stubEnv('GSEP_GATEWAY_AUTH_REQUIRED', 'false');
    vi.stubEnv('GSEP_KEY_VALIDATION_URL', 'http://localhost:8787/validate');
    vi.stubEnv('GSEP_SESSION_TTL_MS', '1000');
    vi.stubEnv('GSEP_SESSION_CLEANUP_INTERVAL_MS', '500');
    vi.stubEnv('GSEP_MAX_SESSIONS', '2');
    vi.stubEnv('GSEP_GENOME_TTL_MS', '2000');
    vi.stubEnv('GSEP_MAX_GENOMES', '3');

    const config = loadConfig();

    expect(config.httpAuthRequired).toBe(false);
    expect(config.httpAuthFailOpen).toBe(true);
    expect(config.gatewayEnabled).toBe(false);
    expect(config.gatewayAuthRequired).toBe(false);
    expect(config.keyValidationUrl).toBe('http://localhost:8787/validate');
    expect(config.sessionTtlMs).toBe(1000);
    expect(config.sessionCleanupIntervalMs).toBe(500);
    expect(config.maxSessions).toBe(2);
    expect(config.genomeTtlMs).toBe(2000);
    expect(config.maxGenomes).toBe(3);
  });
});
