# ANVIL Policy as Code

ANVIL allows teams to declare governance rules, sandbox execution limits, and CI security thresholds directly in version-controlled JSON policy files.

---

## Configuration Location

By default, ANVIL looks for a policy file at:
```text
.anvil/policy.json
```
You can also pass a custom policy path using the `--policy` flag:
```bash
anvil gate . --policy configs/ci-policy.json
```

---

## Schema Reference

The schema is defined in [docs/anvil-policy.schema.json](anvil-policy.schema.json).

```json
{
  "version": 1,
  "security": {
    "maxCritical": 0,
    "maxHigh": 0,
    "maxMedium": 5,
    "failOnSecrets": true
  },
  "quality": {
    "maxReviewHigh": 0,
    "requireCleanGit": false,
    "allowInlineSuppressions": true,
    "requireSuppressionReason": false
  },
  "sandbox": {
    "required": false,
    "disallowedTools": ["curl", "wget", "rm"],
    "profile": "balanced",
    "requireRootless": false,
    "maxMemory": "512m",
    "maxCpus": 1.0,
    "maxProcesses": 128
  }
}
```

---

## Policy Fields

| Section | Key | Type | Default | Description |
|---|---|---|---|---|
| **security** | `maxCritical` | `number` | `0` | Maximum critical findings allowed before gate exits 1. |
| **security** | `maxHigh` | `number` | `0` | Maximum high-severity findings allowed. |
| **security** | `maxMedium` | `number` | `10` | Maximum medium-severity findings allowed. |
| **security** | `failOnSecrets` | `boolean` | `true` | If true, fails gate if any API key or secret token is found (`category: "secret"`). |
| **quality** | `maxReviewHigh` | `number` | `0` | Maximum high-risk static review findings (e.g., `eval`). |
| **quality** | `requireCleanGit` | `boolean` | `false` | Require a clean working tree without uncommitted changes. |
| **quality** | `allowInlineSuppressions` | `boolean` | `true` | If false, immediately fails gate if any inline suppression comments (`anvil-disable-*`) are detected. |
| **quality** | `requireSuppressionReason` | `boolean` | `false` | If true, fails gate if any inline suppression lacks an explicit justification reason (e.g. `-- reason`). |
| **sandbox** | `required` | `boolean` | `false` | Require container sandbox execution for agent runs. |
| **sandbox** | `disallowedTools` | `string[]` | `[]` | Prohibited CLI utilities (e.g. `rm`, `curl`). Matched against `package.json` scripts and execution snippets using exact command boundaries. |
| **sandbox** | `profile` | `string` | `"balanced"` | Container sandbox profile (`balanced`, `hardened`, `rootless-required`). *(Advisory in static code gate; enforced in dynamic container verification)* |
| **sandbox** | `requireRootless` | `boolean` | `false` | Require rootless container daemon. *(Advisory in static code gate; enforced in dynamic container verification)* |
| **sandbox** | `maxMemory` | `string` | `"512m"` | Memory ceiling for containerized verification scripts. *(Advisory in static code gate; enforced in dynamic container verification)* |
| **sandbox** | `maxCpus` | `number` | `1.0` | CPU quota for container verification. *(Advisory in static code gate; enforced in dynamic container verification)* |
| **sandbox** | `maxProcesses` | `number` | `128` | Process limit for container verification. *(Advisory in static code gate; enforced in dynamic container verification)* |

> [!NOTE] Scope and Operational Boundaries of `sandbox.disallowedTools`
> `sandbox.disallowedTools` performs static heuristic inspection specifically on:
> 1. **`package.json` script definitions** (e.g., verifying `npm test` or `npm run build` do not execute prohibited tools such as `curl` or `nc`).
> 2. **Active code review finding snippets** (e.g., catching code containing dynamic tool invocations).
>
> It does NOT parse Makefiles, standalone shell scripts (`.sh`), Dockerfiles, or CI workflow YAML files. For deep runtime execution isolation and mandatory resource constraints, use containerized sandbox verification (`anvil verify`).
