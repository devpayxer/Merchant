-- Reintento de la lectura de Harry's (6 sep 2026). Con solo 2 lecturas al
-- día, una lectura que falla en silencio nos cuesta días de carros nuevos.
-- Si falla, se marca pendiente y la siguiente corrida del cron (3h después)
-- la reintenta en vez de esperar a la próxima hora fija.
alter table yard_sync_state
  add column if not exists harrys_pendiente boolean not null default false;

comment on column yard_sync_state.harrys_pendiente is
  'true = la última lectura de Harry''s falló; la próxima corrida del cron reintenta sin esperar a HARRYS_HOURS_UTC.';
