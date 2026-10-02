# Design — Mobile-First UX + Responsive Overhaul + Config Decoupling (Tulstore Web)

## Overview

This design covers two linked tracks for Tulstore Web (Astro `output: 'server'`, `@astrojs/netlify`, strict TypeScript, no UI/CSS/JS frameworks, no icon fonts):

1. **UI / responsive overhaul** — a compact mobile e-commerce catalog grid (2–3 cards per row on phones, never 1), a sticky mobile action bar (search + Filtros + carrito), touch-scrollable category chips, a vanilla filter bottom-sheet, client-side progressive loading (32 + "Ver más"), and a discovery-ordered home.
2. **Config decoupling (the key architecture decision)** — move the home layout/content and catalog settings out of hardcoded markup into a single typed config module (`src/lib/siteConfig.ts`) exposed through one clearly marked async accessor (`getSiteConfig()`) that is the *only* seam a future Tulstore Admin / remote source would replace. No Admin UI, no new Supabase wiring now.

The technology stack is **locked** by this design: Astro 7 server output + Netlify adapter, strict TypeScript (`astro/tsconfigs/strict`, `@ts-nocheck` forbidden, `strict` stays on), plain per-component `<style>` + `src/styles/global.css` tokens, and tiny inline vanilla TS in `<script>` blocks (same pattern as the existing cart/header scripts). No new runtime dependencies. The `@/*` path alias (`tsconfig.json` → `src/*`) is available but imports may stay relative to match existing files; the coder picks one and is consistent per file.

