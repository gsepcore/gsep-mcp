# OpenAI SDK + GSEP-MCP Gateway Example

Minimal Node.js example using OpenAI SDK with GSEP-MCP's OpenAI-compatible gateway.

## Setup

```bash
cd examples/openai-gateway-node
npm init -y
npm install openai
```

## Usage

```bash
# Set your GSEP-MCP gateway URL (default: localhost:3100)
export GSEP_GATEWAY_URL=http://localhost:3100
# Your API key registered with GSEP-MCP
export OPENAI_API_KEY=your-gsep-registered-key
# Optional: Anthropic key for GSEP to use
export ANTHROPIC_API_KEY=sk-ant-...

# Run the example
node example.js
```

## What it does

1. Sends a chat completion request to GSEP-MCP's `/v1/chat/completions`
2. GSEP processes the request through its security pipeline:
   - C3 Content Firewall (prompt injection scan)
   - Evolved genes injection
   - LLM call (with your configured provider)
   - C4 Behavioral Immune System (output scan)
   - C5 Action Firewall (destructive action blocking)
3. Returns the secured response

## Smoke test

```bash
# Start GSEP-MCP in HTTP mode (from repo root)
npm run start:http &

# Run this example
node examples/openai-gateway-node/example.js

# Should output a chat completion response with GSEP security headers
```

## Gateway endpoints

- `GET /v1/models` — list available models
- `POST /v1/chat/completions` — OpenAI-compatible chat
- `POST /v1/responses` — OpenAI responses API compatible

## Security

All requests go through GSEP's security pipeline automatically. No extra configuration needed.