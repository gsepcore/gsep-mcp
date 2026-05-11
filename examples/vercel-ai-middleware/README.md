# Vercel AI SDK + GSEP-MCP Middleware Example

Next.js / Vercel example using Vercel AI SDK with GSEP middleware hooks.

## Setup

```bash
cd examples/vercel-ai-middleware
npm install ai @ai-sdk/openai @gsep/core
```

## Usage

```bash
# Set environment variables
export OPENAI_API_KEY=sk-...
export GSEP_AGENT_NAME=vercel-agent

# Run dev server
npm run dev
```

## What it does

1. Sets up Vercel AI SDK with OpenAI
2. Applies GSEP as middleware:
   - before LLM: C3 scan, PII redaction, gene injection
   - after LLM: C4 scan, C5 action blocking, fitness tracking
3. All chat completions automatically secured by GSEP

## Code

```typescript
// app/api/chat/route.ts
import { openai } from '@ai-sdk/openai';
import { gsepMiddleware } from '@gsep/core/vercel-ai';

const gsep = await gsepMiddleware({ name: 'vercel-agent' });

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
```

## Smoke test

```bash
# Start GSEP-MCP
cd ../.. && npm run start:http &

# Run this example
npm run dev
# Visit http://localhost:3000/api/chat
```