-- Carriles de rastreo (aprobado 30 ago 2026): el presupuesto de eBay se
-- concentra en los modelos con presencia real en las yardas.
--   priority 1 = carril rápido: modelos con >= 5 carros vivos entre ambas
--                yardas (~129 modelos / ~7,095 combos, ciclo ~2.2 días)
--   priority 2 = carril lento: el resto (~2,255 combos, ciclo ~6 días)
-- refresh_yard_matches() ya corre tras cada yard-sync (cada 3h), así que
-- los carriles siguen el inventario real automáticamente. Sustituye la
-- priorización original por tipo de pieza (luces/espejos), que solo
-- decidía el orden del primer barrido.

create or replace function refresh_yard_matches()
returns int language plpgsql as $$
declare n int;
begin
  update yard_inventory yi
  set matched_vehicle_id = match_vehicle(yi.make, yi.model, yi.year)
  where yi.left_at is null;
  get diagnostics n = row_count;

  update tracked_combos tc
  set priority = p.pri
  from (
    select tc2.id, case when v.vid is not null then 1 else 2 end as pri
    from tracked_combos tc2
    left join (
      select matched_vehicle_id as vid
      from yard_inventory
      where left_at is null and matched_vehicle_id is not null
      group by 1
      having count(*) >= 5
    ) v on v.vid = tc2.vehicle_id
  ) p
  where p.id = tc.id and tc.priority is distinct from p.pri;

  return n;
end $$;

select refresh_yard_matches();
