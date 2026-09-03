// =============================================================
// YARD SYNC — Inventario de las dos yardas.
// Corre por cron cada 3h. EZ Pull (JSON) se lee en CADA corrida.
// Harry's (wegotused.com, tras el WAF de Sucuri) va en MODO LIGERO:
// solo en HARRYS_HOURS_UTC (2 veces al día) y solo la(s) primera(s)
// página(s), que es donde salen los carros recién llegados, más un
// puñado de páginas del barrido rotativo para detectar los que se
// fueron. ~10 requests/día en vez de ~320: el 3 sep 2026 Sucuri empezó
// a devolver 504/desafío JS al robot (el navegador seguía bien) y la
// hipótesis es que fue por volumen.
// Sin secrets extra: solo lee páginas públicas.
// =============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const YARD = "HAZLE TOWNSHIP";
// Segunda yarda: EZ Pull & Save (New Ringgold, PA). Publica su inventario
// como JSON limpio (year/make/model/row/placement_date), sin VINs — se les
// genera un id sintético "EZ-<hash>" y no pasan por el decodificador NHTSA.
const EZ_YARD = "EZ PULL";
const EZ_URL = "https://www.ezpullandsave.com/get_inventory.php";
// El sitio de la yarda (Sucuri) bloquea las IPs de Supabase; se lee a
// través del relevo /api/yard desplegado en el proyecto de Cloudflare Pages
// (web/public/_worker.js).
const BASE = "https://ebay-radar.pages.dev/api/yard?page=";
// Horas UTC en las que se lee Harry's (el cron corre a las 0,3,...,21 UTC).
// 15 y 21 UTC = 11am y 5pm hora de PA en verano. La yarda sube carros
// más o menos una vez al día, así que con dos lecturas sobra.
// Forzar a mano: POST {"harrys":true}; saltar: {"harrys":false}.
const HARRYS_HOURS_UTC = [15, 21];
// Cabeza: la yarda lista del más nuevo al más viejo (15 carros por
// página, entran ~40/día). Se lee la página 0 y se sigue a la siguiente
// SOLO si la anterior trajo carros nuevos. Normalmente: 1-2 páginas.
const HEAD_PAGES_MAX = 4;
// Barrido rotativo para detectar los carros que YA NO ESTÁN: pocas
// páginas por corrida (~190 páginas => una vuelta cada ~30 días).
// Poner 0 para desactivarlo del todo.
const SWEEP_PAGES_PER_RUN = 3;
const TIME_BUDGET_MS = 60_000;  // tope duro de la parte de Harry's
const FETCH_TIMEOUT_MS = 12_000; // el WAF a veces deja la conexión colgada
const FETCH_TRIES = 1;    // sin reintentos: si nos bloquean, insistir empeora
const RETRY_MS = 800;
const DELAY_MS = 2_000;   // pausa entre páginas, ritmo de persona
// Cuántas páginas pueden fallar en UNA VUELTA completa y aun así marcar
// como idos los carros no vistos (una página saltada = 15 carros que
// podríamos dar por idos sin estarlo).
const MAX_FALLADAS_PARA_BARRER = 0;

const ROW_RE =
  /HAZLE TOWNSHIP<\/td>\s*<td[^>]*>(\d{4})<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>/g;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function parseDate(mmddyyyy: string): string | null {
  const [mm, dd, yy] = (mmddyyyy ?? "").trim().split("/");
  return yy ? `${yy}-${mm}-${dd}` : null;
}

// ---------- Decodificar VINs con la API pública NHTSA vPIC ----------
const NHTSA_BATCH_URL =
  "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/";

function shortDrive(d: string): string | null {
  if (!d) return null;
  return d.split("/")[0].trim() || null; // "AWD/All-Wheel Drive" -> "AWD"
}

function engineText(r: Record<string, string>): string | null {
  const parts: string[] = [];
  const disp = Number(r.DisplacementL);
  if (Number.isFinite(disp) && disp > 0) parts.push(`${Math.round(disp * 10) / 10}L`);
  if (r.EngineCylinders) parts.push(`${r.EngineCylinders}cyl`);
  if (r.FuelTypePrimary && r.FuelTypePrimary !== "Gasoline") parts.push(r.FuelTypePrimary);
  return parts.length ? parts.join(" ") : null;
}

