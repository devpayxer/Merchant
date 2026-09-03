// Textos de la interfaz en español e inglés.
// La clave siempre es el texto en español (más fácil de leer en el código).
// Los nombres de piezas NO viven aquí: en inglés se derivan de
// part_types.search_keyword (ver partName en main.js).

export const STRINGS = {
  // Encabezado y navegación
  "🔧 Radar de Piezas": "🔧 Parts Radar",
  "🚗 Buscar": "🚗 Search",
  "📍 Yarda": "📍 Yard",
  "🔥 Top": "🔥 Top",
  "💲 Lista": "💲 Prices",
  "📦 Mío": "📦 Mine",

  // Estado de los datos
  "sin datos todavía": "no data yet",
  "actualizado hace menos de 1 hora": "updated less than 1 hour ago",
  "actualizado hace 1 hora": "updated 1 hour ago",
  "actualizado hace {n} horas": "updated {n} hours ago",
  "actualizado hace {n} días": "updated {n} days ago",

  // Cargando / vacío / errores
  "Cargando…": "Loading…",
  "Cargando piezas…": "Loading parts…",
  "Cargando inventario de la yarda…": "Loading yard inventory…",
  "Cargando la lista de precios…": "Loading price list…",
  "Cargando tu inventario…": "Loading your inventory…",
  "Sin datos para este vehículo": "No data for this vehicle",
  "Sin datos de piezas": "No parts data",
  "Aún no hay datos": "No data yet",
  'Nada coincide con "{q}"': 'Nothing matches "{q}"',
  "Ninguna pieza con ese nombre.": "No part with that name.",
  "No pude cargar los datos. Revisa tu señal.": "Could not load data. Check your signal.",
  "No pude conectar. Revisa tu señal e intenta de nuevo.":
    "Could not connect. Check your signal and try again.",
  "No pude guardar. ¿Sigues con sesión iniciada?": "Could not save. Are you still signed in?",

  // Selector de yarda
  "Todas": "Both",

  // Pestaña Buscar
  "🔎 Busca el carro (ej. Civic)": "🔎 Search the car (e.g. Civic)",
  "Escribe el carro que ves en la yarda.": "Type the car you see in the yard.",
  "Puedes elegir varios a la vez.": "You can pick several at once.",

  // Fila de pieza
  "ver en eBay ↗": "view on eBay ↗",
  "💰 vendidos ↗": "💰 sold ↗",
  "💰 todo lo vendido ↗": "💰 everything sold ↗",
  "{n} vendidos/30d": "{n} sold/30d",
  "{n} compitiendo": "{n} competing",
  "＋ La saqué": "＋ I pulled it",
  "✓ En tu inventario": "✓ In your inventory",
  "SÁCALA": "PULL IT",
  "REGULAR": "SO-SO",
  "NO VALE": "NOT WORTH IT",
  "en {yarda}": "at {yarda}",
  "publica {rango}": "list at {rango}",

  // Semáforo (viene de la base de datos)
  "⚠️ mucha competencia": "⚠️ lots of competition",
  "❌ no se mueve": "❌ not moving",

  // Pestaña Yarda
  "🔎 Filtra: marca, modelo, año, fila…": "🔎 Filter: make, model, year, row…",
  "Ningún carro de la yarda coincide con el radar todavía":
    "No yard car matches the radar yet",
  "📍 En la yarda: {n} carros del radar": "📍 In the yard: {n} radar cars",
  "📍 En la yarda: {n} de {total} carros del radar":
    "📍 In the yard: {n} of {total} radar cars",
  "Fila {n}": "Row {n}",

  // Entradas por semana
  "~{n} carros por semana": "~{n} cars per week",
  "Sin datos de entradas todavía": "No intake data yet",
  "Promedio de las últimas {n} semanas completas.":
    "Average of the last {n} full weeks.",
  "🟠 La semana de arriba va a medias — todavía no termina.":
    "🟠 The top week is only partway through — it hasn't ended yet.",
  "≥ = pueden ser más: de esas semanas solo vemos los carros que siguen en la yarda.":
    "≥ = could be more: for those weeks we only see cars still in the yard.",
  "llegó hoy": "arrived today",
  "llegó ayer": "arrived yesterday",
  "llegó hace {n} días": "arrived {n} days ago",
  "Toca un carro para ver qué piezas sacarle.": "Tap a car to see which parts to pull.",
  "🆕 = llegó esta semana (mejores piezas disponibles).":
    "🆕 = arrived this week (best parts still there).",

  // Pestaña Top
  "🔎 Filtra: pieza o vehículo…": "🔎 Filter: part or vehicle…",
  "🔥 Top 50 general": "🔥 Overall top 50",

  // Pestaña Lista de precios
  "🔎 Busca la pieza (ej. faro)": "🔎 Search the part (e.g. headlight)",
  "💲 Precios de yarda ({n})": "💲 Yard prices ({n})",
  "Pieza": "Part",
  "El número grande es lo que pagas en caja: precio + core + 6% de tax de PA.":
    "The big number is what you pay at the register: price + core + 6% PA tax.",
  "Abajo en chico va el precio de lista.": "The small number is the list price.",
  "Recuerda los $2 de entrada por visita.": "Remember the $2 entry fee per visit.",

  // Inventario propio
  "Inicia sesión para manejar tus piezas.": "Sign in to manage your parts.",
  "Contraseña": "Password",
  "Entrar": "Sign in",
  "Cerrar sesión": "Sign out",
  "Correo o contraseña incorrectos.": "Wrong email or password.",
  "📦 Mi inventario": "📦 My inventory",
  "📦 Mi inventario ({n})": "📦 My inventory ({n})",
  'Aún no has sacado piezas.': "You haven't pulled any parts yet.",
  'Busca un carro y toca "＋ La saqué".': 'Search a car and tap "＋ I pulled it".',
  "🏠 En bodega": "🏠 In storage",
  "📤 Ya la listé": "📤 I listed it",
  "📤 Listada": "📤 Listed",
  "💰 Se vendió": "💰 It sold",
  "💰 Vendida": "💰 Sold",
  "📦 Ya la envié": "📦 I shipped it",
  "✅ Enviada": "✅ Shipped",
  "costo {v}": "cost {v}",
  "vendida en {v}": "sold for {v}",
  "listada en {v}": "listed at {v}",
  "mercado {v}": "market {v}",
  "{n} en bodega": "{n} in storage",
  "{n} listadas": "{n} listed",
  "{n} vendidas": "{n} sold",
  "Invertido:": "Invested:",
  "Vendido:": "Sold:",
  "Ganancia est.:": "Est. profit:",
  "La ganancia descuenta ~15% de comisión de eBay,":
    "Profit already subtracts eBay's ~15% fee,",
  "el envío gratis que ofreces y el empaque.": "the free shipping you offer, and packing.",
  '¿Cuánto pagaste por "{pieza}" en la yarda? (deja vacío si no sabes)':
    'How much did you pay for "{pieza}" at the yard? (leave blank if unsure)',
  "¿En cuánto la listaste en eBay? (opcional)": "What price did you list it at on eBay? (optional)",
  "¿En cuánto se vendió?": "What did it sell for?",
  "¿Borrar esta pieza de tu inventario?": "Delete this part from your inventory?",

  // Borrador de listado (Fase B)
  "📋 Borrador": "📋 Draft",
  "▲ Cerrar": "▲ Close",
  "Título ({n}/80)": "Title ({n}/80)",
  "Descripción": "Description",
  "Copiar": "Copy",
  "Precio: mira los {link} y publícate 10-15% abajo del típico.":
    "Price: check the {link} and list 10-15% below the usual.",
  'Tip: en eBay busca un VENDIDO igual y usa "Sell one like this" — clona categoría y specifics.':
    'Tip: on eBay find an identical SOLD item and use "Sell one like this" — it clones category and specifics.',
  "vendidos": "sold items",
  "Copia manual:": "Copy manually:",
};

// Frases en español dentro de las notas de la lista de precios.
// El resto de la nota es el nombre impreso en inglés, que se deja igual.
const NOTE_PHRASES = [
  ["no listado; como ", "not listed; same as "],
  ["no listado; ", "not listed; "],
  ["ASI IMPRESO", "AS PRINTED"],
  ["verificar en caja, posible errata por", "verify at the register, possibly a typo for"],
  ["lista marca power = 5, así impreso", "list says power = 5, as printed"],
  ["no hay fila de tailgate handle", "no tailgate handle row"],
  ["lista dice", "list says"],
  ["usamos tope", "we use the high end"],
  ["usamos", "we use"],
  ["así impreso", "as printed"],
  ["(par)", "(pair)"],
];

export function translateNote(lang, nota) {
  if (lang !== "en" || !nota) return nota;
  let s = nota;
  for (const [es, en] of NOTE_PHRASES) s = s.replaceAll(es, en);
  return s;
}

export function translate(lang, key, vars) {
  let s = lang === "en" ? (STRINGS[key] ?? key) : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  }
  return s;
}
