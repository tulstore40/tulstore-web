# Design Review — Mobile-First UX + Responsive + Config Decoupling (Tulstore Web)

Reviewed document: `.agents/tasks/design.md` (iteration-3 responses present).
Review method: read the design cold, then verified every source-level claim against the actual files in the workspace. This is the fourth review pass; the design is mature and most prior findings are genuinely resolved. The findings below are the ones that remain blocking or worth noting.

Verdict basis: 2 MEDIUM + 0 HIGH + 4 NIT → **CHANGES_REQUESTED** (any HIGH or MEDIUM blocks).

---

## Findings

### 1. MEDIUM — How the boot `<script>` passes server config to the controller is unspecified (Astro frontmatter → client-script boundary)

Where: B2 (`CatalogControllerConfig`), B3 ("the `<script>` that imports and boots `catalog-controller.ts` with `config.pageSize` / `config.defaultSort` / `categoryFilter` / `config.priceFilter`"), and the file manifest ("boot script").

Problem: In Astro, a processed/bundled `<script>` (the kind that can `import` the strict-typed `catalog-controller.ts` module) is compiled in its own module scope and **cannot close over frontmatter variables** such as `config.pageSize`, `config.defaultSort`, the resolved `categoryFilter` prop, or `config.priceFilter`. Those values only exist server-side at render time. The design states the boot script "boots the controller with" these values but never says by what mechanism they cross the server→client boundary. There are two standard options and they have different consequences the coder must not have to re-decide:

- `define:vars={{ pageSize, defaultSort, categoryFilter, priceFilter }}` — injects the values, but makes the `<script>` an **inline** script. Inline scripts in Astro are not bundled/processed the same way and `import ... from '../scripts/catalog-controller.ts'` inside a `define:vars` script does not get the normal module/TS treatment. This conflicts with the design's stated intent that the controller is an imported, strict-typed module.
- Serialize the config onto a DOM attribute (e.g. a JSON blob on `[data-catalog-root]` such as `data-config={JSON.stringify(controllerConfig)}`), then have a small bundled boot `<script>` import the controller and read + parse that attribute. This keeps the typed import but means the parsed values are `unknown`/`string` and must be re-validated (`pageSize` → number, `defaultSort` → `SortKey`, booleans) before constructing `CatalogControllerConfig`.

Because the design elsewhere insists on strict TS and an imported controller module, the attribute-plus-bundled-boot path is the consistent one — but it is not stated, and it introduces a validation step the design does not mention.

Concrete fix: Specify the mechanism explicitly. For example, in B3/B2:
> `CatalogGrid` renders `[data-catalog-root]` with `data-config={JSON.stringify({ pageSize: config.pageSize, defaultSort: config.defaultSort, categoryFilter, priceFilter })}`. The boot `<script>` (bundled, `import { initCatalog } from '../scripts/catalog-controller'`) reads `root.dataset.config`, `JSON.parse`s it inside a `try/catch` (falling back to `{pageSize:32, defaultSort:'relevancia', categoryFilter:true, priceFilter:true}` on parse failure), coerces `pageSize` with `Number()` (NaN/≤0 → 32) and validates `defaultSort` against the four `SortKey`s (invalid → `'relevancia'`), then calls `initCatalog(root, config)`.

This closes the only remaining undefined seam in the Track B wiring.

### 2. MEDIUM — `buscar.astro` no-query / zero-results state vs. CatalogGrid's always-on chrome is unspecified

Where: B3 ("`CatalogGrid` is used ONLY by the three catalog views … it always renders its full interactive chrome"), G3, and the manifest edit for `buscar.astro` (`<CatalogGrid products={results} categories={categories} config={config.catalog} />`).

Problem: `buscar.astro` today renders the product grid **only** when `q && results.length > 0`; with no query it shows just a prompt ("Escribe en el buscador…") and with a query but zero matches it shows a plain `.empty-state`. The design replaces that inline grid with `<CatalogGrid products={results} …>` which, per B3, *always* renders its full chrome: the sticky action bar (with its own search input), the category chips row, the filter bottom-sheet, the "Ver más" button, and the empty state. The design does not say what happens on `buscar.astro` when `q` is empty (so `results` is `[]` by the server filter). Taken literally, an empty search would now render a sticky search bar + full category-chips row + empty-state on a page that previously showed only a prompt — a behavior change the brief did not ask for, and a confusing double-search-input situation (header search + sticky search) on a page with no results.

This also interacts with Finding-adjacent reality: with `results=[]` the controller builds an empty `CatalogItem[]` and immediately shows `[data-catalog-empty]`, while the chips row lists all categories whose clicks filter an empty set (no-ops). Not broken, but unspecified and probably not the intended UX.

Concrete fix: State the rule for `buscar.astro`. Recommended: keep today's conditional — only mount `<CatalogGrid>` when `q && results.length > 0`; for empty `q` keep the current prompt, and for `q` with zero results keep the current plain `.empty-state` (do not render the sticky bar/chips/sheet). Alternatively, if CatalogGrid must always mount, specify that on `buscar.astro` the category-chips row and bottom-sheet category select are suppressed and the sticky bar is hidden when `results.length === 0`. Pick one and write it into B3/G3 and the `buscar.astro` manifest line.

