-- Más BMW: X3, X5, Serie 5, Serie 2 y Serie 7 (por generación).

insert into vehicles (make, model, year_start, year_end) values
('BMW','X3',2004,2010),          -- E83
('BMW','X5',2007,2013),          -- E70
('BMW','X5',2014,2018),          -- F15
('BMW','5 Series',2004,2010),    -- E60
('BMW','5 Series',2011,2016),    -- F10
('BMW','2 Series',2014,2021),    -- F22
('BMW','7 Series',2002,2008),    -- E65
('BMW','7 Series',2009,2015)     -- F01
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
