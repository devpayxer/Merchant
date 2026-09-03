import { createClient } from "@supabase/supabase-js";
import "./style.css";
import { translate, translateNote } from "./i18n.js";

// La anon key es pública por diseño; RLS solo permite SELECT.
const SUPABASE_URL = "https://oricrkqewpchixpxcayp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yaWNya3Fld3BjaGl4cHhjYXlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwMTkxNzcsImV4cCI6MjEwMzU5NTE3N30.gKar8iHfr-Fq3_pfphbooWb-IGxfPxVktBnA0IZzrwQ";

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// Idioma: recuerda la elección; si es la primera vez, sigue al teléfono
function langInicial() {
  try {
    const guardado = localStorage.getItem("lang");
    if (guardado === "es" || guardado === "en") return guardado;
  } catch { /* modo privado */ }
  return (navigator.language || "es").toLowerCase().startsWith("en") ? "en" : "es";
}

const state = {
  lang: langInicial(),
  tab: "yarda",            // "yarda" | "hoy" | "top"
  vehicles: [],            // [{id, label}]
  selected: [],            // labels elegidos
  query: "",
  lists: {},               // label -> filas de hot_list
  top: null,               // filas del top general
  yardCars: null,          // carros de la yarda que están en el radar
  intake: null,            // carros que entraron por semana (entradas_semanales)
  intakeOpen: false,       // panel de entradas desplegado
  expanded: {},            // vin -> true (carro expandido en "hoy")
  filterHoy: "",           // filtro en vivo pestaña "En yarda"
  yardFilter: "all",       // "all" | "HAZLE TOWNSHIP" | "EZ PULL"
  filterTop: "",           // filtro en vivo pestaña "Top"
  user: null,              // sesión del dueño (Supabase Auth)
  inv: null,               // filas de my_inventory
  shipClasses: {},         // pieza -> clase de envío (S/M/L/XL)
  prices: null,            // lista de precios de las yardas (pestaña "Lista")
  filterPrecios: "",       // filtro en vivo pestaña "Lista"
  authMsg: "",
  pulled: new Set(),       // feedback visual de "la saqué" en esta sesión
  updatedAt: null,
  error: null,
};

const app = document.getElementById("app");
document.documentElement.lang = state.lang;

// ---------- Idioma ----------
function t(key, vars) {
  return translate(state.lang, key, vars);
}

// Nombre de pieza: en español el de la base; en inglés se deriva del
// search_keyword que ya usamos para buscar en eBay ("right headlight
// assembly OEM" -> "Right Headlight Assembly").
function partName(pieza) {
  if (state.lang !== "en") return pieza;
  const kw = state.partKeywords?.[pieza];
  if (!kw) return pieza;
  return kw.replace(/\s*OEM\s*$/i, "").replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function tNota(nota) {
  return translateNote(state.lang, nota);
}

function setLang(lang) {
  state.lang = lang;
  try { localStorage.setItem("lang", lang); } catch { /* modo privado */ }
  document.documentElement.lang = lang;
  render();
}

// ---------- Utilidades ----------
const norm = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function hoursAgoText(iso) {
  if (!iso) return t("sin datos todavía");
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 36e5);
  if (h < 1) return t("actualizado hace menos de 1 hora");
  if (h === 1) return t("actualizado hace 1 hora");
  if (h < 48) return t("actualizado hace {n} horas", { n: h });
  return t("actualizado hace {n} días", { n: Math.floor(h / 24) });
}

function money(v) {
  return v == null ? "—" : `$${Number(v).toLocaleString("en-US")}`;
}

function semClass(sem) {
  if (!sem) return "";
  if (sem.includes("🔥")) return "sem-hot";
  if (sem.includes("⚠️")) return "sem-warn";
  if (sem.includes("❌")) return "sem-dead";
  return "";
}

// Estrategia: listamos con ENVÍO GRATIS (como el 90% de la competencia,
// y los precios medianos de eBay ya lo traen incluido). El costo estimado
// de envío por clase de pieza se descuenta de la ganancia.
const SHIP_COST = { S: 6, M: 13, L: 22, XL: 0 }; // XL = solo recogida local
const PACKING_COST = 2;

function shipCostFor(pieza) {
  const cls = state.shipClasses[pieza];
  return SHIP_COST[cls] ?? SHIP_COST.M;
}

// ---------- Datos ----------
async function loadVehicles() {
  const { data, error } = await db
    .from("vehicles")
    .select("id,label")
    .eq("active", true)
    .order("label");
  if (error) throw error;
  state.vehicles = data;
}

async function loadShipClasses() {
  const { data } = await db.from("part_types").select("name_es,ship_class,search_keyword");
  state.partKeywords = {};
  for (const p of data ?? []) {
    state.shipClasses[p.name_es] = p.ship_class;
    state.partKeywords[p.name_es] = p.search_keyword;
  }
}

async function loadUpdatedAt() {
  const { data } = await db
    .from("tracked_combos")
    .select("last_checked_at")
    .not("last_checked_at", "is", null)
    .order("last_checked_at", { ascending: false })
    .limit(1);
  state.updatedAt = data?.[0]?.last_checked_at ?? null;
}

async function loadHotList(label) {
  const { data, error } = await db
    .from("hot_list")
    .select("*")
    .eq("vehiculo", label)
    .order("ganancia_neta", { ascending: false, nullsFirst: false })
    .order("score", { ascending: false });
  if (error) throw error;
  state.lists[label] = data;
}

