-- Vehículos agregados según lo que HAY físicamente en Hazle Township
-- (los modelos sin match más comunes del inventario real de la yarda).

insert into vehicles (make, model, year_start, year_end) values
-- Subaru: la marca más común de la yarda sin cobertura (~195 carros)
('Subaru','Forester',2001,2008), ('Subaru','Forester',2009,2013), ('Subaru','Forester',2014,2018),
('Subaru','Impreza',2000,2007),  ('Subaru','Impreza',2008,2011),  ('Subaru','Impreza',2012,2016),
('Subaru','Legacy',2000,2009),   ('Subaru','Legacy',2010,2014),
('Subaru','Outback',2000,2004),  ('Subaru','Outback',2005,2009),
-- Generaciones más viejas de modelos que ya seguimos
('Honda','Accord',1998,2002),    ('Honda','Accord',2003,2007),
('Honda','Civic',2001,2005),
('Honda','Odyssey',1999,2004),   ('Honda','Odyssey',2005,2010),
('Toyota','Camry',2002,2006),
('Ford','F-150',1997,2003),      ('Ford','F-150',2004,2008),
('Ford','Escape',2001,2007),     ('Ford','Escape',2008,2012),
('Ford','Explorer',2002,2005),   ('Ford','Explorer',2006,2010),
('Ford','Focus',2000,2007),      ('Ford','Focus',2008,2011),
('Jeep','Grand Cherokee',1999,2004), ('Jeep','Grand Cherokee',2005,2010),
('Volkswagen','Jetta',1999,2005), ('Volkswagen','Jetta',2006,2010),
('Hyundai','Sonata',1999,2005),  ('Hyundai','Sonata',2006,2010),
('Hyundai','Elantra',2001,2006), ('Hyundai','Elantra',2007,2010),
('Chevrolet','Silverado 1500',1999,2006),
('Nissan','Sentra',2000,2006),   ('Nissan','Sentra',2007,2012),
-- Modelos nuevos que abundan en la yarda
('Jeep','Liberty',2002,2007),    ('Jeep','Liberty',2008,2012),
('Jeep','Patriot',2007,2017),
('Mazda','Mazda3',2004,2009),    ('Mazda','Mazda3',2010,2013), ('Mazda','Mazda3',2014,2018),
('Dodge','Grand Caravan',2001,2007), ('Dodge','Grand Caravan',2008,2020),
('Honda','Pilot',2003,2008),     ('Honda','Pilot',2009,2015),
('Acura','TL',1999,2003),        ('Acura','TL',2004,2008), ('Acura','TL',2009,2014),
('Chevrolet','TrailBlazer',2002,2009)
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

-- Recruzar el inventario de la yarda con los vehículos nuevos
select refresh_yard_matches();
