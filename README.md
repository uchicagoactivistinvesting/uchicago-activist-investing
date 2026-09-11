# University of Chicago Activist Investing Club

Website for the club. Plain HTML, CSS, and one small JavaScript file. No build step.

The layout, typography, and motion follow the Quad Capital reference site page for page,
re-themed in white and maroon and re-written for the Activist Investing Club.

## Structure

```
site/                 what gets deployed
  index.html          Home: hero, statement, the four programme pillars, the activist
                      investing primer, FAQ
  team.html           People: Founding Board cards (hidden)
  placements.html     Firm logos where members have placed
  events.html         Featured speaker events and info sessions (hidden)
  apply.html          Application cycle and the interest form
  styles.css          All styling (EB Garamond throughout, white paper, maroon sections)
  main.js             Scroll reveal, hero and banner parallax, page cross-fade, mobile menu,
                      active nav link, FAQ slide
  assets/             Logos, photographs, favicon, self-hosted EB Garamond (assets/fonts)
  robots.txt, sitemap.xml, site.webmanifest
logos/                original logo files
icons/                original icon files
```

`site/` is the deploy root. Everything above it is source material and is not served.
The five pages are Home, People, Placements, Events, and Apply. **People and Events are
currently hidden**, so Home, Placements and Apply are what visitors can reach.

## Hidden pages

People (`team.html`) and Events are **hidden, not deleted**. Both files are untouched and
still deploy, so the URLs still work if you type them — they are just unlinked, kept out
of the sitemap, and marked `noindex` so search engines drop them.

To bring either page back:

1. **Nav links** — every page's `<nav>` carries the link inside a comment block marked
   `<!-- HIDDEN PAGE: ... -->`. Delete the `<!--` and `-->` markers around the link you
   want back, in **all five** HTML files.
2. **Sitemap** — uncomment the matching `<!-- HIDDEN: <url>...</url> -->` line in
   `site/sitemap.xml`.
3. **Search** — delete the `<meta name="robots" content="noindex, nofollow">` line near
   the top of `site/team.html` / `site/events.html`, and the `HIDDEN PAGE` comment above
   it.

To hide a different page later, do the same three edits in reverse. Tag each one with a
`HIDDEN` comment so the whole set stays greppable:

```
grep -rn "HIDDEN" site/
```

## Hidden sections

Whole sections inside a page follow the same idea, tagged `HIDDEN SECTION`: wrap the
`<section>` in an HTML comment and leave a `HIDDEN SECTION` note above it saying how to
bring it back. Nothing else needs changing — each section is self-contained, and its
styles stay in `styles.css` either way. The same trick works on a single item: the FAQ's
"Do I need finance or activist investing experience to join?" question is parked in a
comment inside the otherwise-visible home-page FAQ.

One gotcha when hiding a section this way — items often carry `style="--d:.06s"`
animation delays, and a `--` inside an HTML comment is technically invalid. Browsers all
close the comment at the `-->` regardless, so it renders correctly, but a strict HTML
validator or minifier may flag it.

## Running locally

```
python3 -m http.server 4173 --directory site
```

Then open http://localhost:4173. Hard-reload with Cmd+Shift+R after editing CSS.

