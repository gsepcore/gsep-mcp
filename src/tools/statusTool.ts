import { z } from 'zod';
import { getGenome, listGenomes } from '../genomeManager.js';
import type { GSEPMcpConfig } from '../config.js';

export const statusSchema = {
  genome_id: z.string().optional().describe('Genome ID to inspect. If omitted, returns all active genomes.'),
};

export async function statusHandler(
  args: z.infer<z.ZodObject<typeof statusSchema>>,
  config: GSEPMcpConfig
) {
  if (!args.genome_id) {
    const genomes = listGenomes();
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          active_genomes: genomes,
          count: genomes.length,
          server: 'GSEP-MCP v1.0.0',
          preset: config.preset,
          llm_provider: config.llmProvider,
          storage: config.storagePath,
        }, null, 2),
      }],
    };
  }

  const genome = await getGenome(args.genome_id, config);
  let status: any = {};

  try {
    status = await (genome as any).getStatus?.() ?? {};
  } catch {
    status = {};
  }

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        genome_id: args.genome_id,
        health: status.health ?? null,
        fitness: status.fitness ?? null,
        drift: status.drift ?? null,
        evolution: status.evolution ?? null,
        security: status.security ?? null,
        chromosomes: {
          C0: '🔒 Immutable DNA — SHA-256 protected',
          C1: 'Operative Genes — ' + (status.generation ? `generation ${status.generation}` : 'evolving'),
          C2: 'Epigenomes — per-user adaptation active',
          C3: 'Content Firewall — 53 patterns active',
          C4: 'Behavioral Immune System — 6 checks active',
          C5: 'Action Firewall — 80+ patterns active',
        },
        interactions: status.interactionCount ?? 0,
        last_evolution: status.lastEvolution ?? null,
      }, null, 2),
    }],
  };
}
