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

---

## ESTADO Y PENDIENTES (actualizado 30 ago 2026 — leer antes de continuar)

Las Fases 1 y 2 están COMPLETAS y desplegadas. Proyecto Supabase: `ebay-radar`
(ref `oricrkqewpchixpxcayp`, cuenta nueva del usuario, NO la de tolatino).
Web en producción: https://ebay-radar.pages.dev (Cloudflare Pages, cuenta
3483bb2e0e21546041283fd760c85538). Lo construido más allá del plan original:

- 109 vehículos / ~6,000 combos (se agregaron europeos y los modelos reales
  del inventario de la yarda).
- Inventario EN VIVO de DOS yardas, cron `yard-sync-3h`:
  1. Harry's U-Pull It (Hazle Township): scrapeado de wegotused.com vía el
     proxy `/api/yard` en Pages (Sucuri bloquea IPs de Supabase; el proxy
     vive en `web/public/_worker.js`). Con VINs.
  2. EZ Pull & Save (New Ringgold, PA, a 40 min, más barata): JSON directo de
     ezpullandsave.com/get_inventory.php (2,012 carros, fila y fecha, SIN
     VINs — id sintético EZ-<hash>). $2 entrada, CASH ONLY. Su lista de
     precios ya está cargada (52 piezas, multi-yarda en yard_prices con pk
     (yard, part_type_id)); la web muestra el precio de la yarda en contexto.
     OJO: su lista imprime "Alternator 3.00" (¿errata por 30?) — verificar.
- VIN decodificado con NHTSA vPIC (modelo real, trim, motor, HP) + códigos de
  chasis/motor derivados para BMW/Mini/Mercedes (tablas en yard-sync).
- Pestaña "Mío": inventario propio con login (a.ledesma@payxer.com), estados
  bodega→listada→vendida→enviada y ganancia neta.
- Fotos/links de eBay por pieza: soporte listo, se llenan al activar eBay.

### Decisiones de negocio tomadas (no cambiar sin preguntar)

- **Canal único: eBay.** El usuario decidió NO diversificar a otros
  marketplaces (Facebook, Mercari, etc.); toda la energía va a construir el
  mejor sistema de ventas sobre eBay. No sugerir multicanal.
- **Envío GRATIS en todos los listados** (los comps lo incluyen en el precio).
  Ganancia neta = precio × 0.85 (comisión) − envío por clase (S $6 / M $13 /
  L $22) − $2 empaque − costo de yarda × 1.06 (sales tax PA). La yarda cobra
  además $2 de entrada POR VISITA (no se prorratea por pieza). XL = solo
  recogida local, no listar.
- Precio de publicación sugerido: 10-15% bajo la mediana.
- **Carriles de rastreo** (aprobados 30 ago, sustituyen al ENDED_AFTER_DAYS=5
  global): tracked_combos.priority lo recalcula refresh_yard_matches() cada
  3h con el inventario vivo. Carril rápido = modelos con ≥5 carros vivos
  entre ambas yardas (~7,095 combos, 135 llamadas/corrida, ciclo ~2.2 días,
  ENDED_AFTER_DAYS_FAST=4). Carril lento = resto (~2,255 combos, 15
  llamadas/corrida, ciclo ~6 días, ENDED_AFTER_DAYS_SLOW=10; no se eliminan
  para conservar historial cuando llegue un carro de ese modelo). Umbral y
  constantes en ebay-sync; bajar cuando el Growth Check suba el límite.
  NO abrir múltiples cuentas
  de developer para dividir carga (viola políticas de eBay; riesgo de baneo).
- Tiempo de manejo en listados: 2 días hábiles.

### Pendiente 1 — Al llegar las llaves de eBay (aprobación en curso)

