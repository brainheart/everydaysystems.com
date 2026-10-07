# everydaysystems.com

Static export of the core everydaysystems.com pages for GitHub Pages.

Shared look and feel lives in `css/site.css` (fonts, textures, layout), with
self-hosted Libre Caslon Text and Libre Franklin in `assets/fonts/` and the
paper textures in `assets/images/`, matching podcast.everydaysystems.com.
Every page links `/css/site.css?v=N`; bump `N` on every page when the
stylesheet changes so GitHub Pages' CDN serves the new version.

## Systems explorer

The table shows system, family, a first-mentioned date linking to its source,
total References (sortable), and a shared timeline. The family-colored band
spans the first through latest dated reference, with gray outside that interval.
Single-date activity uses a narrow marker; systems without dated sources have
no colored interval. CSV uses the same five columns, retaining the date and
source URL together in First Mentioned. Bump the stylesheet and script `?v=`
in the template when changing either asset, then rebuild.

`/systems/` is one row per system, using the podcast's stable IDs, names,
families, colors, and episode relationships. The browser refreshes both
`https://podcast.everydaysystems.com/metadata/{systems,episodes}.json` together
on every visit (an 8-second timeout retains the complete saved snapshot).
New episodes, corrected tags, and new catalog systems therefore flow through
without editing this site. The podcast host must continue to allow cross-origin
JSON reads; its current `Access-Control-Allow-Origin: *` header does so.

The saved HTML remains readable without JavaScript or network access. Refresh
its fallback snapshot after podcast updates when convenient:

```sh
python3 scripts/build_systems.py
# Or point at another checkout:
python3 scripts/build_systems.py --podcast-root /path/to/podcast.everydaysystems.com
```

Edit `scripts/systems_template.html`, `systems/app.js`, and `systems/style.css`;
do not hand-edit the generated `systems/index.html`. Fonts (including their OFL
license) and textures are copied from the podcast for a self-contained fallback.

`metadata/system-pages.json` adds curated, dated web references and undated
system homepages. Add an ISO publication date, title, URL, stable system IDs,
and an evidence note for each verified source, then rebuild. Do not infer a
publication date from copyright years or the date someone began a habit.
The initial six sources are verified local archive posts, not an exhaustive
web history. First mention always means earliest indexed dated evidence.
All timelines start in the earliest indexed year and end at the visitor's
current date, regardless of filters. Future-dated sources stay in the reference
list but receive no misleading mark at today's endpoint.

Checks:

```sh
node --test tests/systems.test.cjs
python3 scripts/build_systems.py
```

For browser checks, serve the repository with `python3 -m http.server 8765`
and run `node tests/systems.browser.cjs` with Playwright on Node's module path
(for the globally installed copy here, prefix with
`NODE_PATH=/opt/homebrew/lib/node_modules`). The suite exercises offline and
live metadata, deep links, CSV, timeline links, keyboard access, and mobile.