// Códigos de chasis/motor derivados de modelo + año + carrocería.
// Cubre las marcas europeas del radar; null cuando no hay certeza.
function deriveChassis(make: string, model: string, year: number, body: string): string | null {
  const mk = (make ?? "").toUpperCase();
  const md = (model ?? "").toUpperCase();
  const b = (body ?? "").toUpperCase();
  if (mk === "BMW") {
    const serie = md.match(/^([2357])\d\d/)?.[1] ?? (md.startsWith("X") ? md.slice(0, 2) : null);
    if (serie === "3") {
      if (year <= 2005) return "E46";
      if (year <= 2011) return b.includes("CONVERTIBLE") ? "E93" : b.includes("COUPE") ? "E92" : b.includes("WAGON") ? "E91" : "E90";
      if (year <= 2018) return b.includes("WAGON") ? "F31" : "F30";
      return "G20";
    }
    if (serie === "5") {
      if (year <= 2003) return "E39";
      if (year <= 2010) return b.includes("WAGON") ? "E61" : "E60";
      if (year <= 2016) return "F10";
      return "G30";
    }
    if (serie === "7") {
      if (year >= 2002 && year <= 2008) return "E65";
      if (year <= 2015) return "F01";
      return "G11";
    }
    if (serie === "2") return year <= 2021 ? "F22" : "G42";
    if (serie === "X3") {
      if (year <= 2010) return "E83";
      if (year <= 2017) return "F25";
      return "G01";
    }
    if (serie === "X5") {
      if (year <= 2006) return "E53";
      if (year <= 2013) return "E70";
      if (year <= 2018) return "F15";
      return "G05";
    }
    return null;
  }
  if (mk === "MINI") {
    if (year <= 2006) return "R50";
    if (year <= 2013) return "R56";
    return "F56";
  }
  if (mk.startsWith("MERCEDES")) {
    const clase = md.match(/^([CES])(-CLASS|\d{3})/)?.[1];
    if (clase === "C") {
      if (year <= 2007) return "W203";
      if (year <= 2014) return "W204";
      if (year <= 2021) return "W205";
      return "W206";
    }
    if (clase === "E") {
      if (year >= 2003 && year <= 2009) return "W211";
      if (year <= 2016) return "W212";
      return "W213";
    }
    if (clase === "S") {
      if (year <= 2006) return "W220";
      if (year <= 2013) return "W221";
      return "W222";
    }
  }
  return null;
}

function deriveEngineCode(make: string, model: string, year: number, disp: number): string | null {
  if ((make ?? "").toUpperCase() !== "BMW") return null;
  const md = (model ?? "").toUpperCase();
  if (/^32[358]I/.test(md)) return year >= 2012 ? "N20" : year >= 2006 ? "N52" : "M54";
  if (/^330I/.test(md)) return year >= 2017 ? "B48" : year >= 2006 ? "N52" : "M54";
  if (/^335I/.test(md)) return year <= 2010 ? "N54" : "N55";
  if (/^335D/.test(md)) return "M57";
  if (/^320I/.test(md) && year >= 2012) return "N20";
  if (/^340I/.test(md)) return "B58";
  if (/^52[358]I/.test(md)) return year >= 2012 ? "N20" : year >= 2006 ? "N52" : "M54";
  if (/^530I/.test(md)) return year >= 2006 ? "N52" : "M54";
  if (/^535I/.test(md)) return year <= 2010 ? "N54" : "N55";
  if (/^550I/.test(md)) return year <= 2010 ? "N62" : "N63";
  if (/^74[05]/.test(md)) return year >= 2009 ? "N63" : "N62";
  if (/^750/.test(md)) return year >= 2009 ? "N63" : "N62";
  if (/^M?235I/.test(md)) return "N55";
  if (/^228I/.test(md)) return "N20";
  if (md.startsWith("X3")) {
    if (disp >= 2.5) return year <= 2006 ? "M54" : year <= 2012 ? "N52" : "N55";
    return "N20";
  }
  if (md.startsWith("X5")) {
    if (disp >= 4.5) return year <= 2010 ? "N62" : "N63";
    if (disp >= 4.2) return year <= 2003 ? "M62" : year <= 2010 ? "N62" : "N63";
    return year <= 2006 ? "M54" : year <= 2010 ? "N52" : "N55";
  }
  return null;
}

