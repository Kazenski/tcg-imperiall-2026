/**
 * Regras do duelo — lógica pura, sem DOM, testável em Node.
 *
 * Fluxo de um turno:
 *   1. draw: o jogador da vez compra 1 carta (a partir do turno 2).
 *   2. main: invocar criaturas da mão (custa `nivel` em pontos de
 *      level e exige level do dono >= `nivel` da carta).
 *   3. batalha: cada criatura ataca no máximo 1 vez — contra uma
 *      criatura inimiga (EVA rola primeiro) ou contra o jogador.
 *   4. end: passa a vez, reseta pontos e as flags de ataque.
 *
 * Batalha criatura x criatura (estilo clássico):
 *   - defensor esquiva (EVA)  -> nada acontece;
 *   - atk > def -> defensor toma a diferença, carta destruída;
 *   - atk < def -> atacante toma a diferença, carta destruída;
 *   - atk = def -> ambas destruídas, sem dano.
 *
 * Toda função recebe o estado e devolve um NOVO estado (o original
 * nunca é tocado). Regras inválidas lançam `Error` com a mensagem
 * que a UI mostra ao jogador.
 */

import { CARTAS_POR_ID } from '../data/cartas.ts';
import { rngCriar } from './rng.ts';
import {
  CAP_EVA,
  MAO_INICIAL,
  TAMANHO_DECK,
  ZONAS,
  cartaIdDe,
  pontosDeInvocacao,
  type Alvo,
  type EstadoDuelo,
  type EventoDuelo,
  type Instancia,
  type Jogador,
  type Par,
} from './types.ts';

export interface OpcaoDuelo {
  /** ids das cartas do deck de cada jogador (ex.: `deckPadrao()`). */
  deck: Par<string[]>;
  /** Level do herói de cada jogador: requisito de invocação e bônus de pontos. */
  nivelDono: Par<number>;
  seed?: number;
}

function novo(estado: EstadoDuelo): EstadoDuelo {
  return structuredClone(estado);
}

function registrar(estado: EstadoDuelo, evento: EventoDuelo): EventoDuelo {
  estado.log.push(evento.mensagem);
  if (estado.log.length > 60) estado.log.shift();
  return evento;
}

function rng(estado: EstadoDuelo) {
  return rngCriar(estado.rngState);
}

/** Avança a seed guardada no estado (determinístico entre partidas). */
function avancarSeed(estado: EstadoDuelo): void {
  estado.rngState = (estado.rngState * 1103515245 + 12345) >>> 0;
}

function adversario(jogador: Jogador): Jogador {
  return jogador === 0 ? 1 : 0;
}

/** Embaralha (Fisher-Yates) com a seed atual e devolve a nova seed. */
function embaralhar(cartas: string[], seed: number): { ordem: string[]; seed: number } {
  const g = rngCriar(seed);
  const ordem = [...cartas];
  for (let i = ordem.length - 1; i > 0; i--) {
    const j = Math.floor(g.proximo() * (i + 1));
    [ordem[i], ordem[j]] = [ordem[j]!, ordem[i]!];
  }
  return { ordem, seed: (seed * 1103515245 + 12345) >>> 0 };
}

export function dueloNovo(opcao: OpcaoDuelo): EstadoDuelo {
  for (const n of opcao.nivelDono) {
    if (!Number.isInteger(n) || n < 0) throw new Error('level do dono inválido');
  }
  for (const deck of opcao.deck) {
    if (deck.length !== TAMANHO_DECK) {
      throw new Error(`o deck precisa de ${TAMANHO_DECK} cartas (tem ${deck.length})`);
    }
  }

  let seed = opcao.seed ?? Math.floor(Math.random() * 2 ** 32);
  const decks: Par<string[]> = [[], []];
  for (const lado of [0, 1] as const) {
    const r = embaralhar(opcao.deck[lado]!, seed);
    // Cada posição vira um uid único (`id#posição`), mesmo
    // com cópias repetidas no deck.
    decks[lado] = r.ordem.map((id, i) => `${id}#${i}`);
    seed = r.seed;
  }

  const estado: EstadoDuelo = {
    vez: 0,
    turno: 1,
    nivelDono: [...opcao.nivelDono] as Par<number>,
    pontos: [0, 0],
    lp: [4000, 4000],
    deck: decks,
    mao: [[], []],
    campo: [
      Array<Instancia | null>(ZONAS).fill(null),
      Array<Instancia | null>(ZONAS).fill(null),
    ],
    cementerio: [[], []],
    rngState: seed,
    log: [],
    vencedor: null,
  };

  // Mão inicial: 5 para cada. Silencioso — não entra no log.
  for (const lado of [0, 1] as const) {
    for (let i = 0; i < MAO_INICIAL; i++) comprar(estado, lado, true);
  }

  iniciarTurno(estado, false);
  return estado;
}

