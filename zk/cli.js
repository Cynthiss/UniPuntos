// cli.js — Comandos del nivel 3 (canje privado con conocimiento cero).
//
// Uso:
//   npm run zk -- publicar <mes>                 La U publica el árbol de elegibles
//   npm run zk -- probar <estudiante> <mes>      El estudiante genera su prueba
//   npm run zk -- verificar <archivo-prueba>     El comercio verifica y registra el nullifier
//
// Ejemplo:
//   npm run zk -- publicar 2026-10
//   npm run zk -- probar ana 2026-10
//   npm run zk -- verificar data/zk-prueba-ana.local.json
//
// La promo por defecto es la primera de `promosPrivadas` en data/seed.json.
import fs from 'node:fs';
import { seed, publicarPromo, generarPrueba, verificarCanje, cerrar } from './zk.js';

const [comando, ...args] = process.argv.slice(2);
const promo = seed.promosPrivadas[0].id;

try {
  if (comando === 'publicar' && args[0]) {
    const p = await publicarPromo(promo, args[0]);
    console.log(`Promo publicada: ${p.promo} (${p.mes})`);
    console.log(`Raíz del árbol: ${p.raiz}`);
    console.log(`Compromisos elegibles: ${p.compromisos.length} (sin nombres)`);
  } else if (comando === 'probar' && args[1]) {
    const [estudiante, mes] = args;
    const inicio = Date.now();
    const prueba = await generarPrueba(estudiante, promo, mes);
    const archivo = `data/zk-prueba-${estudiante}.local.json`;
    fs.writeFileSync(archivo, JSON.stringify(prueba));
    console.log(`Prueba generada en ${Date.now() - inicio} ms: ${archivo}`);
    console.log(`Tamaño: ${JSON.stringify(prueba).length} caracteres (cabe en un QR).`);
    console.log('Lo único que verá el comercio: raíz, nullifier y promo.');
  } else if (comando === 'verificar' && args[0]) {
    const resultado = await verificarCanje(JSON.parse(fs.readFileSync(args[0], 'utf8')));
    console.log(resultado.ok ? `Canje válido. Nullifier registrado: ${resultado.nullifierHash}` : `Rechazado: ${resultado.motivo}`);
    process.exitCode = resultado.ok ? 0 : 2;
  } else {
    console.log('Uso: npm run zk -- publicar <mes> | probar <estudiante> <mes> | verificar <archivo-prueba>');
    process.exitCode = 1;
  }
} catch (error) {
  console.error('Error:', error.message);
  process.exitCode = 1;
} finally {
  await cerrar();
}
