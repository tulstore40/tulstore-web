import type { SortKey } from '../lib/siteConfig';

export interface CatalogControllerConfig {
  pageSize: number; // from siteConfig.catalog.pageSize (default 32)
  defaultSort: SortKey; // from siteConfig.catalog.defaultSort ('relevancia')
  categoryFilter: boolean; // from the CatalogGrid categoryFilter prop
  priceFilter: boolean; // from siteConfig.catalog.priceFilter
}

interface CatalogItem {
  el: HTMLElement; // the .grid-item
  cat: string;
  price: number;
  name: string;
  haystack: string;
  domIndex: number; // original order = 'relevancia'
}

interface FilterState {
  q: string;
  cat: string;
  min: number; // NaN = unset
  max: number; // NaN = unset
  sort: SortKey;
}

const SORT_KEYS: readonly SortKey[] = ['relevancia', 'precio-asc', 'precio-desc', 'nombre'];

export function isSortKey(value: unknown): value is SortKey {
  return typeof value === 'string' && (SORT_KEYS as readonly string[]).includes(value);
}

// Pure predicate: does an item pass the active filters?
// NaN price (malformed data-price) always PASSES the price filter.
export function matchesFilters(
  item: CatalogItem,
  state: FilterState,
  config: CatalogControllerConfig,
): boolean {
  if (state.q) {
    // Mirror the server's accent-SENSITIVE filter exactly (toLocaleLowerCase('es')).
    if (!item.haystack.includes(state.q.toLocaleLowerCase('es'))) return false;
  }
  if (config.categoryFilter && state.cat) {
    if (item.cat !== state.cat) return false;
  }
  if (config.priceFilter) {
    if (!Number.isNaN(item.price)) {
      if (!Number.isNaN(state.min) && item.price < state.min) return false;
      if (!Number.isNaN(state.max) && item.price > state.max) return false;
    }
  }
  return true;
}

// Pure: returns a new array sorted by the given key. 'relevancia' = original DOM order.
export function sortItems(items: CatalogItem[], key: SortKey): CatalogItem[] {
  const copy = items.slice();
  switch (key) {
    case 'precio-asc':
      copy.sort((a, b) => a.price - b.price || a.domIndex - b.domIndex);
      break;
    case 'precio-desc':
      copy.sort((a, b) => b.price - a.price || a.domIndex - b.domIndex);
      break;
    case 'nombre':
      copy.sort((a, b) => a.name.localeCompare(b.name, 'es') || a.domIndex - b.domIndex);
      break;
    case 'relevancia':
    default:
      copy.sort((a, b) => a.domIndex - b.domIndex);
      break;
  }
  return copy;
}

function parseBound(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return NaN;
  const n = Number(trimmed);
  if (Number.isNaN(n) || n < 0) return NaN;
  return n;
}