/** Compra 1 carta do deck para a mão. Deck vazio = deck-out (derrota). */
function comprar(estado: EstadoDuelo, jogador: Jogador, silencioso = false): void {
  const deck = estado.deck[jogador]!;
  if (deck.length === 0) {
    estado.lp[jogador] = 0;
    estado.vencedor = adversario(jogador);
    registrar(estado, {
      tipo: 'fim',
      mensagem: `Jogador ${jogador + 1} ficou sem deck — deck-out!`,
    });
    return;
  }
  const uid = deck.shift()!;
  estado.mao[jogador]!.push(uid);
  if (!silencioso) {
    registrar(estado, { tipo: 'draw', mensagem: `Jogador ${jogador + 1} comprou uma carta.` });
  }
}

/** Prepara pontos e draw do turno do jogador da vez. */
function iniciarTurno(estado: EstadoDuelo, draw: boolean): void {
  const vez = estado.vez;
  estado.pontos[vez] = pontosDeInvocacao(estado.nivelDono[vez]!);
  for (const zona of estado.campo[vez]!) zona?.atacou && (zona.atacou = false);
  if (draw) comprar(estado, vez);
}

/** Motivo de não poder invocar, ou null se pode. */
export function motivoNaoPodeInvocar(
  estado: EstadoDuelo,
  jogador: Jogador,
  uid: string,
): string | null {
  if (estado.vencedor !== null) return 'o duelo já acabou';
  if (estado.vez !== jogador) return 'não é a sua vez';
  if (!estado.mao[jogador]!.includes(uid)) return 'essa carta não está na sua mão';
  const carta = CARTAS_POR_ID[cartaIdDe(uid)];
  if (!carta) return 'carta desconhecida';
  if (estado.nivelDono[jogador]! < carta.nivel) {
    return `seu level (${estado.nivelDono[jogador]}) não alcança o nível ${carta.nivel} da carta`;
  }
  if (estado.pontos[jogador]! < carta.nivel) {
    return `faltam pontos de level (tem ${estado.pontos[jogador]}, a carta custa ${carta.nivel})`;
  }
  if (estado.campo[jogador]!.every((z) => z !== null)) return 'campo cheio (5 criaturas)';
  return null;
}

export function invocar(
  estado: EstadoDuelo,
  jogador: Jogador,
  uid: string,
): { estado: EstadoDuelo; evento: EventoDuelo } {
  const s = novo(estado);
  const motivo = motivoNaoPodeInvocar(s, jogador, uid);
  if (motivo) throw new Error(motivo);

  const cartaId = cartaIdDe(uid);
  const carta = CARTAS_POR_ID[cartaId]!;
  s.mao[jogador] = s.mao[jogador]!.filter((u) => u !== uid);
  s.pontos[jogador] = s.pontos[jogador]! - carta.nivel;
  const zona = s.campo[jogador]!.findIndex((z) => z === null);
  s.campo[jogador]![zona] = { uid, cartaId, atacou: false };

  return {
    estado: s,
    evento: registrar(s, {
      tipo: 'invocar',
      mensagem: `Jogador ${jogador + 1} invocou ${carta.nome} (nível ${carta.nivel}).`,
    }),
  };
}

function instanciaNoCampo(
  estado: EstadoDuelo,
  jogador: Jogador,
  uid: string,
): { instancia: Instancia; indice: number } | null {
  const campo = estado.campo[jogador]!;
  for (let i = 0; i < campo.length; i++) {
    const z = campo[i];
    if (z != null && z.uid === uid) return { instancia: z, indice: i };
  }
  return null;
}

/** Motivo de não poder atacar, ou null se pode. */
export function motivoNaoPodeAtacar(
  estado: EstadoDuelo,
  jogador: Jogador,
  uidAtacante: string,
  alvo: Alvo,
): string | null {
  if (estado.vencedor !== null) return 'o duelo já acabou';
  if (estado.vez !== jogador) return 'não é a sua vez';
  const atacante = instanciaNoCampo(estado, jogador, uidAtacante);
  if (!atacante) return 'essa criatura não está no seu campo';
  if (atacante.instancia.atacou) return 'essa criatura já atacou neste turno';
  if (alvo.tipo === 'carta') {
    if (!instanciaNoCampo(estado, adversario(jogador), alvo.uid)) {
      return 'a criatura-alvo não está no campo inimigo';
    }
  }
  return null;
}

function destruir(
  estado: EstadoDuelo,
  jogador: Jogador,
  indice: number,
  nome: string,
): void {
  const zona = estado.campo[jogador]![indice]!;
  estado.campo[jogador]![indice] = null;
  estado.cementerio[jogador]!.push(zona.uid);
  registrar(estado, { tipo: 'destruir', mensagem: `${nome} foi destruída.` });
}

