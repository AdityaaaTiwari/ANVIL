---
description: Set up an ANVIL verified loop — an agent retries until checks ANVIL runs itself pass
argument-hint: "<goal>"
profile: standard
---

# /loop
Prepare a verified loop for `$ARGUMENTS`; do not start it yourself.

1. Turn the goal into one clear sentence and pick the smallest set of checks that prove it (for example `npm test -- auth`, `npm run typecheck`). Checks must already exist; do not write new checks that the agent could also edit.
2. Run the checks once and show which fail now. If they all pass, the loop has nothing to do — say so.
3. Confirm the working tree is clean (`git status`). Suggest a branch such as `anvil/loop-<topic>`.
4. Give the user the exact command to run in their terminal:
   `anvil loop start --goal "<goal>" --check "<check>" [--check "<check>"] --max-iterations 5`
5. Explain the outcomes: `passed` (ANVIL re-ran every check), `failed`, `stalled` (no new changes), and `needs-review` (the agent deleted or skipped tests, or changed configs, scripts or CI — review the diff before trusting anything). Receipts are in `.anvil/loops/`; `anvil loop status` shows the latest.
