"""Groq connectivity comparator: both public model listing and a real synthetic chat.

Identical script runs in GitHub Actions or another trusted Python 3 environment.
Only HTTP status, allowlisted provider error code/type, and success flags are logged.
Never log credentials, request bodies, response text or raw error messages.

Usage: GROQ_API_KEY=<secret> python scripts/probe_groq_access.py
"""
import json
import os
import urllib.error
import urllib.request

MODEL = 'openai/gpt-oss-120b'
MODELS_URL = 'https://api.groq.com/openai/v1/models'
CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions'
SAFE_CODES = frozenset({
    'model_permission_blocked_org',
    'model_permission_blocked_project',
    'organization_restricted',
    'model_not_found',
    'invalid_api_key',
    'insufficient_permissions',
})
SAFE_TYPES = frozenset({
    'permissions_error', 'authentication_error', 'invalid_request_error',
    'rate_limit_error',
})
SAFE_FINISH = frozenset({'stop', 'length'})


def safe_error_category(raw):
    """Parse only allowlisted machine codes from at most 2KiB of provider data."""
    try:
        item = json.loads(raw)
        error = item.get('error', {})
        if not isinstance(error, dict):
            return 'unclassified'
        code = error.get('code')
        if isinstance(code, str) and code in SAFE_CODES:
            return code
        kind = error.get('type')
        if isinstance(kind, str) and kind in SAFE_TYPES:
            return kind
    except (ValueError, TypeError, AttributeError):
        pass
    return 'unclassified'


def call(url, key=None, payload=None, timeout=20):
    headers = {'Accept': 'application/json'}
    if key:
        headers['Authorization'] = 'Bearer ' + key
    if payload is not None:
        headers['Content-Type'] = 'application/json'
    request = urllib.request.Request(
        url, headers=headers,
        data=json.dumps(payload).encode('utf-8') if payload is not None else None,
        method='POST' if payload is not None else 'GET',
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read(160000)
            return {'status': response.status, 'body': json.loads(raw),
                    'category': 'none', 'content_type': 'json'}
    except urllib.error.HTTPError as error:
        # Never print server error bodies, since even an error might echo prompts.
        raw = error.read(2048)
        ctype = (error.headers.get('Content-Type', '') if error.headers else '').lower()
        return {'status': error.code, 'body': None,
                'category': safe_error_category(raw),
                'content_type': 'json' if 'json' in ctype else 'html' if 'html' in ctype else 'other'}
    except (OSError, ValueError, TypeError, AttributeError):
        return {'status': 'unavailable', 'body': None,
                'category': 'unavailable_or_invalid_reply', 'content_type': 'other'}


def run_probe(key):
    """Always test BOTH authenticated endpoints even when one returns 403."""
    anonymous = call(MODELS_URL)
    models = call(MODELS_URL, key=key)
    # Identical public-domain-only synthetic prompt; absolutely no user CLI data.
    chat = call(CHAT_URL, key=key, payload={
        'model': MODEL,
        'messages': [{'role': 'user', 'content': 'Return the single word OK.'}],
        'max_tokens': 128,
        'stream': False,
    })
    available = False
    if models['status'] == 200 and isinstance(models['body'], dict):
        items = models['body'].get('data', [])
        available = isinstance(items, list) and any(
            isinstance(x, dict) and x.get('id') == MODEL for x in items
        )
    completion_ok = False
    finish = 'none'
    if chat['status'] == 200 and isinstance(chat['body'], dict):
        choices = chat['body'].get('choices', [])
        if isinstance(choices, list) and choices and isinstance(choices[0], dict):
            choice = choices[0]
            raw_finish = choice.get('finish_reason')
            finish = raw_finish if raw_finish in SAFE_FINISH else 'other'
            reply = choice.get('message', {})
            completion_ok = (finish == 'stop' and isinstance(reply, dict) and
                             bool(str(reply.get('content') or '').strip()))
    for name, outcome, extra in [
        ('anonymous_models', anonymous, ''),
        ('authorized_models', models, ' target_model_listed=' + str(available).lower()),
        ('authorized_chat', chat, ' completion_ok=' + str(completion_ok).lower() + ' finish=' + finish),
    ]:
        print('GROQ_COMPARISON endpoint=' + name + ' status=' + str(outcome['status'])
              + ' content_type=' + outcome['content_type']
              + ' category=' + outcome['category'] + extra, flush=True)
    # Chat capability is decisive. A blocked model listing must not prevent
    # engineering acceptance if the actual authorized chat request succeeds.
    chat_ready = chat['status'] == 200 and completion_ok
    print('GROQ_COMPARISON decision=' + ('chat_ready' if chat_ready else 'chat_unavailable'), flush=True)
    return chat_ready


def main():
    key = os.getenv('GROQ_API_KEY', '')
    if not key:
        print('GROQ_COMPARISON missing_secret')
        raise SystemExit(2)
    if not run_probe(key):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
