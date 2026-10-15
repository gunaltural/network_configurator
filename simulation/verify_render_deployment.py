#!/usr/bin/env python3
"""Check Render LIVE deployment (not just a successful GitHub build).

The public /healthz endpoint is intentionally usable without a login. With
authentication enabled, protected Simulator routes cannot be confirmed from
the public Internet without an authenticated session; they are tested separately
inside the exact production Docker image in CI.
"""
import argparse
import json
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def check_once(base_url, expected_version, timeout=15):
    """Return (passed, short_reason); never log HTTP bodies beyond safe fields."""
    url = base_url.rstrip('/') + '/healthz'
    if not url.startswith('https://'):
        return False, 'Public deployment URL must use HTTPS.'
    try:
        request = Request(url, headers={'Accept': 'application/json', 'Cache-Control': 'no-cache',
                                        'User-Agent': 'NetworkConfigurator-Release-Verification/1'})
        with urlopen(request, timeout=timeout) as response:
            status = response.status
            payload = json.load(response)
        if status != 200 or not isinstance(payload, dict):
            return False, f'Health endpoint unexpected response: HTTP {status}'
        actual_version = payload.get('version')
        if actual_version != expected_version:
            return False, f'Deployed version {actual_version!r}, expected {expected_version!r}'
        if payload.get('simulator_ready') is not True or payload.get('ok') is not True:
            return False, 'Required Simulator files not ready in running deployment.'
        return True, f'LIVE verified: version {actual_version}, Simulator assets ready'
    except HTTPError as error:
        return False, f'Health endpoint returned HTTP {error.code}'
    except (URLError, TimeoutError, OSError, ValueError) as error:
        return False, f'Health endpoint unavailable: {type(error).__name__}'


def main(argv=None):
    parser = argparse.ArgumentParser(description='Wait for verified Render deployment')
    parser.add_argument('--url', required=True)
    parser.add_argument('--version', required=True)
    parser.add_argument('--max-seconds', type=int, default=900)
    parser.add_argument('--interval', type=int, default=20)
    args = parser.parse_args(argv)
    if args.max_seconds < 1 or args.interval < 1:
        parser.error('max-seconds and interval must be positive')
    start = time.monotonic()
    attempt = 0
    while True:
        attempt += 1
        success, reason = check_once(args.url, args.version)
        print(f'Attempt {attempt}: {reason}', flush=True)
        if success:
            print('Verified LIVE HTTP readiness. Authenticated simulator UI is covered by separate Docker/browser tests.')
            return 0
        remaining = args.max_seconds - (time.monotonic() - start)
        if remaining <= 0:
            print(f'RELEASE VERIFICATION FAILED: {reason}', file=sys.stderr)
            return 1
        time.sleep(min(args.interval, remaining))


if __name__ == '__main__':
    raise SystemExit(main())
