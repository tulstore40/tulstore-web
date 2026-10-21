/**
 * Pruebas E2E reales del catálogo de Tulstore Web (navegador Chromium del sistema).
 *
 * Uso:   npm run dev            (en otra terminal)
 *        npm run test:e2e
 * Env:   BASE_URL (def. http://localhost:4321), BROWSER_PATH (def. Edge/Chrome instalado),
 *        SHOT_DIR (def. tests/e2e/out), EXPECTED_TOTAL (def. lee el JSON embebido).
 *
 * Regresión clave: las tarjetas insertadas por «Ver más», búsqueda y categorías deben tener
 * EXACTAMENTE los mismos estilos computados que las tarjetas renderizadas por Astro (SSR).
 * Antes se generaban con un string HTML sin los atributos data-astro-cid-* y perdían estilos.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:4321';
const SHOT_DIR = process.env.SHOT_DIR || 'tests/e2e/out';
fs.mkdirSync(SHOT_DIR, { recursive: true });

function findBrowser() {
  const candidates = [
    process.env.BROWSER_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error('No se encontró Edge/Chrome. Define BROWSER_PATH.');
  return found;
}

const results = [];
let failed = 0;
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failed++;
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
}

const VIEWPORTS = [
  { w: 360, h: 740, cols: 3 },
  { w: 390, h: 844, cols: 3 },
  { w: 430, h: 932, cols: 4 },
];

// Estilos que definen el "diseño" de una tarjeta; deben coincidir entre SSR y dinámicas.
const STYLE_PROBES = [
  ['.product-card', ['borderTopWidth', 'borderTopLeftRadius', 'backgroundColor', 'display', 'overflow']],
  ['.image-wrap', ['aspectRatio', 'display', 'paddingTop', 'overflow']],
  ['.product-title', ['fontSize', 'fontWeight', 'color', 'lineHeight']],
  ['.price-val', ['fontSize', 'fontWeight', 'color']],
  ['.btn-add-cart', ['height', 'backgroundColor', 'color', 'borderTopLeftRadius', 'display']],
  ['.btn-add-cart svg', ['width', 'height']],
  ['.btn-icon-wa', ['width', 'height', 'backgroundColor', 'borderTopLeftRadius']],
  ['.btn-icon-wa svg', ['width', 'height']],
];

async function cardStyles(page, index) {
  return page.evaluate(
    ({ index, probes }) => {
      const card = document.querySelectorAll('[data-catalog-grid] .grid-item')[index];
      if (!card) return null;
      const out = {};
      for (const [sel, props] of probes) {
        const el = card.querySelector(sel);
        if (!el) { out[sel] = 'MISSING'; continue; }
        const cs = getComputedStyle(el);
        out[sel] = Object.fromEntries(props.map((p) => [p, cs[p]]));
      }
      const cidAttrs = [...card.querySelector('.product-card').attributes]
        .map((a) => a.name).filter((n) => n.startsWith('data-astro-cid')).sort();
      out.__cid = cidAttrs.join(',');
      return out;
    },
    { index, probes: STYLE_PROBES }
  );
}

async function clickSeeMoreUntilDone(page, maxClicks = 200) {
  let clicks = 0;
  while (clicks < maxClicks) {
    const visible = await page.evaluate(() => {
      const b = document.querySelector('[data-see-more]');
      return !!b && !b.hidden && getComputedStyle(b).display !== 'none';
    });
    if (!visible) break;
    await page.click('[data-see-more]');
    clicks++;
  }
  return clicks;
}

async function gridIds(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-catalog-grid] .grid-item')].map((e) => e.dataset.id)
  );
}

async function catalogJson(page) {
  return page.evaluate(() =>
    JSON.parse(document.getElementById('catalog-products-json').textContent)
  );
}

const browser = await chromium.launch({ executablePath: findBrowser(), headless: true });

try {
  for (const vp of VIEWPORTS) {
    console.log(`\n=== Viewport ${vp.w}x${vp.h} ===`);
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await ctx.addInitScript(() => {
      window.addEventListener('DOMContentLoaded', () => {
        const s = document.createElement('style');
        s.textContent = 'vite-error-overlay, astro-dev-toolbar { display: none !important; pointer-events: none !important; }';
        document.head?.appendChild(s);
        document.querySelectorAll('vite-error-overlay, astro-dev-toolbar').forEach((e) => e.remove());
      });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/favicon|Failed to load resource/i.test(m.text())) {
        errors.push('console: ' + m.text());
      }
    });

    await page.goto(`${BASE}/productos`, { waitUntil: 'networkidle' });
    const products = await catalogJson(page);
    const expectedTotal = Number(process.env.EXPECTED_TOTAL) || products.length;
    check(`[${vp.w}] JSON embebido contiene ${expectedTotal} productos (>1000)`, products.length === expectedTotal && products.length > 1000, `json=${products.length}`);

    // --- Columnas y desbordes ---
    const cols = await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-catalog-grid]')).gridTemplateColumns.split(' ').length
    );
    check(`[${vp.w}] columnas = ${vp.cols}`, cols === vp.cols, `real=${cols}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`[${vp.w}] sin desborde horizontal (inicial)`, overflow <= 0, `exceso=${overflow}px`);

    // --- Fotos visibles ---
    await page.waitForFunction(
      () => [...document.querySelectorAll('[data-catalog-grid] img')].slice(0, 9).every((i) => i.complete && i.naturalWidth > 0),
      null, { timeout: 20000 }
    ).catch(() => {});
    const imgs = await page.evaluate(() => {
      const list = [...document.querySelectorAll('[data-catalog-grid] img')].slice(0, 9);
      return { total: list.length, ok: list.filter((i) => i.complete && i.naturalWidth > 0).length };
    });
    check(`[${vp.w}] fotografías cargadas (primeras ${imgs.total})`, imgs.ok === imgs.total, `${imgs.ok}/${imgs.total}`);

    // --- Proporciones ---
    const geo = await page.evaluate(() => {
      const c = document.querySelector('[data-catalog-grid] .grid-item');
      const r = (s) => c.querySelector(s).getBoundingClientRect();
      const w = r('.image-wrap');
      return {
        cardW: Math.round(r('.product-card').width), cardH: Math.round(r('.product-card').height),
        imgW: Math.round(w.width), imgH: Math.round(w.height),
        wa: Math.round(r('.btn-icon-wa').width), add: Math.round(r('.btn-add-cart').height),
        waSvg: Math.round(r('.btn-icon-wa svg').width), cartSvg: Math.round(r('.btn-add-cart svg').width),
        titleLines: Math.round(r('.product-title').height / parseFloat(getComputedStyle(c.querySelector('.product-title')).lineHeight)),
      };
    });
    console.log('        geometría tarjeta:', JSON.stringify(geo));
    check(`[${vp.w}] foto cuadrada`, Math.abs(geo.imgW - geo.imgH) <= 1, `${geo.imgW}x${geo.imgH}`);
    check(`[${vp.w}] iconos proporcionados (WA<=20px, carrito<=20px)`, geo.waSvg <= 20 && geo.cartSvg <= 20, `wa=${geo.waSvg} cart=${geo.cartSvg}`);
    check(`[${vp.w}] áreas táctiles >= 30px`, geo.wa >= 30 && geo.add >= 30, `wa=${geo.wa} add=${geo.add}`);
    check(`[${vp.w}] nombre limitado a 2 líneas`, geo.titleLines <= 2, `líneas=${geo.titleLines}`);
    check(`[${vp.w}] tarjeta compacta (alto <= 1.95x ancho)`, geo.cardH <= geo.cardW * 1.95, `${geo.cardW}x${geo.cardH}`);
    await page.screenshot({ path: path.join(SHOT_DIR, `catalogo-${vp.w}-inicial.png`) });

    // --- REGRESIÓN: tarjetas dinámicas == tarjetas SSR ---
    const ssrStyles = await cardStyles(page, 0);
    await page.click('[data-see-more]');
    await page.click('[data-see-more]');
    const afterCount = (await gridIds(page)).length;
    check(`[${vp.w}] «Ver más» agrega tarjetas`, afterCount > 24, `tarjetas=${afterCount}`);
    const dynIndex = afterCount - 1;
    const dynStyles = await cardStyles(page, dynIndex);
    check(`[${vp.w}] REGRESIÓN estilos: tarjeta dinámica idéntica a SSR`, JSON.stringify(ssrStyles) === JSON.stringify(dynStyles),
      JSON.stringify(ssrStyles) === JSON.stringify(dynStyles) ? '' : `\nSSR=${JSON.stringify(ssrStyles)}\nDYN=${JSON.stringify(dynStyles)}`);
    check(`[${vp.w}] tarjeta dinámica conserva atributos de estilos encapsulados`, ssrStyles.__cid && ssrStyles.__cid === dynStyles.__cid, dynStyles.__cid);
    await page.locator('[data-catalog-grid] .grid-item').nth(dynIndex).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOT_DIR, `catalogo-${vp.w}-ver-mas.png`) });

    // --- Cargar todo: sin duplicados ni pérdidas ---
    const clicks = await clickSeeMoreUntilDone(page);
    const ids = await gridIds(page);
    const uniq = new Set(ids);
    check(`[${vp.w}] todos los productos cargados tras Ver más (${clicks} clics)`, ids.length === products.length, `${ids.length}/${products.length}`);
    check(`[${vp.w}] sin duplicados`, uniq.size === ids.length, `únicos=${uniq.size}`);
    check(`[${vp.w}] orden y contenido iguales al catálogo`, ids.every((id, i) => id === products[i].id));
    const hidden = await page.evaluate(() => {
      const b = document.querySelector('[data-see-more]');
      return b.hidden || getComputedStyle(b).display === 'none';
    });
    check(`[${vp.w}] «Ver más» desaparece al terminar`, hidden);
    const lastStyles = await cardStyles(page, ids.length - 1);
    check(`[${vp.w}] última tarjeta (producto ${ids.length}) idéntica a SSR`, JSON.stringify(ssrStyles) === JSON.stringify(lastStyles));
    const ov2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`[${vp.w}] sin desborde horizontal (1056 tarjetas)`, ov2 <= 0, `exceso=${ov2}px`);

    // --- Agregar al carrito desde una tarjeta dinámica ---
    const before = await page.evaluate(() => document.querySelector('[data-cart-count]').textContent.trim());
    const lastBtn = page.locator('[data-catalog-grid] .grid-item').last().locator('[data-add-cart]');
    await lastBtn.scrollIntoViewIfNeeded();
    await lastBtn.click();
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => document.querySelector('[data-cart-count]').textContent.trim());
    const waOpened = await page.evaluate(() => !!document.querySelector('.cart-drawer.open, [data-cart-drawer].open'));
    check(`[${vp.w}] agregar al carrito (tarjeta dinámica)`, Number(after) === Number(before) + 1, `${before} -> ${after}`);
    check(`[${vp.w}] agregar NO abre WhatsApp ni el pago`, !waOpened && page.url().startsWith(BASE));

    // --- Búsqueda de producto posterior al #1000 ---
    await page.goto(`${BASE}/productos`, { waitUntil: 'networkidle' });
    const late = products[1000];
    await page.fill('[data-catalog-search]', late.id.replace('TUL-', '') && late.name);
    await page.waitForTimeout(400);
    const found = await page.evaluate((id) => [...document.querySelectorAll('[data-catalog-grid] .grid-item')].some((e) => e.dataset.id === id), late.id);
    check(`[${vp.w}] búsqueda encuentra producto #1001 (${late.name})`, found);
    const sStyles = await cardStyles(page, 0);
    check(`[${vp.w}] tarjeta de búsqueda idéntica a SSR`, JSON.stringify(sStyles) === JSON.stringify(ssrStyles) || sStyles['.product-card'] !== 'MISSING' && sStyles.__cid === ssrStyles.__cid);
    await page.fill('[data-catalog-search]', '');
    await page.waitForTimeout(400);

    // --- Categoría + Ver más completo ---
    const catSlug = 'tecnologia-y-electronica';
    const expectedCat = products.filter((p) => p.catSlug === catSlug).length;
    await page.click(`[data-filter-chip="${catSlug}"]`);
    await page.waitForTimeout(300);
    await clickSeeMoreUntilDone(page);
    const catIds = await gridIds(page);
    check(`[${vp.w}] categoría Tecnología: ${expectedCat} productos, sin duplicados`, catIds.length === expectedCat && new Set(catIds).size === expectedCat, `${catIds.length}`);
    check(`[${vp.w}] categoría incluye productos posteriores al #1000`, catIds.includes(late.id) || products.slice(1000).every((p) => p.catSlug !== catSlug || catIds.includes(p.id)));

    // --- Panel de categorías móvil ---
    await page.goto(`${BASE}/productos`, { waitUntil: 'networkidle' });
    for (let round = 1; round <= 3; round++) {
      await page.evaluate(() => window.scrollTo(0, 1800));
      await page.waitForTimeout(150);
      await page.click('.cat-lead-btn');
      await page.waitForSelector('#cat-modal.is-open', { timeout: 3000 });
      await page.waitForTimeout(350);
      const m = await page.evaluate(() => {
        const card = document.querySelector('.cat-modal-card').getBoundingClientRect();
        const input = document.getElementById('cat-filter-input').getBoundingClientRect();
        const close = document.querySelector('[data-cat-close]').getBoundingClientRect();
        const body = document.getElementById('cat-modal-body');
        const rows = [...document.querySelectorAll('#cat-grid .cat-card')].filter((e) => e.offsetParent !== null);
        const cx = window.innerWidth / 2, cy = card.top + card.height / 2;
        const top = document.elementFromPoint(cx, cy);
        return {
          vh: window.innerHeight, cardH: Math.round(card.height), cardTop: Math.round(card.top),
          inputVisible: input.top >= card.top && input.bottom <= card.bottom && input.top >= 0,
          closeVisible: close.top >= 0 && close.right <= window.innerWidth && close.width >= 32,
          rows: rows.length, scrolls: body.scrollHeight > body.clientHeight, bodyOverflowY: getComputedStyle(body).overflowY,
          topIsModal: !!top && !!top.closest('#cat-modal'), bodyLocked: document.body.style.overflow === 'hidden',
          iconsHidden: [...document.querySelectorAll('#cat-grid .cat-icon-container')].every((e) => getComputedStyle(e).display === 'none'),
        };
      });
      if (round === 1) console.log('        panel categorías:', JSON.stringify(m));
      check(`[${vp.w}] panel #${round}: altura <= 80% del viewport`, m.cardH <= m.vh * 0.8 + 1, `${m.cardH}/${m.vh}`);
      check(`[${vp.w}] panel #${round}: buscador y cierre visibles`, m.inputVisible && m.closeVisible);
      check(`[${vp.w}] panel #${round}: 14 categorías + lista con scroll interno`, m.rows === 14 && m.bodyOverflowY === 'auto', `filas=${m.rows}, scrolls=${m.scrolls}`);
      check(`[${vp.w}] panel #${round}: sin overlays encima, scroll de fondo bloqueado`, m.topIsModal && m.bodyLocked);
      check(`[${vp.w}] panel #${round}: filas compactas sin iconos`, m.iconsHidden);
      if (round === 1) await page.screenshot({ path: path.join(SHOT_DIR, `categorias-${vp.w}.png`) });
      if (round === 1) {
        await page.fill('#cat-filter-input', 'cocina');
        await page.waitForTimeout(150);
        const n = await page.evaluate(() => [...document.querySelectorAll('#cat-grid .cat-card-wrapper')].filter((e) => e.style.display !== 'none').length);
        check(`[${vp.w}] buscar categoría «cocina» filtra la lista`, n === 1, `visibles=${n}`);
        await page.fill('#cat-filter-input', '');
      }
      if (round === 2) { await page.keyboard.press('Escape'); } else { await page.click('[data-cat-close]'); }
      await page.waitForTimeout(300);
      const closed = await page.evaluate(() => !document.getElementById('cat-modal').classList.contains('is-open') && document.body.style.overflow !== 'hidden');
      check(`[${vp.w}] panel #${round}: cierra (${round === 2 ? 'Escape' : 'botón ✕'}) y libera scroll`, closed);
    }
    // Backdrop (clic fuera) + «Más categorías» + selección real
    await page.click('.more-cats-btn');
    await page.waitForSelector('#cat-modal.is-open');
    await page.mouse.click(vp.w / 2, 8);
    await page.waitForTimeout(300);
    check(`[${vp.w}] «Más categorías» abre y clic fuera cierra`, await page.evaluate(() => !document.getElementById('cat-modal').classList.contains('is-open')));
    await page.click('.cat-lead-btn');
    await page.waitForSelector('#cat-modal.is-open');
    await page.waitForTimeout(300);
    await Promise.all([
      page.waitForURL(/\/categoria\/cocina-y-comedor/),
      page.click('#cat-grid a[href="/categoria/cocina-y-comedor"]'),
    ]);
    const expCocina = products.filter((p) => p.catSlug === 'cocina-y-comedor').length;
    const headCount = await page.evaluate(() => document.querySelector('.head p')?.textContent || '');
    check(`[${vp.w}] seleccionar categoría navega a sus productos`, headCount.includes(String(expCocina)), headCount.trim());

    check(`[${vp.w}] sin errores de consola/JS`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // --- Escritorio ---
  console.log('\n=== Escritorio 1366x768 ===');
  const dctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await dctx.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = 'vite-error-overlay, astro-dev-toolbar { display: none !important; pointer-events: none !important; }';
      document.head?.appendChild(s);
      document.querySelectorAll('vite-error-overlay, astro-dev-toolbar').forEach((e) => e.remove());
    });
  });
  const dp = await dctx.newPage();
  const derr = [];
  dp.on('pageerror', (e) => derr.push(e.message));
  await dp.goto(`${BASE}/productos`, { waitUntil: 'networkidle' });
  const dcols = await dp.evaluate(() => getComputedStyle(document.querySelector('[data-catalog-grid]')).gridTemplateColumns.split(' ').length);
  check('[desktop] 4 columnas (sin cambios)', dcols === 4, `real=${dcols}`);
  const s0 = await cardStyles(dp, 0);
  await dp.click('[data-see-more]');
  const s1 = await cardStyles(dp, (await gridIds(dp)).length - 1);
  check('[desktop] REGRESIÓN estilos: tarjeta dinámica idéntica a SSR', JSON.stringify(s0) === JSON.stringify(s1));
  await dp.click('.cat-lead-btn');
  await dp.waitForSelector('#cat-modal.is-open');
  await dp.waitForTimeout(350);
  const drows = await dp.evaluate(() => [...document.querySelectorAll('#cat-grid .cat-card')].filter((e) => e.offsetParent !== null).length);
  check('[desktop] panel de categorías muestra las 14', drows === 14, `filas=${drows}`);
  await dp.screenshot({ path: path.join(SHOT_DIR, 'categorias-desktop.png') });
  await dp.keyboard.press('Escape');
  check('[desktop] sin errores JS', derr.length === 0, derr.join(' | '));
  await dctx.close();
} finally {
  await browser.close();
}

console.log(`\n${results.length - failed}/${results.length} comprobaciones OK; ${failed} fallidas.`);
console.log(`Capturas en: ${path.resolve(SHOT_DIR)}`);
process.exit(failed ? 1 : 0);
