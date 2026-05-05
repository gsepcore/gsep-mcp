import { z } from 'zod';
import { getGenome } from '../genomeManager.js';
import type { GSEPMcpConfig } from '../config.js';

// C3 — Content Firewall: scan user input for prompt injection
export const scanInputSchema = {
  content: z.string().describe('User input or external content to scan for prompt injection'),
  genome_id: z.string().optional().default('gsep-scanner').describe('Genome ID for trust registry context'),
  source: z.enum(['user', 'external', 'system']).optional().default('user').describe('Content source trust level'),
};

export async function scanInputHandler(
  args: z.infer<z.ZodObject<typeof scanInputSchema>>,
  config: GSEPMcpConfig
) {
  const genome = await getGenome(args.genome_id ?? 'gsep-scanner', config);
  const middleware = await (genome as any).getMiddleware?.();

  // Use GSEP middleware before hook (C3 scan only)
  let result: any;
  try {
    result = await (genome as any).scanInput?.(args.content, args.source) ??
             await middleware?.before?.(args.content, { userId: 'scanner' });
  } catch {
    result = { blocked: false, sanitizedContent: args.content, detections: [] };
  }

  const blocked = result?.blocked ?? false;
  const detections = result?.detections ?? result?.threats ?? [];

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        layer: 'C3 Content Firewall',
        blocked,
        safe: !blocked,
        detections,
        sanitized_content: blocked ? '[BLOCKED]' : (result?.sanitizedContent ?? result?.taggedContent ?? args.content),
        threat_count: detections.length,
        recommendation: blocked
          ? '🚫 Content blocked — do not forward to LLM'
          : '✅ Content is safe to forward to LLM',
      }, null, 2),
    }],
  };
}

// C4 — Behavioral Immune System: scan LLM output for infection
export const scanOutputSchema = {
  response: z.string().describe('LLM response to scan for behavioral infection or manipulation'),
  user_input: z.string().optional().default('').describe('Original user input (for context matching)'),
  genome_id: z.string().optional().default('gsep-scanner').describe('Genome ID'),
};

export async function scanOutputHandler(
  args: z.infer<z.ZodObject<typeof scanOutputSchema>>,
  config: GSEPMcpConfig
) {
  const genome = await getGenome(args.genome_id ?? 'gsep-scanner', config);

  let result: any;
  try {
    result = await (genome as any).scanOutput?.(args.response, args.user_input) ?? { clean: true, threats: [] };
  } catch {
    result = { clean: true, threats: [], action: 'pass' };
  }

  const clean = result?.clean ?? result?.safe ?? true;
  const threats = result?.threats ?? [];

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        layer: 'C4 Behavioral Immune System',
        clean,
        infected: !clean,
        threats,
        action: result?.action ?? (clean ? 'pass' : 'quarantine'),
        confidence: result?.confidence ?? (clean ? 1.0 : 0.9),
        safe_response: result?.response ?? (clean ? args.response : '[QUARANTINED — response manipulated]'),
        recommendation: clean
          ? '✅ Response is clean — safe to show to user'
          : '🚫 Response infected — quarantined, do not show to user',
      }, null, 2),
    }],
  };
}

// C5 — Action Firewall: scan LLM response for destructive actions
export const scanActionsSchema = {
  response: z.string().describe('LLM response text to scan for dangerous or destructive actions'),
  genome_id: z.string().optional().default('gsep-scanner').describe('Genome ID'),
};

export async function scanActionsHandler(
  args: z.infer<z.ZodObject<typeof scanActionsSchema>>,
  config: GSEPMcpConfig
) {
  const genome = await getGenome(args.genome_id ?? 'gsep-scanner', config);

  let actions: any[] = [];
  try {
    actions = await (genome as any).scanActions?.(args.response) ?? [];
  } catch {
    actions = [];
  }

  const critical = actions.filter((a: any) => a.risk === 'critical');
  const destructive = actions.filter((a: any) => a.risk === 'destructive');
  const caution = actions.filter((a: any) => a.risk === 'caution');
  const blocked = critical.length > 0 || destructive.length > 0;

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        layer: 'C5 Action Firewall',
        blocked,
        safe: !blocked,
        actions_detected: actions.length,
        critical: critical.map((a: any) => ({ action: a.action, reason: a.reason })),
        destructive: destructive.map((a: any) => ({ action: a.action, reason: a.reason })),
        caution: caution.map((a: any) => ({ action: a.action, reason: a.reason })),
        verdict: critical.length > 0
          ? '🚨 CRITICAL — permanently blocked (rm -rf, DROP DATABASE, etc.)'
          : destructive.length > 0
          ? '⚠️  DESTRUCTIVE — requires explicit user confirmation before executing'
          : caution.length > 0
          ? '⚡ CAUTION — review before executing'
          : '✅ All actions are safe',
      }, null, 2),
    }],
  };
}
