# Mobile-first catalog + responsive + config-decoupling — behavioral review

The change rebuilds Tulstore's catalog views around a single reusable `CatalogGrid.astro` driven by a strict-typed vanilla controller (`catalog-controller.ts`), adds a mobile-first 2→5 column grid ladder, a sticky mobile action bar, touch-scroll category chips, a filter bottom-sheet, and client-side progressive loading. It also decouples the home into a typed config module (`siteConfig.ts`) consumed via one async `getSiteConfig()` seam and rendered by mapping over `HomeSection[]`. The Supabase data layer, the cart contract, and the accent-sensitive search are deliberately untouched. The commit under review is `04890ac` against base `origin/main` (`5f00888`).

Watch for: nothing blocking. All twelve contract items hold against the diff. Two non-blocking observations only — the `contain-intrinsic-size` was shipped at `300px` vs the design's `320px` (confirmed; design review already flagged this as a tuning value, not a contract term), and the sticky-bar cart badge renders a static `0` with no live-count wiring (confirmed; outside the contract, which only requires the cart button to reuse `data-cart-open`).

**Verdict**: APPROVED

## High-level view

The hard preservation constraints are met at the file level: `catalog.ts`, `format.ts`, `CartDrawer.astro`, `BaseLayout.astro`, and `Header.astro` are absent from the diff entirely, so the Supabase fetch/env/cache/types/storageUrl/image logic, the full cart `<script>` with its `CartItem` interface and all twelve `data-cart-*` hooks, the footer socials, and the `.wa-float` are byte-for-byte intact. The new sticky-bar cart button reuses `data-cart-open`, so it rides the existing document-level cart delegation with no cart-code change.

The grid is now mobile-first: the `@media(max-width:360px)` single-column rule is gone, the base is `repeat(2,minmax(0,1fr))`, and a `min-width` ladder climbs 3@560 / 4@900 / 4@1100 / 5@1280. The compact card keeps its square `object-fit:contain` image and clamps the name to 2 lines on phones, 3 at ≥560 via a single added media rule (no duplicate `.name` base), with shrunk 40px controls below 560 and a hidden REF.

The catalog controller filters by category and inclusive min/max price (NaN card price always passes, NaN bound always passes), sorts by the four `SortKey`s, resets the cursor to `pageSize` on every `apply()`, and reveals 32-item batches via "Ver más" that interoperate with filters/search/sort. The client search mirrors the server's accent-sensitive `toLocaleLowerCase('es')` and does not use `normalizeText`.

DECISION 1 is implemented as specified: `data-config` JSON on `[data-catalog-root]` plus a bundled boot `<script>` that imports `initCatalog` (no `define:vars`), parses inside try/catch with a DEFAULTS fallback, coerces `pageSize` with `Number()`, validates `defaultSort` via `isSortKey`, coerces booleans, and narrows the parsed `unknown` field-by-field rather than blind-casting. DECISION 2 is implemented as specified: `buscar.astro` mounts `CatalogGrid` only when `q && results.length > 0`, keeps the prompt for empty `q` and the plain `.empty-state` for zero results, and leaves the server filter byte-for-byte unchanged; `productos.astro` and `categoria/[slug].astro` always mount the chrome, with `categoria` passing `categoryFilter={false}` and keeping the unknown-slug→`/productos` redirect.

The home consumes `getSiteConfig()` and maps over `HomeSection[]` in discovery order (hero → categories → destacados first-8 → novedades latest-4 → cta) through dedicated partials; strips use bare `ProductCard` in a plain `.product-grid`, never `CatalogGrid`. No Admin UI and no Supabase wiring were added. Clean-build evidence (astro check 0/0/0, astro build exit 0, strict on, no `@ts-nocheck`) is present in verification-note.md and was not re-run per the step contract.

<details>
<summary>Issues (2)</summary>

