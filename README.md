<p align="center">
  <img src="media/before-after.gif" alt="The same prompt, run by a default agent (41/100) and by an agent with Phation (100/100)" width="860">
</p>

<h1 align="center">Phation</h1>
<p align="center"><b>Give your AI taste in motion.</b><br>
Ready-made interactions and motion rules for your coding agent, so the motion it writes is right the first time, not the fifth.</p>
<p align="center"><a href="https://phation.app">phation.app</a> · <a href="https://www.npmjs.com/package/phation">npm</a> · <a href="#mcp-tools">MCP tools</a> · <a href="#the-phation-standard">Standard</a></p>

<p align="center"><a href="https://glama.ai/mcp/servers/pnhathuy09/phation"><img src="https://glama.ai/mcp/servers/pnhathuy09/phation/badges/score.svg" alt="pnhathuy09/phation MCP server"></a></p>

---

Ask an agent to "animate the add-to-cart flow" and you usually get hard cuts, linear easing, numbers that swap instead of roll, and nothing for reduced motion. Phation gives the agent two things:

- **The Phation Standard**: a short set of motion rules (springs, curves, durations, stagger, accessibility) that the agent loads in every session.
- **A library of real interactions** it can search, read and drop into your project: React + Motion components with their exact spring and timing values.

It runs as an **MCP server** for Claude Code, Cursor, Codex, Windsurf and VS Code, and as a **CLI**.

## Install

```bash
# Claude Code
claude mcp add phation -- npx -y phation mcp

# Cursor · Windsurf · VS Code (MCP config)
{ "command": "npx", "args": ["-y", "phation", "mcp"] }

# Without an agent
npx phation search "price counter"
```

Node 18 or newer.

## The Phation Standard

Install the rules once per project. Every animation your agent writes then uses the same curves, springs, durations and accessibility handling.

```bash
npx phation init claude     # .claude/skills/phation/SKILL.md + a pointer block in CLAUDE.md
npx phation init cursor     # .cursor/rules/phation.mdc
npx phation init codex      # a marked section in AGENTS.md (your own content is kept)
npx phation init windsurf   # .windsurf/rules/phation.md
npx phation init vscode     # .github/instructions/phation.instructions.md
npx phation init all

npx phation standard springs   # print one section
```

Re-running `init` updates only Phation's own files and the block between the `phation:start` / `phation:end` markers. The rules are in [`data/standard`](data/standard).

A taste of what is inside: one spring family for the whole product.

| Spring | Stiffness · damping | Use for |
|---|---|---|
| snap | 420 · 32 | Controls |
| pop | 400 · 20 | Things appearing |
| soft | 170 · 22 | Surfaces |
| follow | 420 · 34 | The pointer |
| bounce | 160 · 14 | Celebrations |

## MCP tools

| Tool | What it does |
|---|---|
| `get_standard` | The Phation Standard: the core rules, or one section |
| `install_standard` | Writes the rules into the project for the agent you use |
| `search_motions` | Finds interactions by what they should do or feel like ("calm bottom sheet", "make the price feel alive") |
| `list_motions` | Every interaction, optionally for one category |
| `get_motion` | Spec, `MOTION` values, dependencies and media of one interaction (about 200 tokens) |
| `add_motion` | Writes the component into your project · Pro |
| `animate_ui` | Animates your own screens: maps each part of a .jsx/.tsx file to a motion recipe under one Feel · Pro |
| `audit_motion` | Records a page frame by frame and scores its motion: layout jumps, low contrast, missing reduced motion · Pro |

Outputs are kept small on purpose: a typical "add a rolling price to the cart" task costs about 2.8k tokens end to end.

## CLI

```bash
npx phation list [category]          # browse
npx phation search <words>           # find by intent
npx phation show <slug>              # spec + MOTION values
npx phation init <agent>             # install the Standard
npx phation add <slug>               # Pro: write the component into src/motion
npx phation add --from "<studio link>"   # Pro: with the values you tuned in the Studio
npx phation audit <url> [--do click:#buy]   # Pro: score the motion of a page
npx phation animate <file|folder>    # Pro: plan motion for your own screens
```

## Free and Pro

| Free | Pro |
|---|---|
| The Phation Standard and `init` for every agent | `add`: component source written into your project |
| `list`, `search`, `show`: specs and `MOTION` values | `audit` and `animate` |
| Explore and tune every interaction live at [phation.app](https://phation.app) | |

This repository contains the CLI, the MCP server and the Standard. **It ships no component source**: with a license, `add` fetches it from phation.app. Plans are at [phation.app/pricing](https://phation.app/pricing).

```bash
npx phation login <license-key>    # saved to ~/.config/phation/license.json
# or, for CI and agent configs: PHATION_KEY=<license-key>
npx phation whoami
```

## License

The CLI, the MCP server and the Phation Standard may be installed and used freely; the Standard's text may be used in your own projects. Component source is covered by the Pro license. See [LICENSE.md](LICENSE.md), [phation.app/license](https://phation.app/license) and [phation.app/terms](https://phation.app/terms).

Made by [Pham Huy](https://phamhuyds.com).
