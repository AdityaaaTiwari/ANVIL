# Acknowledgements

ANVIL stands on the shoulders of the open-source engineering community. We express our sincere gratitude to the developers, projects, and specifications that inspired and informed ANVIL's design.

---

## Upstream Foundation: FORGE & Ansh

ANVIL builds upon foundational concepts, architectural patterns, and command-line interfaces established by **Ansh** in the [FORGE / FORGE-ECC project](https://github.com/ansh44233/FORGE-ECC).

Key inspirations include:
- Local-first developer workbench architecture and command-line interface patterns.
- Sandbox lifecycle management and rootless verification container approaches.
- The vision of uniting engineering intelligence, automated code repair, and AI coding assistants under an integrated harness.

While ANVIL has evolved independently into a specialized deterministic verification gate (`anvil gate`), multi-language AST code intelligence, Policy-as-Code engine, multi-tool SARIF aggregator, and Model Context Protocol (MCP) server, we acknowledge and honor the foundational work done by Ansh and the FORGE community.

---

## Ecosystem Foundations: Everything Claude Code (ECC) & Affaan Mustafa

The specialist agent personas, modular workflow slash commands, and multi-language engineering rules integrated into the ANVIL Catalog originate from and build upon the work of **Affaan Mustafa** in [Everything Claude Code (ECC)](https://github.com/affaan-m/ECC).

Key contributions incorporated under the MIT License include:
- 88 domain specialist agent personas spanning architecture, security, performance, language specialization, and build repair.
- Standardized engineering workflow commands (`/plan`, `/tdd`, `/verify`, `/build-fix`, `/review-pr`).
- Production-tested coding rules across 11 major programming stacks.

---

## Ecosystem Foundations: Reverse Engineer Anything (REA) & morluto

The binary analysis and reverse-engineering capabilities in the ANVIL Catalog are derived from the [Reverse Engineer Anything (REA)](https://github.com/morluto/rea) project by **morluto**.

Key assets incorporated under the MIT License include:
- 59 binary format specifications (PE, ELF, Pyc, Electron, .NET, WASM, DEX, Mach-O).
- Reverse engineering guides, MCP contracts, and disassembler bridge templates (Ghidra, Hopper, IDA, Cutter).
- Clean-room binary analysis and reconstruction ledgers.

---

## Ecosystem Inspirations

- **Model Context Protocol (MCP):** The open specification created by Anthropic for connecting AI models to local data sources and tools.
- **OASIS SARIF Standard:** The Static Analysis Results Interchange Format (SARIF) v2.1.0 standard, enabling seamless integration with GitHub Advanced Security and IDE code scanning viewers.
- **MADR (Markdown Architectural Decision Records):** Standardized architecture decision record formatting for reproducible engineering memory.

---

## Licensing

ANVIL is licensed under the permissive [MIT License](LICENSE). All derived, adapted, and upstream components retain full copyright and attribution in accordance with their respective MIT licenses. No third party may restrict or claim infringement on MIT-licensed assets when copyright and permission notices are preserved.
