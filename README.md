# University of Chicago Activist Investing Club

Landing page for the club. Plain HTML and CSS, no build step.

## Structure

```
site/                 what gets deployed
  index.html
  styles.css
  assets/             logos and icons, trimmed for the web
logos/                original logo files
icons/                original icon files
```

`site/` is the deploy root. Everything above it is source material and is not served.

## Running locally

```
python -m http.server 4173 --directory site
```

Then open http://localhost:4173. Hard-reload with Ctrl+Shift+R after editing CSS,
since the browser caches the stylesheet aggressively.

## Note on the current page

Only the hero section renders. The rest of the page (Activist Investing, What We Do,
Get involved, and the footer) is written and sits commented out in `index.html`, along
with the hero scroll cue. Restore instructions are in the comment itself and in the two
annotated rules in `styles.css`.