async function loadYardCars() {
  // Paginado: entre las dos yardas puede haber más de 1,000 filas
  const all = [];
  for (let i = 0; i < 10; i++) {
    const { data, error } = await db
      .from("yarda_ahora")
      .select("*")
      .order("yard_date", { ascending: false })
      .range(i * 1000, i * 1000 + 999);
    if (error) throw error;
    all.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  state.yardCars = all;
}

// Cuántos carros entran por semana a cada yarda
async function loadIntake() {
  const { data, error } = await db
    .from("entradas_semanales")
    .select("*")
    .order("semana", { ascending: false });
  if (error) throw error;
  state.intake = data ?? [];
}

async function loadPrices() {
  const { data, error } = await db
    .from("yard_prices")
    .select("yard,price,core,nota,part_types(name_es,ship_class)");
  if (error) throw error;
  state.prices = (data ?? [])
    .map((p) => ({
      yard: p.yard,
      pieza: p.part_types?.name_es ?? "?",
      ship: p.part_types?.ship_class ?? null,
      price: Number(p.price),
      core: Number(p.core ?? 0),
      nota: p.nota,
    }))
    .sort((a, b) => a.pieza.localeCompare(b.pieza, "es"));
}

async function loadInv() {
  const { data, error } = await db
    .from("my_inventory")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  state.inv = data;
}

async function loadTop() {
  const { data, error } = await db
    .from("hot_list")
    .select("*")
    .order("ganancia_neta", { ascending: false, nullsFirst: false })
    .order("score", { ascending: false })
    .limit(50);
  if (error) throw error;
  state.top = data;
}

// ---------- Acciones ----------
async function selectVehicle(label) {
  if (!state.selected.includes(label)) {
    state.selected.push(label);
    state.query = "";
    render();
    try {
      await loadHotList(label);
    } catch (e) {
      state.error = t("No pude cargar los datos. Revisa tu señal.");
    }
    render();
  } else {
    state.query = "";
    render();
  }
}

function removeVehicle(label) {
  state.selected = state.selected.filter((l) => l !== label);
  delete state.lists[label];
  render();
}

async function switchTab(tab) {
  state.tab = tab;
  render();
  try {
    if (tab === "top" && state.top === null) {
      await loadTop();
      render();
    }
    if (tab === "hoy" && state.yardCars === null) {
      await loadYardCars();
      render();
    }
    if (tab === "hoy" && state.intake === null) {
      await loadIntake();
      render();
    }
    if (tab === "mio" && state.user && state.inv === null) {
      await loadInv();
      render();
    }
    if (tab === "precios" && state.prices === null) {
      await loadPrices();
      render();
    }
  } catch (e) {
    state.error = t("No pude cargar los datos. Revisa tu señal.");
    render();
  }
}

// ---------- Inventario propio ----------
async function login(email, password) {
  state.authMsg = "";
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    state.authMsg = t("Correo o contraseña incorrectos.");
    render();
  }
}

async function logout() {
  await db.auth.signOut();
  state.inv = null;
  render();
}

async function pullPart(payload) {
  // Con la lista de precios cargada el costo se llena solo; si no, se pregunta
  let costo = payload.costo != null ? Number(payload.costo) : null;
  if (costo == null) {
    const costoStr = prompt(t('¿Cuánto pagaste por "{pieza}" en la yarda? (deja vacío si no sabes)', { pieza: partName(payload.pieza) }));
    if (costoStr === null) return; // canceló
    const n = Number(costoStr.replace(/[^0-9.]/g, ""));
    costo = costoStr.trim() !== "" && Number.isFinite(n) ? n : null;
  }
  const { error } = await db.from("my_inventory").insert({
    vehiculo: payload.vehiculo,
    pieza: payload.pieza,
    vin: payload.vin ?? null,
    fila: payload.fila ?? null,
    costo,
    precio_mercado: payload.precio ?? null,
  });
  if (error) {
    state.error = t("No pude guardar. ¿Sigues con sesión iniciada?");
  } else {
    state.pulled.add(payload.key);
    state.inv = null; // recargar la próxima vez
  }
  render();
}

async function advanceEstado(id, estado) {
  const patch = { updated_at: new Date().toISOString() };
  if (estado === "bodega") {
    const p = prompt(t("¿En cuánto la listaste en eBay? (opcional)"));
    if (p === null) return;
    patch.estado = "listada";
    const n = Number(p.replace(/[^0-9.]/g, ""));
    if (p.trim() && Number.isFinite(n)) patch.precio_listado = n;
  } else if (estado === "listada") {
    const p = prompt(t("¿En cuánto se vendió?"));
    if (p === null) return;
    patch.estado = "vendida";
    const n = Number(p.replace(/[^0-9.]/g, ""));
    if (p.trim() && Number.isFinite(n)) patch.precio_venta = n;
  } else if (estado === "vendida") {
    patch.estado = "enviada";
  } else {
    return;
  }
  const { error } = await db.from("my_inventory").update(patch).eq("id", id);
  if (error) state.error = "No pude actualizar.";
  else await loadInv().catch(() => {});
  render();
}

async function deleteInv(id) {
  if (!confirm(t("¿Borrar esta pieza de tu inventario?"))) return;
  const { error } = await db.from("my_inventory").delete().eq("id", id);
  if (error) state.error = "No pude borrar.";
  else await loadInv().catch(() => {});
  render();
}

async function toggleCar(vin, label) {
  state.expanded[vin] = !state.expanded[vin];
  render();
  if (state.expanded[vin] && state.lists[label] === undefined) {
    try {
      await loadHotList(label);
    } catch (e) {
      state.error = t("No pude cargar los datos. Revisa tu señal.");
    }
    render();
  }
}

// ---------- Render ----------
// Búsqueda de eBay filtrada a VENDIDOS reales (el filtro Sold/Completed
// del app de eBay como deep link — no existe por API, pero sí por URL)
function soldUrl(r) {
  const m = /(\d{4})-(\d{4})\s*$/.exec(r.vehiculo ?? "");
  const mid = m ? Math.round((+m[1] + +m[2]) / 2) : "";
  const base = (r.vehiculo ?? "").replace(/\s*\d{4}-\d{4}\s*$/, "");
  const q = `${mid} ${base} ${r.keyword ?? ""}`.trim();
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_ItemCondition=3000`;
}

// Búsqueda de VENDIDOS en eBay para cualquier texto. Categoría 6028 =
// Car & Truck Parts & Accessories, para que no salgan carros completos.
// Se usa a nivel de vehículo (descubrir piezas fuera del catálogo) y a
// nivel de pieza suelta en la lista de precios.
function soldUrlCarro(texto) {
  return `https://www.ebay.com/sch/6028/i.html?_nkw=${encodeURIComponent(texto)}&LH_Sold=1&LH_ItemCondition=3000`;
}

