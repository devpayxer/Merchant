-- 14 sep 2026: contador de fallos seguidos de la lectura de Harry's.
-- Sirve para reintentar UNA sola vez tras un fallo (harrys_pendiente) y
-- luego esperar a la siguiente hora fija, en vez de martillar cada 3 h
-- contra un escudo que nos tiene colgados.
alter table yard_sync_state
  add column if not exists harrys_fallos int not null default 0;
