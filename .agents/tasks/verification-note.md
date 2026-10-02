# Verification note — Mobile-first UX + Catalog + Responsive + Config decoupling (Tulstore Web)

Iteration: FIRST for THIS task (no `.agents/tasks/ux-review.json` present). The pre-existing `ui-review.json`/older section of this note belonged to the previous visual/footer/logo overhaul (message 2); this note is now the record for the catalog/responsive/config overhaul (message 3) and the earlier content was replaced.

## Build / type check

Command: `npm run build` (runs `astro check && astro build`) from the workspace root on Windows PowerShell.

Result:
- `astro check` (22 files): **0 errors, 0 warnings, 0 hints**
- `astro build`: Server built successfully, `Complete!`, exit code 0.

strict TypeScript is still ON (`tsconfig.json` extends `astro/tsconfigs/strict`, unchanged); no `@ts-nocheck` added anywhere.

## Reasoned requirement audit (per the step checklist)

1. **Mobile grid = 2–3 per row at 360/390/414px; no 1-col rule; no horizontal scroll.**
   `global.css` now has a mobile-first base `.product-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}` and a `min-width` ladder (560→3, 900→4, 1100→4 w/ larger gap, 1280→5). The old `@media(max-width:360px){.product-grid{grid-template-columns:1fr}}` single-column rule was REMOVED, and the `.product-grid` fragment was removed from the former `max-width:900` and `max-width:680` rules (the other selectors in the 680 block — `.container`, `.section`, `.section-head`, `.section-head .text-link` — were preserved). At 320–559px every phone shows exactly 2 columns. `minmax(0,1fr)` on every track + `html,body{overflow-x:hidden;max-width:100%}` (unchanged) + `.container{width:min(1180px,calc(100% - 32px))}` prevent horizontal overflow at 360/390/414px; the sticky bar is a flex row with `flex:1 1 auto;min-width:0` search and `flex:none` buttons, and chips scroll inside their own `overflow-x:auto` container, so neither forces page width.

2. **Compact cards (name 2–3 line clamp, price prominent, controls shrunk, not too tall).**
   `ProductCard.astro` `<style>` only (markup byte-for-byte unchanged). `.name` clamps to 2 lines base, 3 at `min-width:560px` (single rule + one added media rule, no duplication). New `@media(max-width:559px)` block: tighter `.body` padding, `.ref{display:none}` on small phones, smaller name/category, prominent `.price` (`.98rem`, bottom margin), `.image-wrap img{padding:8px}`, controls `.add{min-height:40px}` / `.wa{40px}` — a deliberate 40px (vs 44px) trade-off below 560px to keep cards short; ≥560px controls return to the base 44px. `aspect-ratio:1/1` + `object-fit:contain` kept (square, no distortion); `width/height=480` + `loading="lazy"` kept.

3. **Desktop 3–5 cols by width.** Ladder: 560px→3, 900px→4, 1280px→5. Matches "3–5 columnas en escritorio según ancho".

4. **Sticky mobile bar has search + Filtros + cart; cart opens (data-cart-open reused).**
   `CatalogGrid.astro` renders `.sticky-bar` (`display:none` desktop; `display:block;position:sticky;z-index:50` at `max-width:899px`) containing `[data-catalog-search]`, a `[data-filter-open]` Filtros button with `[data-filter-count]` badge, and a cart button reusing `data-cart-open` with a `data-cart-count` badge. The existing document-level cart delegation in `BaseLayout.astro` catches `data-cart-open` and opens the drawer; no cart code changed. The controller sets the bar's `top` dynamically from `.site-header` `getBoundingClientRect().height` on init, `resize`, and each `[data-nav-toggle]` click (no hardcoded header px).

5. **Filter sheet filters by category + min/max price and sorts by 4 options, resetting pagination.**
   Bottom-sheet (`[data-filter-sheet]`, `role=dialog aria-modal`, overlay z-64, sheet z-66) with category `<select>` (`[data-filter-cat]`, omitted when `categoryFilter=false`), `[data-filter-min]`/`[data-filter-max]` number inputs (rendered only when `priceFilter`), and `[data-filter-sort]` with the 4 `SortKey` options. `Aplicar`/`Limpiar` buttons. Controller `apply()` filters (category exact; price `[min,max]` inclusive, NaN card price always passes, min>max swapped), sorts via `sortItems`, and **resets `cursor` to `pageSize`** on every change. Accessibility: focus moves into sheet on open, focus trap on Tab/Shift+Tab, Escape + overlay-click + close button all dismiss and restore focus, `aria-expanded`/`aria-hidden` synced, `body` scroll locked while open.

6. **"Ver más" reveals 32-item batches, interoperates with filters/search/sort, count+remaining recomputed.**
   `render()` reveals the first `cursor` items of the current filtered+sorted set and hides the rest via `hidden`; `[data-see-more]` increments `cursor` by `pageSize` (32) and shows "Ver más (N)" with the live remaining count, hiding itself at the end. Every keystroke/filter/sort runs `apply()` which recomputes the filtered subset, resets `cursor=pageSize`, updates `[data-catalog-count]` to the fresh filtered length, and recomputes the remaining badge. Sorting uses `el.style.order` so DOM nodes are not physically moved.

