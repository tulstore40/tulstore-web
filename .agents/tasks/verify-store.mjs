async function testAll() {
  console.log('--- 1. Testing Endpoints ---');
  const [rHome, rProd, rSearch] = await Promise.all([
    fetch('http://localhost:4321/').then(r => r.text()),
    fetch('http://localhost:4321/productos').then(r => r.text()),
    fetch('http://localhost:4321/buscar?q=camara').then(r => r.text())
  ]);

  console.log('Home length:', rHome.length, 'has categories drawer:', rHome.includes('mobile-cats-drawer'));
  console.log('Productos length:', rProd.length, 'has sticky quickbar:', rProd.includes('sticky-bar'));
  console.log('Search length:', rSearch.length, 'has results:', rSearch.includes('product-card'));

  console.log('--- 2. Verifying Category Drawer on Mobile ---');
  console.log('Has mobile cats open button:', rHome.includes('data-mobile-cats-open'));
  console.log('Has mobile cats overlay:', rHome.includes('data-mobile-cats-overlay'));
  console.log('Has desktop cats dropdown:', rHome.includes('desktop-cats-dropdown'));

  console.log('--- 3. Verifying Compact Grid & Initial SSR Items ---');
  const cardMatches = (rProd.match(/class="grid-item"/g) || []).length;
  console.log('SSR rendered card count in DOM:', cardMatches, '(Target: <= 24, avoiding 1,000 DOM nodes)');

  console.log('--- 4. Checking Supabase Images Integrity ---');
  const regex = /src="(https:\/\/[^"]+storage[^"]+)"/g;
  const sample = [];
  let m;
  while ((m = regex.exec(rProd)) !== null && sample.length < 5) {
    sample.push(m[1]);
  }
  for (const url of sample) {
    const headRes = await fetch(url, { method: 'HEAD' });
    console.log('Image URL status:', headRes.status, url.split('/').pop());
  }

  console.log('--- 5. Checking Category Pages Navigation ---');
  const catRes = await fetch('http://localhost:4321/categoria/tecnologia-y-accesorios');
  console.log('Category page status:', catRes.status);
}
testAll().catch(console.error);
