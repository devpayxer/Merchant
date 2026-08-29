-- Foto de referencia y link a eBay por combo.
-- El usuario no es mecánico: necesita VER la pieza para reconocerla
-- en la yarda. Se toma la foto del listado activo más reciente.

alter table listings add column if not exists image_url text;

drop view if exists hot_list;
drop view if exists combo_stats;

create view combo_stats as
select
  c.id                                        as combo_id,
  v.label                                     as vehiculo,
  v.make, v.model, v.year_start, v.year_end,
  p.name_es                                   as pieza,
  p.pull_minutes,
  p.ship_class,
  count(l.item_id) filter (where l.ended_at is null)          as competencia,
  percentile_cont(0.5) within group (order by s.price)
    filter (where l.ended_at is null)                          as precio_mediano,
  count(l.item_id) filter (where l.ended_at >= now() - interval '7 days')  as vendidos_7d,
  count(l.item_id) filter (where l.ended_at >= now() - interval '30 days') as vendidos_30d,
  (array_agg(l.image_url order by l.last_seen desc)
    filter (where l.ended_at is null and l.image_url is not null))[1]      as foto,
  (array_agg(l.url order by l.last_seen desc)
    filter (where l.ended_at is null and l.url is not null))[1]            as ebay_url,
  c.last_checked_at
from tracked_combos c
join vehicles   v on v.id = c.vehicle_id
join part_types p on p.id = c.part_type_id
left join listings l on l.combo_id = c.id
left join lateral (
  select price from listing_snapshots
  where item_id = l.item_id
  order by snapshot_date desc limit 1
) s on true
where c.active
group by c.id, v.label, v.make, v.model, v.year_start, v.year_end,
         p.name_es, p.pull_minutes, p.ship_class, c.last_checked_at;

create view hot_list as
select
  vehiculo, pieza,
  vendidos_30d,
  round(precio_mediano::numeric, 0)           as precio_objetivo,
  competencia,
  ship_class,
  round(((vendidos_30d * coalesce(precio_mediano, 0)) / greatest(pull_minutes, 1))::numeric, 1) as score,
  case
    when vendidos_30d >= 4 and competencia < 30 then '🔥'
    when competencia >= 60                       then '⚠️ mucha competencia'
    when vendidos_30d = 0                        then '❌ no se mueve'
    else '·'
  end as semaforo,
  foto,
  ebay_url
from combo_stats
order by score desc;