export function initCatalog(root: HTMLElement, config: CatalogControllerConfig): void {
  const grid = root.querySelector<HTMLElement>('.product-grid');
  // Progressive-enhancement gate: reveal everything if boot runs, chrome shown.
  root.classList.add('js-ready');
  grid?.classList.add('js-ready');
  if (!grid) return;

  const itemEls = Array.from(grid.querySelectorAll<HTMLElement>('.grid-item'));
  const items: CatalogItem[] = itemEls.map((el, domIndex) => ({
    el,
    cat: el.dataset.cat ?? '',
    price: Number(el.dataset.price),
    name: el.dataset.name ?? '',
    haystack: el.dataset.haystack ?? '',
    domIndex,
  }));

  // Sticky bar top sync.
  // The site header is NO LONGER sticky/fixed: it scrolls away with the page.
  // So the mobile catalog bar sticks to the viewport top (top:0) with no header
  // offset to reserve — reserving the header height would leave a large gap once
  // the header has scrolled off. We still measure the header: if it is ever
  // pinned again (position:sticky/fixed) we offset by its height; otherwise 0.
  const headerEl = document.querySelector<HTMLElement>('.site-header');
  const barEl = root.querySelector<HTMLElement>('.sticky-bar');
  const syncStickyTop = () => {
    let top = 0;
    if (headerEl) {
      const pos = getComputedStyle(headerEl).position;
      if (pos === 'sticky' || pos === 'fixed') {
        top = Math.round(headerEl.getBoundingClientRect().height);
      }
    }
    barEl?.style.setProperty('top', `${top}px`);
  };
  syncStickyTop();
  window.addEventListener('resize', syncStickyTop);
  headerEl
    ?.querySelector('[data-nav-toggle]')
    ?.addEventListener('click', () => requestAnimationFrame(syncStickyTop));

  // Control references.
  const searchInput = root.querySelector<HTMLInputElement>('[data-catalog-search]');
  const seeMoreBtn = root.querySelector<HTMLButtonElement>('[data-see-more]');
  const emptyEl = root.querySelector<HTMLElement>('[data-catalog-empty]');
  const countEl = root.querySelector<HTMLElement>('[data-catalog-count]');
  const catSelect = root.querySelector<HTMLSelectElement>('[data-filter-cat]');
  const minInput = config.priceFilter ? root.querySelector<HTMLInputElement>('[data-filter-min]') : null;
  const maxInput = config.priceFilter ? root.querySelector<HTMLInputElement>('[data-filter-max]') : null;
  const sortSelect = root.querySelector<HTMLSelectElement>('[data-filter-sort]');
  const chips = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-filter-chip]'));
  const filterOpenBtn = root.querySelector<HTMLButtonElement>('[data-filter-open]');
  const filterCountBadge = root.querySelector<HTMLElement>('[data-filter-count]');
  const sheet = root.querySelector<HTMLElement>('[data-filter-sheet]');
  const sheetOverlay = root.querySelector<HTMLElement>('[data-filter-overlay]');
  const closeBtn = root.querySelector<HTMLButtonElement>('[data-filter-close]');
  const applyBtn = root.querySelector<HTMLButtonElement>('[data-filter-apply]');
  const clearBtn = root.querySelector<HTMLButtonElement>('[data-filter-clear]');

  // Seed initial state from URL query params.
  const params = new URLSearchParams(window.location.search);
  const initialSort = params.get('sort');
  const state: FilterState = {
    q: (params.get('q') ?? '').trim(),
    cat: config.categoryFilter ? (params.get('cat') ?? '').trim() : '',
    min: config.priceFilter ? parseBound(params.get('min') ?? '') : NaN,
    max: config.priceFilter ? parseBound(params.get('max') ?? '') : NaN,
    sort: isSortKey(initialSort) ? initialSort : config.defaultSort,
  };

  // Seed controls from state.
  if (searchInput && state.q) searchInput.value = state.q;
  if (catSelect && state.cat) catSelect.value = state.cat;
  if (minInput && !Number.isNaN(state.min)) minInput.value = String(state.min);
  if (maxInput && !Number.isNaN(state.max)) maxInput.value = String(state.max);
  if (sortSelect) sortSelect.value = state.sort;

  let cursor = config.pageSize;
  let filtered: CatalogItem[] = [];

  const activeFilterCount = (): number => {
    let n = 0;
    if (config.categoryFilter && state.cat) n += 1;
    if (config.priceFilter && !Number.isNaN(state.min)) n += 1;
    if (config.priceFilter && !Number.isNaN(state.max)) n += 1;
    if (state.sort !== config.defaultSort) n += 1;
    return n;
  };

  const render = () => {
    // Reveal first `cursor` filtered items, hide the rest.
    for (const item of items) item.el.hidden = true;
    filtered.forEach((item, index) => {
      if (index < cursor) {
        item.el.hidden = false;
        item.el.style.order = String(index);
      }
    });

    const total = filtered.length;
    if (countEl) {
      countEl.textContent = `${total} producto${total === 1 ? '' : 's'}`;
    }
    if (emptyEl) emptyEl.hidden = total !== 0;
    if (grid) grid.hidden = total === 0;

    if (seeMoreBtn) {
      const remaining = total - Math.min(cursor, total);
      if (remaining > 0) {
        seeMoreBtn.hidden = false;
        seeMoreBtn.textContent = `Ver más (${remaining})`;
      } else {
        seeMoreBtn.hidden = true;
      }
    }

    if (filterCountBadge) {
      const n = activeFilterCount();
      filterCountBadge.textContent = n > 0 ? String(n) : '';
      filterCountBadge.hidden = n === 0;
    }
  };

  const apply = () => {
    const subset = items.filter((item) => matchesFilters(item, state, config));
    filtered = sortItems(subset, state.sort);
    cursor = config.pageSize; // reset pagination on every filter change
    render();
  };

  // "Ver más": reveal the next page of the current filtered set.
  seeMoreBtn?.addEventListener('click', () => {
    cursor += config.pageSize;
    render();
  });

  // Debounced in-place search (no navigation).
  let searchTimer: number | undefined;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        state.q = searchInput.value.trim();
        apply();
      }, 150);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') e.preventDefault();
    });
  }

  // Category chips (filter in place).
  const syncChips = () => {
    for (const chip of chips) {
      const value = chip.dataset.filterChip ?? '';
      const active = value === state.cat;
      chip.classList.toggle('active', active);
      chip.setAttribute('aria-pressed', String(active));
    }
  };
  if (config.categoryFilter) {
    for (const chip of chips) {
      chip.addEventListener('click', () => {
        const value = chip.dataset.filterChip ?? '';
        state.cat = state.cat === value ? '' : value;
        if (catSelect) catSelect.value = state.cat;
        syncChips();
        apply();
      });
    }
  }

  // Bottom-sheet accessibility.
  let lastFocused: HTMLElement | null = null;
  const focusables = (): HTMLElement[] => {
    if (!sheet) return [];
    return Array.from(
      sheet.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
  };
  const openSheet = () => {
    if (!sheet) return;
    lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    sheetOverlay?.classList.add('open');
    filterOpenBtn?.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    const first = focusables()[0] ?? closeBtn;
    first?.focus();
  };
  const closeSheet = () => {
    if (!sheet) return;
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    sheetOverlay?.classList.remove('open');
    filterOpenBtn?.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    lastFocused?.focus();
  };
  filterOpenBtn?.addEventListener('click', openSheet);
  closeBtn?.addEventListener('click', closeSheet);
  sheetOverlay?.addEventListener('click', closeSheet);
  sheet?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSheet();
      return;
    }
    if (e.key === 'Tab') {
      const f = focusables();
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  // Apply / Clear read the sheet controls into state.
  applyBtn?.addEventListener('click', () => {
    if (config.categoryFilter && catSelect) state.cat = catSelect.value.trim();
    if (config.priceFilter) {
      state.min = parseBound(minInput?.value ?? '');
      state.max = parseBound(maxInput?.value ?? '');
      // Defensive: swap if min > max.
      if (!Number.isNaN(state.min) && !Number.isNaN(state.max) && state.min > state.max) {
        const tmp = state.min;
        state.min = state.max;
        state.max = tmp;
      }
    }
    if (sortSelect && isSortKey(sortSelect.value)) state.sort = sortSelect.value;
    syncChips();
    apply();
    closeSheet();
  });
  clearBtn?.addEventListener('click', () => {
    state.cat = '';
    state.min = NaN;
    state.max = NaN;
    state.sort = config.defaultSort;
    if (catSelect) catSelect.value = '';
    if (minInput) minInput.value = '';
    if (maxInput) maxInput.value = '';
    if (sortSelect) sortSelect.value = config.defaultSort;
    syncChips();
    apply();
  });

  syncChips();
  apply();
}