7. **Home renders from siteConfig.ts HomeSection[] in discovery order with the getSiteConfig() Admin seam.**
   `index.astro` does `const config = await getSiteConfig();` then `config.home.sections.map(...)` with an exhaustive `switch` on `section.type` into `HeroSection`/`CategorySection`/`ProductStripSection`/`CtaSection`. Default order: hero → categories → product-strip (destacados, `first-n` 8) → product-strip (novedades, `latest` 4) → cta. `resolveFeatured` reproduces today's selection: `first-n` = `slice(0,8)`; `latest` = `[...products].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,count)` (empty createdAt sorts last). Home strips use bare `<ProductCard>` in a plain `.product-grid` (no CatalogGrid, no controller, no hidden items). `getSiteConfig()` is the single async Admin seam, documented as the only integration point.

8. **Config passed to the controller via data-config JSON + validated boot (DECISION 1).**
   `CatalogGrid` renders `[data-catalog-root]` with `data-config={JSON.stringify({pageSize, defaultSort, categoryFilter, priceFilter})}`. The boot `<script>` is a normal bundled Astro script that `import { initCatalog, isSortKey }` from `../scripts/catalog-controller` (typed import kept; no define:vars). It reads `root.dataset.config`, `JSON.parse`s inside try/catch (fallback `{}`→DEFAULTS), narrows the parsed `unknown` field-by-field (object check, `Number()` coercion for pageSize with NaN/<=0→32, `isSortKey` validation→'relevancia', boolean coercion→true), then calls `initCatalog(root, validatedConfig)`. Strict-TS clean (parsed JSON typed as `unknown`, narrowed not cast).

9. **buscar.astro behaves per DECISION 2.**
   Server filter is byte-for-byte unchanged (accent-sensitive `q.toLocaleLowerCase('es')` + `.toLocaleLowerCase('es').includes`). `<CatalogGrid>` mounts ONLY when `q && results.length > 0`. Empty `q` keeps the "Escribe en el buscador…" prompt and renders no catalog chrome. Non-empty `q` with 0 results keeps the plain `.empty-state` and no chrome. `categories` is only fetched when results exist.

10. **catalog.ts/Supabase untouched; 12 cart hooks + data-product shape intact; footer/socials/wa-float/product+category pages preserved; strict TS clean.**
    `src/lib/catalog.ts` and `src/lib/format.ts` not modified. `ProductCard.astro` markup (including `data-add-cart` and the `data-product` JSON `{id,slug,name,price,image,ref}`) unchanged — only `<style>` edited. `BaseLayout.astro` cart `<script>`, `CartItem` interface, and all 12 cart hooks (`data-add-cart`, `data-cart-open/close/overlay/drawer/count/items/total/checkout/plus/minus/remove`) unchanged; new hooks use the disjoint `data-catalog-*`/`data-see-more`/`data-filter-*` namespaces. Footer Instagram/TikTok/WhatsApp inline SVGs + verbatim URLs and `.wa-float` unchanged. Product page `/producto/[slug]` untouched; category page keeps the unknown-slug→`/productos` 302 redirect. Search haystack mirrors the server with the SAME accent-sensitive `.toLocaleLowerCase('es')` (NOT `normalizeText`). `astro check` 0 errors/0 warnings confirms strict TS.

## No-JS / progressive-enhancement fallback

Boot's first statements add `js-ready` to both `[data-catalog-root]` and `.product-grid`. CSS: `.product-grid:not(.js-ready) .grid-item{display:block!important}` shows all products pre-boot/no-JS; `.catalog-root:not(.js-ready) [data-see-more], .catalog-root:not(.js-ready) .sticky-bar{display:none}` hides the JS-only chrome. `.grid-item{content-visibility:auto;contain-intrinsic-size:0 300px}` (tuning value) skips off-screen paint without scroll collapse.

## Visual verification

No browser/preview was exercised in this environment; verification is by reasoning through the rendered markup, CSS breakpoints, and controller state as detailed above. Column counts, overflow guards, sticky-bar/sheet z-index ordering (header 40 < sticky 50 < wa-float 60 < filter overlay 64 < sheet 66 < cart overlay 70 < cart drawer 80), and the no-JS fallback were traced in source.

## Files changed

**New**
- `src/lib/siteConfig.ts` — config types, `SortKey`, `defaultSiteConfig`, `getSiteConfig()` (Admin seam), `resolveFeatured()`.
- `src/scripts/catalog-controller.ts` — strict-typed vanilla controller + exported pure helpers (`matchesFilters`, `sortItems`, `isSortKey`).
- `src/components/CatalogGrid.astro` — sticky bar + chips + bottom-sheet + `.product-grid` of `.grid-item`(ProductCard) + "Ver más" + empty state + validated boot script.
- `src/components/home/HeroSection.astro`, `CategorySection.astro`, `ProductStripSection.astro`, `CtaSection.astro`.

**Edited**
- `src/styles/global.css` — product-grid breakpoint ladder (removed 1-col rule); shared `.grid-item`/`js-ready` fallback classes.
- `src/components/ProductCard.astro` — `<style>` only (compact mobile card, 2/3-line name clamp).
- `src/pages/index.astro` — render from `config.home.sections` via home partials.
- `src/pages/productos.astro` — inline chips+grid replaced with `<CatalogGrid>` (full filters).
- `src/pages/categoria/[slug].astro` — `<CatalogGrid categoryFilter={false}>`; unknown-slug redirect kept.
- `src/pages/buscar.astro` — server filter unchanged; `<CatalogGrid>` only when `q && results.length>0`.

**Never touched:** `src/lib/catalog.ts`, `src/lib/format.ts`, `src/components/CartDrawer.astro`, the cart `<script>`/footer/`.wa-float` in `BaseLayout.astro`, `Header.astro`.
