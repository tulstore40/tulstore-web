import type { SortKey } from '../lib/siteConfig';

export interface CatalogControllerConfig {
  pageSize: number;
  defaultSort: SortKey;
  categoryFilter: boolean;
  priceFilter: boolean;
}

export interface CatalogJsonProduct {
  id: string;
  ref: string;
  name: string;
  slug: string;
  color: string;
  price: number;
  cat: string;
  catSlug: string;
  img: string;
  idx: number;
}

interface FilterState {
  q: string;
  cat: string;
  min: number;
  max: number;
  sort: SortKey;
}

const SORT_KEYS: readonly SortKey[] = ['relevancia', 'precio-asc', 'precio-desc', 'nombre'];

export function isSortKey(value: unknown): value is SortKey {
  return typeof value === 'string' && (SORT_KEYS as readonly string[]).includes(value);
}

const money = (value: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);

function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
  return (str || '').replace(/"/g, '&quot;');
}

function parseBound(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return NaN;
  const n = Number(trimmed);
  if (Number.isNaN(n) || n < 0) return NaN;
  return n;
}

function renderProductCardHtml(p: CatalogJsonProduct): string {
  const subtitle = [p.ref, p.color].filter(Boolean).join(' · ');
  const waMsg = `Hola Tulstore, me interesa ${p.name} (${p.ref || p.id}) por ${money(p.price)}.`;
  const cartPayload = JSON.stringify({
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: p.price,
    image: p.img,
    ref: p.ref,
  });

  return `
    <div class="grid-item" data-id="${p.id}">
      <article class="product-card">
        <a class="image-wrap" href="/producto/${p.slug}" aria-label="Ver detalle de ${escapeHtml(p.name)}">
          <img
            src="${p.img}"
            alt="${escapeHtml(p.name)}"
            loading="lazy"
            decoding="async"
            width="360"
            height="360"
            onerror="this.onerror=null;this.src='/images/tulstore-logo.png';this.style.objectFit='contain';"
          />
        </a>
        <div class="card-content">
          <div class="card-meta">
            ${subtitle ? `<span class="ref-color">${escapeHtml(subtitle)}</span>` : '<span class="ref-color">&nbsp;</span>'}
            <a class="product-title" href="/producto/${p.slug}" title="${escapeHtml(p.name)}">
              ${escapeHtml(p.name)}
            </a>
          </div>
          <div class="card-footer">
            <div class="price-val">${money(p.price)}</div>
            <div class="action-buttons">
              <a
                class="btn-icon-wa"
                href="https://wa.me/573182022859?text=${encodeURIComponent(waMsg)}"
                target="_blank"
                rel="noopener"
                aria-label="Consultar ${escapeHtml(p.name)} por WhatsApp"
                title="Consultar por WhatsApp"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                  <path d="M12 2.3a9.6 9.6 0 0 0-8.2 14.5L2.3 21.7l4.9-1.3A9.6 9.6 0 1 0 12 2.3zm0 1.8a7.8 7.8 0 0 1 6.6 12 7.8 7.8 0 0 1-9.8 2.4l-.4-.2-2.9.8.8-2.8-.2-.4A7.8 7.8 0 0 1 12 4.1zm-2.9 3.6c-.2 0-.5.1-.7.3-.3.3-.9.9-.9 2.1s.9 2.5 1 2.6c.1.2 1.8 2.8 4.4 3.8 2.2.9 2.6.7 3.1.6.5 0 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.6-.3c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-.3-.1-1.1-.4-2-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5l.4-.4c.1-.2.2-.3.2-.5l.1-.4c0-.2 0-.3-.1-.4l-.7-1.7c-.2-.4-.4-.4-.6-.4h-.1z"/>
                </svg>
              </a>
              <button
                type="button"
                class="btn-add-cart"
                data-add-cart
                data-product="${escapeAttr(cartPayload)}"
                aria-label="Agregar ${escapeHtml(p.name)} al carrito"
              >
                <svg class="cart-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>
                </svg>
                <span class="btn-text">Agregar</span>
              </button>
            </div>
          </div>
        </div>
      </article>
    </div>
  `;
}

export function sortProducts(items: CatalogJsonProduct[], key: SortKey): CatalogJsonProduct[] {
  const copy = items.slice();
  switch (key) {
    case 'precio-asc':
      copy.sort((a, b) => a.price - b.price || a.idx - b.idx);
      break;
    case 'precio-desc':
      copy.sort((a, b) => b.price - a.price || a.idx - b.idx);
      break;
    case 'nombre':
      copy.sort((a, b) => a.name.localeCompare(b.name, 'es') || a.idx - b.idx);
      break;
    case 'relevancia':
    default:
      copy.sort((a, b) => a.idx - b.idx);
      break;
  }
  return copy;
}

