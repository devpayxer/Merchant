-- Tapetes OEM (set de 4) — pedido del dueño 31 ago 2026. Baratísimos en
-- yarda (se cobran por pieza: Harry's 2.60, EZ 2.00) y los sets OEM con
-- logo se venden $35-70. Solo valen limpios y completos.

insert into part_types (name_es, search_keyword, ship_class, pull_minutes, notes) values
('Tapetes (set)', 'OEM floor mats set', 'M', 10,
 'Set completo de 4; solo limpios, sin agujeros. Con logo del carro valen más');

insert into tracked_combos (vehicle_id, part_type_id)
select v.id, p.id
from vehicles v cross join part_types p
where v.active and p.active
on conflict do nothing;

select refresh_yard_matches();

insert into yard_prices (yard, part_type_id, price, core, nota)
select 'HAZLE TOWNSHIP', id, 10.40, 0, 'Floor Mats (Each) 2.60 × 4'
from part_types where name_es = 'Tapetes (set)'
on conflict (yard, part_type_id) do update
  set price = excluded.price, core = excluded.core, nota = excluded.nota;

insert into yard_prices (yard, part_type_id, price, core, nota)
select 'EZ PULL', id, 8.00, 0, 'Floor Mats Each 2.00 × 4'
from part_types where name_es = 'Tapetes (set)'
on conflict (yard, part_type_id) do update
  set price = excluded.price, core = excluded.core, nota = excluded.nota;
