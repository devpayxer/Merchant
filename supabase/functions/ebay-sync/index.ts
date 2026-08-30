// =============================================================
// EBAY PARTS RADAR — Edge Function de sincronización
// Corre por cron (cada hora). En cada corrida:
//   1. Toma un lote de combos (los menos recientes primero)
//   2. Consulta la Browse API con compatibility_filter
//      (fallback a búsqueda por keyword si el filtro falla)
//   3. Upsert de listados + snapshot de precio del día
//   4. Marca como "vendido" (ended_at) lo que desapareció
//
// Secrets requeridos (supabase secrets set):
//   EBAY_CLIENT_ID, EBAY_CLIENT_SECRET
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen inyectados.
// =============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const BATCH_SIZE = 150;          // combos por corrida (150 × 24 corridas ≈ 3,600 llamadas/día, bajo el límite de 5,000)
const RESULTS_PER_COMBO = 50;    // listados por consulta
const ENDED_AFTER_DAYS = 5;      // no visto en N días => lo damos por vendido/terminado
// 5 días aprobado por el dueño (30 ago 2026): con 9,350 combos y 3,600
// llamadas/día cada combo se revisa cada ~2.5-3 días; un umbral de 3 daría
// falsos "vendidos". Bajarlo de nuevo cuando el Growth Check suba el límite.
const MIN_PRICE = 10;            // ignora listados de menos de $10 (no vale el esfuerzo)

const EBAY_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const PARTS_CATEGORY = "6028"; // Car & Truck Parts & Accessories

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ---------- eBay OAuth (client credentials, dura 2h) ----------
async function getEbayToken(): Promise<string> {
  const creds = btoa(
    `${Deno.env.get("EBAY_CLIENT_ID")}:${Deno.env.get("EBAY_CLIENT_SECRET")}`,
  );
  const res = await fetch(EBAY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${creds}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });
  if (!res.ok) throw new Error(`eBay token: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

// ---------- Búsqueda de un combo ----------
interface Combo {
  id: number;
  vehicles: { make: string; model: string; year_start: number; year_end: number };
  part_types: { search_keyword: string; ebay_category_id: string | null };
}

async function searchCombo(token: string, combo: Combo) {
  const v = combo.vehicles;
  const p = combo.part_types;
  const midYear = Math.round((v.year_start + v.year_end) / 2);
  const category = p.ebay_category_id ?? PARTS_CATEGORY;
  const baseFilter = `conditions:{USED},itemLocationCountry:US,price:[${MIN_PRICE}..],priceCurrency:USD,buyingOptions:{FIXED_PRICE}`;

  const headers = {
    Authorization: `Bearer ${token}`,
    "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
  };

  // Intento 1: fitment estructurado
  const withFitment = new URLSearchParams({
    q: p.search_keyword,
    category_ids: category,
    filter: baseFilter,
    compatibility_filter: `Year:${midYear};Make:${v.make};Model:${v.model}`,
    limit: String(RESULTS_PER_COMBO),
  });
  let res = await fetch(`${EBAY_SEARCH_URL}?${withFitment}`, { headers });

  // Fallback: keyword plano "2014 Honda Civic left headlight OEM"
  if (!res.ok) {
    const plain = new URLSearchParams({
      q: `${midYear} ${v.make} ${v.model} ${p.search_keyword}`,
      category_ids: category,
      filter: baseFilter,
      limit: String(RESULTS_PER_COMBO),
    });
    res = await fetch(`${EBAY_SEARCH_URL}?${plain}`, { headers });
  }
  if (!res.ok) throw new Error(`search ${combo.id}: ${res.status}`);

  const data = await res.json();
  return (data.itemSummaries ?? []) as Array<{
    itemId: string;
    title?: string;
    itemWebUrl?: string;
    condition?: string;
    seller?: { username?: string };
    price?: { value?: string };
    image?: { imageUrl?: string };
    thumbnailImages?: Array<{ imageUrl?: string }>;
  }>;
}

// ---------- Persistencia ----------
async function persist(comboId: number, items: Awaited<ReturnType<typeof searchCombo>>) {
  const now = new Date().toISOString();

  if (items.length > 0) {
    const listings = items.map((i) => ({
      item_id: i.itemId,
      combo_id: comboId,
      title: i.title ?? null,
      url: i.itemWebUrl ?? null,
      condition: i.condition ?? null,
      seller: i.seller?.username ?? null,
      image_url: i.image?.imageUrl ?? i.thumbnailImages?.[0]?.imageUrl ?? null,
      last_seen: now,
      ended_at: null, // si reapareció, lo revivimos
    }));
    const { error: e1 } = await supabase
      .from("listings")
      .upsert(listings, { onConflict: "item_id", ignoreDuplicates: false });
    if (e1) throw e1;

    const snapshots = items
      .filter((i) => i.price?.value)
      .map((i) => ({ item_id: i.itemId, price: Number(i.price!.value) }));
    const { error: e2 } = await supabase
      .from("listing_snapshots")
      .upsert(snapshots, { onConflict: "item_id,snapshot_date" });
    if (e2) throw e2;
  }

  // Lo que este combo tenía y ya no aparece hace N días => vendido/terminado
  const cutoff = new Date(Date.now() - ENDED_AFTER_DAYS * 864e5).toISOString();
  const { error: e3 } = await supabase
    .from("listings")
    .update({ ended_at: now })
    .eq("combo_id", comboId)
    .is("ended_at", null)
    .lt("last_seen", cutoff);
  if (e3) throw e3;

  const { error: e4 } = await supabase
    .from("tracked_combos")
    .update({ last_checked_at: now })
    .eq("id", comboId);
  if (e4) throw e4;
}

// ---------- Handler ----------
Deno.serve(async () => {
  const started = Date.now();
  try {
    const token = await getEbayToken();

    const { data: combos, error } = await supabase
      .from("tracked_combos")
      .select(
        "id, vehicles(make, model, year_start, year_end), part_types(search_keyword, ebay_category_id)",
      )
      .eq("active", true)
      .order("priority", { ascending: true })
      .order("last_checked_at", { ascending: true, nullsFirst: true })
      .limit(BATCH_SIZE);
    if (error) throw error;

    let ok = 0, failed = 0;
    for (const combo of (combos ?? []) as unknown as Combo[]) {
      try {
        const items = await searchCombo(token, combo);
        await persist(combo.id, items);
        ok++;
      } catch (err) {
        console.error(`combo ${combo.id}:`, err);
        failed++;
      }
      // Suave con el rate limit
      await new Promise((r) => setTimeout(r, 250));
    }

    return new Response(
      JSON.stringify({ ok, failed, ms: Date.now() - started }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
