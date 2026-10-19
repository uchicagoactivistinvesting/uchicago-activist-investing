"""Build site/firms.js and site/assets/firms/*.webp.

Sources, highest priority first (a firm that appears in several keeps the
name and group from the first; its other names become search aliases):
  tools/firms.txt          hand-curated: "# Group" headers, "Name|domain|alias;alias"
  tools/names/*.txt        hand-written name lists, websites found by sources/resolve.py
  tools/data/*.json        pulled by the scripts in tools/sources/ (Wikipedia lists,
                           Wikidata, VC portfolios, a16z, Y Combinator)

Logos: the logo a startup gave YC, Google's favicon service, the site's
apple-touch-icon, the firm's Wikidata logo, DuckDuckGo, icon.horse. A 16px
favicon is used only when nothing larger turns up. Domains with no usable logo
are remembered in tools/data/logo-misses.json and skipped next time.

    python3 tools/build_firms.py                  # fetch new logos, write firms.js
    python3 tools/build_firms.py --retry-missing  # also retry remembered misses
    python3 tools/build_firms.py --no-fetch       # write firms.js from logos already saved
"""
import glob, hashlib, io, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'firms.txt')
LOGOS = os.path.join(ROOT, 'site', 'assets', 'firms')
OUT = os.path.join(ROOT, 'site', 'firms.js')
SIZE = 64  # stored size; shown at 20-28px, so this covers 2x screens
DATA = os.path.join(ROOT, 'tools', 'data')
MISSES = os.path.join(DATA, 'logo-misses.json')
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36'}


# Hosts that are not a company's own site, so they give no logo and never merge firms
SHARED_HOSTS = re.compile(r'(^|\.)(linkedin|facebook|twitter|instagram|medium|github|angel|crunchbase|notion|wixsite|'
                          r'squarespace|webflow|carrd|substack|ycombinator|bookface|youtube|bit|linktr)\.(com|co|io|site|ly|ee|so)$')
# Town and government sites that Wikipedia list pages link to alongside companies
PLACE_HOSTS = re.compile(r'\.(gov|mil)(\.[a-z]{2})?$|\.us$|(^|\.)(cityof|townof|villageof)|boro\.|borough|county')
SOURCES = [  # tools/data file, prominence tier (0 = most prominent; ties in search go to the lower tier)
    ('wikipedia_lists', 2), ('wikidata', 2), ('a16z', 3), ('vc', 3), ('yc', 4),
]


def host(site):
    site = (site or '').strip()
    if not site:
        return ''
    if '//' not in site:
        site = 'https://' + site
    h = urllib.parse.urlparse(site).netloc.lower().split(':')[0]
    return h[4:] if h.startswith('www.') else h


def key(name):
    return re.sub(r'[^a-z0-9]+', '', name.lower())


def plausible(name, domain):
    """A looked-up website is trusted only if the firm's first name word is in it
    (rejects lookups like "Forvis" -> probank.com)."""
    sys.path.insert(0, os.path.join(ROOT, 'tools', 'sources'))
    from resolve import core
    words = core(name).split()
    word = words[0] if words and len(words[0]) >= 3 else ''.join(words)
    label = re.sub(r'[^a-z0-9]', '', domain.rsplit('.', 1)[0])
    return bool(word) and word in label


