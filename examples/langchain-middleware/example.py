"""
LangChain + GSEP-MCP Middleware Example

Requires:
- GSEP-MCP running in HTTP mode (npm run start:http)
- ANTHROPIC_API_KEY set in environment
- GSEP_MCP_HTTP_URL and GSEP_MCP_API_KEY set
"""

import os
import json
import httpx
from dotenv import load_dotenv

load_dotenv()

GSEP_HTTP_URL = os.getenv("GSEP_MCP_HTTP_URL", "http://localhost:3100")
GSEP_API_KEY = os.getenv("GSEP_MCP_API_KEY", "your-key-here")
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "sk-ant-...")


async def gsep_before_llm(prompt: str) -> dict:
    """Called before LLM. Scans input and returns enhanced prompt."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{GSEP_HTTP_URL}/mcp",
            headers={
                "Content-Type": "application/json",
                "mcp-session-id": "langchain-session",
            },
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {
                    "name": "gsep_before_llm",
                    "arguments": {
                        "message": prompt,
                        "genome_id": "langchain-agent",
                        "api_key": ANTHROPIC_KEY,
                    },
                },
            },
        )
        result = response.json()
        return result.get("result", {})


async def gsep_after_llm(prompt: str, response: str) -> dict:
    """Called after LLM. Scans output and records fitness."""
    async with httpx.AsyncClient() as client:
        response_http = await client.post(
            f"{GSEP_HTTP_URL}/mcp",
            headers={
                "Content-Type": "application/json",
                "mcp-session-id": "langchain-session",
            },
            json={
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {
                    "name": "gsep_after_llm",
                    "arguments": {
                        "message": prompt,
                        "response": response,
                        "genome_id": "langchain-agent",
                        "api_key": ANTHROPIC_KEY,
                    },
                },
            },
        )
        result = response_http.json()
        return result.get("result", {})


async def chat_with_gsep(prompt: str) -> str:
    """Chat through GSEP middleware."""
    # 1. Before LLM - scan and enhance
    before = await gsep_before_llm(prompt)
    if before.get("blocked"):
        return f"Blocked: {before.get('reason', 'Security policy violation')}"

    enhanced_prompt = before.get("enhanced_prompt", prompt)
    gsep_status = before.get("_gsep", {})

    # 2. Call LLM (simulated here - use your actual LangChain setup)
    # llm_response = await llm.agenerate([enhanced_prompt])
    # For demo, we'll use the MCP tool directly
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{GSEP_HTTP_URL}/mcp",
            headers={
                "Content-Type": "application/json",
                "mcp-session-id": "langchain-session",
            },
            json={
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {
                    "name": "gsep_chat",
                    "arguments": {
                        "genome_id": "langchain-agent",
                        "message": prompt,
                        "api_key": ANTHROPIC_KEY,
                    },
                },
            },
        )
        result = response.json()
        content = result.get("result", {}).get("content", [])
        response_text = content[0].get("text", "") if content else "No response"

    # 3. After LLM - scan output
    await gsep_after_llm(prompt, response_text)

    return response_text


async def main():
    print("LangChain + GSEP-MCP Middleware Example")
    print("=" * 40)

    # Test with a normal prompt
    response = await chat_with_gsep("What is 2+2?")
    print(f"\nResponse: {response}")

    print("\n✅ Middleware pipeline complete")


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())