export function initCatalog(root: HTMLElement, config: CatalogControllerConfig): void {
  const grid = root.querySelector<HTMLElement>('[data-catalog-grid]');
  root.classList.add('js-ready');
  if (!grid) return;

  // Read the embedded master catalog data
  let allProducts: CatalogJsonProduct[] = [];
  const scriptDataEl = root.querySelector<HTMLScriptElement>('#catalog-products-json');
  if (scriptDataEl?.textContent) {
    try {
      allProducts = JSON.parse(scriptDataEl.textContent);
    } catch (e) {
      console.error('Failed to parse catalog products JSON:', e);
    }
  }

  // Fallback: If no JSON element exists, read from DOM
  if (!allProducts.length) {
    const itemEls = Array.from(grid.querySelectorAll<HTMLElement>('.grid-item'));
    allProducts = itemEls.map((el, idx) => ({
      id: el.dataset.id || String(idx),
      ref: '',
      name: el.querySelector('.product-title')?.textContent?.trim() || '',
      slug: '',
      color: '',
      price: Number(el.dataset.price) || 0,
      cat: el.dataset.cat || '',
      catSlug: el.dataset.cat || '',
      img: el.querySelector('img')?.src || '',
      idx,
    }));
  }

  // Precompute searchable haystacks for instant in-memory search
  const haystacks = new Map<string, string>();
  for (const p of allProducts) {
    haystacks.set(p.id, `${p.name} ${p.ref} ${p.color} ${p.cat}`.toLocaleLowerCase('es'));
  }

  // Responsive column calculation
  function getGridCols(): number {
    if (!grid) return 2;
    const computed = window.getComputedStyle(grid).gridTemplateColumns;
    if (!computed || computed === 'none') return 2;
    const count = computed.split(' ').filter(Boolean).length;
    return count > 0 ? count : 2;
  }

  function getBatchSize(): number {
    const cols = getGridCols();
    const base = config.pageSize > 0 ? config.pageSize : 24;
    return Math.max(cols * 4, Math.ceil(base / cols) * cols);
  }

  // Controls
  const searchInput = root.querySelector<HTMLInputElement>('[data-catalog-search]');
  const seeMoreBtn = root.querySelector<HTMLButtonElement>('[data-see-more]');
  const seeMoreWrap = root.querySelector<HTMLElement>('[data-see-more-wrap]');
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

  // URL seed state
  const params = new URLSearchParams(window.location.search);
  const initialSort = params.get('sort');
  const state: FilterState = {
    q: (params.get('q') ?? '').trim(),
    cat: config.categoryFilter ? (params.get('cat') ?? '').trim() : '',
    min: config.priceFilter ? parseBound(params.get('min') ?? '') : NaN,
    max: config.priceFilter ? parseBound(params.get('max') ?? '') : NaN,
    sort: isSortKey(initialSort) ? initialSort : config.defaultSort,
  };

  if (searchInput && state.q) searchInput.value = state.q;
  if (catSelect && state.cat) catSelect.value = state.cat;
  if (minInput && !Number.isNaN(state.min)) minInput.value = String(state.min);
  if (maxInput && !Number.isNaN(state.max)) maxInput.value = String(state.max);
  if (sortSelect) sortSelect.value = state.sort;

  let cursor = getBatchSize();
  let filtered: CatalogJsonProduct[] = allProducts;

  const activeFilterCount = (): number => {
    let n = 0;
    if (config.categoryFilter && state.cat) n += 1;
    if (config.priceFilter && !Number.isNaN(state.min)) n += 1;
    if (config.priceFilter && !Number.isNaN(state.max)) n += 1;
    if (state.sort !== config.defaultSort) n += 1;
    return n;
  };

  const updateSeeMoreUi = () => {
    const total = filtered.length;
    const remaining = total - Math.min(cursor, total);

    if (countEl) {
      countEl.textContent = `${total} producto${total === 1 ? '' : 's'}`;
    }

    if (emptyEl) {
      emptyEl.hidden = total !== 0;
      emptyEl.style.display = total === 0 ? 'block' : 'none';
    }

    if (grid) {
      grid.style.display = total === 0 ? 'none' : 'grid';
    }

    if (remaining > 0 && total > 0) {
      if (seeMoreBtn) {
        seeMoreBtn.hidden = false;
        seeMoreBtn.style.display = 'inline-flex';
        seeMoreBtn.textContent = `Ver más (${remaining})`;
      }
      if (seeMoreWrap) {
        seeMoreWrap.hidden = false;
        seeMoreWrap.style.display = 'flex';
      }
    } else {
      if (seeMoreBtn) {
        seeMoreBtn.hidden = true;
        seeMoreBtn.style.display = 'none';
      }
      if (seeMoreWrap) {
        seeMoreWrap.hidden = true;
        seeMoreWrap.style.display = 'none';
      }
    }

    if (filterCountBadge) {
      const n = activeFilterCount();
      filterCountBadge.textContent = n > 0 ? String(n) : '';
      filterCountBadge.hidden = n === 0;
    }
  };

  // Render current slice into DOM
  const renderFromScratch = () => {
    const slice = filtered.slice(0, cursor);
    grid.innerHTML = slice.map(renderProductCardHtml).join('');
    updateSeeMoreUi();
  };

  // Append next batch without recreating existing DOM
  const appendNextBatch = () => {
    const batchSize = getBatchSize();
    const nextBatch = filtered.slice(cursor, cursor + batchSize);
    if (!nextBatch.length) return;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = nextBatch.map(renderProductCardHtml).join('');
    while (tempDiv.firstChild) {
      grid.appendChild(tempDiv.firstChild);
    }

    cursor += nextBatch.length;
    updateSeeMoreUi();
  };

  const filterAndApply = () => {
    const query = state.q.toLocaleLowerCase('es');
    filtered = allProducts.filter((p) => {
      if (query) {
        const h = haystacks.get(p.id) || '';
        if (!h.includes(query)) return false;
      }
      if (config.categoryFilter && state.cat) {
        if (p.catSlug !== state.cat && p.cat !== state.cat) return false;
      }
      if (config.priceFilter) {
        if (!Number.isNaN(state.min) && p.price < state.min) return false;
        if (!Number.isNaN(state.max) && p.price > state.max) return false;
      }
      return true;
    });

    filtered = sortProducts(filtered, state.sort);
    cursor = getBatchSize();
    renderFromScratch();
  };

  // "Ver más" Click Handler
  seeMoreBtn?.addEventListener('click', () => {
    appendNextBatch();
  });

  // Responsive resize handler: Aligns visible items to current columns
  window.addEventListener('resize', () => {
    const cols = getGridCols();
    const currentCount = grid.querySelectorAll('.grid-item').length;
    const aligned = Math.ceil(currentCount / cols) * cols;
    if (aligned > currentCount && aligned <= filtered.length) {
      const extra = filtered.slice(currentCount, aligned);
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = extra.map(renderProductCardHtml).join('');
      while (tempDiv.firstChild) {
        grid.appendChild(tempDiv.firstChild);
      }
      cursor = aligned;
      updateSeeMoreUi();
    }
  });

  // Search input debounced
  let searchTimer: number | undefined;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        state.q = searchInput.value.trim();
        filterAndApply();
      }, 120);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') e.preventDefault();
    });
  }

  // Category chips
  const syncChips = () => {
    for (const chip of chips) {
      const value = chip.dataset.filterChip ?? '';
      const active = (value === '' && state.cat === '') || (value !== '' && value === state.cat);
      chip.classList.toggle('active', active);
      chip.setAttribute('aria-pressed', String(active));
    }
  };

  if (config.categoryFilter) {
    for (const chip of chips) {
      chip.addEventListener('click', () => {
          const value = chip.dataset.filterChip ?? '';
        state.cat = value;
        if (catSelect) catSelect.value = state.cat;
        syncChips();
        filterAndApply();
      });
    }
  }

  // Bottom-sheet accessibility and events
  const openSheet = () => {
    if (!sheet) return;
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    sheetOverlay?.classList.add('open');
    filterOpenBtn?.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  };

  const closeSheet = () => {
    if (!sheet) return;
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    sheetOverlay?.classList.remove('open');
    filterOpenBtn?.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  };

  filterOpenBtn?.addEventListener('click', openSheet);
  closeBtn?.addEventListener('click', closeSheet);
  sheetOverlay?.addEventListener('click', closeSheet);

  sheet?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheet();
  });

  applyBtn?.addEventListener('click', () => {
    if (config.categoryFilter && catSelect) state.cat = catSelect.value.trim();
    if (config.priceFilter) {
      state.min = parseBound(minInput?.value ?? '');
      state.max = parseBound(maxInput?.value ?? '');
      if (!Number.isNaN(state.min) && !Number.isNaN(state.max) && state.min > state.max) {
        const tmp = state.min;
        state.min = state.max;
        state.max = tmp;
      }
    }
    if (sortSelect && isSortKey(sortSelect.value)) state.sort = sortSelect.value;
    syncChips();
    filterAndApply();
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
    filterAndApply();
  });

  syncChips();

  // If there are initial query params, apply them immediately; otherwise preserve SSR cards and update UI
  if (state.q || state.cat || !Number.isNaN(state.min) || !Number.isNaN(state.max) || state.sort !== config.defaultSort) {
    filterAndApply();
  } else {
    // Initial state: SSR already rendered the first 24 cards; just set the "Ver más" remaining counter!
    cursor = Math.min(getBatchSize(), allProducts.length);
    updateSeeMoreUi();
  }
}