function soldCarroLink(texto, clase = "sold-carro") {
  return `<a class="${clase}" href="${soldUrlCarro(texto)}" target="_blank" rel="noopener">${t("💰 todo lo vendido ↗")}</a>`;
}

function rowHTML(r, showVehiculo = false, car = null) {
  const soldLink = r.keyword
    ? ` · <a href="${soldUrl(r)}" target="_blank" rel="noopener">${t("💰 vendidos ↗")}</a>`
    : "";
  const link = r.ebay_url
    ? ` · <a href="${r.ebay_url}" target="_blank" rel="noopener">${t("ver en eBay ↗")}</a>`
    : "";
  let pullBtn = "";
  if (state.user) {
    const key = `${r.vehiculo}|${r.pieza}|${car?.vin ?? ""}`;
    if (state.pulled.has(key)) {
      pullBtn = `<div class="pull-done">${t("✓ En tu inventario")}</div>`;
    } else {
      const yCtx = car?.yard ?? state.yardFilter;
      const costoPull = yCtx === "EZ PULL" ? r.costo_ez
        : yCtx === "HAZLE TOWNSHIP" ? r.costo_yarda
        : Math.min(r.costo_yarda ?? Infinity, r.costo_ez ?? Infinity);
      const payload = encodeURIComponent(JSON.stringify({
        key,
        vehiculo: r.vehiculo,
        pieza: r.pieza,
        precio: r.precio_objetivo ?? null,
        costo: Number.isFinite(costoPull) ? costoPull : null,
        vin: car?.vin ?? null,
        fila: car?.row_number ?? null,
      }));
      pullBtn = `<button class="pull-btn" data-pull="${payload}">${t("＋ La saqué")}</button>`;
    }
  }

  // Yarda de contexto: la del carro expandido, la del selector, o comparar
  const yardCtx = car?.yard ?? state.yardFilter;
  const harrys = { costo: r.costo_yarda, gan: r.ganancia_neta, rent: r.rentabilidad, nombre: "Harry's" };
  const ez = { costo: r.costo_ez, gan: r.ganancia_ez, rent: r.rentabilidad_ez, nombre: "EZ" };
  const comparando = yardCtx === "all";
  let sel; // yarda cuyos números se muestran a la derecha
  if (yardCtx === "EZ PULL") sel = ez;
  else if (yardCtx === "HAZLE TOWNSHIP") sel = harrys;
  else {
    // Comparar: gana la yarda con mejor ganancia (o la que tenga datos)
    if (ez.gan != null && (harrys.gan == null || Number(ez.gan) > Number(harrys.gan))) sel = ez;
    else if (harrys.gan != null) sel = harrys;
    else sel = ez.costo != null && (harrys.costo == null || ez.costo < harrys.costo) ? ez : harrys;
  }

  // Línea de precios: en modo comparar muestra ambas yardas
  let precios = "";
  const pEbay = r.precio_objetivo != null ? ` → <span class="ebay">eBay ${money(r.precio_objetivo)}</span>` : "";
  if (comparando && harrys.costo != null && ez.costo != null) {
    precios = `<div class="precios"><span class="yarda">Harry's ${money(Math.round(harrys.costo))}</span> · <span class="yarda">EZ ${money(Math.round(ez.costo))}</span>${pEbay}</div>`;
  } else if (sel.costo != null) {
    precios = `<div class="precios"><span class="yarda">${sel.nombre} ${money(Math.round(sel.costo))}</span>${pEbay}</div>`;
  }

  // Lado derecho: ganancia neta cuando existe; si no, el precio de eBay
  let derecha;
  if (sel.gan != null) {
    const g = Number(sel.gan);
    const tag =
      sel.rent === "alta" ? `<div class="gan-tag alta">${t("SÁCALA")}</div>` :
      sel.rent === "media" ? `<div class="gan-tag media">${t("REGULAR")}</div>` :
      `<div class="gan-tag baja">${t("NO VALE")}</div>`;
    const enYarda = comparando ? `<div class="gan-yard">${t("en {yarda}", { yarda: sel.nombre })}</div>` : "";
    derecha = `<div class="gan"><div class="gan-num ${g < 15 ? "baja" : ""}">${g >= 0 ? "+" : "−"}$${Math.abs(g)}</div>${tag}${enYarda}</div>`;
  } else {
    derecha = `<div class="precio">${money(r.precio_objetivo)}</div>`;
  }

  return `
    <div class="row">
      ${r.foto ? `<img class="thumb" src="${r.foto}" loading="lazy" alt="">` : ""}
      <div class="rowbody">
        <div class="pieza">${partName(r.pieza)}${showVehiculo ? ` <span class="meta">· ${r.vehiculo}</span>` : ""}</div>
        <div class="meta">
          <span class="sem ${semClass(r.semaforo)}">${t(r.semaforo ?? "")}</span>
          · ${t("{n} vendidos/30d", { n: r.vendidos_30d ?? 0 })}
          · ${t("{n} compitiendo", { n: r.competencia ?? 0 })}${soldLink}${link}
        </div>
        ${precios}
        ${pullBtn}
      </div>
      ${derecha}
    </div>`;
}

function yardChipsHTML() {
  const chip = (val, label) =>
    `<button class="yard-chip ${state.yardFilter === val ? "on" : ""}" data-yard="${val}">${label}</button>`;
  return `
    <div class="yard-chips">
      ${chip("all", t("Todas"))}
      ${chip("HAZLE TOWNSHIP", "Harry's")}
      ${chip("EZ PULL", "EZ Pull")}
    </div>`;
}

function filterInputHTML(id, value, placeholder) {
  return `
    <div class="search-box">
      <input id="${id}" type="text" inputmode="search" autocomplete="off"
        placeholder="${placeholder}" value="${value}" />
    </div>`;
}

