#!/usr/bin/env python3
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib import parse, request

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get('PORT', '8000'))
BILIBILI_UID = os.environ.get('BILIBILI_UID', '3461581784484215').strip()
FANS_API_URL = os.environ.get('FANS_API_URL', '').strip()
FANS_API_KEY = os.environ.get('FANS_API_KEY', '').strip()


def safe_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def extract_follower(payload):
    if isinstance(payload, dict):
        for key, value in payload.items():
            lowered = str(key).lower()
            if lowered in {'follower', 'fans', 'follow_count', 'fans_num'}:
                parsed = safe_int(value)
                if parsed is not None:
                    return parsed
        for value in payload.values():
            found = extract_follower(value)
            if found is not None:
                return found
    elif isinstance(payload, list):
        for item in payload:
            found = extract_follower(item)
            if found is not None:
                return found
    return None


def build_remote_url():
    if not FANS_API_URL:
        raise RuntimeError('未配置 FANS_API_URL；请在环境变量里填写云 API 地址。')

    url = FANS_API_URL.strip()
    if '{uid}' in url:
        url = url.replace('{uid}', BILIBILI_UID)
    elif 'uid=' not in url:
        separator = '&' if '?' in url else '?'
        url = f'{url}{separator}uid={BILIBILI_UID}'

    if FANS_API_KEY and 'api_key=' not in url.lower() and 'apikey=' not in url.lower():
        separator = '&' if '?' in url else '?'
        url = f'{url}{separator}api_key={parse.quote(FANS_API_KEY)}'

    return url


def fetch_remote_follower():
    url = build_remote_url()
    req = request.Request(
        url,
        headers={
            'User-Agent': 'Mozilla/5.0 (compatible; fan-site/1.0)',
            'Accept': 'application/json',
        },
    )
    with request.urlopen(req, timeout=15) as response:
        text = response.read().decode('utf-8', errors='replace')

    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f'云 API 返回不是合法 JSON: {text[:200]}') from exc

    follower = extract_follower(payload)
    if follower is None:
        raise RuntimeError(f'未能从云 API 返回中解析到 follower：{text[:200]}')
    return follower


class FanProxyHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/api/fans'):
            try:
                follower = fetch_remote_follower()
                payload = json.dumps({'follower': follower}).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(payload)))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(payload)
                return
            except Exception as exc:
                payload = json.dumps({'error': str(exc)}).encode('utf-8')
                self.send_response(503)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(payload)))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(payload)
                return

        return super().do_GET()

    def log_message(self, format, *args):
        return


if __name__ == '__main__':
    os.chdir(ROOT)
    httpd = ThreadingHTTPServer(('0.0.0.0', PORT), FanProxyHandler)
    print(f'Fan backend running on http://localhost:{PORT}')
    print('Set FANS_API_URL and optionally FANS_API_KEY before calling /api/fans')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nStopping server...')
    finally:
        httpd.server_close()