### 3. NIT — `.name` line-clamp override lives in a scoped `<style>`; confirm the base rule is edited, not merely re-declared

Where: A2 — the snippet starts with `.name{-webkit-line-clamp:2;min-height:2.6em}` then `@media(min-width:560px){.name{-webkit-line-clamp:3;min-height:auto}}`.

Problem: `ProductCard.astro`'s existing scoped `.name` already is `…-webkit-line-clamp:2;min-height:2.6em`. The snippet re-states the mobile base (harmless) but the net intent is "2 lines on phones, 3 on ≥560px". Within a single scoped `<style>`, a later `@media(min-width:560px)` rule of equal specificity does override, so this works — but the design shows it as an addition rather than instructing the coder to keep the existing base `.name` and simply add the `min-width:560px` override. Worth one sentence so the coder does not create a duplicate `.name` declaration.

Concrete fix: Reword A2 to: "Keep the existing `.name` base (`-webkit-line-clamp:2; min-height:2.6em`); add only `@media(min-width:560px){.name{-webkit-line-clamp:3;min-height:auto}}`."

### 4. NIT — `INACTIVO` products are silently included (pre-existing behavior, not stated)

Where: Track H preservation checklist; A2 edge-cases paragraph (mentions `AGOTADO`/`REVISAR` but not `INACTIVO`).

Problem: `catalog.ts` returns every row including `estado: 'INACTIVO'`, and all current pages render them (verified: no `estado` filter exists anywhere in `src/`). The design preserves this (correct — the brief says do not change the product query), but the A2 edge-case note names only `AGOTADO`/`REVISAR`. Since the design explicitly discusses status handling, omitting `INACTIVO` could read as a decision to treat it specially.

Concrete fix: Add "`INACTIVO` products are rendered exactly as today (no status-based hiding is introduced; the product query is unchanged)" to the A2 edge-case note so the coder does not infer a hide rule.

### 5. NIT — Debounced search `apply()` resets the "Ver más" cursor; confirm that is intended on `buscar.astro` narrowing

Where: B2 (`apply()` "reset the visible cursor to `pageSize`"), Track C path 2/3.

Problem: Every `apply()` resets the cursor to `pageSize`. On `productos.astro` this is clearly right (new filter = fresh first page). On `buscar.astro` the sticky input narrows an already-small server `results` set; resetting the cursor there is fine but the design never says the counter/"Ver más" reflect the *narrowed* count. It almost certainly does (same code path), but one line confirming "on every keystroke the counter and Ver-más remaining reflect the current filtered length" removes any doubt about stale counts.

Concrete fix: Add to B2: "`apply()` always recomputes `[data-catalog-count]` and the `[data-see-more]` remaining badge from the freshly filtered length."

### 6. NIT — `content-visibility:auto` intrinsic height (320px) vs. the actually-measured compact card height is an untested assumption

Where: B0 (`.grid-item{content-visibility:auto;contain-intrinsic-size:0 320px}`).

Problem: `320px` is asserted as "the expected compact card height". The A2 compact card (square image at 2-col ≈165px wide + ~9px padding body + 2-line name + price + 40px controls) is plausibly shorter than 320px on a 360px phone. A too-tall intrinsic size over-reserves scroll space; too-short causes the scroll-jump the design is trying to avoid. This is a tuning value, not an architecture problem, but it is presented as settled.

Concrete fix: Mark `contain-intrinsic-size` as a value to validate in manual QA at 360/390/414px and adjust to the measured compact-card height; or compute it from the known layout rather than asserting 320px.

---

## Verified Assumptions (checked against source)

