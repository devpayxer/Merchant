-- 22 sep 2026 — regla del dueño: "si el producto no ofrece free shipping,
-- hay que sumarle el shipping". El comprador compara precio PUESTO EN CASA.
-- Ejemplo real: BMW 3 Series, el "más barato" a $109 cobra $35 de envío →
-- $144; nuestro rin con envío gratis a $130 le gana.
--
-- listings.shipping = costo de envío más barato que informa eBay (0 = gratis,
-- null = no lo dijo). Cuando es null se asume el costo de la clase de envío
-- de la pieza (S 6 / M 13 / L 22), igual que pagaríamos nosotros.
-- TODOS los precio_* de combo_stats/hot_list pasan a ser puestos en casa.
alter table listings add column if not exists shipping numeric;

create or replace view combo_stats as
with base as (
  select c.id as combo_id, p.id as part_type_id, v.label as vehiculo,
         v.make, v.model, v.year_start, v.year_end,
         p.name_es as pieza, p.pull_minutes, p.ship_class, c.last_checked_at,
         l.item_id, l.ended_at, l.last_seen, l.image_url, l.url, l.seller, l.title,
         l.shipping,
         -- precio puesto en casa: lo que paga el comprador
         s.price + coalesce(l.shipping, case p.ship_class when 'S' then 6 when 'M' then 13 else 22 end) as price,
         (l.title is not null
          and l.title !~* '(set of|\(4\)|\yx ?4\y|4 wheels|four|pair|\(2\)|\yset\y|tire|tpms|center cap|hubcap|hub cap|\ylug\y|cover)'
          and (l.title ~* (case v.make
                 when 'Volkswagen' then '(volkswagen|\yvw\y)'
                 when 'Chevrolet' then '(chevrolet|chevy)'
                 when 'Mercedes-Benz' then '(mercedes|benz)'
                 when 'Land Rover' then '(land rover|range rover)'
                 else v.make end)
               or l.title ~* ('\y' || split_part(v.model, ' ', 1) || '\y'))) as limpio
  from tracked_combos c
  join vehicles v on v.id = c.vehicle_id
  join part_types p on p.id = c.part_type_id
  left join listings l on l.combo_id = c.id
  left join lateral (
    select price from listing_snapshots
    where item_id = l.item_id order by snapshot_date desc limit 1
  ) s on true
  where c.active
), base2 as (
  select b.*, count(*) filter (where limpio and ended_at is null) over (partition by combo_id) as count_limpio
  from base b
)
select combo_id, part_type_id, vehiculo, make, model, year_start, year_end,
       pieza, pull_minutes, ship_class,
       count(item_id) filter (where ended_at is null) as competencia,
       percentile_cont(0.5) within group (order by price::double precision) filter (where ended_at is null) as precio_mediano,
       count(item_id) filter (where ended_at >= now() - interval '7 days') as vendidos_7d,
       count(item_id) filter (where ended_at >= now() - interval '30 days') as vendidos_30d,
       (array_agg(image_url order by last_seen desc) filter (where ended_at is null and image_url is not null))[1] as foto,
       (array_agg(url order by last_seen desc) filter (where ended_at is null and url is not null))[1] as ebay_url,
       last_checked_at,
       min(price) filter (where ended_at is null and (limpio or count_limpio < 3)) as precio_min,
       least(
         coalesce((array_agg(price order by price asc) filter (where ended_at is null and (limpio or count_limpio < 3)))[3],
                  min(price) filter (where ended_at is null and (limpio or count_limpio < 3))),
         percentile_cont(0.5) within group (order by price::double precision) filter (where ended_at is null)
       ) as precio_piso,
       coalesce((array_agg(url order by price asc) filter (where ended_at is null and (limpio or count_limpio < 3) and url is not null))[3],
                (array_agg(url order by price asc) filter (where ended_at is null and (limpio or count_limpio < 3) and url is not null))[1]) as url_mas_barato,
       coalesce((array_agg(seller order by price asc) filter (where ended_at is null and (limpio or count_limpio < 3)))[3],
                (array_agg(seller order by price asc) filter (where ended_at is null and (limpio or count_limpio < 3)))[1]) as vendedor_mas_barato,
       percentile_cont(0.5) within group (order by price::double precision) filter (where ended_at >= now() - interval '30 days') as precio_vendido,
       -- envío del listado del piso (null = eBay no lo dijo, se asumió la clase)
       coalesce((array_agg(shipping order by price asc) filter (where ended_at is null and (limpio or count_limpio < 3)))[3],
                (array_agg(shipping order by price asc) filter (where ended_at is null and (limpio or count_limpio < 3)))[1]) as envio_mas_barato,
       count(item_id) filter (where ended_at is null and shipping is not null) as con_envio_conocido
from base2
group by combo_id, part_type_id, vehiculo, make, model, year_start, year_end, pieza, pull_minutes, ship_class, last_checked_at;

drop view if exists hot_list;
create view hot_list as
select cs.vehiculo, cs.pieza, cs.vendidos_30d,
       round(cs.precio_mediano::numeric, 0) as precio_objetivo,
       cs.competencia, cs.ship_class, pt.search_keyword as keyword,
       round((cs.vendidos_30d * coalesce(cs.precio_mediano, 0) / greatest(cs.pull_minutes, 1))::numeric, 1) as score,
       case when cs.vendidos_30d >= 4 and cs.competencia < 30 then '🔥'
            when cs.competencia >= 60 then '⚠️ mucha competencia'
            when cs.vendidos_30d = 0 then '❌ no se mueve'
            else '·' end as semaforo,
       cs.foto, cs.ebay_url,
       round((h.price + h.core) * 1.06, 2) as costo_yarda,
       fn_ganancia(sug.p, cs.ship_class, h.price + h.core) as ganancia_neta,
       fn_rentabilidad(fn_ganancia(sug.p, cs.ship_class, h.price + h.core)) as rentabilidad,
       round((e.price + e.core) * 1.06, 2) as costo_ez,
       fn_ganancia(sug.p, cs.ship_class, e.price + e.core) as ganancia_ez,
       fn_rentabilidad(fn_ganancia(sug.p, cs.ship_class, e.price + e.core)) as rentabilidad_ez,
       round(cs.precio_min::numeric, 0) as precio_min,
       round(cs.precio_piso::numeric, 0) as precio_piso,
       round(cs.precio_mediano::numeric, 0) as precio_tipico,
       sug.p as precio_sugerido,
       cs.url_mas_barato, cs.vendedor_mas_barato,
       round(cs.precio_vendido::numeric, 0) as precio_vendido,
       round(cs.envio_mas_barato::numeric, 0) as envio_mas_barato,
       cs.con_envio_conocido
from combo_stats cs
join part_types pt on pt.id = cs.part_type_id
left join yard_prices h on h.part_type_id = cs.part_type_id and h.yard = 'HAZLE TOWNSHIP'
left join yard_prices e on e.part_type_id = cs.part_type_id and e.yard = 'EZ PULL'
cross join lateral (select round((cs.precio_piso * 0.95)::numeric, 0) as p) sug
order by fn_ganancia(sug.p, cs.ship_class, h.price + h.core) desc nulls last,
         round((cs.vendidos_30d * coalesce(cs.precio_mediano, 0) / greatest(cs.pull_minutes, 1))::numeric, 1) desc;
