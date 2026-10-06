"""Single-account authentication; sessions are process-local until the database phase."""
import hashlib
import hmac
import os
import secrets
import threading
import time
from urllib.parse import quote, urlsplit

from fastapi import HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from pydantic import BaseModel, Field

COOKIE = '__Host-nc-session'
ITERATIONS = 600_000
TTL = 8 * 60 * 60


def password_hash(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, ITERATIONS)
    return f'pbkdf2_sha256${ITERATIONS}${salt.hex()}${digest.hex()}'


def valid_hash(encoded):
    try:
        algorithm, rounds, salt, digest = encoded.split('$')
        return algorithm == 'pbkdf2_sha256' and ITERATIONS <= int(rounds) <= 2_000_000 and len(bytes.fromhex(salt)) == 16 and len(bytes.fromhex(digest)) == 32
    except (ValueError, AttributeError):
        return False


def verify_password(password, encoded):
    if not valid_hash(encoded):
        return False
    _, rounds, salt, expected = encoded.split('$')
    actual = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), int(rounds))
    return hmac.compare_digest(actual, bytes.fromhex(expected))


def safe_next(value):
    if not value.startswith('/') or value.startswith('//') or '\\' in value or any(ord(c) < 32 for c in value):
        return '/'
    parsed = urlsplit(value)
    return value if not parsed.netloc and parsed.path in ('/', '/reporting') else '/'


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=1024)
    next: str = Field(default='/', max_length=2000)


class Authentication:
    def __init__(self):
        self.enabled = os.getenv('AUTH_ENABLED', '1').lower() not in ('0', 'false', 'off')
        self.username = os.getenv('AUTH_USERNAME', '').strip()
        self.encoded = os.getenv('AUTH_PASSWORD_HASH', '')
        raw = os.getenv('AUTH_PASSWORD', '')
        if not self.encoded and len(raw) >= 12:
            self.encoded = password_hash(raw)
        self.lock = threading.Lock()
        self.sessions = {}
        self.attempts = {}
        self.dummy_hash = password_hash(secrets.token_urlsafe(32))

    @property
    def configured(self):
        return bool(self.username and len(self.username) <= 80 and valid_hash(self.encoded))

    def user(self, token):
        if not token:
            return None
        key = hashlib.sha256(token.encode()).hexdigest()
        with self.lock:
            expiry = self.sessions.get(key, 0)
            if expiry > time.time():
                return self.username
            self.sessions.pop(key, None)
        return None

    def revoke(self, token):
        if token:
            with self.lock:
                self.sessions.pop(hashlib.sha256(token.encode()).hexdigest(), None)

    def issue(self):
        token = secrets.token_urlsafe(32)
        now = time.time()
        with self.lock:
            self.sessions = {key: expiry for key, expiry in self.sessions.items() if expiry > now}
            if len(self.sessions) >= 256:
                self.sessions.pop(min(self.sessions, key=self.sessions.get))
            self.sessions[hashlib.sha256(token.encode()).hexdigest()] = now + TTL
        return token

    def throttle(self, ip):
        now = time.monotonic()
        with self.lock:
            self.attempts = {key: values for key, values in self.attempts.items() if values and values[-1] > now - 60}
            if len(self.attempts) > 2000:
                raise HTTPException(429, 'Too many sign-in attempts. Try again in one minute.', headers={'Retry-After': '60'})
            for key, limit in ((ip, 10), ('__global__', 60)):
                recent = [t for t in self.attempts.get(key, []) if t > now - 60]
                if len(recent) >= limit:
                    raise HTTPException(429, 'Too many sign-in attempts. Try again in one minute.', headers={'Retry-After': '60'})
                self.attempts[key] = recent + [now]


def install_authentication(app, base_dir):
    auth = Authentication()
    app.state.authentication = auth

    @app.middleware('http')
    async def access_control(request: Request, call_next):
        if auth.enabled:
            if request.method not in ('GET', 'HEAD', 'OPTIONS'):
                origin = request.headers.get('origin', '')
                # Public HTTPS origin, even when Render terminates TLS upstream.
                expected = 'https://' + request.url.netloc
                if origin != expected:
                    return JSONResponse({'detail': 'Same-origin request required.'}, status_code=403)
            public = request.url.path in ('/login', '/auth/login', '/auth/status', '/healthz')
            user = auth.user(request.cookies.get(COOKIE))
            request.state.user = user
            if request.url.path == '/api/health' and request.method in ('GET', 'HEAD') and not user:
                return JSONResponse({'ok': True}, headers={'Cache-Control': 'no-store'})
            if not public and not user:
                if request.url.path.startswith(('/api/', '/auth/')):
                    return JSONResponse({'detail': 'Sign in required.', 'login_url': '/login'}, status_code=401, headers={'Cache-Control': 'no-store'})
                target = safe_next(request.url.path + ('?' + request.url.query if request.url.query else ''))
                return RedirectResponse('/login?next=' + quote(target, safe=''), status_code=303, headers={'Cache-Control': 'no-store'})
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['Referrer-Policy'] = 'same-origin'
        return response

    @app.get('/healthz')
    def readiness():
        return {'ok': True}

    @app.get('/login')
    def login_page(request: Request):
        if not auth.enabled or auth.user(request.cookies.get(COOKIE)):
            return RedirectResponse(safe_next(request.query_params.get('next', '/')), status_code=303)
        return HTMLResponse((base_dir / 'login.html').read_text(encoding='utf-8'))

    @app.get('/auth/status')
    def auth_status(request: Request):
        user = auth.user(request.cookies.get(COOKIE))
        return {'enabled': auth.enabled, 'configured': auth.configured, 'authenticated': bool(user), 'username': user}

    @app.post('/auth/login')
    def login(data: LoginRequest, request: Request):
        if not auth.enabled:
            return {'ok': True, 'next': safe_next(data.next)}
        if not auth.configured:
            raise HTTPException(503, 'Sign-in setup is pending. Contact the application administrator.')
        auth.throttle(request.client.host if request.client else 'unknown')
        name_ok = hmac.compare_digest(data.username.strip().encode(), auth.username.encode())
        password_ok = verify_password(data.password, auth.encoded if name_ok else auth.dummy_hash)
        if not (name_ok and password_ok):
            raise HTTPException(401, 'Invalid username or password.')
        auth.revoke(request.cookies.get(COOKIE))
        response = JSONResponse({'ok': True, 'next': safe_next(data.next)})
        response.set_cookie(COOKIE, auth.issue(), max_age=TTL, httponly=True, secure=True, samesite='strict', path='/')
        return response

    @app.post('/auth/logout')
    def logout(request: Request):
        auth.revoke(request.cookies.get(COOKIE))
        response = Response(status_code=204)
        response.delete_cookie(COOKIE, path='/', secure=True, httponly=True, samesite='strict')
        return response

    return auth


if __name__ == '__main__':
    import getpass
    first = getpass.getpass('Password (at least 12 characters): ')
    second = getpass.getpass('Confirm password: ')
    if len(first) < 12 or first != second:
        raise SystemExit('Passwords must match and contain at least 12 characters.')
    print(password_hash(first))
