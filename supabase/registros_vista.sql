-- Vista plana de registros para usuarios autenticados (tabla filtrable + mapa).
-- Nombre nuevo (registros_app_vista) para no tocar la registros_vista del prototipo anterior.
-- Ejecutar en el SQL Editor de Supabase.

-- 1) Vista. security_invoker = el que consulta pasa por el RLS de las tablas base
--    (sin esto la vista corre con permisos del dueño y se salta RLS).
--    Los alias en español (reino/clase/orden/familia) evitan columnas llamadas "class"/"order".
create or replace view public.registros_app_vista
with (security_invoker = true) as
select
    r.id_registro,
    r.id_proyecto,
    p.nombre_proyecto,
    r.comuna_id,
    c.nombre_comuna,
    c.provincia,
    c.region,
    r.localidad_especifica,
    r.protocolo_muestreo,
    r.tipo_registro,
    r.gbif_taxon_key,
    r.genero,
    r.epiteto_especifico,
    r.nombre_comun_terreno,
    t.canonical_name,
    t.kingdom as reino,
    t.class as clase,
    t."order" as orden,
    t.family as familia,
    e.categoria_conservacion,
    e.decreto,
    e.endemica,
    r.cantidad,
    st_y(r.coordenadas) as lat,
    st_x(r.coordenadas) as lon,
    r.hora,
    r.fecha,
    r.usuario,
    -- Agregadas al final: "create or replace" solo permite columnas nuevas después de las existentes.
    t.phylum as filo,
    t.genus as genero_taxonomico
from public.registros r
left join public.proyectos p  on p.id_proyecto = r.id_proyecto
left join public.comunas c    on c.codigo_comuna = r.comuna_id
left join public.taxa_cache t on t.gbif_taxon_key = r.gbif_taxon_key
-- especie_rce puede repetir gbif_taxon_key: una fila por taxón para no duplicar registros.
left join (
    select distinct on (gbif_taxon_key) gbif_taxon_key, categoria_conservacion, decreto, endemica
    from public.especie_rce
    where gbif_taxon_key is not null
    order by gbif_taxon_key, id
) e on e.gbif_taxon_key = r.gbif_taxon_key;

-- 2) Permisos: solo usuarios con sesión.
revoke all on public.registros_app_vista from anon;
grant select on public.registros_app_vista to authenticated;

-- 3) RLS: como la vista es security_invoker, el usuario necesita poder LEER cada tabla que une.
--    "registros: leer (empresa)" ya existe. Crear solo las que falten (si dice "already exists", omitir):
-- create policy "proyectos: leer (empresa)" on public.proyectos
--     for select to authenticated using ((auth.jwt() ->> 'email') like '%@ecorestaura.cl');
-- create policy "comunas: leer (empresa)" on public.comunas
--     for select to authenticated using ((auth.jwt() ->> 'email') like '%@ecorestaura.cl');
-- create policy "taxa_cache: leer (empresa)" on public.taxa_cache
--     for select to authenticated using ((auth.jwt() ->> 'email') like '%@ecorestaura.cl');
-- create policy "especie_rce: leer (empresa)" on public.especie_rce
--     for select to authenticated using ((auth.jwt() ->> 'email') like '%@ecorestaura.cl');

-- 4) Inserción desde la app (aún no construida). No aplicar hasta tener el formulario:
-- create policy "registros: insertar (empresa)" on public.registros
--     for insert to authenticated
--     with check ((auth.jwt() ->> 'email') like '%@ecorestaura.cl');
