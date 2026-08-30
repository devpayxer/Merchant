-- Harry's cobra el sales tax de PA (6%) en el registro: el costo real de
-- cada pieza es (price + core) × 1.06. La cuota de entrada ($2/visita) NO
-- se prorratea por pieza (distorsionaría el cálculo); es costo de visita.

drop view if exists hot_list;

create view hot_list as
select
  cs.vehiculo, cs.pieza,
  cs.vendidos_30d,
  round(cs.precio_mediano::numeric, 0)        as precio_objetivo,
  cs.competencia,
  cs.ship_class,
  round(((cs.vendidos_30d * coalesce(cs.precio_mediano, 0)) / greatest(cs.pull_minutes, 1))::numeric, 1) as score,
  case
    when cs.vendidos_30d >= 4 and cs.competencia < 30 then '🔥'
    when cs.competencia >= 60                          then '⚠️ mucha competencia'
    when cs.vendidos_30d = 0                           then '❌ no se mueve'
    else '·'
  end as semaforo,
  cs.foto,
  cs.ebay_url,
  round(((yp.price + yp.core) * 1.06)::numeric, 2) as costo_yarda,
  case
    when cs.precio_mediano is not null and yp.price is not null then
      round((cs.precio_mediano * 0.85
        - case cs.ship_class when 'S' then 6 when 'M' then 13 when 'L' then 22 else 0 end
        - 2
        - (yp.price + yp.core) * 1.06)::numeric, 0)
  end as ganancia_neta,
  case
    when cs.precio_mediano is null or yp.price is null then null
    when (cs.precio_mediano * 0.85
        - case cs.ship_class when 'S' then 6 when 'M' then 13 when 'L' then 22 else 0 end
        - 2 - (yp.price + yp.core) * 1.06) >= 40 then 'alta'
    when (cs.precio_mediano * 0.85
        - case cs.ship_class when 'S' then 6 when 'M' then 13 when 'L' then 22 else 0 end
        - 2 - (yp.price + yp.core) * 1.06) >= 15 then 'media'
    else 'baja'
  end as rentabilidad
from combo_stats cs
left join yard_prices yp on yp.part_type_id = cs.part_type_id
order by ganancia_neta desc nulls last, score desc;
