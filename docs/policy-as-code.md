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
    "requireCleanGit": false
  },
  "sandbox": {
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
| **security** | `failOnSecrets` | `boolean` | `true` | If true, fails gate if any API key or secret token is found. |
| **quality** | `maxReviewHigh` | `number` | `0` | Maximum high-risk static review findings (e.g., `eval`). |
| **sandbox** | `profile` | `string` | `"balanced"` | Container sandbox profile (`balanced`, `hardened`, `rootless-required`). |
| **sandbox** | `maxMemory` | `string` | `"512m"` | Memory ceiling for containerized verification scripts. |
