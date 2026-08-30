-- Más detalle del VIN: modelo real (328i vs "3 Series"), puertas, HP,
-- y códigos de chasis/motor derivados (E90, N52...) para BMW/Mini/Mercedes.
-- Crítico para valorar piezas europeas y para los títulos de eBay.

alter table yard_inventory add column if not exists model_detail text;  -- "328i"
alter table yard_inventory add column if not exists doors        int;
alter table yard_inventory add column if not exists engine_hp    int;
alter table yard_inventory add column if not exists chassis_code text;  -- "E90"
alter table yard_inventory add column if not exists engine_code  text;  -- "N52"

drop view if exists yarda_ahora;
create view yarda_ahora as
select
  yi.vin,
  yi.yard,
  yi.year, yi.make, yi.model, yi.color,
  yi.row_number,
  yi.yard_date,
  yi.trim, yi.engine, yi.drive_type,
  yi.model_detail, yi.doors, yi.engine_hp, yi.chassis_code, yi.engine_code,
  v.label as vehiculo
from yard_inventory yi
join vehicles v on v.id = yi.matched_vehicle_id
where yi.left_at is null
order by yi.yard_date desc nulls last;

-- Re-decodificar todo el inventario para llenar los campos nuevos
update yard_inventory set vin_decoded_at = null;