function bindFilter(id, key) {
  const el = app.querySelector("#" + id);
  if (!el) return;
  el.addEventListener("input", (e) => {
    state[key] = e.target.value;
    renderResultados();
  });
}

function labelParaBusqueda(label) {
  const m = /(\d{4})-(\d{4})\s*$/.exec(label ?? "");
  const base = (label ?? "").replace(/\s*\d{4}-\d{4}\s*$/, "");
  return m ? `${Math.round((+m[1] + +m[2]) / 2)} ${base}` : (label ?? "");
}

function yardaResultadosHTML() {
  const q = norm(state.query);
  const matches =
    q.length >= 1
      ? state.vehicles
          .filter((v) => norm(v.label).includes(q) && !state.selected.includes(v.label))
          .slice(0, 8)
      : [];

  const chips = state.selected
    .map(
      (l) =>
        `<button class="chip" data-remove="${l}">${l} <span class="x">✕</span></button>`,
    )
    .join("");

  const blocks = state.selected
    .map((l) => {
      const rows = state.lists[l];
      let body;
      if (rows === undefined) body = `<div class="loading">${t("Cargando…")}</div>`;
      else if (rows.length === 0) body = `<div class="empty">${t("Sin datos para este vehículo")}</div>`;
      else body = rows.map((r) => rowHTML(r)).join("");
      return `
        <section class="vehicle-block">
          <h2 class="h2-sold">
            <span>${l}</span>
            ${soldCarroLink(labelParaBusqueda(l), "sold-carro on-dark")}
          </h2>
          <div class="rows">${body}</div>
        </section>`;
    })
    .join("");

  return `
    <div class="chips">${chips}</div>
    ${
      state.selected.length
        ? blocks
        : `<div class="hint">${t("Escribe el carro que ves en la yarda.")}<br>${t("Puedes elegir varios a la vez.")}</div>`
    }`;
}

// Sugerencias del autocomplete. Van en su propio contenedor para poder
// actualizarlas SIN volver a crear el <input> (si el input se destruye,
// el teléfono cierra el teclado a la primera letra).
function sugerenciasHTML() {
  const q = norm(state.query);
  if (q.length < 1) return "";
  const matches = state.vehicles
    .filter((v) => norm(v.label).includes(q) && !state.selected.includes(v.label))
    .slice(0, 8);
  if (!matches.length) return "";
  return `<div class="suggestions">${matches
    .map((v) => `<button data-pick="${v.label}">${v.label}</button>`)
    .join("")}</div>`;
}

function yardaHTML() {
  return `
    ${yardChipsHTML()}
    <div class="search-box">
      <input id="search" type="text" inputmode="search" autocomplete="off"
        placeholder="${t("🔎 Busca el carro (ej. Civic)")}" value="${state.query}" />
      <div id="sugerencias">${sugerenciasHTML()}</div>
    </div>
    <div id="resultados">${yardaResultadosHTML()}</div>`;
}

function daysInYard(iso) {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso + "T12:00:00").getTime()) / 864e5);
  if (d <= 0) return t("llegó hoy");
  if (d === 1) return t("llegó ayer");
  return t("llegó hace {n} días", { n: d });
}

// ---------- Entradas por semana ----------
const MESES_ES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

// Fecha local en ISO (no usar toISOString: convierte a UTC y puede correr el día)
function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Lunes de la semana de una fecha (Postgres date_trunc('week') también da lunes)
function lunesDe(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return isoLocal(x);
}

function semanaLabel(iso) {
  const d = new Date(iso + "T12:00:00");
  return state.lang === "en"
    ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : `${d.getDate()} ${MESES_ES[d.getMonth()]}`;
}

function entradasHTML() {
  if (state.intake === null) return "";

  // Respeta el selector de yarda: "Todas" suma las dos
  const filas = state.yardFilter === "all"
    ? state.intake
    : state.intake.filter((r) => r.yard === state.yardFilter);

  const porSemana = new Map();
  for (const r of filas) {
    const acc = porSemana.get(r.semana) ?? { carros: 0, exacto: true };
    acc.carros += r.carros;
    acc.exacto = acc.exacto && r.exacto;
    porSemana.set(r.semana, acc);
  }
  const semanas = [...porSemana.entries()]
    .map(([semana, v]) => ({ semana, ...v }))
    .sort((a, b) => (a.semana < b.semana ? 1 : -1))
    .slice(0, 10);
  if (semanas.length === 0) return "";

  const actual = lunesDe(new Date());
  // El promedio ignora la semana en curso (va a medias) y toma hasta 8
  const completas = semanas.filter((s2) => s2.semana !== actual).slice(0, 8);
  const prom = completas.length
    ? Math.round(completas.reduce((a, s2) => a + s2.carros, 0) / completas.length)
    : null;
  const hayEstimadas = semanas.some((s2) => !s2.exacto);
  const tope = Math.max(...semanas.map((s2) => s2.carros), 1);

  const barras = semanas
    .map((s2) => {
      const enCurso = s2.semana === actual;
      return `
        <div class="wk${enCurso ? " now" : ""}">
          <div class="wk-lab">${semanaLabel(s2.semana)}</div>
          <div class="wk-bar"><span style="width:${Math.max(2, Math.round((s2.carros / tope) * 100))}%"></span></div>
          <div class="wk-num">${s2.exacto ? "" : "≥"}${s2.carros}</div>
        </div>`;
    })
    .join("");

  const resumen = prom === null
    ? t("Sin datos de entradas todavía")
    : t("~{n} carros por semana", { n: prom });

  return `
    <section class="intake">
      <button class="intake-head" data-intake="1">
        <span>📈 ${resumen}</span>
        <span class="chev">${state.intakeOpen ? "▲" : "▼"}</span>
      </button>
      ${state.intakeOpen ? `
        <div class="intake-body">
          ${barras}
          <div class="intake-note">
            ${semanas.some((s2) => s2.semana === actual) ? t("🟠 La semana de arriba va a medias — todavía no termina.") + "<br>" : ""}
            ${prom !== null ? t("Promedio de las últimas {n} semanas completas.", { n: completas.length }) + "<br>" : ""}
            ${hayEstimadas ? t("≥ = pueden ser más: de esas semanas solo vemos los carros que siguen en la yarda.") : ""}
          </div>
        </div>` : ""}
    </section>`;
}

