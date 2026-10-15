#!/usr/bin/env bash
# =============================================================================
# setup.sh — Compila el circuito y genera las llaves Groth16 (nivel 3).
#
# Pasos:
#   1. circom compila el circuito a restricciones (.r1cs) y a un generador de
#      testigos (.wasm) que usa el estudiante para crear su prueba.
#   2. "Powers of Tau" (fase 1): parámetros genéricos de la ceremonia.
#   3. Fase 2: llaves específicas de este circuito (.zkey para probar,
#      verification_key.json para verificar).
#
# DEMO: la ceremonia se hace aquí con un solo participante. Quien conozca la
# aleatoriedad usada ("toxic waste") podría falsificar pruebas. En producción
# se usaría la ceremonia pública Perpetual Powers of Tau para la fase 1 y
# varios participantes independientes (U, comercios, estudiantes) en la fase 2:
# basta con que UNO sea honesto y borre su aleatoriedad.
#
# Uso:  npm run zk:setup
# =============================================================================
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$RAIZ/zk/build"
SNARKJS="$RAIZ/node_modules/.bin/snarkjs"
# El circuito tiene ~6,100 restricciones: 2^13 = 8,192 alcanza.
POTENCIA=13

mkdir -p "$BUILD"
cd "$BUILD"

echo "1/3 Compilando el circuito..."
circom "$RAIZ/zk/circuito/canje_privado.circom" --r1cs --wasm -o "$BUILD" -l "$RAIZ/node_modules"

echo "2/3 Powers of Tau (fase 1)..."
"$SNARKJS" powersoftau new bn128 $POTENCIA pot_0000.ptau
"$SNARKJS" powersoftau contribute pot_0000.ptau pot_0001.ptau \
  --name="UniPuntos demo" -e="$(openssl rand -hex 32)"
"$SNARKJS" powersoftau prepare phase2 pot_0001.ptau pot_final.ptau

echo "3/3 Llaves del circuito (fase 2)..."
"$SNARKJS" groth16 setup canje_privado.r1cs pot_final.ptau canje_0000.zkey
"$SNARKJS" zkey contribute canje_0000.zkey canje_final.zkey \
  --name="UniPuntos demo" -e="$(openssl rand -hex 32)"
"$SNARKJS" zkey export verificationkey canje_final.zkey verification_key.json

# Los archivos intermedios ya no hacen falta.
rm -f pot_0000.ptau pot_0001.ptau canje_0000.zkey

echo ""
echo "Listo:"
echo "  Probar:    zk/build/canje_privado_js/canje_privado.wasm + zk/build/canje_final.zkey"
echo "  Verificar: zk/build/verification_key.json"
