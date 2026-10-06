# Config Compare

Open **Projects → Config Compare**, or **Compare Config** beside the Technology Workspace configuration output. The menu item is active; no revision or lab is required.

Each side accepts pasted/editable text, a UTF-8/UTF-16 configuration file, a current generated device configuration, or a device configuration stored in a Project Library revision. Old running/startup configs, exported backups and third-party configs can be compared independently of our project format and vendor. Saved revisions without stored reporting configurations can still be compared by uploading their exported CLI text. Loading a revision here does not restore or modify the active project.

1. Load the baseline on the left and candidate on the right. Select the device when using generated/saved sources.
2. Edit either text if needed. Choose comparison options; exclusions are opt-in.
3. Compare and review added (green), removed (red), modified (amber) and unchanged rows with original line numbers.
4. Switch between changes with context, changes only and all lines. Use change navigation or paginated scrolling.
5. Download the text diff or the comparison JSON containing rows, counts, options, source labels and comparison time.

Inputs are not saved by the comparison service. No SSH connection, project save or device modification is performed. After editing inputs/options, previous results are hidden until the comparison is rerun. The result describes textual differences, not feature compatibility, command ordering safety or an executable deployment/rollback script. Line order and case remain significant. Line endings/BOM are normalized; trailing spaces, indentation, blank lines and recognized capture headers are excluded only when requested. Custom exclusions are literal line prefixes, not regular expressions. Exported diffs follow those same filters.

Limits: 500,000 decoded characters and 10,000 lines per source; uploaded files up to 2 MB. Results display at most 200 rows per page. One empty side is allowed for full addition/removal review.

Reference patterns reviewed: [rConfig manual comparison](https://docs.rconfig.com/configuration-management/manual-compare/) and [diff exclusion controls](https://docs.rconfig.com/configuration-management/diff-exclusions/). Independent source selection, visual diffs, context and export were adapted to our existing interface. The implementation uses Python standard-library comparison and our existing authentication; no additional paid service or editor dependency is required.
