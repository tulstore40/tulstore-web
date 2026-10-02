import type { Product } from './catalog';

// SortKey is the single source of truth for catalog sort options.
// catalog-controller.ts imports it from here (never the reverse) so that
// pages/components depend only on lib/, never on scripts/.
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
  | { kind: 'latest'; count: number } // sort by createdAt desc
  | { kind: 'by-category'; categorySlug: string; count: number }
  | { kind: 'manual'; ids: string[] }; // tulstoreId list

export interface ProductStripConfig {
  title: string;
  subtitle?: string;
  rule: FeaturedRule;
  seeAllHref?: string;
}

export interface CategorySectionConfig {
  title: string;
  subtitle?: string;
  limit: number; // how many category cards to show
  seeAllHref: string;
}

export interface CtaConfig {
  eyebrow: string;
  title: string;
  text: string;
  whatsappHref: string;
  buttonLabel: string;
}

export type HomeSection =
  | { type: 'hero'; data: HeroConfig }
  | { type: 'categories'; data: CategorySectionConfig }
  | { type: 'product-strip'; data: ProductStripConfig }
  | { type: 'cta'; data: CtaConfig };

export interface CatalogConfig {
  pageSize: number; // 32
  defaultSort: SortKey; // 'relevancia'
  sortOptions: { key: SortKey; label: string }[];
  priceFilter: boolean; // show min/max
  categoryFilter: boolean; // show category select
}

export interface SiteConfig {
  home: { sections: HomeSection[] };
  catalog: CatalogConfig;
}

export const defaultSiteConfig: SiteConfig = {
  home: {
    sections: [
      {
        type: 'hero',
        data: {
          eyebrow: 'TULSTORE · COLOMBIA',
          title: 'Encuentra eso que no sabías que necesitabas.',
          subtitle:
            'Hogar, tecnología, bienestar, regalos y mucho más en un solo lugar. Explora, arma tu carrito y finaliza tu pedido por WhatsApp.',
          primaryCta: { label: 'Explorar productos', href: '/productos' },
          secondaryCta: { label: 'Ver categorías', href: '#categorias' },
          trust: ['✓ Compra directa', '✓ Atención por WhatsApp', '✓ Catálogo actualizado'],
          showBrandPanel: true,
        },
      },
      {
        type: 'categories',
        data: {
          title: 'Explora por categoría',
          subtitle: 'Llega rápido a lo que estás buscando.',
          limit: 8,
          seeAllHref: '/productos',
        },
      },
      {
        type: 'product-strip',
        data: {
          title: 'Explora Tulstore',
          subtitle: 'Una selección del catálogo disponible.',
          rule: { kind: 'first-n', count: 8 },
          seeAllHref: '/productos',
        },
      },
      {
        type: 'product-strip',
        data: {
          title: 'Recién agregados',
          subtitle: 'Productos incorporados recientemente al catálogo.',
          rule: { kind: 'latest', count: 4 },
        },
      },
      {
        type: 'cta',
        data: {
          eyebrow: '¿BUSCAS ALGO ESPECÍFICO?',
          title: 'Cuéntanos qué necesitas.',
          text: 'Si no encuentras un producto en el catálogo, escríbenos y te ayudamos a buscarlo.',
          whatsappHref: 'https://wa.me/573182022859?text=Hola%20Tulstore,%20estoy%20buscando%20un%20producto',
          buttonLabel: 'Escribir por WhatsApp',
        },
      },
    ],
  },
  catalog: {
    pageSize: 32,
    defaultSort: 'relevancia',
    sortOptions: [
      { key: 'relevancia', label: 'Relevancia' },
      { key: 'precio-asc', label: 'Menor precio' },
      { key: 'precio-desc', label: 'Mayor precio' },
      { key: 'nombre', label: 'Nombre A-Z' },
    ],
    priceFilter: true,
    categoryFilter: true,
  },
};

// === SINGLE INTEGRATION SEAM FOR TULSTORE ADMIN ===
// Today this returns the local default config. In the future a Tulstore Admin
// (remote/DB-backed) can supply or override this configuration by swapping the
// body of THIS one function (e.g. fetch a JSON row from Supabase and merge it
// over defaultSiteConfig). On remote failure it must fall back to
// defaultSiteConfig. No page or component call site needs to change: they all
// `await getSiteConfig()` already. This is the only integration point.
export async function getSiteConfig(): Promise<SiteConfig> {
  return defaultSiteConfig;
}

// Pure helper: resolves a FeaturedRule against the already-fetched products.
// This is the single place featured/novedades selection logic lives, so it is
// unit-testable and reused by the home. It performs no fetching.
export function resolveFeatured(products: Product[], rule: FeaturedRule): Product[] {
  switch (rule.kind) {
    case 'first-n':
      return products.slice(0, rule.count);
    case 'latest':
      // Empty createdAt sorts LAST; mirrors the previous inline index.astro logic.
      return [...products]
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .slice(0, rule.count);
    case 'by-category':
      return products.filter((p) => p.categoriaSlug === rule.categorySlug).slice(0, rule.count);
    case 'manual': {
      const order = new Map(rule.ids.map((id, index) => [id.toUpperCase(), index]));
      return products
        .filter((p) => order.has(p.tulstoreId))
        .sort((a, b) => (order.get(a.tulstoreId) ?? 0) - (order.get(b.tulstoreId) ?? 0));
    }
  }
}
