# AI Topology Workspace — MVP implementation

Branch: `feature/ai-reasoning-mvp` / PR #57. **Experimental; not deployed or engineering-validated.**

## Entry points

- On the Network Configurator sidebar, **AI Topology Workspace** opens an independent editor at `/ai-topology`. Start blank or from the vPC, CE–ISP BGP, or EVPN leaf–spine *topology-only* templates. These templates are scaffolds, not fixed technology boundaries; you can add any vendor and technology.
- **Analyze Design with AI (optional)** transfers only device/link topology fields from the current Design snapshot to the independent workspace using a one-use same-tab session-storage handoff. It never mutates or overwrites Design, Inventory, Simulation or Module Report.
- In the independent editor, add/update/remove devices, add/update/remove connections, add device-specific configuration/CLI text, import/export a local JSON workspace, and inspect an SVG topology diagram. Configuration text is held in memory until explicitly included in an AI request; exporting JSON includes original text and may include credentials.

## AI Design Review — first integrated baseline

The existing **Analyze Design with AI (optional)** sidebar entry now creates a one-use, locally redacted Design snapshot containing the selected module's device and link topology, generated *device-specific configuration proposals*, engineering parameters/rationales, and the result from the **existing** `NetworkDesignChecks.evaluate` consistency checker on the original Design input fields. It does not recompute or copy vendor configuration-generation rules. The same shared `workspace-storage.js` decoder is loaded on the AI editor, so large safe handoffs from the main workspace survive the application's existing lossless session-storage compression.

The AI editor shows deterministic Design issues in their own section (these checks are not AI conclusions), and clearly labels the AI evidence stream as **Design intent**, **generated configuration proposals (not deployed)**, and **original Design input checks**. After users change the imported topology or config, the original Design check status is marked **STALE**; generated settings are not silently represented as freshly validated.

A user must still review the redacted evidence and explicitly click Analyze. Real CLI/show-tech observations are separate, and the AI's independent hypotheses require actual model-side citation and engineering acceptance. This is **not** proof that every generated CLI line matches its intended parameter, or that the LLM is competent.

## Evidence and shared AI analysis

The workspace produces line-addressed topology and configuration evidence, with stable evidence IDs and original per-configuration line numbers. It redacts common password, SNMP and token lines before showing the complete review payload. The user explicitly chooses **Review evidence to send**, then **Analyze reviewed evidence**, which calls the same `/api/ai/analyze` endpoint used by CLI Analysis.

Batches are capped at 24 evidence items and roughly 27.5 KB request data. Single evidence items are capped under the API's 3,000-character limit. An oversized individual line is rejected, never truncated silently. Configurations larger than 150 KB/device must use the dedicated CLI Analysis capture flow. When a report spans multiple batches, optional cross-batch synthesis remains explicitly **UNVERIFIED**. If any batch is missing valid evidence citations, no global synthesis is attempted and the user is told why. No automatic device changes or commands run.

Because a workspace may contain Cisco, Arista, Fortinet and other platforms simultaneously, the knowledge retriever uses explicit device vendor fields to choose relevant vendor background in addition to technology terms; it does not turn missing CLI tokens into hardcoded verdicts.

## Security, limitations and release gates

The browser-side redaction is defense in depth, **not DLP**. Users must inspect the exact redacted evidence before transmitting it and must obtain any required authorization for customer data. The server also redacts known secret-bearing lines. Unverified model outputs are withheld rather than treated as facts.

The template/editor route and data-contract tests do **not** demonstrate autonomous network-engineering reasoning. PR #57 still must pass actual held-out vPC design tests (peer-switch conditional assessment, operational peer-gateway counterevidence, correct reading of configured keepalive), multi-vendor show-tech/BGP FSM cases, the full Simulation regression suite and real deployment verification before merging.

The production image includes the new HTML and JS assets, but a successful image deployment should be independently confirmed on the final candidate commit.
