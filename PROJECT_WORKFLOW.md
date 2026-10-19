# Guided projects and independent simulation

New projects start with a project name and one or more technology/vendor selections. Modules execute in the order displayed by the chooser. Existing projects without `projectWorkflow` retain their legacy design/report behavior.

Each selected module follows **Design → Inventory → Simulation → Module report**. Completing the report archives its edited report, inventory, verification records and simulation snapshots before the next module opens. Module completion requires recorded simulation evidence. The report transfer automatically records the current valid baseline if no scenario was recorded. Completed reports can be opened individually or merged from their stored documents; merging does not regenerate configuration from default module values.

Simulation is also available independently from the navigation or **Start independent simulation**. It opens a technology/vendor chooser and the existing native topology editor. This workspace receives a separate project identity. Simulation report export remains optional. A recoverable copy of the previous design, report and project-library identity is written to IndexedDB before a new project or independent simulation replaces the active editor. The previous workspace can be restored with its original identity. If IndexedDB is unavailable, the backup falls back to local browser storage; a backup failure stops the transition.

## Persistence and compatibility

`design.projectWorkflow` holds the selected modules, per-module status and gzip-compressed report archives. JSON fallback is used when compression streams are unavailable. The current session checkpoint is scoped by project identity. Save/Open and full project downloads include the workflow. Working-copy and project-duplicate operations rekey the workflow while keeping the origin identity of archived historical reports; opening/merging validates both module identity and permitted project identity.

Per-module scenarios are preserved without reconstructing historical evidence. Combined design reports accept up to 320 scenarios (eight modules × 40); the existing standalone simulation export limit remains 40. Project storage accepts 16 MB. Browser storage failures stop transitions and retain the previous checkpoint. Source report archives remain available independently of the current combined report.

## Verification

`test_project_workflow_browser.mjs` covers chooser cancellation, upfront multi-module selection, fresh defaults/identity, per-module inventory → simulation → report, scenario isolation, combined Word export, reload, full-project working-copy restore and archive rekeying, and independent OSPF simulation followed by recovery of the previous project. Existing workspace, project identity/library/roundtrip, reporting and simulation suites remain regression checks.

### 5.52.1 navigation and chooser correction

The simulation workflow bar and topology toolbar both expose **Open module report**. For a guided project, this action records the current valid simulation state if no snapshot exists, then transfers evidence through the existing simulator report handoff. Independent simulations keep their optional report export behavior. Technology selection uses fixed checkbox/name columns and a vendor column on desktop; vendor selection moves below the name on narrow screens.

Guided projects hide the design canvas Test in Simulation shortcut: simulation is entered through Continue to simulation after inventory. Standalone and legacy design workspaces retain their direct simulation entry. The native transfer handler remains shared by the ordered flow.

### 5.52.2 focused inventory and interactive workflow

Inventory hides report preview and maintenance tabs and uses the full editor width. Guided projects use clickable delivery steps: Design, Inventory, Simulation, Module report and Next module (Finish project for the final module). Current and visited steps are indicated. Simulation requires reaching inventory; report access requires the simulator or existing scoped evidence/archive, and advancing modules requires completing the current report. Returning between steps preserves inventory and report drafts. The visited stage is additive module metadata and travels with saved projects.

### 5.52.3 shared inventory and delivery clarity

Guided module reports hide the legacy maintenance tab row. Their simulation toolbar retains only Save scenario for optional comparison snapshots; Module report is the single report transition and automatically records the current valid state if it was not already saved. Standalone simulation exports remain available.

Use existing inventory explicitly selects records from another archived module in the same project and maps them to topology devices or additional inventory. Existing field values are preserved; serial conflicts and assigning two records to one device are rejected. Persistent asset identifiers prevent repeated reuse from duplicating a record and merge explicitly shared physical devices in the combined report while retaining module-specific designs, configurations and evidence. Legacy implicit cross-module inventory carry is disabled only for guided projects.

Project completion focuses on deliverables: a single module offers Word/PDF without merging; multiple modules offer a combined report and individual reports in a disclosure. The completed workflow is collapsed for optional review. Recovery remains available during work and in independent simulation, without distracting from completed project delivery.

Network Discovery removes split mode, width controls and the drag divider. SSH collection and CLI import are full-width alternatives; switching preserves entered values and existing split preferences open SSH view.

### 5.52.4 dashboard entry and simulation banner

Normal entry opens Dashboard. Home clears workspace/resume query parameters so a reload stays on Dashboard. Resume current project opens the retained design checkpoint; explicit project-load and guided workflow URLs still restore their intended workspace. Dashboard visibility updates do not snapshot a project mid-restore.

The fixed Test in Simulation banner is hidden in every design workspace. Guided projects use the Simulation step and independent simulations use their Open simulation action. The internal topology handoff remains shared and is exercised by simulator integration tests. Transfer errors are surfaced in the workflow status.

Independent inventory navigation uses an isolated inventory workspace and draft key, with an empty device list instead of a cached technology report. Device Inventory presents the record overview; SSH and Manual Entry & Excel open their respective input modes without repeating the collection selector. Inventory exports, saved-library identity and restoration are isolated from the retained project design/report. Switching methods and reload preserve inventory records.