/** Resolve um ataque. Retorna o estado novo e o log do que aconteceu. */
export function atacar(
  estado: EstadoDuelo,
  jogador: Jogador,
  uidAtacante: string,
  alvo: Alvo,
): { estado: EstadoDuelo; evento: EventoDuelo } {
  const s = novo(estado);
  const motivo = motivoNaoPodeAtacar(s, jogador, uidAtacante, alvo);
  if (motivo) throw new Error(motivo);

  const alvoJogador = adversario(jogador);
  const atacante = instanciaNoCampo(s, jogador, uidAtacante)!;
  const cartaAtacante = CARTAS_POR_ID[atacante.instancia.cartaId]!;
  atacante.instancia.atacou = true;

  // EVA: a criatura-alvo (ou o dono, se for ataque direto a uma
  // criatura) tem chance de esquivar. Ataque direto ao jogador
  // sempre acerta.
  const defesaEVA = alvo.tipo === 'carta'
    ? Math.min(CartaEVA(alvo.uid, s, alvoJogador), CAP_EVA)
    : 0;
  avancarSeed(s);
  if (defesaEVA > 0 && rng(s).chance(defesaEVA / 100)) {
    const nome = alvo.tipo === 'carta'
      ? CARTAS_POR_ID[cartaIdDe(alvo.uid)]!.nome
      : `Jogador ${alvoJogador + 1}`;
    return {
      estado: s,
      evento: registrar(s, {
        tipo: 'esquivar',
        mensagem: `${nome} evadiu o ataque de ${cartaAtacante.nome}!`,
      }),
    };
  }

  if (alvo.tipo === 'jogador') {
    s.lp[alvoJogador] = s.lp[alvoJogador]! - cartaAtacante.atk;
    const evento = registrar(s, {
      tipo: 'dano',
      mensagem: `${cartaAtacante.nome} atacou direto: ${cartaAtacante.atk} de dano ao Jogador ${alvoJogador + 1}.`,
    });
    checarFim(s, evento);
    return { estado: s, evento };
  }

  // Criatura x criatura.
  const alvoCampo = instanciaNoCampo(s, alvoJogador, alvo.uid)!;
  const cartaAlvo = CARTAS_POR_ID[alvoCampo.instancia.cartaId]!;
  const { atk, def } = { atk: cartaAtacante.atk, def: cartaAlvo.def };

  if (atk > def) {
    const dano = atk - def;
    s.lp[alvoJogador] = s.lp[alvoJogador]! - dano;
    destruir(s, alvoJogador, alvoCampo.indice, cartaAlvo.nome);
    const evento = registrar(s, {
      tipo: 'dano',
      mensagem: `${cartaAtacante.nome} destruiu ${cartaAlvo.nome} e causou ${dano} de dano.`,
    });
    checarFim(s, evento);
    return { estado: s, evento };
  }
  if (atk < def) {
    const dano = def - atk;
    s.lp[jogador] = s.lp[jogador]! - dano;
    destruir(s, jogador, atacante.indice, cartaAtacante.nome);
    const evento = registrar(s, {
      tipo: 'dano',
      mensagem: `${cartaAlvo.nome} segurou: ${cartaAtacante.nome} destruída, ${dano} de dano rebatido.`,
    });
    checarFim(s, evento);
    return { estado: s, evento };
  }
  destruir(s, alvoJogador, alvoCampo.indice, cartaAlvo.nome);
  destruir(s, jogador, atacante.indice, cartaAtacante.nome);
  const evento = registrar(s, {
    tipo: 'destruir',
    mensagem: `${cartaAtacante.nome} e ${cartaAlvo.nome} se destruíram mutuamente.`,
  });
  checarFim(s, evento);
  return { estado: s, evento };
}

function CartaEVA(uid: string, estado: EstadoDuelo, jogador: Jogador): number {
  const achado = instanciaNoCampo(estado, jogador, uid);
  if (!achado) return 0;
  return CARTAS_POR_ID[achado.instancia.cartaId]!.eva;
}

function checarFim(s: EstadoDuelo, ultimo: EventoDuelo): void {
  for (const lado of [0, 1] as const) {
    if (s.lp[lado]! <= 0) {
      s.vencedor = adversario(lado);
      registrar(s, {
        tipo: 'fim',
        mensagem: `Jogador ${s.vencedor! + 1} venceu o duelo!`,
      });
    }
  }
  void ultimo;
}

/** Passa a vez: reseta pontos, limpa flags de ataque, compra 1. */
export function terminarTurno(estado: EstadoDuelo): { estado: EstadoDuelo; evento: EventoDuelo } {
  const s = novo(estado);
  if (s.vencedor !== null) throw new Error('o duelo já acabou');
  s.turno += 1;
  s.vez = adversario(s.vez);
  iniciarTurno(s, true);
  return {
    estado: s,
    evento: registrar(s, {
      tipo: 'turno',
      mensagem: `— Turno ${s.turno}: vez do Jogador ${s.vez + 1} (${s.pontos[s.vez]} pontos de level).`,
    }),
  };
}
