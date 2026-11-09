// =============================================================================
// server.js — Backend web de la demo (niveles 1 y 2, según UNIPUNTOS_NIVEL).
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
//      Los puntos solo bajan cuando la transacción queda registrada.
//
// Sin cobros dobles: la firma de la transacción se guarda en el código ANTES
// de enviarla. Si la red no confirma, el código queda "procesando" y se le
// pregunta a la cadena por esa firma; nunca vuelve a pendiente a ciegas.
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
  RAIZ, NIVEL, seed, canjearPuntos, consultarSaldo, consultarEmision,
  historialDe, canjesDeComercio, llaveEstudiante, enlaceExplorador,
  resultadoDeTransaccion, registrarEnHistorial, otorgarPuntos,
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
// Canjes a medias: se resuelven preguntando a la cadena
// ---------------------------------------------------------------------------
// Códigos cuya transacción se está enviando en este momento.
const enCurso = new Set();

function marcarUsado(c, firma) {
  Object.assign(c, { estado: 'usado', firma, usado: new Date().toISOString() });
  guardarCodigos();
}

function volverAPendiente(c) {
  c.estado = 'pendiente';
  delete c.firma;
  delete c.alturaMaxima;
  guardarCodigos();
}

/**
 * Un código "procesando" que no está en curso quedó a medias (la red no
 * respondió o el servidor se reinició). Se busca su firma en la cadena:
 *   registrada → usado · falló o venció → pendiente · sin respuesta → sigue bloqueado.
 */
async function reconciliar(codigo) {
  const c = codigos[codigo];
  if (c?.estado !== 'procesando' || enCurso.has(codigo)) return;
  if (!c.firma) return volverAPendiente(c); // nunca se llegó a firmar: no se envió nada

  enCurso.add(codigo);
  try {
    const resultado = await resultadoDeTransaccion(c.firma, c.alturaMaxima, { unaVez: true });
    if (resultado === 'confirmada') {
      const recompensa = buscarRecompensa(c.recompensa);
      marcarUsado(c, c.firma);
      registrarEnHistorial({
        tipo: 'redeem', estudiante: c.estudiante, cantidad: recompensa.puntos, firma: c.firma,
        fecha: c.usado, recompensa: recompensa.id, comercio: recompensa.comercio,
      });
      console.log(`Canje ${codigo}: la transacción sí se registró (${c.firma}).`);
    } else if (resultado === 'fallida' || resultado === 'expirada') {
      volverAPendiente(c);
      console.log(`Canje ${codigo}: la transacción no se registró; el código vuelve a estar disponible.`);
    }
    // 'en-espera' o 'incierta': se queda bloqueado y se revisa de nuevo más tarde.
  } finally {
    enCurso.delete(codigo);
  }
}

// Revisa periódicamente los canjes a medias (también los que quedaron al reiniciar).
const reconciliarTodo = () => Object.keys(codigos).forEach((codigo) => reconciliar(codigo).catch(() => {}));
setInterval(reconciliarTodo, 15_000).unref();
reconciliarTodo();

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
    conductas: seed.conductas,
    quetzalesPorPunto: seed.quetzalesPorPunto,
    // La vista de la universidad pide una clave solo si el servidor tiene una configurada.
    pideClave: Boolean(process.env.UNIPUNTOS_CLAVE_UNIVERSIDAD),
  });
});

// Emisión total (auditable): se lee directamente de la cadena.
app.get('/api/emision', async (_req, res, next) => {
  try {
    const emision = await consultarEmision();
    res.json({ ...emision, nivel: NIVEL, explorador: enlaceExplorador(emision.mint, 'address') });
  } catch (e) { next(e); }
});

