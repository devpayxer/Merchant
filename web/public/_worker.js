// Pages Function (modo avanzado): sirve la app estática y expone
// /api/yard — un relevo de lectura del inventario de Harry's U-Pull It.
// El firewall del sitio (Sucuri) bloquea las IPs de Supabase pero acepta
// tráfico desde Cloudflare, así que la Edge Function yard-sync lee las
// páginas a través de esta ruta. Solo reenvía una página pública;
// no guarda nada y no usa credenciales.
const YARD_BASE =
  "https://wegotused.com/our-inventory/?inv%5Byard%5D=HAZLE%20TOWNSHIP&inv%5Bpage%5D=";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/yard") {
      const page = url.searchParams.get("page") ?? "0";
      if (!/^\d{1,4}$/.test(page)) {
        return new Response("bad page", { status: 400 });
      }
      const res = await fetch(YARD_BASE + page, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      return new Response(await res.text(), {
        status: res.status,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
