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
  // 1. Wait until scrollLeft is > 0 (for non-first items) or centered
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

  // 2. Extra 100ms to guarantee zero in-flight inertia
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

    // 1. Direct navigation to Mascotas (/categoria/mascotas) - one of the last categories
    await page.goto(`${BASE}/categoria/mascotas`, { waitUntil: 'networkidle' });
    await waitForScrollSettled(page, '.category-scroll');

    const mascotasMetrics = await page.evaluate(() => {
      const container = document.querySelector('.category-scroll');
      const activeChip = container?.querySelector('.cat-chip.active');
      if (!container || !activeChip) return null;
      const cRect = container.getBoundingClientRect();
      const chipRect = activeChip.getBoundingClientRect();
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
      };
    });

    check(`[${vp.name}] /categoria/mascotas: chip Mascotas activo`, mascotasMetrics?.hasActiveChip && mascotasMetrics.chipText.includes('Mascotas'), mascotasMetrics?.chipText);
    check(`[${vp.name}] /categoria/mascotas: la barra horizontal se desplazó (scrollLeft > 0)`, mascotasMetrics?.scrollLeft > 50, `scrollLeft=${Math.round(mascotasMetrics?.scrollLeft || 0)}px / max=${Math.round(mascotasMetrics?.maxScrollLeft || 0)}px`);
    check(`[${vp.name}] /categoria/mascotas: botón Mascotas completamente visible`, mascotasMetrics?.isFullyVisible === true);
    check(`[${vp.name}] /categoria/mascotas: botón centrado (delta <= 25px o tope)`, mascotasMetrics?.centerDelta <= 25 || Math.abs((mascotasMetrics?.scrollLeft || 0) - (mascotasMetrics?.maxScrollLeft || 0)) <= 5, `delta=${Math.round(mascotasMetrics?.centerDelta || 0)}px`);
    check(`[${vp.name}] /categoria/mascotas: desplazamiento vertical sin cambios (scrollY = 0)`, mascotasMetrics?.scrollY === 0, `scrollY=${mascotasMetrics?.scrollY}`);

    await page.screenshot({ path: path.join(SHOT_DIR, `nav-mascotas-${vp.name}.png`) });

    // 2. Navigation to the very last category: Tecnología y Electrónica
    await page.goto(`${BASE}/categoria/tecnologia-y-electronica`, { waitUntil: 'networkidle' });
    await waitForScrollSettled(page, '.category-scroll');

    const tecMetrics = await page.evaluate(() => {
      const container = document.querySelector('.category-scroll');
      const activeChip = container?.querySelector('.cat-chip.active');
      if (!container || !activeChip) return null;
      const cRect = container.getBoundingClientRect();
      const chipRect = activeChip.getBoundingClientRect();
      return {
        chipText: activeChip.textContent.trim(),
        scrollLeft: container.scrollLeft,
        isFullyVisible: chipRect.left >= cRect.left - 10 && chipRect.right <= cRect.right + 10,
        scrollY: window.scrollY,
      };
    });

    check(`[${vp.name}] /categoria/tecnologia-y-electronica: chip activo y visible`, tecMetrics?.chipText.includes('Tecnología') && tecMetrics?.isFullyVisible, tecMetrics?.chipText);
    check(`[${vp.name}] /categoria/tecnologia-y-electronica: barra desplazada hacia el final`, tecMetrics?.scrollLeft > 200, `scrollLeft=${Math.round(tecMetrics?.scrollLeft || 0)}px`);
    check(`[${vp.name}] /categoria/tecnologia-y-electronica: scrollY = 0`, tecMetrics?.scrollY === 0);

    // 3. Navigation from «Más categorías» modal
    await page.goto(`${BASE}/productos`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);

    // Open «Más categorías»
    const moreBtn = page.locator('.more-cats-btn');
    await moreBtn.click();
    await page.waitForSelector('#cat-modal.is-open', { timeout: 3000 });
    await page.waitForTimeout(200);

    // Click «Mascotas» card inside modal
    const modalMascotasLink = page.locator('#cat-grid a[href="/categoria/mascotas"]');
    await modalMascotasLink.click();
    await page.waitForURL(/\/categoria\/mascotas/, { timeout: 5000 });
    await waitForScrollSettled(page, '.category-scroll');

    const modalNavMetrics = await page.evaluate(() => {
      const container = document.querySelector('.category-scroll');
      const activeChip = container?.querySelector('.cat-chip.active');
      if (!container || !activeChip) return null;
      const cRect = container.getBoundingClientRect();
      const chipRect = activeChip.getBoundingClientRect();
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
      };
    });

    check(`[${vp.name}] Selección desde «Más categorías»: navega a Mascotas`, modalNavMetrics?.chipText.includes('Mascotas'), modalNavMetrics?.chipText);
    check(`[${vp.name}] Selección desde «Más categorías»: barra desplazada automáticamente`, modalNavMetrics?.scrollLeft > 50, `scrollLeft=${Math.round(modalNavMetrics?.scrollLeft || 0)}px`);
    check(`[${vp.name}] Selección desde «Más categorías»: botón Mascotas centrado y visible`, modalNavMetrics?.isFullyVisible && (modalNavMetrics?.centerDelta <= 25 || modalNavMetrics?.isAtEnd), `visible=${modalNavMetrics?.isFullyVisible}, delta=${Math.round(modalNavMetrics?.centerDelta || 0)}px`);
    check(`[${vp.name}] Selección desde «Más categorías»: scroll vertical inalterado`, modalNavMetrics?.scrollY === 0, `scrollY=${modalNavMetrics?.scrollY}`);

    await page.screenshot({ path: path.join(SHOT_DIR, `nav-from-modal-mascotas-${vp.name}.png`) });

    // 4. In-place category chips bar on /productos
    await page.goto(`${BASE}/productos`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);

    const catalogGridChip = page.locator('[data-filter-chip="mascotas"]');
    if (await catalogGridChip.count() > 0) {
      await catalogGridChip.click();
      await waitForScrollSettled(page, '.chips-scroll');

      const inPlaceMetrics = await page.evaluate(() => {
        const container = document.querySelector('.chips-scroll');
        const activeChip = container?.querySelector('.chip.active');
        if (!container || !activeChip) return null;
        const cRect = container.getBoundingClientRect();
        const chipRect = activeChip.getBoundingClientRect();
        return {
          chipText: activeChip.textContent.trim(),
          scrollLeft: container.scrollLeft,
          isFullyVisible: chipRect.left >= cRect.left - 10 && chipRect.right <= cRect.right + 10,
        };
      });

      check(`[${vp.name}] /productos chips-scroll: clic en Mascotas activa chip`, inPlaceMetrics?.chipText.includes('Mascotas'), inPlaceMetrics?.chipText);
      check(`[${vp.name}] /productos chips-scroll: se desplazó y está visible`, inPlaceMetrics?.scrollLeft > 50 && inPlaceMetrics?.isFullyVisible, `scrollLeft=${Math.round(inPlaceMetrics?.scrollLeft || 0)}px, visible=${inPlaceMetrics?.isFullyVisible}`);
    }

    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(`\n========================================`);
console.log(`Resultados navegación categorías:`);
console.log(`${results.length - failed}/${results.length} comprobaciones OK; ${failed} fallidas.`);
console.log(`========================================\n`);

process.exit(failed ? 1 : 0);
