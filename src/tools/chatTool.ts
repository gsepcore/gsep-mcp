import { z } from 'zod';
import { getGenome } from '../genomeManager.js';
import type { GSEPMcpConfig } from '../config.js';

export const chatSchema = {
  genome_id: z.string().describe('Unique identifier for this agent genome (e.g. "my-assistant")'),
  message: z.string().describe('User message to send through the full GSEP pipeline'),
  user_id: z.string().optional().describe('User identifier for personalization and per-user epigenomes'),
  task_type: z.string().optional().describe('Task type hint (e.g. "support", "coding", "general")'),
};

export async function chatHandler(
  args: z.infer<z.ZodObject<typeof chatSchema>>,
  config: GSEPMcpConfig
) {
  const genome = await getGenome(args.genome_id, config);

  const result = await genome.chatWithStatus(args.message, {
    userId: args.user_id ?? 'mcp-user',
    taskType: (args.task_type as any) ?? 'general',
  });

  const gsep = result.gsep ?? {};

  return {
    content: [
      {
        type: 'text' as const,
        text: typeof result === 'string' ? result : result.content ?? String(result),
      },
      {
        type: 'text' as const,
        text: JSON.stringify({
          _gsep: {
            genome: args.genome_id,
            health: gsep.health ?? null,
            fitness: gsep.fitness ?? null,
            drift: gsep.drift ?? null,
            evolution: gsep.evolution ?? null,
            interaction: gsep.interactionNumber ?? null,
          },
        }, null, 2),
      },
    ],
  };
}
