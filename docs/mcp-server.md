# ANVIL Model Context Protocol (MCP) Server

ANVIL includes a zero-cloud Model Context Protocol (MCP) server that exposes codebase intelligence, architecture graphs, quality audits, and change risk directly to AI developer tools such as Cursor, Claude Desktop, and Windsurf.

---

## Quick Setup

Run the built-in MCP setup wizard to configure your preferred editor:

```bash
# Auto-configure all detected AI clients
anvil mcp setup --client all

# Or configure a specific editor
anvil mcp setup --client cursor
anvil mcp setup --client claude
anvil mcp setup --client windsurf
```

---

## Available MCP Tools

All tools are read-only, bounded, and execute locally within your workspace boundaries:

| Tool Name | Legacy Alias | Description |
|---|---|---|
| `anvil_inspect_project` | `forge_inspect_project` | Project inventory: languages, frameworks, scripts, dependencies, and warnings. |
| `anvil_map_architecture` | `forge_map_architecture` | Map internal imports, circular dependencies, and entrypoints. |
| `anvil_search_code` | `forge_search_code` | Search symbols and text with automatic secret and binary exclusion. |
| `anvil_list_files` | `forge_list_files` | Directory listing bounded to 200 items, filtering out secrets and caches. |
| `anvil_read_file` | `forge_read_file` | Read source files up to 128 KiB with strict path traversal prevention. |
| `anvil_quality_audit` | `forge_quality_audit` | Heuristic code quality audit and maintainability signals. |
| `anvil_git_intelligence` | `forge_git_intelligence` | Working-tree diffs, downstream impact radius, and test targets. |
| `anvil_security_audit` | `forge_security_audit` | Deep scan for hardcoded credentials, secret keys, and dangerous scripts. |
| `anvil_project_memory` | `forge_project_memory` | Read and record persistent architectural decisions and guidelines. |

---

## Manual Configuration Example

### Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "anvil": {
      "command": "anvil",
      "args": ["mcp"],
      "env": {
        "ANVIL_WORKSPACE": "/path/to/your/project"
      }
    }
  }
}
```
