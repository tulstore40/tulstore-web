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

async function waitForScrollSettled(page, selector = '.category-scroll') {
  await page.waitForFunction(
    (sel) => {
      const container = document.querySelector(sel);
      const activeChip = container?.querySelector('.cat-chip.active, .chip.active');
      if (!container || !activeChip) return true;
      const cRect = container.getBoundingClientRect();
      const aRect = activeChip.getBoundingClientRect();
      const chipCenter = aRect.left + aRect.width / 2;
      const containerCenter = cRect.left + cRect.width / 2;
      const maxScroll = container.scrollWidth - container.clientWidth;
      const isAtEnd = Math.abs(container.scrollLeft - maxScroll) <= 10;
      const isCentered = Math.abs(chipCenter - containerCenter) <= 25;
      return isCentered || isAtEnd;
    },
    selector,
    { timeout: 5000 }
  ).catch(() => {});

  await page.waitForTimeout(100);
}

const VIEWPORTS = [
  { name: 'm-360', w: 360, h: 740, isMobile: true },
  { name: 'm-390', w: 390, h: 844, isMobile: true },
  { name: 'm-430', w: 430, h: 932, isMobile: true },
  { name: 'desktop', w: 1366, h: 768, isMobile: false },
];

const browser = await chromium.launch({ executablePath: findBrowser(), headless: true });

