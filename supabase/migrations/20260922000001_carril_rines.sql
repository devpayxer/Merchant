-- 22 sep 2026: decisión del dueño — el radar de eBay se concentra en RINES.
-- Carril 1 = rines de vehículos con >=1 carro vivo en alguna yarda (~680)
-- Carril 2 = rines sin carro vivo (~49)
-- Carril 3 = todas las demás piezas: ESTACIONADAS (no se borran; para
--            reactivarlas, volver a la regla por número de carros vivos).
-- Con BATCH_FAST=30 × 24 corridas/día, cada rin se refresca a diario.
update part_types set ebay_category_id = '43953' -- Car & Truck Wheels (hoja)
 where name_es like 'Rin%';

create or replace function refresh_yard_matches() returns integer
language plpgsql as $$
declare n int;
begin
  update yard_inventory yi
  set matched_vehicle_id = match_vehicle(yi.make, yi.model, yi.year)
  where yi.left_at is null;
  get diagnostics n = row_count;

  update tracked_combos tc
  set priority = p.pri
  from (
    select tc2.id,
           case when pt.name_es not like 'Rin%' then 3
                when coalesce(v.n, 0) >= 1 then 1
                else 2 end as pri
    from tracked_combos tc2
    join part_types pt on pt.id = tc2.part_type_id
    left join (
      select matched_vehicle_id as vid, count(*) as n
      from yard_inventory
      where left_at is null and matched_vehicle_id is not null
      group by 1
    ) v on v.vid = tc2.vehicle_id
  ) p
  where p.id = tc.id and tc.priority is distinct from p.pri;

  return n;
end $$;

select refresh_yard_matches();