1. **Intrinsic-size tuning value (non-blocking)** — `contain-intrinsic-size:0 300px` shipped vs the design's `320px`; a tuning value, not a contract term (design review NIT). Validate at 360/390/414px during manual QA; no code change required to pass.
2. **Static sticky-bar cart badge (non-blocking)** — the sticky-bar cart button renders a hardcoded `0` badge with no live-count listener. Outside the contract (which only requires reusing `data-cart-open`, satisfied). Optional follow-up to sync it with the cart count.

</details>

<details>
<summary>Details</summary>

### 1. Supabase/catalog data layer untouched

`git diff origin/main --stat` lists no `src/lib/catalog.ts` and no `src/lib/format.ts`. The fetch, env handling, 60s cache, `storageUrl`, `Number(row.precio_venta)` price coercion, image `src` logic, and the `Product`/`Category` types are therefore unchanged, and broken-image handling stays out of scope as required. `CatalogGrid.astro` imports `Product`/`Category` as types only and reads `product.precio`, `product.categoriaSlug`, `product.nombre`, etc. — consuming the existing shape, not altering it. **confirmed.**

### 2. Cart contract and data-product shape intact; sticky button reuses data-cart-open

`BaseLayout.astro` is absent from the diff. Grepping it confirms `interface CartItem { id: string | number; name: string; ref: string; price: number; image: string; qty: number; }` and the full cart delegation covering `data-add-cart`, `data-cart-open`, `data-cart-close`, `data-cart-overlay`, `data-cart-drawer`, `data-cart-count`, `data-cart-items`, `data-cart-total`, `data-cart-checkout`, `data-cart-plus`, `data-cart-minus`, `data-cart-remove` — all twelve, unchanged. `ProductCard.astro`'s diff touches only the `<style>` block; the markup, `data-add-cart`, and the `data-product` JSON `{id,slug,name,price,image,ref}` are untouched. `CatalogGrid.astro`'s sticky-bar cart button is `<button ... data-cart-open ...>`, so it opens the existing drawer through the untouched delegation (`BaseLayout.astro:86 if(el.closest('[data-cart-open]')) return openCart();`). The new catalog/filter hooks use the disjoint `data-catalog-*` / `data-see-more` / `data-filter-*` namespaces. **confirmed.** Non-blocking: the sticky button's `.cart-count` badge is a static `0` with no updater; it is cosmetic and not part of the contract.

### 3. Strict TypeScript and clean build

verification-note.md records `astro check` → 0 errors/0 warnings/0 hints and `astro build` exit 0, with strict still on (`tsconfig.json` extends `astro/tsconfigs/strict`, unmodified and absent from the diff) and no `@ts-nocheck` added. Per the step contract I did not re-run the build. The controller and config modules are consistent with strict TS: parsed JSON in the boot script is typed `unknown` and narrowed field-by-field (`CatalogGrid.astro` boot `validateConfig`), the `switch` on `section.type` in `index.astro` is exhaustive over the `HomeSection` union, and `resolveFeatured`'s `switch` is exhaustive over `FeaturedRule`. **confirmed.**

### 4. Mobile grid 2–3 cols, single-column rule removed, no overflow

