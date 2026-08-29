import { createClient } from "@supabase/supabase-js";
import "./style.css";

// La anon key es pública por diseño; RLS solo permite SELECT.
const SUPABASE_URL = "https://oricrkqewpchixpxcayp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yaWNya3Fld3BjaGl4cHhjYXlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwMTkxNzcsImV4cCI6MjEwMzU5NTE3N30.gKar8iHfr-Fq3_pfphbooWb-IGxfPxVktBnA0IZzrwQ";

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
  tab: "yarda",            // "yarda" | "top"
  vehicles: [],            // [{id, label}]
  selected: [],            // labels elegidos
  query: "",
  lists: {},               // label -> filas de hot_list
  top: null,               // filas del top general
  updatedAt: null,
  error: null,
};

const app = document.getElementById("app");

// ---------- Utilidades ----------
const norm = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function hoursAgoText(iso) {
  if (!iso) return "sin datos todavía";
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 36e5);
  if (h < 1) return "actualizado hace menos de 1 hora";
  if (h === 1) return "actualizado hace 1 hora";
  if (h < 48) return `actualizado hace ${h} horas`;
  return `actualizado hace ${Math.floor(h / 24)} días`;
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
    .order("score", { ascending: false });
  if (error) throw error;
  state.lists[label] = data;
}

async function loadTop() {
  const { data, error } = await db
    .from("hot_list")
    .select("*")
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
      state.error = "No pude cargar los datos. Revisa tu señal.";
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
  if (tab === "top" && state.top === null) {
    try {
      await loadTop();
    } catch (e) {
      state.error = "No pude cargar los datos. Revisa tu señal.";
    }
    render();
  }
}

// ---------- Render ----------
function rowHTML(r) {
  return `
    <div class="row">
      <div class="pieza">${r.pieza}</div>
      <div class="precio">${money(r.precio_objetivo)}</div>
      <div class="meta">
        <span class="sem ${semClass(r.semaforo)}">${r.semaforo ?? ""}</span>
        · ${r.vendidos_30d ?? 0} vendidos/30d
        · ${r.competencia ?? 0} compitiendo
      </div>
    </div>`;
}

function yardaHTML() {
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
      if (rows === undefined) body = `<div class="loading">Cargando…</div>`;
      else if (rows.length === 0) body = `<div class="empty">Sin datos para este vehículo</div>`;
      else body = rows.map(rowHTML).join("");
      return `
        <section class="vehicle-block">
          <h2>${l}</h2>
          <div class="rows">${body}</div>
        </section>`;
    })
    .join("");

  return `
    <div class="search-box">
      <input id="search" type="text" inputmode="search" autocomplete="off"
        placeholder="🔎 Busca el carro (ej. Civic)" value="${state.query}" />
      ${
        matches.length
          ? `<div class="suggestions">${matches
              .map((v) => `<button data-pick="${v.label}">${v.label}</button>`)
              .join("")}</div>`
          : ""
      }
    </div>
    <div class="chips">${chips}</div>
    ${
      state.selected.length
        ? blocks
        : `<div class="hint">Escribe el carro que ves en la yarda.<br>Puedes elegir varios a la vez.</div>`
    }`;
}

function topHTML() {
  if (state.top === null) return `<div class="loading">Cargando…</div>`;
  if (state.top.length === 0) return `<div class="empty">Aún no hay datos</div>`;
  const blocks = state.top
    .map(
      (r) => `
      <div class="row">
        <div class="pieza">${r.pieza} <span class="meta">· ${r.vehiculo}</span></div>
        <div class="precio">${money(r.precio_objetivo)}</div>
        <div class="meta">
          <span class="sem ${semClass(r.semaforo)}">${r.semaforo ?? ""}</span>
          · ${r.vendidos_30d ?? 0} vendidos/30d
          · ${r.competencia ?? 0} compitiendo
        </div>
      </div>`,
    )
    .join("");
  return `
    <section class="vehicle-block">
      <h2>🔥 Top 50 general</h2>
      <div class="rows">${blocks}</div>
    </section>`;
}

function render() {
  app.innerHTML = `
    <header>
      <h1>🔧 Radar de Piezas</h1>
      <div id="updated">${hoursAgoText(state.updatedAt)}</div>
    </header>
    ${state.error ? `<div class="error">${state.error}</div>` : ""}
    ${state.tab === "yarda" ? yardaHTML() : topHTML()}
    <nav>
      <button class="${state.tab === "yarda" ? "active" : ""}" data-tab="yarda">🚗 Modo Yarda</button>
      <button class="${state.tab === "top" ? "active" : ""}" data-tab="top">🔥 Top general</button>
    </nav>`;

  app.querySelectorAll("[data-tab]").forEach((b) =>
    b.addEventListener("click", () => switchTab(b.dataset.tab)),
  );
  app.querySelectorAll("[data-pick]").forEach((b) =>
    b.addEventListener("click", () => selectVehicle(b.dataset.pick)),
  );
  app.querySelectorAll("[data-remove]").forEach((b) =>
    b.addEventListener("click", () => removeVehicle(b.dataset.remove)),
  );

  const search = app.querySelector("#search");
  if (search) {
    search.addEventListener("input", (e) => {
      state.query = e.target.value;
      render();
      const s = app.querySelector("#search");
      s.focus();
      s.setSelectionRange(s.value.length, s.value.length);
    });
  }
}

// ---------- Arranque ----------
(async () => {
  render();
  try {
    await Promise.all([loadVehicles(), loadUpdatedAt()]);
  } catch (e) {
    state.error = "No pude conectar. Revisa tu señal e intenta de nuevo.";
  }
  render();
})();
