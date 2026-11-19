# Hosted AI providers

ANVIL's `anvil run` command supports Claude Code CLI and four hosted/local HTTP provider adapters.

## Provider setup

Choose one provider with `ANVIL_AI_PROVIDER`:

| Provider | Required environment | Default model |
| --- | --- | --- |
| `claude-code` | Claude Code CLI installed and authenticated | `sonnet` |
| `openai` | `ANVIL_API_KEY`, `FORGE_API_KEY` or `OPENAI_API_KEY` | `gpt-4.1-mini` |
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-5` |
| `google` | `GOOGLE_API_KEY` | `gemini-2.5-flash` |
| `ollama` | Ollama running locally | `llama3.2` |

Set `ANVIL_AI_MODEL` to override the model. Set `ANVIL_BASE_URL` to use a compatible gateway or custom endpoint. For Ollama, `OLLAMA_HOST` overrides the default `http://localhost:11434`.

## Examples

```sh
# OpenAI
ANVIL_AI_PROVIDER=openai OPENAI_API_KEY=... ANVIL_AI_MODEL=gpt-4.1-mini anvil run --goal "Review the authentication flow" --path .

# Anthropic API
ANVIL_AI_PROVIDER=anthropic ANTHROPIC_API_KEY=... ANVIL_AI_MODEL=claude-sonnet-4-5 anvil run --goal "Map the service boundaries" --path .

# Google Gemini
ANVIL_AI_PROVIDER=google GOOGLE_API_KEY=... ANVIL_AI_MODEL=gemini-2.5-flash anvil run --goal "Identify reliability risks" --path .

# Local Ollama
ANVIL_AI_PROVIDER=ollama OLLAMA_HOST=http://localhost:11434 ANVIL_AI_MODEL=llama3.2 anvil run --goal "Explain the architecture" --path .

# Existing Claude Code CLI integration
ANVIL_AI_PROVIDER=claude-code ANVIL_AI_MODEL=sonnet anvil run --goal "Plan a safe refactor" --path .
```

## Dashboard connection diagnostics

Run `anvil dashboard` from the target workspace and open the local dashboard's **Provider readiness** section. Select **Test connection** beside OpenAI, Anthropic, Google or Ollama to make an explicit, read-only model-list request. The check has an 8-second timeout and reports connection status, latency and whether the configured model appears in the returned model list. It does not send a generation prompt or create a billable completion.

The dashboard does not perform a Claude Code CLI diagnostic; CLI installation and account authentication must be checked locally. A successful model-list response also does not guarantee that the account has permission to generate with that model.

Diagnostics send credentials only in provider authentication headers (Google's API-key header is used as well). The result omits keys, response bodies and endpoint query parameters. Remote custom endpoints must use HTTPS; HTTP is allowed only for local Ollama.

## Safety and billing notes

- OpenAI, Anthropic and Google calls use their respective API credentials and may incur API charges under those providers' terms. A consumer chat subscription does not automatically include API credits.
- Claude Code is a separate local CLI integration. Its availability and usage depend on the user's installed CLI and applicable account plan/terms.
- Ollama runs against the configured local HTTP endpoint and does not require a cloud API key. ANVIL permits plain HTTP only for localhost; remote endpoints must use HTTPS.
- Provider errors intentionally omit response bodies to avoid echoing potentially sensitive data.
- ANVIL sends task prompts, dependency results and selected project context to the chosen provider. Review workspace content and provider privacy terms before using a hosted service.
- Model-generated responses are proposals. The provider adapter does not itself execute shell commands, write project files or run tests.
- Timeouts default to 45 seconds and are bounded between 1 and 180 seconds by adapter configuration.
