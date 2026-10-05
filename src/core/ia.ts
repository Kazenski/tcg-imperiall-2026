/**
 * Oponente controlado pelo computador — lógica pura, sem DOM.
 *
 * Estratégia da v1 (intencionalmente simples, para o jogador
 * humano aprender as regras enquanto vence):
 *   1. Invoca a carta de maior nível da mão que couber
 *      (respeitando pontos de level e level do dono).
 *   2. Cada criatura ataca: prefere destruir a criatura inimiga
 *      mais fraca que ela vence (atk > def); sem alvo assim,
 *      ataca o jogador direto.
 *
 * Determinística: usa apenas o estado, sem aleatoriedade própria
 * (o RNG do duelo cuida das evasões).
 */

import { CARTAS_POR_ID } from '../data/cartas.ts';
import {
  atacar,
  invocar,
  motivoNaoPodeAtacar,
  motivoNaoPodeInvocar,
} from './duelo.ts';
import { cartaIdDe, type EstadoDuelo, type Instancia } from './types.ts';

/** Joga o turno inteiro do `jogador` da vez. Devolve o estado final. */
export function iaJogarTurno(estado: EstadoDuelo): EstadoDuelo {
  let s = estado;
  const jogador = s.vez;

  // 1. Invocar tudo o que couber (maior nível primeiro).
  let avancou = true;
  while (avancou && s.vencedor === null) {
    avancou = false;
    const mao = [...s.mao[jogador]!].sort((a, b) => {
      const na = CARTAS_POR_ID[cartaIdDe(a)]!.nivel;
      const nb = CARTAS_POR_ID[cartaIdDe(b)]!.nivel;
      return nb - na;
    });
    for (const uid of mao) {
      if (motivoNaoPodeInvocar(s, jogador, uid) === null) {
        s = invocar(s, jogador, uid).estado;
        avancou = true;
        break;
      }
    }
  }

  // 2. Atacar com cada criatura que ainda não atacou.
  for (let i = 0; i < s.campo[jogador]!.length && s.vencedor === null; i++) {
    const zona = s.campo[jogador]![i];
    if (zona == null || zona.atacou) continue;

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
      if (motivoNaoPodeAtacar(s, jogador, zona.uid, { tipo: 'carta', uid: escolha.e.z.uid }) === null) {
        s = atacar(s, jogador, zona.uid, { tipo: 'carta', uid: escolha.e.z.uid }).estado;
      }
    } else if (motivoNaoPodeAtacar(s, jogador, zona.uid, { tipo: 'jogador' }) === null) {
      s = atacar(s, jogador, zona.uid, { tipo: 'jogador' }).estado;
    }
  }

  return s;
}

function adversario(jogador: 0 | 1): 0 | 1 {
  return jogador === 0 ? 1 : 0;
}
