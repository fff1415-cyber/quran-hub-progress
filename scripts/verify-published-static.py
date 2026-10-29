"""Read public static files only: no JavaScript execution, application API, cookies or database."""
from html.parser import HTMLParser
import re
import sys
import urllib.request

ORIGIN='https://msht.io'


class EntryAssets(HTMLParser):
    def __init__(self):
        super().__init__();self.paths=set()
    def handle_starttag(self,tag,attrs):
        values=dict(attrs)
        candidate=values.get('src') if tag=='script' else values.get('href') if tag=='link' else None
        if candidate and re.fullmatch(r'/assets/[A-Za-z0-9_.-]+\.(?:js|css)',candidate):
            self.paths.add(candidate)


def verify_static(expected,fetch):
    if not re.fullmatch(r'[a-f0-9]{40}',expected):
        raise ValueError('Expected a full published commit')
    marker,_=fetch('/deploy-sha.txt',expected)
    if marker.decode().strip()!=expected:
        raise ValueError('Published commit does not match the expected release')
    html,content_type=fetch('/index.html',expected)
    if 'text/html' not in content_type or not html:
        raise ValueError('Static HTML entry is unavailable')
    parser=EntryAssets();parser.feed(html.decode('utf-8'))
    if not any(path.endswith('.js') for path in parser.paths):
        raise ValueError('Static entry has no compiled JavaScript asset')
    if len(parser.paths)>30:
        raise ValueError('Unexpected static entry size')
    for path in sorted(parser.paths):
        data,mime=fetch(path,expected)
        if not data or 'text/html' in mime or (path.endswith('.css') and 'text/css' not in mime):
            raise ValueError('Static asset is missing or returned an HTML fallback')
    return len(parser.paths)


def fetch_public_static(path,release):
    if path not in ['/deploy-sha.txt','/index.html'] and not re.fullmatch(r'/assets/[A-Za-z0-9_.-]+\.(?:js|css)',path):
        raise ValueError('Only public static release files may be requested')
    request=urllib.request.Request(ORIGIN+path+'?static_release_check='+release,headers={'Cache-Control':'no-cache'})
    with urllib.request.urlopen(request,timeout=30) as response:
        if response.url.split('?')[0]!=ORIGIN+path:
            raise ValueError('Static file redirected outside its expected path')
        return response.read(),response.headers.get('Content-Type','')


if __name__=='__main__':
    count=verify_static(sys.argv[1],fetch_public_static)
    print('Verified published commit, static HTML and',count,'entry assets without application API calls or student operations.')
