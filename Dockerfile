ARG AI_IMAGE_PROFILE=embedded
FROM ghcr.io/ggml-org/llama.cpp@sha256:d9e9e74ba3f7ef119b1939162b1631f99b75ec703c310d140cfa2fdac8907389 AS llama_runtime
FROM python:3.12-slim AS app
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY simulation-workbench.js simulation_report.py simulation-report.js synthetic-bgp.js synthetic-lab.js lab_service.py lab_gateway.py network_lab.py lab_runner.py network-lab.html network-lab.js sdwan-bulk-template.json sdwan-template.json discovery_details.py discovery_report.py sdwan_excel.py network_discovery.py network-discovery.html network-discovery.js config_compare.py config-compare.html config-compare.js project_store.py project-library.js knowledge_store.py app.py authentication.py login.html report_docx.py inventory_excel.py web.html reporting.html engineering-locale.js engineering-report.js path-diagnostics.js design-checks.js vpc-report.js verification-plan.js corporate-theme.css corporate-shell.js huawei-istack.js ./
COPY project-workflow.js workspace-storage.js deliverables.html deliverables.js ./
COPY bgp-traffic-policy.js engineering_ai.py engineering_knowledge.py bgp_cli_evidence.py bgp_diagnostic_rules.py bgp_route_diagnostic_rules.py bgp_route_cli_evidence.py bgp_eos_cli_evidence.py bgp_eos_neighbor_detail.py tac_overview.py cross_domain_evidence.py ai-evidence.js engineering-ai.js ai-topology-workspace.js ai-topology-ui.js stp-analysis-v1.js stp-knowledge-v1.js stp-engineering-v2.js stp-network-analysis-v2.js network-engineering-findings-v1.js stp-operational-evidence-v1.js stp-synthetic-lab-v1.js stp-cto-report.js ai-topology.html analysis.html show-analysis.js analysis-ui.js ./
COPY port_mapping.py port-mapping.html port-mapping.js port-mapping-core.js port-mapping-oui.json.gz port-mapping-registry-NOTICE.txt ./
COPY knowledge/stp_v1.json ./knowledge/stp_v1.json
COPY samples/port-mapping ./samples/port-mapping
COPY simulation/ ./simulation/
CMD ["python", "app.py"]

# Lightweight first-MVP target when an explicitly configured external AI
# provider handles inference. No GGUF download, local server or GPU runtime.
FROM app AS hosted
CMD ["python", "app.py"]

# Production and the resource-limited acceptance test ship the same local model.
FROM app AS embedded
COPY --from=llama_runtime /app/ /opt/llama/
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libstdc++6 && rm -rf /var/lib/apt/lists/*
ADD --checksum=sha256:74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf /opt/models/network.gguf
RUN cp /usr/share/common-licenses/Apache-2.0 /opt/models/LICENSE
COPY start_embedded_ai.py ./
CMD ["python", "start_embedded_ai.py"]

# Render converts non-secret environment variables into Docker build args.
# Default preserves the current embedded runtime until an approved release
# selects AI_IMAGE_PROFILE=hosted for the small, external-provider image.
FROM ${AI_IMAGE_PROFILE} AS production
