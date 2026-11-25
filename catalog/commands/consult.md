---
description: Find the ANVIL agents, skills, commands, rules and MCP servers that fit the current task
argument-hint: "<what you are working on>"
profile: minimal
---

# /consult
1. Run `anvil consult "$ARGUMENTS" --json`.
2. Group the matches by kind, and say in one line each why it fits the task, based on its description.
3. Offer the exact install commands it printed (`anvil install --with ... --dry-run`, `anvil mcp add ...`). Run them only after the user agrees, and show the dry run first.
