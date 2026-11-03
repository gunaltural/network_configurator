# Independent AI Engineering Analysis — architecture decision

**Decision:** AI Analysis (including AI Design Analysis) is a **separate reasoning layer**, not a reimplementation of Network Configurator Design or Simulation. Both established modules remain complete and usable with AI disabled.

## Data contracts and responsibilities

| Source | Owns | What AI is allowed to infer |
| --- | --- | --- |
| Design / current Technology Workspace | **Intended** topology, roles, devices, links, parameters and generated configuration | Interpret intended architecture, dependencies, completeness and consistency — not automatically assert deployed/operational truth |
| Simulation | **Synthetic modeled** fault events, role/traffic-path transitions, vendor assumptions, expected recovery under explicitly defined conditions | Optionally compare model predictions to observed evidence; must label assumptions, not paste synthetic findings as live facts |
| CLI / show-tech / inventory | User-supplied **captured evidence**, line IDs, source device, vendor, commands, scope and time when available | Check actual stated config and operational outputs, contradictions, gaps, counterevidence and confidence |
| Manufacturer knowledge | Source/release-scoped reference material and engineering questions | Determine which design checks and hypotheses to explore; never treat generic advice as proof an actual feature is missing |
| **AI Engineering Analysis** | Independent holistic analysis, context prioritization, cross-device correlation, uncertainty, read-only next checks and editable draft | Produce **new** engineering insights and cite supplied original evidence; it must not merely reformat or copy Design/Simulation output |

## Integration rules

1. **Independent start:** The standalone `/ai-topology` workspace supports blank topology, templates, user edits and attached config/CLI. No existing Design/Simulation session is required.
2. **Optional Design import:** The user may import a **copy** of topology data. This supplies intent; it does not overwrite, advance or constrain the normal Design → Inventory → Simulation → Module Report workflow.
3. **Optional Simulation consultation:** A later adapter can provide a versioned, scoped, **hypothetical** simulation outcome when the engineering question benefits from a comparative model. It is never part of the default AI answer, and the AI must say when it was not consulted. No simulator-generated answers are appended to training/evaluation prompts as predetermined correct responses.
4. **Model reasoning is separate:** the AI analyzes all user-supplied evidence, can question the simulated prediction, and can identify unknowns. Rule-by-rule reproduction of existing module configuration logic is prohibited.
5. **Evidence provenance:** An observed CLI line is not the same as user-entered intent or modeled synthetic behavior. Model assertions must cite correct evidence IDs and line numbers; citation validity alone does not imply engineering truth.
6. **Independent acceptance:** Hold-out captures / scenarios measure correctness, counterevidence and explanations. The simulator's existing deterministic tests remain independent regression coverage, **not model answer keys**.
7. **Safe release:** No deployment until real-model acceptance, topology/AI UI, full existing simulation regression, auth/data-safety and production check all pass.

### vPC example

- Existing Simulation knows what it would model if peer-link and keepalive are unavailable. That is useful as a **conditional prediction**, but it is not an observation.
- Given actual `show vpc` and configuration, AI must reason about the difference between operational `Peer Gateway: Enabled`, configuration scope, peer-switch's conditional design applicability, live keepalive state, and missing second-peer evidence.
- The AI should independently derive useful investigation steps rather than repeat a simulator summary or invent a failure.

**Engineering principle:** Reuse existing data and engineering experience; do not copy their outputs in place of reasoning.