def parse():
    """Every firm from every source, merged, in priority order."""
    firms, by_name, by_host = [], {}, {}

    def add(name, domain, group, tier, aliases=(), logo=''):
        name = re.sub(r'\s+', ' ', name or '').strip()
        domain = host(domain)
        if not name or len(name) > 80:
            return
        own = domain if domain and not SHARED_HOSTS.search(domain) else ''
        f = by_name.get(key(name)) or (by_host.get(own) if own and tier > 0 else None)
        if f:  # already listed: keep the first, remember this name as an alias
            if key(name) not in {key(n) for n in [f['name']] + f['aliases']}:
                f['aliases'].append(name)
            for a in aliases:
                if key(a) not in {key(n) for n in [f['name']] + f['aliases']}:
                    f['aliases'].append(a)
            f['domain'] = f['domain'] or own
            f['logo_url'] = f['logo_url'] or logo
            f['tier'] = min(f['tier'], tier)
            return
        f = {'name': name, 'domain': own, 'group': group, 'tier': tier, 'aliases': [a for a in aliases if a and key(a) != key(name)], 'logo_url': logo}
        firms.append(f)
        by_name[key(name)] = f
        for a in f['aliases']:
            by_name.setdefault(key(a), f)
        if own:
            by_host.setdefault(own, f)

    group = ''
    for line in open(SRC, encoding='utf-8'):
        line = line.strip()
        if line.startswith('#'):
            group = line[1:].strip()
        elif line:
            name, domain, aliases = (line.split('|') + ['', ''])[:3]
            add(name, domain, group, 0, [a for a in aliases.split(';') if a])

    cache_file = os.path.join(DATA, 'resolve-cache.json')
    resolved = json.load(open(cache_file)) if os.path.exists(cache_file) else {}
    # Websites the pulled data already gives for a name beat a name lookup
    known = {}
    for source, _ in SOURCES:
        path = os.path.join(DATA, source + '.json')
        for r in json.load(open(path, encoding='utf-8')) if os.path.exists(path) else []:
            if r.get('name') and r.get('site'):
                known.setdefault(key(r['name']), r['site'])
    for f in sorted(glob.glob(os.path.join(ROOT, 'tools', 'names', '*.txt'))):
        group = ''
        for line in open(f, encoding='utf-8'):
            line = line.strip()
            if line.startswith('#'):
                group = group or os.path.basename(f)[:-4].replace('-', ' ').title().replace('Venture Capital', 'Growth Equity & Venture Capital')
            elif line:  # listed even when no website was found, just without a logo
                site = known.get(key(line)) or resolved.get(line) or ''
                add(line, site if site and plausible(line, host(site)) else '', NAME_GROUPS.get(os.path.basename(f)[:-4], group), 1)

    for source, tier in SOURCES:
        path = os.path.join(DATA, source + '.json')
        if not os.path.exists(path):
            continue
        for r in json.load(open(path, encoding='utf-8')):
            site = r.get('site') or ''
            if not site and r.get('name') and resolved.get(r['name']) and plausible(r['name'], resolved[r['name']]):
                site = resolved[r['name']]
            if not r.get('name') or not site or PLACE_HOSTS.search(host(site)):
                continue
            t = 1 if r.get('links', 0) >= 25 else tier
            logo = (r.get('logo') or '').replace('http://', 'https://')
            if logo and 'commons.wikimedia.org' in logo:
                logo += '?width=250'
            add(r['name'], site, r.get('group') or 'Startups', t, r.get('aliases') or (), logo)
    return firms


NAME_GROUPS = {
    'investment-banking': 'Investment Banking', 'private-equity': 'Private Equity', 'hedge-funds': 'Hedge Funds',
    'quant-trading': 'Quant & Trading', 'consulting': 'Consulting', 'venture-capital': 'Growth Equity & Venture Capital',
    'asset-management': 'Asset Management', 'technology': 'Technology',
}


# Website-builder default icons that turned up for many unrelated firms (md5 of a 16x16 RGBA copy)
GENERIC = {'f9a25a46f0a1b63f67b618b893074582', '209a05d027db2548224fccba81565c2f'}
# Domains whose only icon is a platform default (e.g. WordPress)
SKIP = {'highfields.com', 'sylebra.com'}


def fingerprint(im):
    return hashlib.md5(im.convert('RGBA').resize((16, 16)).tobytes()).hexdigest()


def usable(im):
    """False for placeholders: generated gray letter tiles, near-invisible
    (white or transparent) icons, and known site-builder defaults."""
    raw = im.convert('RGBA').resize((32, 32)).tobytes()
    px = [tuple(raw[i:i + 4]) for i in range(0, len(raw), 4)]
    solid = [p for p in px if p[3] > 128]
    inked = [p for p in solid if min(p[:3]) < 225]
    if len(inked) < len(px) * 0.015:
        return False
    corner = px[0]
    gray = all(max(p[:3]) - min(p[:3]) < 10 for p in solid)
    if gray and corner[3] > 128 and 185 <= corner[0] <= 240:
        return False
    return fingerprint(im) not in GENERIC


def get(url):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=10) as r:
                return r.read() if r.status == 200 else None
        except urllib.error.HTTPError as e:
            if e.code != 429:  # rate limited (Wikimedia): back off and retry
                return None
            time.sleep(3 * (attempt + 1))
        except Exception:
            return None
    return None


def image(data, least=32):
    try:
        im = Image.open(io.BytesIO(data))
        if getattr(im, 'n_frames', 1) > 1 or im.format == 'ICO':
            im.size = max(im.info.get('sizes', [im.size]))  # largest ico frame
        im = im.convert('RGBA')
    except Exception:
        return None
    return im if min(im.size) >= least else None


def apple_icon(domain):
    html = get('https://' + domain)
    if not html:
        return None
    m = re.search(rb'<link[^>]+rel=["\']apple-touch-icon[^>]*>', html, re.I)
    href = m and re.search(rb'href=["\']([^"\']+)', m.group(0))
    if not href:
        return get('https://%s/apple-touch-icon.png' % domain)
    href = href.group(1).decode('utf-8', 'ignore')
    if href.startswith('//'):
        href = 'https:' + href
    elif href.startswith('/'):
        href = 'https://' + domain + href
    elif not href.startswith('http'):
        href = 'https://%s/%s' % (domain, href)
    return get(href)


