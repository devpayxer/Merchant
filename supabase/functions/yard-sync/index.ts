// =============================================================
// YARD SYNC — Inventario de Harry's U-Pull It (wegotused.com)
// Corre por cron. Cada corrida avanza PAGES_PER_RUN páginas del
// inventario (cursor en yard_sync_state); al completar una vuelta
// entera marca como "left" los carros que ya no aparecen y
// recalcula el cruce con los vehículos monitoreados.
// Sin secrets extra: solo lee una página pública.
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
const PAGES_PER_RUN = 40;  // tope de páginas; manda el presupuesto de tiempo
// Presupuesto para la parte de Harry's: la Edge Function tiene límite de
// cómputo y el sitio de la yarda a veces va lento. Cortamos por tiempo y
// guardamos el avance, en vez de que la corrida muera sin guardar nada.
const TIME_BUDGET_MS = 60_000;
// Barrido de cabeza: las primeras páginas traen los carros recién
// llegados, así que se leen en cada corrida (novedades en <=3h en vez de
// esperar la vuelta completa).
const HEAD_PAGES_MAX = 10;
const HEAD_BUDGET_MS = 25_000;
const FETCH_TIMEOUT_MS = 12_000; // el WAF a veces deja la conexión colgada
const FETCH_TRIES = 2;    // reintentos por página antes de saltarla
const RETRY_MS = 800;     // espera entre reintentos (crece por intento)
const MAX_FALLADAS_PARA_BARRER = 2; // más fallos que esto => no barrer
const DELAY_MS = 350;

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
      const url = BASE + (body.page ?? 0);
      const r = await fetch(url, {
        redirect: "manual",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }).catch((e) => ({ status: 0, err: String(e) } as unknown as Response));
      const txt = typeof (r as Response).text === "function" ? await (r as Response).text() : "";
      return new Response(
        JSON.stringify({ url, status: r.status, snippet: txt.slice(0, 700) }),
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
      .select("next_page")
      .eq("id", 1)
      .single();
    if (e0) throw e0;

    let page = state.next_page ?? 0;
    let total: number | null = null;
    let rows = 0;
    let wrapped = false;
    let falladas = 0;
    const now = new Date().toISOString();

    // Harry's va aislado: si truena, EZ Pull y el refresh de matches
    // igual corren (antes un 403 tumbaba TODA la corrida y dejaba el
    // cursor clavado en la misma página, congelando las dos yardas).
    let harrysError: string | null = null;
    let cabeza = 0;      // páginas leídas en el barrido de cabeza
    let nuevosArriba = 0; // carros nuevos encontrados arriba
    try {
    // ---- 1) BARRIDO DE CABEZA (en CADA corrida) ----
    // La yarda lista del más nuevo al más viejo (verificado: la página 0
    // trae las fechas más recientes), así que los carros que acaban de
    // entrar están arriba. Leemos las primeras páginas y paramos apenas
    // dos seguidas no traigan nada nuevo: normalmente son 2 páginas.
    let sinNuevos = 0;
    for (let p = 0; p < HEAD_PAGES_MAX; p++) {
      if (Date.now() - started > HEAD_BUDGET_MS) break;
      const r = await scrapePage(p, now);
      cabeza++;
      if (!r.ok) { falladas++; break; } // si la cabeza falla, no insistimos
      rows += r.vistos;
      nuevosArriba += r.nuevos;
      if (r.total !== null) total = r.total;
      if (r.fin) break;
      sinNuevos = r.nuevos === 0 ? sinNuevos + 1 : 0;
      if (sinNuevos >= 2) break; // dos páginas seguidas sin novedad: basta
      await new Promise((r2) => setTimeout(r2, DELAY_MS));
    }

    // ---- 2) BARRIDO PROFUNDO (rotativo, con el tiempo que sobre) ----
    // La cabeza sola nunca vería los carros que YA NO ESTÁN; para eso
    // seguimos dando la vuelta completa al inventario, página por página.
    for (let i = 0; i < PAGES_PER_RUN; i++) {
      if (Date.now() - started > TIME_BUDGET_MS) break; // se acabó el tiempo
      const r = await scrapePage(page, now);
      if (!r.ok) {
        falladas++;
        page++;
        await new Promise((r2) => setTimeout(r2, DELAY_MS));
        continue;
      }
      rows += r.vistos;
      if (r.total !== null) total = r.total;
      if (r.fin) { wrapped = true; page = 0; break; }
      page++;
      await new Promise((r2) => setTimeout(r2, DELAY_MS));
    }

    // Solo barremos si la vuelta fue (casi) limpia: con páginas saltadas
    // podríamos dar por ida a un carro que sí sigue ahí.
    if (wrapped && falladas <= MAX_FALLADAS_PARA_BARRER) {
      // Lo que llevamos 6+ días sin ver ya no está en la yarda
      const cutoff = new Date(Date.now() - 6 * 864e5).toISOString();
      const { error: e1 } = await supabase
        .from("yard_inventory")
        .update({ left_at: now })
        .is("left_at", null)
        .lt("last_seen", cutoff);
      if (e1) throw e1;
    }
    } catch (err) {
      harrysError = err instanceof Error ? err.message : String(err);
      console.error("Harry's:", harrysError);
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
        next_page: harrysError ? (page + PAGES_PER_RUN) % 200 : page,
        total_records: total,
        last_run_at: now,
      })
      .eq("id", 1);
    if (e3) throw e3;

    return new Response(
      JSON.stringify({ rows, nuevosArriba, cabeza, next_page: page, total, wrapped, falladas, harrysError, decoded, ez, ms: Date.now() - started }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error(err);
    const detail = err instanceof Error ? err.message : JSON.stringify(err);
    return new Response(JSON.stringify({ error: detail }), { status: 500 });
  }
});
