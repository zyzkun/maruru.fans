#!/usr/bin/env python3
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib import parse, request

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get('PORT', '8000'))
BILIBILI_UID = os.environ.get('BILIBILI_UID', '3461581784484215').strip()
BILIBILI_CARD_API = 'https://api.bilibili.com/x/web-interface/card'


def safe_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def fetch_bilibili_card():
    if not BILIBILI_UID.isdigit():
        raise RuntimeError('BILIBILI_UID 必须是纯数字。')

    query = parse.urlencode({'mid': BILIBILI_UID, 'jsonp': 'jsonp'})
    url = f'{BILIBILI_CARD_API}?{query}'
    req = request.Request(
        url,
        headers={
            'User-Agent': 'Mozilla/5.0',
            'Referer': f'https://space.bilibili.com/{BILIBILI_UID}/',
            'Accept': 'application/json',
        },
    )
    with request.urlopen(req, timeout=15) as response:
        text = response.read().decode('utf-8', errors='replace')

    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f'B 站接口返回不是合法 JSON: {text[:200]}') from exc

    if payload.get('code') != 0:
        message = payload.get('message') or '没有找到这个 B 站用户'
        raise RuntimeError(message)

    data = payload.get('data') or {}
    card = data.get('card') or {}
    follower = safe_int(data.get('follower'))
    if follower is None:
        raise RuntimeError(f'未能从 B 站返回中解析到 follower：{text[:200]}')

    return {
        'uid': BILIBILI_UID,
        'username': card.get('name'),
        'follower': follower,
    }


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
                result = fetch_bilibili_card()
                payload = json.dumps(result, ensure_ascii=False).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
                return
            except Exception as exc:
                payload = json.dumps({'error': str(exc)}).encode('utf-8')
                self.send_response(503)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(payload)))
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
    print(f'Bilibili UID: {BILIBILI_UID}')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nStopping server...')
    finally:
        httpd.server_close()