Hard preservation constraints (verified against current code, must not change): `src/lib/catalog.ts` entirely (Supabase fetch, env, cache, `storageUrl`, types); the `data-product` JSON shape emitted by `ProductCard.astro` (`{id,slug,name,price,image,ref}`); all existing cart `data-*` hooks (the complete set, verified across `BaseLayout.astro`, `CartDrawer.astro`, `ProductCard.astro`: `data-add-cart`, `data-cart-open`, `data-cart-close`, `data-cart-overlay`, `data-cart-drawer`, `data-cart-count`, `data-cart-items`, `data-cart-total`, `data-cart-checkout`, `data-cart-plus`, `data-cart-minus`, `data-cart-remove` — 12 distinct attributes) and the `CartItem` interface in `BaseLayout.astro`; the footer with Instagram/TikTok/WhatsApp inline-SVG links (verbatim URLs); the floating `.wa-float`; `formatCOP` / `normalizeText` in `format.ts` (reuse, never duplicate). All new filter hooks use the disjoint `data-filter-*` namespace so none of the 12 cart hooks is touched. The truncated "El instagr" line in the request is interpreted conservatively: **leave Instagram/TikTok/WhatsApp exactly as they are** — no restyle, no relink. (This one requirement is an inference from a truncated message line, corroborated by message 3's explicit "Mantén Instagram, TikTok, WhatsApp"; revisit only if the user clarifies the truncated line — Finding 9.)

---

## Track A — Responsive grid and card (global.css + ProductCard.astro)

### A1. `.product-grid` breakpoints (edit `src/styles/global.css`)

The current rules collapse to a single column at ≤360px (`@media(max-width:360px){.product-grid{grid-template-columns:1fr}}`) and to 2 columns at ≤680px. That single-column rule is the direct cause of "1 producto por fila" on small phones and **must be removed**. Replace the grid rules with a width-driven ladder. Decision: use `min-width` media queries building up from a mobile-first 2-column base, so the narrowest phones always show 2 cards.

**Surgical-edit note (Finding 7):** the current `global.css` has the base `.product-grid` declaration plus exactly three `@media` rules that touch it (`max-width:900` → 3 cols, `max-width:680` → 2 cols, `max-width:360` → `1fr`). The `max-width:680` rule is a **combined** rule that also restyles `.container`, `.section`, `.section-head`, and `.section-head .text-link`. Remove ONLY the `.product-grid{...}` fragment from each of the three media rules (and the `.product-grid` base declaration); **preserve the other selectors inside the `max-width:680` block** untouched. Then add the new mobile-first ladder below.

Replace the `.product-grid` base declaration and the three `.product-grid` media fragments (per the surgical note above) with:

```css
/* mobile-first base: 2 columns always, even at 320px */
.product-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
/* roomy phones / small tablets: allow a readable 3rd column */
@media(min-width:560px){.product-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}}
/* tablet / small desktop */
@media(min-width:900px){.product-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}}
/* standard desktop */
@media(min-width:1100px){.product-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}}
/* wide desktop: 5 columns */
@media(min-width:1280px){.product-grid{grid-template-columns:repeat(5,minmax(0,1fr))}}
```

Resulting column counts (meets the brief "2 or 3 on phone, 3–5 on desktop by width"):
- 320–559px → **2** columns (360/390/414px phones all show 2 compact cards side by side)
- 560–899px → **3** columns
- 900–1279px → **4** columns
- ≥1280px → **5** columns

`minmax(0,1fr)` on every track prevents grid blow-out from long unbreakable product names. `html,body{overflow-x:hidden;max-width:100%}` already exists in `global.css` and stays as the final guard against accidental horizontal scroll; the grid relying only on `1fr` tracks + `gap` (no fixed min like `280px`) is what actually prevents overflow at 320px.

### A2. Compact card (edit `src/components/ProductCard.astro` `<style>` only; markup unchanged)

Markup, `data-add-cart`, and the `data-product` JSON stay byte-for-byte identical (cart depends on them). Only the scoped `<style>` changes to make cards shorter and denser on mobile while keeping ≥44px tap targets where feasible.

Keep: `.image-wrap{aspect-ratio:1/1}` + `img{object-fit:contain}` (already square, already no distortion — the brief's "imagen cuadrada, sin deformar" is already satisfied; do not alter the contain/padding logic). Keep the existing `width="480" height="480"` and `loading="lazy"` on the `<img>` (prevents layout shift, matters for 1000+ images on mobile).

Mobile tuning (tighten the existing `@media(max-width:680px)` block and add a very-small-phone block). Target: card body short, name clamped, price prominent, controls compact.

```css
/* name: clamp to 2 lines on phones, up to 3 on wider (keeps cards short) */
.name{-webkit-line-clamp:2;min-height:2.6em}
@media(min-width:560px){.name{-webkit-line-clamp:3;min-height:auto}}

@media(max-width:559px){
  .body{padding:9px 9px 10px}
  .category{font-size:.62rem;margin-bottom:3px}
  .ref{display:none}            /* drop REF on small phones to shorten card; still on product page */
  .name{font-size:.8rem;margin-bottom:4px}
  .price{font-size:.98rem;margin-bottom:8px}
  .image-wrap img{padding:8px}
  .actions{gap:5px}
  .add{padding:9px 6px;font-size:.78rem;min-height:40px}   /* <44 only on narrow phones to keep card short; still a comfortable touch target */
  .wa{width:40px;min-height:40px}
  .wa svg{width:19px;height:19px}
}
```

Rationale for the 40px (vs 44px) controls below 560px: on a 360px viewport two cards + gap leave ~165px per card; a 44px-tall coral button plus the WhatsApp square keeps the card tall. 40px is still an acceptable touch target (Apple HIG 44pt is a guideline, Material uses 48dp min with 40dp acceptable for dense lists) and buys a noticeably shorter card. At ≥560px controls return to ≥44px. This is a documented, deliberate trade-off, not "handle it somehow".

Edge cases: products with `estado` `AGOTADO`/`REVISAR` are already rendered the same way (no badge logic exists in the card today — `.flag` style exists but is unused); **do not add status badges**, that is out of scope. Missing/broken images are explicitly out of scope per request message 2 ("No trabajes todavía en las imágenes de productos rotas") — `object-fit:contain` already prevents broken images from breaking layout.

---

## Track B — Catalog interactivity (filters, sort, progressive loading)

This is the largest new piece. It lives primarily on `src/pages/productos.astro` and is shared by `categoria/[slug].astro` and `buscar.astro` through a single reusable Astro component so the three pages stay consistent and the vanilla controller is written once.

### B0. DOM strategy decision — render-all + reveal (NOT a client-built JSON island)

Two viable approaches were considered:

- **(A) JSON island:** serialize products to a `<script type="application/json">` and build cards in the browser. Rejected: it would duplicate `ProductCard` markup (including the exact `data-product` JSON) in client JS, risking drift from the Astro component and the cart contract; it also moves `formatCOP` to the client and delays first paint.
- **(B) Server-render all cards, hide/reveal with CSS + a visible-count cursor.** **Chosen.** Astro already renders every `ProductCard` server-side with correct `data-product`. We keep that (SSR fetch is cached 60s in `catalog.ts`), and the client only toggles a `hidden`-style class based on three plain string arrays computed from `data-*` attributes already on each card. No markup duplication, cart hooks untouched, strict-TS clean. 1000+ hidden DOM nodes are cheap to keep in the document (`display:none` nodes are not laid out/painted).

**`content-visibility` decision (Finding 3, iteration 3):** apply it concretely with an intrinsic-size placeholder so it does not cause scroll jumpiness —

```css
.grid-item{content-visibility:auto;contain-intrinsic-size:0 320px}
```

The `contain-intrinsic-size: 0 320px` reserves a placeholder height (~320px, matching the expected compact card height) for not-yet-rendered items so the scrollbar and scroll position stay stable while off-screen cards are skipped during paint. Without the intrinsic size this optimization would collapse off-screen items to zero height and cause scroll-anchoring glitches — directly against the no-horizontal-scroll / smooth-mobile goal — so the intrinsic size is mandatory, not optional. This lives on `.grid-item` in `global.css` alongside the other shared catalog classes.

Performance note for 1000+ items: filtering reads attributes once into an in-memory index on first interaction (not re-querying the DOM each keystroke), then only flips a class on affected cards. This keeps mobile filtering/sorting under a frame budget.

### B1. New data attributes on each catalog card (via a thin wrapper, ProductCard unchanged)

`ProductCard.astro` stays untouched. Instead the catalog pages wrap each card's filter metadata on the grid item through a new component `src/components/CatalogGrid.astro` (see B3) which renders each product as:

```astro
<div class="grid-item"
     data-cat={product.categoriaSlug}
     data-price={product.precio}
     data-name={product.nombre}
     data-haystack={`${product.nombre} ${product.referencia} ${product.color} ${product.categoria}`.toLocaleLowerCase('es')}
     hidden>
  <ProductCard product={product} />
</div>
```

All items start `hidden`; the controller reveals the first page after it runs (progressive enhancement — if JS fails, a `<noscript>`-friendly fallback is handled by B5). Note the `data-created` attribute has been **removed** from the wrapper (Finding 4, iteration 3): nothing in the catalog controller reads it — `CatalogItem` has no `created` field and `SortKey` has no `latest` member (`latest` is a home-only selection rule, Track F). Keeping it would mean 1000+ unused DOM attributes. `createdAt` is still read server-side by `resolveFeatured` on the home, never on the catalog wrapper.

**Search-normalization: client mirrors the UNCHANGED server filter (Finding 2, iteration 3 — resolved by NOT touching the server).** The field concatenation (`${nombre} ${referencia} ${color} ${categoria}`) matches the string `buscar.astro` builds today. Earlier iterations proposed changing `buscar.astro`'s server filter from accent-sensitive to accent-insensitive `normalizeText` so client and server would share one normalization. That was reverted: it changed observable search **results** (e.g. "nino" would start matching "niño"), which contradicts the explicit, repeated preservation constraint ("No cambies … consulta de productos", "No cambies … búsqueda", "Mantén … búsqueda … actuales").

Decision: **leave `buscar.astro`'s server filter exactly as it is today (accent-SENSITIVE)** and make the CLIENT mirror it with zero server change and zero result change. Verified in source, the current server filter is:

```ts
// buscar.astro — UNCHANGED
const q = (Astro.url.searchParams.get('q') || '').trim();
const normalized = q.toLocaleLowerCase('es');
const products = await getProducts();
const results = !normalized ? [] : products.filter(
  (p) => `${p.nombre} ${p.referencia} ${p.color} ${p.categoria}`.toLocaleLowerCase('es').includes(normalized)
);
```

The client `data-haystack` is therefore built with the **same** accent-sensitive transform (`.toLocaleLowerCase('es')`, NOT `normalizeText`), and the controller matches with `item.haystack.includes(q.toLocaleLowerCase('es'))`. This gives exact client↔server parity on every catalog view with **no change to any page's search behavior**: the sticky-bar re-filter on `buscar.astro` narrows the server `results` set using identical semantics, so no accent mismatch and no new or missing matches versus today.

Consequence for reuse: `normalizeText` from `format.ts` is NOT used for the catalog haystack (it is still reused elsewhere, e.g. nowhere else is needed here). The preservation constraint outranks reuse-for-its-own-sake. If accent-insensitive search is ever actually wanted, that is a deliberate product/UX decision the user must opt into explicitly — it must not be smuggled in under "unification". Flagged, not decided here.

### B2. The vanilla catalog controller — `src/scripts/catalog-controller.ts`

A new standalone module imported by `CatalogGrid.astro` via `<script>`. Strict-typed, no DOM markup generation (only class/attr toggles). Public shape:

```ts
import type { SortKey } from '../lib/siteConfig'; // single source of truth (G1); controller imports, never defines

export interface CatalogControllerConfig {
  pageSize: number;            // from siteConfig.catalog.pageSize (default 32)
  defaultSort: SortKey;        // from siteConfig.catalog.defaultSort ('relevancia')
  categoryFilter: boolean;     // from the CatalogGrid categoryFilter prop
  priceFilter: boolean;        // from siteConfig.catalog.priceFilter (Finding 5, iteration 3)
}

interface CatalogItem {
  el: HTMLElement;             // the .grid-item
  cat: string;
  price: number;
  name: string;
  haystack: string;
  domIndex: number;            // original order = 'relevancia'
}
```

Behavior:
Named DOM hooks the controller owns (all distinct from cart `data-cart-*` and from `data-filter-*`): the wrapper `[data-catalog-root]` (class `catalog-root`), the grid `.product-grid`, each item `.grid-item`, the "Ver más" button `[data-see-more]`, the sticky action bar `.sticky-bar` (with search input `[data-catalog-search]`, Filtros button `[data-filter-open]`, cart button reusing `data-cart-open`), the empty-state `[data-catalog-empty]`, and the results counter `[data-catalog-count]`.

- On init: add `js-ready` to `[data-catalog-root]` and `.product-grid` (B5), **measure the header and set the sticky bar's `top` via `syncStickyTop()` (Track C, Finding 1) and bind it to `resize` + nav-toggle**, query `.grid-item` once, build `CatalogItem[]`, read initial `q`, `cat`, `min`, `max`, `sort` from the URL querystring (so a shared/bookmarked `/productos?cat=hogar&sort=precio-asc` reproduces state and so `buscar.astro`'s initial `?q=` is seeded into the sticky-search input — see Track C path 3 for how the search input behaves thereafter), then **null-guard the price inputs** — if `config.priceFilter` is false or the min/max inputs are absent, the controller attaches no price listeners and applies no price constraint (Finding 5).
- `apply()`: compute the filtered subset (category exact match on `data-cat`, applied only when `config.categoryFilter` is true; price within `[min,max]` inclusive, applied only when `config.priceFilter` is true AND the min/max inputs exist — see B4 null-guard rule, Finding 5; `q` via `item.haystack.includes(q.toLocaleLowerCase('es'))` — the SAME accent-sensitive transform the server uses and never changes, Finding 2), sort the subset by `SortKey`, then reset the visible cursor to `pageSize` and reveal only the first `pageSize` filtered items (set `hidden` on the rest). Sort is applied by reordering with `el.style.order` (CSS `order` on grid items) — avoids physically moving 1000 nodes; grid respects `order`.
- "Ver más" (`[data-see-more]`): reveal the next `pageSize` of the *current filtered set*; hide the button when the cursor reaches the filtered length. The button shows remaining count ("Ver más (128)").
- Empty result: reveal a `[data-catalog-empty]` message, hide the grid and `[data-see-more]`.
- A results counter `[data-catalog-count]` updates to the filtered length.

`relevancia` default = original server order (`producto.asc` from `catalog.ts`), i.e. `domIndex`. For `buscar.astro`, "relevancia" additionally keeps server order of the already-matched set.

### B3. Reusable grid component — `src/components/CatalogGrid.astro`

Props (final):
```ts
interface Props {
  products: Product[];
  config: CatalogConfig;              // from siteConfig.catalog
  categoryFilter?: boolean;           // default true; per-render override (Finding 4)
  categories?: Category[];            // for the category <select>/chips; required when categoryFilter is true
}
```

**`CatalogGrid` is used ONLY by the three catalog views** (`productos.astro`, `categoria/[slug].astro`, `buscar.astro`); it always renders its full interactive chrome. There is **no `showControls` prop** — it has been removed (Finding 2). The home never uses `CatalogGrid`; home product strips render bare `<ProductCard>` in a plain `.product-grid` (see Track F). This removes the earlier ambiguity about a controls-off `CatalogGrid` on the home: there is no such mode, so there is no risk of a home strip shipping the filter controller or rendering empty `hidden` items.

`CatalogGrid` renders: the sticky mobile action bar (Track C), the category chips (only when `categoryFilter` is true), the filter bottom-sheet (its category `<select>` is omitted when `categoryFilter` is false), the `.product-grid` of wrapped `.grid-item`s, the "Ver más" button, the empty state, and the `<script>` that imports and boots `catalog-controller.ts` with `config.pageSize` / `config.defaultSort` / `categoryFilter` (the resolved per-render prop) / `config.priceFilter` (Finding 5).

Per-page usage (Finding 4 resolved — the `may` is now a definite rule):
- `productos.astro`: `<CatalogGrid products={products} categories={categories} config={config.catalog} />` (full filters, `categoryFilter` defaults true).
- `categoria/[slug].astro`: `<CatalogGrid products={items} config={config.catalog} categoryFilter={false} />` — because every item already shares one category, the category `<select>` **and** the category chips row are NOT rendered (a category control there is a no-op or filters to empty). Price filter, sort, search, and progressive loading still apply to the single-category set. `categories` is not needed/passed here.
- `buscar.astro`: `<CatalogGrid products={results} categories={categories} config={config.catalog} />` on the server-matched `results`, preserving the `?q` → controller handoff (Track C / B2).

This removes the duplicated inline `.product-grid` markup from all three pages.

### B4. Sort & filter correctness / validation (external input = the controls + URL params)

Each external input and its rule:
- **Search `q`** (text input + `?q`): optional, string; matched with `item.haystack.includes(q.toLocaleLowerCase('es'))` — the SAME accent-sensitive transform `buscar.astro`'s UNCHANGED server filter uses, so client and server match identically (Finding 2); empty/whitespace → no text constraint. No length cap needed (local filter), but trimmed.
- **Category** (`select`/chip, `?cat`): optional, must equal a known `categoriaSlug`; unknown value → treated as "all" (no crash, no filter).
- **Min / max price** (`number` inputs, `?min`/`?max`): optional; parsed with `Number()`; `NaN` or negative → treated as unset; if `min > max`, swap them (defensive, non-fatal). Prices are integers (COP) from `data-price`. Only consulted when `config.priceFilter` is true and the inputs exist (Finding 5).
- **A card's own `data-price`** (read from each `.grid-item`): always a valid integer in practice (`Number(row.precio_venta)` in `catalog.ts`). Defensive rule (Finding 6): **a card whose `data-price` parses to `NaN` always PASSES the price filter — it is never hidden by a min/max bound.** (This is the single authoritative rule; the error-handling table reflects it exactly.)
- **Sort** (`select`, `?sort`): optional; must be one of the four `SortKey`s; anything else → fall back to `defaultSort` (`relevancia`). This validation lives in the controller (the only layer that consumes these inputs), because the invariant "visible set always reflects a valid filter/sort state" is a client-side view concern.

All failures here are **recoverable and silent** (fall back to a sane default); none are fatal; nothing is logged (pure client view state, logging would be noise). The only fatal path in the whole feature is the existing `getProducts()` Supabase failure, which already `throw`s in `catalog.ts` and is unchanged.

### B5. Progressive-enhancement fallback

Because items render `hidden` and the controller reveals them, a JS failure would show an empty catalog. 

**Exact fallback targets and rules (Finding 3 resolved).** `CatalogGrid` renders a wrapper element with class `catalog-root`, and the inner grid element carries class `product-grid`. The boot `<script>`, as its **first statement before any filtering**, adds the class `js-ready` to BOTH elements:

```ts
const root = document.querySelector<HTMLElement>('[data-catalog-root]');
const grid = root?.querySelector<HTMLElement>('.product-grid');
root?.classList.add('js-ready');
grid?.classList.add('js-ready');
// ... then build the item index and reveal the first page
```

The fallback CSS (placed in `global.css` with the shared catalog classes) is exactly:

```css
/* no-JS / pre-boot: reveal every product, hide JS-only chrome */
.product-grid:not(.js-ready) .grid-item{display:block !important}
.catalog-root:not(.js-ready) [data-see-more],
.catalog-root:not(.js-ready) .sticky-bar{display:none}
```

So without JS (or before boot, or if the controller throws on init) all `.grid-item`s are visible — degrading to today's "render everything" behavior — while the "Ver más" button (`[data-see-more]`) and the sticky action bar (`.sticky-bar`) stay hidden because they are useless without the controller. The two `js-ready` classes are independent: `.product-grid:not(.js-ready) .grid-item` governs item visibility and `.catalog-root:not(.js-ready) ...` governs the JS-only chrome, so each selector matches the element that actually carries the class. The filter bottom-sheet is `aria-hidden`/`transform:translateY(100%)` by default and is only ever opened by the controller, so it needs no separate fallback rule.

---

## Track C — Sticky mobile action bar

A mobile-only bar rendered by `CatalogGrid.astro` (so it appears on all three catalog views and nowhere else — the home does not use `CatalogGrid`). Decision: **sticky top**, positioned directly under the existing sticky header (`.site-header` is `position:sticky;top:0;z-index:40`).

Rationale for top vs bottom: a bottom bar would collide with the floating WhatsApp icon (`.wa-float`, bottom-right, `z-index:60`) and with iOS Safari's bottom chrome, and would compete with the cart drawer. Top also keeps search reachable where users expect it. The bar is `position:sticky` and must ride directly under the sticky header (`.site-header`, `position:sticky;top:0;z-index:40`).

**Dynamic `top` offset — do NOT hardcode a px value (Finding 1, iteration 3).** The mobile header has **no fixed height**: verified in `Header.astro`, desktop `.topbar{height:78px}` but `@media(max-width:680px)` sets `.topbar{height:auto;...}` and moves the search field to its own row (`grid-column:1/-1;grid-row:2`), so the mobile header is a two-row block of variable height (~110–125px depending on wrapping), and `.category-nav` is `display:none` until the hamburger toggles `.open` (adding more height while open). A literal `top:<header height>` has no single correct value and a hardcoded guess would overlap the header or leave a gap, and would break when the category nav opens.

Chosen mechanism (one concrete approach): the controller measures the header on init and keeps the bar's `top` in sync. Specifically, as part of controller init:

```ts
const headerEl = document.querySelector<HTMLElement>('.site-header');
const barEl = root.querySelector<HTMLElement>('.sticky-bar');
const syncStickyTop = () => {
  const h = headerEl?.getBoundingClientRect().height ?? 0;
  barEl?.style.setProperty('top', `${Math.round(h)}px`);
};
syncStickyTop();
window.addEventListener('resize', syncStickyTop);
// re-measure when the category nav toggles (it changes header height):
headerEl?.querySelector('[data-nav-toggle]')
  ?.addEventListener('click', () => requestAnimationFrame(syncStickyTop));
```

The CSS keeps `.sticky-bar{position:sticky;top:0}` as a safe default; `syncStickyTop()` overrides `top` with the live measured header height (rounded) and re-measures on `resize` and on each nav toggle (via `requestAnimationFrame` so the toggle's class change is applied before measuring). This is a documented controller responsibility (also noted in B2's init list). It needs no change to `Header.astro` and no brittle shared height constant. If `.site-header` is ever absent (defensive), `h` is `0` and the bar simply pins to the viewport top.

Contents (left→right): a search field (`[data-catalog-search]`, `name="q"`), a **Filtros** button (`data-filter-open`, shows active-filter count badge), and a **cart** button reusing `data-cart-open` (same hook as header; opening the existing cart drawer). It is `display:none` on desktop (`@media(min-width:900px)`), shown on phones/tablets.

**Search entry-point semantics — the three paths resolved (Finding 5).** There are three search surfaces and their interplay is now fully specified:

1. **Header search form** (`Header.astro`, `<form action="/buscar" method="get">`, `name="q"`) — unchanged. It always *navigates* to `/buscar?q=…`. This is the only "broaden across the whole catalog" entry point and remains the global search.
2. **Sticky-bar search on `productos.astro` and `categoria/[slug].astro`** — the `[data-catalog-search]` input is **NOT inside a navigating `<form>`**. It carries `name="q"` for semantics only. The controller attaches a debounced (`~150ms`) `input` listener that calls `apply()` to filter **in place**; a `keydown` handler calls `preventDefault()` on `Enter` so it never submits/navigates. So typing on `/productos` narrows the full catalog live without leaving the page.
3. **Sticky-bar search on `buscar.astro`** — `CatalogGrid` receives the server-matched `results` set (narrowed by the server `?q` with its UNCHANGED accent-sensitive filter, Finding 2). The sticky input is seeded with that `?q` on init and, like path 2, filters **in place over the `results` set only** — it can **narrow but not broaden** (it cannot reach products the server already excluded). This is the documented, intended behavior; a user who wants to broaden uses the header form (path 1) to issue a new `/buscar?q=…`. Because the client haystack uses the SAME accent-sensitive `.toLocaleLowerCase('es')` transform the server uses, narrowing on `buscar.astro` behaves identically to the server match — no accent surprises and no change to today's search results.

In all cases the controller debounce avoids re-querying the DOM per keystroke (it filters the in-memory `CatalogItem[]` index from B2). No search path on a catalog view triggers a full page navigation except the header form, which is the deliberate single "global search" affordance.

z-index: **50** (above header 40, below cart overlay 70 / drawer 80 / wa-float 60 so the cart and WhatsApp always sit on top). No horizontal overflow: the bar is a `flex` row inside `.container`; the search input is `flex:1 1 auto; min-width:0`; buttons are `flex:none`. Safe spacing uses `padding` + `env(safe-area-inset-*)` only on the left/right.

---

## Track D — Category chips (reuse existing pattern)

The brief's chips already have a working touch-scroll implementation in `Header.astro` (`.category-scroll{overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}` + `::-webkit-scrollbar{display:none}`). Reuse that exact pattern for the catalog chips inside `CatalogGrid.astro` so behavior is consistent: horizontal, momentum scroll (`-webkit-overflow-scrolling:touch`), hidden scrollbar, `flex-wrap:nowrap`, each chip `flex:none`. Chips link style stays navy/gold identity.

Decision — chips as filters vs links: on the **catalog page**, chips call the controller's category filter (client-side, no navigation) so filtering/pagination stays in place, matching the brief ("categorías principales como chips… manteniendo filtros y búsqueda"). Elsewhere (home) they remain links to `/categoria/[slug]` (discovery navigation). The chip row never causes page overflow because its container is width-bounded and it scrolls internally. The current `productos.astro` `.chips` block (which links out to category pages) is replaced by the controller-driven chips in `CatalogGrid`.

---

## Track E — Filter bottom-sheet (mobile drawer)

Rendered by `CatalogGrid.astro`, controlled by `catalog-controller.ts`. A bottom-anchored sheet (`position:fixed;left:0;right:0;bottom:0;transform:translateY(100%)` → `.open{transform:none}`) with its own overlay. Decision: bottom-sheet (not side drawer) because the brief explicitly says "bottom-sheet/drawer" and it is the standard mobile filter pattern; on desktop the same controls can appear inline (or the sheet simply never opens since filters there are less critical — MVP: filters are mobile-first, desktop keeps chips + the controller still honors `?sort`).

Fields (all feeding B2/B4):
- **Categoría** — a `<select>` populated from `getCategories()` (name + count). Chosen over a chip list inside the sheet to keep the sheet short and avoid a second scroll region.
- **Precio mínimo / máximo** — two `<input type="number" inputmode="numeric" min="0">`.
- **Orden** — a `<select>`: Relevancia (default), Menor precio (`precio-asc`), Mayor precio (`precio-desc`), Nombre A-Z (`nombre`).
- Footer actions: **Aplicar** (`data-filter-apply` → `apply()` + close) and **Limpiar** (`data-filter-clear` → reset controls to defaults + `apply()`).

z-indexes (must not collide with cart overlay 70 / drawer 80 / wa-float 60): filter **overlay = 64**, filter **sheet = 66**. Both sit above `wa-float` (60) and the sticky bar (50) but **below** the cart overlay/drawer (70/80), so if a user somehow triggers the cart while the sheet is open, the cart wins — a deliberate ordering.

Accessibility (vanilla, no library):
- Sheet is `role="dialog" aria-modal="true" aria-labelledby` the sheet title; `aria-hidden="true"` when closed, `false` when open.
- On open: move focus to the first control (or the close button); set `document.body.style.overflow='hidden'` (same technique as `openCart`).
- **Focus trap**: a `keydown` handler keeps Tab/Shift+Tab within the sheet's focusable elements.
- **Escape** closes the sheet and returns focus to the Filtros button; **overlay click** (`data-filter-overlay`) and a **close button** (`data-filter-close`) also close it.
- The Filtros button has `aria-expanded` reflecting state and `aria-controls` the sheet id.

These `data-filter-*` hooks are new and distinct from all 12 cart `data-*` hooks, so the existing document-level cart click delegation in `BaseLayout.astro` is untouched. The filter controller attaches its own listeners (scoped, not the global document click) to avoid interfering with cart delegation.

---

## Track F — Home discovery order (index.astro, driven by config)

`index.astro` is rewritten to **map over `config.home.sections`** (Track G) instead of hardcoding markup. Section order enforced by the config default: compact **hero** → **categorías** → **destacados** (featured) → **novedades** (recién agregados) → **catálogo CTA** entry (link into `/productos`). Each section type has a dedicated small Astro partial so the map stays declarative:

- `src/components/home/HeroSection.astro` (props: `HeroConfig`)
- `src/components/home/CategorySection.astro` (props: title/subtitle/limit + categories)
- `src/components/home/ProductStripSection.astro` (props: `title`/`subtitle`/`seeAllHref` + a resolved `Product[]`). **It renders a plain `.product-grid` of bare `<ProductCard product={p} />` — NO `.grid-item` wrapper, NO `hidden`, NO `js-ready`, NO catalog controller** (Finding 2 resolved). The home strip is static server-rendered content; it reuses only the shared `.product-grid` CSS and the `ProductCard` component, nothing from `CatalogGrid`/`catalog-controller.ts`. This guarantees the strip is always visible (no controller dependency) and the home never ships filter JS. `CatalogGrid` is reserved strictly for the three catalog views.
- `src/components/home/CtaSection.astro` (props: eyebrow/title/text/WhatsApp link)

Compact hero on mobile: keep the existing navy→teal gradient and brand panel (identity), but reduce `min-height` and hide the rotated brand panel on phones (the current CSS already hides `.brand-panel` under 680px — keep that). Microinteractions stay subtle (existing `translateY` hovers, `transition`), no new animation libs.

**Featured / novedades selection rules** are config-driven (see `FeaturedRule` in Track G), computed server-side in `index.astro` from the already-fetched `products` (no new fetch) via the single pure helper `resolveFeatured(products, rule)`: `destacados` = first N by a rule (`manual` ids list OR `first-n` OR `by-category`), `novedades` = top N by `createdAt` desc. 

**`latest` empty/tie ordering (Finding 8 resolved):** `createdAt` is optional on `Product` and can be `''`. For `{kind:'latest'}`, `resolveFeatured` sorts with `(b.createdAt||'').localeCompare(a.createdAt||'')` so empty `createdAt` values sort LAST — this mirrors today's inline `index.astro` logic byte-for-byte so the home does not regress. Default rules reproduce today's visible home: `destacados = {kind:'first-n',count:8}` (today `products.slice(0,8)`) and `novedades = {kind:'latest',count:4}` (today the `latest` array is sorted `createdAt` desc then `.slice(0,4)` is rendered). `SortKey` has no `'latest'` member and must not gain one — `latest` is a home-strip selection rule, not a catalog sort option.

---

## Track G — Config decoupling (KEY ARCHITECTURE)

### G1. The module and its single seam

New file **`src/lib/siteConfig.ts`** — plain typed TS, no deps, no Supabase. It exports interfaces, a `const defaultSiteConfig: SiteConfig`, and **one async accessor `getSiteConfig(): Promise<SiteConfig>`** that is the *only* integration point. Today it returns the local default; a future Admin swaps the body of this one function (e.g. fetch a JSON row from Supabase and merge over the default) without touching any page.

```ts
// src/lib/siteConfig.ts
// SortKey is defined HERE (single source of truth, see decision in G1 note below);
// catalog-controller.ts imports it from this module.
export type SortKey = 'relevancia' | 'precio-asc' | 'precio-desc' | 'nombre';

export interface HeroConfig {
  eyebrow: string;
  title: string;
  subtitle: string;
  primaryCta: { label: string; href: string };
  secondaryCta: { label: string; href: string };
  trust: string[];
  showBrandPanel: boolean;
}

export type FeaturedRule =
  | { kind: 'first-n'; count: number }
  | { kind: 'latest'; count: number }                 // sort by createdAt desc
  | { kind: 'by-category'; categorySlug: string; count: number }
  | { kind: 'manual'; ids: string[] };                // tulstoreId list

export interface ProductStripConfig {
  title: string;
  subtitle?: string;
  rule: FeaturedRule;
  seeAllHref?: string;
}

export interface CategorySectionConfig {
  title: string;
  subtitle?: string;
  limit: number;        // how many category cards to show (today: 8)
  seeAllHref: string;
}

export interface CtaConfig {
  eyebrow: string; title: string; text: string;
  whatsappHref: string; buttonLabel: string;
}

export type HomeSection =
  | { type: 'hero'; data: HeroConfig }
  | { type: 'categories'; data: CategorySectionConfig }
  | { type: 'product-strip'; data: ProductStripConfig }
  | { type: 'cta'; data: CtaConfig };

export interface CatalogConfig {
  pageSize: number;                      // 32
  defaultSort: SortKey;                  // 'relevancia'
  sortOptions: { key: SortKey; label: string }[];
  priceFilter: boolean;                  // show min/max
  categoryFilter: boolean;               // show category select
}

export interface SiteConfig {
  home: { sections: HomeSection[] };
  catalog: CatalogConfig;
}

export const defaultSiteConfig: SiteConfig = {
  home: {
    sections: [
      { type: 'hero', data: { /* current hero copy, showBrandPanel:true */ } },
      { type: 'categories', data: { title:'Explora por categoría', subtitle:'Llega rápido a lo que estás buscando.', limit:8, seeAllHref:'/productos' } },
      { type: 'product-strip', data: { title:'Explora Tulstore', subtitle:'Una selección del catálogo disponible.', rule:{kind:'first-n',count:8}, seeAllHref:'/productos' } },
      { type: 'product-strip', data: { title:'Recién agregados', subtitle:'Productos incorporados recientemente al catálogo.', rule:{kind:'latest',count:4} } },
      { type: 'cta', data: { /* current CTA copy + wa link */ } },
    ],
  },
  catalog: {
    pageSize: 32,
    defaultSort: 'relevancia',
    sortOptions: [
      { key:'relevancia', label:'Relevancia' },
      { key:'precio-asc', label:'Menor precio' },
      { key:'precio-desc', label:'Mayor precio' },
      { key:'nombre', label:'Nombre A-Z' },
    ],
    priceFilter: true,
    categoryFilter: true,
  },
};

// === SINGLE INTEGRATION SEAM FOR TULSTORE ADMIN ===
// Today: returns the local default. Future: fetch Admin/remote config here and
// merge over defaultSiteConfig. No page or component changes required.
export async function getSiteConfig(): Promise<SiteConfig> {
  return defaultSiteConfig;
}
```

**Decision: `SortKey` lives in `siteConfig.ts`** (config is the stable contract; `catalog-controller.ts` imports `SortKey` from `siteConfig.ts`, not the reverse). This keeps pages/components importing only from `lib/`, never from `scripts/`, and gives a single source of truth. B2's `export type SortKey` line is therefore a re-export/import from `siteConfig.ts`, not an independent definition.

### G2. Why this shape (chosen over alternatives)

- **Discriminated-union `HomeSection[]`** chosen over a fixed `HomeConfig {hero, categories, featured, latest, cta}` object because the brief wants the home "no rígidamente acoplado al HTML" and future-Admin-reorderable; a tagged array lets Admin add/remove/reorder sections and `index.astro` just `map`s with a `switch` on `type`. Exhaustive `switch` is strict-TS friendly (compile error if a case is missed).
- **One async `getSiteConfig()`** chosen over scattered constants or reading config inside each component, so the Admin swap is a single-function change. Async now (even though it returns a constant) so the future remote fetch does not change any call site's `await` shape.
- **No CMS / no JSON-on-disk / no new deps** — a plain TS module is the lightest option and keeps strict typing end to end. (A JSON file was considered and rejected: it loses compile-time types and gains nothing until Admin exists.)
- `CatalogConfig` centralizes pageSize/sort/filter definitions so catalog pages and the controller read one source; Admin later tunes pageSize or sort labels without code edits.

### G3. Call sites

- `index.astro`: `const config = await getSiteConfig(); const products = await getProducts(); const categories = await getCategories(products);` then resolve each `product-strip`'s `FeaturedRule` against `products` into a `Product[]`, and `{config.home.sections.map(section => <...>)}` with a `switch` on `section.type`.
- `productos.astro`, `categoria/[slug].astro`, `buscar.astro`: `const config = await getSiteConfig();` then `<CatalogGrid products={...} config={config.catalog} … />` with per-page props exactly as in B3 (`categoria/[slug]` passes `categoryFilter={false}`; `productos`/`buscar` pass `categories`).

A tiny pure helper `resolveFeatured(products: Product[], rule: FeaturedRule): Product[]` lives in `siteConfig.ts` (unit-testable, see testing). It is the only place featured/novedades selection logic exists.

---

## Preserved behavior checklist (Track H)

- `src/lib/catalog.ts` — not modified.
- `ProductCard.astro` `data-product` JSON `{id,slug,name,price,image,ref}` — unchanged (only `<style>` edited).
- All 12 cart `data-*` hooks (`data-add-cart`, `data-cart-open/close/overlay/drawer/count/items/total/checkout/plus/minus/remove`) + `CartItem` interface + cart `<script>` in `BaseLayout.astro` — unchanged; new filter hooks are `data-filter-*` and catalog hooks are `data-catalog-*`/`data-see-more`, all disjoint from the cart hooks.
- Footer Instagram/TikTok/WhatsApp inline SVGs + verbatim URLs, `.wa-float` — unchanged.
- `formatCOP` — reused (prices), not duplicated. `normalizeText` is left in place and untouched; the new catalog code does not use it (the search haystack deliberately mirrors the server's accent-sensitive `.toLocaleLowerCase('es')`, Finding 2), so nothing is duplicated.
- Product pages (`/producto/[slug]`), category, search, WhatsApp checkout — behavior preserved; catalog pages gain client filtering as pure enhancement with a no-JS fallback (B5).
- **Search behavior UNCHANGED (Finding 2, iteration 3):** `buscar.astro`'s server search filter is left exactly as today (accent-sensitive `toLocaleLowerCase('es')` over `nombre referencia color categoria`). An earlier iteration proposed switching it to accent-insensitive `normalizeText`; that was reverted because it changed observable search results and violated the "no cambies búsqueda / mantén búsqueda" constraint. Client/server parity is instead achieved by having the client `data-haystack` + controller use the SAME accent-sensitive `.toLocaleLowerCase('es')` transform. There is now **no data-logic change to any page**; the only page edits are structural (swapping inline `.product-grid` for `<CatalogGrid>`) plus adding `const config = await getSiteConfig();`.

---

## Error handling summary (per fallible operation)

| Operation | Failure condition | Recoverable? | Caller receives | Logged? |
|---|---|---|---|---|
| `getProducts()` (unchanged) | Supabase down / bad env | Fatal (SSR) | existing `throw` → Astro error page | existing behavior, unchanged |
| `getSiteConfig()` today | none (returns constant) | n/a | `SiteConfig` | no |
| `getSiteConfig()` future Admin fetch | remote fetch fails | Recoverable | **falls back to `defaultSiteConfig`** (document this contract now so Admin honors it) | future: `console.warn` server-side |
| Controller reads a card's `data-price` as NaN | malformed attr | Recoverable | card always PASSES the price filter (never hidden by min/max) — single rule, matches B4 | no |
| URL `?sort`/`?cat`/`?min`/`?max` invalid | user-edited URL | Recoverable | fall back to defaults (B4) | no |
| JS disabled / controller throws on init | runtime | Recoverable | B5 fallback shows all products, no "Ver más"/bar | no (would be console error only) |
| Filter yields 0 items | valid state | n/a | `[data-catalog-empty]` message shown | no |

No new operation introduces a fatal, unlogged, or silently-swallowed error beyond the sane client-side defaults documented above.

---

## Testability

- **Unit-testable (pure, no DOM):** `resolveFeatured(products, rule)` for each `FeaturedRule` kind; the filter/sort predicate functions if the controller factors them into exported pure helpers (`matchesFilters(item, state)`, `sortItems(items, key)`). The project has no test runner today; adding one is **out of scope for this change** (the brief locks deps and asks only for `npm run build` with 0 errors). If a test runner is later wanted, Vitest is the natural fit for an Astro/Vite project — but do not add it now. Instead, these helpers are written as exported pure functions so they are *ready* to test.
- **Integration-testable (manual/E2E):** grid column counts at 320/360/390/414/560/900/1280px (DevTools); filter sheet open/close/focus-trap/Escape/overlay; sort correctness; "Ver más" paging and that it respects the active filter; search `?q` handoff from header into the catalog controller; no horizontal scroll at phone widths; cart still opens from both header and sticky bar and checkout still builds the WhatsApp message.
- **Build verification (required):** `npm run build` (runs `astro check && astro build`) from the workspace root must finish with **0 errors** and no `@ts-nocheck` / no weakening of `strict`.

A design-time check that this is testable: the only hard-to-test surface is the DOM controller, and it is kept thin by pushing all decision logic into exported pure functions — which is the signal that the split is right.

---

## File-change manifest (for the planner/coder)

**New files**
- `src/lib/siteConfig.ts` — config types, `defaultSiteConfig`, `getSiteConfig()` (the Admin seam), `resolveFeatured()`, `SortKey`.
- `src/scripts/catalog-controller.ts` — strict-typed vanilla controller (filter/sort/paginate + bottom-sheet a11y), exported pure helpers.
- `src/components/CatalogGrid.astro` — `catalog-root` wrapper + sticky bar + chips + bottom-sheet + `.product-grid` of `.grid-item`(wrapping `ProductCard`) + `[data-see-more]` "Ver más" + empty state + boot script. Props `{products, config, categoryFilter?, categories?}` (NO `showControls` — removed in Finding 2; it is always the full interactive grid, used only by the three catalog views).
- `src/components/home/HeroSection.astro`, `CategorySection.astro`, `ProductStripSection.astro`, `CtaSection.astro`.

**Edited files**
- `src/styles/global.css` — replace `.product-grid` breakpoint ladder (A1); add shared classes for sticky bar / chips / bottom-sheet / grid-item / "Ver más" / `js-ready` fallback (or scope these inside `CatalogGrid.astro` — **decision: layout-structural classes that the controller toggles go in `global.css`; purely visual chrome stays scoped in `CatalogGrid.astro`**).
- `src/components/ProductCard.astro` — `<style>` only (A2). Markup untouched.
- `src/pages/index.astro` — render from `config.home.sections` via the home partials (F/G3).
- `src/pages/productos.astro` — replace inline `.chips` + `.product-grid` with `<CatalogGrid products={products} categories={categories} config={config.catalog} />` (full filters). Add `const config = await getSiteConfig();`.
- `src/pages/categoria/[slug].astro` — use `<CatalogGrid products={items} config={config.catalog} categoryFilter={false} />` (Finding 4: no category select/chips). Add `const config = await getSiteConfig();`.
- `src/pages/buscar.astro` — **server search filter UNCHANGED** (accent-sensitive `toLocaleLowerCase('es')`, Finding 2 iteration 3; do NOT import or apply `normalizeText` here). Only change: replace the inline `.product-grid` with `<CatalogGrid products={results} categories={categories} config={config.catalog} />`, preserving the `?q` → sticky-search seeding/handoff (Track C path 3). Add `const config = await getSiteConfig();`.

**Never touched:** `src/lib/catalog.ts`, `src/lib/format.ts`, `src/components/CartDrawer.astro`, the cart `<script>` + footer + `.wa-float` in `BaseLayout.astro`, `Header.astro` logo/search/cart/nav hooks (Header is only verified, not required to change; the brief's "diagnose header" is satisfied by its already-working hooks — leave as-is unless the review finds a concrete break).

## z-index map (final, no collisions)

| Layer | z-index |
|---|---|
| site header (existing) | 40 |
| sticky mobile action bar (new) | 50 |
| wa-float (existing) | 60 |
| filter overlay (new) | 64 |
| filter bottom-sheet (new) | 66 |
| cart overlay (existing) | 70 |
| cart drawer (existing) | 80 |

## Assumptions

- "Diagnose/fix the header" (message 2, carried into message 3's "demasiado fijo"): the header hooks are **present and correctly wired by static inspection** of `Header.astro` — `data-nav-toggle` toggling `#category-nav.open` with `aria-expanded` sync, the logo-only `<img>`, the search `<form action="/buscar" method="get">` with `name="q"`, the `data-cart-open` button, and the `.category-scroll` touch-scroll chips are all confirmed in markup/CSS. No header defect was found by reading, so **no header change is prescribed**. Runtime verification of nav/search/cart/mobile-menu behavior was NOT exercised here; it is deferred to the build / manual-QA step. If QA finds a concrete header break at runtime, it will be fixed then (Finding 7, iteration 3). The remaining designed work is the sticky mobile action bar on catalog views + making the home config-driven.
- Breakpoint `560px` is chosen as the 2→3 column threshold so that at common phone widths (≤414px) users see exactly 2 compact cards (clearly "several per screen"), and larger phones / small tablets get 3. This can be tuned in review without architectural impact.
- Desktop filter UX is intentionally minimal (chips + sort honored via URL); the bottom-sheet is mobile-first per the brief. Full desktop filter panel is a later enhancement, not required now.

---

## Responses to design review (iteration 2)

### Iteration 2 review

Review: `.agents/tasks/design-review.md` (iteration-2 pass) — verdict CHANGES_REQUESTED (2 HIGH, 3 MEDIUM, 4 NIT). Every finding was addressed below; none backlogged or ignored. (NOTE: one iteration-2 decision — unifying search on `normalizeText` — was itself flagged by the iteration-3 review and has since been REVERTED; see the iteration-3 responses, Finding #2, which supersede the iteration-2 #1 response.)

- **#1 (HIGH) — client search did not mirror server search.** ADDRESSED. Verified in source: `buscar.astro` used accent-sensitive `toLocaleLowerCase('es')` while `normalizeText` is accent-insensitive. Adopted the preferred unification: both server (`buscar.astro`) and client (`data-haystack` + controller) now use `normalizeText`. Documented in B1 (new "Search-normalization unification" block), B4, Track C path 3, the Edited-files manifest, and Track H as the single intentional data-logic change. Rationale and the rejected "accept divergence" alternative are stated. **(SUPERSEDED by iteration-3 #2 — reverted to leave the server filter unchanged.)**

- **#2 (HIGH) — home product-strip rendering path ambiguous.** ADDRESSED. Committed: `ProductStripSection.astro` renders a plain `.product-grid` of bare `<ProductCard>` with no `.grid-item`/`hidden`/`js-ready`/controller. The `showControls` prop is **removed** from `CatalogGrid`; `CatalogGrid` is reserved for the three catalog views only. Updated Track F, B3, G3, and the file manifest; the slash and `showControls={false}` mentions are gone.

- **#3 (MEDIUM) — `js-ready` target vs CSS selector.** ADDRESSED. Pinned exact elements: the boot script's first statement adds `js-ready` to BOTH `[data-catalog-root]` (class `catalog-root`) and the `.product-grid` element. Provided the exact CSS (`.product-grid:not(.js-ready) .grid-item{display:block!important}` plus `.catalog-root:not(.js-ready) [data-see-more], .catalog-root:not(.js-ready) .sticky-bar{display:none}`). Rewrote B5 and added the hook/class names in B2.

- **#4 (MEDIUM) — category page "may" hide the category control.** ADDRESSED. Definite rule: `categoria/[slug].astro` passes `categoryFilter={false}`, so the category `<select>` and category chips row are NOT rendered; price/sort/search/progressive-loading still apply to the single-category set. `categoryFilter` is now a `CatalogGrid` prop (default true) threaded into the controller. Updated B3, G3, the controller config in B2, and the file manifest.

- **#5 (MEDIUM) — sticky-bar / header / `?q` interplay.** ADDRESSED. Specified per page in Track C: header form always navigates (`/buscar?q=`); on `productos.astro` + `categoria/[slug].astro` the sticky input is NOT in a navigating form, has `name="q"`, the controller debounce-listens on `input`, and Enter is `preventDefault`ed (filter in place); on `buscar.astro` the sticky input is seeded from `?q` and narrows the server `results` only (narrow-not-broaden), documented explicitly, with broadening available via the header form.

- **#6 (NIT) — "8 cart hooks" imprecise.** ADDRESSED. Replaced with the explicit enumerated list of all 12 cart `data-*` attributes in the Overview and Track H.

- **#7 (NIT) — "three media rules" risked deleting unrelated declarations.** ADDRESSED. A1 now instructs removing ONLY the `.product-grid` fragments from the `900`/`680`/`360` rules and preserving the other selectors inside the `max-width:680` block (`.container`, `.section`, `.section-head`, `.section-head .text-link`).

- **#8 (NIT) — `latest`/`createdAt` empty ordering.** ADDRESSED. Track F now states `resolveFeatured({kind:'latest'})` sorts with `(b.createdAt||'').localeCompare(a.createdAt||'')` (empty sorts last), mirroring `index.astro` byte-for-byte; also notes `SortKey` has no `'latest'` member.

- **#9 (NIT) — "El instagr" inferred.** ADDRESSED (kept conservative, flagged). The Overview now explicitly marks the Instagram/TikTok/WhatsApp preservation as an inference from a truncated line, corroborated by message 3's "Mantén Instagram, TikTok, WhatsApp", to be revisited only if the user clarifies. No implementation change.

### Iteration 3 review (current)

Review: `.agents/tasks/design-review.json` + `.agents/tasks/design-review.md` (iteration-3 pass) — verdict CHANGES_REQUESTED (0 HIGH, 2 MEDIUM, 5 NIT). The reviewer confirmed all seven step-prompt focus areas are specified; the findings below are the remaining blockers/polish. Every finding is **addressed**; none backlogged or ignored. All responses stay inside the original requirements (preserve Supabase/cart/search/products; mobile-first; strict TS; no new deps). Both MEDIUM findings were re-verified against source before changing the design.

- **#1 (MEDIUM) — sticky action bar `top` offset unspecified; mobile header height is dynamic.** ADDRESSED. Re-verified in `Header.astro`: mobile `.topbar{height:auto}` with a two-row layout (`.search{grid-column:1/-1;grid-row:2}`) plus a toggleable `.category-nav`, so there is no fixed header height. Replaced the brittle `top:<header height>` with a concrete controller mechanism (`syncStickyTop()` in Track C): measure `.site-header` via `getBoundingClientRect().height` on init, set `.sticky-bar` `top` to the rounded value, and re-measure on `resize` and on each `[data-nav-toggle]` click (via `requestAnimationFrame`). Documented as a controller responsibility in Track C and added to the B2 init list. No change to `Header.astro`; defensive fallback to `top:0` if the header is absent.

- **#2 (MEDIUM) — changing `buscar.astro` to accent-insensitive contradicts the preserve-search constraint.** ADDRESSED by REVERTING the iteration-2 change. Re-verified the current server filter is accent-sensitive (`q.toLocaleLowerCase('es')` + `.toLocaleLowerCase('es').includes(...)`). `buscar.astro`'s server filter is now left **exactly as today** (no `normalizeText`, no result change). Client/server parity is achieved the non-altering way: the `data-haystack` and the controller match use the SAME accent-sensitive `.toLocaleLowerCase('es')` transform. Updated B1 (rewrote the normalization block), B2 `apply()`, B4 (Search `q` rule), Track C path 3, Track H (now "Search behavior UNCHANGED"), the reuse checklist, and the Edited-files manifest (buscar.astro = structural change only). Accent-insensitive search is flagged as a separate opt-in product decision for the user, not decided here.

- **#3 (NIT) — `content-visibility:auto` committed but unspecified.** ADDRESSED. B0 now specifies it concretely: `.grid-item{content-visibility:auto;contain-intrinsic-size:0 320px}` in `global.css`, with the intrinsic size (~320px, the compact-card height) reserved so off-screen items do not collapse and cause scroll jumpiness. The intrinsic size is called mandatory, not optional.

- **#4 (NIT) — `data-created` emitted but never consumed.** ADDRESSED. `data-created` is **removed** from the `.grid-item` wrapper in B1; the design states `createdAt` is only read server-side by `resolveFeatured` on the home. `CatalogItem`/`SortKey` are unchanged (no `created`/`latest`), so no catalog reader exists and 1000+ dead attributes are avoided.

- **#5 (NIT) — controller config omits `priceFilter`; absent price-input handling unspecified.** ADDRESSED. `priceFilter: boolean` added to `CatalogControllerConfig` (B2), threaded from `config.catalog.priceFilter` and passed by `CatalogGrid`'s boot script (B3). The B2 init list and B4 now state: when `priceFilter` is false OR the min/max inputs are absent, the controller attaches no price listeners and applies no price constraint (explicit null-guard).

- **#6 (NIT) — `data-price` NaN handling described two contradictory ways.** ADDRESSED. Single authoritative rule written in B4 and mirrored verbatim in the error-handling table: a card whose `data-price` parses to `NaN` **always passes** the price filter (never hidden by min/max). The old "treated as price 0 / excluded" wording is gone.

- **#7 (NIT) — header "diagnose/fix" satisfied by static reading only.** ADDRESSED. The Assumptions entry is reworded to the honest scope: header hooks are present and correctly wired **by static inspection**, no defect found by reading so no header change is prescribed, and runtime verification of nav/search/cart/mobile-menu is **deferred to build/manual QA** with any concrete break fixed then. No implementation change.
