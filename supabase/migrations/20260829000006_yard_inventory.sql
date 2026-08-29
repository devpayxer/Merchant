-- =============================================================
-- Inventario de la yarda (Harry's U-Pull It — wegotused.com)
-- Se sincroniza con la Edge Function yard-sync (cron).
-- Cruza los carros físicamente en la yarda con los vehículos
-- monitoreados para decir qué piezas sacar.
-- =============================================================

create table yard_inventory (
  vin                text primary key,
  yard               text not null,
  year               int,
  make               text,
  model              text,
  manufacturer       text,
  color              text,
  yard_date          date,              -- cuándo entró a la yarda
  row_number         text,              -- fila donde está el carro
  matched_vehicle_id bigint references vehicles(id) on delete set null,
  first_seen         timestamptz not null default now(),
  last_seen          timestamptz not null default now(),
  left_at            timestamptz        -- ya no aparece en el inventario
);
create index idx_yard_active on yard_inventory (left_at, yard_date desc);

-- Cursor del sync incremental (una sola fila)
create table yard_sync_state (
  id            int primary key default 1 check (id = 1),
  next_page     int not null default 0,     -- páginas 0-indexadas, 15 filas c/u
  total_records int,
  last_run_at   timestamptz
);
insert into yard_sync_state (id) values (1);

-- ¿A cuál vehículo monitoreado corresponde un carro del inventario?
-- La yarda usa modelos comerciales (328I, C300); nosotros generaciones
-- (3 Series, C-Class). Reglas por marca + prefijo como fallback.
create or replace function match_vehicle(p_make text, p_model text, p_year int)
returns bigint language sql stable as $$
  select v.id from vehicles v
  where v.active
    and p_year between v.year_start and v.year_end
    and upper(v.make) = case
          when upper(p_make) in ('MERCEDES','MERCEDES-BENZ','MERCEDES BENZ') then 'MERCEDES-BENZ'
          when upper(p_make) in ('MINI','MINI COOPER') then 'MINI'
          when upper(p_make) in ('VW','VOLKSWAGEN') then 'VOLKSWAGEN'
          when upper(p_make) in ('CHEVY','CHEVROLET') then 'CHEVROLET'
          else upper(p_make)
        end
    and (
      upper(v.model) = upper(p_model)
      -- BMW: 328I -> 3 SERIES, 528XI -> 5 SERIES, 750LI -> 7 SERIES, 228I -> 2 SERIES
      or (upper(v.make) = 'BMW'
          and upper(p_model) ~ '^[2357][0-9][0-9]'
          and upper(v.model) = left(upper(p_model), 1) || ' SERIES')
      -- Mercedes: C300 -> C-CLASS, E350 -> E-CLASS, S550 -> S-CLASS
      or (upper(v.make) = 'MERCEDES-BENZ'
          and upper(p_model) ~ '^[CES][0-9]{3}'
          and upper(v.model) = left(upper(p_model), 1) || '-CLASS')
      -- Prefijos: SILVERADO -> SILVERADO 1500, ACCORD CROSSTOUR -> ACCORD
      or upper(p_model) like upper(v.model) || '%'
      or upper(v.model) like upper(p_model) || '%'
    )
  order by v.id
  limit 1
$$;

-- Recalcular el cruce de todo el inventario activo
-- (se llama tras cada sync y cuando se agregan vehículos nuevos)
create or replace function refresh_yard_matches()
returns int language sql as $$
  with upd as (
    update yard_inventory yi
    set matched_vehicle_id = match_vehicle(yi.make, yi.model, yi.year)
    where yi.left_at is null
    returning 1
  )
  select count(*)::int from upd
$$;

-- Lo que hay AHORITA en la yarda y está en el radar
create view yarda_ahora as
select
  yi.vin,
  yi.yard,
  yi.year, yi.make, yi.model, yi.color,
  yi.row_number,
  yi.yard_date,
  v.label as vehiculo
from yard_inventory yi
join vehicles v on v.id = yi.matched_vehicle_id
where yi.left_at is null
order by yi.yard_date desc nulls last;

-- Seguridad: mismas reglas que el resto — anon solo lee
alter table yard_inventory  enable row level security;
alter table yard_sync_state enable row level security;
create policy "anon read yard_inventory" on yard_inventory for select using (true);
