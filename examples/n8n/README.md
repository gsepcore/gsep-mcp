# n8n + GSEP-MCP Workflow

Import this JSON into n8n to create a chat workflow with GSEP security.

## Setup

1. Open n8n
2. Import this workflow: `n8n importworkflow --input=workflow.json`
3. Configure the credentials:
   - Create an HTTP Query Basic Auth credential with your GSEP-MCP API key
   - Set the GSEP-MCP URL in the HTTP Request node

## What it does

1. Receives a chat message (webhook trigger)
2. Sends it through GSEP-MCP's `gsep_chat` tool
3. Returns the secured response with GSEP status metadata

## Manual import

1. Copy the content of `workflow.json`
2. In n8n: Click "Import from JSON" (Ctrl+I)
3. Paste the JSON
4. Update the URL in the HTTP Request node to your GSEP-MCP instance
5. Add Basic Auth header with your API key

## Gateway alternative

For simpler integration, use GSEP-MCP's OpenAI-compatible gateway:

```
POST http://localhost:3100/v1/chat/completions
Authorization: Bearer <your-api-key>
Content-Type: application/json

{
  "model": "gpt-4o",
  "messages": [{"role": "user", "content": "Hello"}]
}
```

This skips the MCP tool calls and uses direct HTTP with OpenAI SDK compatibility.