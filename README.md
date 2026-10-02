# Tulstore Web — V2 conectada a Supabase

Tienda pública separada de Tulstore Admin. Lee únicamente la vista segura `public.public_catalog` y nunca consulta costos, proveedor, márgenes o datos internos.

## 1. Crear la capa pública en Supabase

Ejecuta en Supabase SQL Editor el contenido de:

`supabase/public_catalog.sql`

La vista publica solo productos `ACTIVO` con precio de venta y expone únicamente campos comerciales públicos.

## 2. Variables locales

Copia `.env.example` a `.env` y completa:

```env
PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
PUBLIC_SITE_URL=http://localhost:4321
```

No uses `service_role` ni una secret key.

## 3. Ejecutar

```bash
npm install
npm run dev
```

Abrir `http://localhost:4321`.

## Arquitectura

- Astro SSR para que páginas de producto/categoría sean HTML indexable.
- Supabase `public_catalog` como única fuente pública.
- Imágenes desde el bucket público `product-images`.
- Carrito local y checkout por WhatsApp.
- sitemap.xml dinámico con productos y categorías reales.
- robots.txt, canonical, Open Graph y Product JSON-LD.

## Netlify

El proyecto usa el adaptador `@astrojs/netlify` y `output: server`.
En Netlify agrega las mismas tres variables de entorno y ejecuta `npm run build`.

## Seguridad

La web nunca recibe `costo`, `proveedor`, `fuente`, `data_hash`, `image_hash` ni otra información interna.
