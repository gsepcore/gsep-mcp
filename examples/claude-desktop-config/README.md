# Claude Desktop + Cursor + Windsurf MCP Configs

Ready-to-use GSEP-MCP configuration for desktop AI clients.

## Claude Desktop

File: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "gsep": {
      "command": "npx",
      "args": ["-y", "@gsep/mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-YOUR-KEY-HERE"
      }
    }
  }
}
```

## Cursor

File: `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global)

```json
{
  "mcpServers": {
    "gsep": {
      "command": "npx",
      "args": ["-y", "@gsep/mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-YOUR-KEY-HERE",
        "GSEP_PRESET": "full"
      }
    }
  }
}
```

## Windsurf

File: `~/.codeium/windsurf/mcp_config.json`

```json
{
  "mcpServers": {
    "gsep": {
      "command": "npx",
      "args": ["-y", "@gsep/mcp"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-YOUR-KEY-HERE",
        "GSEP_PRESET": "full"
      }
    }
  }
}
```

## With Ollama (local models)

```json
{
  "mcpServers": {
    "gsep": {
      "command": "npx",
      "args": ["-y", "@gsep/mcp"],
      "env": {
        "OLLAMA_HOST": "http://localhost:11434",
        "GSEP_PRESET": "full"
      }
    }
  }
}
```

## Available GSEP MCP Tools

After setup, these tools are available:

| Tool | Description |
|------|-------------|
| `gsep_chat` | Full pipeline: C3→LLM→C4→C5→fitness |
| `gsep_scan_input` | C3 Content Firewall only |
| `gsep_scan_output` | C4 Behavioral Immune System only |
| `gsep_scan_actions` | C5 Action Firewall only |
| `gsep_get_status` | Genome health, fitness, drift status |
| `gsep_record_feedback` | Record user satisfaction |

## Verification

After adding the config, restart the app and ask:
```
Use gsep_get_status to show me my GSEP status
```

You should see genome health and security stats.