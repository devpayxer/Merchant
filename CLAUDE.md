# CLAUDE.md — eBay Parts Radar

Instrucciones para Claude Code. Ejecuta las fases en orden. Pide confirmación antes de cada deploy.

## Contexto

Sistema que monitorea piezas usadas de auto en eBay (vehículo × pieza), calcula velocidad de venta y precio mediano, y le dice al dueño qué piezas sacar de los junkers de su zona. Lee `README.md` para la arquitectura. Archivos:

- `schema.sql` — 5 tablas + vistas `combo_stats` y `hot_list`
- `seed.sql` — 55 piezas × 40 vehículos → ~2,200 combos
- `supabase/functions/ebay-sync/index.ts` — Edge Function (cron cada hora)

## Fase 0 — Prerrequisitos (pídeselos al usuario, no los adivines)

1. `EBAY_CLIENT_ID` y `EBAY_CLIENT_SECRET` (keyset de **Production** de https://developer.ebay.com)
2. Sesión de Supabase CLI activa (`supabase login`) y el project ref del proyecto a usar
3. Cuenta de Cloudflare con `wrangler` autenticado (para la Fase 2)

Si falta alguno, detente y pídelo.

## Fase 1 — Backend en Supabase

1. `supabase link --project-ref <REF>`
2. Aplica `schema.sql` y luego `seed.sql` como migraciones (`supabase/migrations/`), en ese orden. Verifica: `tracked_combos` debe tener ~2,100 filas.
3. Habilita extensiones `pg_cron` y `pg_net` (vía SQL: `create extension if not exists ...`; si falla por permisos, dile al usuario que las active en Dashboard → Database → Extensions).
4. `supabase secrets set EBAY_CLIENT_ID=... EBAY_CLIENT_SECRET=...`
5. `supabase functions deploy ebay-sync --no-verify-jwt`
6. Invoca la función una vez a mano y confirma respuesta `{"ok":150,...}` y que hay filas en `listings` y `listing_snapshots`.
7. Programa el cron cada hora con el snippet del README (sección 4), sustituyendo URL y anon key reales.

## Fase 2 — Página web "Modo Yarda" (móvil)

Crea `web/` en este repo y deploya a Cloudflare Pages. El usuario la abrirá desde el navegador del teléfono parado en el junker.

**Requisitos de producto:**
- UI en español, mobile-first, botones y texto grandes (se usa con guantes y sol de frente)
- Pantalla 1 (default) — **Modo Yarda:** un buscador con autocomplete de la tabla `vehicles`; al elegir uno, muestra sus filas de `hot_list` ordenadas por `score`: pieza, `precio_objetivo`, `vendidos_30d`, `competencia`, `semaforo`. Permite seleccionar varios vehículos a la vez (los que vio en la yarda) y ver las listas apiladas.
- Pantalla 2 — **Top general:** las mejores 50 filas de `hot_list` de todos los vehículos.
- Indicador de "datos actualizados hace X horas" usando `last_checked_at`.
- Sin login por ahora.

**Requisitos técnicos:**
- Stack simple: Vite + React (o vanilla si prefieres), `@supabase/supabase-js` con la **anon key**
- Acceso a datos: agrega una migración con políticas RLS de **solo lectura** (`for select using (true)`) para `anon` en las 5 tablas. Los datos son listados públicos de eBay, nada sensible. Ninguna política de insert/update/delete.
- Deploy: `wrangler pages deploy` (proyecto nuevo `ebay-radar`). Entrega la URL final al usuario.

## Fase 3 — Verificación final

- [ ] Cron programado y función respondiendo sin errores en logs
- [ ] `select count(*) from listings;` > 0
- [ ] La página carga en móvil, el autocomplete funciona y muestra precios
- [ ] Reporta al usuario: URL de la página + recordatorio de que `vendidos_30d` empieza a ser confiable ~4 semanas después de hoy

## Reglas del proyecto (no negociables)

- **NUNCA** agregues al seed: airbags ni nada relacionado (módulos de airbag, sensores de impacto, clock springs, asientos con airbag), catalizadores, ni piezas que anulen emisiones. Política de eBay 2026; la prohibición total de airbags entra el 24 sep 2026.
- Presupuesto de API: máximo ~3,600 llamadas/día a eBay (límite real: 5,000). Si cambias `BATCH_SIZE` o la frecuencia del cron, recalcula.
- No cambies la lógica de `ENDED_AFTER_DAYS` ni el cálculo de vendidos sin consultarlo: es la métrica central del negocio.
- El service role key nunca va en el código del frontend; la web usa solo la anon key.
