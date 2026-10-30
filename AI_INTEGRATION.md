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
