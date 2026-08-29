# eBay Parts Radar

Monitorea piezas usadas de auto en eBay por vehículo × pieza, calcula velocidad de venta y precio mediano, y alimenta el reporte semanal + el "modo yarda".

> **Setup automático:** abre esta carpeta en Claude Code y dile:
> *"Lee CLAUDE.md y ejecuta las fases en orden."*
> Hace el deploy completo del backend y construye la página web móvil del Modo Yarda. Solo necesitas tener a mano tus llaves de eBay (paso 1 abajo) y sesión iniciada en Supabase y Cloudflare.
> Los pasos manuales de abajo son la alternativa si prefieres hacerlo tú.

## Estructura

```
ebay-radar/
├── schema.sql                        # 5 tablas + vistas combo_stats y hot_list
├── seed.sql                          # 55 piezas seguras + 40 vehículos → ~2,200 combos
└── supabase/functions/ebay-sync/
    └── index.ts                      # Edge Function (cron cada hora)
```

## Setup (30 min)

### 1. Llaves de eBay (gratis)
1. Crea cuenta en https://developer.ebay.com
2. Crea un keyset de **Production** (no Sandbox)
3. Guarda `Client ID` y `Client Secret`
4. Límite default: 5,000 llamadas/día a la Browse API. El cron está calibrado a ~3,600/día.

### 2. Base de datos
En el SQL Editor de Supabase, corre en orden:
1. `schema.sql`
2. `seed.sql`

### 3. Edge Function
```bash
supabase secrets set EBAY_CLIENT_ID=tu_client_id EBAY_CLIENT_SECRET=tu_secret
supabase functions deploy ebay-sync --no-verify-jwt
```

Pruébala una vez a mano:
```bash
curl -X POST https://TU-PROYECTO.supabase.co/functions/v1/ebay-sync \
  -H "Authorization: Bearer TU_ANON_KEY"
```
Debe responder `{"ok":150,"failed":0,...}`.

### 4. Cron (cada hora)
En el SQL Editor (requiere extensiones `pg_cron` y `pg_net`, actívalas en Database → Extensions):

```sql
select cron.schedule(
  'ebay-sync-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://TU-PROYECTO.supabase.co/functions/v1/ebay-sync',
    headers := '{"Authorization": "Bearer TU_ANON_KEY", "Content-Type": "application/json"}'::jsonb
  );
  $$
);
```

## Cómo leer los datos

- **Reporte semanal:** `select * from hot_list limit 50;`
- **Modo yarda** (ej. llegaste y hay un Civic 2014):
  ```sql
  select pieza, vendidos_30d, precio_objetivo, competencia, semaforo
  from hot_list
  where vehiculo ilike '%Civic 2012-2015%'
  order by score desc;
  ```

## Qué esperar y cuándo

| Semana | Qué tienes |
|---|---|
| Día 1 | Precios y competencia de todos los combos (ya útil para poner precio) |
| Semana 1-2 | Primeras señales de velocidad (listados que desaparecen) |
| Semana 4+ | `vendidos_30d` confiable → el semáforo 🔥/⚠️/❌ ya significa algo |

## Notas importantes

- **"Vendido" es un estimado.** Un listado que desaparece pudo venderse, cancelarse o expirar. Como señal relativa (comparar piezas entre sí) funciona bien; como cifra absoluta, no. Los primeros 3 días todo parece "nuevo", ignora esa ventana.
- **Piezas prohibidas/restringidas (NO agregar al seed):** airbags y todo lo relacionado (módulos, sensores de impacto, clock springs, asientos con airbag — prohibición total desde sep 24, 2026), catalizadores usados sin recertificar, y cualquier cosa que anule emisiones.
- **Para agregar un vehículo nuevo:** inserta en `vehicles` y corre de nuevo el bloque final de `seed.sql` (el `insert ... on conflict do nothing` genera solo los combos que falten).
- **Precio de publicación sugerido:** ~10-15% debajo de `precio_objetivo` (la mediana) para rotar rápido.
