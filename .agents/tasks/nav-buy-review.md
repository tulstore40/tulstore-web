# Catalog category bar + buy-button UX refinement

The change restyles the site category navigation into a compact light bar with a clear active state, restores a cart icon + "Agregar" label on the product card button, and splits add-to-cart feedback by device so mobile shows a toast instead of popping the drawer. Three source files are touched (`Header.astro`, `ProductCard.astro`, `BaseLayout.astro`); Supabase/data access, the catalog controller, the catalog grid, and the search filter are untouched. The build evidence records `astro check` at 0 errors / 0 warnings and a successful SSR build, with no `@ts-nocheck` and no new dependencies.

Watch for: HEAD is `d5c6ec7`, not `5e8bc79` as the task spec stated — but that is because the prior "Optimize mobile layout" pass was committed before this task; this task's work is correctly uncommitted on top of it (confirmed). This is not a leaked commit. (confirmed)

**Verdict**: APPROVED

## High-level view

The category bar moves from a sparse navy strip to a filled light bar (`background:var(--paper)`) sitting under the navy topbar, opening with a "Categorías" lead label, then `Todos`, then six main-category pill chips and a "Más ▾" overflow dropdown. Active state is derived presentationally from `Astro.url.pathname` — the matching `/categoria/<slug>` chip (or `Todos` on `/productos`) gets `.active` + `aria-current="page"` with teal fill. On mobile the bar is always visible as a single low-height horizontal touch-scroll rather than hidden behind a hamburger; the hamburger button and its `.open` toggle were removed, and the controller's reference to `[data-nav-toggle]` is optional-chained so its absence is harmless.

The product card add button now holds a cart `<svg>` plus `<span>Agregar</span>`, flexing to take available width (`flex:1 1 auto`) with the WhatsApp button kept as a fixed-width icon beside it. Button height stays 36px mobile / 42px desktop and the label ellipsizes, so cards don't grow taller; the `.product-grid` ladder in `global.css` is untouched, keeping 3 columns at 360/390px and 4 at ≥430px. `data-add-cart` and the exact `data-product` JSON are preserved on the button.

Add-to-cart behavior now gates on `window.matchMedia('(min-width: 900px)')`: desktop still auto-opens the drawer, mobile fires a brief `[data-cart-toast]` snackbar while the count badge still bumps through `renderCart`. The 900px gate aligns with the CatalogGrid sticky-bar breakpoint (`max-width:899px`), so "mobile catalog" and "mobile toast" agree. The rest of the cart script — `CartItem` type, the eleven other cart `data-*` hooks, `renderCart`, `openCart`/`closeCart`, checkout, and the WhatsApp checkout URL — is unchanged, and the drawer remains openable on mobile via `[data-cart-open]`.

Footer socials remain a single horizontal row with the exact Instagram/TikTok/WhatsApp URLs preserved. The catalog controller (filters, sort, search, 32+Ver más, bottom-sheet, `syncStickyTop`) and the siteConfig/home architecture are not in the diff.

<details>
<summary>Issues (0)</summary>

No blocking or non-blocking findings. All verification items passed.

</details>

<details>
<summary>Details</summary>

### 1. Data/search layer untouched

`git status --short` lists only `src/components/Header.astro`, `src/components/ProductCard.astro`, `src/layouts/BaseLayout.astro` (plus the verification note). `src/lib/catalog.ts` and `src/pages/buscar.astro` are not in the working tree, so Supabase access, types, image logic, and the server-side search filter are untouched. (confirmed)

### 2. Cart script scoped to the add branch

The only functional change in `BaseLayout.astro`'s cart script is inside the `data-add-cart` handler: `setCart(cart)` is unchanged and `openCart()` became `if(isDesktop()){ openCart(); } else { showToast(); }`. The surrounding branches — `[data-cart-open]` → `openCart()`, `[data-cart-close]`/`[data-cart-overlay]` → `closeCart()`, and the plus/minus/remove handler — are byte-identical in the diff. `CartItem`, `getCart`/`setCart`, `renderCart`, `openCart`/`closeCart`, checkout, and the `data-product` JSON parse (`Omit<CartItem,'qty'>`) are intact. The additions outside the branch are confined to the toast: one `[data-cart-toast]` element, the `isDesktop`/`showToast` helpers, and `.cart-toast` CSS. No leakage beyond the add branch plus the toast scaffolding. (confirmed)

### 3. Strict TS + clean build

The verification note records `astro check` at 0 errors / 0 warnings / 0 hints across 22 files and a successful SSR build. The new TS is strictly typed (`querySelector<HTMLElement>`, numeric `toastTimer`), no `@ts-nocheck` appears in the diff, and no library was added. Build evidence is present and internally consistent; no spot-check warranted. (confirmed)

