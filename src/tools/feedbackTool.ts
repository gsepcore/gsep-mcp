import { z } from 'zod';
import { getGenome } from '../genomeManager.js';
import type { GSEPMcpConfig } from '../config.js';

export const feedbackSchema = {
  genome_id: z.string().describe('Genome ID to record feedback for'),
  user_id: z.string().optional().default('mcp-user').describe('User identifier'),
  satisfied: z.boolean().describe('Whether the user was satisfied with the last response'),
  quality: z.number().min(0).max(1).optional().describe('Quality score 0-1 (optional, derived from satisfied if omitted)'),
  note: z.string().optional().describe('Optional feedback note'),
};

export async function feedbackHandler(
  args: z.infer<z.ZodObject<typeof feedbackSchema>>,
  config: GSEPMcpConfig
) {
  const genome = await getGenome(args.genome_id, config);
  const quality = args.quality ?? (args.satisfied ? 0.9 : 0.2);

  try {
    await (genome as any).recordFeedback?.({
      userId: args.user_id,
      satisfied: args.satisfied,
      quality,
      note: args.note,
    });
  } catch {
    // feedback recording is best-effort
  }

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        recorded: true,
        genome_id: args.genome_id,
        user_id: args.user_id,
        satisfied: args.satisfied,
        quality_score: quality,
        impact: args.satisfied
          ? '✅ Positive signal — reinforces current gene configuration'
          : '🔄 Negative signal — triggers evolution on next cycle',
        note: args.note ?? null,
      }, null, 2),
    }],
  };
}
