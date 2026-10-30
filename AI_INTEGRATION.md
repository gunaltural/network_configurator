# Engineering AI — implementation checkpoint

The service is a prototype, deliberately not registered in app.py or exposed in the UI yet.
Existing project flow and saved data are untouched. Do not deploy this draft as a complete integration.

Implemented: strict evidence request schema, optional server-only AI_ENABLED/AI_MODEL/OPENAI_API_KEY configuration, fixed OpenAI Responses endpoint, redirect refusal, input/output size limits, single concurrent request, generic provider errors, credential-line redaction, store:false and review-required drafts. No tools, device commands or persistence.

Reference: https://developers.openai.com/api/reference/python/resources/responses/methods/create
store:false controls response storage; it is not a promise of zero provider retention.

Before activation:
- Wire routes into existing authenticated app; test login, CSRF and per-user rate limits.
- Build a curated evidence adapter from the current project/report snapshot, including device/link identities, named scenarios, modeled path and assessment. Never send raw configuration or SSH output by default.
- Show exactly what will be sent, require an explicit Analyze action, display plain editable text and provide explicit user-controlled insertion into reports.
- Test provider malformed/incomplete/error responses and multi-user concurrency.
- Verify all project/module/vendor navigation and Save/Open flows with AI disabled and enabled.
- Configure the API key only in server environment and select an account-supported model; run a real integration test. No real provider call has been tested yet.

Local validation: python -m unittest test_engineering_ai -v — 3 tests passed (provider mocked). Tests cover disabled/no outbound request, draft contract/redaction/unchanged source, duplicate evidence IDs and unknown request fields.
