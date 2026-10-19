"""Find websites for companies known only by name, using Clearbit's public
company autocomplete. A suggestion is accepted only when its name matches the
one we asked about (ignoring suffixes like Inc, LLC, Group). Results, including
misses, are cached in tools/data/resolve-cache.json.

Names come from tools/names/*.txt (one per line, "# group" first line) and from
any tools/data/*.json row that has a name but no site.

    python3 tools/sources/resolve.py
"""
import glob, json, os, re, sys, time, unicodedata, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, 'tools', 'data')
CACHE = os.path.join(DATA, 'resolve-cache.json')
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36'}

SUFFIX = re.compile(r'\b(inc|incorporated|llc|llp|lp|ltd|limited|plc|corp|corporation|co|company|companies|group|holdings?|'
                    r'partners|management|capital|advisors|advisers|associates|investments?|technologies|technology|labs|'
                    r'international|global|the|and|sa|ag|nv|gmbh|ventures|securities|financial|fund|funds|industries|software|'
                    r'systems|solutions|services)\b')


def core(name):
    s = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower().replace('&', ' and ')
    s = re.sub(r'[^a-z0-9 ]+', ' ', s)
    return re.sub(r'\s+', ' ', SUFFIX.sub(' ', s)).strip() or re.sub(r'\s+', ' ', s).strip()


def matches(want, got):
    a, b = core(want), core(got)
    if not a or not b:
        return False
    return a == b or a.replace(' ', '') == b.replace(' ', '')


def wikidata(name):
    """Fallback: a Wikidata item with exactly this name and an official website."""
    q = urllib.parse.urlencode({'action': 'wbsearchentities', 'search': name, 'language': 'en', 'type': 'item', 'limit': 5, 'format': 'json'})
    try:
        with urllib.request.urlopen(urllib.request.Request('https://www.wikidata.org/w/api.php?' + q, headers=UA), timeout=20) as r:
            hits = [h['id'] for h in json.loads(r.read()).get('search', []) if matches(name, h.get('label', ''))]
        if not hits:
            return ''
        q = urllib.parse.urlencode({'action': 'wbgetentities', 'ids': '|'.join(hits), 'props': 'claims', 'format': 'json'})
        with urllib.request.urlopen(urllib.request.Request('https://www.wikidata.org/w/api.php?' + q, headers=UA), timeout=20) as r:
            entities = json.loads(r.read()).get('entities', {})
        for qid in hits:
            claims = entities.get(qid, {}).get('claims', {})
            types = {c['mainsnak'].get('datavalue', {}).get('value', {}).get('id') for c in claims.get('P31', [])}
            sites = [c['mainsnak'].get('datavalue', {}).get('value') for c in claims.get('P856', [])]
            if sites and sites[0] and 'Q5' not in types:
                return urllib.parse.urlparse(sites[0]).netloc.lower().removeprefix('www.')
    except Exception:
        return None
    return ''


def lookup(name):
    url = 'https://autocomplete.clearbit.com/v1/companies/suggest?' + urllib.parse.urlencode({'query': name})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
                for s in json.loads(r.read()):
                    if s.get('domain') and matches(name, s.get('name') or ''):
                        return s['domain']
                return wikidata(name)
        except urllib.error.HTTPError as e:
            if e.code != 429:
                return ''
        except Exception:
            pass
        time.sleep(2 * (attempt + 1))
    return None  # unknown; try again next run


def wanted():
    names = set()
    for f in glob.glob(os.path.join(ROOT, 'tools', 'names', '*.txt')):
        for line in open(f, encoding='utf-8'):
            line = line.strip()
            if line and not line.startswith('#'):
                names.add(line)
    for f in glob.glob(os.path.join(DATA, '*.json')):
        if f == CACHE:
            continue
        for r in json.load(open(f, encoding='utf-8')):
            if r.get('name') and not r.get('site'):
                names.add(r['name'])
    return names


def main():
    cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
    todo = sorted(n for n in wanted() if cache.get(n) is None)
    print(len(todo), 'names to resolve,', len(cache), 'cached')
    with ThreadPoolExecutor(8) as pool:
        for i, (name, domain) in enumerate(zip(todo, pool.map(lookup, todo))):
            if domain is not None:
                cache[name] = domain
            if i % 500 == 499:
                json.dump(cache, open(CACHE, 'w'), indent=0, sort_keys=True)
                print(' ', i + 1, file=sys.stderr)
    json.dump(cache, open(CACHE, 'w'), indent=0, sort_keys=True)
    hit = sum(1 for n in wanted() if cache.get(n))
    print('resolved %d of %d names' % (hit, len(wanted())))


if __name__ == '__main__':
    main()
