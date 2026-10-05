/**
 * Regras do duelo — lógica pura, sem DOM, testável em Node.
 *
 * Fluxo de um turno:
 *   1. draw: o jogador da vez compra 1 carta (a partir do turno 2).
 *   2. main: invocar criaturas da mão. NÃO HÁ GASTO: basta
 *      ter `levelPartida >= nivel` da carta e uma zona livre.
 *   3. batalha: cada criatura ataca no máximo 1 vez — contra
 *      uma criatura inimiga ou contra o jogador.
 *   4. end: passa a vez e compra 1.
 *
 * Level na partida:
 *   Começa em LEVEL_INICIAL e SÓ DESCE: a cada 100 de dano
 *   recebido cumulativo, cai 1 (mínimo 0). Cartas de nível 0
 *   existem para o duelo acontecer mesmo em level 0.
 *
 * Modo ataque/defesa (estilo clássico):
 *   - criatura em MODO ATAQUE:
 *       atk > def -> alvo destruído, defensor toma a diferença;
 *       atk < def -> atacante destruído, atacante toma a diferença;
 *       empate    -> ambas destruídas, sem dano.
 *   - criatura em MODO DEFESA:
 *       atk > def -> alvo destruído, SEM dano ao defensor;
 *       atk < def -> alvo sobrevive, atacante toma a diferença;
 *       empate    -> nada acontece.
 *   - ataque direto ao jogador: sempre acerta (dano = atk).
 *
 * EVA está reservada para cartas de efeitos especiais
 * (mágicas/armadilhas) e NÃO afeta o combate.
 *
 * Toda função recebe o estado e devolve um NOVO estado (o
 * original nunca é tocado). Regras inválidas lançam `Error`
 * com a mensagem que a UI mostra ao jogador.
 */

import { CARTAS_POR_ID } from '../data/cartas.ts';
import { rngCriar } from './rng.ts';
import {
  DECK_MAXIMO,
  DECK_MINIMO,
  DANO_POR_LEVEL,
  LEVEL_INICIAL,
  MAO_INICIAL,
  ZONAS,
  cartaIdDe,
  type Alvo,
  type EstadoDuelo,
  type EventoDuelo,
  type Instancia,
  type Jogador,
  type Modo,
  type Par,
} from './types.ts';

