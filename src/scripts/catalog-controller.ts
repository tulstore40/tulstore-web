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

function parseBound(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return NaN;
  const n = Number(trimmed);
  if (Number.isNaN(n) || n < 0) return NaN;
  return n;
}

/**
 * Crea una tarjeta CLONANDO la plantilla que Astro renderiza con ProductCard.astro
 * (<template data-card-template>) y rellenando solo los datos del producto.
 *
 * Por qué: los estilos de ProductCard.astro están encapsulados (data-astro-cid-*). Un HTML
 * armado a mano con strings no lleva ese atributo y la tarjeta aparece sin estilos (iconos SVG
 * gigantes, etc.). Al clonar la misma estructura, las tarjetas iniciales y las dinámicas son
 * idénticas por construcción. Los datos se asignan con textContent/atributos (sin innerHTML).
 */
export function createProductCard(tpl: HTMLTemplateElement, p: CatalogJsonProduct): HTMLElement {
  const proto = tpl.content.firstElementChild;
  if (!proto) throw new Error('Plantilla de tarjeta vacía (data-card-template).');
  const item = proto.cloneNode(true) as HTMLElement;
  item.dataset.id = p.id;

  const href = `/producto/${p.slug}`;
  const subtitle = [p.ref, p.color].filter(Boolean).join(' · ');

  item.querySelectorAll<HTMLAnchorElement>('[data-card-link]').forEach((a) => {
    a.href = href;
  });
  item
    .querySelector<HTMLAnchorElement>('[data-card-link]:not([data-card-title])')
    ?.setAttribute('aria-label', `Ver detalle de ${p.name}`);

  const title = item.querySelector<HTMLElement>('[data-card-title]');
  if (title) {
    title.textContent = p.name;
    title.title = p.name;
  }

  const img = item.querySelector<HTMLImageElement>('[data-card-img]');
  if (img) {
    img.alt = p.name;
    img.src = p.img;
  }

  const ref = item.querySelector<HTMLElement>('[data-card-ref]');
  if (ref) ref.textContent = subtitle || '\u00a0';

  const price = item.querySelector<HTMLElement>('[data-card-price]');
  if (price) price.textContent = money(p.price);

  const wa = item.querySelector<HTMLAnchorElement>('[data-card-wa]');
  if (wa) {
    const msg = `Hola Tulstore, me interesa ${p.name} (${p.ref || p.id}) por ${money(p.price)}.`;
    wa.href = `https://wa.me/573182022859?text=${encodeURIComponent(msg)}`;
    wa.setAttribute('aria-label', `Consultar ${p.name} por WhatsApp`);
  }

  const add = item.querySelector<HTMLButtonElement>('[data-card-add]');
  if (add) {
    add.dataset.product = JSON.stringify({
      id: p.id,
      slug: p.slug,
      name: p.name,
      price: p.price,
      image: p.img,
      ref: p.ref,
    });
    add.setAttribute('aria-label', `Agregar ${p.name} al carrito`);
  }

  return item;
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

  const cardTemplate = root.querySelector<HTMLTemplateElement>('template[data-card-template]');
  if (!cardTemplate?.content.firstElementChild) {
    console.error('Catálogo: falta <template data-card-template>; no se pueden crear más tarjetas.');
    return;
  }
  const buildCards = (items: CatalogJsonProduct[]): DocumentFragment => {
    const frag = document.createDocumentFragment();
    for (const p of items) frag.appendChild(createProductCard(cardTemplate, p));
    return frag;
  };

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
    grid.replaceChildren(buildCards(slice));
    updateSeeMoreUi();
  };

  // Append next batch without recreating existing DOM
  const appendNextBatch = () => {
    const batchSize = getBatchSize();
    const nextBatch = filtered.slice(cursor, cursor + batchSize);
    if (!nextBatch.length) return;

    grid.appendChild(buildCards(nextBatch));

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
      grid.appendChild(buildCards(extra));
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
  const scrollChipToCenter = (chip: HTMLElement, smooth = true) => {
    const container = chip.closest<HTMLElement>('.chips-scroll');
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    if (containerRect.width === 0 || chipRect.width === 0) return;
    const relativeLeft = chipRect.left - containerRect.left;
    const delta = relativeLeft + (chipRect.width / 2) - (container.clientWidth / 2);
    const targetScrollLeft = container.scrollLeft + delta;
    const maxScrollLeft = container.scrollWidth - container.clientWidth;
    const clamped = Math.max(0, Math.min(targetScrollLeft, maxScrollLeft));
    if (Math.abs(container.scrollLeft - clamped) > 1) {
      container.scrollTo({
        left: clamped,
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
  };

  const syncChips = (smoothScroll = true) => {
    let activeChip: HTMLElement | null = null;
    for (const chip of chips) {
      const value = chip.dataset.filterChip ?? '';
      const active = (value === '' && state.cat === '') || (value !== '' && value === state.cat);
      chip.classList.toggle('active', active);
      chip.setAttribute('aria-pressed', String(active));
      if (active) activeChip = chip;
    }
    if (activeChip) {
      scrollChipToCenter(activeChip, smoothScroll);
    }
  };

  if (config.categoryFilter) {
    for (const chip of chips) {
      chip.addEventListener('click', () => {
        const value = chip.dataset.filterChip ?? '';
        state.cat = value;
        if (catSelect) catSelect.value = state.cat;
        syncChips(true);
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
    syncChips(true);
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
    syncChips(true);
    filterAndApply();
  });

  syncChips(false);

  // If there are initial query params, apply them immediately; otherwise preserve SSR cards and update UI
  if (state.q || state.cat || !Number.isNaN(state.min) || !Number.isNaN(state.max) || state.sort !== config.defaultSort) {
    filterAndApply();
  } else {
    // Initial state: SSR already rendered the first 24 cards; just set the "Ver más" remaining counter!
    cursor = grid.querySelectorAll('.grid-item').length;
    updateSeeMoreUi();
  }
}
