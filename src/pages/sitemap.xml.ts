import { getProducts, getCategories } from '../lib/catalog';
export const GET = async ({ site }: { site?: URL }) => {
  const base = site ?? new URL('https://tulstore.netlify.app');
  const products = await getProducts();
  const categories = await getCategories(products);
  const paths = ['/', '/productos', '/buscar', ...categories.map(c=>`/categoria/${c.slug}`), ...products.map(p=>`/producto/${p.slug}`)];
  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path=>`<url><loc>${new URL(path,base)}</loc></url>`).join('')}</urlset>`;
  return new Response(body,{headers:{'Content-Type':'application/xml'}});
};