- **Stack / strict TS / build:** `astro.config.mjs` has `output:'server'` + `adapter: netlify()`; `tsconfig.json` extends `astro/tsconfigs/strict` and defines the `@/*` → `src/*` alias; `package.json` `build` = `astro check && astro build`; deps are astro 7, `@astrojs/netlify` 8, `@astrojs/check`, typescript. All as the design states. ✓
- **12 cart `data-*` hooks:** verified across `BaseLayout.astro` (`data-add-cart` via ProductCard, `data-cart-open/close/overlay/drawer/count/items/total/checkout/plus/minus/remove`), `CartDrawer.astro`, `Header.astro`. Exactly 12 distinct attributes, matching the Overview/Track H list. ✓
- **`CartItem` interface** `{id:string|number;name;ref;price;image;qty}` present in the BaseLayout cart `<script>`. ✓
- **`data-product` JSON shape** `{id,slug,name,price,image,ref}` emitted by `ProductCard.astro`. ✓
- **`buscar.astro` server filter is accent-SENSITIVE:** `q.toLocaleLowerCase('es')` + `.filter(p => \`${p.nombre} ${p.referencia} ${p.color} ${p.categoria}\`.toLocaleLowerCase('es').includes(normalized))`. Matches the design's quoted code verbatim; the iteration-3 revert to leave this unchanged is correct and preserves search behavior. The client `data-haystack` field order (`nombre referencia color categoria`) matches. ✓
- **`global.css` grid rules:** base `.product-grid{repeat(4,minmax(0,1fr));gap:18px}`; `@media(max-width:900)` → 3 cols; `@media(max-width:680)` is a **combined** rule touching `.container`, `.section`, `.section-head{align-items:start}`, `.product-grid{repeat(2,…);gap:10px}`, `.section-head .text-link`; `@media(max-width:360)` → `1fr`. Exactly as A1's surgical note describes, including the single-column culprit. ✓
- **`html,body{overflow-x:hidden;max-width:100%}`** present as the overflow guard. ✓
- **z-indices:** `.wa-float` 60, cart `.overlay` 70, `.cart` drawer 80, `.site-header` 40. The new-layer map (bar 50 / filter overlay 64 / sheet 66) slots between these without collision. ✓
- **`ProductCard` card:** `.image-wrap{aspect-ratio:1/1}` + `img{object-fit:contain}`, `width/height="480"`, `loading="lazy"`; `.flag` style exists but is unused (no badge logic). Existing mobile block is `@media(max-width:680px)` with `.add{min-height:44px}`, `.wa{width:44px}`. Matches A2's premises. ✓
- **`Header.astro`:** logo-only `<img src="/images/tulstore-logo.png">` (no "Tulstore" text), `<form action="/buscar" method="get">` with `name="q"`, `[data-cart-open]`, `[data-nav-toggle]` toggling `#category-nav.open` with `aria-expanded` sync, `.category-scroll` touch-scroll chips. Mobile `@media(max-width:680px)` sets `.topbar{height:auto}` and `.search{grid-column:1/-1;grid-row:2}` and `.category-nav{display:none}` until `.open` — confirming the "no fixed header height" basis for Finding-1-of-iteration-3's dynamic `syncStickyTop()`. ✓
- **`index.astro` today:** `featured = products.slice(0,8)`; `latest = [...products].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''))` then rendered `.slice(0,4)`. The design's `destacados={kind:'first-n',count:8}` and `novedades={kind:'latest',count:4}` with the `(b.createdAt||'').localeCompare(a.createdAt||'')` tie rule reproduces this. ✓ (Minor: today the `latest` intermediate is `.slice(0,8)` then `.slice(0,4)` at render; net rendered output is the same top-4, so no regression.)
- **`productos.astro`** currently renders inline `.chips` (links to `/categoria/[slug]`) + inline `.product-grid`; **`categoria/[slug].astro`** renders inline `.product-grid` only (no chips), redirects unknown slug to `/productos`. Matches the design's per-page replacement plan. ✓
- **`format.ts`:** `formatCOP` and `normalizeText` (accent-insensitive) both exist; the design's choice to reuse `formatCOP` and NOT use `normalizeText` for the catalog haystack is consistent with the preserve-search decision. ✓
- **`catalog.ts`:** `precio: Number(row.precio_venta)`, 60s cache, `storageUrl`, `throw` on bad env / non-ok response, `getCategories` returns `{name,slug,count}` sorted by name. All as the design relies on. ✓

## Unverified / Wrong Assumptions

- **Boot-script config passing (Finding 1):** the design assumes the boot `<script>` can "boot the controller with `config.*`" without stating the frontmatter→client mechanism. This cannot work as implied for a bundled, importing module; the crossing requires `define:vars` or a serialized `data-*` attribute + re-validation. **Mechanism unverified / underspecified** — the controller's typed `CatalogControllerConfig` cannot be populated directly from frontmatter.
- **`buscar.astro` empty/zero-results rendering (Finding 2):** the design assumes always-mounting `<CatalogGrid>` on `buscar.astro` is fine, but did not reconcile it with the page's current conditional rendering (grid only when `q && results.length>0`). **Behavior on empty query / zero results is unverified** and likely a regression as written.
- **`content-visibility` intrinsic height 320px (Finding 6):** asserted as the compact-card height but not derived or measured against the A2 layout at phone widths. **Numeric value unverified.**
- **Runtime header behavior:** the design's own Assumptions section already concedes header nav/search/cart/mobile-menu were verified by **static inspection only**, with runtime behavior deferred to manual QA. Consistent with what I could verify (markup/CSS/JS wiring is present and internally consistent); actual runtime behavior across devices was not exercised in this review either. Accurately scoped by the design — not a finding.

---

## Verdict

2 MEDIUM + 4 NIT (0 HIGH). Per the gating rule (any HIGH or MEDIUM → CHANGES_REQUESTED):

**CHANGES_REQUESTED** — resolve Findings 1 and 2 (both concrete, both source-grounded). The NITs are optional polish but cheap to fold in. The seven step-prompt focus areas (config seam, grid breakpoints, compact card, sticky bar + dynamic top, filter sheet + z-indices, progressive loading, preservation of catalog/cart/social/footer) are all specified and verified; the two MEDIUMs are the remaining wiring/UX gaps the coder would otherwise have to re-decide.
