"""Pull startups into tools/data/: every Y Combinator company (from the open
yc-oss directory) and the a16z portfolio (embedded in a16z.com/portfolio).

    python3 tools/sources/startups.py
"""
import json, os, re, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, 'tools', 'data')
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36'}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read().decode('utf-8', 'ignore')


def yc():
    rows = []
    for c in json.loads(get('https://yc-oss.github.io/api/companies/all.json')):
        if not c.get('name') or not c.get('website'):
            continue
        logo = c.get('small_logo_thumb_url') or ''
        rows.append({'name': c['name'].strip(), 'site': c['website'], 'group': 'Startups',
                     'logo': '' if 'missing' in logo else logo,
                     'aliases': [n for n in c.get('former_names') or [] if n]})
    return rows


def a16z():
    html = get('https://a16z.com/portfolio/')
    start = html.index('window.a16z_portfolio_companies = ') + len('window.a16z_portfolio_companies = ')
    companies, _ = json.JSONDecoder().raw_decode(html[start:])
    rows = []
    for c in companies:
        if c.get('title') and c.get('web'):
            rows.append({'name': re.sub(r'\s+', ' ', c['title']).strip(), 'site': c['web'], 'group': 'Startups', 'logo': ''})
    return rows


if __name__ == '__main__':
    os.makedirs(DATA, exist_ok=True)
    for name, fn in (('yc', yc), ('a16z', a16z)):
        rows = fn()
        json.dump(rows, open(os.path.join(DATA, name + '.json'), 'w'), indent=0, ensure_ascii=False)
        print(name, len(rows))
