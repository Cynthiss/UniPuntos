pragma circom 2.1.6;

// =============================================================================
// canje_privado.circom — Nivel 3 de UniPuntos (estilo Semaphore).
//
// Caso: promoción 2x1 solo para estudiantes que pagaron puntual este mes,
// sin que el comercio sepa quién es el estudiante.
//
// El estudiante demuestra, sin revelar su secreto ni su posición en el árbol:
//   1. que conoce un `secreto` cuyo compromiso Poseidon(secreto) está en el
//      árbol de Merkle de estudiantes elegibles que publicó la universidad;
//   2. que `nullifierHash = Poseidon(secreto, promoId)`.
//
// Entradas públicas: raiz, nullifierHash, promoId.
// - raiz: la del árbol publicado (el verificador la compara).
// - nullifierHash: es siempre el mismo para el mismo estudiante y la misma
//   promo, así que se guarda para impedir el doble canje. No revela quién es
//   y no se puede relacionar entre promos distintas.
// - promoId: ata la prueba a una promoción concreta.
// =============================================================================

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/mux1.circom";

// Calcula la raíz de Merkle a partir de una hoja y su camino.
template RaizDeMerkle(niveles) {
    signal input hoja;
    signal input hermanos[niveles];   // el nodo vecino en cada nivel
    signal input direcciones[niveles]; // 0 = el nodo actual va a la izquierda, 1 = a la derecha
    signal output raiz;

    component orden[niveles];
    component hash[niveles];
    signal nodo[niveles + 1];
    nodo[0] <== hoja;

    for (var i = 0; i < niveles; i++) {
        // Cada dirección debe ser 0 o 1.
        direcciones[i] * (1 - direcciones[i]) === 0;

        // Ordena (nodo, hermano) o (hermano, nodo) según la dirección.
        orden[i] = MultiMux1(2);
        orden[i].c[0][0] <== nodo[i];
        orden[i].c[0][1] <== hermanos[i];
        orden[i].c[1][0] <== hermanos[i];
        orden[i].c[1][1] <== nodo[i];
        orden[i].s <== direcciones[i];

        hash[i] = Poseidon(2);
        hash[i].inputs[0] <== orden[i].out[0];
        hash[i].inputs[1] <== orden[i].out[1];
        nodo[i + 1] <== hash[i].out;
    }

    raiz <== nodo[niveles];
}

template CanjePrivado(niveles) {
    // Privadas: solo las conoce el estudiante.
    signal input secreto;
    signal input hermanos[niveles];
    signal input direcciones[niveles];

    // Públicas.
    signal input raiz;
    signal input nullifierHash;
    signal input promoId;

    // 1. Compromiso del estudiante = hoja del árbol.
    component compromiso = Poseidon(1);
    compromiso.inputs[0] <== secreto;

    // 2. La hoja pertenece al árbol publicado.
    component arbol = RaizDeMerkle(niveles);
    arbol.hoja <== compromiso.out;
    for (var i = 0; i < niveles; i++) {
        arbol.hermanos[i] <== hermanos[i];
        arbol.direcciones[i] <== direcciones[i];
    }
    arbol.raiz === raiz;

    // 3. Nullifier ligado al secreto y a la promo.
    component nullifier = Poseidon(2);
    nullifier.inputs[0] <== secreto;
    nullifier.inputs[1] <== promoId;
    nullifier.out === nullifierHash;
}

// Profundidad 10: hasta 1,024 estudiantes elegibles por promoción.
component main {public [raiz, nullifierHash, promoId]} = CanjePrivado(10);
