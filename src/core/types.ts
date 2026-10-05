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
/**
 * Que tipo de carta é.
 *
 *   criatura  tem ATK/DEF/EVA e vive empilhada no campo.
 *   acao      não tem ATK/DEF/EVA; é jogada da mão na fase
 *             Principal, resolve um efeito em um alvo e vai
 *             para o Cemitério.
 *   reacao    não tem ATK/DEF/EVA; só pode ser jogada da mão na
 *             fase de Combate, defendendo um alvo. Paga 1 level
 *             de uma pilha sua.
 */
export type TipoCarta = 'criatura' | 'acao' | 'reacao';

/**
 * O que uma marca faz na carta (ou no jogador) que está marcado.
 *
 * As marcas são o rastro visual de uma carta de Ação ou Reação:
 * ficam como um ícone sobre a carta alvo e somem sozinhas.
 */
export type EfeitoMarca =
  /** A carta não pode ser alvo de ataque neste ciclo. */
  | 'escudo'
  /** A carta não pode atacar neste ciclo. */
  | 'silencio'
  /** A pilha não pode receber cartas novas neste ciclo. */
  | 'trava'
  /** O modo da pilha foi espelhado do seu: ataque vira defesa. */
  | 'espelho'
  /** A pilha foi esmagada: fica registrada a remoção de levels. */
  | 'fratura'
  /** O jogador pode atacar a vida mesmo com criaturas em campo. */
  | 'abrir-vida';

/** Alvos que uma mecânica aceita. */
export type AlvoMecanica =
  | 'pilha-inimiga'
  | 'pilha-sua'
  | 'carta-inimiga'
  | 'carta-sua'
  | 'jogador-inimigo'
  | 'mao-sua'
  | 'cemiterio-seu';

/**
 * Um efeito jogável. A mecânica é o COMO funciona; `valor` é o
 * QUANTO (quantos levels remover, quanto de dano, quantos alvos
 * proteger). O catálogo legível de cada uma fica em
 * `data/mecanicas.ts`; a execução fica em `core/efeitos.ts`.
 */
export type Mecanica =
  // --- pilha inimiga ---
  | 'remover-niveis'
  | 'rodar-pilha'
  | 'trocar-topo'
  | 'silenciar'
  | 'desarmar'
  | 'espelhar-modo'
  // --- pilha sua ---
  | 'empilhar-rapido'
  | 'ressuscitar'
  // --- jogador / vida ---
  | 'dano-direto'
  | 'cavar-level'
  | 'congelar-level'
  | 'abrir-vida'
  // --- Reactions ---
  | 'proteger';

/**
 * Faixa de poder de uma mecânica. Serve para equilibrar e para
 * explicar no tutorial o que cada faixa faz.
 */
export type Faixa =
  | 'fraca'
  | 'media'
  | 'forte'
  | 'devastadora'
  | 'defesa'
  | 'utilitaria';

export interface CartaMecanica {
  mecanica: Mecanica;
  /** Magnitude: N em remover-niveis, dano em dano-direto, etc. */
  valor: number;
  alvo: AlvoMecanica;
  /** Marcas deixadas no alvo depois de resolver. */
  efeitos: EfeitoMarca[];
  faixa: Faixa;
  /**
   * Se true, um mesmo jogador não pode ter duas marcas iguais
   * ativas no mesmo alvo (evita empilhar escudos infinitos).
   */
  unico?: boolean;
}

/**
 * Uma carta do TCG.
 *
 * Criaturas têm ATK/DEF/EVA; cartas de Ação e Reação não têm
 * nenhum dos três (ficam zerados) e carregam `mecanica`.
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
  /** 0 a 100. Reservada para efeitos futuros. */
  eva: number;
  /** Opcional: ausente = criatura. */
  tipo?: TipoCarta;
  /** Opcional: presente só em ação/reação. */
  cartaMecanica?: CartaMecanica;
}

/** Posição de uma criatura em campo. */
export type Modo = 'ataque' | 'defesa';

/**
 * Um rastro deixado por uma carta de Ação ou Reação.
 *
 * A marca fica presa na carta (ou no jogador) e tem prazo: some
 * sozinha na fase Finalização de `expiraEmTurno`. Por isso uma
 * proteção usada no combate do turno 3 continua valendo durante o
 * combate do turno 4 — que é o que o jogador espera.
 */
