-- Más piezas de alto valor (pedido del dueño 30 ago 2026).
-- Reglas respetadas: SIN airbags ni relacionados (el volante va SIN bolsa
-- y sin clock spring), sin catalizadores, sin piezas de emisiones.
-- Sin precio de yarda todavía: pedir al dueño las filas de las listas
-- impresas de Harry's y EZ para estas piezas (ganancia queda null mientras).

insert into part_types (name_es, search_keyword, ship_class, pull_minutes, notes) values
('Fender derecho',          'right front fender OEM',                 'L', 30, 'Pintado del color del carro = premium (ahorra pintura al comprador)'),
('Fender izquierdo',        'left front fender OEM',                  'L', 30, 'Pintado del color del carro = premium (ahorra pintura al comprador)'),
('Ventilador de radiador',  'radiator cooling fan assembly OEM',      'L', 25, null),
('Bomba de gasolina',       'fuel pump assembly module OEM',          'M', 30, null),
('Motor de sunroof',        'sunroof motor OEM',                      'S', 25, null),
('Chapa de cajuela',        'trunk lid latch lock actuator OEM',      'S', 15, null),
('Chapa de cofre',          'hood latch OEM',                         'S', 15, null),
('Switch de ignición',      'ignition switch OEM',                    'S', 20, 'Con llave si el carro la tiene'),
('Volante (sin airbag)',    'steering wheel OEM',                     'M', 20, 'SOLO el volante: sin bolsa de aire y sin clock spring (política eBay)'),
('Palanca de direccionales','turn signal combination switch OEM',     'S', 20, 'Solo el switch; NO incluir clock spring'),
('Turbocargador',           'turbocharger turbo OEM',                 'L', 45, 'Alto valor: BMW N55/N20, VW 2.0T, Ford EcoBoost');

-- Combos nuevos para todos los vehículos activos
insert into tracked_combos (vehicle_id, part_type_id)
select v.id, p.id
from vehicles v cross join part_types p
where v.active and p.active
on conflict do nothing;

-- Asignarles carril (rápido/lento) según el inventario vivo
select refresh_yard_matches();
