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
// El sitio de la yarda (Sucuri) bloquea las IPs de Supabase; se lee a
// través del relevo /api/yard desplegado en el proyecto de Cloudflare Pages
// (web/public/_worker.js).
const BASE = "https://ebay-radar.pages.dev/api/yard?page=";
const PAGES_PER_RUN = 40; // 15 filas/página; vuelta completa ≈ 5 corridas
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
    const now = new Date().toISOString();

    for (let i = 0; i < PAGES_PER_RUN; i++) {
      let url = BASE + page;
      let res = await fetch(url, {
        redirect: "manual",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      // Sigue hasta 3 redirects conservando query y headers
      for (let hop = 0; hop < 3 && res.status >= 300 && res.status < 400; hop++) {
        const loc = res.headers.get("location");
        if (!loc) break;
        url = new URL(loc, url).toString();
        res = await fetch(url, {
          redirect: "manual",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml",
          },
        });
      }
      if (!res.ok) {
        throw new Error(
          `inventario pagina ${page}: ${res.status} loc=${res.headers.get("location") ?? "-"} url=${url}`,
        );
      }
      const html = await res.text();

      const m = html.match(/Showing (\d+) to (\d+) of (\d+)/);
      if (m) total = Number(m[3]);

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
      if (batch.length > 0) {
        const { error } = await supabase
          .from("yard_inventory")
          .upsert(batch, { onConflict: "vin" });
        if (error) throw error;
        rows += batch.length;
      }

      // ¿Se acabó el inventario? -> vuelta completa
      if (!m || batch.length === 0 || (total !== null && Number(m[2]) >= total)) {
        wrapped = true;
        page = 0;
        break;
      }
      page++;
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }

    if (wrapped) {
      // Lo que llevamos 3+ días sin ver ya no está en la yarda
      const cutoff = new Date(Date.now() - 3 * 864e5).toISOString();
      const { error: e1 } = await supabase
        .from("yard_inventory")
        .update({ left_at: now })
        .is("left_at", null)
        .lt("last_seen", cutoff);
      if (e1) throw e1;
    }

    const { error: e2 } = await supabase.rpc("refresh_yard_matches");
    if (e2) throw e2;

    // Decodifica un lote de VINs pendientes en cada corrida (carros nuevos)
    let decoded = 0;
    try {
      decoded = await decodeVins(100);
    } catch (err) {
      console.error("decode VINs:", err); // no tumba el sync del inventario
    }

    const { error: e3 } = await supabase
      .from("yard_sync_state")
      .update({ next_page: page, total_records: total, last_run_at: now })
      .eq("id", 1);
    if (e3) throw e3;

    return new Response(
      JSON.stringify({ rows, next_page: page, total, wrapped, decoded, ms: Date.now() - started }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error(err);
    const detail = err instanceof Error ? err.message : JSON.stringify(err);
    return new Response(JSON.stringify({ error: detail }), { status: 500 });
  }
});