def wiki_logo(names):
    # The "logo image" (P154) on the firm's Wikidata entry, found via its Wikipedia page
    for title in [t for n in names for t in (n, n + ' (company)')]:
        try:
            page = json.loads(get('https://en.wikipedia.org/api/rest_v1/page/summary/' + urllib.request.quote(title.replace(' ', '_'))) or '{}')
            qid = page.get('wikibase_item')
            if not qid:
                continue
            entity = json.loads(get('https://www.wikidata.org/wiki/Special:EntityData/%s.json' % qid) or '{}')
            claims = entity['entities'][qid]['claims'].get('P154', [])
        except (ValueError, KeyError):
            continue
        if claims:
            file = claims[0]['mainsnak']['datavalue']['value']
            return get('https://commons.wikimedia.org/wiki/Special:FilePath/%s?width=250' % urllib.request.quote(file.replace(' ', '_')))
    return None


def fetch(domain, names, logo_url='', prominent=True):
    sources = [
        lambda: logo_url and 'bookface' in logo_url and get(logo_url),
        lambda: get('https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://%s&size=128' % domain),
        lambda: apple_icon(domain),
        lambda: logo_url and get(logo_url),
        lambda: get('https://icons.duckduckgo.com/ip3/%s.ico' % domain),
        lambda: get('https://icon.horse/icon/' + domain),
        lambda: prominent and not logo_url and wiki_logo(names),
    ]
    small = None
    for src in sources:
        data = src()
        im = data and image(data, 0)
        if im and not usable(im):
            continue
        if im and min(im.size) >= 32:
            return im
        if im and min(im.size) >= 16 and not small:
            small = im
    if small:  # only a 16px favicon exists; enlarge it without blurring
        return small.resize((32, 32 * small.size[1] // small.size[0]), Image.NEAREST)
    return None


def slug(domain):
    return re.sub(r'[^a-z0-9]+', '-', domain.lower()).strip('-')


def main():
    retry = '--retry-missing' in sys.argv
    no_fetch = '--no-fetch' in sys.argv
    os.makedirs(LOGOS, exist_ok=True)
    firms = parse()
    misses = set() if retry or not os.path.exists(MISSES) else set(json.load(open(MISSES)))
    info = {}
    for f in firms:
        if f['domain']:
            i = info.setdefault(f['domain'], {'names': [], 'logo_url': '', 'prominent': False})
            i['names'] += [f['name']] + f['aliases']
            i['logo_url'] = i['logo_url'] or f['logo_url']
            i['prominent'] = i['prominent'] or f['tier'] <= 1
    domains = sorted(info)

    def path(domain):
        return os.path.join(LOGOS, slug(domain) + '.webp')

    def work(domain):
        if os.path.exists(path(domain)):
            return domain, True
        if no_fetch or domain in misses or domain in SKIP:
            return domain, False
        i = info[domain]
        im = fetch(domain, i['names'][:4], i['logo_url'], i['prominent'])
        if not im:
            return domain, False
        im.thumbnail((SIZE * 2, SIZE), Image.LANCZOS)  # wordmarks may be wide
        im.save(path(domain), 'WEBP', quality=90, method=6)
        return domain, True

    todo = [d for d in domains if not os.path.exists(path(d)) and (d not in misses)]
    print('%d firms, %d domains, %d logos to fetch' % (len(firms), len(domains), len(todo)), flush=True)
    have = {}
    with ThreadPoolExecutor(32) as pool:
        for n, (d, ok) in enumerate(pool.map(work, domains)):
            have[d] = ok
            if n % 1000 == 999:
                print('  %d/%d' % (n + 1, len(domains)), flush=True)

    # The same icon on 5+ different sites is a hosting platform's default, not a logo
    seen = {}
    for d in domains:
        if have[d]:
            seen.setdefault(fingerprint(Image.open(path(d))), []).append(d)
    for group in seen.values():
        if len(group) >= 5:
            print('  shared icon, dropped %d: %s' % (len(group), ' '.join(group[:8])))
            for d in group:
                have[d] = False
                os.remove(path(d))
    if not no_fetch:  # unfetched domains are not misses
        json.dump(sorted(d for d in domains if not have[d]), open(MISSES, 'w'), indent=0)
    keep = {slug(d) + '.webp' for d in domains if have[d]}
    for f in os.listdir(LOGOS):  # logos of firms no longer listed
        if f not in keep:
            os.remove(os.path.join(LOGOS, f))

    groups = sorted({f['group'] for f in firms})
    rows = []
    for f in firms:
        row = [f['name'], groups.index(f['group']), slug(f['domain']) if have.get(f['domain']) else 0, f['tier']]
        if f['aliases']:
            row.append(f['aliases'][:6])
        rows.append(row)
    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write('// Generated by tools/build_firms.py. Do not edit by hand.\n')
        fh.write('// f: [name, index into g, logo in assets/firms/<logo>.webp or 0, prominence tier 0-4, aliases?]\n')
        fh.write('window.FIRMS = ' + json.dumps({'g': groups, 'f': rows}, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('%d firms, %d domains, %d with logos, %d without' % (len(firms), len(domains), sum(have.values()), len(domains) - sum(have.values())))


if __name__ == '__main__':
    main()
