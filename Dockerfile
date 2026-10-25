FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY simulation-workbench.js simulation_report.py simulation-report.js synthetic-bgp.js synthetic-lab.js lab_service.py lab_gateway.py network_lab.py lab_runner.py network-lab.html network-lab.js sdwan-bulk-template.json sdwan-template.json discovery_details.py discovery_report.py sdwan_excel.py network_discovery.py network-discovery.html network-discovery.js config_compare.py config-compare.html config-compare.js project_store.py project-library.js app.py authentication.py login.html report_docx.py inventory_excel.py web.html reporting.html engineering-locale.js engineering-report.js path-diagnostics.js design-checks.js vpc-report.js verification-plan.js corporate-theme.css corporate-shell.js huawei-istack.js ./
COPY project-workflow.js workspace-storage.js deliverables.html deliverables.js ./
COPY bgp-traffic-policy.js ./
COPY port_mapping.py port-mapping.html port-mapping.js port-mapping-core.js port-mapping-oui.json.gz port-mapping-registry-NOTICE.txt ./
COPY samples/port-mapping ./samples/port-mapping
COPY simulation/ ./simulation/
CMD ["python", "app.py"]
