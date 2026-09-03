-- Modo ligero de yard-sync para Harry's (3 sep 2026): el barrido rotativo
-- ahora tarda ~30 días en dar la vuelta, así que el corte para marcar
-- carros "idos" ya no puede ser un número fijo de días; se guarda cuándo
-- empezó la vuelta y cuántas páginas fallaron durante ella.
alter table yard_sync_state
  add column if not exists sweep_started_at timestamptz,
  add column if not exists sweep_falladas  int not null default 0,
  add column if not exists harrys_run_at   timestamptz;

comment on column yard_sync_state.sweep_started_at is
  'Inicio de la vuelta actual del barrido rotativo de Harry''s; al cerrar la vuelta, lo no visto desde entonces se marca left_at.';
comment on column yard_sync_state.harrys_run_at is
  'Última vez que yard-sync leyó Harry''s (solo 2 veces al día; EZ Pull va cada corrida).';
