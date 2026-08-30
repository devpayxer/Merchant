import { createClient } from "@supabase/supabase-js";
import "./style.css";

// La anon key es pública por diseño; RLS solo permite SELECT.
const SUPABASE_URL = "https://oricrkqewpchixpxcayp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yaWNya3Fld3BjaGl4cHhjYXlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwMTkxNzcsImV4cCI6MjEwMzU5NTE3N30.gKar8iHfr-Fq3_pfphbooWb-IGxfPxVktBnA0IZzrwQ";

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
  tab: "yarda",            // "yarda" | "hoy" | "top"
  vehicles: [],            // [{id, label}]
  selected: [],            // labels elegidos
  query: "",
  lists: {},               // label -> filas de hot_list
  top: null,               // filas del top general
  yardCars: null,          // carros de la yarda que están en el radar
  expanded: {},            // vin -> true (carro expandido en "hoy")
  filterHoy: "",           // filtro en vivo pestaña "En yarda"
  filterTop: "",           // filtro en vivo pestaña "Top"
  user: null,              // sesión del dueño (Supabase Auth)
  inv: null,               // filas de my_inventory
  authMsg: "",
  pulled: new Set(),       // feedback visual de "la saqué" en esta sesión
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

async function loadYardCars() {
  const { data, error } = await db
    .from("yarda_ahora")
    .select("*")
    .order("yard_date", { ascending: false })
    .limit(1000);
  if (error) throw error;
  state.yardCars = data;
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
  try {
    if (tab === "top" && state.top === null) {
      await loadTop();
      render();
    }
    if (tab === "hoy" && state.yardCars === null) {
      await loadYardCars();
      render();
    }
    if (tab === "mio" && state.user && state.inv === null) {
      await loadInv();
      render();
    }
  } catch (e) {
    state.error = "No pude cargar los datos. Revisa tu señal.";
    render();
  }
}

// ---------- Inventario propio ----------
async function login(email, password) {
  state.authMsg = "";
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    state.authMsg = "Correo o contraseña incorrectos.";
    render();
  }
}

async function logout() {
  await db.auth.signOut();
  state.inv = null;
  render();
}

async function pullPart(payload) {
  const costoStr = prompt(`¿Cuánto pagaste por "${payload.pieza}" en la yarda? (deja vacío si no sabes)`);
  if (costoStr === null) return; // canceló
  const costo = costoStr.trim() === "" ? null : Number(costoStr.replace(/[^0-9.]/g, ""));
  const { error } = await db.from("my_inventory").insert({
    vehiculo: payload.vehiculo,
    pieza: payload.pieza,
    vin: payload.vin ?? null,
    fila: payload.fila ?? null,
    costo: Number.isFinite(costo) ? costo : null,
    precio_mercado: payload.precio ?? null,
  });
  if (error) {
    state.error = "No pude guardar. ¿Sigues con sesión iniciada?";
  } else {
    state.pulled.add(payload.key);
    state.inv = null; // recargar la próxima vez
  }
  render();
}

async function advanceEstado(id, estado) {
  const patch = { updated_at: new Date().toISOString() };
  if (estado === "bodega") {
    const p = prompt("¿En cuánto la listaste en eBay? (opcional)");
    if (p === null) return;
    patch.estado = "listada";
    const n = Number(p.replace(/[^0-9.]/g, ""));
    if (p.trim() && Number.isFinite(n)) patch.precio_listado = n;
  } else if (estado === "listada") {
    const p = prompt("¿En cuánto se vendió?");
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
  if (!confirm("¿Borrar esta pieza de tu inventario?")) return;
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
      state.error = "No pude cargar los datos. Revisa tu señal.";
    }
    render();
  }
}

