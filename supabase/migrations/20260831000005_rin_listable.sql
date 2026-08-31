-- Rin suelto pasa de XL (solo local) a L: se vende por pieza en eBay con
-- envío ~$22 (aprobado por el dueño 31 ago 2026). El SET de 4 sigue siendo
-- trato local. Regla práctica: solo aluminio sin rash/dobleces; steelies
-- no valen; TPMS en el título sube precio; EZ suele ganar en costo.

update part_types
set ship_class = 'L',
    notes = 'Suelto por pieza; solo aluminio sin daño. Set de 4 = local. TPMS suma valor'
where name_es = 'Rin (1 pieza)';