function hoyResultadosHTML() {
  if (state.yardCars === null) return `<div class="loading">${t("Cargando inventario de la yarda…")}</div>`;
  if (state.yardCars.length === 0) return `<div class="empty">${t("Ningún carro de la yarda coincide con el radar todavía")}</div>`;

  const q = norm(state.filterHoy);
  const porYarda = state.yardFilter === "all"
    ? state.yardCars
    : state.yardCars.filter((c) => c.yard === state.yardFilter);
  const cars = q
    ? porYarda.filter((c) =>
        norm(`${c.year} ${c.make} ${c.model} ${c.color ?? ""} fila ${c.row_number ?? ""}`).includes(q))
    : porYarda;

  const cards = cars
    .map((c) => {
      const isNew = c.yard_date && (Date.now() - new Date(c.yard_date).getTime()) < 7 * 864e5;
      const open = state.expanded[c.vin];
      // Modelo real del VIN ("328i") sobre el genérico de la yarda ("3 SERIES")
      const titulo = `${c.year} ${c.make} ${c.model_detail || c.model}${c.trim ? " " + c.trim : ""}`;
      const specs = [
        c.chassis_code,
        c.engine,
        c.engine_code,
        c.engine_hp ? `${c.engine_hp}hp` : null,
        c.drive_type,
      ].filter(Boolean).join(" · ");
      let detail = "";
      if (open) {
        const rows = state.lists[c.vehiculo];
        if (rows === undefined) detail = `<div class="loading">${t("Cargando piezas…")}</div>`;
        else if (rows.length === 0) detail = `<div class="empty">${t("Sin datos de piezas")}</div>`;
        else detail = rows.map((r) => rowHTML(r, false, c)).join("");
      }
      return `
        <div class="rows" style="margin-bottom:10px; border-radius:12px;">
          <div class="row" data-car="${c.vin}" data-label="${c.vehiculo}" style="cursor:pointer;">
            <div class="rowbody">
              <div class="pieza">${isNew ? "🆕 " : ""}${titulo}</div>
              <div class="meta">${state.yardFilter === "all" ? `<b>${c.yard === "EZ PULL" ? "EZ Pull" : "Harry's"}</b> · ` : ""}${t("Fila {n}", { n: c.row_number || "?" })}${c.color ? ` · ${c.color}` : ""} · ${daysInYard(c.yard_date)}</div>
              ${specs ? `<div class="meta">${specs}</div>` : ""}
              ${open && !c.vin.startsWith("EZ-") ? `<div class="meta vin">VIN ${c.vin}</div>` : ""}
              <div class="meta">${soldCarroLink(`${c.year} ${c.make} ${c.model_detail || c.model}`)}</div>
            </div>
            <div class="chev">${open ? "▲" : "▼"}</div>
          </div>
          ${detail}
        </div>`;
    })
    .join("");

  return `
    <section class="vehicle-block">
      <h2>${q
        ? t("📍 En la yarda: {n} de {total} carros del radar", { n: cars.length, total: porYarda.length })
        : t("📍 En la yarda: {n} carros del radar", { n: cars.length })}</h2>
      <div style="padding:0;">${cards || `<div class="empty">${t('Nada coincide con "{q}"', { q: state.filterHoy })}</div>`}</div>
    </section>
    <div class="hint">${t("Toca un carro para ver qué piezas sacarle.")}<br>${t("🆕 = llegó esta semana (mejores piezas disponibles).")}</div>`;
}

function hoyHTML() {
  return `
    ${yardChipsHTML()}
    ${entradasHTML()}
    ${filterInputHTML("filter-hoy", state.filterHoy, t("🔎 Filtra: marca, modelo, año, fila…"))}
    <div id="resultados">${hoyResultadosHTML()}</div>`;
}

function topResultadosHTML() {
  if (state.top === null) return `<div class="loading">${t("Cargando…")}</div>`;
  if (state.top.length === 0) return `<div class="empty">${t("Aún no hay datos")}</div>`;

  const q = norm(state.filterTop);
  const rows = q
    ? state.top.filter((r) => norm(`${r.pieza} ${partName(r.pieza)} ${r.vehiculo}`).includes(q))
    : state.top;

  const blocks = rows.map((r) => rowHTML(r, true)).join("");
  return `
    <section class="vehicle-block">
      <h2>${t("🔥 Top 50 general")}</h2>
      <div class="rows">${blocks || `<div class="empty">${t('Nada coincide con "{q}"', { q: state.filterTop })}</div>`}</div>
    </section>`;
}

function topHTML() {
  return `
    ${yardChipsHTML()}
    ${filterInputHTML("filter-top", state.filterTop, t("🔎 Filtra: pieza o vehículo…"))}
    <div id="resultados">${topResultadosHTML()}</div>`;
}

const ESTADOS = {
  bodega:  { label: "🏠 En bodega", next: "📤 Ya la listé" },
  listada: { label: "📤 Listada",   next: "💰 Se vendió" },
  vendida: { label: "💰 Vendida",   next: "📦 Ya la envié" },
  enviada: { label: "✅ Enviada",   next: null },
};

