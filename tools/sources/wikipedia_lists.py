"""Pull companies linked from Wikipedia list pages into tools/data/wikipedia_lists.json.

Every article linked from a page below is looked up on Wikidata; it is kept
when it has an official website (P856) and is not a person or a place.

    python3 tools/sources/wikipedia_lists.py
"""
import json, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'tools', 'data', 'wikipedia_lists.json')
UA = {'User-Agent': 'uaic-firms/1.0 (https://uchicagoactivistinvesting.com; tanish30@gmail.com)'}

PAGES = {
    'Investment Banking': ['List of investment banks', 'Bulge bracket', 'Boutique investment bank', 'Middle-market investment bank'],
    'Private Equity': ['List of private equity firms', 'PEI 300'],
    'Growth Equity & Venture Capital': ['List of venture capital firms'],
    'Hedge Funds': ['List of hedge funds', 'Activist shareholder'],
    'Asset Management': ['List of asset management firms', 'List of largest asset management companies', 'Sovereign wealth fund', 'List of largest pension schemes'],
    'Banking': ['List of largest banks', 'List of largest banks in the United States', 'Systemically important financial institution', 'List of largest financial services companies by revenue'],
    'Consulting': ['List of management consulting firms', 'Big Four accounting firms', 'List of accounting firms'],
    'Law': ['List of largest law firms by revenue', 'Vault Law 100', 'Magic Circle (law firms)', 'White-shoe firm'],
    'Startups': ['List of unicorn startup companies', 'List of largest Internet companies'],
    'Technology': ['List of largest technology companies by revenue', 'List of the largest software companies', 'List of largest Internet companies',
                   'List of semiconductor companies', 'List of artificial intelligence companies',
                   'List of cybersecurity companies', 'Nasdaq-100'],
    'Public Companies': ['List of S&P 500 companies', 'List of S&P 400 companies', 'List of S&P 600 companies', 'List of largest companies in the United States by revenue', 'List of largest companies by revenue',
                         'Dow Jones Industrial Average', 'FTSE 100 Index', 'Euro Stoxx 50', 'S&P/TSX 60', 'Nikkei 225'],
}
NOT_COMPANY = {'Q327333', 'Q11032', 'Q3918', 'Q902104', 'Q223371', 'Q5633421', 'Q35127', 'Q1002697', 'Q41298', 'Q7278', 'Q484652', 'Q2659904', 'Q875538', 'Q23002054', 'Q5', 'Q515', 'Q6256', 'Q35657', 'Q1549591', 'Q3624078', 'Q486972', 'Q13406463', 'Q4167410', 'Q11424', 'Q7725634', 'Q571', 'Q1093829'}


def api(host, params):
    url = 'https://%s/w/api.php?%s' % (host, urllib.parse.urlencode(dict(params, format='json', formatversion=2)))
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.loads(r.read())
        except Exception as e:
            print('  retry', e, file=sys.stderr)
            time.sleep(5 * (attempt + 1))
    return {}


def linked_items(title):
    """Wikidata ids of the articles a page links to."""
    items, cont = {}, {}
    while True:
        d = api('en.wikipedia.org', dict({'action': 'query', 'generator': 'links', 'titles': title, 'gplnamespace': 0,
                                          'gpllimit': 'max', 'prop': 'pageprops', 'ppprop': 'wikibase_item', 'redirects': 1}, **cont))
        for p in d.get('query', {}).get('pages', []):
            q = p.get('pageprops', {}).get('wikibase_item')
            if q:
                items[q] = p['title']
        if 'continue' not in d:
            return items
        cont = d['continue']


def claim(entity, prop):
    for c in entity.get('claims', {}).get(prop, []):
        v = c.get('mainsnak', {}).get('datavalue', {}).get('value')
        if v:
            return v
    return None


def main():
    found = {}
    for group, titles in PAGES.items():
        for title in titles:
            items = linked_items(title)
            print('%-34s %-55s %d links' % (group, title, len(items)))
            for q, t in items.items():
                found.setdefault(q, (group, t))
    ids = list(found)
    rows = []
    for i in range(0, len(ids), 50):
        d = api('www.wikidata.org', {'action': 'wbgetentities', 'ids': '|'.join(ids[i:i + 50]), 'props': 'labels|claims', 'languages': 'en'})
        for q, e in d.get('entities', {}).items():
            site = claim(e, 'P856')
            types = {c['mainsnak'].get('datavalue', {}).get('value', {}).get('id') for c in e.get('claims', {}).get('P31', [])}
            if not site or types & NOT_COMPANY or claim(e, 'P576'):
                continue
            logo = claim(e, 'P154')
            group, title = found[q]
            rows.append({'name': e.get('labels', {}).get('en', {}).get('value') or title, 'site': site, 'group': group,
                         'logo': 'http://commons.wikimedia.org/wiki/Special:FilePath/' + urllib.parse.quote(logo) if logo else ''})
        time.sleep(0.5)
    json.dump(rows, open(OUT, 'w'), indent=0, ensure_ascii=False)
    print(len(rows), 'companies ->', OUT)


if __name__ == '__main__':
    main()
