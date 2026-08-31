-- Cierre de la auditoría de cobertura (31 ago 2026): últimos 3 huecos
-- reales. Precios leídos de las mismas fotos de las listas impresas.
-- Con esto el catálogo cubre las categorías de usado OEM que venden en
-- eBay; lo que falta a propósito: suspensión/fricción (desgaste), vidrio
-- (frágil), piezas XL (recogida local), batería híbrida (freight; evaluar
-- como venta local a futuro).

insert into part_types (name_es, search_keyword, ship_class, pull_minutes, notes) values
('Múltiple de escape', 'exhaust manifold OEM',     'L', 40, 'Se agrietan: Subaru y trucks; poco aftermarket'),
('Tapa de válvulas',   'valve cover OEM',          'M', 25, 'Las de plástico BMW/VW se agrietan (N52 = epidemia)'),
('Booster de frenos',  'power brake booster OEM',  'M', 25, 'No es pieza de fricción; poca competencia usada');

insert into tracked_combos (vehicle_id, part_type_id)
select v.id, p.id
from vehicles v cross join part_types p
where v.active and p.active
on conflict do nothing;

select refresh_yard_matches();

insert into yard_prices (yard, part_type_id, price, core, nota)
select 'HAZLE TOWNSHIP', id, p, c, n from (values
  ('Múltiple de escape', 26.00, 3.00, 'Exhaust Manifold'),
  ('Tapa de válvulas',   16.90, 0.00, 'Valve Cover'),
  ('Booster de frenos',  31.20, 1.00, 'Power Brake Booster - Car; Truck = 49.40 + 2.00')
) v(nombre, p, c, n) join part_types on name_es = v.nombre
on conflict (yard, part_type_id) do update
  set price = excluded.price, core = excluded.core, nota = excluded.nota;

insert into yard_prices (yard, part_type_id, price, core, nota)
select 'EZ PULL', id, p, 0, n from (values
  ('Múltiple de escape', 15.00, 'Exhaust Manifold'),
  ('Tapa de válvulas',   15.00, 'Valve Cover'),
  ('Booster de frenos',  20.00, 'Power Brake Booster or Hydro-Vac')
) v(nombre, p, n) join part_types on name_es = v.nombre
on conflict (yard, part_type_id) do update
  set price = excluded.price, core = excluded.core, nota = excluded.nota;