function preciosResultadosHTML() {
  if (state.prices === null) {
    return `<div class="loading">${t("Cargando la lista de precios…")}</div>`;
  }

  // Una fila por pieza, con el precio de cada yarda al lado
  const porPieza = new Map();
  for (const p of state.prices) {
    if (!porPieza.has(p.pieza)) porPieza.set(p.pieza, { pieza: p.pieza, ship: p.ship });
    const fila = porPieza.get(p.pieza);
    fila[p.yard === "EZ PULL" ? "ez" : "harrys"] = p;
  }

  const q = norm(state.filterPrecios);
  let filas = [...porPieza.values()].sort((a, b) =>
    partName(a.pieza).localeCompare(partName(b.pieza), state.lang));
  if (q) {
    filas = filas.filter(
      (f) =>
        norm(f.pieza).includes(q) ||
        norm(partName(f.pieza)).includes(q) ||
        norm(f.harrys?.nota ?? "").includes(q) ||
        norm(f.ez?.nota ?? "").includes(q),
    );
  }

  const conTax = (p) => (p ? (p.price + p.core) * 1.06 : null);
  const verHarrys = state.yardFilter !== "EZ PULL";
  const verEz = state.yardFilter !== "HAZLE TOWNSHIP";

  const celda = (p, mostrar) => {
    if (!mostrar) return "";
    if (!p) return `<div class="pcol"><div class="pnum vacio">—</div></div>`;
    return `
      <div class="pcol">
        <div class="pnum">${money(Math.round(conTax(p)))}</div>
        <div class="pbase">${money(p.price)}${p.core > 0 ? ` +${money(p.core)}` : ""}</div>
      </div>`;
  };

  const items = filas
    .map((f) => {
      // La nota es el nombre exacto de la fila en la lista impresa; en modo
      // comparar se marca de qué yarda viene (a veces difieren, ej. alternador)
      const notas = [];
      if (verHarrys && f.harrys?.nota) notas.push({ y: "Harry's", t: tNota(f.harrys.nota) });
      if (verEz && f.ez?.nota && f.ez.nota !== f.harrys?.nota) notas.push({ y: "EZ", t: tNota(f.ez.nota) });
      const comparando2 = verHarrys && verEz;
      const nota = notas
        .map((n) => (comparando2 && notas.length > 1 ? `<b>${n.y}:</b> ${n.t}` : n.t))
        .join("<br>");
      return `
      <div class="prow">
        <div class="pinfo">
          <div class="pieza">${partName(f.pieza)}${f.ship ? ` <span class="ship-tag">${f.ship}</span>` : ""}</div>
          ${state.partKeywords?.[f.pieza]
            ? `<a class="psold" href="${soldUrlCarro(state.partKeywords[f.pieza])}" target="_blank" rel="noopener">${t("💰 vendidos ↗")}</a>`
            : ""}
          ${nota ? `<div class="pnota">${nota}</div>` : ""}
        </div>
        ${celda(f.harrys, verHarrys)}
        ${celda(f.ez, verEz)}
      </div>`;
    })
    .join("");

  const encabezado = `
    <div class="phead">
      <div class="pinfo">${t("Pieza")}</div>
      ${verHarrys ? `<div class="pcol">Harry's</div>` : ""}
      ${verEz ? `<div class="pcol">EZ Pull</div>` : ""}
    </div>`;

  return `
    <section class="vehicle-block">
      <h2>${t("💲 Precios de yarda ({n})", { n: filas.length })}</h2>
      <div class="rows">
        ${encabezado}
        ${items || `<div class="empty">${t("Ninguna pieza con ese nombre.")}</div>`}
      </div>
    </section>
    <div class="hint">${t("El número grande es lo que pagas en caja: precio + core + 6% de tax de PA.")}<br>${t("Abajo en chico va el precio de lista.")}<br>${t("Recuerda los $2 de entrada por visita.")}</div>`;
}

function preciosHTML() {
  return `
    ${yardChipsHTML()}
    ${filterInputHTML("filter-precios", state.filterPrecios, t("🔎 Busca la pieza (ej. faro)"))}
    <div id="resultados">${preciosResultadosHTML()}</div>`;
}

// ---------- Fase B: borrador de listado copiable ----------
// Fórmula de título de vendedores top: carro con specs del VIN + sinónimos
// de la pieza + OEM + últimos 6 del VIN como rastreo interno. Máx 80 chars.
async function toggleDraft(id) {
  state.draftFor = state.draftFor === id ? null : id;
  const item = (state.inv ?? []).find((x) => x.id === id);
  state.vinSpecs = state.vinSpecs ?? {};
  if (state.draftFor && item?.vin && !item.vin.startsWith("EZ-") && state.vinSpecs[item.vin] === undefined) {
    const { data } = await db
      .from("yard_inventory")
      .select("year,make,model,model_detail,trim,engine_code,chassis_code")
      .eq("vin", item.vin)
      .limit(1);
    state.vinSpecs[item.vin] = data?.[0] ?? false;
  }
  render();
}

function titleCase(s) {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function buildDraft(i) {
  const realVin = i.vin && !i.vin.startsWith("EZ-") ? i.vin : null;
  const specs = realVin ? (state.vinSpecs ?? {})[realVin] : null;
  const kw = state.partKeywords?.[i.pieza] ?? i.pieza;
  const kwTitle = titleCase(kw.replace(/\s*OEM\s*$/i, ""));
  const vin6 = realVin ? realVin.slice(-6) : "";
  let carTitle, carDesc;
  if (specs) {
    const modelo = specs.model_detail || specs.model;
    carTitle = [specs.year, specs.make, modelo, specs.chassis_code, specs.engine_code]
      .filter(Boolean).join(" ");
    carDesc = `${specs.year} ${specs.make} ${modelo}${specs.trim ? ` ${specs.trim}` : ""}`;
  } else {
    const m = /(\d{4})-(\d{4})\s*$/.exec(i.vehiculo ?? "");
    const base = (i.vehiculo ?? "").replace(/\s*\d{4}-\d{4}\s*$/, "");
    carTitle = m ? `${m[1]} ${m[2]} ${base}` : (i.vehiculo ?? "");
    carDesc = i.vehiculo ?? "";
  }
  let title = `${carTitle} ${kwTitle} OEM${vin6 ? ` ${vin6}` : ""}`;
  if (title.length > 80) title = `${carTitle} ${kwTitle} OEM`;
  if (title.length > 80) title = title.slice(0, 80).trim();
  const desc = `${kwTitle} (OEM) removed from a ${carDesc}${realVin ? ` — VIN ${realVin}` : ""}.

Good used working condition — please see photos, what you see is what you get.

- Genuine OEM part, direct fit
- FREE shipping
- Ships within 2 business days
- Returns accepted

Check compatibility before buying. Message us with your VIN and we'll confirm fitment.`;
  return { title, desc };
}