`global.css` diff removes `@media(max-width:360px){.product-grid{grid-template-columns:1fr}}` and the `.product-grid` fragments from the former `max-width:900`/`max-width:680` rules while preserving `.container`/`.section`/`.section-head`/`.section-head .text-link` inside the `max-width:680` block. The new base is `.product-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}` with a `min-width` ladder: 3@560, 4@900, 4@1100 (larger gap), 5@1280. So 320–559px → 2 cols, 560–899 → 3, 900–1279 → 4, ≥1280 → 5. `minmax(0,1fr)` on every track plus the existing `html,body{overflow-x:hidden;max-width:100%}` guard against overflow at 360/390/414px; the sticky bar is a flex row with `flex:1 1 auto;min-width:0` search and `flex:none` buttons, and chips scroll inside their own `overflow-x:auto` container. **confirmed** (static CSS analysis; actual pixel rendering deferred to manual QA, consistent with the design's stated scope).

### 5. Compact ProductCard

`ProductCard.astro` `<style>`-only edit keeps `aspect-ratio:1/1` + `object-fit:contain` and `width/height=480` + `loading="lazy"`. The base `.name` keeps `-webkit-line-clamp:2;min-height:2.6em`; a single added `@media(min-width:560px){.name{-webkit-line-clamp:3;min-height:auto}}` lifts it to 3 lines on wider screens — no duplicated base declaration. A `@media(max-width:559px)` block tightens body padding, hides `.ref`, shrinks name/category, keeps `.price` prominent (`.98rem`), and reduces controls to 40px (a documented deliberate trade-off below 560; ≥560 returns to 44px via the base). Markup and data hooks unchanged. **confirmed.**

### 6. Filter + sort + pagination reset

`matchesFilters` applies category exact match (only when `config.categoryFilter`), inclusive price `[min,max]` (only when `config.priceFilter`), and the accent-sensitive `q` include. The NaN rules match the contract exactly: a card whose `price` is `NaN` skips the price bounds entirely (`if (!Number.isNaN(item.price))`), so it always passes; a `NaN` bound is skipped (`!Number.isNaN(state.min)` / `state.max`), so it always passes. `sortItems` covers all four `SortKey`s with `domIndex` tie-breaks and `relevancia` = DOM order. `apply()` recomputes the subset, re-sorts, sets `cursor = config.pageSize`, and `render()` recomputes `[data-catalog-count]` and the "Ver más" remaining badge from the fresh filtered length. **confirmed.**

### 7. Progressive "Ver más"

Items render `hidden`; `render()` reveals the first `cursor` of the current filtered+sorted set (using `el.style.order` so nodes are not physically moved) and hides the rest. The `[data-see-more]` handler adds `config.pageSize` (32) to the cursor and re-renders; the button text shows the live remaining count and hides at the end. Because "Ver más" reveals from `filtered` (the output of `apply()`), it interoperates with the active search/filter/sort, and every `apply()` resets the cursor so a new filter starts a fresh first page. **confirmed.**

### 8. Config-driven home via getSiteConfig() + HomeSection[]

`index.astro` does `const config = await getSiteConfig();` then `config.home.sections.map(...)` with a `switch` on `section.type` routing to `HeroSection`/`CategorySection`/`ProductStripSection`/`CtaSection`. The default section order in `siteConfig.ts` is hero → categories → product-strip(first-n 8) → product-strip(latest 4) → cta — discovery order. `resolveFeatured` reproduces today's selection: `first-n` = `slice(0,count)` and `latest` = `[...products].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).slice(0,count)` (empty `createdAt` sorts last). `getSiteConfig()` is a single async accessor returning `defaultSiteConfig`, documented as the only Admin seam; no Admin UI and no Supabase wiring are added (`siteConfig.ts` imports only the `Product` type). `ProductStripSection.astro` renders bare `<ProductCard>` in a plain `.product-grid` — no `.grid-item`, no controller, never `CatalogGrid`. **confirmed.**

### 9. DECISION 1 — data-config JSON + bundled validated boot

`CatalogGrid.astro` renders `[data-catalog-root]` with `data-config={JSON.stringify({pageSize, defaultSort, categoryFilter, priceFilter})}`. The boot `<script>` is a bundled Astro module script (`import { initCatalog, isSortKey } from '../scripts/catalog-controller'`) with no `define:vars`. It reads `root.dataset.config`, `JSON.parse`s inside try/catch (falling back to `{}`), and `validateConfig` narrows the parsed `unknown`: object/null guard, `Number()` coercion for `pageSize` with `NaN`/`≤0` → 32 (plus `Math.floor`), `isSortKey` validation for `defaultSort` → `'relevancia'`, boolean coercion for both flags → `true`. The parsed value is `unknown` cast to `Record<string, unknown>` only inside the validator, read property-by-property — not blind-cast to the config type. **confirmed.**

### 10. DECISION 2 — buscar/productos/categoria mounting rules

`buscar.astro` leaves the server filter byte-for-byte unchanged (`q.toLocaleLowerCase('es')` + `.toLocaleLowerCase('es').includes(normalized)`), keeps the empty-`q` prompt and the zero-results `.empty-state` inside the page shell, and mounts `<CatalogGrid>` only in the `{q && results.length > 0 && ...}` branch, outside the shell — so no catalog chrome appears on the empty or zero-results states. `categories` is fetched only when results exist. `productos.astro` always mounts `<CatalogGrid products={products} categories={categories} config={config.catalog} />` (full chrome, `categoryFilter` defaults true). `categoria/[slug].astro` always mounts `<CatalogGrid products={items} config={config.catalog} categoryFilter={false} />`, so the chips row and category `<select>` are suppressed (`CatalogGrid` gates both on `categoryFilter && categories.length > 0`), and the `if (!category) return Astro.redirect('/productos', 302);` unknown-slug guard is intact. **confirmed.**

### 11. Search stays accent-sensitive

`buscar.astro`'s server filter diff shows only the import swap and `const config`/`categories` additions; the `normalized`/`results` logic is unchanged accent-sensitive `toLocaleLowerCase('es')`. The client `data-haystack` in `CatalogGrid.astro` is built with the same `` `${nombre} ${referencia} ${color} ${categoria}`.toLocaleLowerCase('es') `` transform, and `matchesFilters` matches with `item.haystack.includes(state.q.toLocaleLowerCase('es'))`. `normalizeText` is not imported or used anywhere in the new code (confirmed by its absence from the controller/grid). Client and server therefore share identical accent-sensitive semantics with zero change to observable results. **confirmed.**

### 12. Social links, floating WhatsApp, product/category/search pages, no-JS fallback

`BaseLayout.astro` (footer Instagram/TikTok/WhatsApp inline SVGs + verbatim URLs, `.wa-float`) is absent from the diff — preserved. The product page `/producto/[slug]` is absent from the diff — preserved. Category and search pages keep their behavior (items 10). The no-JS fallback is present: `global.css` ships `.product-grid:not(.js-ready) .grid-item{display:block !important}` and `.catalog-root:not(.js-ready) [data-see-more], .catalog-root:not(.js-ready) .sticky-bar{display:none}`, and `initCatalog` adds `js-ready` to both `root` and `.product-grid` as its first action — so without JS (or before boot) every product shows and the JS-only chrome stays hidden. **confirmed.**

#### File map

- `src/lib/siteConfig.ts` (new) — config types, `SortKey`, `defaultSiteConfig`, async `getSiteConfig()` Admin seam, pure `resolveFeatured()`.
- `src/scripts/catalog-controller.ts` (new) — strict-typed vanilla controller + exported pure helpers (`matchesFilters`, `sortItems`, `isSortKey`).
- `src/components/CatalogGrid.astro` (new) — sticky bar + chips + bottom-sheet + `.product-grid` of `.grid-item`(ProductCard) + "Ver más" + empty state + validated bundled boot script.
- `src/components/home/HeroSection.astro`, `CategorySection.astro`, `ProductStripSection.astro`, `CtaSection.astro` (new) — home section partials.
- `src/styles/global.css` — grid breakpoint ladder (1-col rule removed) + shared `.grid-item`/`js-ready` fallback classes.
- `src/components/ProductCard.astro` — `<style>` only (compact card, 2/3-line clamp).
- `src/pages/index.astro` — render from `config.home.sections` via partials.
- `src/pages/productos.astro` — inline chips+grid replaced by `<CatalogGrid>`.
- `src/pages/categoria/[slug].astro` — `<CatalogGrid categoryFilter={false}>`, redirect kept.
- `src/pages/buscar.astro` — server filter unchanged; `<CatalogGrid>` only when `q && results.length>0`.

Full diff: `git diff origin/main` (base `5f00888`, head `04890ac`).

</details>
