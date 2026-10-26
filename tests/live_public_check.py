"""Read-only public API checks. Never writes data or executes SQL."""
import json
from pathlib import Path
import re
from urllib.request import Request, urlopen
from urllib.error import HTTPError

html = (Path(__file__).resolve().parents[1] / 'index.html').read_text(encoding='utf-8')
url = re.search(r"var SUPABASE_URL = '([^']+)'", html)[1]
key = re.search(r"var SUPABASE_KEY = '([^']+)'", html)[1]

def read(path):
    request = Request(url + path, headers={'apikey':key, 'Authorization':'Bearer ' + key})
    try:
        with urlopen(request, timeout=25) as response:
            return response.status, json.load(response)
    except HTTPError as error:
        return error.code, None

for table in ['info', 'bets']:
    status, _ = read('/rest/v1/' + table + '?select=*&limit=1')
    assert status == 200, (table, status)
    print(table + ': public read OK')
status, rows = read('/rest/v1/messages?select=nome,canzone,testo,foto,created_at&limit=20')
assert status == 200, ('messages', status)
assert isinstance(rows, list)
assert all(row.get('testo') is None and row.get('foto') is None for row in rows)
print('messages: public view OK, private fields NULL')
for table in ['guestbook_private', 'album_memories', 'album_media']:
    status, rows = read('/rest/v1/' + table + '?select=*&limit=1')
    assert status in (401,403) or (status == 200 and rows == []), (table, status, 'anonymous access must be denied')
    print(table + ': no anonymous content OK')