// Vista del estudiante: saldo en la cadena + historial.
app.get('/api/estudiantes/:id', async (req, res, next) => {
  try {
    const wallet = llaveEstudiante(req.params.id).publicKey.toBase58();
    const saldo = await consultarSaldo(req.params.id);
    res.json({ saldo, wallet, explorador: enlaceExplorador(wallet, 'address'), historial: historialDe(req.params.id) });
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
app.get('/api/codigos/:codigo', async (req, res) => {
  const codigo = req.params.codigo.toUpperCase();
  const c = codigos[codigo];
  if (!c) return res.status(404).json({ error: 'Código no existe.' });
  await reconciliar(codigo).catch(() => {});
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
  await reconciliar(codigo).catch(() => {});
  if (estaVencido(c)) return res.status(410).json({ error: 'El código venció. Pide al estudiante uno nuevo.' });
  if (c.estado === 'procesando') {
    return res.status(409).json({ error: 'Este canje se está verificando en la cadena. No lo confirmes otra vez.' });
  }
  if (c.estado !== 'pendiente') return res.status(409).json({ error: 'Este código ya fue usado.' });

  // Se bloquea ANTES de ir a la cadena para que dos confirmaciones simultáneas
  // no puedan quemar dos veces con el mismo código.
  c.estado = 'procesando';
  guardarCodigos();
  enCurso.add(codigo);
  try {
    const { firma } = await canjearPuntos(
      c.estudiante,
      recompensa.puntos,
      { recompensa: recompensa.id, comercio: recompensa.comercio, codigo },
      // Se guarda la firma antes de enviar: si algo falla, se sabe qué buscar.
      { alFirmar: (firmaTx, alturaMaxima) => { Object.assign(c, { firma: firmaTx, alturaMaxima }); guardarCodigos(); } },
    );
    marcarUsado(c, firma);
    res.json({ ok: true, recompensa, explorador: enlaceExplorador(firma) });
  } catch (e) {
    enCurso.delete(codigo);
    // Seguro que no se registró (o ni se llegó a enviar): el código vuelve a estar disponible.
    if (!c.firma || e.definitiva) {
      volverAPendiente(c);
      return next(e);
    }
    // Pudo haberse registrado: se pregunta a la cadena en vez de suponer.
    await reconciliar(codigo).catch(() => {});
    if (c.estado === 'usado') return res.json({ ok: true, recompensa, explorador: enlaceExplorador(c.firma) });
    if (c.estado === 'procesando') {
      return res.status(202).json({
        verificando: true,
        mensaje: 'La red está lenta: el canje se está verificando en la cadena. No lo confirmes otra vez.',
        explorador: enlaceExplorador(c.firma),
      });
    }
    next(e);
  } finally {
    enCurso.delete(codigo);
  }
});

// Canjes de un comercio (base para la liquidación mensual en quetzales).
// En el nivel 2 se leen de las cuentas `Redemption` en la cadena.
app.get('/api/comercios/:id/canjes', async (req, res, next) => {
  try {
    res.json({ canjes: await canjesDeComercio(req.params.id) });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Vista de la universidad
// ---------------------------------------------------------------------------

// Saldos de todos los estudiantes y liquidación del mes con cada comercio.
// Solo se reembolsan los canjes que financia la universidad; las promociones
// que financia el comercio no generan reembolso.
app.get('/api/universidad/resumen', async (_req, res, next) => {
  try {
    const estudiantes = await Promise.all(seed.estudiantes.map(async ({ id, nombre }) => ({
      id, nombre, saldo: await consultarSaldo(id),
    })));
    const financia = (idRecompensa) => seed.catalogo.find((r) => r.id === idRecompensa)?.financia;
    const mes = new Date().toISOString().slice(0, 7); // la liquidación es mensual: solo el mes en curso
    const comercios = await Promise.all(seed.comercios.map(async ({ id, nombre }) => {
      const canjes = (await canjesDeComercio(id)).filter((c) => c.fecha.startsWith(mes));
      const puntos = canjes.reduce((s, c) => s + c.cantidad, 0);
      const puntosU = canjes.filter((c) => financia(c.recompensa) === 'universidad').reduce((s, c) => s + c.cantidad, 0);
      return { id, nombre, canjes: canjes.length, puntos, puntosU, reembolso: puntosU * seed.quetzalesPorPunto };
    }));
    res.json({ estudiantes, comercios });
  } catch (e) { next(e); }
});

// La universidad otorga puntos por una conducta del catálogo. Si el servidor
// tiene UNIPUNTOS_CLAVE_UNIVERSIDAD (p. ej. en Render), se exige esa clave.
app.post('/api/universidad/premios', async (req, res, next) => {
  const clave = process.env.UNIPUNTOS_CLAVE_UNIVERSIDAD;
  if (clave && req.get('x-clave-universidad') !== clave) {
    return res.status(401).json({ error: 'Clave de la universidad incorrecta.' });
  }
  const { estudiante, conducta: idConducta } = req.body ?? {};
  const conducta = seed.conductas.find((c) => c.id === idConducta);
  if (!conducta) return res.status(400).json({ error: 'Conducta no válida.' });
  try {
    const { firma } = await otorgarPuntos(estudiante, conducta.puntos, { conducta: conducta.id });
    res.json({ ok: true, puntos: conducta.puntos, explorador: enlaceExplorador(firma) });
  } catch (e) { next(e); }
});

// Errores: se responde con un mensaje legible.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(PUERTO, () => {
  console.log(`UniPuntos (nivel ${NIVEL}) corriendo en http://localhost:${PUERTO}`);
  console.log(`  Estudiante: http://localhost:${PUERTO}/estudiante.html`);
  console.log(`  Comercio:   http://localhost:${PUERTO}/comercio.html`);
});
