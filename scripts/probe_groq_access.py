"""Read-only Groq access preflight. No customer evidence, no secret disclosure.

Tests whether a GitHub-hosted runner can list models. This separates a
provider/account/network permission error from the engineering model evaluation.
"""
import json
import os
import urllib.error
import urllib.request

API = 'https://api.groq.com/openai/v1/models'
MODEL = 'openai/gpt-oss-120b'

def main():
    key = os.environ.get('GROQ_API_KEY', '')
    if not key:
        print('GROQ_PREFLIGHT missing_secret')
        raise SystemExit(2)
    request = urllib.request.Request(API, headers={'Authorization': 'Bearer ' + key})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.loads(response.read(160000))
        models = payload.get('data', [])
        available = any(x.get('id') == MODEL for x in models if isinstance(x, dict))
        print('GROQ_PREFLIGHT status=200 target_model_listed=' + str(available).lower())
        if not available:
            raise SystemExit('Target model absent from accessible models; check Groq model permissions.')
    except urllib.error.HTTPError as error:
        from engineering_ai import groq_error_category
        # Content type is reported as a predefined category only, never raw text.
        content_type = (error.headers.get('Content-Type', '') if error.headers else '').lower()
        kind = 'json' if 'json' in content_type else 'html' if 'html' in content_type else 'other'
        category = groq_error_category(error)
        print('GROQ_PREFLIGHT status=' + str(error.code) + ' content_type=' + kind
              + ' category=' + category)
        raise SystemExit(1)
    except (OSError, ValueError, TypeError, AttributeError):
        print('GROQ_PREFLIGHT unavailable_or_invalid_reply')
        raise SystemExit(1)

if __name__ == '__main__':
    main()
