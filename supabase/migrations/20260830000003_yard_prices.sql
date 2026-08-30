-- Precios de la yarda Harry's U-Pull It (lista impresa 2025, fotografiada
-- por el dueño el 30 ago 2026). price = precio de lista; core = depósito
-- de núcleo que SÍ se paga porque no se entrega pieza vieja a cambio.
-- Costo real = price + core. Notas de mapeo en cada fila.

create table yard_prices (
  part_type_id bigint primary key references part_types(id) on delete cascade,
  price        numeric(10,2) not null,
  core         numeric(10,2) not null default 0,
  nota         text,
  updated_at   timestamptz not null default now()
);
alter table yard_prices enable row level security;
create policy "anon read yard_prices" on yard_prices for select using (true);

insert into yard_prices (part_type_id, price, core, nota) values
( 1, 42.00,  0, 'Headlight Assembly (Composite)'),
( 2, 42.00,  0, 'Headlight Assembly (Composite)'),
( 3, 24.00,  0, 'Tail Light $2/pulgada, ~12in típica'),
( 4, 24.00,  0, 'Tail Light $2/pulgada, ~12in típica'),
( 5, 13.00,  0, 'Foglight'),
( 6, 10.40,  0, '3rd Brake Light'),
( 7, 26.00,  0, 'Mirror Outside Remote (Power)'),
( 8, 26.00,  0, 'Mirror Outside Remote (Power)'),
( 9,  9.10,  0, 'Door Handle (Inside/Outside)'),
(10, 30.00,  0, 'Grill: lista dice 25.00-40.00, usamos 30'),
(11,  3.90,  0, 'Emblem'),
(12,  9.10,  0, 'Gas / Fuel Door'),
(13,  6.50,  0, 'Antenna (Manual); Power = 20.80+1'),
(14,  9.10,  0, 'Door Handle (no hay fila de tailgate handle)'),
(15, 55.00,  0, 'Instrument Cluster'),
(16, 40.00,  0, 'Radio with CD (Factory); Navigation/DVD = 59.80'),
(17, 20.80,  0, 'Climate Control'),
(18, 20.80,  0, 'Master Switch'),
(19, 13.00,  0, 'Headlight Switch (Dash)'),
(20,  5.20,  0, 'Single Switch'),
(21, 16.90,  0, 'Ignition Switch'),
(22, 40.30,  3.00, 'Computer (Engine, ECM)'),
(23, 33.80,  2.00, 'Body/Trans Module'),
(24, 33.80,  0, 'Fuse Box (Bare)'),
(25, 33.80,  5.00, 'Alternator'),
(26, 29.90,  7.00, 'Starter'),
(27, 35.10, 10.00, 'A/C Compressor'),
(28, 55.00,  2.00, 'Throttle Body (Electric); mecánico = 44.20'),
(29, 33.80,  2.00, 'Mass Air Flow'),
(30, 26.00,  1.00, 'Wiper Motor'),
(31, 26.00,  2.00, 'Heater Motor'),
(32, 33.80,  2.00, 'Power Steering Pump (No Lines)'),
(33, 15.00,  0, 'Door Latch Power'),
(34, 40.00,  2.00, 'Window Regulator (With Motor)'),
(35,  9.10,  0, 'Sun Visor'),
(36,  9.10,  0, 'Console Lid'),
(37, 33.80, 10.00, 'Wheel (Aluminum/Styled - No Tire)'),
(38, 13.00,  0, 'Seat / Window Control'),
(39, 76.70,  5.00, 'ABS Unit'),
(40, 26.00,  0, 'Headlight Ballast (HID)'),
(41, 33.80,  2.00, 'Body/Trans Module'),
(42, 26.00,  0, 'Amplifier'),
(43, 40.00,  2.00, 'Coil Pack'),
(44, 33.80,  0, 'Back Up Camera'),
(45, 20.80,  2.00, 'Module'),
(46, 65.00,  0, 'Fuel Injector Unit (4,6,8)'),
(47, 11.70,  0, 'Mirror (Rear View w/ Lights)'),
(48,  9.10,  0, 'Door Handle (Inside/Outside)'),
(49, 14.30,  0, 'Door Panel'),
(50, 10.40,  0, 'Glove Box'),
(51, 18.20,  0, 'Head Rest 9.10 x 2 (par)'),
(52,  6.50,  0, 'Cup Holder'),
(53,  9.10,  0, 'Dash Bezel (Bare)'),
(54,  5.20,  0, 'Shifter Knob'),
(55,  5.00,  0, 'Dash Vent');

-- Vistas: exponer part_type_id y calcular ganancia neta con la fórmula
-- acordada: precio*0.85 − envío por clase (S 6 / M 13 / L 22) − $2 empaque
-- − costo de yarda (price+core).
drop view if exists hot_list;
drop view if exists combo_stats;

create view combo_stats as
select
  c.id                                        as combo_id,
  p.id                                        as part_type_id,
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
group by c.id, p.id, v.label, v.make, v.model, v.year_start, v.year_end,
         p.name_es, p.pull_minutes, p.ship_class, c.last_checked_at;

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
  yp.price + yp.core                          as costo_yarda,
  case
    when cs.precio_mediano is not null and yp.price is not null then
      round((cs.precio_mediano * 0.85
        - case cs.ship_class when 'S' then 6 when 'M' then 13 when 'L' then 22 else 0 end
        - 2
        - (yp.price + yp.core))::numeric, 0)
  end as ganancia_neta,
  case
    when cs.precio_mediano is null or yp.price is null then null
    when (cs.precio_mediano * 0.85
        - case cs.ship_class when 'S' then 6 when 'M' then 13 when 'L' then 22 else 0 end
        - 2 - (yp.price + yp.core)) >= 40 then 'alta'
    when (cs.precio_mediano * 0.85
        - case cs.ship_class when 'S' then 6 when 'M' then 13 when 'L' then 22 else 0 end
        - 2 - (yp.price + yp.core)) >= 15 then 'media'
    else 'baja'
  end as rentabilidad
from combo_stats cs
left join yard_prices yp on yp.part_type_id = cs.part_type_id
order by ganancia_neta desc nulls last, score desc;
