-- La web muestra cuándo se leyó cada yarda por última vez
-- (yard_sync_state.harrys_run_at, etc.). Solo lectura para anon,
-- igual que las otras tablas; no hay nada sensible (fechas y contadores).
-- Aplicada a mano el 22 sep 2026; aquí queda registrada.
drop policy if exists "anon read yard_sync_state" on yard_sync_state;
create policy "anon read yard_sync_state" on yard_sync_state for select using (true);
