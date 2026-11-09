// =============================================================================
// app.js — Piezas compartidas de la app web (sin dependencias).
//
// - Encabezado y navegación (pestañas abajo en celular, arriba en escritorio).
// - api(): llamadas al backend con manejo de errores.
// - aviso(): mensajes emergentes (toasts).
// - Íconos y formatos.
//
// Cada página indica cuál es con <body data-pagina="inicio|estudiante|caja">.
// =============================================================================
const UP = (() => {
  const LOGO = `
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#1d5c47"/>
      <path d="M10 9v8a6 6 0 0 0 12 0V9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
      <circle cx="16" cy="24.5" r="2.2" fill="#e2b54b"/>
    </svg>`;

  const ICONOS_NAV = {
    inicio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
    estudiante: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/></svg>',
    caja: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8h3v3H7zM14 8h3v3h-3zM7 13h3v3H7zM14 14h3M14 17h3"/></svg>',    universidad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18"/></svg>',
  };

  const PAGINAS = [
    { id: 'inicio', nombre: 'Inicio', url: '/' },
    { id: 'estudiante', nombre: 'Mis puntos', url: '/estudiante.html' },
    { id: 'caja', nombre: 'Caja', url: '/comercio.html' },
    { id: 'universidad', nombre: 'Universidad', url: '/universidad.html' },
  ];

  // Ícono de cada recompensa y conducta del catálogo de prueba.
  const EMOJI = {
    'parqueo-dia': '🅿️',
    'examen-extra': '📝',
    'cafe-2x1': '☕',
    'descuento-q10': '🏷️',
    'u-servicios': '🏛️',
    'cafe-campus': '☕',
  };

  function montarNavegacion() {
    const actual = document.body.dataset.pagina;
    const enlaces = (clase) => PAGINAS.map((p) =>
      `<a href="${p.url}" ${p.id === actual ? 'aria-current="page"' : ''}>${clase ? ICONOS_NAV[p.id] : ''}${p.nombre}</a>`).join('');

    document.body.insertAdjacentHTML('afterbegin', `
      <header class="barra">
        <a class="logo" href="/">${LOGO}UniPuntos</a>
        <span class="red" title="Red de pruebas de Solana">devnet</span>
        <span class="espacio"></span>
        <nav class="nav-escritorio" aria-label="Secciones">${enlaces(false)}</nav>
      </header>`);
    document.body.insertAdjacentHTML('beforeend', `
      <nav class="pestanas" aria-label="Secciones">${enlaces(true)}</nav>
      <div class="avisos" aria-live="polite"></div>`);
  }

  async function api(url, opciones = {}) {
    const r = await fetch(url, {
      ...opciones,
      headers: opciones.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opciones.body ? JSON.stringify(opciones.body) : undefined,
    });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(datos.error || 'Algo salió mal. Intenta de nuevo.');
    return datos;
  }

  function aviso(html, tipo = '', segundos = 4) {
    const caja = document.querySelector('.avisos');
    const el = document.createElement('div');
    el.className = `aviso ${tipo}`;
    el.innerHTML = html;
    caja.append(el);
    setTimeout(() => el.remove(), segundos * 1000);
  }

  const emoji = (id) => EMOJI[id] ?? '🎁';
  const corta = (direccion) => `${direccion.slice(0, 4)}…${direccion.slice(-4)}`;
  const fecha = (iso) => new Date(iso).toLocaleString('es-GT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const numero = (n) => Number(n).toLocaleString('es-GT');

  // Escapa texto antes de meterlo en HTML.
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  montarNavegacion();
  return { api, aviso, emoji, corta, fecha, numero, esc };
})();
