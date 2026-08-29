-- Lectura pública (anon) para la página "Modo Yarda".
-- Datos = listados públicos de eBay, nada sensible.
-- Solo SELECT; ninguna política de insert/update/delete.

create policy "anon read vehicles"          on vehicles          for select using (true);
create policy "anon read part_types"        on part_types        for select using (true);
create policy "anon read tracked_combos"    on tracked_combos    for select using (true);
create policy "anon read listings"          on listings          for select using (true);
create policy "anon read listing_snapshots" on listing_snapshots for select using (true);
