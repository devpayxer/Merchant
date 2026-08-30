-- Precios de EZ Pull & Save (lista impresa fotografiada 30 ago 2026).
-- Precios planos sin core. "Prices DO NOT include PA state sales tax" →
-- mismo ×1.06. yard_prices pasa a ser multi-yarda: pk (yard, part_type_id).

alter table yard_prices add column if not exists yard text not null default 'HAZLE TOWNSHIP';
alter table yard_prices drop constraint yard_prices_pkey;
alter table yard_prices add primary key (yard, part_type_id);

insert into yard_prices (yard, part_type_id, price, core, nota) values
('EZ PULL',  1, 20.00, 0, 'Headlight (Composite)(Any Size)'),
('EZ PULL',  2, 20.00, 0, 'Headlight (Composite)(Any Size)'),
('EZ PULL',  3, 15.00, 0, 'Taillight Assembly (Large = 20)'),
('EZ PULL',  4, 15.00, 0, 'Taillight Assembly (Large = 20)'),
('EZ PULL',  5,  5.00, 0, 'Parking/Marker/Fog Lights'),
('EZ PULL',  6, 10.00, 0, 'Third Brake Light (Small); Large = 20'),
('EZ PULL',  7, 10.00, 0, 'Door Mirror (Car); Truck 15-25, Lighted 15'),
('EZ PULL',  8, 10.00, 0, 'Door Mirror (Car)'),
('EZ PULL',  9,  5.00, 0, 'Door Handle'),
('EZ PULL', 10, 20.00, 0, 'Grille (Large); Small = 15'),
('EZ PULL', 11,  3.00, 0, 'no listado; Miscellaneous Moldings 1-10'),
('EZ PULL', 13, 10.00, 0, 'Antenna (lista marca power = 5, así impreso)'),
('EZ PULL', 14,  5.00, 0, 'Door Handle (no hay fila de tailgate handle)'),
('EZ PULL', 15, 20.00, 0, 'Instrument Cluster'),
('EZ PULL', 16, 20.00, 0, 'Radio w/CD'),
('EZ PULL', 17, 10.00, 0, 'Heater Control'),
('EZ PULL', 18, 10.00, 0, 'Switch (4wd, Headlight, Window, etc.)'),
('EZ PULL', 19, 10.00, 0, 'Switch'),
('EZ PULL', 20, 10.00, 0, 'Switch'),
('EZ PULL', 21, 10.00, 0, 'Switch'),
('EZ PULL', 22, 20.00, 0, 'Computer (ECM/Engine)'),
('EZ PULL', 23, 15.00, 0, 'Modules (All Types) 10-20'),
('EZ PULL', 24, 20.00, 0, 'Fuse Box'),
('EZ PULL', 25,  3.00, 0, 'Alternator: ASI IMPRESO 3.00 — verificar en caja, posible errata por 30.00'),
('EZ PULL', 26, 20.00, 0, 'Starter'),
('EZ PULL', 27, 20.00, 0, 'A/C Compressor'),
('EZ PULL', 28, 30.00, 0, 'Throttle Body'),
('EZ PULL', 29, 15.00, 0, 'Mass Air Flow Sensor'),
('EZ PULL', 30, 10.00, 0, 'Windshield Wiper Motor'),
('EZ PULL', 31, 10.00, 0, 'Heater Motor'),
('EZ PULL', 32, 20.00, 0, 'Power Steering Pump (Electric = 40)'),
('EZ PULL', 33,  5.00, 0, 'Door Lock Motor'),
('EZ PULL', 34, 20.00, 0, 'Window Regulator (No Motor) 10 + Window Motor 10'),
('EZ PULL', 35,  4.00, 0, 'Sun Visor (Interior)'),
('EZ PULL', 36, 10.00, 0, 'Center Console or lid only'),
('EZ PULL', 37, 25.00, 0, 'Wheel (Aluminum) 20-30'),
('EZ PULL', 38, 10.00, 0, 'Switch'),
('EZ PULL', 39, 50.00, 0, 'ABS Unit'),
('EZ PULL', 40, 15.00, 0, 'no listado; como Modules (All Types)'),
('EZ PULL', 41, 15.00, 0, 'Modules (All Types)'),
('EZ PULL', 42, 15.00, 0, 'no listado; como Modules (All Types)'),
('EZ PULL', 43, 20.00, 0, 'Coil Pack (Ignition Coil each = 5)'),
('EZ PULL', 44, 10.00, 0, 'no listado; como Sensors 5-10'),
('EZ PULL', 45, 15.00, 0, 'Modules (All Types)'),
('EZ PULL', 46, 30.00, 0, 'Fuel Injector Each 5 × ~6 (Fuel Injection Unit = 35)'),
('EZ PULL', 47, 10.00, 0, 'Mirror Inside (Electronic/Dimming); simple = 3'),
('EZ PULL', 48,  5.00, 0, 'Door Handle'),
('EZ PULL', 49,  5.00, 0, 'Door Panel (Bare)'),
('EZ PULL', 51, 10.00, 0, 'Seat Headrest 5 × 2 (par)'),
('EZ PULL', 53,  3.00, 0, 'no listado; Miscellaneous Moldings'),
('EZ PULL', 54, 15.00, 0, 'Shifter'),
('EZ PULL', 55,  3.00, 0, 'no listado; Miscellaneous Moldings');
-- Sin precio EZ (no aparecen en su lista): tapa de gasolina (12),
-- guantera (50), portavasos (52) → ganancia_ez queda null.

-- Fórmula compartida
create or replace function fn_ganancia(p_precio numeric, p_ship text, p_costo numeric)
returns numeric language sql immutable as $$
  select case when p_precio is null or p_costo is null then null else
    round(p_precio * 0.85
      - case p_ship when 'S' then 6 when 'M' then 13 when 'L' then 22 else 0 end
      - 2 - p_costo * 1.06, 0) end
$$;

create or replace function fn_rentabilidad(g numeric)
returns text language sql immutable as $$
  select case when g is null then null
              when g >= 40 then 'alta'
              when g >= 15 then 'media'
              else 'baja' end
$$;

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
  round(((h.price + h.core) * 1.06)::numeric, 2)                          as costo_yarda,
  fn_ganancia(cs.precio_mediano::numeric, cs.ship_class, h.price + h.core) as ganancia_neta,
  fn_rentabilidad(fn_ganancia(cs.precio_mediano::numeric, cs.ship_class, h.price + h.core)) as rentabilidad,
  round(((e.price + e.core) * 1.06)::numeric, 2)                          as costo_ez,
  fn_ganancia(cs.precio_mediano::numeric, cs.ship_class, e.price + e.core) as ganancia_ez,
  fn_rentabilidad(fn_ganancia(cs.precio_mediano::numeric, cs.ship_class, e.price + e.core)) as rentabilidad_ez
from combo_stats cs
left join yard_prices h on h.part_type_id = cs.part_type_id and h.yard = 'HAZLE TOWNSHIP'
left join yard_prices e on e.part_type_id = cs.part_type_id and e.yard = 'EZ PULL'
order by ganancia_neta desc nulls last, score desc;