try {
  for (const vp of VIEWPORTS) {
    console.log(`\n========================================`);
    console.log(`=== Viewport ${vp.name} (${vp.w}x${vp.h}) ===`);
    console.log(`========================================`);

    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: 2,
      isMobile: vp.isMobile,
      hasTouch: vp.isMobile,
    });

    await ctx.addInitScript(() => {
      const s = document.createElement('style');
      s.textContent = 'vite-error-overlay, astro-dev-toolbar { display: none !important; pointer-events: none !important; }';
      document.documentElement.appendChild(s);
      new MutationObserver(() => {
        document.querySelectorAll('vite-error-overlay, astro-dev-toolbar').forEach((e) => e.remove());
      }).observe(document.documentElement, { childList: true, subtree: true });
    });

    const page = await ctx.newPage();

    // 0. Base verification on /productos (initial state)
    await page.goto(`${BASE}/productos`, { waitUntil: 'networkidle' });
    const initialLeadMetrics = await page.evaluate(() => {
      const btn = document.querySelector('.cat-lead-btn');
      const fixedWrap = document.querySelector('.cat-lead-fixed');
      const scrollWrap = document.querySelector('.category-scroll');
      if (!btn || !fixedWrap || !scrollWrap) return null;
      const bRect = btn.getBoundingClientRect();
      const sRect = scrollWrap.getBoundingClientRect();
      return {
        btnLeft: bRect.left,
        btnRight: bRect.right,
        btnWidth: bRect.width,
        scrollLeft: scrollWrap.scrollLeft,
        scrollContainerLeft: sRect.left,
        docWidth: document.documentElement.scrollWidth,
        winWidth: window.innerWidth,
      };
    });

    check(`[${vp.name}] Botón fijo «Todas las categorías» presente y visible a la izquierda`, initialLeadMetrics?.btnLeft >= 0 && initialLeadMetrics?.btnWidth > 50, `left=${Math.round(initialLeadMetrics?.btnLeft || 0)}px, width=${Math.round(initialLeadMetrics?.btnWidth || 0)}px`);
    check(`[${vp.name}] Sin desbordamiento horizontal en viewport`, (initialLeadMetrics?.docWidth || 0) <= (initialLeadMetrics?.winWidth || 0) + 1, `doc=${initialLeadMetrics?.docWidth}px, win=${initialLeadMetrics?.winWidth}px`);

    // 1. Direct navigation to Mascotas (/categoria/mascotas) - 11th category
    await page.goto(`${BASE}/categoria/mascotas`, { waitUntil: 'networkidle' });
    await waitForScrollSettled(page, '.category-scroll');

    const mascotasMetrics = await page.evaluate(() => {
      const container = document.querySelector('.category-scroll');
      const activeChip = container?.querySelector('.cat-chip.active');
      const btn = document.querySelector('.cat-lead-btn');
      if (!container || !activeChip || !btn) return null;
      const cRect = container.getBoundingClientRect();
      const chipRect = activeChip.getBoundingClientRect();
      const bRect = btn.getBoundingClientRect();
      const chipCenter = chipRect.left + chipRect.width / 2;
      const containerCenter = cRect.left + cRect.width / 2;
      return {
        hasActiveChip: true,
        chipText: activeChip.textContent.trim(),
        scrollLeft: container.scrollLeft,
        scrollWidth: container.scrollWidth,
        clientWidth: container.clientWidth,
        scrollY: window.scrollY,
        isFullyVisible: chipRect.left >= cRect.left - 5 && chipRect.right <= cRect.right + 5,
        centerDelta: Math.abs(chipCenter - containerCenter),
        maxScrollLeft: container.scrollWidth - container.clientWidth,
        btnLeft: bRect.left,
        btnRight: bRect.right,
        btnIsVisible: bRect.left >= 0 && bRect.right <= window.innerWidth && bRect.width > 50,
        noOverlap: bRect.right <= cRect.left + 5,
      };
    });

    check(`[${vp.name}] /categoria/mascotas: chip Mascotas activo`, mascotasMetrics?.hasActiveChip && mascotasMetrics.chipText.includes('Mascotas'), mascotasMetrics?.chipText);
    check(`[${vp.name}] /categoria/mascotas: la barra de categorías se desplazó (scrollLeft > 0)`, mascotasMetrics?.scrollLeft > 50, `scrollLeft=${Math.round(mascotasMetrics?.scrollLeft || 0)}px / max=${Math.round(mascotasMetrics?.maxScrollLeft || 0)}px`);
    check(`[${vp.name}] /categoria/mascotas: botón Mascotas completamente visible`, mascotasMetrics?.isFullyVisible === true);
    check(`[${vp.name}] /categoria/mascotas: botón centrado (delta <= 25px o tope)`, mascotasMetrics?.centerDelta <= 25 || Math.abs((mascotasMetrics?.scrollLeft || 0) - (mascotasMetrics?.maxScrollLeft || 0)) <= 5, `delta=${Math.round(mascotasMetrics?.centerDelta || 0)}px`);
    check(`[${vp.name}] /categoria/mascotas: desplazamiento vertical sin cambios (scrollY = 0)`, mascotasMetrics?.scrollY === 0, `scrollY=${mascotasMetrics?.scrollY}`);
    check(`[${vp.name}] /categoria/mascotas: botón fijo «Todas las categorías» permanece visible e inmutable a la izquierda`, mascotasMetrics?.btnIsVisible && Math.abs(mascotasMetrics.btnLeft - (initialLeadMetrics?.btnLeft || 0)) <= 2, `btnLeft=${Math.round(mascotasMetrics?.btnLeft || 0)}px`);
    check(`[${vp.name}] /categoria/mascotas: sin superposición entre botón fijo y scroll`, mascotasMetrics?.noOverlap === true);

    await page.screenshot({ path: path.join(SHOT_DIR, `fixed-lead-mascotas-${vp.name}.png`) });

    // 2. Navigation to the very last category: Tecnología y Electrónica (14th category)
    await page.goto(`${BASE}/categoria/tecnologia-y-electronica`, { waitUntil: 'networkidle' });
    await waitForScrollSettled(page, '.category-scroll');

    const tecMetrics = await page.evaluate(() => {
      const container = document.querySelector('.category-scroll');
      const activeChip = container?.querySelector('.cat-chip.active');
      const btn = document.querySelector('.cat-lead-btn');
      if (!container || !activeChip || !btn) return null;
      const cRect = container.getBoundingClientRect();
      const chipRect = activeChip.getBoundingClientRect();
      const bRect = btn.getBoundingClientRect();
      return {
        chipText: activeChip.textContent.trim(),
        scrollLeft: container.scrollLeft,
        isFullyVisible: chipRect.left >= cRect.left - 10 && chipRect.right <= cRect.right + 10,
        scrollY: window.scrollY,
        btnLeft: bRect.left,
        btnRight: bRect.right,
        btnIsVisible: bRect.left >= 0 && bRect.right <= window.innerWidth && bRect.width > 50,
        noOverlap: bRect.right <= cRect.left + 5,
      };
    });

    check(`[${vp.name}] /categoria/tecnologia-y-electronica: chip activo y visible`, tecMetrics?.chipText.includes('Tecnología') && tecMetrics?.isFullyVisible, tecMetrics?.chipText);
    check(`[${vp.name}] /categoria/tecnologia-y-electronica: barra desplazada hacia el final`, tecMetrics?.scrollLeft > 200, `scrollLeft=${Math.round(tecMetrics?.scrollLeft || 0)}px`);
    check(`[${vp.name}] /categoria/tecnologia-y-electronica: botón fijo sigue 100% visible con la última categoría`, tecMetrics?.btnIsVisible && Math.abs((tecMetrics?.btnLeft || 0) - (initialLeadMetrics?.btnLeft || 0)) <= 2, `btnLeft=${Math.round(tecMetrics?.btnLeft || 0)}px`);
    check(`[${vp.name}] /categoria/tecnologia-y-electronica: scrollY = 0`, tecMetrics?.scrollY === 0);

    await page.screenshot({ path: path.join(SHOT_DIR, `fixed-lead-last-category-${vp.name}.png`) });

    // 3. Click the FIXED «Todas las categorías» button -> opens modal with 14 categories
    const leadBtn = page.locator('.cat-lead-btn');
    await leadBtn.click();
    await page.waitForSelector('#cat-modal.is-open', { timeout: 3000 });
    await page.waitForTimeout(200);

    const modalCategoriesCount = await page.evaluate(() => {
      const modal = document.querySelector('#cat-modal');
      const links = modal?.querySelectorAll('#cat-grid a[href^="/categoria/"]');
      return links ? links.length : 0;
    });

    check(`[${vp.name}] Clic en botón fijo abre modal con las 14 categorías`, modalCategoriesCount >= 14, `conteo=${modalCategoriesCount}`);

    // Click «Mascotas» card inside modal
    const modalMascotasLink = page.locator('#cat-grid a[href="/categoria/mascotas"]');
    await modalMascotasLink.click();
    await page.waitForURL(/\/categoria\/mascotas/, { timeout: 5000 });
    await waitForScrollSettled(page, '.category-scroll');

    const modalNavMetrics = await page.evaluate(() => {
      const container = document.querySelector('.category-scroll');
      const activeChip = container?.querySelector('.cat-chip.active');
      const btn = document.querySelector('.cat-lead-btn');
      if (!container || !activeChip || !btn) return null;
      const cRect = container.getBoundingClientRect();
      const chipRect = activeChip.getBoundingClientRect();
      const bRect = btn.getBoundingClientRect();
      const chipCenter = chipRect.left + chipRect.width / 2;
      const containerCenter = cRect.left + cRect.width / 2;
      const maxScroll = container.scrollWidth - container.clientWidth;
      return {
        chipText: activeChip.textContent.trim(),
        scrollLeft: container.scrollLeft,
        isFullyVisible: chipRect.left >= cRect.left - 5 && chipRect.right <= cRect.right + 5,
        centerDelta: Math.abs(chipCenter - containerCenter),
        isAtEnd: Math.abs(container.scrollLeft - maxScroll) <= 5,
        scrollY: window.scrollY,
        btnIsVisible: bRect.left >= 0 && bRect.right <= window.innerWidth,
      };
    });

    check(`[${vp.name}] Selección desde modal abre Mascotas`, modalNavMetrics?.chipText.includes('Mascotas'), modalNavMetrics?.chipText);
    check(`[${vp.name}] Selección desde modal: barra desplazada y botón activo centrado`, modalNavMetrics?.scrollLeft > 50 && modalNavMetrics?.isFullyVisible, `scrollLeft=${Math.round(modalNavMetrics?.scrollLeft || 0)}px`);
    check(`[${vp.name}] Selección desde modal: botón fijo visible a la izquierda`, modalNavMetrics?.btnIsVisible === true);

    // 4. Sticky behavior check: scroll vertically and verify header stays pinned
    await page.mouse.wheel(0, 350);
    await page.waitForTimeout(200);

    const stickyMetrics = await page.evaluate(() => {
      const header = document.querySelector('.site-header');
      const btn = document.querySelector('.cat-lead-btn');
      const hRect = header?.getBoundingClientRect();
      const bRect = btn?.getBoundingClientRect();
      return {
        headerTop: hRect?.top,
        btnTop: bRect?.top,
        btnVisible: (bRect?.top || 0) >= 0 && (bRect?.bottom || 0) <= window.innerHeight,
        scrollY: window.scrollY,
      };
    });

    check(`[${vp.name}] Comportamiento sticky: encabezado y botón fijo permanecen visibles al hacer scroll vertical`, Math.abs(stickyMetrics?.headerTop || 0) <= 2 && stickyMetrics?.btnVisible === true, `headerTop=${Math.round(stickyMetrics?.headerTop || 0)}px, scrollY=${stickyMetrics?.scrollY}px`);

    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(`\n========================================`);
console.log(`Resultados navegación y botón fijo:`);
console.log(`${results.length - failed}/${results.length} comprobaciones OK; ${failed} fallidas.`);
console.log(`========================================\n`);

process.exit(failed ? 1 : 0);
