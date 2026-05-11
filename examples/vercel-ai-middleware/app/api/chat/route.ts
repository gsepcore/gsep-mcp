import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { gsepMiddleware } from '@gsep/core/vercel-ai';

const gsep = await gsepMiddleware({
  name: process.env.GSEP_AGENT_NAME || 'vercel-agent',
});

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = await generateText({
    model: openai('gpt-4o'),
    messages,
    system: gsep.systemPrompt,
    middleware: [gsep.middleware],
  });

  return result.toDataStreamResponse();
}