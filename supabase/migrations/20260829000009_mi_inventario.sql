-- Inventario propio del dueño: piezas sacadas de la yarda y su ciclo
-- de venta. Solo el usuario autenticado (el dueño) puede leer/escribir;
-- el público de la página no ve esta tabla.

create table my_inventory (
  id             bigint generated always as identity primary key,
  vehiculo       text not null,          -- ej. "Honda Accord 2003-2007"
  pieza          text not null,          -- ej. "Faro derecho"
  vin            text,                   -- carro de origen en la yarda (opcional)
  fila           text,                   -- fila donde estaba el carro
  costo          numeric(10,2),          -- lo que pagaste en la yarda
  precio_mercado numeric(10,2),          -- mediana eBay al momento de sacarla
  precio_listado numeric(10,2),
  precio_venta   numeric(10,2),
  estado         text not null default 'bodega'
    check (estado in ('bodega','listada','vendida','enviada')),
  ebay_url       text,
  notas          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_my_inventory_estado on my_inventory (estado, created_at desc);

alter table my_inventory enable row level security;

-- Solo autenticados (el dueño); anon no ve nada de esta tabla
create policy "owner all my_inventory" on my_inventory
  for all to authenticated using (true) with check (true);
