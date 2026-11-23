# Security Policy

ANVIL takes security seriously. As a local-first engineering workbench that inspects repositories, parses dependencies, and executes verification scripts, maintaining strong security boundaries is essential.

## Supported Versions

Only the latest minor release line receives security updates. We strongly encourage all users to keep their installation updated.

| Version | Supported | Release Date |
|:-------:|:---------:|:------------:|
| 1.2.x   | ✅ Yes     | November 2026 |
| 1.1.x   | ✅ Yes     | November 2026 |
| 1.0.x   | ❌ No      | Superseded by 1.1.x |
| < 1.0.0 | ❌ No      | Unsupported  |

## Reporting a Vulnerability

If you believe you have discovered a security vulnerability in ANVIL, **please do not disclose it publicly or open a public GitHub issue.**

### Preferred Method: GitHub Private Vulnerability Reporting
Please submit a private advisory through GitHub:
👉 **[Open a Security Advisory on GitHub](https://github.com/anvil-workbench/ANVIL/security/advisories/new)**

This ensures your report is received securely and confidentially by the maintainers without exposing other users to risk.

### Alternative Method: Direct Security Email
If you are unable to use GitHub Security Advisories, send a detailed report to:
📧 **[m.g.atiwari28@gmail.com](mailto:m.g.atiwari28@gmail.com)**

Please include:
1. Description of the vulnerability and affected component (`cli`, `dashboard`, `mcp-server`, `cleaner`, `sandbox`, etc.).
2. Minimal steps to reproduce the issue (proof-of-concept repository or script).
3. Potential impact and severity assessment.
4. Any proposed remediations or patches.

## Response Timeline & SLA

ANVIL is maintained as open-source software by a solo maintainer. We provide best-effort response and remediation targets:
- **Initial Acknowledgment:** Best effort within **48–72 hours** of report receipt.
- **Triage & Severity Assessment:** Within **5–7 business days**, with confirmation of reproducer and severity score (CVSS).
- **Patch Development & Testing:** Targeted within **14–30 days** for critical/high vulnerabilities; within **60 days** for medium/low issues.
- **Public Disclosure:** Coordinated release with a GitHub Security Advisory and release note once the patch is available on npm.

> [!NOTE]
> GitHub Private Vulnerability Reporting is enabled in repository settings (`Settings > Code security and analysis > Private vulnerability reporting`) to facilitate confidential security disclosures.

## Scope & Security Model

The following areas are in-scope for security review:
- **Sandbox Escapes:** Execution of arbitrary shell scripts outside of designated sandbox boundaries or container policies.
- **Local Dashboard Security:** DNS-rebinding attacks, host-header injection, or unauthorized external network access to the loopback dashboard server (`127.0.0.1`).
- **Path Traversal:** File access outside the intended project directory or workspace root via CLI options, dashboard APIs, or MCP protocol calls.
- **Secret & Credential Handling:** Unsanitized leakage of API keys, tokens, or environment variables in logs, traces, or public exports.
- **MCP Server Protocol:** Unauthorized mutations through read-only tools or injection via JSON-RPC inputs.

## Safe Harbor

We consider security research conducted in accordance with this policy to be authorized. We will not pursue legal action against researchers who:
- Make a good-faith effort to avoid privacy violations, data destruction, and service interruption.
- Give maintainers reasonable time to remediate vulnerabilities before public disclosure.
- Do not exploit a vulnerability beyond the minimum necessary to demonstrate its existence.

Thank you for helping keep ANVIL and the developer community safe.
