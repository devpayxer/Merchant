// "Actualizar Harry's" — marcador para el teléfono/computadora del dueño.
// Se ejecuta ESTANDO en wegotused.com (la página del inventario), donde el
// navegador ya pasó el escudo de Sucuri con la conexión de casa. Baja las
// primeras páginas del inventario desde ahí mismo (misma origen, sin
// bloqueos) y se las manda a yard-sync en modo "ingest". Se detiene sola
// cuando una página ya no trae carros nuevos (igual que la cabeza del
// lector automático). Un toque = inventario al día.
//
// La versión que va en el marcador es este mismo código minificado y con
// __KEY__ sustituida por la clave real (la arma la pestaña Mío tras login).
(async () => {
  const FN = "https://oricrkqewpchixpxcayp.supabase.co/functions/v1/yard-sync";
  const KEY = "__KEY__";
  const BASE = "https://wegotused.com/our-inventory/?inv%5Byard%5D=HAZLE%20TOWNSHIP&inv%5Bpage%5D=";
  const MAX = 10;
  if (!location.hostname.endsWith("wegotused.com")) {
    alert("Abre primero la página del inventario de Harry's (wegotused.com) y ahí toca el marcador.");
    return;
  }
  const aviso = document.createElement("div");
  aviso.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#111827;color:#fff;font:700 18px system-ui;padding:14px;text-align:center";
  aviso.textContent = "🔄 Leyendo Harry's…";
  document.body.appendChild(aviso);
  let totalNuevos = 0, totalRows = 0, paginas = 0;
  try {
    for (let p = 0; p < MAX; p++) {
      aviso.textContent = `🔄 Leyendo página ${p + 1}…`;
      const html = await (await fetch(BASE + p, { credentials: "include" })).text();
      const r = await (await fetch(FN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "ingest", key: KEY, pages: [{ page: p, html }] }),
      })).json();
      paginas++;
      if (!r.ok) { aviso.textContent = "❌ Esa página no se pudo leer (" + (r.error || "ilegible") + ")"; return; }
      totalRows += r.rows; totalNuevos += r.nuevos;
      if (r.nuevos === 0) break;
    }
    aviso.style.background = "#15803d";
    aviso.textContent = `✅ Harry's al día: ${totalNuevos} carros nuevos (${totalRows} revisados en ${paginas} página${paginas === 1 ? "" : "s"})`;
  } catch (e) {
    aviso.style.background = "#b91c1c";
    aviso.textContent = "❌ No se pudo: " + e.message;
  }
  setTimeout(() => aviso.remove(), 6000);
})();
