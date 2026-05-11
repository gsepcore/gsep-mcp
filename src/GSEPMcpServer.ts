import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { GSEPMcpConfig } from './config.js';
import { chatSchema, chatHandler } from './tools/chatTool.js';
import { scanInputSchema, scanInputHandler, scanOutputSchema, scanOutputHandler, scanActionsSchema, scanActionsHandler } from './tools/scanTools.js';
import { statusSchema, statusHandler } from './tools/statusTool.js';
import { feedbackSchema, feedbackHandler } from './tools/feedbackTool.js';
import {
  afterLlmHandler,
  afterLlmSchema,
  afterToolHandler,
  afterToolSchema,
  beforeLlmHandler,
  beforeLlmSchema,
  beforeToolHandler,
  beforeToolSchema,
} from './tools/middlewareTools.js';

export function createMcpServer(config: GSEPMcpConfig): McpServer {
  const server = new McpServer({
    name: 'gsep-mcp',
    version: '1.0.7',
  });

  // gsep_chat — Full 32-step pipeline (C3 → LLM → C4 → C5 → fitness → evolution)
  server.tool(
    'gsep_chat',
    'Send a message through the full GSEP pipeline. Runs C3 prompt injection scan, enhanced LLM call with evolved genes, C4 behavioral immune check, C5 action firewall, fitness tracking, and autonomous evolution. Returns the protected response.',
    chatSchema,
    (args) => chatHandler(args as any, config)
  );

  // gsep_scan_input — C3 Content Firewall only
  server.tool(
    'gsep_scan_input',
    'Scan user input with C3 Content Firewall (53 patterns). Detects prompt injection, role hijacking, data exfiltration attempts, encoding evasion, and more. Use this before sending any external content to your LLM.',
    scanInputSchema,
    (args) => scanInputHandler(args as any, config)
  );

  // gsep_scan_output — C4 Behavioral Immune System only
  server.tool(
    'gsep_scan_output',
    'Scan LLM output with C4 Behavioral Immune System (6 checks). Detects if the response was infected by Indirect Prompt Injection — system prompt leakage, role confusion, data exfiltration patterns, and more.',
    scanOutputSchema,
    (args) => scanOutputHandler(args as any, config)
  );

  // gsep_scan_actions — C5 Action Firewall only
  server.tool(
    'gsep_scan_actions',
    'Scan LLM response for dangerous or destructive actions with C5 Action Firewall (80+ patterns). Classifies actions as safe/caution/destructive/critical. Permanently blocks rm -rf, DROP DATABASE, disk wipes, etc.',
    scanActionsSchema,
    (args) => scanActionsHandler(args as any, config)
  );

  // gsep_before_llm — middleware hook before any external LLM call
  server.tool(
    'gsep_before_llm',
    'Middleware hook to run before any agent calls an LLM. Returns enhanced_prompt, sanitized_message, and C3/security status. Use this when GSEP-MCP protects an existing external agent rather than owning the LLM call.',
    beforeLlmSchema,
    (args) => beforeLlmHandler(args as any, config)
  );

  // gsep_after_llm — middleware hook after any external LLM call
  server.tool(
    'gsep_after_llm',
    'Middleware hook to run after an external LLM responds. Runs C4 behavioral immune checks, records fitness, and returns safe_response before content is shown to users or tools.',
    afterLlmSchema,
    (args) => afterLlmHandler(args as any, config)
  );

  // gsep_before_tool — middleware hook before executing tools/actions
  server.tool(
    'gsep_before_tool',
    'Middleware hook to run before an agent executes a tool, shell command, database query, filesystem action, or API call. Uses C5 Action Firewall to block destructive actions before execution.',
    beforeToolSchema,
    (args) => beforeToolHandler(args as any)
  );

  // gsep_after_tool — middleware hook after external tool output
  server.tool(
    'gsep_after_tool',
    'Middleware hook to run after a tool returns external content and before that content is fed back into an agent/LLM. Scans for prompt injection and dangerous action instructions.',
    afterToolSchema,
    (args) => afterToolHandler(args as any, config)
  );

  // gsep_get_status — Genome health, fitness, evolution stats
  server.tool(
    'gsep_get_status',
    'Get genome health, fitness scores, drift status, evolution generation, and security stats. Omit genome_id to list all active genomes.',
    statusSchema,
    (args) => statusHandler(args as any, config)
  );

  // gsep_record_feedback — User satisfaction signal for evolution
  server.tool(
    'gsep_record_feedback',
    'Record user satisfaction feedback for a genome. Positive signals reinforce current gene configuration. Negative signals trigger evolution on the next cycle.',
    feedbackSchema,
    (args) => feedbackHandler(args as any, config)
  );

  return server;
}