1. `supabase secrets set EBAY_CLIENT_ID=... EBAY_CLIENT_SECRET=...`
2. Invocar `ebay-sync` a mano; verificar listings/snapshots/fotos.
3. Programar cron horario de ebay-sync (README sección 4, con la anon key).
4. **Botón "🔍 Espiar mercado"** (acordado con el usuario, prioridad alta):
   al tocar una pieza, traer con Browse API `getItem` el detalle de los 5-10
   listados activos más baratos: **watchCount** (= clientes que lo guardaron)
   y **estimatedSoldQuantity** (ventas reales en listados multi-cantidad).
   Caché de 24h en una tabla para cuidar presupuesto (~300 llamadas/día máx;
   usamos 3,600 de 5,000). OJO: verificar con una llamada real que la versión
   actual de Browse API devuelva `watchCount`; si no, plan B documentado en
   la conversación (contador de vendidos + link al listado).
   **Ampliación acordada (30 ago, idea del usuario):** la misma consulta trae
   DOS grupos por pieza: (a) usados más baratos = competencia directa, y
   (b) aftermarket NUEVOS más vendidos = termómetro de demanda. Los listados
   aftermarket son multi-cantidad y exponen públicamente sold count, watchers
   y "in N carts" — señal de demanda que los usados no enseñan. El precio
   aftermarket marca el techo; el OEM usado se publica debajo (o igual/más si
   es chapa ya pintada del color: le ahorra $150-250 de pintura al comprador).
   Mismo filtro de búsqueda con conditions:{NEW}, misma caché 24h, sin costo
   extra significativo de API.
   **Diseño ampliado — "Índice de demanda" (30 ago, acordado con el usuario):**
   generalizar la señal aftermarket a TODOS los vendedores por combo, no un
   listado suelto, y fundirla con las métricas de usados existentes:
   - Nueva pasada `demand-sync` (o dentro de ebay-sync): por combo, 1 search
     con conditions:{NEW} + getItem de los top 3-5 aftermarket por ventas.
   - Tablas: `aftermarket_stats` (combo_id, vendedores, precio_min_nuevo,
     ventas_totales, watchers_totales, updated_at) y
     `aftermarket_snapshots` (item_id, sold_qty, watchers, fecha).
     CLAVE: estimatedSoldQuantity es acumulado de por vida; el snapshot
     semanal da el DELTA = ventas reales/semana de todo el mercado. Esa es
     la métrica buena, no el acumulado.
   - Índice de demanda 0-100 por combo fundiendo: velocidad aftermarket
     (delta semanal), watchers/vendedor, vendidos_30d usados, e inversa de
     competencia usada. Semáforo v2: 🟢 venta casi segura / 🟡 demanda alta
     pero precio agresivo / ⚪ sin señal. precio_min aftermarket = techo de
     publicación del OEM usado.
   - La fila mantiene la comparación multi-yarda ya construida: costos de
     Harry's Y EZ con la ganancia de la yarda ganadora ("en EZ"/"en Harry's")
     y respeta el selector Todas/Harry's/EZ Pull. Ej.:
     "Harry's $27 · EZ $21 → publica a $85-95 · ganancia ~$51 en EZ".
   - Presupuesto (CONFIRMADO por el usuario): SOLO combos con carros vivos
     en las yardas (accionables),
     top 3-5 listados, refresh semanal ≈ 1,000-1,300 llamadas/día — cabe en
     el slack de 1,400 (usamos 3,600 de 5,000). Ampliar a todos los combos
     cuando el Growth Check suba el límite.

### Pendiente 2 — Lista de precios de la yarda — ✅ COMPLETADO 30 ago 2026

Tabla `yard_prices` cargada con los 55 precios de la lista impresa de Harry's
(price + core, notas de mapeo por fila). hot_list calcula ganancia_neta y
rentabilidad; la web muestra "Yarda $X → eBay $Y" y autollena el costo en
"La saqué". Confirmado: entrada $2/visita, sales tax PA 6% (ya en la fórmula).
Lo original pedido era:
- Mostrar en TODAS las piezas: "Yarda $X → eBay $Y" + ganancia neta grande +
  etiqueta de rentabilidad (verde ≥$40 / naranja $15-40 / gris "NO VALE").
- Reordenar hot_list por ganancia neta.
- Autollenar `costo` al tocar "＋ La saqué" (ya no preguntar con prompt).
- Preguntar al usuario si la yarda cobra cuota de entrada para sumarla.

### Pendiente 3 — Fase B del inventario: borradores de listado

Al marcar pieza "en bodega", generar borrador copiable: título con specs del
VIN ("11 BMW 328i E90 N52 Right Headlight OEM"), precio sugerido, categoría,
condición, compatibilidad. El usuario publica manual desde la app de eBay
(cuenta nueva tiene límites ~10 items/$500 al mes).

### Pendiente 4 — Fase C: "La saqué" → listado automático (visión acordada)

Flujo final acordado con el usuario (30 ago 2026):
1. Tocar "＋ La saqué" crea el listado COMPLETO en la cuenta de eBay vía
   Sell API (Inventory API: inventory item + offer SIN publicar — eBay no
   tiene borradores por API, la oferta sin publicar es el equivalente).
   Título/precio/specs/envío gratis/compatibilidad salen del radar + VIN.
2. En "Mío" la pieza queda "📷 Falta foto": botón que abre la cámara del
   teléfono en nuestra web, sube 2-3 fotos (Media API / Picture Services)
   y publica la oferta. El usuario nunca abre la app de eBay.

Prerrequisitos: cuenta de vendedor activa + OAuth de usuario (botón
"Conectar mi eBay", flujo authorization code con redirect en
ebay-radar.pages.dev + endpoint de marketplace account deletion),
políticas de negocio configuradas (Account API), y que los límites de
cuenta nueva hayan subido (mientras tanto, Fase B con borrador copiable).

### Otras notas operativas

- Tokens de esta infra: Supabase access token y Cloudflare API token los
  tiene el usuario; pedírselos si la sesión no los tiene.
- Terapeak (gratis en Seller Hub cuando haya cuenta de vendedor) para validar
  nichos manualmente; no tiene API.
- Rediseño UI/UX: hay lienzo en Claude Design y prompt preparado; si el
  usuario trae un diseño final, implementarlo sin perder funcionalidad.
