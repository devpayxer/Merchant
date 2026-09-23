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

- **729 vehículos × 73 piezas = 53,217 combos** (2 sep: COBERTURA TOTAL —
  559 generaciones generadas desde el inventario real sin match, con cortes
  por huecos de años; 4,987/5,063 carros vivos matchean = 100% de los
  modernos, solo quedan fuera 76 anteriores a 1985. Matcher arreglado:
  "&"↔"AND" y RAM PICKUP→Ram 1500). Historia previa: 170 vehículos (se
  agregaron europeos, los
  modelos reales de ambas yardas, y 30-31 ago: 18 piezas nuevas — fenders,
  ventilador de radiador, bomba de gasolina, motor de sunroof, chapas de
  cajuela/cofre, switch de ignición, volante SIN airbag, palanca de
  direccionales SIN clock spring, turbo, caliper de frenos, múltiple de admisión y cremallera de dirección; 31 ago: múltiple de escape, tapa de válvulas, booster de frenos y tapetes (set de 4). Sus precios de ambas yardas ya
  están cargados — se releyeron de las fotos de las listas el 31 ago;
  chapas de cajuela/cofre no aparecen en la lista de EZ, mapeadas como
  Door Latch $5).
- Inventario EN VIVO de DOS yardas, cron `yard-sync-3h`:
  1. Harry's U-Pull It (Hazle Township): scrapeado de wegotused.com vía el
     proxy `/api/yard` en Pages (Sucuri bloquea IPs de Supabase; el proxy
     vive en `web/public/_worker.js`). Con VINs. **DESDE EL 14 SEP el
     relevo está BLOQUEADO por Sucuri y la lectura real la hace el dueño
     desde su teléfono con el marcador "Actualizar Harry's"** (ver "Sync de
     Harry's" abajo). El cron solo queda como intento de respaldo.
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
- **Link "💰 todo lo vendido"** por VEHÍCULO (2 sep): en la tarjeta de cada
  carro de la yarda (año exacto + marca + modelo del VIN) y en el encabezado
  de cada bloque en Buscar (año medio de la generación). Abre eBay con
  categoría 6028 (Car & Truck Parts, para que no salgan carros completos),
  LH_Sold=1 y condición usada. Sirve para descubrir piezas que NO están en
  nuestras 73 — el catálogo nunca va a cubrir todo lo que se vende.
  Complementa el link por pieza que ya existía en cada fila.
- Pestaña "💲 Lista": las 73 piezas con el precio de ambas yardas (grande =
  con core y tax; chico = precio de lista), búsqueda en vivo y las notas de
  la lista impresa. Cada fila trae su link "💰 vendidos" (2 sep): busca esa
  pieza SUELTA en eBay (search_keyword, sin atarla a un carro) para tantear
  el mercado general de esa pieza.
- **Entradas por semana** (3 sep): vista `entradas_semanales` (yard, semana,
  carros, exacto) agrupando `yard_date` por semana, últimos 180 días. Panel
  desplegable arriba de la pestaña "📍 Yarda" (`entradasHTML` en main.js);
  respeta el selector Todas/Harry's/EZ. Muestra promedio de las últimas 8
  semanas completas, barras de las últimas 10 y marca en naranja la semana en
  curso. Ritmo actual: Harry's ~269 carros/semana, EZ ~62. OJO con el
  histórico: `exacto=false` (se pinta con "≥") en las semanas anteriores a
  nuestra primera lectura del inventario, porque de esas solo vemos los carros
  que TODAVÍA siguen en la yarda — subestima. De la semana del 24 ago en
  adelante el conteo es real.
- **Render parcial al escribir** (3 sep): antes cada letra en un buscador
  llamaba a `render()`, que rehace `app.innerHTML` — el `<input>` se destruía
  y el teclado del teléfono se cerraba a la primera letra (el `focus()` que
  se hacía después NO reabre el teclado virtual en iOS/Android). Ahora cada
  pestaña con buscador se parte en dos: `xxxHTML()` (chips + input + un
  `<div id="resultados">`) y `xxxResultadosHTML()` (solo la lista). Al
  escribir se llama `renderResultados()`, que reemplaza el contenido de
  `#resultados` (y `#sugerencias` en Buscar) SIN tocar el input.
  `bindAcciones(root)` re-engancha los handlers que viven dentro de los
  resultados y se llama en el render completo y en el parcial. REGLA: si
  agregas otra pantalla con buscador, sigue este patrón; nunca llames
  `render()` desde un evento `input`.
- **Piezas fijadas arriba** (6 sep): `PIEZAS_FIJADAS` en `web/src/main.js`
  sube ciertas piezas al principio de la lista de CADA vehículo (Buscar y el
  carro expandido en Yarda), sin importar la ganancia, y las marca con 📌.
  Hoy: `["Rin"]` — por petición del dueño, es lo que más le interesa. Se
  compara por PREFIJO contra `part_types.name_es` (la clave en español), así
  que funciona igual con la app en inglés y sobrevive si algún día partimos
  el rin en aluminio / acero / camión. `conFijadasArriba()` reordena lo que
  devuelve `loadHotList` conservando el orden por ganancia dentro de cada
  grupo. NO afecta la pestaña Top ni la Lista de precios.
- **Bilingüe ES/EN** (31 ago): selector ES|EN en el encabezado, se recuerda
  en localStorage y arranca según el idioma del teléfono. Los textos viven
  en `web/src/i18n.js` con el español como clave; los nombres de pieza en
  inglés se DERIVAN de part_types.search_keyword (no hay columna name_en, así
  que una pieza nueva queda bilingüe sola); las frases en español dentro de
  las notas de precios se traducen con NOTE_PHRASES. Al agregar texto nuevo
  a la web, agrégalo también al diccionario.

### Decisiones de negocio tomadas (no cambiar sin preguntar)

- **Canal único: eBay.** El usuario decidió NO diversificar a otros
  marketplaces (Facebook, Mercari, etc.); toda la energía va a construir el
  mejor sistema de ventas sobre eBay. No sugerir multicanal.
- **Envío GRATIS en todos los listados** (los comps lo incluyen en el precio).
  Ganancia neta = precio × 0.85 (comisión) − envío por clase (S $6 / M $13 /
  L $22) − $2 empaque − costo de yarda × 1.06 (sales tax PA). La yarda cobra
  además $2 de entrada POR VISITA (no se prorratea por pieza). XL = solo
  recogida local, no listar (excepción 31 ago: el rin SUELTO pasó a L,
  listable con envío ~$22; el set de 4 sigue siendo trato local).
- **Precio de publicación (regla del dueño, 22 sep 2026): "la competencia
  es el más barato, no el promedio".** `hot_list.precio_piso` = el 3er
  listado activo más barato LIMPIO (sin juegos/llantas/tapones ni títulos
  de otro carro; si hay <3 limpios se usan todos; nunca supera a la
  mediana). `precio_sugerido = piso × 0.95` (entrar justo debajo del
  competidor real) y la GANANCIA se calcula sobre ese precio. La mediana
  queda como `precio_tipico` (referencia). `url_mas_barato` /
  `vendedor_mas_barato` apuntan al listado del piso. La app muestra
  "eBay desde $piso · típico $mediana" y el link "ver el más barato ↗".
  Ejemplo real: BMW 3 Series 2006-2011 — mín $75 (era un 5 Series), piso
  $109, típico $247 → ganancia EZ $38, no $160. `precio_vendido` (mediana
  del último precio de los listados terminados en 30 d) se llena sola con
  el tiempo y responde "¿la gente compra lo más barato?".
  (Regla anterior, sustituida: 10-15% bajo la mediana.)
- **Envío incluido (regla del dueño, 22 sep): "si no ofrece free shipping
  hay que sumarle el shipping".** `listings.shipping` = envío más barato
  que informa eBay (0 = gratis; null = no lo dijo → se asume el costo de
  la clase de envío de la pieza: S 6 / M 13 / L 22). ebay-sync manda
  `X-EBAY-C-ENDUSERCTX: contextualLocation=country=US,zip=18201` (zip de
  Harry's) para que Browse devuelva `shippingOptions` con monto. TODOS los
  `precio_*` de combo_stats/hot_list son PUESTOS EN CASA (precio + envío).
  La app muestra "eBay desde $144 (envío $35) · típico $257". Dato real
  del 22 sep: de 1,656 listados con envío conocido, 1,254 son gratis y los
  que cobran promedian $48 — sin esto el "más barato" engañaba. Ejemplo:
  BMW 3 Series, $109 + $35 envío = $144 → sugerido $137, ganancia EZ $66.
- **Carriles de rastreo** (re-balanceados 2 sep con la cobertura total;
  sustituyen al ENDED_AFTER_DAYS=5 global): tracked_combos.priority lo
  recalcula refresh_yard_matches() cada 3h con el inventario vivo.
  Carril 1 = ≥10 carros vivos (~11,826 combos, 135 llamadas/corrida, ciclo
  ~3.6 días, ENDED_AFTER_DAYS_FAST=4 — radar completo).
  Carril 2 = 3-9 carros (~14,381 combos, 15 llamadas/corrida, ciclo ~40
  días, ENDED_AFTER_DAYS_SLOW=50 — sirve para precio mediano y competencia,
  NO para velocidad de venta).
  Carril 3 = ≤2 carros (~27,010 combos): ESTACIONADO, sin rastreo de eBay
  hasta que el Growth Check suba el límite; la app igual muestra precios de
  yarda y el link de vendidos. Umbrales y constantes en ebay-sync.
  NO abrir múltiples cuentas
  de developer para dividir carga (viola políticas de eBay; riesgo de baneo).
- Tiempo de manejo en listados: 2 días hábiles.

### ✅ eBay ACTIVO desde el 22 sep 2026 — RADAR SOLO DE RINES

- Cuenta developer aprobada (usuario `payxer`); keyset Production
  `ebay-radar`. Las llaves daban `invalid_client` hasta que el dueño marcó
  la EXENCIÓN de Marketplace Account Deletion ("I do not persist eBay
  data") en Alerts & Notifications — sin eso el keyset queda "Non
  Compliant" y eBay rechaza el token. Secrets `EBAY_CLIENT_ID` /
  `EBAY_CLIENT_SECRET` puestos; copia local en el scratchpad de la sesión.
- **Decisión del dueño (22 sep): el radar de eBay se concentra en RINES.**
  `refresh_yard_matches()` ahora asigna: carril 1 = rines con ≥1 carro vivo
  (~680), carril 2 = rines sin carro (~49), carril 3 = las otras 72 piezas
  ESTACIONADAS (no borradas; para reactivarlas, volver a la regla por
  número de carros vivos en esa función). `part_types.ebay_category_id` del
  rin = 43953 (Car & Truck Wheels).
- `ebay-sync`: BATCH_FAST=30, BATCH_SLOW=5 → cada rin se refresca a
  DIARIO con ~840 llamadas/día (sobran >4,000 para "Espiar mercado").
  Búsqueda por keyword plano ("2015 Infiniti Q50 wheel rim OEM"): el
  `compatibility_filter` devuelve 400 en 6028 y en 43953, así que se quitó
  el intento (desperdiciaba 1 llamada por combo). Modo sonda:
  `POST {"mode":"probe","q":"...","limit":5,"category":"43953"}`.
  Errores ahora legibles (`primerError` en la respuesta).
- Cron `ebay-sync-hourly` (`0 * * * *`) programado. Primera corrida real
  22 sep: 35 combos, 1,704 listados, 321 vendedores, 0 fallos.
- `hot_list` ya da `precio_objetivo` para rines (medianas $150-250 en los
  modelos buenos). `vendidos_30d` arranca en 0: necesita días para ver
  listados desaparecer (ENDED_AFTER_DAYS_FAST=4). `competencia` satura en
  50 = RESULTS_PER_COMBO; mejora pendiente: guardar el `total` que
  devuelve la Browse API por combo.
- **VENDIDOS por API — solicitud en curso.** La Browse API no da vendidos.
  La Marketplace Insights API (item_sales/search, últimos 90 días) sí,
  pero es "limited release": sonda `POST ebay-sync {"mode":"insights"}`
  → `invalid_scope` (no concedida). Solicitud enviada el 22 sep 2026 por
  Application Growth Check, **ticket 260922-000065** (respuesta prometida
  en 1-2 días hábiles; seguimiento en developer.ebay.com → Support → My
  Tickets). Si la aprueban: token con scope
  `https://api.ebay.com/oauth/api_scope/buy.marketplace.insights`, una
  búsqueda por vehículo/día (~700 llamadas) y `vendidos_30d` pasa a ser
  dato real en vez de inferido. Mientras tanto el radar infiere vendidos
  por desaparición de listados (ENDED_AFTER_DAYS).
- MEJORAS PENDIENTES del carril de rines: (1) filtrar juegos de 4 / pares /
  llantas / tapones de las métricas (inflan la mediana); (2) números
  Hollander por vehículo para títulos y comparaciones exactas; (3) "Espiar
  mercado" con getItem (watchers, sold qty) — ver diseño abajo.

### Pendiente 1 (histórico) — Registro de developer (⚠️ fue RECHAZADO, apelación exitosa el 22 sep)

ESTADO 31 ago 2026: el registro del Developers Program (a.ledesma@payxer.com)
fue RECHAZADO ("problems with the data provided or other irregularities")
pese a ser el mismo correo de la cuenta de comprador henrledesm3 (miembro
desde nov 2016, 100% feedback, datos verificados correctos) — falso positivo
del antifraude. El formulario de soporte requiere login de developer (el
rechazado), así que la apelación va por el foro community.ebay.com → "eBay
APIs" posteando desde henrledesm3. POST PUBLICADO 31 ago:
https://community.ebay.com/forum/ebay-developers-program-57950/topic/developer-registration-rejected-despite-using-my-9-year-ebay-account-email-478214/
Revisar respuestas cada 1-2 días; el correo de registro se manda al staff
por DM, no en el hilo. ADEMÁS (1 sep): el usuario encontró el formulario
directo "My account registration was rejected" (pide username del developer
account + use case) y lo envió con a.ledesma@payxer.com y el caso de uso
redactado (Browse API para pricing research, negocio propio en PA, vínculo
con henrledesm3 desde 2016).
CONFIRMADO (2 sep): eBay Developer Support respondió EN EL HILO del foro
remitiendo justamente a ese formulario
(developer.ebay.com/support/developer-account-support, sección "My account
registration was rejected") — o sea, el canal correcto ya está usado y la
solicitud está en cola con Developer Account Support. El usuario responde en
el hilo dejando constancia de que ya lo envió el 1 sep. Esperar respuesta por
correo. NO re-registrarse con otros datos salvo que Developer Support lo
indique. Cuando aprueben, ejecutar los pasos de abajo.

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

### Pendiente 3 — Fase B: borradores de listado — ✅ v1 EN PRODUCCIÓN 31 ago

Al marcar pieza "en bodega", generar borrador copiable: título con specs del
VIN ("11 BMW 328i E90 N52 Right Headlight OEM"), precio sugerido, categoría,
condición, compatibilidad. El usuario publica manual desde la app de eBay
(cuenta nueva tiene límites ~10 items/$500 al mes).
Fórmula de título aprendida de vendedores top (31 ago, ej. parts4less-43):
rango de años ("2004 2008"), modelo con variantes ("F150 F-150"), sinónimos
de la pieza ("Speedometer Cluster Gauge"), "OEM", y sufijo de rastreo
interno (nosotros: últimos 6 del VIN). Al listar manual: buscar un VENDIDO
igual y usar el botón "Sell one like this" de eBay (clona categoría y
specifics). Activar free returns junto al free shipping (mejor ranking;
devoluciones reales en piezas usadas ~2-4%). Rutina del usuario: guardar
3-5 vendedores junkyard grandes y revisar su lista Sold semanalmente
(Terapeak gratis manual; el sold ajeno no existe por API).

### Pendiente 5 — Monitor de competidores (aprobado 31 ago 2026)

Monitorear 50+ vendedores junkyard grandes (tipo parts4less-43) SOLO vía
Browse API con `filter=sellers:{...}` — NUNCA scrapear eBay (prohibido por
su User Agreement; arriesga las llaves de developer y la cuenta de
vendedor; misma lógica que el no a múltiples cuentas). Diseño:
- Tabla `competitors` (username, notas) + snapshots diarios de su
  inventario activo: 1-3 llamadas/vendedor/día ≈ 150 llamadas (hay slack).
- Métricas por vendedor: tamaño y variedad del inventario, precios por
  pieza/modelo vs los nuestros, listados NUEVOS del día (= qué decidieron
  sacar del junker), y velocidad de venta estimada = desaparecidos entre
  snapshots + (nuevos − crecimiento neto). Mismo método de inferencia del
  radar, aplicado por vendedor.
- Pantalla "Competidores" en la web: ranking por velocidad, piezas top,
  sus precios vs los nuestros, alertas ("3 competidores listaron cluster
  F-150 esta semana a $40-50").
- El sold ajeno exacto no existe por API: rutina manual del usuario
  (filtro Sold de 3-5 favoritos, semanal) + Terapeak al abrir cuenta.
- Lista de vendedores a monitorear: pendiente de armar con el usuario
  (primero: parts4less-43).

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

### Sync de Harry's — modo ligero (3 sep 2026, decisión del usuario)

- **Qué pasó:** desde el 1 sep el inventario de Harry's dejó de
  actualizarse. Dos causas: (a) bug en cascada en yard-sync — un `throw`
  por una página fallida abortaba la corrida entera antes de guardar
  cursor, EZ Pull y refresh (cursor clavado en la pág. 80; EZ también se
  congeló). CORREGIDO: Harry's aislado en try/catch, cursor siempre se
  guarda, timeout de 12 s por página. (b) Sucuri (WAF de wegotused.com)
  empezó a tratar al robot distinto que al navegador del usuario: el
  proxy de Pages recibe `504 error code: 504` (o cuelga), y desde
  Supabase directo devuelve `307` a un desafío JS
  (`sucuri_cloudproxy_js`). En el navegador la web funciona normal y sin
  captcha. NO está caída. Hipótesis: el volumen (40 páginas cada 3 h ≈
  320 requests/día, más la cabeza de 10 páginas que agregué el 3 sep)
  disparó la mitigación de bots — VER LA CORRECCIÓN DE ABAJO: esa
  hipótesis se cayó el mismo día. NO construir un resolvedor del desafío
  JS (evasión de WAF; descartado).
- **Decisión del usuario (textual):** "es solo actualizar la primera
  página, quizás 2, ellos no actualizan seguido, quizás una vez al día."
- **Implementado en yard-sync:** Harry's se lee SOLO a las 15 y 21 UTC
  (11 am y 5 pm de PA; `HARRYS_HOURS_UTC`), el cron sigue cada 3 h para
  EZ Pull. Cabeza: página 0 y se sigue a la 1, 2... solo si la anterior
  trajo carros nuevos (tope 4; la yarda lista del más nuevo al más viejo,
  15 por página, entran ~40/día). Barrido rotativo de 3 páginas por
  corrida (`SWEEP_PAGES_PER_RUN`, poner 0 para apagarlo) para detectar
  carros idos: ~190 páginas ⇒ una vuelta cada ~30 días; al cerrar la
  vuelta se marca `left_at` a lo no visto desde `sweep_started_at`, solo
  si ninguna página falló en la vuelta. Sin reintentos, 2 s entre
  páginas. Total ≈ 10 requests/día (antes ≈ 320). Forzar a mano:
  `POST yard-sync {"harrys":true}`; diagnóstico: `{"mode":"raw","page":0,
  "debug":true}` (vía proxy) o `"target":"direct"`.
- **Trade-off aceptado:** un carro que se va tarda hasta ~30 días en
  desaparecer de la app (antes ~1.5 días). Los `vivos` por vehículo (y
  por tanto los carriles de rastreo) pueden ir algo inflados. Si el
  usuario quiere detectar salidas más rápido, subir `SWEEP_PAGES_PER_RUN`
  con cuidado (cada +3 páginas/corrida = +6 requests/día).
- **CORRECCIÓN 3 sep 04:45 UTC — la hipótesis del volumen era casi con
  seguridad EQUIVOCADA.** El usuario reportó que la página también le da
  error DESDE SU COMPUTADORA, durante una tormenta eléctrica en la zona.
  Al revisar la firma de los errores, encaja con que el SERVIDOR DE ORIGEN
  de wegotused.com está caído o intermitente, no con que nos estén
  bloqueando:
  - Vía el proxy de Pages: la request CUELGA (>55 s) o devuelve
    `504 error code: 504`. Un 504 de Sucuri significa que Sucuri (que va
    por delante) no obtuvo respuesta del origen. Un bloqueo por
    reputación sería rápido: 403, 429 o el desafío JS, no una espera de
    55 segundos.
  - EZ Pull respondió normal en la misma corrida (2,012 carros), así que
    nuestra red y la Edge Function están sanas.
  - El `307` con `sucuri_cloudproxy_js` en la ruta DIRECTA no es nuevo ni
    es el problema: Sucuri siempre le pone desafío JS a las IPs de
    datacenter de Supabase. Por eso existe el proxy de Pages desde el
    principio. Sigue igual que siempre.
  Conclusión: **no hay nada que arreglar de nuestro lado**; hay que
  esperar a que el sitio de la yarda vuelva. Antes de volver a tocar
  código, confirmar con el usuario si la página le carga en el navegador.
- **Fallo silencioso corregido (6 sep 2026):** Harry's publicó 59 carros
  con fecha 4 sep y NO entraron solos; se detectaron hasta el 6 sep al
  forzar la lectura a mano. Evidencia: tras la corrida del 5 sep 21:00
  UTC, `yard_sync_state.total_records` quedó en NULL (en una corrida sana
  vale ~2,900), o sea la página 0 llegó ILEGIBLE. `scrapePage` daba
  `fin = true` cuando no encontraba el "Showing N to M of T" ni filas, así
  que la cabeza cortaba y la corrida terminaba sin error, sin `falladas` y
  sin avisar: un 200 con el HTML equivocado (desafío del WAF, página de
  error, cambio de plantilla) se confundía con "ya no hay más carros".
  NOTA: no está confirmado que esos carros ya estuvieran publicados el
  5 sep — la yarda pudo subirlos el 6; lo que sí es seguro es que la
  lectura del 5 vino mala y no nos enteramos.
  Correcciones: (a) `scrapePage` ahora devuelve `util` (= parseó el
  "Showing" Y trajo ≥1 fila) y la página 0 ilegible cuenta como fallo con
  `harrysError`, no como fin de inventario; (b) columna
  `yard_sync_state.harrys_pendiente` — si la lectura falla se marca y la
  SIGUIENTE corrida del cron (3 h) reintenta sin esperar a
  `HARRYS_HOURS_UTC`, porque con solo 2 lecturas al día tragarse un fallo
  cuesta hasta 12 h de carros nuevos; (c) la respuesta trae `reintento`.
- **14 sep 2026 — VEREDICTO: ningún servidor pasa el escudo.** Desde el
  6 sep NINGUNA lectura automática de Harry's funcionó (8 días, 0 carros
  nuevos; `harrys_pendiente=true` y `total_records=NULL` todo el tiempo).
  Probado ese día: (a) proxy en Cloudflare Pages → cuelga hasta el timeout
  (tarpit); (b) directo desde Supabase → 307 desafío JS de Sucuri; (c)
  **GitHub Actions** (sonda `.github/workflows/probe-harrys.yml`, subida a
  `main` con permiso del dueño) → también 307 desafío JS. Solo pasa un
  navegador real en conexión residencial (la del dueño). El dueño NO tiene
  computadora prendida en casa, así que tampoco sirve un script local.
- **CORRECCIÓN del mismo día (14 sep, 22:30 UTC) — el escudo NO está
  cerrado: es INTERMITENTE por rachas.** El dueño señaló, con razón, que
  cuando pedía actualizar a mano sí entraban carros. Veinte minutos después
  de que una sonda esperara 60 s en vano, SEIS sondas seguidas por el proxy
  pasaron con la página completa (200, 122 KB), y una lectura forzada trajo
  60 carros nuevos. Lo que fallaba era el DISEÑO del automático: UN intento
  de 12 s, 2 veces al día → casi nunca caía en racha abierta. A mano
  "funcionaba" porque se insistía hasta pegar en racha abierta.
  Rediseño DESPLEGADO el 14 sep 23:20 UTC (función + web). Puesta al día
  hecha esa noche con el escudo abierto: entraron 59 (4 sep) + 52 (10 sep)
  + 8 (11 sep) carros; la cabeza paró sola en una página sin nuevos. El
  modo ingest se probó contra producción con la página guardada del 29 ago
  (ok, 15 filas; clave mala → 401). OJO: esa prueba re-tocó `last_seen` de
  15 carros viejos y dejó `total_records` en 2889 por un rato (la siguiente
  lectura real lo corrige).
  (a) la CABEZA se intenta en TODAS las corridas del cron (8 chances/día,
  1-2 requests cada una) — el "2 veces al día" ya no aplica a la cabeza,
  solo al barrido rotativo; (b) `FETCH_TRIES=3` con 3 s de pausa;
  (c) `head_resume` en `yard_sync_state`: tras un hueco largo los carros
  nuevos están en muchas páginas, la cabeza sigue mientras cada página
  traiga nuevos y, si el tiempo la corta, la siguiente corrida continúa en
  esa página (antes reiniciaba en la 0, veía 0 nuevos y paraba — así el
  tope de 4 páginas dejó carros sin recuperar el 14 sep). El sweep solo
  corre a las horas fijas y solo si la cabeza terminó limpia.
  El veredicto "ningún servidor pasa" de arriba queda matizado: GitHub y
  Supabase directo SÍ reciben siempre el desafío JS; el proxy de Cloudflare
  pasa por rachas. El marcador del teléfono queda como respaldo garantizado.
- **SOLUCIÓN DE RESPALDO: marcador "Actualizar Harry's" en el teléfono del
  dueño.** Código legible en `web/tools/actualizar-harrys.js`. Corre ESTANDO
  en wegotused.com/our-inventory: baja las páginas 0,1,2… desde ahí (misma
  origen, IP residencial), manda cada una a `yard-sync` en `mode:"ingest"`
  y se detiene cuando una página trae 0 carros nuevos (tope 10). Muestra un
  aviso arriba: "✅ Harry's al día: N carros nuevos". Cómo se instala/usa
  está en la pestaña **Mío** (solo con sesión), sección
  "🔄 Actualizar Harry's desde tu teléfono", con botón "Copiar el código".
  - `yard-sync` `mode:"ingest"`: `{mode,key,pages:[{page,html}]}`; valida
    `key` contra el secret `YARD_INGEST_KEY`, parsea con
    `guardarPaginaHtml()` (mismo parseo que el lector automático), upserta,
    decodifica VINs, `refresh_yard_matches`, limpia `harrys_pendiente` y
    guarda `total_records`. CORS abierto (se llama desde wegotused.com).
  - La clave NO va en el bundle público: vive en la tabla `owner_secrets`
    con RLS `auth.jwt()->>'email' = 'a.ledesma@payxer.com'`; la pestaña Mío
    la lee tras el login y sustituye `__KEY__` en el código del marcador.
    Si hay que rotarla: `supabase secrets set YARD_INGEST_KEY=...` Y
    `update owner_secrets set value=... where name='YARD_INGEST_KEY'`.
  - El cron sigue intentando Harry's a las horas fijas (por si el escudo
    algún día deja pasar), pero con `harrys_fallos`: UN reintento tras un
    fallo y luego espera a la siguiente hora fija — no martillar.
  - Probado con Playwright (14 sep): sección en Mío, clave fuera del bundle,
    marcador sobre una copia real de la página: 2 envíos y paro correcto.
- **22 sep 2026 — HALLAZGO: los fallos del automático eran del MINUTO :00,
  no del escudo.** 41 fallos seguidos (`harrys_fallos`) del 14 al 22 sep,
  pero ese día 9 sondas/lecturas manuales (a minutos sueltos) pasaron
  TODAS en <1 s. Diferencias: (1) `net._http_response` mostraba
  `timed_out=true` en todas las corridas del cron — pg_net corta a los
  5,000 ms por defecto y la función tarda 20-60 s (la función sigue
  corriendo, pero nunca quedaba registro de su respuesta); (2) TODAS las
  corridas automáticas caían en el minuto :00, y sitios WordPress+Sucuri
  suelen ir lentos/cortar justo al cambio de hora. Cambios: crons movidos
  fuera del :00 (`yard-sync-3h` → `17 */3 * * *`, `ebay-sync-hourly` →
  `23 * * * *`) con `timeout_milliseconds := 150000`. Dato: Harry's NO
  agregó carros del 11 al 22 sep (total 2843 sin cambio), así que esa
  semana no se perdió nada, pero el automático sí estaba roto. VERIFICAR
  en los días siguientes que `harrys_fallos` se quede en 0 y que
  `net._http_response` traiga `status_code=200` con el JSON de la función.
- **23 sep 2026 (00:17-00:40 UTC) — dos fallos más, ya corregidos.**
  (1) La corrida del cron de las 00:17 falló en la página 0 con 3
  respuestas no-OK rápidas y `harrysError: null`: no había forma de saber
  QUÉ contestó el proxy. Ahora `scrapePage` devuelve `estado` ("504, 504,
  sin respuesta" / "200 ilegible (503 b)") y la corrida lo pone en
  `harrysError` (queda en `net._http_response`). Además la página 0 en
  200 pero ilegible ya se REINTENTA (antes cortaba a la primera), con
  `FETCH_TRIES=4` y pausas 5/10/15 s. (2) Al probar a mano, una corrida
  se quedó sin tiempo y MURIÓ sin guardar estado (solo "shutdown" en los
  logs): 4 intentos × 30 s por página podían pasar de 2 min. Ahora
  `scrapePage` recibe un `deadline` (= inicio + `TIME_BUDGET_MS`) y no
  reintenta ni espera más allá. Corrida completa (cabeza + 3 páginas de
  barrido + EZ) verificada en 15 s con `falladas: 0`. OJO al leer sondas:
  `{"mode":"raw","debug":true}` devuelve el JSON de diagnóstico del
  proxy (~500 bytes), NO la página; un "200 con 503 bytes" ahí no es un
  bloqueo, es la sonda mal invocada. Para ver la página usa raw SIN debug.
- **PGRST303 "JWT issued at future" en ebay-sync (22-23 sep):** el cron
  de las 23:23 y 00:23 devolvió 500 con ese error desde el cliente
  supabase-js de la función, mientras yard-sync (recién desplegada)
  escribía bien. Los secrets automáticos (`SUPABASE_SERVICE_ROLE_KEY`,
  etc.) se re-emiten en cada deploy; la instancia vieja de ebay-sync se
  quedó con una llave que PostgREST rechazaba. SOLUCIÓN: redesplegar la
  función (`supabase functions deploy ebay-sync --no-verify-jwt`); la
  primera llamada justo después del deploy puede fallar igual (desfase de
  reloj), la segunda ya funciona. Si vuelve a pasar en cualquier función,
  redesplegar antes de investigar otra cosa.
- **Cómo verificar cuando vuelva:** `POST yard-sync {"harrys":true}` y
  mirar `falladas` (debe ser 0) y `rows` (> 0); o revisar
  `yard_sync_state.harrys_run_at` y las respuestas del cron en
  `net._http_response`. El sandbox de Claude NO alcanza wegotused.com ni
  pages.dev; probar siempre a través de la función.
- **Si el sitio carga bien en el navegador y aun así el robot falla**
  durante varios días, ENTONCES sí sospechar bloqueo, y el plan B es
  mover el relevo a otro origen (un Worker aparte con otra IP de salida).
  NO construir un resolvedor del desafío JS.

### Otras notas operativas

- Tokens de esta infra: Supabase access token y Cloudflare API token los
  tiene el usuario; pedírselos si la sesión no los tiene.
- Terapeak (gratis en Seller Hub cuando haya cuenta de vendedor) para validar
  nichos manualmente; no tiene API.
- Rediseño UI/UX: hay lienzo en Claude Design y prompt preparado; si el
  usuario trae un diseño final, implementarlo sin perder funcionalidad.
