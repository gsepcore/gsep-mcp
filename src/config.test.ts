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
    expect(config.keyValidationUrl).toContain('/validate');
  });

  it('allows local deployments to disable HTTP auth explicitly', () => {
    vi.stubEnv('GSEP_HTTP_AUTH_REQUIRED', 'false');
    vi.stubEnv('GSEP_HTTP_AUTH_FAIL_OPEN', 'true');
    vi.stubEnv('GSEP_GATEWAY_ENABLED', 'false');
    vi.stubEnv('GSEP_GATEWAY_AUTH_REQUIRED', 'false');
    vi.stubEnv('GSEP_KEY_VALIDATION_URL', 'http://localhost:8787/validate');

    const config = loadConfig();

    expect(config.httpAuthRequired).toBe(false);
    expect(config.httpAuthFailOpen).toBe(true);
    expect(config.gatewayEnabled).toBe(false);
    expect(config.gatewayAuthRequired).toBe(false);
    expect(config.keyValidationUrl).toBe('http://localhost:8787/validate');
  });
});
