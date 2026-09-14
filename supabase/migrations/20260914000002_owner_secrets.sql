-- 14 sep 2026: secretos que solo puede leer EL DUEÑO con sesión iniciada.
-- Primer uso: YARD_INGEST_KEY, la clave del marcador "Actualizar Harry's"
-- que corre en el teléfono del dueño. NO va en el bundle público de la web:
-- la pestaña Mío la pide a esta tabla después del login y con ella arma el
-- marcador. anon no la ve, y tampoco cualquier otra cuenta: la política
-- exige el correo del dueño. (El valor se inserta a mano, no va en git.)
create table if not exists owner_secrets (
  name  text primary key,
  value text not null
);
alter table owner_secrets enable row level security;
drop policy if exists "solo dueño logueado" on owner_secrets;
create policy "solo el dueño" on owner_secrets
  for select using (auth.jwt() ->> 'email' = 'a.ledesma@payxer.com');
