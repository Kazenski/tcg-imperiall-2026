/**
 * Tipos centrais do TCG. Tudo aqui é dado puro e serializável:
 * um duelo inteiro cabe num JSON.
 */

import type { Rarity } from './raridade.ts';

/**
 * Uma carta de criatura do TCG.
 *
 *   nivel  custo de invocação em pontos de level E requisito mínimo do
 *          level do dono (o nível do herói do idle RPG).
 *   atk    dano que causa ao atacar.
 *   def    absorve dano de batalha; defesas altas viram escudo.
 *   eva    % de chance de esquivar um ataque (cap em CAP_EVA).
 */
export interface CartaTCG {
  id: string;
  nome: string;
  descricao: string;
  raridade: Rarity;
  /** 1 a 8. */
  nivel: number;
  atk: number;
  def: number;
  /** 0 a 60 (%). */
  eva: number;
}

/** Uma carta em jogo: uid único (para rastrear posição na mão/campo). */
export interface Instancia {
  uid: string;
  /** `CARTAS_POR_ID` da carta. */
  cartaId: string;
  /** Já atacou neste turno? */
  atacou: boolean;
}

export type Jogador = 0 | 1;

/** Par ordenado por jogador: [jogador0, jogador1]. */
export type Par<T> = [T, T];

export interface EstadoDuelo {
  /** 0 = você, 1 = oponente. */
  vez: Jogador;
  turno: number;
  nivelDono: Par<number>;
  /** Pontos de level do turno: gasta-se o `nivel` de cada invocação. */
  pontos: Par<number>;
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
  tipo: 'invocar' | 'ataque' | 'esquivar' | 'destruir' | 'dano' | 'turno' | 'draw' | 'fim';
  mensagem: string;
}

export const ZONAS = 5;
export const LP_INICIAL = 4000;
export const MAO_INICIAL = 5;
export const TAMANHO_DECK = 20;
/** EVA jamais passa disso, por mais alta que seja a carta. */
export const CAP_EVA = 60;

/** Pontos de invocação do turno: base 3 + 1 por cada 10 níveis do dono. */
export function pontosDeInvocacao(nivelDono: number): number {
  return 3 + Math.floor(nivelDono / 10);
}

/** A carta de um uid (`"golem-ferro#3"` -> `"golem-ferro"`). */
export function cartaIdDe(uid: string): string {
  return uid.split('#')[0] ?? uid;
}