function draftHTML(i) {
  const draft = buildDraft(i);
  const kw = state.partKeywords?.[i.pieza];
  const sold = kw ? soldUrl({ vehiculo: i.vehiculo, keyword: kw }) : null;
  return `
    <div class="draft">
      <div class="draft-label">${t("Título ({n}/80)", { n: draft.title.length })}
        <button class="copy-mini" data-copia="${encodeURIComponent(draft.title)}">${t("Copiar")}</button></div>
      <div class="draft-text">${draft.title}</div>
      <div class="draft-label">${t("Descripción")}
        <button class="copy-mini" data-copia="${encodeURIComponent(draft.desc)}">${t("Copiar")}</button></div>
      <div class="draft-text">${draft.desc.replace(/\n/g, "<br>")}</div>
      <div class="draft-hint">${t("Precio: mira los {link} y publícate 10-15% abajo del típico.", {
        link: sold ? `<a href="${sold}" target="_blank" rel="noopener">${t("💰 vendidos ↗")}</a>` : t("vendidos"),
      })} ${t('Tip: en eBay busca un VENDIDO igual y usa "Sell one like this" — clona categoría y specifics.')}</div>
    </div>`;
}

function mioHTML() {
  if (!state.user) {
    return `
      <section class="vehicle-block">
        <h2>${t("📦 Mi inventario")}</h2>
        <div class="rows" style="padding:16px;">
          <p style="margin-bottom:12px;">${t("Inicia sesión para manejar tus piezas.")}</p>
          <input id="auth-email" type="email" class="auth-input" value="a.ledesma@payxer.com" autocomplete="username" />
          <input id="auth-pass" type="password" class="auth-input" placeholder="${t("Contraseña")}" autocomplete="current-password" />
          <button id="auth-btn" class="big-btn">${t("Entrar")}</button>
          ${state.authMsg ? `<p class="error" style="padding:10px 0;">${state.authMsg}</p>` : ""}
        </div>
      </section>`;
  }
  if (state.inv === null) return `<div class="loading">${t("Cargando tu inventario…")}</div>`;

  const inv = state.inv;
  const n = (est) => inv.filter((i) => i.estado === est).length;
  const invertido = inv.reduce((s, i) => s + Number(i.costo ?? 0), 0);
  const vendidoTotal = inv
    .filter((i) => i.estado === "vendida" || i.estado === "enviada")
    .reduce((s, i) => s + Number(i.precio_venta ?? 0), 0);
  const ganancia = inv
    .filter((i) => i.estado === "vendida" || i.estado === "enviada")
    .reduce(
      (s, i) =>
        s +
        Number(i.precio_venta ?? 0) * 0.85 -
        shipCostFor(i.pieza) -
        PACKING_COST -
        Number(i.costo ?? 0),
      0,
    );

  const items = inv
    .map((i) => {
      const e = ESTADOS[i.estado] ?? ESTADOS.bodega;
      return `
      <div class="row">
        <div class="rowbody">
          <div class="pieza">${partName(i.pieza)} <span class="meta">· ${i.vehiculo}</span></div>
          <div class="meta">
            ${t(e.label)}
            ${i.fila ? ` · ${t("Fila {n}", { n: i.fila })}` : ""}
            ${i.costo != null ? ` · ${t("costo {v}", { v: money(i.costo) })}` : ""}
            ${i.precio_venta != null ? ` · ${t("vendida en {v}", { v: money(i.precio_venta) })}` : i.precio_listado != null ? ` · ${t("listada en {v}", { v: money(i.precio_listado) })}` : i.precio_mercado != null ? ` · ${t("mercado {v}", { v: money(i.precio_mercado) })}` : ""}
          </div>
          ${i.vin ? `<div class="meta vin">VIN ${i.vin}</div>` : ""}
          <div class="inv-actions">
            ${e.next ? `<button class="estado-btn" data-avanza="${i.id}" data-estado="${i.estado}">${t(e.next)}</button>` : ""}
            <button class="draft-btn" data-draft="${i.id}">${state.draftFor === i.id ? t("▲ Cerrar") : t("📋 Borrador")}</button>
            <button class="del-btn" data-borra="${i.id}">✕</button>
          </div>
          ${state.draftFor === i.id ? draftHTML(i) : ""}
        </div>
      </div>`;
    })
    .join("");

  return `
    <div class="summary">
      <div>${t("{n} en bodega", { n: `<b>${n("bodega")}</b>` })} · ${t("{n} listadas", { n: `<b>${n("listada")}</b>` })} · ${t("{n} vendidas", { n: `<b>${n("vendida") + n("enviada")}</b>` })}</div>
      <div>${t("Invertido:")} <b>${money(invertido)}</b> · ${t("Vendido:")} <b>${money(vendidoTotal)}</b> · ${t("Ganancia est.:")} <b class="${ganancia >= 0 ? "gain" : "loss"}">${money(Math.round(ganancia))}</b></div>
    </div>
    <section class="vehicle-block">
      <h2>${t("📦 Mi inventario ({n})", { n: inv.length })}</h2>
      <div class="rows">${items || `<div class="empty">${t("Aún no has sacado piezas.")}<br>${t('Busca un carro y toca "＋ La saqué".')}</div>`}</div>
    </section>
    <div class="hint">${t("La ganancia descuenta ~15% de comisión de eBay,")}<br>${t("el envío gratis que ofreces y el empaque.")}<br><button id="auth-out" class="linklike">${t("Cerrar sesión")}</button></div>`;
}

