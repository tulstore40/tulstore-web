-- Tulstore Web: capa pública de lectura segura.
-- Ejecutar en Supabase SQL Editor después de las migraciones del Admin.

create or replace view public.public_catalog
with (security_barrier = true)
as
select
  tulstore_id,
  referencia,
  producto,
  color,
  precio_venta,
  categoria,
  descripcion,
  estado,
  image_path,
  created_at,
  updated_at
from public.products
where estado = 'ACTIVO'
  and precio_venta is not null;

-- La web pública solo consulta esta vista, nunca public.products.
revoke all on public.public_catalog from public;
grant select on public.public_catalog to anon, authenticated;

-- Defensa adicional: el rol anónimo no debe leer directamente la tabla interna.
revoke select on public.products from anon;
