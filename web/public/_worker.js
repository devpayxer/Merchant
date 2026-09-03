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
      // Sucuri le da respuestas lentísimas (60s+) o bloqueadas al tráfico
      // que no parece navegador, así que mandamos el juego completo de
      // cabeceras que envía un Chrome real navegando el sitio.
      const res = await fetch(YARD_BASE + page, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          Referer: "https://wegotused.com/our-inventory/",
          "Sec-Ch-Ua": '"Chromium";v="126", "Google Chrome";v="126", "Not?A_Brand";v="24"',
          "Sec-Ch-Ua-Mobile": "?0",
          "Sec-Ch-Ua-Platform": '"Windows"',
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "same-origin",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
        },
      });
      const cuerpo = await res.text();
      // ?debug=1 -> reporta qué contestó el sitio, sin el HTML completo
      if (url.searchParams.get("debug") === "1") {
        return new Response(
          JSON.stringify({
            status: res.status,
            bytes: cuerpo.length,
            setCookie: res.headers.get("set-cookie") ? "sí" : "no",
            location: res.headers.get("location") ?? null,
            snippet: cuerpo.slice(0, 400),
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(cuerpo, {
        status: res.status,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
