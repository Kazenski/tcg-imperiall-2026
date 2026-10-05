/**
 * Tipos centrais do TCG. Tudo aqui é dado puro e serializável:
 * um duelo inteiro cabe num JSON.
 */

import type { Rarity } from './raridade.ts';

/**
 * Uma carta de criatura do TCG.
 *
 *   nivel  level exigido NA PARTIDA para invocar (0-8).
 *          Não há gasto: só valida `levelPartida >= nivel`.
 *   atk    dano que causa ao atacar.
 *   def    absorve batalha; em modo defesa, defesas altas
 *          seguram o golpe sem destruir a criatura.
 *   eva    RESERVADA para cartas de efeitos especiais
 *          (mágicas/armadilhas) — não afeta o combate.
 */
export interface CartaTCG {
  id: string;
  nome: string;
  descricao: string;
  raridade: Rarity;
  /** 0 a 8. */
  nivel: number;
  atk: number;
  def: number;
  /** 0 a 100 (só cartas de efeito futuro consomem). */
  eva: number;
}

/** Posição de uma criatura em campo. */
export type Modo = 'ataque' | 'defesa';

/** Uma carta em jogo: uid único (para rastrear posição na mão/campo). */
export interface Instancia {
  uid: string;
  /** `CARTAS_POR_ID` da carta. */
  cartaId: string;
  /** Já atacou neste turno? */
  atacou: boolean;
  modo: Modo;
}

export type Jogador = 0 | 1;

/** Par ordenado por jogador: [jogador0, jogador1]. */
export type Par<T> = [T, T];

export interface EstadoDuelo {
  /** 0 = você, 1 = oponente. */
  vez: Jogador;
  turno: number;
  /**
   * Level do jogador NESTA partida. Só desce: -1 a cada
   * 100 de dano recebido cumulativo, até 0.
   */
  levelPartida: Par<number>;
  /** Level em que a partida começou (base do cálculo). */
  levelInicial: Par<number>;
  /** Dano recebido cumulativo (o level cai a cada 100). */
  danoRecebido: Par<number>;
  lp: Par<number>;
  /** uids das cartas ainda no deck. */
  deck: Par<string[]>;
  /** uids das cartas na mão. */
  mao: Par<string[]>;
  /** 5 zonas cada; null = zona vazia. */
  campo: Par<Array<Instancia | null>>;
  /** uids das cartas destruídas. */
  cementerio: Par<string[]>;
  /** Estado interno do RNG (seed corrente). */
  rngState: number;
  log: string[];
  vencedor: Jogador | null;
}

/** Alvo de um ataque: uma carta inimiga ou o jogador direto. */
export type Alvo = { tipo: 'carta'; uid: string } | { tipo: 'jogador' };

export interface EventoDuelo {
  tipo:
    | 'invocar'
    | 'ataque'
    | 'modo'
    | 'esquivar'
    | 'destruir'
    | 'dano'
    | 'turno'
    | 'draw'
    | 'fim';
  mensagem: string;
}

export const ZONAS = 5;
export const LP_INICIAL = 4000;
export const MAO_INICIAL = 5;
/** O deck do jogador pode crescer com as cartas do admin. */
export const DECK_MINIMO = 5;
export const DECK_MAXIMO = 60;
/** Level em que a partida começa. */
export const LEVEL_INICIAL = 10;
/** A cada este tanto de dano cumulativo, o level cai 1. */
export const DANO_POR_LEVEL = 100;

/** A carta de um uid (`"golem-ferro#3"` -> `"golem-ferro"`). */
export function cartaIdDe(uid: string): string {
  return uid.split('#')[0] ?? uid;
}
