export const GET = ({ site }: { site?: URL }) => {
  const base = site ?? new URL('https://tulstore.netlify.app');
  return new Response(`User-agent: *\nAllow: /\nSitemap: ${new URL('/sitemap.xml', base)}\n`, { headers: { 'Content-Type': 'text/plain' } });
};
