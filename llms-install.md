# Installing the Phation MCP server (for AI agents)

Phation is a local stdio MCP server published on npm as `phation`. It needs Node 18 or newer. No API key or account is needed.

## 1. Add the server

Add this entry to the MCP settings file (for Cline: `cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "phation": {
      "command": "npx",
      "args": ["-y", "phation", "mcp"]
    }
  }
}
```

There is nothing to clone or build: `npx` downloads and runs the package.

## 2. Check that it works

Call the `get_standard` tool with no arguments. It returns the core Phation motion rules (springs, curves, durations, reduced motion). Then try `search_motions` with `{"query": "price counter"}`.

## 3. Optional

- `install_standard` writes the rules into the current project for the agent in use. Run it only if the user asks.
- Tools marked Pro (`add_motion`, `animate_ui`, `audit_motion`) need a license key in the `PHATION_KEY` environment variable. Without it they reply with how to get one. Every other tool works without a key.

```json
{
  "mcpServers": {
    "phation": {
      "command": "npx",
      "args": ["-y", "phation", "mcp"],
      "env": { "PHATION_KEY": "<license-key>" }
    }
  }
}
```
