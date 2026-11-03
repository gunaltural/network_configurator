# AI Analysis MVP: production release gate

This is an **operations checklist**, not a declaration that reasoning is validated. Keep the seven-layer target architecture: engineering knowledge → evidence discovery → context retrieval → model reasoning → evidence validation → acceptance → deployment. Keep the daily Network Configurator development automation unchanged.

## Provider profiles

### Recommended first MVP: hosted model

Set these **on the server** using your secret manager/Render environment (never put credentials in GitHub, reports, project files or browser JavaScript):
- `AI_ENABLED=1`
- `AI_PROVIDER=openai`
- `AI_MODEL=<an actually provisioned, tested model ID>`
- `OPENAI_API_KEY=<secret>`

The existing backend uses OpenAI Responses API. The server must have outbound HTTPS and the associated account must have API access. The image's embedded inference launcher honors explicit `AI_PROVIDER=openai` and does not launch local inference.

**Data governance:** Entire selected redacted CLI evidence is sent to the provider. Do not enable hosted processing for confidential customer captures without appropriate organizational approval, data-processing review, and a validated redaction/retention policy. The current line-oriented redaction is not a full sensitive-data DLP solution; use synthetic captures for acceptance.

### Recommended first real-model MVP without new hosting hardware: Groq free-tier (opt-in)

Groq publishes free, rate-limited access to larger models; **access is not automatic, unlimited or guaranteed**. A project owner must create a free Groq account and server-side API credential and confirm that sending a particular sanitized capture to an external provider is authorized. This does not purchase hosting or a paid API plan.

Server-only environment example:
- `AI_ENABLED=1`
- `AI_PROVIDER=groq`
- `AI_MODEL=openai/gpt-oss-120b` (verify current model availability)
- `GROQ_API_KEY=<secret>`

The adapter uses the **fixed** `https://api.groq.com/openai/v1/chat/completions` endpoint with no user-configurable network URL. There is no automatic fallback from disabled/failed local inference to Groq: changing provider is an explicit deployment decision. The model's output must still pass actual citation validation, held-out engineering acceptance and full regression before production can claim AI reasoning.

Source for plan and model/rate-limit availability: https://console.groq.com/docs/rate-limits. Do not infer your account-specific quotas from the general table. Do not place credentials in GitHub code or browser UI. A free account may not satisfy an organization's information-handling policies; use synthetic test captures until authorization is established.

### Experimental self-hosted local GGUF

`AI_PROVIDER=local`, `AI_BASE_URL`, `AI_MODEL`, and `AI_ENABLED=1` select a local compatible server. Bundled Qwen2.5-0.5B may answer but currently **fails held-out vPC engineering reasoning** and the constrained memory/CPU evaluation. It is not an accepted production reasoning engine.

`GET /api/ai/status` reports whether credentials/settings are configured, not whether a model is alive or competent. `reasoningVerified=false` is intentional until controlled evaluation certifies a particular deployment; the API does not fabricate a green quality status.

## Release gates — do not waive

1. `AI Analysis reasoning MVP checks`: pass, including synthetic hosted-adapter tests and Chromium AI UI.
2. `Simulation regression` and production Docker image smoke: pass on **the same commit**, or reproduce/resolve any known unrelated baseline failures with evidence.
3. Real model acceptance against held-out vPC capture: interpret `peer-switch` as an STP design choice rather than a universal mandatory switch; recognize `Peer Gateway : Enabled` as operational counterevidence to claiming `peer-gateway` disabled; **do not** falsely claim configured keepalive is missing; produce real evidence ID + line citations. No prompt text or answer key is included in inference evidence.
4. Verify mixed BGP FSM + logs and at least one EVPN/STP/SD-WAN evidence case without hardcoded new per-command detection rules.
5. Check the chosen deployment under realistic memory, CPU and request-concurrency limits, with no OOM or silently downgraded evidence-only response.
6. Merge PR only after all applicable gates pass. Confirm Render is running that commit, `/healthz` is healthy, and an authenticated `/api/ai/analyze` request returns a model draft with evidence citations. Health status alone does not prove AI deployment.

## Honest output contract

- `model-evidence-cited-draft` = citations point to existing IDs/lines; **not** an independently validated engineering conclusion.
- `model-unverified-draft` = unsupported model claims withheld; an evidence excerpt and engineer-review warning remain.
- `evidence-only-provider-fallback` = provider did not return a complete answer, **not AI reasoning**.
- `cross-batch-unverified-synthesis` = provisional cross-batch model synthesis requiring correlation against the original complete capture.

This MVP uses a curated module-knowledge corpus with some attributed manufacturer guidance; a complete indexed/document-versioned RAG corpus is **not** yet implemented. Do not describe it as fully implemented RAG or a validated autonomous network engineer.
