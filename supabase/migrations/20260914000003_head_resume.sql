-- 14 sep 2026: por dónde iba la cabeza de Harry's si la cortó el tiempo.
-- Tras un hueco largo (el escudo cerrado varios días) los carros nuevos
-- están en muchas páginas; la cabeza sigue en la siguiente corrida en vez
-- de reiniciar en la 0 y parar al ver 0 nuevos.
alter table yard_sync_state
  add column if not exists head_resume int not null default 0;
