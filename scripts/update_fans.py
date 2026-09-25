import json
import os
from datetime import datetime, timezone
from urllib.parse import urlencode
from urllib.request import Request, urlopen

uid = os.environ.get('BILIBILI_UID', '3461581784484215').strip()
if not uid.isdigit():
    raise SystemExit('BILIBILI_UID must contain digits only')

query = urlencode({'mid': uid, 'jsonp': 'jsonp'})
url = f'https://api.bilibili.com/x/web-interface/card?{query}'
request = Request(
    url,
    headers={
        'User-Agent': 'Mozilla/5.0',
        'Referer': f'https://space.bilibili.com/{uid}/',
        'Accept': 'application/json',
    },
)

with urlopen(request, timeout=20) as response:
    payload = json.loads(response.read().decode('utf-8'))

if payload.get('code') != 0:
    raise SystemExit(payload.get('message') or 'Bilibili API request failed')

data = payload.get('data') or {}
card = data.get('card') or {}
follower = data.get('follower')
if not isinstance(follower, int):
    raise SystemExit('Bilibili response did not contain data.follower')

result = {
    'uid': uid,
    'username': card.get('name'),
    'follower': follower,
    'updatedAt': datetime.now(timezone.utc).isoformat(),
}

with open('fans.json', 'w', encoding='utf-8') as output:
    json.dump(result, output, ensure_ascii=False, indent=2)
    output.write('\n')

print(json.dumps(result, ensure_ascii=False))
