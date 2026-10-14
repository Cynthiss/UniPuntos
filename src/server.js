// =============================================================================
// server.js — Backend web de la demo (nivel 1).
//
// Páginas:
//   /estudiante.html  saldo, historial, catálogo y QR de un solo uso
//   /comercio.html    el comercio ingresa/escanea el código y confirma el canje
//
// Flujo del canje:
//   1. El estudiante elige una recompensa → el backend crea un código de un
//      solo uso (válido 10 minutos) y lo devuelve como QR. Aún no se quema nada.
//   2. El comercio ingresa el código → ve QUÉ se canjea, pero NO quién es el
//      estudiante (los comercios no ven datos académicos ni financieros).
//   3. El comercio confirma → el backend verifica que el código no se haya usado,
//      lo bloquea y quema los puntos en la cadena con la firma del estudiante.
//
// DEMO: no hay inicio de sesión real. En producción el estudiante entraría con
// su cuenta universitaria y firmaría el canje desde su wallet (WDK).
// =============================================================================
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import {
  RAIZ, seed, canjearPuntos, consultarSaldo, consultarEmision,
  historialDe, canjesRegistrados, llaveEstudiante, enlaceExplorador,
} from './puntos.js';

const PUERTO = Number(process.env.PORT) || 3000;
const MINUTOS_VALIDEZ = 10;
const ARCHIVO_CODIGOS = path.join(RAIZ, 'data', 'codigos.local.json');

// ---------------------------------------------------------------------------
// Códigos de un solo uso (se guardan en disco para sobrevivir reinicios)
// ---------------------------------------------------------------------------
const codigos = fs.existsSync(ARCHIVO_CODIGOS) ? JSON.parse(fs.readFileSync(ARCHIVO_CODIGOS, 'utf8')) : {};
const guardarCodigos = () => fs.writeFileSync(ARCHIVO_CODIGOS, JSON.stringify(codigos, null, 2));

// 8 caracteres sin letras ambiguas (sin 0/O, 1/I) para dictarlo fácil en caja.
function nuevoCodigo() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let codigo;
  do {
    codigo = Array.from(crypto.randomBytes(8), (b) => alfabeto[b % alfabeto.length]).join('');
  } while (codigos[codigo]);
  return codigo;
}

function estaVencido(c) {
  return c.estado === 'pendiente' && Date.now() > new Date(c.expira).getTime();
}

const buscarRecompensa = (id) => seed.catalogo.find((r) => r.id === id);

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(express.static(path.join(RAIZ, 'public')));

// Datos públicos para armar las páginas.
app.get('/api/datos', (_req, res) => {
  res.json({
    estudiantes: seed.estudiantes.map(({ id, nombre }) => ({ id, nombre })),
    comercios: seed.comercios,
    catalogo: seed.catalogo,
  });
});

// Emisión total (auditable): se lee directamente de la cadena.
app.get('/api/emision', async (_req, res, next) => {
  try {
    const emision = await consultarEmision();
    res.json({ ...emision, explorador: enlaceExplorador(emision.mint, 'address') });
  } catch (e) { next(e); }
});

// Vista del estudiante: saldo en la cadena + historial.
app.get('/api/estudiantes/:id', async (req, res, next) => {
  try {
    const wallet = llaveEstudiante(req.params.id).publicKey.toBase58();
    const saldo = await consultarSaldo(req.params.id);
    const historial = historialDe(req.params.id).map((h) => ({ ...h, explorador: enlaceExplorador(h.firma) }));
    res.json({ saldo, wallet, explorador: enlaceExplorador(wallet, 'address'), historial });
  } catch (e) { next(e); }
});

// Paso 1: el estudiante pide un código de un solo uso para una recompensa.
app.post('/api/codigos', async (req, res, next) => {
  try {
    const { estudiante, recompensa: idRecompensa } = req.body ?? {};
    const recompensa = buscarRecompensa(idRecompensa);
    if (!recompensa) return res.status(400).json({ error: 'Recompensa no válida.' });

    const saldo = await consultarSaldo(estudiante);
    if (saldo < recompensa.puntos) {
      return res.status(400).json({ error: `Saldo insuficiente: tienes ${saldo} y necesitas ${recompensa.puntos}.` });
    }

    const codigo = nuevoCodigo();
    const expira = new Date(Date.now() + MINUTOS_VALIDEZ * 60_000).toISOString();
    codigos[codigo] = { estudiante, recompensa: recompensa.id, estado: 'pendiente', creado: new Date().toISOString(), expira };
    guardarCodigos();

    const qr = await QRCode.toDataURL(codigo, { margin: 1, width: 280 });
    res.json({ codigo, qr, expira, recompensa });
  } catch (e) { next(e); }
});

// Paso 2: el comercio consulta el código. No se revela la identidad del estudiante.
app.get('/api/codigos/:codigo', (req, res) => {
  const c = codigos[req.params.codigo.toUpperCase()];
  if (!c) return res.status(404).json({ error: 'Código no existe.' });
  const recompensa = buscarRecompensa(c.recompensa);
  res.json({
    recompensa,
    estado: estaVencido(c) ? 'vencido' : c.estado,
    expira: c.expira,
  });
});

// Paso 3: el comercio confirma y se queman los puntos.
app.post('/api/codigos/:codigo/confirmar', async (req, res, next) => {
  const codigo = req.params.codigo.toUpperCase();
  const c = codigos[codigo];
  if (!c) return res.status(404).json({ error: 'Código no existe.' });

  const recompensa = buscarRecompensa(c.recompensa);
  if (req.body?.comercio !== recompensa.comercio) {
    return res.status(403).json({ error: 'Este código es para otro comercio.' });
  }
  if (estaVencido(c)) return res.status(410).json({ error: 'El código venció. Pide al estudiante uno nuevo.' });
  if (c.estado !== 'pendiente') return res.status(409).json({ error: 'Este código ya fue usado.' });

  // Se bloquea ANTES de ir a la cadena para que dos confirmaciones simultáneas
  // no puedan quemar dos veces con el mismo código.
  c.estado = 'procesando';
  guardarCodigos();
  try {
    const { firma } = await canjearPuntos(c.estudiante, recompensa.puntos, {
      recompensa: recompensa.id, comercio: recompensa.comercio, codigo,
    });
    Object.assign(c, { estado: 'usado', firma, usado: new Date().toISOString() });
    guardarCodigos();
    res.json({ ok: true, recompensa, explorador: enlaceExplorador(firma) });
  } catch (e) {
    // Si la transacción falló, el código vuelve a quedar disponible.
    c.estado = 'pendiente';
    guardarCodigos();
    next(e);
  }
});

// Canjes de un comercio (base para la liquidación mensual en quetzales).
app.get('/api/comercios/:id/canjes', (req, res) => {
  const canjes = canjesRegistrados()
    .filter((h) => h.comercio === req.params.id)
    .map(({ recompensa, cantidad, fecha, firma }) => ({ recompensa, cantidad, fecha, explorador: enlaceExplorador(firma) }));
  res.json({ canjes });
});

// Errores: se responde con un mensaje legible.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(PUERTO, () => {
  console.log(`UniPuntos corriendo en http://localhost:${PUERTO}`);
  console.log(`  Estudiante: http://localhost:${PUERTO}/estudiante.html`);
  console.log(`  Comercio:   http://localhost:${PUERTO}/comercio.html`);
});
