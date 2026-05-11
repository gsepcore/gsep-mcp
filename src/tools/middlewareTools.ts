import { z } from 'zod';
import { ActionFirewall } from '@gsep/core';
import { getGenome } from '../genomeManager.js';
import type { GSEPMcpConfig } from '../config.js';

export const beforeLlmSchema = {
  genome_id: z.string().describe('Unique identifier for this agent genome'),
  message: z.string().describe('User message or external content before it reaches the LLM'),
  user_id: z.string().optional().describe('User identifier for personalization and audit context'),
  task_type: z.string().optional().describe('Task type hint, e.g. support, coding, research'),
  batch_size: z.number().int().positive().optional().describe('Optional batch size hint for batch workflows'),
};

export async function beforeLlmHandler(
  args: z.infer<z.ZodObject<typeof beforeLlmSchema>>,
  config: GSEPMcpConfig
) {
  const genome = await getGenome(args.genome_id, config);
  const result = await genome.beforeLLM(args.message, {
    userId: args.user_id ?? 'mcp-user',
    taskType: args.task_type ?? 'general',
    batchSize: args.batch_size,
  });

  return jsonContent({
    layer: 'GSEP beforeLLM',
    genome_id: args.genome_id,
    blocked: result.blocked,
    safe: !result.blocked,
    block_reason: result.blockReason ?? null,
    threats: (result as any).threats ?? [],
    sanitized_message: result.sanitizedMessage,
    enhanced_prompt: result.prompt,
    recommendation: result.blocked
      ? 'Block this request before calling the LLM.'
      : 'Send enhanced_prompt to the LLM instead of the raw message.',
  });
}

export const afterLlmSchema = {
  genome_id: z.string().describe('Unique identifier for this agent genome'),
  user_message: z.string().describe('Original user message that produced this LLM response'),
  response: z.string().describe('Raw LLM response to verify before showing or executing'),
  user_id: z.string().optional().describe('User identifier for personalization and audit context'),
  task_type: z.string().optional().describe('Task type hint, e.g. support, coding, research'),
};

export async function afterLlmHandler(
  args: z.infer<z.ZodObject<typeof afterLlmSchema>>,
  config: GSEPMcpConfig
) {
  const genome = await getGenome(args.genome_id, config);
  const result = await genome.afterLLM(args.user_message, args.response, {
    userId: args.user_id ?? 'mcp-user',
    taskType: args.task_type ?? 'general',
  });

  return jsonContent({
    layer: 'GSEP afterLLM',
    genome_id: args.genome_id,
    safe: result.safe,
    blocked: !result.safe,
    threats: result.threats,
    fitness: result.fitness,
    safe_response: result.response,
    recommendation: result.safe
      ? 'Response is safe to show to the user.'
      : 'Use safe_response and do not show the raw response.',
  });
}

export const beforeToolSchema = {
  tool_name: z.string().describe('Name of the tool/action the agent wants to call'),
  tool_input: z.record(z.unknown()).optional().describe('Structured tool arguments, if available'),
  command: z.string().optional().describe('Exact shell/SQL/API action string, when applicable'),
  user_id: z.string().optional().describe('User identifier for audit context'),
  genome_id: z.string().optional().describe('Optional genome identifier for downstream correlation'),
};

export async function beforeToolHandler(
  args: z.infer<z.ZodObject<typeof beforeToolSchema>>
) {
  const firewall = new ActionFirewall();
  const action = formatToolAction(args.tool_name, args.tool_input, args.command);
  const verdict = await firewall.evaluate(action);

  return jsonContent({
    layer: 'GSEP beforeTool',
    genome_id: args.genome_id ?? null,
    user_id: args.user_id ?? null,
    tool_name: args.tool_name,
    allowed: verdict.allowed,
    blocked: !verdict.allowed,
    requires_confirmation: verdict.requiresConfirmation,
    risk: verdict.classification.risk,
    reason: verdict.classification.reason,
    matched_pattern: verdict.classification.matchedPattern,
    action: verdict.classification.action,
    block_message: verdict.blockMessage ?? null,
    recommendation: verdict.allowed
      ? 'Tool call may proceed.'
      : 'Block this tool call before execution.',
  });
}

export const afterToolSchema = {
  genome_id: z.string().describe('Unique identifier for this agent genome'),
  tool_name: z.string().describe('Name of the tool that produced this result'),
  tool_result: z.string().describe('Raw tool output before it is sent back into the agent/LLM context'),
  user_message: z.string().optional().describe('Original user request, if available'),
  user_id: z.string().optional().describe('User identifier for personalization and audit context'),
  task_type: z.string().optional().describe('Task type hint, e.g. support, coding, research'),
};

export async function afterToolHandler(
  args: z.infer<z.ZodObject<typeof afterToolSchema>>,
  config: GSEPMcpConfig
) {
  const firewall = new ActionFirewall();
  const dangerousActions = firewall.scanText(args.tool_result);
  const genome = await getGenome(args.genome_id, config);
  const scan = await genome.beforeLLM(args.tool_result, {
    userId: args.user_id ?? 'mcp-user',
    taskType: args.task_type ?? 'tool-result',
  });

  if (args.user_message) {
    await genome.recordExternalInteraction({
      userMessage: args.user_message,
      response: args.tool_result,
      userId: args.user_id ?? 'mcp-user',
      taskType: args.task_type ?? 'tool-result',
      success: !scan.blocked && dangerousActions.length === 0,
    });
  }

  const blocked = scan.blocked || dangerousActions.some(a => a.risk === 'critical' || a.risk === 'destructive');

  return jsonContent({
    layer: 'GSEP afterTool',
    genome_id: args.genome_id,
    tool_name: args.tool_name,
    safe: !blocked,
    blocked,
    prompt_injection_threats: (scan as any).threats ?? [],
    action_threats: dangerousActions.map(a => ({
      action: a.action,
      risk: a.risk,
      reason: a.reason,
      matched_pattern: a.matchedPattern,
    })),
    sanitized_result: scan.sanitizedMessage,
    enhanced_prompt: scan.prompt,
    recommendation: blocked
      ? 'Do not feed the raw tool result back into the agent. Use sanitized_result or stop the workflow.'
      : 'Tool result is safe to feed back into the agent context.',
  });
}

function formatToolAction(toolName: string, toolInput?: Record<string, unknown>, command?: string): string {
  if (command?.trim()) return command.trim();
  const input = toolInput ? JSON.stringify(toolInput) : '{}';
  return `${toolName} ${input}`;
}

function jsonContent(value: unknown) {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(value, null, 2),
    }],
  };
}
