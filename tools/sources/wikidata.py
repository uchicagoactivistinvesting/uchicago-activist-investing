"""Pull companies from Wikidata into tools/data/wikidata.json.

A company is included when it has a website and an English Wikipedia article,
and either its type (P31) or its industry (P452) is one we care about. Each
query maps to one group in the firm list.

    python3 tools/sources/wikidata.py
"""
import csv, io, json, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'tools', 'data', 'wikidata.json')
UA = {'User-Agent': 'uaic-firms/1.0 (https://uchicagoactivistinvesting.com; tanish30@gmail.com)', 'Accept': 'text/csv'}

# group -> (company types, industries, minimum Wikipedia language editions)
GROUPS = {
    'Investment Banking': (['Q319845'], ['Q11833245'], 1),
    'Banking': (['Q22687', 'Q141145821', 'Q2512624'], [], 6),
    'Private Equity': (['Q5418962'], ['Q476115'], 1),
    'Growth Equity & Venture Capital': (['Q3487908'], ['Q219409'], 1),
    'Hedge Funds': (['Q105611'], ['Q105611', 'Q137119', 'Q138372', 'Q139445'], 1),
    'Asset Management': (['Q4230006'], ['Q14864997'], 1),
    'Fintech & Payments': (['Q12738586'], ['Q97466005', 'Q16319025'], 2),
    'Financial Services': ([], ['Q837171', 'Q57774188', 'Q29584334'], 5),
    'Real Estate': (['Q697852'], [], 3),
    'Insurance': (['Q2143354'], ['Q43183'], 6),
    'Consulting': (['Q2089936', 'Q2781630', 'Q23670565'], ['Q130286', 'Q2089936'], 1),
    'Technology': (['Q18388277', 'Q1058914', 'Q3800506', 'Q1194970', 'Q112042224'],
                   ['Q21157865', 'Q880371', 'Q638608', 'Q11661', 'Q75', 'Q3966', 'Q2986369'], 4),
    'Startups': (['Q129238'], [], 2),
    'Exchanges & Financial Data': (['Q11691'], [], 3),
}


def sparql(query):
    url = 'https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': query})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
                return list(csv.DictReader(io.StringIO(r.read().decode('utf-8'))))
        except Exception as e:
            print('  retry', attempt + 1, e, file=sys.stderr)
            time.sleep(10 * (attempt + 1))
    return []


def query(where, links):
    return '''SELECT ?c ?cLabel ?site ?logo ?links WHERE {
  %s
  ?c wdt:P856 ?site ; wikibase:sitelinks ?links .
  FILTER(?links >= %d)
  ?art schema:about ?c ; schema:isPartOf <https://en.wikipedia.org/> .
  FILTER NOT EXISTS { ?c wdt:P576 [] }
  OPTIONAL { ?c wdt:P154 ?logo }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}''' % (where, links)


def main():
    out = {}
    for group, (types, industries, links) in GROUPS.items():
        parts = ['?c wdt:P31/wdt:P279* wd:%s .' % t for t in types] + ['?c wdt:P452 wd:%s .' % i for i in industries]
        rows = []
        for part in parts:
            got = sparql(query(part, links))
            print('%-32s %-28s %d' % (group, part.split()[-2], len(got)))
            rows += got
            time.sleep(2)
        for r in rows:
            qid = r['c'].rsplit('/', 1)[-1]
            name = r['cLabel']
            if not name or name == qid:
                continue
            prev = out.get(qid)
            if prev and prev['links'] >= int(r['links']) and prev['group'] != 'Financial Services':
                continue
            out[qid] = {'name': name, 'site': r['site'], 'logo': r['logo'], 'links': int(r['links']),
                        'group': group if not prev or prev['group'] in ('Financial Services', 'Banking') else prev['group']}
    rows = sorted(out.values(), key=lambda r: -r['links'])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(rows, open(OUT, 'w'), indent=0, ensure_ascii=False)
    print(len(rows), 'companies ->', OUT)


if __name__ == '__main__':
    main()