export interface OpcaoDuelo {
  /** ids das cartas do deck de cada jogador (ex.: `deckPadrao()`). */
  deck: Par<string[]>;
  /** Level em que cada jogador começa (padrão 10). */
  levelInicial?: Par<number>;
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
  for (const deck of opcao.deck) {
    if (deck.length < DECK_MINIMO || deck.length > DECK_MAXIMO) {
      throw new Error(
        `o deck precisa de ${DECK_MINIMO} a ${DECK_MAXIMO} cartas (tem ${deck.length})`,
      );
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

  const nivelInicial = opcao.levelInicial ?? [LEVEL_INICIAL, LEVEL_INICIAL];
  for (const n of nivelInicial) {
    if (!Number.isInteger(n) || n < 0) throw new Error('level inicial inválido');
  }

  const estado: EstadoDuelo = {
    vez: 0,
    turno: 1,
    levelPartida: [...nivelInicial] as Par<number>,
    levelInicial: [...nivelInicial] as Par<number>,
    danoRecebido: [0, 0],
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

/** Prepara o turno do jogador da vez (draw a partir do turno 2). */
function iniciarTurno(estado: EstadoDuelo, draw: boolean): void {
  const vez = estado.vez;
  for (const zona of estado.campo[vez]!) {
    if (zona) zona.atacou = false;
  }
  if (draw) comprar(estado, vez);
}

/**
 * Aplica dano a um jogador: o LP desce e o dano CUMULATIVO
 * sobe — a cada 100 acumulados, o level da partida cai 1.
 */
function aplicarDano(estado: EstadoDuelo, jogador: Jogador, quantidade: number): void {
  if (quantidade <= 0) return;
  estado.lp[jogador] = Math.max(0, estado.lp[jogador]! - quantidade);
  estado.danoRecebido[jogador] = estado.danoRecebido[jogador]! + quantidade;
  const novoLevel = Math.max(
    0,
    estado.levelInicial[jogador]! - Math.floor(estado.danoRecebido[jogador]! / DANO_POR_LEVEL),
  );
  if (novoLevel < estado.levelPartida[jogador]!) {
    estado.levelPartida[jogador] = novoLevel;
    registrar(estado, {
      tipo: 'dano',
      mensagem: `Jogador ${jogador + 1} caiu para level ${novoLevel} (${estado.danoRecebido[jogador]} de dano cumulativo).`,
    });
  }
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
  if (estado.levelPartida[jogador]! < carta.nivel) {
    return `seu level na partida (${estado.levelPartida[jogador]}) não alcança o nível ${carta.nivel} da carta`;
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
  const zona = s.campo[jogador]!.findIndex((z) => z === null);
  s.campo[jogador]![zona] = { uid, cartaId, atacou: false, modo: 'ataque' };

  return {
    estado: s,
    evento: registrar(s, {
      tipo: 'invocar',
      mensagem: `Jogador ${jogador + 1} invocou ${carta.nome} (nível ${carta.nivel}).`,
    }),
  };
}

/** Troca uma criatura entre modo ataque e defesa. */
export function alternarModo(
  estado: EstadoDuelo,
  jogador: Jogador,
  uid: string,
): { estado: EstadoDuelo; evento: EventoDuelo } {
  const s = novo(estado);
  if (s.vencedor !== null) throw new Error('o duelo já acabou');
  if (s.vez !== jogador) throw new Error('não é a sua vez');
  const achado = instanciaNoCampo(s, jogador, uid);
  if (!achado) throw new Error('essa criatura não está no seu campo');
  if (achado.instancia.atacou) {
    throw new Error('criatura que já atacou não troca de modo neste turno');
  }
  const carta = CARTAS_POR_ID[achado.instancia.cartaId]!;
  const proximo: Modo = achado.instancia.modo === 'ataque' ? 'defesa' : 'ataque';
  achado.instancia.modo = proximo;
  return {
    estado: s,
    evento: registrar(s, {
      tipo: 'modo',
      mensagem: `${carta.nome} entrou em modo ${proximo}.`,
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
  if (atacante.instancia.modo !== 'ataque') {
    return 'criatura em modo defesa não ataca';
  }
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

  if (alvo.tipo === 'jogador') {
    // Ataque direto: sempre acerta.
    aplicarDano(s, alvoJogador, cartaAtacante.atk);
    const evento = registrar(s, {
      tipo: 'dano',
      mensagem: `${cartaAtacante.nome} atacou direto: ${cartaAtacante.atk} de dano ao Jogador ${alvoJogador + 1}.`,
    });
    checarFim(s);
    return { estado: s, evento };
  }

  // Criatura x criatura: o MODO do alvo muda tudo.
  const alvoCampo = instanciaNoCampo(s, alvoJogador, alvo.uid)!;
  const cartaAlvo = CARTAS_POR_ID[alvoCampo.instancia.cartaId]!;
  const atk = cartaAtacante.atk;
  const def = cartaAlvo.def;

  if (alvoCampo.instancia.modo === 'defesa') {
    if (atk > def) {
      destruir(s, alvoJogador, alvoCampo.indice, cartaAlvo.nome);
      const evento = registrar(s, {
        tipo: 'destruir',
        mensagem: `${cartaAtacante.nome} rompeu a defesa de ${cartaAlvo.nome} (sem dano ao jogador).`,
      });
      checarFim(s);
      return { estado: s, evento };
    }
    if (atk < def) {
      const dano = def - atk;
      aplicarDano(s, jogador, dano);
      const evento = registrar(s, {
        tipo: 'dano',
        mensagem: `${cartaAlvo.nome} segurou em defesa: ${dano} de dano rebatido em ${cartaAtacante.nome}.`,
      });
      checarFim(s);
      return { estado: s, evento };
    }
    const evento = registrar(s, {
      tipo: 'ataque',
      mensagem: `${cartaAtacante.nome} bateu na defesa de ${cartaAlvo.nome}: empate, nada acontece.`,
    });
    checarFim(s);
    return { estado: s, evento };
  }

  // Alvo em modo ataque.
  if (atk > def) {
    const dano = atk - def;
    aplicarDano(s, alvoJogador, dano);
    destruir(s, alvoJogador, alvoCampo.indice, cartaAlvo.nome);
    const evento = registrar(s, {
      tipo: 'dano',
      mensagem: `${cartaAtacante.nome} destruiu ${cartaAlvo.nome} e causou ${dano} de dano.`,
    });
    checarFim(s);
    return { estado: s, evento };
  }
  if (atk < def) {
    const dano = def - atk;
    aplicarDano(s, jogador, dano);
    destruir(s, jogador, atacante.indice, cartaAtacante.nome);
    const evento = registrar(s, {
      tipo: 'dano',
      mensagem: `${cartaAlvo.nome} venceu: ${cartaAtacante.nome} destruída, ${dano} de dano rebatido.`,
    });
    checarFim(s);
    return { estado: s, evento };
  }
  destruir(s, alvoJogador, alvoCampo.indice, cartaAlvo.nome);
  destruir(s, jogador, atacante.indice, cartaAtacante.nome);
  const evento = registrar(s, {
    tipo: 'destruir',
    mensagem: `${cartaAtacante.nome} e ${cartaAlvo.nome} se destruíram mutuamente.`,
  });
  checarFim(s);
  return { estado: s, evento };
}

function checarFim(s: EstadoDuelo): void {
  for (const lado of [0, 1] as const) {
    if (s.lp[lado]! <= 0) {
      s.vencedor = adversario(lado);
      registrar(s, {
        tipo: 'fim',
        mensagem: `Jogador ${s.vencedor! + 1} venceu o duelo!`,
      });
    }
  }
}

/** Passa a vez: limpa flags de ataque e compra 1. */
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
      mensagem: `— Turno ${s.turno}: vez do Jogador ${s.vez + 1}.`,
    }),
  };
}