// Handlers de todo lo que vive DENTRO del contenedor de resultados. Se
// vuelven a enganchar tanto en el render completo como en el parcial.
function bindAcciones(root) {
  root.querySelectorAll("[data-pick]").forEach((b) =>
    b.addEventListener("click", () => selectVehicle(b.dataset.pick)),
  );
  root.querySelectorAll("[data-remove]").forEach((b) =>
    b.addEventListener("click", () => removeVehicle(b.dataset.remove)),
  );
  root.querySelectorAll("[data-car]").forEach((b) =>
    b.addEventListener("click", () => toggleCar(b.dataset.car, b.dataset.label)),
  );
  // Un link dentro de la tarjeta no debe abrir/cerrar el carro
  root.querySelectorAll("[data-car] a").forEach((a) =>
    a.addEventListener("click", (e) => e.stopPropagation()),
  );
  root.querySelectorAll("[data-pull]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      pullPart(JSON.parse(decodeURIComponent(b.dataset.pull)));
    }),
  );
  root.querySelectorAll("[data-avanza]").forEach((b) =>
    b.addEventListener("click", () => advanceEstado(Number(b.dataset.avanza), b.dataset.estado)),
  );
  root.querySelectorAll("[data-borra]").forEach((b) =>
    b.addEventListener("click", () => deleteInv(Number(b.dataset.borra))),
  );
  root.querySelectorAll("[data-draft]").forEach((b) =>
    b.addEventListener("click", () => toggleDraft(Number(b.dataset.draft))),
  );
  root.querySelectorAll("[data-copia]").forEach((b) =>
    b.addEventListener("click", async () => {
      const texto = decodeURIComponent(b.dataset.copia);
      try {
        await navigator.clipboard.writeText(texto);
        const orig = b.textContent;
        b.textContent = "\u2713";
        setTimeout(() => { b.textContent = orig; }, 1500);
      } catch {
        alert(t("Copia manual:") + "\n\n" + texto);
      }
    }),
  );
}

// Redibuja SOLO la lista de resultados (y las sugerencias del buscador).
// Al escribir NO se toca el <input>, así el teclado del teléfono no se
// cierra: si el input se destruye y se vuelve a crear, iOS y Android
// bajan el teclado aunque le devuelvas el foco por código.
function renderResultados() {
  const sug = app.querySelector("#sugerencias");
  if (sug && state.tab === "yarda") {
    sug.innerHTML = sugerenciasHTML();
    bindAcciones(sug);
  }
  const cont = app.querySelector("#resultados");
  if (!cont) return;
  cont.innerHTML =
    state.tab === "yarda"
      ? yardaResultadosHTML()
      : state.tab === "hoy"
        ? hoyResultadosHTML()
        : state.tab === "top"
          ? topResultadosHTML()
          : state.tab === "precios"
            ? preciosResultadosHTML()
            : "";
  bindAcciones(cont);
}

function render() {
  app.innerHTML = `
    <header>
      <div class="head-top">
        <h1>${t("🔧 Radar de Piezas")}</h1>
        <div class="lang">
          <button class="${state.lang === "es" ? "on" : ""}" data-lang="es">ES</button>
          <button class="${state.lang === "en" ? "on" : ""}" data-lang="en">EN</button>
        </div>
      </div>
      <div id="updated">${hoursAgoText(state.updatedAt)}</div>
    </header>
    ${state.error ? `<div class="error">${state.error}</div>` : ""}
    ${
      state.tab === "yarda"
        ? yardaHTML()
        : state.tab === "hoy"
          ? hoyHTML()
          : state.tab === "top"
            ? topHTML()
            : state.tab === "precios"
              ? preciosHTML()
              : mioHTML()
    }
    <nav>
      <button class="${state.tab === "yarda" ? "active" : ""}" data-tab="yarda">${t("🚗 Buscar")}</button>
      <button class="${state.tab === "hoy" ? "active" : ""}" data-tab="hoy">${t("📍 Yarda")}</button>
      <button class="${state.tab === "top" ? "active" : ""}" data-tab="top">${t("🔥 Top")}</button>
      <button class="${state.tab === "precios" ? "active" : ""}" data-tab="precios">${t("💲 Lista")}</button>
      <button class="${state.tab === "mio" ? "active" : ""}" data-tab="mio">${t("📦 Mío")}</button>
    </nav>`;

  app.querySelectorAll("[data-tab]").forEach((b) =>
    b.addEventListener("click", () => switchTab(b.dataset.tab)),
  );
  app.querySelectorAll("[data-lang]").forEach((b) =>
    b.addEventListener("click", () => setLang(b.dataset.lang)),
  );
  bindAcciones(app);
  app.querySelectorAll("[data-yard]").forEach((b) =>
    b.addEventListener("click", () => {
      state.yardFilter = b.dataset.yard;
      render();
    }),
  );
  app.querySelectorAll("[data-intake]").forEach((b) =>
    b.addEventListener("click", () => {
      state.intakeOpen = !state.intakeOpen;
      render();
    }),
  );

  const search = app.querySelector("#search");
  if (search) {
    search.addEventListener("input", (e) => {
      state.query = e.target.value;
      renderResultados();
    });
  }
  bindFilter("filter-hoy", "filterHoy");
  bindFilter("filter-top", "filterTop");
  bindFilter("filter-precios", "filterPrecios");

  const authBtn = app.querySelector("#auth-btn");
  if (authBtn) {
    authBtn.addEventListener("click", () =>
      login(app.querySelector("#auth-email").value.trim(), app.querySelector("#auth-pass").value),
    );
  }
  const authOut = app.querySelector("#auth-out");
  if (authOut) authOut.addEventListener("click", logout);
}

// ---------- Arranque ----------
db.auth.onAuthStateChange((_event, session) => {
  state.user = session?.user ?? null;
  if (!state.user) state.inv = null;
  render();
  if (state.user && state.tab === "mio" && state.inv === null) {
    loadInv().then(render).catch(() => {});
  }
});

(async () => {
  render();
  const { data } = await db.auth.getSession().catch(() => ({ data: {} }));
  state.user = data?.session?.user ?? null;
  try {
    await Promise.all([loadVehicles(), loadUpdatedAt(), loadShipClasses()]);
  } catch (e) {
    state.error = t("No pude conectar. Revisa tu señal e intenta de nuevo.");
  }
  render();
})();
