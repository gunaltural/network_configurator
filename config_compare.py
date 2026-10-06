"""Read-only text comparison. Configuration inputs are never persisted or deployed."""
import difflib
from fastapi import HTTPException
from pydantic import BaseModel, Field

MAX_CHARS = 500_000
MAX_LINES = 10_000


class CompareRequest(BaseModel):
    left: str = Field(max_length=MAX_CHARS)
    right: str = Field(max_length=MAX_CHARS)
    left_label: str = Field(default='Baseline', max_length=120)
    right_label: str = Field(default='Candidate', max_length=120)
    ignore_trailing_space: bool = False
    ignore_indentation: bool = False
    ignore_blank_lines: bool = False
    ignore_metadata: bool = False
    exclude_prefixes: list[str] = Field(default_factory=list, max_length=30)


def compare_configurations(data: CompareRequest):
    import re
    metadata = re.compile(r'^(?:!\s*(?:Last configuration change|NVRAM config last updated|Time:)|Building configuration\.\.\.|Current configuration\s*:|#\s*Last configuration (?:was updated|was saved))', re.I)
    prefixes = [p.strip() for p in data.exclude_prefixes if p.strip()]
    if any(len(p) > 200 for p in prefixes):
        raise HTTPException(400, 'Each excluded line prefix must be at most 200 characters.')

    def prepare(text):
        if '\x00' in text:
            raise HTTPException(400, 'Binary files are not supported. Upload a text configuration.')
        text = text.removeprefix('\ufeff').replace('\r\n', '\n').replace('\r', '\n')
        raw = text.split('\n') if text else []
        if raw and raw[-1] == '' and text.endswith('\n'):
            raw.pop()
        if len(raw) > MAX_LINES:
            raise HTTPException(400, f'Each configuration supports up to {MAX_LINES:,} lines.')
        retained, ignored = [], 0
        for number, line in enumerate(raw, 1):
            trimmed = line.strip()
            if ((data.ignore_blank_lines and not trimmed) or
                (data.ignore_metadata and metadata.match(trimmed)) or
                any(trimmed.startswith(p) for p in prefixes)):
                ignored += 1
                continue
            key = line.lstrip() if data.ignore_indentation else line
            if data.ignore_trailing_space:
                key = key.rstrip()
            retained.append({'number': number, 'text': line, 'key': key})
        return retained, ignored, len(raw)

    left, ignored_left, raw_left = prepare(data.left)
    right, ignored_right, raw_right = prepare(data.right)
    a, b = [r['key'] for r in left], [r['key'] for r in right]
    rows, counts = [], dict(added=0, removed=0, modified=0, unchanged=0)

    def row(kind, x=None, y=None):
        counts[kind] += 1
        rows.append(dict(kind=kind, left=x['text'] if x else None,
                         right=y['text'] if y else None,
                         leftNumber=x['number'] if x else None,
                         rightNumber=y['number'] if y else None))

    # Remove matching edges first: a single edit in a long repeated configuration
    # must not mark its unchanged tail as modified because of popular-line filtering.
    prefix = 0
    while prefix < min(len(a), len(b)) and a[prefix] == b[prefix]:
        prefix += 1
    suffix = 0
    while suffix < min(len(a), len(b)) - prefix and a[-1-suffix] == b[-1-suffix]:
        suffix += 1
    aend, bend = len(a)-suffix, len(b)-suffix
    middle_a, middle_b = a[prefix:aend], b[prefix:bend]
    opcodes = [('equal', 0, prefix, 0, prefix)] if prefix else []
    for tag, i, j, k, l in difflib.SequenceMatcher(None, middle_a, middle_b, autojunk=len(middle_a)*len(middle_b)>4_000_000).get_opcodes():
        opcodes.append((tag, i+prefix, j+prefix, k+prefix, l+prefix))
    if suffix:
        opcodes.append(('equal', aend, len(a), bend, len(b)))
    for tag, i, j, k, l in opcodes:
        old, new = left[i:j], right[k:l]
        if tag == 'equal':
            for x, y in zip(old, new): row('unchanged', x, y)
        elif tag == 'delete':
            for x in old: row('removed', x)
        elif tag == 'insert':
            for y in new: row('added', y=y)
        else:
            paired = min(len(old), len(new))
            for n in range(paired): row('modified', old[n], new[n])
            for x in old[paired:]: row('removed', x)
            for y in new[paired:]: row('added', y=y)

    # Export exactly the displayed alignment; avoid running a second diff with
    # different heuristics and producing inconsistent results.
    clean_label = lambda s: s.replace('\n', ' ').replace('\r', ' ').replace('\t', ' ')
    patch = ['--- ' + clean_label(data.left_label), '+++ ' + clean_label(data.right_label)]
    changed = [i for i, r in enumerate(rows) if r['kind'] != 'unchanged']
    ranges = []
    for i in changed:
        start, end = max(0, i - 3), min(len(rows), i + 4)
        if ranges and start <= ranges[-1][1]: ranges[-1][1] = end
        else: ranges.append([start, end])
    for start, end in ranges:
        before = rows[:start]
        block = rows[start:end]
        ln = sum(r['left'] is not None for r in before)
        rn = sum(r['right'] is not None for r in before)
        lc = sum(r['left'] is not None for r in block)
        rc = sum(r['right'] is not None for r in block)
        patch.append(f'@@ -{ln + (1 if lc else 0)},{lc} +{rn + (1 if rc else 0)},{rc} @@')
        for r in block:
            if r['kind'] == 'unchanged': patch.append(' ' + r['left'])
            else:
                if r['left'] is not None: patch.append('-' + r['left'])
                if r['right'] is not None: patch.append('+' + r['right'])
    return dict(rows=rows, counts=counts, identical=not changed,
                ignored=dict(left=ignored_left, right=ignored_right),
                lines=dict(left=raw_left, right=raw_right),
                diff='\n'.join(patch) + '\n' if changed else '',
                options=data.model_dump(exclude={'left', 'right'}))


def install_config_compare(app, base_dir):
    from fastapi.responses import HTMLResponse, Response

    @app.get('/config-compare', response_class=HTMLResponse)
    def page():
        return HTMLResponse((base_dir / 'config-compare.html').read_text(), headers={'Cache-Control': 'no-store'})

    @app.get('/config-compare.js')
    def script():
        return Response((base_dir / 'config-compare.js').read_text(), media_type='application/javascript', headers={'Cache-Control': 'no-store'})

    @app.post('/api/config-compare')
    def compare(data: CompareRequest):
        return compare_configurations(data)
