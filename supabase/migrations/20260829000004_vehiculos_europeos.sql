-- Vehículos europeos comunes de yarda (por generación).
-- Las piezas europeas usadas pagan bien en eBay y hay menos
-- competencia de vendedores que en las marcas japonesas.

insert into vehicles (make, model, year_start, year_end) values
('BMW','3 Series',2006,2011),            -- E90
('BMW','3 Series',2012,2018),            -- F30
('BMW','X3',2011,2017),
('Mercedes-Benz','C-Class',2008,2014),   -- W204
('Mercedes-Benz','C-Class',2015,2021),   -- W205
('Mercedes-Benz','E-Class',2010,2016),   -- W212
('Volvo','XC90',2003,2014),
('Volvo','S60',2011,2018),
('Mini','Cooper',2007,2013),             -- R56
('Mini','Cooper',2014,2021),             -- F56
('Audi','A4',2009,2016),                 -- B8
('Audi','Q5',2009,2017)
on conflict do nothing;

-- Generar los combos que falten (mismo bloque final de seed.sql)
insert into tracked_combos (vehicle_id, part_type_id)
select v.id, p.id
from vehicles v cross join part_types p
where v.active and p.active
on conflict do nothing;

-- Misma priorización que el seed: luces y espejos primero
update tracked_combos c set priority = 1
from part_types p
where p.id = c.part_type_id
  and p.name_es in ('Faro derecho','Faro izquierdo','Calavera derecha',
                    'Calavera izquierda','Espejo lateral derecho','Espejo lateral izquierdo');
