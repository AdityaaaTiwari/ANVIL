# Acknowledgements

ANVIL stands on the shoulders of the open-source engineering community. We express our sincere gratitude to the developers, standards, and projects that inspired ANVIL's architecture.

---

## Upstream Foundation: FORGE & Ansh

ANVIL builds upon foundational concepts, architectural patterns, and command-line interfaces established by **Ansh** in the [FORGE / FORGE-ECC project](https://github.com/ansh44233/FORGE-ECC).

Key inspirations include:
- Local-first developer workbench architecture and command-line interface patterns.
- Sandbox lifecycle management and rootless verification container approaches.
- Uniting engineering intelligence, automated verification gates, and AI coding assistants under an integrated harness.

While ANVIL has evolved independently into a deterministic verification gate (`anvil gate`), multi-language AST code intelligence, Policy-as-Code engine, native binary provenance scanner (`anvil binary`), multi-tool SARIF aggregator, and Model Context Protocol (MCP) server with its own curated native catalog, we acknowledge and honor the foundational work done by Ansh and the FORGE community.

---

## Standards & Ecosystem Inspirations

- **Model Context Protocol (MCP):** The open specification created by Anthropic for connecting AI models to local data sources and tools.
- **OASIS SARIF Standard:** The Static Analysis Results Interchange Format (SARIF) v2.1.0 standard, enabling seamless integration with GitHub Advanced Security and IDE code scanning viewers.
- **MADR (Markdown Architectural Decision Records):** Standardized architecture decision record formatting for reproducible engineering memory.
- **Open-Source Agent & Binary Ecosystems:** Broader workflows explored across open agent harnesses (such as [Everything Claude Code](https://github.com/affaan-m/ECC)) and local binary inspection tooling informed ANVIL's native verification and provenance design.

---

## Licensing

ANVIL is licensed under the permissive [MIT License](LICENSE). All derived and upstream components retain full copyright and attribution in accordance with their respective MIT licenses.
