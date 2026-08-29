-- =============================================================
-- EBAY PARTS RADAR — Esquema Supabase
-- 5 tablas + 2 vistas de métricas
-- Ejecutar en: SQL Editor de Supabase
-- =============================================================

-- 1. VEHÍCULOS (por generación, no por año individual)
create table vehicles (
  id            bigint generated always as identity primary key,
  make          text not null,
  model         text not null,
  year_start    int  not null,
  year_end      int  not null,
  label         text generated always as (make || ' ' || model || ' ' || year_start::text || '-' || year_end::text) stored,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (make, model, year_start)
);

-- 2. TIPOS DE PIEZA
create table part_types (
  id               bigint generated always as identity primary key,
  name_es          text not null,            -- para mostrar en la app
  search_keyword   text not null,            -- lo que se manda a eBay (inglés)
  ebay_category_id text,                     -- leaf category si la conoces; null = usa 6028
  pull_minutes     int  not null default 20, -- minutos estimados de desmontaje
  ship_class       text not null default 'M' -- S(<1lb) M(1-5lb) L(5-20lb) XL(voluminoso)
    check (ship_class in ('S','M','L','XL')),
  active           boolean not null default true,
  notes            text
);

-- 3. COMBOS A MONITOREAR (vehículo × pieza)
create table tracked_combos (
  id              bigint generated always as identity primary key,
  vehicle_id      bigint not null references vehicles(id) on delete cascade,
  part_type_id    bigint not null references part_types(id) on delete cascade,
  priority        int not null default 5,    -- 1 = alta (se refresca primero)
  active          boolean not null default true,
  last_checked_at timestamptz,
  unique (vehicle_id, part_type_id)
);
create index idx_combos_next on tracked_combos (active, last_checked_at nulls first);

-- 4. LISTADOS (dimensión: un row por listado de eBay visto)
create table listings (
  item_id      text primary key,             -- itemId de la Browse API
  combo_id     bigint not null references tracked_combos(id) on delete cascade,
  title        text,
  url          text,
  condition    text,
  seller       text,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  ended_at     timestamptz                   -- se llena cuando desaparece => proxy de venta
);
create index idx_listings_combo on listings (combo_id, ended_at);

-- 5. SNAPSHOTS DE PRECIO (histórico diario por listado)
create table listing_snapshots (
  item_id       text not null references listings(item_id) on delete cascade,
  snapshot_date date not null default current_date,
  price         numeric(10,2) not null,
  primary key (item_id, snapshot_date)
);

-- =============================================================
-- VISTAS DE MÉTRICAS
-- =============================================================

-- Estadísticas por combo: competencia, precio mediano, velocidad
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

-- La lista caliente: qué sacar, ordenado por score
-- score = (vendidos_30d * precio_mediano) / minutos de desmontaje
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
  end as semaforo
from combo_stats
order by score desc;

-- =============================================================
-- SEGURIDAD: RLS activado, sin políticas públicas.
-- La Edge Function usa el service role (bypass).
-- Cuando hagas la app Expo, agrega políticas de solo lectura
-- para usuarios autenticados sobre las vistas/tablas que ocupes.
-- =============================================================
alter table vehicles          enable row level security;
alter table part_types        enable row level security;
alter table tracked_combos    enable row level security;
alter table listings          enable row level security;
alter table listing_snapshots enable row level security;
