import OpenAI from 'openai';

const gatewayUrl = process.env.GSEP_GATEWAY_URL || 'http://localhost:3100';
const apiKey = process.env.OPENAI_API_KEY || 'your-api-key-here';

const client = new OpenAI({
  apiKey,
  baseURL: `${gatewayUrl}/v1`,
});

async function main() {
  console.log('Sending request to GSEP-MCP gateway...\n');

  const stream = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: 'Explain what GSEP does in one paragraph.',
      },
    ],
    stream: true,
  });

  console.log('Response (streaming):\n');

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    process.stdout.write(content);
  }

  console.log('\n\n✅ Request completed through GSEP security pipeline');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});