// ---------- Render ----------
function rowHTML(r, showVehiculo = false, car = null) {
  const link = r.ebay_url
    ? ` · <a href="${r.ebay_url}" target="_blank" rel="noopener">ver en eBay ↗</a>`
    : "";
  let pullBtn = "";
  if (state.user) {
    const key = `${r.vehiculo}|${r.pieza}|${car?.vin ?? ""}`;
    if (state.pulled.has(key)) {
      pullBtn = `<div class="pull-done">✓ En tu inventario</div>`;
    } else {
      const payload = encodeURIComponent(JSON.stringify({
        key,
        vehiculo: r.vehiculo,
        pieza: r.pieza,
        precio: r.precio_objetivo ?? null,
        vin: car?.vin ?? null,
        fila: car?.row_number ?? null,
      }));
      pullBtn = `<button class="pull-btn" data-pull="${payload}">＋ La saqué</button>`;
    }
  }
  return `
    <div class="row">
      ${r.foto ? `<img class="thumb" src="${r.foto}" loading="lazy" alt="">` : ""}
      <div class="rowbody">
        <div class="pieza">${r.pieza}${showVehiculo ? ` <span class="meta">· ${r.vehiculo}</span>` : ""}</div>
        <div class="meta">
          <span class="sem ${semClass(r.semaforo)}">${r.semaforo ?? ""}</span>
          · ${r.vendidos_30d ?? 0} vendidos/30d
          · ${r.competencia ?? 0} compitiendo${link}
        </div>
        ${pullBtn}
      </div>
      <div class="precio">${money(r.precio_objetivo)}</div>
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
    render();
    const s = app.querySelector("#" + id);
    s.focus();
    s.setSelectionRange(s.value.length, s.value.length);
  });
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
      else body = rows.map((r) => rowHTML(r)).join("");
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

function daysInYard(iso) {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso + "T12:00:00").getTime()) / 864e5);
  if (d <= 0) return "llegó hoy";
  if (d === 1) return "llegó ayer";
  return `llegó hace ${d} días`;
}

function hoyHTML() {
  if (state.yardCars === null) return `<div class="loading">Cargando inventario de la yarda…</div>`;
  if (state.yardCars.length === 0) return `<div class="empty">Ningún carro de la yarda coincide con el radar todavía</div>`;

  const q = norm(state.filterHoy);
  const cars = q
    ? state.yardCars.filter((c) =>
        norm(`${c.year} ${c.make} ${c.model} ${c.color ?? ""} fila ${c.row_number ?? ""}`).includes(q))
    : state.yardCars;

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
        if (rows === undefined) detail = `<div class="loading">Cargando piezas…</div>`;
        else if (rows.length === 0) detail = `<div class="empty">Sin datos de piezas</div>`;
        else detail = rows.map((r) => rowHTML(r, false, c)).join("");
      }
      return `
        <div class="rows" style="margin-bottom:10px; border-radius:12px;">
          <div class="row" data-car="${c.vin}" data-label="${c.vehiculo}" style="cursor:pointer;">
            <div class="rowbody">
              <div class="pieza">${isNew ? "🆕 " : ""}${titulo}</div>
              <div class="meta">Fila ${c.row_number || "?"} · ${c.color || ""} · ${daysInYard(c.yard_date)}</div>
              ${specs ? `<div class="meta">${specs}</div>` : ""}
              ${open ? `<div class="meta vin">VIN ${c.vin}</div>` : ""}
            </div>
            <div class="chev">${open ? "▲" : "▼"}</div>
          </div>
          ${detail}
        </div>`;
    })
    .join("");

  return `
    ${filterInputHTML("filter-hoy", state.filterHoy, "🔎 Filtra: marca, modelo, año, fila…")}
    <section class="vehicle-block">
      <h2>📍 En la yarda: ${cars.length}${q ? ` de ${state.yardCars.length}` : ""} carros del radar</h2>
      <div style="padding:0;">${cards || `<div class="empty">Nada coincide con "${state.filterHoy}"</div>`}</div>
    </section>
    <div class="hint">Toca un carro para ver qué piezas sacarle.<br>🆕 = llegó esta semana (mejores piezas disponibles).</div>`;
}

function topHTML() {
  if (state.top === null) return `<div class="loading">Cargando…</div>`;
  if (state.top.length === 0) return `<div class="empty">Aún no hay datos</div>`;

  const q = norm(state.filterTop);
  const rows = q
    ? state.top.filter((r) => norm(`${r.pieza} ${r.vehiculo}`).includes(q))
    : state.top;

  const blocks = rows.map((r) => rowHTML(r, true)).join("");
  return `
    ${filterInputHTML("filter-top", state.filterTop, "🔎 Filtra: pieza o vehículo…")}
    <section class="vehicle-block">
      <h2>🔥 Top 50 general</h2>
      <div class="rows">${blocks || `<div class="empty">Nada coincide con "${state.filterTop}"</div>`}</div>
    </section>`;
}

const ESTADOS = {
  bodega:  { label: "🏠 En bodega", next: "📤 Ya la listé" },
  listada: { label: "📤 Listada",   next: "💰 Se vendió" },
  vendida: { label: "💰 Vendida",   next: "📦 Ya la envié" },
  enviada: { label: "✅ Enviada",   next: null },
};

function mioHTML() {
  if (!state.user) {
    return `
      <section class="vehicle-block">
        <h2>📦 Mi inventario</h2>
        <div class="rows" style="padding:16px;">
          <p style="margin-bottom:12px;">Inicia sesión para manejar tus piezas.</p>
          <input id="auth-email" type="email" class="auth-input" value="a.ledesma@payxer.com" autocomplete="username" />
          <input id="auth-pass" type="password" class="auth-input" placeholder="Contraseña" autocomplete="current-password" />
          <button id="auth-btn" class="big-btn">Entrar</button>
          ${state.authMsg ? `<p class="error" style="padding:10px 0;">${state.authMsg}</p>` : ""}
        </div>
      </section>`;
  }
  if (state.inv === null) return `<div class="loading">Cargando tu inventario…</div>`;

  const inv = state.inv;
  const n = (est) => inv.filter((i) => i.estado === est).length;
  const invertido = inv.reduce((s, i) => s + Number(i.costo ?? 0), 0);
  const vendidoTotal = inv
    .filter((i) => i.estado === "vendida" || i.estado === "enviada")
    .reduce((s, i) => s + Number(i.precio_venta ?? 0), 0);
  const ganancia = inv
    .filter((i) => i.estado === "vendida" || i.estado === "enviada")
    .reduce((s, i) => s + Number(i.precio_venta ?? 0) * 0.85 - Number(i.costo ?? 0), 0);

  const items = inv
    .map((i) => {
      const e = ESTADOS[i.estado] ?? ESTADOS.bodega;
      return `
      <div class="row">
        <div class="rowbody">
          <div class="pieza">${i.pieza} <span class="meta">· ${i.vehiculo}</span></div>
          <div class="meta">
            ${e.label}
            ${i.fila ? ` · Fila ${i.fila}` : ""}
            ${i.costo != null ? ` · costo ${money(i.costo)}` : ""}
            ${i.precio_venta != null ? ` · vendida en ${money(i.precio_venta)}` : i.precio_listado != null ? ` · listada en ${money(i.precio_listado)}` : i.precio_mercado != null ? ` · mercado ${money(i.precio_mercado)}` : ""}
          </div>
          ${i.vin ? `<div class="meta vin">VIN ${i.vin}</div>` : ""}
          <div class="inv-actions">
            ${e.next ? `<button class="estado-btn" data-avanza="${i.id}" data-estado="${i.estado}">${e.next}</button>` : ""}
            <button class="del-btn" data-borra="${i.id}">✕</button>
          </div>
        </div>
      </div>`;
    })
    .join("");

  return `
    <div class="summary">
      <div><b>${n("bodega")}</b> en bodega · <b>${n("listada")}</b> listadas · <b>${n("vendida") + n("enviada")}</b> vendidas</div>
      <div>Invertido: <b>${money(invertido)}</b> · Vendido: <b>${money(vendidoTotal)}</b> · Ganancia est.: <b class="${ganancia >= 0 ? "gain" : "loss"}">${money(Math.round(ganancia))}</b></div>
    </div>
    <section class="vehicle-block">
      <h2>📦 Mi inventario (${inv.length})</h2>
      <div class="rows">${items || `<div class="empty">Aún no has sacado piezas.<br>Busca un carro y toca "＋ La saqué".</div>`}</div>
    </section>
    <div class="hint">La ganancia estimada descuenta ~15% de comisión de eBay.<br><button id="auth-out" class="linklike">Cerrar sesión</button></div>`;
}

function render() {
  app.innerHTML = `
    <header>
      <h1>🔧 Radar de Piezas</h1>
      <div id="updated">${hoursAgoText(state.updatedAt)}</div>
    </header>
    ${state.error ? `<div class="error">${state.error}</div>` : ""}
    ${state.tab === "yarda" ? yardaHTML() : state.tab === "hoy" ? hoyHTML() : state.tab === "top" ? topHTML() : mioHTML()}
    <nav>
      <button class="${state.tab === "yarda" ? "active" : ""}" data-tab="yarda">🚗 Buscar</button>
      <button class="${state.tab === "hoy" ? "active" : ""}" data-tab="hoy">📍 Yarda</button>
      <button class="${state.tab === "top" ? "active" : ""}" data-tab="top">🔥 Top</button>
      <button class="${state.tab === "mio" ? "active" : ""}" data-tab="mio">📦 Mío</button>
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
  app.querySelectorAll("[data-car]").forEach((b) =>
    b.addEventListener("click", () => toggleCar(b.dataset.car, b.dataset.label)),
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
  bindFilter("filter-hoy", "filterHoy");
  bindFilter("filter-top", "filterTop");

  app.querySelectorAll("[data-pull]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      pullPart(JSON.parse(decodeURIComponent(b.dataset.pull)));
    }),
  );
  app.querySelectorAll("[data-avanza]").forEach((b) =>
    b.addEventListener("click", () => advanceEstado(Number(b.dataset.avanza), b.dataset.estado)),
  );
  app.querySelectorAll("[data-borra]").forEach((b) =>
    b.addEventListener("click", () => deleteInv(Number(b.dataset.borra))),
  );
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
    await Promise.all([loadVehicles(), loadUpdatedAt()]);
  } catch (e) {
    state.error = "No pude conectar. Revisa tu señal e intenta de nuevo.";
  }
  render();
})();
