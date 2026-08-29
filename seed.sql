-- =============================================================
-- SEED — Piezas seguras y vehículos comunes de yarda
-- Ejecutar DESPUÉS de schema.sql
--
-- EXCLUIDO A PROPÓSITO (política de eBay 2026):
--   airbags, clock springs, asientos con airbag, módulos de
--   airbag, sensores de impacto, catalizadores, y cualquier
--   pieza que anule control de emisiones. NO los agregues.
-- =============================================================

insert into part_types (name_es, search_keyword, pull_minutes, ship_class, notes) values
-- Luces (clásico #1 de yarda: caras, ligeras, 4 tornillos)
('Faro derecho',            'right headlight assembly OEM',      15, 'M', null),
('Faro izquierdo',          'left headlight assembly OEM',       15, 'M', null),
('Calavera derecha',        'right tail light OEM',              10, 'M', null),
('Calavera izquierda',      'left tail light OEM',               10, 'M', null),
('Faro de niebla',          'fog light OEM',                     15, 'S', null),
('Stop de cajuela',         'trunk center tail light OEM',       10, 'M', null),

-- Espejos y exterior
('Espejo lateral derecho',  'right side mirror OEM',             10, 'M', null),
('Espejo lateral izquierdo','left side mirror OEM',              10, 'M', null),
('Manija exterior',         'exterior door handle OEM',          15, 'S', null),
('Parrilla',                'front grille OEM',                  15, 'L', null),
('Emblema',                 'emblem badge OEM',                   5, 'S', null),
('Tapa de gasolina',        'fuel door OEM',                     10, 'S', null),
('Antena',                  'antenna OEM',                       10, 'S', null),
('Manija de tailgate',      'tailgate handle OEM',               15, 'S', 'pickups'),

-- Electrónica de cabina (lo que mejor paga por libra)
('Cluster',                 'instrument cluster speedometer OEM',20, 'S', null),
('Radio / pantalla',        'radio display screen OEM',          20, 'M', null),
('Control de clima',        'AC climate control unit OEM',       20, 'S', null),
('Switch maestro vidrios',  'master power window switch OEM',    10, 'S', null),
('Switch de faros',         'headlight switch OEM',              10, 'S', null),
('Switch de espejos',       'mirror control switch OEM',         10, 'S', null),
('Botón de encendido',      'ignition start stop button OEM',    15, 'S', null),

-- Módulos (OEM usado se vende bien; NO listar ECU aftermarket)
('Computadora ECM/PCM',     'ECM PCM engine computer module OEM',20, 'S', 'solo OEM del donante'),
('Módulo BCM',              'BCM body control module OEM',       20, 'S', null),
('Caja de fusibles',        'fuse box junction block OEM',       20, 'S', null),

-- Mecánica chica (pesa más, pero rota rápido)
('Alternador',              'alternator OEM',                    30, 'L', null),
('Marcha',                  'starter motor OEM',                 30, 'L', null),
('Compresor A/C',           'AC compressor OEM',                 35, 'L', null),
('Cuerpo de aceleración',   'throttle body OEM',                 20, 'M', null),
('Sensor MAF',              'mass air flow sensor OEM',          10, 'S', null),
('Motor de limpiaparabrisas','windshield wiper motor OEM',       20, 'M', null),
('Motor de blower',         'AC heater blower motor OEM',        20, 'M', null),
('Bomba de dirección',      'power steering pump OEM',           30, 'M', null),

-- Interior / misceláneo
('Actuador de seguro',      'door lock actuator OEM',            25, 'S', null),
('Regulador de vidrio',     'window regulator OEM',              25, 'M', null),
('Visera',                  'sun visor OEM',                      5, 'M', null),
('Tapa de consola',         'center console lid armrest OEM',    10, 'M', null),
('Rin (1 pieza)',           'wheel rim OEM',                     15, 'XL','revisa costo de envío'),
('Elevador de asiento (switch)','power seat switch OEM',         10, 'S', 'switch, NO el asiento'),

-- Electrónica chica adicional (mejor $/libra del negocio)
('Módulo ABS',              'ABS pump control module OEM',       30, 'M', 'estrella de la categoría; indicar as-is'),
('Balastra de xenón',       'xenon HID ballast OEM',             10, 'S', null),
('Módulo TCM',              'TCM transmission control module OEM',25,'S', 'indicar "puede requerir programación"'),
('Amplificador de audio',   'OEM audio amplifier',               20, 'S', 'Bose/JBL/Harman pagan mejor'),
('Bobinas de encendido (set)','ignition coil pack set OEM',      20, 'S', 'vender en juego'),
('Cámara de reversa',       'backup camera OEM',                 15, 'S', null),
('Módulo de puerta',        'door control module OEM',           20, 'S', null),
('Inyectores (set)',        'fuel injector set OEM',             25, 'S', 'vender en juego'),

-- Interior que sí paga (sin airbags, sin volantes, sin cinturones)
('Espejo retrovisor interior','interior rear view mirror auto dim OEM',10,'S','los auto-dim/HomeLink pagan mejor'),
('Manija interior',         'interior door handle OEM',          10, 'S', null),
('Panel de puerta',         'door panel OEM',                    20, 'L', 'revisa costo de envío'),
('Guantera',                'glove box OEM',                     15, 'M', null),
('Cabeceras (par)',         'headrest pair OEM',                  5, 'M', null),
('Portavasos',              'center console cup holder OEM',     10, 'S', null),
('Bisel de radio/cluster',  'radio dash trim bezel OEM',         15, 'S', null),
('Palanca/perilla de cambios','gear shift knob shifter OEM',     10, 'S', null),
('Rejillas de A/C',         'dash AC air vent OEM',              10, 'S', 'vender en juego si salen varias');

-- =============================================================
-- Vehículos: generaciones comunes en yardas del noreste de EE.UU.
-- Agrega/quita según lo que veas en TUS yardas.
-- =============================================================
insert into vehicles (make, model, year_start, year_end) values
('Honda','Civic',2006,2011), ('Honda','Civic',2012,2015), ('Honda','Civic',2016,2021),
('Honda','Accord',2008,2012), ('Honda','Accord',2013,2017),
('Honda','CR-V',2007,2011), ('Honda','CR-V',2012,2016),
('Honda','Odyssey',2011,2017),
('Toyota','Corolla',2009,2013), ('Toyota','Corolla',2014,2019),
('Toyota','Camry',2007,2011), ('Toyota','Camry',2012,2017),
('Toyota','RAV4',2006,2012), ('Toyota','RAV4',2013,2018),
('Toyota','Sienna',2011,2020), ('Toyota','Tacoma',2005,2015),
('Nissan','Altima',2007,2012), ('Nissan','Altima',2013,2018),
('Nissan','Sentra',2013,2019), ('Nissan','Rogue',2014,2020),
('Ford','F-150',2009,2014), ('Ford','F-150',2015,2020),
('Ford','Explorer',2011,2019), ('Ford','Escape',2013,2019),
('Ford','Fusion',2013,2020), ('Ford','Focus',2012,2018),
('Chevrolet','Silverado 1500',2007,2013), ('Chevrolet','Silverado 1500',2014,2018),
('Chevrolet','Malibu',2008,2012), ('Chevrolet','Cruze',2011,2015),
('Chevrolet','Equinox',2010,2017), ('Chevrolet','Impala',2006,2013),
('Ram','1500',2009,2018),
('Jeep','Grand Cherokee',2011,2020), ('Jeep','Wrangler',2007,2017),
('Hyundai','Sonata',2011,2014), ('Hyundai','Sonata',2015,2019),
('Hyundai','Elantra',2011,2016),
('Volkswagen','Jetta',2011,2018),
('Subaru','Outback',2010,2014);

-- =============================================================
-- Generar todos los combos (vehículo × pieza)
-- 40 vehículos × 55 piezas = ~2,200 combos
-- A 1 llamada por combo y ~3,600 llamadas/día del cron,
-- cada combo se refresca cada ~14 horas. Sobra margen.
-- =============================================================
insert into tracked_combos (vehicle_id, part_type_id)
select v.id, p.id
from vehicles v cross join part_types p
where v.active and p.active
on conflict do nothing;

-- Prioriza luces y espejos (lo que más rota)
update tracked_combos c set priority = 1
from part_types p
where p.id = c.part_type_id
  and p.name_es in ('Faro derecho','Faro izquierdo','Calavera derecha',
                    'Calavera izquierda','Espejo lateral derecho','Espejo lateral izquierdo');
