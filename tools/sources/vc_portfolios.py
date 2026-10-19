"""Pull portfolio companies from big venture firms' websites into tools/data/vc.json.

Each site is parsed its own way; most give only names, which resolve.py later
turns into websites. Sites that fail to parse are skipped with a note.

    python3 tools/sources/vc_portfolios.py
"""
import html as H, json, os, re, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'tools', 'data', 'vc.json')
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36'}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read().decode('utf-8', 'ignore')


def clean(s):
    return H.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', s))).strip()


def unescape_json(h):
    return h.replace('\\"', '"').replace('\\/', '/')


SITES = {
    'Sequoia Capital': ('https://sequoiacap.com/our-companies/',
                        lambda h: [(clean(n), None) for n in re.findall(r'<h2 class="framer-text[^"]*"[^>]*>([^<]{1,60})</h2></div><div class="framer-[^"]+" data-framer-component-type="RichTextContainer"', h)]),
    'Founders Fund': ('https://foundersfund.com/portfolio/',
                      lambda h: [(clean(n), None) for n in re.findall(r"<h2 class='h3 tile-heading[^']*'>\s*<span>(.*?)</span>", h, re.S)]),
    'Accel': ('https://www.accel.com/relationships',
              lambda h: [(clean(n), None) for n in re.findall(r'aria-label="View (.{1,60}?) company details"', h)]),
    'Lightspeed': ('https://lsvp.com/portfolio/',
                   lambda h: [(n, None) for n in json.loads(re.search(r'\["[^"\]]{1,60}"(?:,"[^"\]]{1,60}"){100,}\]', h).group(0))]),
    'Index Ventures': ('https://www.indexventures.com/companies/',
                       lambda h: [(clean(n), None) for n in re.findall(r'"@type": "ListItem", "position": \d+, "url": "[^"]+", "name": "([^"]+)"', h)]),
    'Greylock': ('https://greylock.com/portfolio/',
                 lambda h: [(clean(n), None) for n in re.findall(r'href="/portfolio/[^"]+/"><div[^>]*><img[^>]*alt="([^"]+)"', h)]),
    'NEA': ('https://www.nea.com/portfolio',
            lambda h: [(clean(n), None) for n in re.findall(r'"title":"([^"]{1,60})","status":"published","short_description"', unescape_json(h))]),
    'Bessemer': ('https://www.bvp.com/portfolio',
                 lambda h: [(clean(n), None) for n in re.findall(r'"name":"([^"]{1,60})","sectors"', unescape_json(h))]),
    'Lux Capital': ('https://www.luxcapital.com/companies',
                    lambda h: [(clean(n), None) for n in re.findall(r'class="company_name">([^<]{1,60})<', h)]),
    'Kleiner Perkins': ('https://www.kleinerperkins.com/partnerships/',
                        lambda h: [(clean(n), s) for n, s in re.findall(r'>\s*([^<>]{1,60}?)\s*</h2>(?:(?!</h2>).){0,1500}?href="(https?://[^"]+)"[^>]*>\s*Website', h, re.S)]),
    'Khosla Ventures': ('https://www.khoslaventures.com/portfolio',
                        lambda h: [(None, s) for s in re.findall(r'<a[^>]+href="(https?://(?!(?:www\.)?khoslaventures)[^"]+)"[^>]*>\s*<div', h)]),
}


def main():
    rows, seen = [], set()
    for firm, (url, parse) in SITES.items():
        try:
            got = parse(get(url))
        except Exception as e:
            print('%-16s failed: %s' % (firm, e), file=sys.stderr)
            continue
        n = 0
        for name, site in got:
            key = (name or site or '').lower()
            if not key or key in seen or (name and len(name) < 2):
                continue
            seen.add(key)
            rows.append({'name': name or '', 'site': site or '', 'group': 'Startups', 'logo': ''})
            n += 1
        print('%-16s %d' % (firm, n))
    json.dump(rows, open(OUT, 'w'), indent=0, ensure_ascii=False)
    print(len(rows), 'companies ->', OUT)


if __name__ == '__main__':
    main()
