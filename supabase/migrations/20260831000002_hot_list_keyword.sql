-- Exponer search_keyword en hot_list para que la web construya el link
-- "vendidos reales" de eBay (búsqueda web con LH_Sold=1&LH_Complete=1 —
-- el dato sold no existe en Browse API; Marketplace Insights es de acceso
-- restringido, así que el deep link es la vía gratis).

drop view if exists hot_list;
create view hot_list as
select
  cs.vehiculo, cs.pieza,
  cs.vendidos_30d,
  round(cs.precio_mediano::numeric, 0)        as precio_objetivo,
  cs.competencia,
  cs.ship_class,
  pt.search_keyword                            as keyword,
  round(((cs.vendidos_30d * coalesce(cs.precio_mediano, 0)) / greatest(cs.pull_minutes, 1))::numeric, 1) as score,
  case
    when cs.vendidos_30d >= 4 and cs.competencia < 30 then '🔥'
    when cs.competencia >= 60                          then '⚠️ mucha competencia'
    when cs.vendidos_30d = 0                           then '❌ no se mueve'
    else '·'
  end as semaforo,
  cs.foto,
  cs.ebay_url,
  round(((h.price + h.core) * 1.06)::numeric, 2)                          as costo_yarda,
  fn_ganancia(cs.precio_mediano::numeric, cs.ship_class, h.price + h.core) as ganancia_neta,
  fn_rentabilidad(fn_ganancia(cs.precio_mediano::numeric, cs.ship_class, h.price + h.core)) as rentabilidad,
  round(((e.price + e.core) * 1.06)::numeric, 2)                          as costo_ez,
  fn_ganancia(cs.precio_mediano::numeric, cs.ship_class, e.price + e.core) as ganancia_ez,
  fn_rentabilidad(fn_ganancia(cs.precio_mediano::numeric, cs.ship_class, e.price + e.core)) as rentabilidad_ez
from combo_stats cs
join part_types pt on pt.id = cs.part_type_id
left join yard_prices h on h.part_type_id = cs.part_type_id and h.yard = 'HAZLE TOWNSHIP'
left join yard_prices e on e.part_type_id = cs.part_type_id and e.yard = 'EZ PULL'
order by ganancia_neta desc nulls last, score desc;
