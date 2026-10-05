/**
 * Oponente controlado pelo computador — lógica pura, sem DOM.
 *
 * A IA joga o turno inteiro respeitando as fases:
 *   1. compra:      compra 1 carta do deck
 *   2. principal:   invoca a carta de maior nível que couber
 *                   (máx 1 monstro/turno) e deixa tudo em ataque
 *   3. combate:     cada criatura ataca — prefere destruir a
 *                   criatura inimiga mais fraca que vence;
 *                   sem alvo assim, ataca o jogador direto,
 *                   mas só se o campo inimigo estiver vazio
 *                   (regra: não se bate na vida com criaturas
 *                   em campo)
 *   4. finalizacao: avança
 *   5. fim:         termina o turno
 *
 * Determinística: usa apenas o estado, sem aleatoriedade própria.
 */

import { CARTAS_POR_ID } from '../data/cartas.ts';
import {
  atacar,
  comprarCarta,
  invocar,
  motivoNaoPodeAtacar,
  motivoNaoPodeInvocar,
  proximaFase,
  terminarTurno,
} from './duelo.ts';
import { cartaIdDe, type EstadoDuelo, type Instancia } from './types.ts';

/** Joga o turno inteiro do `jogador` da vez. Devolve o estado final. */
export function iaJogarTurno(estado: EstadoDuelo): EstadoDuelo {
  let s = estado;
  const jogador = s.vez;

  // 1. Fase de compra: compra 1 carta.
  if (s.fase === 'compra' && s.vencedor === null) {
    s = comprarCarta(s, jogador).estado;
  }

  // 2. Fase principal: invoca a maior carta que couber (1 monstro).
  if (s.fase === 'principal' && s.vencedor === null) {
    const mao = [...s.mao[jogador]!].sort((a, b) => {
      const na = CARTAS_POR_ID[cartaIdDe(a)]!.nivel;
      const nb = CARTAS_POR_ID[cartaIdDe(b)]!.nivel;
      return nb - na;
    });
    for (const uid of mao) {
      if (motivoNaoPodeInvocar(s, jogador, uid) === null) {
        s = invocar(s, jogador, uid).estado;
        break; // só 1 monstro por turno
      }
    }
    s = proximaFase(s).estado; // vai para o combate
  }

  // 3. Fase de combate: cada criatura em ataque ataca 1 vez.
  if (s.fase === 'combate' && s.vencedor === null) {
    for (let i = 0; i < s.campo[jogador]!.length && s.vencedor === null; i++) {
      const zona = s.campo[jogador]![i];
      if (zona == null || zona.atacou || zona.modo !== 'ataque') continue;

      // Alvo: a criatura inimiga de menor def que esta vence.
      const alvos = s.campo[adversario(jogador)]!
        .map((z, indice) => ({ z, indice }))
        .filter((e): e is { z: Instancia; indice: number } => e.z != null);
      const atacante = CARTAS_POR_ID[zona.cartaId]!;
      const venciveis = alvos
        .map((e) => ({ e, alvo: CARTAS_POR_ID[e.z.cartaId]! }))
        .filter((x) => atacante.atk > x.alvo.def)
        .sort((a, b) => a.alvo.def - b.alvo.def);

      if (venciveis.length > 0) {
        const escolha = venciveis[0]!;
        if (
          motivoNaoPodeAtacar(s, jogador, zona.uid, {
            tipo: 'carta',
            uid: escolha.e.z.uid,
          }) === null
        ) {
          s = atacar(s, jogador, zona.uid, {
            tipo: 'carta',
            uid: escolha.e.z.uid,
          }).estado;
        }
      } else if (motivoNaoPodeAtacar(s, jogador, zona.uid, { tipo: 'jogador' }) === null) {
        s = atacar(s, jogador, zona.uid, { tipo: 'jogador' }).estado;
      }
    }
    s = proximaFase(s).estado; // vai para a finalização
  }

  // 4. Fase de finalização: avança para o fim.
  if (s.fase === 'finalizacao' && s.vencedor === null) {
    s = proximaFase(s).estado;
  }

  // 5. Fase fim: termina o turno.
  if (s.fase === 'fim' && s.vencedor === null) {
    s = terminarTurno(s).estado;
  }

  return s;
}

function adversario(jogador: 0 | 1): 0 | 1 {
  return jogador === 0 ? 1 : 0;
}
