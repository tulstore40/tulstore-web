export type ProductStatus = 'ACTIVO' | 'AGOTADO' | 'INACTIVO' | 'REVISAR';

interface PublicCatalogRow {
  tulstore_id: string;
  referencia: string | null;
  producto: string;
  color: string | null;
  precio_venta: number | string;
  categoria: string;
  descripcion: string | null;
  estado: ProductStatus;
  image_path: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface Product {
  tulstoreId: string;
  referencia: string;
  nombre: string;
  slug: string;
  color: string;
  precio: number;
  categoria: string;
  categoriaSlug: string;
  descripcion: string;
  imagen: string;
  estado: ProductStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface Category {
  name: string;
  slug: string;
  count: number;
}

const CACHE_MS = 60_000;
let cache: { at: number; products: Product[] } | null = null;

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function env() {
  const url = import.meta.env.PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const key = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error('Faltan PUBLIC_SUPABASE_URL o PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  }
  return { url, key };
}

function storageUrl(baseUrl: string, path: string | null, tulstoreId: string): string {
  const clean = (path || `${tulstoreId}.webp`).replace(/^\/+/, '');
  const encoded = clean.split('/').map(encodeURIComponent).join('/');
  return `${baseUrl}/storage/v1/object/public/product-images/${encoded}`;
}

function mapRow(row: PublicCatalogRow, baseUrl: string): Product {
  const id = row.tulstore_id.trim().toUpperCase();
  const name = row.producto.trim();
  return {
    tulstoreId: id,
    referencia: (row.referencia || '').trim(),
    nombre: name,
    slug: `${slugify(name)}-${id.toLowerCase()}`,
    color: (row.color || '').trim(),
    precio: Number(row.precio_venta),
    categoria: row.categoria.trim(),
    categoriaSlug: slugify(row.categoria),
    descripcion: (row.descripcion || '').trim(),
    imagen: storageUrl(baseUrl, row.image_path, id),
    estado: row.estado,
    createdAt: row.created_at || undefined,
    updatedAt: row.updated_at || undefined,
  };
}

export async function getProducts(force = false): Promise<Product[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.products;
  const { url, key } = env();
  const endpoint = new URL(`${url}/rest/v1/public_catalog`);
  endpoint.searchParams.set('select', '*');
  endpoint.searchParams.set('order', 'producto.asc');
  const response = await fetch(endpoint, {
    headers: { apikey: key },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`No se pudo leer public_catalog (${response.status}): ${body}`);
  }
  const rows = (await response.json()) as PublicCatalogRow[];
  const products = rows.map((row) => mapRow(row, url));
  cache = { at: Date.now(), products };
  return products;
}

export async function getCategories(products?: Product[]): Promise<Category[]> {
  const items = products ?? await getProducts();
  return Array.from(
    items.reduce((map, product) => {
      const current = map.get(product.categoriaSlug) ?? {
        name: product.categoria,
        slug: product.categoriaSlug,
        count: 0,
      };
      current.count += 1;
      map.set(product.categoriaSlug, current);
      return map;
    }, new Map<string, Category>()).values(),
  ).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function productIdFromSlug(slug: string): string | null {
  const match = slug.match(/(tul-\d{6,})$/i);
  return match ? match[1].toUpperCase() : null;
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const id = productIdFromSlug(slug);
  if (!id) return null;
  const products = await getProducts();
  return products.find((product) => product.tulstoreId === id) ?? null;
}
