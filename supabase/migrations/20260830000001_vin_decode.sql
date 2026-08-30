-- Detalles del vehículo decodificados del VIN (API pública NHTSA vPIC).
-- El trim/motor/tracción afinan el valor de las piezas (xenón vs halógeno,
-- AWD vs FWD) y alimentarán los borradores de listados de eBay.

alter table yard_inventory add column if not exists trim        text;
alter table yard_inventory add column if not exists engine      text;  -- ej. "2.5L 4cyl Gasoline"
alter table yard_inventory add column if not exists drive_type  text;  -- ej. "AWD"
alter table yard_inventory add column if not exists body_class  text;
alter table yard_inventory add column if not exists vin_decoded_at timestamptz;

create index if not exists idx_yard_vin_pending
  on yard_inventory (vin_decoded_at) where vin_decoded_at is null;

drop view if exists yarda_ahora;
create view yarda_ahora as
select
  yi.vin,
  yi.yard,
  yi.year, yi.make, yi.model, yi.color,
  yi.row_number,
  yi.yard_date,
  yi.trim, yi.engine, yi.drive_type,
  v.label as vehiculo
from yard_inventory yi
join vehicles v on v.id = yi.matched_vehicle_id
where yi.left_at is null
order by yi.yard_date desc nulls last;
