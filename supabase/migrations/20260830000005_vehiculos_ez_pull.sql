-- Cobertura según el inventario real de EZ Pull & Save + huecos de Harry's
-- (todos los modelos sin match con 12+ unidades activas entre ambas yardas).

insert into vehicles (make, model, year_start, year_end) values
-- Ford
('Ford','Fusion',2006,2012), ('Ford','Fusion',2013,2020),
('Ford','Edge',2007,2014), ('Ford','Edge',2015,2020),
('Ford','Expedition',1997,2002), ('Ford','Expedition',2003,2006), ('Ford','Expedition',2007,2017),
('Ford','Ranger',1998,2011),
-- Dodge / Chrysler / Jeep
('Dodge','Ram 1500',1994,2001), ('Dodge','Ram 1500',2002,2008),
('Dodge','Durango',1998,2003), ('Dodge','Durango',2004,2009), ('Dodge','Durango',2011,2015),
('Dodge','Caliber',2007,2012),
('Dodge','Dakota',1997,2004), ('Dodge','Dakota',2005,2011),
('Dodge','Journey',2009,2020),
('Chrysler','Town and Country',2001,2007), ('Chrysler','Town and Country',2008,2016),
('Chrysler','PT Cruiser',2001,2010),
('Chrysler','Sebring',2001,2006), ('Chrysler','Sebring',2007,2010),
('Jeep','Compass',2007,2016), ('Jeep','Compass',2017,2021),
-- Nissan
('Nissan','Rogue',2008,2013),
('Nissan','Altima',1998,2001), ('Nissan','Altima',2002,2006),
('Nissan','Versa',2007,2012), ('Nissan','Versa',2013,2019),
('Nissan','Pathfinder',1996,2004), ('Nissan','Pathfinder',2005,2012), ('Nissan','Pathfinder',2013,2020),
('Nissan','Murano',2003,2007), ('Nissan','Murano',2009,2014),
-- Toyota / Honda / Acura
('Toyota','Sienna',1998,2003), ('Toyota','Sienna',2004,2010),
('Toyota','Corolla',1998,2002), ('Toyota','Corolla',2003,2008),
('Honda','CR-V',1997,2001), ('Honda','CR-V',2002,2006),
('Acura','MDX',2001,2006), ('Acura','MDX',2007,2013),
-- Hyundai / Kia
('Hyundai','Tucson',2005,2009), ('Hyundai','Tucson',2010,2015),
('Hyundai','Santa Fe',2001,2006), ('Hyundai','Santa Fe',2007,2012),
('Kia','Optima',2001,2010), ('Kia','Optima',2011,2015), ('Kia','Optima',2016,2020),
('Kia','Forte',2010,2013), ('Kia','Forte',2014,2018), ('Kia','Forte',2019,2022),
-- Chevrolet / VW / Audi
('Chevrolet','Malibu',1997,2003), ('Chevrolet','Malibu',2004,2008), ('Chevrolet','Malibu',2013,2015),
('Chevrolet','Impala',2000,2005), ('Chevrolet','Impala',2014,2020),
('Volkswagen','Passat',1998,2005), ('Volkswagen','Passat',2006,2010), ('Volkswagen','Passat',2012,2019),
('Audi','A4',1996,2001), ('Audi','A4',2002,2008)
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

-- Recruzar el inventario de ambas yardas
select refresh_yard_matches();
