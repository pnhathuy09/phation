# Installing the Phation MCP server (for AI agents)

Phation is a local stdio MCP server published on npm as `phation`. It needs Node 18 or newer. The MCP server is part of Phation Pro: ask the user for their license key (from https://phation.app/pricing) and put it in `PHATION_KEY`. Without a key the server starts, but every tool answers with how to get a license.

## 1. Add the server

Add this entry to the MCP settings file (for Cline: `cline_mcp_settings.json`):

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

There is nothing to clone or build: `npx` downloads and runs the package.

## 2. Check that it works

Call the `get_standard` tool with no arguments. It returns the core Phation motion rules (springs, curves, durations, reduced motion). Then try `search_motions` with `{"query": "price counter"}`.

## 3. Optional

- `install_standard` writes the rules into the current project for the agent in use. Run it only if the user asks.
- If the user has no license, the free CLI still works in a terminal: `npx phation search <words>`, `npx phation show <slug>`, `npx phation init <agent>`, and `npx phation add <slug>` for the free components (buy-morph, hold-redeem, scroll-text-reveal, nav-letter-roll).
