/**
 * Oponente controlado pelo computador — lógica pura, sem DOM.
 *
 * A IA joga o turno inteiro respeitando as fases:
 *   1. compra:      compra 1 carta do deck
 *   2. principal:   empilha a carta mais forte que couber numa
 *                   pilha (1 monstro/turno); a carta de cima
 *                   passa a ser a ativa
 *   3. combate:     cada carta ATIVA (topo de uma pilha) ataca —
 *                   prefere destruir a criatura inimiga mais
 *                   fraca que vence; sem alvo assim, ataca o
 *                   jogador direto, mas só se o campo inimigo
 *                   estiver vazio (regra do direto)
 *   4. finalizacao: avança
 *   5. fim:         termina o turno
 *
 * Empilhar é sempre bom: a carta de cima é a ativa, mas as de
 * baixo continuam guardadas. A IA procura a pilha cujo topo
 * aceita exatamente o nível da carta — assim sobe uma carta por
 * turno sem nunca quebrar a ordem de níveis.
 *
 * `iaPassos` é um gerador: devolve o estado a cada jogada para a
 * UI animar com tempo entre os passos. `iaJogarTurno` só roda o
 * gerador até o fim (usado nos testes).
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
  pilhasQueAceitam,
  proximaFase,
  terminarTurno,
} from './duelo.ts';
import { cartaAtiva, cartaIdDe, type EstadoDuelo, type Instancia, type Jogador } from './types.ts';

function adversario(jogador: Jogador): Jogador {
  return jogador === 0 ? 1 : 0;
}

/** Etapas possíveis do gerador (a UI usa isso para escolher o delay). */
export type EtapaIA = 'compra' | 'invocou' | 'atacou' | 'passou';

/**
 * Joga o turno inteiro do jogador da vez, parando em cada jogada.
 * `yield` devolve `{ etapa, estado }`; o `return` devolve o estado
 * final do turno.
 */
export function* iaPassos(estado: EstadoDuelo): Generator<{ etapa: EtapaIA; estado: EstadoDuelo }, EstadoDuelo> {
  let s = estado;
  const jogador = s.vez;

  // 1. Fase de compra.
  if (s.fase === 'compra' && s.vencedor === null) {
    s = comprarCarta(s, jogador).estado;
    yield { etapa: 'compra', estado: s };
  }

  // 2. Fase principal: empilha 1 monstro.
  if (s.fase === 'principal' && s.vencedor === null) {
    const mao = [...s.mao[jogador]!].sort((a, b) => {
      const na = CARTAS_POR_ID[cartaIdDe(a)]!.nivel;
      const nb = CARTAS_POR_ID[cartaIdDe(b)]!.nivel;
      return nb - na;
    });
    for (const uid of mao) {
      const nivel = CARTAS_POR_ID[cartaIdDe(uid)]!.nivel;
      // Só as pilhas que aceitam ESTE nível disputam; vence a primeira.
      for (const zona of pilhasQueAceitam(s, jogador, nivel)) {
        if (motivoNaoPodeInvocar(s, jogador, uid, zona) === null) {
          s = invocar(s, jogador, uid, zona).estado;
          break;
        }
      }
      if (s.invocouMonstro[jogador]!) break; // só 1 monstro por turno
    }
    yield { etapa: 'invocou', estado: s };
    s = proximaFase(s).estado; // vai para o combate
  }

  // 3. Fase de combate: cada carta ativa (topo de pilha) ataca 1x.
  if (s.fase === 'combate' && s.vencedor === null) {
    for (let z = 0; z < s.campo[jogador]!.length && s.vencedor === null; z++) {
      const ativa = cartaAtiva(s.campo[jogador]![z]!);
      if (ativa == null || ativa.atacou || ativa.modo !== 'ataque') continue;

      // Alvo: a criatura inimiga de menor def que esta vence.
      const alvos: Instancia[] = s.campo[adversario(jogador)]!
        .map((pilha) => cartaAtiva(pilha))
        .filter((c): c is Instancia => c !== null);
      const atacante = CARTAS_POR_ID[ativa.cartaId]!;
      const venciveis = alvos
        .map((alvo) => ({ alvo, carta: CARTAS_POR_ID[alvo.cartaId]! }))
        .filter((x) => atacante.atk > x.carta.def)
        .sort((a, b) => a.carta.def - b.carta.def);

      if (venciveis.length > 0) {
        // Destrói a mais fraca que dá para vencer.
        const escolha = venciveis[0]!;
        if (motivoNaoPodeAtacar(s, jogador, ativa.uid, { tipo: 'carta', uid: escolha.alvo.uid }) === null) {
          s = atacar(s, jogador, ativa.uid, { tipo: 'carta', uid: escolha.alvo.uid }).estado;
          yield { etapa: 'atacou', estado: s };
        }
      } else if (motivoNaoPodeAtacar(s, jogador, ativa.uid, { tipo: 'jogador' }) === null) {
        // Campo inimigo vazio: bate na vida.
        s = atacar(s, jogador, ativa.uid, { tipo: 'jogador' }).estado;
        yield { etapa: 'atacou', estado: s };
      }
    }
    s = proximaFase(s).estado; // vai para a finalização
    yield { etapa: 'passou', estado: s };
  }

  // 4. Fase de finalização: avança para o fim.
  if (s.fase === 'finalizacao' && s.vencedor === null) {
    s = proximaFase(s).estado;
    yield { etapa: 'passou', estado: s };
  }

  // 5. Fase fim: termina o turno.
  if (s.fase === 'fim' && s.vencedor === null) {
    s = terminarTurno(s).estado;
  }

  return s;
}

/** Joga o turno inteiro de uma vez (usado nos testes). */
export function iaJogarTurno(estado: EstadoDuelo): EstadoDuelo {
  const gen = iaPassos(estado);
  let passo = gen.next();
  while (!passo.done) passo = gen.next();
  return passo.value;
}