### 4. Category bar

Desktop: `.category-nav` is now `background:var(--paper)` — a filled light bar, not the old sparse navy strip. It opens with a `.cat-lead` "Categorías" label, then `Todos`, then six `.cat-chip` pills, then a `.more-cats` "Más ▾" dropdown for overflow. Active state is derived from `Astro.url.pathname` (`activeSlug`/`todosActive`), applying `.active` (teal fill) + `aria-current="page"`; overflow items in the dropdown get `.active` too. The `[data-more-toggle]`/`[data-more-menu]` dropdown logic (keyboard Escape + outside-click close) is retained.

Mobile (`max-width:680px`): the bar stays a single low-height horizontal touch-scroll, always visible — the `[data-nav-toggle]` hamburger and `.category-nav.open` reveal were removed, so categories are no longer hidden behind a menu. The dropdown opens as a fixed left/right-anchored sheet (`position:fixed;left:10px;right:10px`) to avoid horizontal overflow. The controller's `headerEl?.querySelector('[data-nav-toggle]')?.addEventListener(...)` is fully optional-chained, so the removed button simply skips listener attachment. CatalogGrid's `[data-filter-chip]` in-place filter is a separate system and is not touched. (confirmed)

### 5. Product card buy button

The `.add` button now contains a cart `<svg>` followed by `<span>Agregar</span>`. `data-add-cart` and the exact `data-product` JSON (`id,slug,name,price,image,ref`) are unchanged. `.add` is `flex:1 1 auto` with a compact legible label (`.76rem` mobile, `.9rem` desktop) and ellipsis; `.wa` stays a fixed-width icon button (36px mobile / 42px desktop). Heights stay 36px mobile / 42px desktop, so cards don't grow taller. The `.product-grid` ladder in `global.css` is unchanged (3 cols base, 4 at ≥430px, 5 at ≥1280px). Price (`.price`) is unchanged and visible. (confirmed)

### 6. Add-to-cart behavior by device

`isDesktop = window.matchMedia('(min-width: 900px)').matches`. Mobile add pushes/increments the cart, calls `setCart` (which re-renders the count badge), and fires `showToast()` without opening the drawer; desktop opens the drawer. The 900px gate matches CatalogGrid's `max-width:899px` sticky-bar breakpoint, so the "mobile catalog" and "mobile toast" boundaries agree. The drawer stays openable on mobile via `[data-cart-open]`. The toast is one vanilla element with a CSS transition — no library. (confirmed)

### 7. Footer socials

`.socials` renders Instagram, TikTok, and WhatsApp as inline-SVG links in one horizontal row, with the exact URLs preserved: Instagram `https://www.instagram.com/tulstore_?stkn=MWFoNm1ydWZ5MDVzMQ==`, TikTok `https://www.tiktok.com/@tulstore6?_r=1&_t=ZS-9AE3WCBkWkm`, WhatsApp `https://wa.me/573182022859`. Not changed by this diff. (confirmed)

### 8. Catalog controller + home architecture

`src/scripts/catalog-controller.ts` is not in the working tree; its filters/sort/search/32+Ver más/bottom-sheet and `syncStickyTop` are intact (and `syncStickyTop` still reads the non-sticky `.site-header`, which keeps `position:relative`). The siteConfig/home component architecture is not in the diff. (confirmed)

### 9. No commit made

`git status --short` shows the three source files plus the note as modified-but-unstaged; `git rev-parse HEAD` is `d5c6ec7`. The task spec expected `5e8bc79`, but `git log` shows `d5c6ec7` ("Optimize Tulstore mobile layout and visual design") is the commit directly on top of `5e8bc79` from the prior task pass — this task's edits sit uncommitted on `d5c6ec7`. No `git add`/commit was run for this task. The no-commit requirement is satisfied. (confirmed)

</details>

<details>
<summary>File map</summary>

- `src/components/Header.astro` — category bar restyled to compact light pill bar with pathname-derived active state; hamburger toggle removed; mobile dropdown becomes fixed sheet.
- `src/components/ProductCard.astro` — add button regains cart icon + "Agregar" label; compact flex layout, heights unchanged.
- `src/layouts/BaseLayout.astro` — add-to-cart gated by `matchMedia(900px)`: desktop opens drawer, mobile shows toast; toast element + CSS added.
- `.agents/tasks/verification-note.md` — coder's build/git evidence.

Full diff: `git diff -- src/components/Header.astro src/components/ProductCard.astro src/layouts/BaseLayout.astro`

</details>
