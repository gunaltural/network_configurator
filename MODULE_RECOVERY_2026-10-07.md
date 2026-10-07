# Module regression review · 2026-10-07 · 5.21.3

Reference: last week's GitHub revision `4173dbf1ba89516a1f6aae5b0e73ed028a4e48c3` (2026-10-01). Recovery changes are isolated from the unpublished product-architecture audit.

## Corrections

- SD-WAN no longer requires the external SheetJS CDN to read a workbook. The authenticated `/api/sdwan/excel` endpoint reads `.xlsx` with openpyxl and `.xls` with xlrd. Render packaging includes both dependencies and the parser.
- Existing planning column names and site/router selection remain supported. The named planning worksheet is preferred; title/blank rows before headers are accepted. Numeric site IDs are returned without `.0`.
- Upload limits and workbook expansion bounds are enforced. Superseded uploads and requests finishing after leaving the module cannot update another screen. Failed uploads clear stale site/router choices.
- The 5.21.2 Automatic Inventory credential-field correction is retained.
- Config Compare regression expectations now match its already-approved Implementation & Validation navigation location.

## Compatibility comparison

SD-WAN, BGP, OSPF, STP, EVPN, QoS, Cisco vPC, Arista MLAG and Huawei M-LAG configuration generators are unchanged from the October 1 reference. Subsequent System and Management composition support and Huawei iStack additions are retained. No wholesale rollback or project-data migration was performed.

## Validation

- All Python tests passed (63 in the complete run, plus the subsequently added legacy XLS adapter branch test).
- All 25 DOM/UI suites passed after correcting the stale Config Compare navigation test assertion. They cover 32 module/platform combinations, topology labels, configuration output, verification, troubleshooting, Inventory/Excel, saved project/revision flows, and bilingual Word/report composition.
- Added SD-WAN tests exercise an actual two-router XLSX planning workbook through the API, then site/router selection, generated configuration, reporting and project restoration without a browser XLSX global.
- Legacy XLS reader branch is tested with a mocked xlrd workbook; no user-supplied legacy XLS file was available.
- Device SSH and browser network calls are mocked in these tests. This is regression evidence, not real-device deployment acceptance.