async function syncEzPull(): Promise<number> {
  const res = await fetch(EZ_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (ebay-radar yard-sync)" },
  });
  if (!res.ok) throw new Error(`EZ Pull: ${res.status}`);
  const data = (await res.json()) as Array<{
    year?: string; make?: string; model?: string; row?: string; placement_date?: string;
  }>;
  if (!Array.isArray(data) || data.length === 0) return 0;

  const now = new Date().toISOString();
  const seen = new Map<string, number>();
  const batch: Record<string, unknown>[] = [];
  for (const r of data) {
    const base = `${r.year}|${(r.make ?? "").toUpperCase()}|${(r.model ?? "").toUpperCase()}|${r.row}|${r.placement_date}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(`${base}|${n}`));
    const id = "EZ-" + Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 14);
    batch.push({
      vin: id,
      yard: EZ_YARD,
      year: Number(r.year) || null,
      make: (r.make ?? "").trim().toUpperCase(),
      model: (r.model ?? "").trim().toUpperCase(),
      manufacturer: (r.make ?? "").trim(),
      color: null,
      yard_date: parseDate(r.placement_date ?? ""),
      row_number: (r.row ?? "").trim(),
      last_seen: now,
      left_at: null,
      vin_decoded_at: now, // id sintético: no intentar decodificar en NHTSA
    });
  }
  for (let i = 0; i < batch.length; i += 500) {
    const { error } = await supabase
      .from("yard_inventory")
      .upsert(batch.slice(i, i + 500), { onConflict: "vin" });
    if (error) throw error;
  }
  // Lo que ya no aparece en el JSON de EZ => se fue de la yarda
  const cutoff = new Date(Date.now() - 3 * 864e5).toISOString();
  const { error } = await supabase
    .from("yard_inventory")
    .update({ left_at: now })
    .eq("yard", EZ_YARD)
    .is("left_at", null)
    .lt("last_seen", cutoff);
  if (error) throw error;
  return batch.length;
}

async function decodeVins(limit: number): Promise<number> {
  const { data: pending, error } = await supabase
    .from("yard_inventory")
    .select("vin")
    .is("vin_decoded_at", null)
    .is("left_at", null)
    .limit(limit);
  if (error) throw error;
  if (!pending || pending.length === 0) return 0;

  let decoded = 0;
  const now = new Date().toISOString();
  for (let i = 0; i < pending.length; i += 50) {
    const vins = pending.slice(i, i + 50).map((p) => p.vin);
    const res = await fetch(NHTSA_BATCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `DATA=${encodeURIComponent(vins.join(";"))}&format=json`,
    });
    if (!res.ok) throw new Error(`NHTSA: ${res.status}`);
    const results = (await res.json()).Results as Record<string, string>[];

    for (const r of results ?? []) {
      const vin = (r.VIN ?? "").trim();
      if (!vin) continue;
      const year = Number(r.ModelYear) || 0;
      const disp = Number(r.DisplacementL) || 0;
      const { error: e } = await supabase
        .from("yard_inventory")
        .update({
          trim: r.Trim || null,
          engine: engineText(r),
          drive_type: shortDrive(r.DriveType),
          body_class: r.BodyClass || null,
          model_detail: r.Model || null,
          doors: Math.round(Number(r.Doors)) || null,
          engine_hp: Math.round(Number(r.EngineHP)) || null,
          chassis_code: deriveChassis(r.Make, r.Model, year, r.BodyClass),
          engine_code: deriveEngineCode(r.Make, r.Model, year, disp),
          vin_decoded_at: now,
        })
        .eq("vin", vin);
      if (e) throw e;
      decoded++;
    }
    // Marca también los que NHTSA no devolvió para no reintentarlos por siempre
    const returned = new Set((results ?? []).map((r) => (r.VIN ?? "").trim()));
    for (const vin of vins.filter((v) => !returned.has(v))) {
      await supabase.from("yard_inventory").update({ vin_decoded_at: now }).eq("vin", vin);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return decoded;
}

// Baja UNA página del inventario y la guarda. Devuelve cuántos carros
// trajo y cuántos de esos no teníamos: eso permite parar el barrido de
// cabeza apenas deja de haber novedades.
async function scrapePage(page: number, now: string) {
  let res: Response | null = null;
  for (let intento = 1; intento <= FETCH_TRIES; intento++) {
    let url = BASE + page;
    let r = await fetch(url, {
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }).catch(() => null);
    // Sigue hasta 3 redirects conservando query y headers
    for (let hop = 0; hop < 3 && r && r.status >= 300 && r.status < 400; hop++) {
      const loc = r.headers.get("location");
      if (!loc) break;
      url = new URL(loc, url).toString();
      r = await fetch(url, {
        redirect: "manual",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }).catch(() => null);
    }
    if (r?.ok) { res = r; break; }
    console.error(`pagina ${page} intento ${intento}: ${r?.status ?? "sin respuesta"}`);
    if (intento < FETCH_TRIES) await new Promise((r2) => setTimeout(r2, RETRY_MS * intento));
  }
  if (!res) return { ok: false, vistos: 0, nuevos: 0, total: null as number | null, fin: false };

  const html = await res.text();
  const m = html.match(/Showing (\d+) to (\d+) of (\d+)/);
  const total = m ? Number(m[3]) : null;

  // Map por VIN: la yarda a veces repite un carro en la misma página
  const byVin = new Map<string, Record<string, unknown>>();
  for (const r of html.matchAll(ROW_RE)) {
    const [, year, make, model, mfr, color, date, row, vin] = r;
    if (!vin?.trim()) continue;
    byVin.set(vin.trim(), {
      vin: vin.trim(),
      yard: YARD,
      year: Number(year) || null,
      make: make.trim(),
      model: model.trim(),
      manufacturer: mfr.trim(),
      color: color.trim(),
      yard_date: parseDate(date),
      row_number: row.trim(),
      last_seen: now,
      left_at: null,
    });
  }

  const batch = [...byVin.values()];
  let nuevos = 0;
  if (batch.length > 0) {
    const vins = batch.map((b) => b.vin as string);
    const { data: yaEstan } = await supabase
      .from("yard_inventory")
      .select("vin")
      .in("vin", vins);
    const conocidos = new Set((yaEstan ?? []).map((e) => e.vin));
    nuevos = vins.filter((v) => !conocidos.has(v)).length;

    const { error } = await supabase
      .from("yard_inventory")
      .upsert(batch, { onConflict: "vin" });
    if (error) throw error;
  }

  // ¿Se acabó el inventario? -> el barrido dio la vuelta
  const fin = !m || batch.length === 0 || (total !== null && Number(m[2]) >= total);
  return { ok: true, vistos: batch.length, nuevos, total, fin };
}

Deno.serve(async (req) => {
  const started = Date.now();
  try {
    // Modo "solo decodificar" para backfill: POST {"mode":"decode","limit":500}
    const body = await req.json().catch(() => ({}));
    // Sonda de diagnóstico: devuelve el resultado completo de NHTSA para un VIN
    if (body?.mode === "probe" && typeof body.vin === "string") {
      const res = await fetch(
        `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(body.vin)}?format=json`,
      );
      const r = (await res.json()).Results?.[0] ?? {};
      const filled = Object.fromEntries(
        Object.entries(r).filter(([, v]) => v !== "" && v !== null && v !== "Not Applicable"),
      );
      return new Response(JSON.stringify(filled), {
        headers: { "Content-Type": "application/json" },
      });
    }
    // Diagnóstico: {"mode":"raw","page":0} devuelve status + trozo del cuerpo
    if (body?.mode === "raw") {
      // target "direct" = pegarle al sitio de la yarda sin pasar por el
      // proxy de Pages, para comparar los dos caminos.
      const url = body.target === "direct"
        ? "https://wegotused.com/our-inventory/?inv%5Byard%5D=HAZLE%20TOWNSHIP&inv%5Bpage%5D=" + (body.page ?? 0)
        : BASE + (body.page ?? 0) + (body.debug ? "&debug=1" : "");
      const r = await fetch(url, {
        redirect: "manual",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://wegotused.com/our-inventory/",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "same-origin",
          "Upgrade-Insecure-Requests": "1",
        },
        signal: AbortSignal.timeout(Number(body.timeout) || 55_000),
      }).catch((e) => ({ status: 0, err: String(e) } as unknown as Response));
      const txt = typeof (r as Response).text === "function" ? await (r as Response).text() : "";
      return new Response(
        JSON.stringify({
          url,
          status: r.status,
          err: (r as unknown as { err?: string }).err ?? null,
          snippet: txt.slice(0, 700),
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (body?.mode === "decode") {
      const decoded = await decodeVins(Math.min(Number(body.limit) || 500, 1000));
      return new Response(
        JSON.stringify({ decoded, ms: Date.now() - started }),
        { headers: { "Content-Type": "application/json" } },
      );
    }
    const { data: state, error: e0 } = await supabase
      .from("yard_sync_state")
      .select("next_page, sweep_started_at, sweep_falladas")
      .eq("id", 1)
      .single();
    if (e0) throw e0;

    let page = state.next_page ?? 0;
    let total: number | null = null;
    let rows = 0;
    let wrapped = false;
    let falladas = 0;
    let sweepStartedAt: string | null = state.sweep_started_at ?? null;
    let sweepFalladas: number = state.sweep_falladas ?? 0;
    const now = new Date().toISOString();

    // ¿Toca leer Harry's en esta corrida?
    const hora = new Date().getUTCHours();
    const leerHarrys = body?.harrys === true ||
      (body?.harrys !== false && HARRYS_HOURS_UTC.includes(hora));

    // Harry's va aislado: si truena, EZ Pull y el refresh de matches
    // igual corren (antes un 403 tumbaba TODA la corrida y dejaba el
    // cursor clavado en la misma página, congelando las dos yardas).
    let harrysError: string | null = null;
    let cabeza = 0;      // páginas leídas en la cabeza
    let nuevosArriba = 0; // carros nuevos encontrados arriba
    let barridas = 0;    // páginas leídas del barrido rotativo
    let idos = 0;        // carros marcados como idos en esta corrida
    if (leerHarrys) {
      try {
        // ---- 1) CABEZA: página 0 y, solo si trajo carros nuevos, la 1... ----
        for (let p = 0; p < HEAD_PAGES_MAX; p++) {
          if (Date.now() - started > TIME_BUDGET_MS) break;
          const r = await scrapePage(p, now);
          cabeza++;
          if (!r.ok) { falladas++; break; } // bloqueados: no insistir
          rows += r.vistos;
          nuevosArriba += r.nuevos;
          if (r.total !== null) total = r.total;
          if (r.fin || r.nuevos === 0) break;
          await new Promise((r2) => setTimeout(r2, DELAY_MS));
        }

        // ---- 2) BARRIDO ROTATIVO (pocas páginas por corrida) ----
        // La cabeza sola nunca vería los carros que YA NO ESTÁN; para eso
        // se da la vuelta al inventario despacio, página por página.
        if (falladas === 0 && SWEEP_PAGES_PER_RUN > 0) {
          if (page === 0 || !sweepStartedAt) { sweepStartedAt = now; sweepFalladas = 0; }
          for (let i = 0; i < SWEEP_PAGES_PER_RUN; i++) {
            if (Date.now() - started > TIME_BUDGET_MS) break;
            await new Promise((r2) => setTimeout(r2, DELAY_MS));
            const r = await scrapePage(page, now);
            barridas++;
            if (!r.ok) { falladas++; sweepFalladas++; page++; break; } // bloqueados: parar
            rows += r.vistos;
            if (r.total !== null) total = r.total;
            if (r.fin) { wrapped = true; break; }
            page++;
          }
        }

        // Al completar la vuelta: lo que no se vio desde que empezó ya no
        // está en la yarda. Solo si la vuelta fue limpia (sin páginas
        // saltadas), para no dar por ido a un carro que sí sigue ahí.
        if (wrapped) {
          if (sweepStartedAt && sweepFalladas <= MAX_FALLADAS_PARA_BARRER) {
            const { data: d1, error: e1 } = await supabase
              .from("yard_inventory")
              .update({ left_at: now })
              .eq("yard", YARD)
              .is("left_at", null)
              .lt("last_seen", sweepStartedAt)
              .select("vin");
            if (e1) throw e1;
            idos = d1?.length ?? 0;
          }
          page = 0;
          sweepStartedAt = now;
          sweepFalladas = 0;
        }
      } catch (err) {
        harrysError = err instanceof Error ? err.message : String(err);
        console.error("Harry's:", harrysError);
      }
    }

    // Decodifica un lote de VINs pendientes en cada corrida (carros nuevos)
    let decoded = 0;
    try {
      decoded = await decodeVins(100);
    } catch (err) {
      console.error("decode VINs:", err); // no tumba el sync del inventario
    }

    // Sincroniza EZ Pull (1 request, JSON completo) en cada corrida
    let ez = 0;
    try {
      ez = await syncEzPull();
    } catch (err) {
      console.error("EZ Pull:", err); // no tumba el sync de Harry's
    }

    // Recalcular el cruce al final, con TODAS las yardas ya sincronizadas
    const { error: e2 } = await supabase.rpc("refresh_yard_matches");
    if (e2) throw e2;

    const { error: e3 } = await supabase
      .from("yard_sync_state")
      .update({
        next_page: page,
        total_records: total,
        last_run_at: now,
        sweep_started_at: sweepStartedAt,
        sweep_falladas: sweepFalladas,
        ...(leerHarrys ? { harrys_run_at: now } : {}),
      })
      .eq("id", 1);
    if (e3) throw e3;

    return new Response(
      JSON.stringify({ harrys: leerHarrys, rows, nuevosArriba, cabeza, barridas, next_page: page, total, wrapped, idos, falladas, harrysError, decoded, ez, ms: Date.now() - started }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error(err);
    const detail = err instanceof Error ? err.message : JSON.stringify(err);
    return new Response(JSON.stringify({ error: detail }), { status: 500 });
  }
});
