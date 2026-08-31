-- 3 piezas mecánicas de alto volumen/valor en eBay (auditoría 31 ago 2026
-- contra categorías top de ventas: calipers, intake manifold, steering rack).
-- Descartados a propósito: balatas/rotores/tambores (desgaste, sin mercado
-- usado), llantas (envío pesado + responsabilidad, venta local), y
-- mantenimiento (filtros/bujías/plumas = negocio de piezas NUEVAS).

insert into part_types (name_es, search_keyword, ship_class, pull_minutes, notes) values
('Caliper de frenos',      'brake caliper OEM',                    'M', 20, 'Precio por caliper; Brembo/deportivos valen mucho más'),
('Múltiple de admisión',   'intake manifold OEM',                  'L', 35, 'Los de plástico se agrietan: alta reposición'),
('Cremallera de dirección','power steering rack and pinion OEM',   'L', 60, 'Larga y pesada: confirmar costo real de envío antes de listar');

insert into tracked_combos (vehicle_id, part_type_id)
select v.id, p.id
from vehicles v cross join part_types p
where v.active and p.active
on conflict do nothing;

select refresh_yard_matches();

-- Precios (leídos de las listas impresas fotografiadas)
insert into yard_prices (yard, part_type_id, price, core, nota)
select 'HAZLE TOWNSHIP', id, p, c, n from (values
  ('Caliper de frenos',       25.00, 3.00, 'Caliper; Electric = 59.80 + 4.00'),
  ('Múltiple de admisión',    42.90, 4.00, 'Intake Manifold; Plenum = 33.80'),
  ('Cremallera de dirección', 50.70, 5.00, 'Steering Rack & Pinion (Power Complete); Electric = 67.60 + 5.00')
) v(nombre, p, c, n) join part_types on name_es = v.nombre
on conflict (yard, part_type_id) do update
  set price = excluded.price, core = excluded.core, nota = excluded.nota;

insert into yard_prices (yard, part_type_id, price, core, nota)
select 'EZ PULL', id, p, 0, n from (values
  ('Caliper de frenos',       10.00, 'Caliper'),
  ('Múltiple de admisión',    15.00, 'Intake Manifold (Bare)'),
  ('Cremallera de dirección', 20.00, 'Steering Rack & Pinion (No Motor)')
) v(nombre, p, n) join part_types on name_es = v.nombre
on conflict (yard, part_type_id) do update
  set price = excluded.price, core = excluded.core, nota = excluded.nota;