Each page links `styles.css` and `main.js` with a `?v=` query so browsers pick up
changes. After editing either file, bump that number in **all** the HTML files at once
(the numbers below are the current ones — read them out of any page's `<head>` first):

```
sed -i "s/styles.css?v=63/styles.css?v=64/g; s/main.js?v=17/main.js?v=18/g" site/*.html
```

## Photographs and placeholders

| File                                | Where it appears                                    |
|-------------------------------------|-----------------------------------------------------|
| `assets/hero.jpg` (+ 1200/1800/2400/3200 widths) | Home hero, and the banner on every inner page |
| `assets/headshot-tanish.jpg`, `headshot-rahul.jpg` | People cards                      |
| `assets/headshot-placeholder.jpg`   | People, the four cards without a real photo yet     |
| `assets/speaker-peter-may.jpg`      | Events, featured speaker                            |
| `assets/logos/*.png`                | Placements, firm logos                              |
| `assets/og.jpg`                     | The social preview image (`og:image`) on every page |

Replace a file in place and nothing else needs to change.

Several files in `assets/` are no longer referenced by any page: `about-campus.jpg`,
`university.jpg`, `why-campus.jpg`, `headshot-square.jpg`, `partners-wide.jpg`,
`resource-1..6.jpg`, `logo-full.png`, `logo-full-white.png`, `logo-symbol*.png` and
`icon-32.png`. They are kept on purpose — several are obvious candidates for a future
About page — but nothing breaks if you delete them.

## Editing content

- **Programme pillars**: the four cards on the home page are the `.track` items in `index.html`.
- **Activist investing primer**: the left-aligned paragraph below the pillars is the
  `.primer` section in `index.html`.
- **FAQ**: each question is a `.faq__item` in `index.html`. They open one at a time.
- **People**: each card in `team.html` has a photo, a name, and a role. Duplicate a card to add a member.
- **Placements**: generated — drop a logo in `assets/logos/` and run the script below.
  Do not hand-edit the `.pl-grid` list; the next run overwrites it.
- **Interest form**: the Google Form URL appears in the header of every page and on Apply.

## Placements logo wall

The logo wall is generated from the contents of `site/assets/logos/`:

```
python tools/build-placements.py
```

Add a logo to that folder, run it, and the firm appears on the page. `--check`
reports what would change without writing. The `.pl-grid` list in
`placements.html` is generated — editing it by hand is pointless, the next run
overwrites it.

**Sizing.** Logos are sized by how big they *look*, which is not how big they
are. Two corrections do the work:

1. *Ink, not bounding box.* A lockup with thin strokes and small type (Perella
   Weinberg, Black Opal) carries a fraction of the ink of a dense one (RBC,
   Second Summit) — 7x less, measured. Equal heights make the sparse ones look
   tiny, so the script counts each logo's ink and corrects toward equal optical
   mass. `OPTICAL_K` controls how hard: 0 is equal heights, 1 is equal ink area,
   0.5 is the tuned middle.
2. *Artwork, not canvas.* Several files ship with transparent padding baked in —
   `pwp.png` is 45% empty vertically, and that alone was enough to make it look
   undersized. The script measures the ink bounding box and scales the canvas up
   so the artwork lands at the intended size regardless of its margins.

The result is a per-logo `--s` multiplier written into the markup; the CSS
renders each logo at `--s x --pl-h`. Very long wordmarks (SACHEMHEAD is 11:1) get
extra width before clamping, or their letters end up too small to read.

3. *`NUDGE`, for what measurement cannot see.* A stacked two-line lockup (RBC,
   Second Summit) sets its type at about half the box height, so it needs a
   taller box than a single-line wordmark before the words read at the same size
   — and no pixel count reveals that. `NUDGE` multiplies a logo's final size:
   raise a value to grow it, lower it to shrink it, omit it to leave the logo to
   the algorithm. This is the dial to reach for when something just looks wrong.

**When you add a logo**, the script tells you what it needs:

- *No display name* — add the filename stem to `NAMES`, or it falls back to a
  title-cased filename.
- *Baked-in background* — the file has an opaque canvas and will render as a
  rectangle against the page tint. Save it with a transparent background.
- *Transparent padding* — sizing already compensates, but the empty margins still
  take up room in the row. Crop the file to its artwork for a tighter layout.
- Put the stem in `ORDER` to place it; anything unlisted is appended
  alphabetically. `SKIP` drops a file from the page while keeping it on disk,
  for when two files are the same firm.

Transparency matters more than format. SVG is best, then PNG with an alpha
channel; a JPEG always carries a background. When several files share a stem
(`coatue.jpg` and `coatue.png`), the best format wins and the rest are ignored.

## Fonts

EB Garamond is self-hosted from `assets/fonts` (one variable woff2 file each for upright
and italic, weights 400 to 800) and declared inline in each page's head with
`font-display: swap`, so text never waits on a third-party stylesheet.

## Layout scaling

Two sizing systems live in `styles.css`, and **new work should use the second one**:

1. `--u`, inherited from the reference site, equals `100vw / 1728 * 0.80` and scales a
   dimension with the browser width, with no floor or ceiling. The 0.80 factor renders
   text and elements 20% smaller than the reference at the same window width. Below
   760px the unit is pinned to 1px and the mobile rules take over. Only the People page
   (`.team`, `.card`, `.display--56`) still uses it.
2. `px` and `clamp()`, which every other page uses: a floor, a viewport-relative middle,
   and a ceiling, so type stays readable on a small laptop and stops growing on a large
   display.

Mixing them inside one page is what made the home-page FAQ render several points smaller
than the sections around it, so keep a page on one system. Vertical section spacing was
tightened below the reference values to reduce white space, and no text is italic.

Section headings (`.h2`, `.statement__title`, `.primer__title`, `.home-faq__title`,
`.events-section__title`, `.notice__title`, `.display--56`) all run at weight 500.

## Animations

`main.js` adds the `in` class as elements scroll into view, which starts one of two
entrances, each 0.9s on an ease-out curve: `.a-reveal` wipes text up from its bottom
edge, and `.a-fade` fades in. Stagger a group by giving each item a `--d` delay inline. Every section on every page carries one
of these, the footer included.

**Performance.** All scroll-driven work — the reveals, the sticky hero, the overlay
header, and the inner-page banners — runs from a *single* rAF-throttled loop in
`main.js` that reads `scrollY` once per frame. Nothing measures layout during a scroll:
each effect caches what it needs in a `measure` job that re-runs on load, on resize, and
when the tab regains focus. The reveal fallback walks a shrinking list of not-yet-shown
elements, so no element is touched twice. The hero and banner images are moved with
`translate3d` and never scaled mid-scroll, so their blurred, colour-graded bitmaps
rasterise once and each later frame is a pure compositor move. Adding a scroll effect
means pushing onto `frameJobs` and `measureJobs`, never adding a scroll listener.

**Safety nets.** Elements already on screen at load reveal immediately; a `done` class
lands 1.8s after each entrance and drops the clip and animation so nothing can stay
hidden if animations stall; and hover transforms are written with an `html.js` prefix so
they outrank that `done` reset. All motion is disabled under `prefers-reduced-motion`.

## Footer

Every page shares the same footer: the club name on the left, and on the right the
Instagram and LinkedIn icons with the club email underneath. The links live in the
`<footer>` block of each HTML file; change the two `href` values and the mailto address
in all pages together.

## Search appearance

For Google to show the site name and logo next to results, each page carries:
a favicon set in 48px multiples (`assets/icon-48/96/192.png`, `favicon.ico`,
`site.webmanifest`), `og:site_name`, and JSON-LD `WebSite` and `Organization` data
naming the club and pointing at `assets/logo-square.png`. Google reads these from the
live domain, so they take effect after deployment and the next crawl (typically days
to a few weeks). Submitting the sitemap in Google Search Console speeds this up.

## Site addresses

- Public site: https://www.uchicagoactivistinvesting.com
- LinkedIn: https://www.linkedin.com/company/uchicago-activist-investing/
- Instagram: https://www.instagram.com/uchicagoactivistinvesting/
- Email: uchicagoactivistinvesting@gmail.com

Each public page carries a canonical URL and Open Graph tags built on the domain above.
Deploying to GitHub Pages with the custom domain also needs a `CNAME` file in `site/`
containing `www.uchicagoactivistinvesting.com`.
