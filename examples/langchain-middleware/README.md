# LangChain + GSEP-MCP Middleware Example

Python example using LangChain with GSEP-MCP middleware hooks (`gsep_before_llm`, `gsep_after_llm`).

## Setup

```bash
cd examples/langchain-middleware
pip install langchain langchain-anthropic python-dotenv
```

## Usage

```bash
# Set environment variables
export ANTHROPIC_API_KEY=sk-ant-...
export GSEP_MCP_HTTP_URL=http://localhost:3100
export GSEP_MCP_API_KEY=your-key

# Run
python example.py
```

## What it does

1. Sets up LangChain with Claude as the LLM
2. Wraps the LLM call with GSEP middleware:
   - `gsep_before_llm` — scans input, injects evolved genes, blocks if C3 detects injection
   - `gsep_after_llm` — scans output, calculates fitness, triggers evolution if needed
3. Returns secured response through LangChain

## Smoke test

```bash
# Start GSEP-MCP
cd ../.. && npm run start:http &

# Run this example
python examples/langchain-middleware/example.py
```

## Middleware hooks available

- `gsep_before_llm` — called before LLM, returns enhanced prompt + scan result
- `gsep_after_llm` — called after LLM, scans output, records fitness
- `gsep_before_tool` — called before tool execution, can block dangerous tools
- `gsep_after_tool` — called after tool execution, logs results