export interface Marca {
  /** Carta que criou a marca. */
  cartaId: string;
  efeito: EfeitoMarca;
  /** Remove na Finalização deste turno. */
  expiraEmTurno: number;
}

/** Uma carta em jogo: uid único (para rastrear posição na mão/campo). */
export interface Instancia {
  uid: string;
  /** `CARTAS_POR_ID` da carta. */
  cartaId: string;
  /** Já atacou neste turno? */
  atacou: boolean;
  modo: Modo;
  /** Marcas ativas sobre esta carta. */
  marcas?: Marca[];
}

/** Uma carta de Ação ou Reação jogada da mão (ainda em resolução). */
export interface CartaJogada {
  uid: string;
  cartaId: string;
  /** Zona da pilha alvo, quando a mecânica age sobre pilha. */
  zona?: number;
  /** Carta alvo, quando a mecânica age sobre carta. */
  alvoUid?: string;
  /** Turno em que foi jogada (o prazo nasce daqui). */
  turno: number;
}

/**
 * Uma pilha de criaturas dentro de uma zona do campo.
 *
 * O índice 0 é a carta do FUNDO; a última é a carta de CIMA,
 * que é a única ativa (a que pode atacar e receber ataques).
 *
 * A pilha só cresce em ordem de nível: para colocar uma carta
 * de nível N o topo precisa ser uma carta de nível N-1 — pilha
 * vazia aceita só nível 0. Assim ter uma carta de nível 8 ativa
 * exige lv0…lv7 embaixo. As cartas de baixo continuam guardadas
 * (consulta e futuros efeitos que mexem na pilha); se a de cima
 * for destruída, a de baixo volta a ser a ativa.
 */
export type Pilha = Instancia[];

/** Índice da carta ativa (do topo) da pilha, ou -1 se vazia. */
export function indiceAtivo(pilha: Pilha): number {
  return pilha.length - 1;
}

/** A carta ativa da pilha (a do topo), ou null se a pilha está vazia. */
export function cartaAtiva(pilha: Pilha): Instancia | null {
  return pilha.length > 0 ? pilha[pilha.length - 1]! : null;
}

export type Jogador = 0 | 1;

/** Par ordenado por jogador: [jogador0, jogador1]. */
export type Par<T> = [T, T];

/**
 * Fases do turno (estilo Yu-Gi-Oh, adaptado):
 *   compra      → o jogador clica no deck para comprar 1 carta
 *   principal   → invocar (máx 1 monstro/turno), mudar modo, usar magias
 *   combate     → selecionar atacante e dar alvo
 *   finalizacao → pular para a próxima fase (sem ações)
 *   fim         → última olhada (sem poder mexer no campo)
 */
export type Fase = 'compra' | 'principal' | 'combate' | 'finalizacao' | 'fim';

export const FASES_ORDEM: Fase[] = ['compra', 'principal', 'combate', 'finalizacao', 'fim'];

export interface EstadoDuelo {
  /** 0 = você, 1 = oponente. */
  vez: Jogador;
  turno: number;
  fase: Fase;
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
  /**
   * 5 pilhas por jogador. Cada pilha é ordenada de baixo (índice 0)
   * para cima (último índice) — só a carta do topo é ativa.
   */
  campo: Par<Pilha[]>;
  /** uids das cartas destruídas ou descartadas. */
  cementerio: Par<string[]>;
  /**
   * Marcas presas ao JOGADOR (e não a uma carta). Usada pela
   * mecânica "abrir-vida", cujo alvo é a vida, não uma carta.
   */
  marcas: Par<Marca[]>;
  /**
   * Turno em que cada jogador usou sua última carta de Reação
   * (não há limite, mas serve para o log e para efeitos futuros).
   */
  jogadas: Par<CartaJogada[]>;
  /** Estado interno do RNG (seed corrente). */
  rngState: number;
  log: string[];
  vencedor: Jogador | null;
  /** Invocou monstro neste turno? (máx 1 por turno). */
  invocouMonstro: Par<boolean>;
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
    | 'fase'
    | 'acao'
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
