// demo.js — Recorrido completo del nivel 3 para la presentación.
//
// Muestra el caso feliz y los ataques que el sistema debe rechazar:
//   1. Ana (pagó puntual) canjea sin revelar quién es.
//   2. Ana intenta canjear otra vez → rechazado por el nullifier.
//   3. Bruno (no pagó puntual) no puede generar una prueba válida.
//   4. Alguien altera una prueba válida → rechazada.
//   5. Una prueba de otro mes no sirve para esta promo.
//
// Uso:  npm run zk:demo
import {
  seed, publicarPromo, generarPrueba, verificarCanje, reiniciarNullifiers, cerrar,
} from './zk.js';

const PROMO = seed.promosPrivadas[0].id;
const MES = '2026-10';
const titulo = (texto) => console.log(`\n── ${texto}`);
const resultado = (r) => console.log(r.ok ? '   ✔ Aceptado' : `   ✘ Rechazado: ${r.motivo}`);

try {
  reiniciarNullifiers(PROMO, MES);

  titulo(`La universidad publica la promo "${PROMO}" de ${MES}`);
  const promo = await publicarPromo(PROMO, MES);
  console.log(`   Pagaron puntual: ${seed.pagosPuntuales[MES].join(', ')} (dato privado de la U)`);
  console.log(`   Publicado: raíz ${promo.raiz.slice(0, 20)}… y ${promo.compromisos.length} compromisos, sin nombres`);

  titulo('1. Ana genera su prueba y la muestra en caja');
  let inicio = Date.now();
  const pruebaAna = await generarPrueba('ana', PROMO, MES);
  console.log(`   Prueba generada en ${Date.now() - inicio} ms`);
  const [raiz, nullifier, promoId] = pruebaAna.publicSignals;
  console.log(`   El comercio ve: raíz ${raiz.slice(0, 12)}…, nullifier ${nullifier.slice(0, 12)}…, promo ${promoId.slice(0, 12)}…`);
  inicio = Date.now();
  resultado(await verificarCanje(pruebaAna));
  console.log(`   Verificada en ${Date.now() - inicio} ms`);

  titulo('2. Ana intenta canjear la misma promo otra vez (prueba nueva)');
  resultado(await verificarCanje(await generarPrueba('ana', PROMO, MES)));

  titulo('3. Bruno no pagó puntual e intenta usar el camino de otra persona');
  try {
    await generarPrueba('bruno', PROMO, MES, { trampa: true });
    console.log('   ✘ ERROR: no debió poder generar la prueba');
  } catch (error) {
    console.log(`   ✘ Rechazado: ${error.message}`);
  }

  titulo('4. Alguien altera la prueba de Carla (cambia el nullifier)');
  const pruebaCarla = await generarPrueba('carla', PROMO, MES);
  const alterada = structuredClone(pruebaCarla);
  alterada.publicSignals[1] = (BigInt(alterada.publicSignals[1]) + 1n).toString();
  resultado(await verificarCanje(alterada));
  console.log('   La prueba original de Carla sigue siendo válida:');
  resultado(await verificarCanje(pruebaCarla));

  titulo('5. Una prueba de septiembre presentada como si fuera de octubre');
  // Mismos elegibles que en octubre: la raíz coincide, pero el promoId no.
  seed.pagosPuntuales['2026-09'] = seed.pagosPuntuales[MES];
  await publicarPromo(PROMO, '2026-09');
  const deSeptiembre = await generarPrueba('ana', PROMO, '2026-09');
  resultado(await verificarCanje({ ...deSeptiembre, mes: MES }));
  console.log('   Y si además se cambia el promoId de la prueba al de octubre:');
  const conPromoCambiado = structuredClone(deSeptiembre);
  conPromoCambiado.mes = MES;
  conPromoCambiado.publicSignals[2] = promo.promoId;
  resultado(await verificarCanje(conPromoCambiado));

  console.log('\nEn ningún paso el comercio supo si el canje fue de Ana o de Carla.');
} catch (error) {
  console.error('Error:', error.message);
  process.exitCode = 1;
} finally {
  await cerrar();
}
