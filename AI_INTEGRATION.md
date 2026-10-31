# Engineering AI integration status

Self-hosted is the default provider. Set AI_ENABLED=1, AI_PROVIDER=local,
AI_BASE_URL=http://internal-model-host:8000/v1 and AI_MODEL to the served model.
Optional AI_LOCAL_API_KEY authenticates to that server. No OpenAI credentials
are required. The URL is administrator-controlled, not browser input.
External service requires explicit AI_PROVIDER=openai plus OPENAI_API_KEY.
There is no automatic external fallback.

The authenticated application now registers AI endpoints and bundles the panel.
The panel uses current module design/report evidence, displays the payload before
sending, and permits editing the result. Raw configurations are excluded.
Report insertion appends reviewed text to an existing editable section through
its normal input event. Existing text is retained; changed report context and
section overflow prevent insertion. Copy remains available on design pages.

Real model hosting, hardware selection, model quality and production connectivity
remain unverified. Provider tests use mocked responses. No model is deployed by
this PR. Project workflow and configuration generation are unchanged.

Validation: service/authentication tests, immutable evidence isolation checks,
and panel DOM tests. Full browser visualization and real-model end-to-end testing
remain necessary before production activation.

## Optional bundled self-hosted evaluation

`compose.ai.yml` packages the existing application and a llama.cpp model server
in one optional stack. It is separate from the existing Dockerfile deployment;
no Render service or existing project database is modified. This is evaluation
packaging, not a completed embedded-model release.

Set these deployment environment variables before running Compose:

- `AI_RUNTIME_IMAGE`: a validated, pinned tag/digest of the official
  `ghcr.io/ggml-org/llama.cpp` server image (do not use a moving tag for release).
- `AI_MODEL_FILE`: absolute path to a locally provisioned, licensed GGUF model.
  Record model origin, revision, checksum, chat-template support and license.
  Model weights are not included or downloaded automatically by this package.
- `AUTH_USERNAME`, `AUTH_PASSWORD`: credentials for this isolated evaluation app (password at least 12 characters).

Run `docker compose -f compose.ai.yml config --quiet` to validate configuration,
then `docker compose -f compose.ai.yml up --build` on the evaluation host.
The application is bound to localhost port 18080. The model has no published
port or external network. The application does not wait for model readiness,
so unavailable inference does not prevent project/design use. Existing project
data is not imported into this separate evaluation instance automatically.
No third-party API key is needed. End users see the existing Analysis screen.

This stack does not make a small Render instance adequate for inference.
Model RAM/CPU requirements, 16K context fit, response latency within the existing
45-second request timeout and engineering accuracy must be measured on the
chosen host. Model availability, licensing and offline operation after image
provisioning still need runtime validation. Do not claim the AI is ready from
Compose validation or mocked browser tests.

Release acceptance: run a real-model analysis with short and near-limit inputs;
check device/command/line citations, missing-evidence handling, administrative
shutdown versus failure, paired-device diagnosis and Turkish/English output.
Then stop the model and confirm project Save/Open and design remain usable.
Retain before/after configuration evidence; do not send commands to devices.

Upstream implementation references:
- https://github.com/ggml-org/llama.cpp/blob/master/docs/docker.md
- https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md
