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

Deno.serve(async () => {
  const started = Date.now();
  try {
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

    const { error: e3 } = await supabase
      .from("yard_sync_state")
      .update({ next_page: page, total_records: total, last_run_at: now })
      .eq("id", 1);
    if (e3) throw e3;

    return new Response(
      JSON.stringify({ rows, next_page: page, total, wrapped, ms: Date.now() - started }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error(err);
    const detail = err instanceof Error ? err.message : JSON.stringify(err);
    return new Response(JSON.stringify({ error: detail }), { status: 500 });
  }
});
