-- Precios de yarda para las 11 piezas nuevas (ids 56-66), leídos de las
-- MISMAS fotos de las listas impresas ya cargadas (31 ago 2026). En la
-- primera carga solo se maparon las filas que coincidían con las 55
-- piezas originales; estas filas siempre estuvieron en las listas.

-- Harry's U-Pull It (HAZLE TOWNSHIP) — price + core
insert into yard_prices (yard, part_type_id, price, core, nota) values
('HAZLE TOWNSHIP', 56, 55.00, 3.00, 'Fender (No Accessories)'),
('HAZLE TOWNSHIP', 57, 55.00, 3.00, 'Fender (No Accessories)'),
('HAZLE TOWNSHIP', 58, 30.00, 2.00, 'Electric Cooling Fan (Single); Double = 40.00'),
('HAZLE TOWNSHIP', 59, 37.70, 2.00, 'Fuel Pump (Electronic); Mechanical = 11.70'),
('HAZLE TOWNSHIP', 60, 22.10, 1.00, 'Sun Roof Motor'),
('HAZLE TOWNSHIP', 61, 20.80, 0,    'Latch (with Power Actuator); Trunk Latch simple = 9.10'),
('HAZLE TOWNSHIP', 62, 13.00, 0,    'Hood Latch'),
('HAZLE TOWNSHIP', 63, 16.90, 0,    'Ignition Switch'),
('HAZLE TOWNSHIP', 64, 16.90, 0,    'Steering Wheel (No Bag); w/ Controls = 26.00'),
('HAZLE TOWNSHIP', 65, 22.10, 0,    'Turn Signal Switch'),
('HAZLE TOWNSHIP', 66, 90.00, 5.00, 'Turbo Unit; Intercooler = 50.70 + 3.00')
on conflict (yard, part_type_id) do update
  set price = excluded.price, core = excluded.core, nota = excluded.nota;

-- EZ Pull & Save — precios planos sin core
insert into yard_prices (yard, part_type_id, price, core, nota) values
('EZ PULL', 56, 35.00, 0, 'Fender (Bare)'),
('EZ PULL', 57, 35.00, 0, 'Fender (Bare)'),
('EZ PULL', 58, 10.00, 0, 'Electric Cooling Fan (Single); Double = 20.00'),
('EZ PULL', 59, 15.00, 0, 'Fuel Pump (In Tank); External = 10.00'),
('EZ PULL', 60, 10.00, 0, 'Sunroof Motor'),
('EZ PULL', 61,  5.00, 0, 'no listado; como Door Latch'),
('EZ PULL', 62,  5.00, 0, 'no listado; como Door Latch'),
('EZ PULL', 63, 10.00, 0, 'Switch (4wd, Headlight, Window, etc.)'),
('EZ PULL', 64, 20.00, 0, 'Steering Wheel (No Air Bag): lista dice 10.00-20.00, usamos tope'),
('EZ PULL', 65, 20.00, 0, 'Turn Signal Switch (Double)'),
('EZ PULL', 66, 50.00, 0, 'Turbo Unit; Intercooler = 20.00')
on conflict (yard, part_type_id) do update
  set price = excluded.price, core = excluded.core, nota = excluded.nota;
