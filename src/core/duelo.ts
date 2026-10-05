/**
 * Regras do duelo — lógica pura, sem DOM, testável em Node.
 *
 * Fluxo do turno (fases estilo Yu-Gi-Oh, adaptado):
 *   1. compra      → o jogador clica no deck para comprar 1 carta
 *   2. principal   → invocar (máx 1 monstro/turno), mudar modo,
 *                    usar magias da mão
 *   3. combate     → selecionar atacante e dar alvo
 *   4. finalizacao → pular para a próxima fase (sem ações)
 *   5. fim         → última olhada (sem poder mexer no campo)
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
 *   - ataque direto ao jogador: só é permitido com o campo
 *       inimigo VAZIO; com qualquer criatura em campo é
 *       obrigatório atacar uma criatura. Se passar, o dano
 *       é sempre o ATK (acerto certo).
 *
 * Pilhas (o "campo" de cada jogador são 5 pilhas):
 *   Cada zona do campo é uma PILHA de cartas, ordenada de baixo
 *   para cima. Só a carta de CIMA de cada pilha é ativa: é a
 *   que ataca e a que pode ser atacada. Para invocar numa pilha
 *   é preciso respeitar a ordem de nível — pilha vazia aceita
 *   só nível 0, e a partir daí cada nova carta precisa ser
 *   exatamente um nível acima do topo. Ou seja: para ter uma
 *   carta de nível 8 ativa, é preciso ter lv0…lv7 embaixo
 *   dela. As cartas enterradas ficam guardadas (consulta e
 *   efeitos futuros); quando a de cima cai, a de baixo volta
 *   a ser a ativa.
 *
 * EVA está reservada para cartas de efeitos especiais
 * (mágicas/armadilhas) e NÃO afeta o combate.
 *
 * Toda função recebe o estado e devolve um NOVO estado (o
 * original nunca é tocado). Regras inválidas lançam `Error`
 * com a mensagem que a UI mostra ao jogador.
 */

import { CARTAS_POR_ID } from '../data/cartas.ts';
import { podeUsar, resolverMecanica, temMarca, temMarcaNoJogador, type EscolhaAlvo } from './efeitos.ts';
import { rngCriar } from './rng.ts';
import {
  DECK_MAXIMO,
  DECK_MINIMO,
  DANO_POR_LEVEL,
  FASES_ORDEM,
  LEVEL_INICIAL,
  MAO_INICIAL,
  ZONAS,
  cartaAtiva,
  cartaIdDe,
  indiceAtivo,
  type Alvo,
  type EstadoDuelo,
  type EventoDuelo,
  type Instancia,
  type Jogador,
  type Marca,
  type Par,
  type Pilha,
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
    fase: 'compra',
    levelPartida: [...nivelInicial] as Par<number>,
    levelInicial: [...nivelInicial] as Par<number>,
    danoRecebido: [0, 0],
    lp: [4000, 4000],
    deck: decks,
    mao: [[], []],
    campo: [
      Array.from({ length: ZONAS }, (): Pilha => []),
      Array.from({ length: ZONAS }, (): Pilha => []),
    ],
    cementerio: [[], []],
    marcas: [[], []],
    jogadas: [[], []],
    rngState: seed,
    log: [],
    vencedor: null,
    invocouMonstro: [false, false],
  };

  // Mão inicial: 5 para cada. Silencioso — não entra no log.
  for (const lado of [0, 1] as const) {
    for (let i = 0; i < MAO_INICIAL; i++) comprar(estado, lado, true);
  }

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

/**
 * Fase de compra: o jogador clica no deck para comprar 1 carta.
 * Avança automaticamente para a fase principal.
 */
export function comprarCarta(
  estado: EstadoDuelo,
  jogador: Jogador,
): { estado: EstadoDuelo; evento: EventoDuelo } {
  const s = novo(estado);
  if (s.vencedor !== null) throw new Error('o duelo já acabou');
  if (s.vez !== jogador) throw new Error('não é a sua vez');
  if (s.fase !== 'compra') throw new Error('não é a fase de compra');

  comprar(s, jogador);
  if (s.vencedor !== null) {
    return {
      estado: s,
      evento: registrar(s, { tipo: 'draw', mensagem: 'Deck vazio — fim de duelo.' }),
    };
  }
  s.fase = 'principal';
  return {
    estado: s,
    evento: registrar(s, {
      tipo: 'fase',
      mensagem: `Jogador ${jogador + 1} comprou. Fase principal.`,
    }),
  };
}

/** Avança para a próxima fase (ou termina o turno na fase 'fim'). */
export function proximaFase(
  estado: EstadoDuelo,
): { estado: EstadoDuelo; evento: EventoDuelo } {
  const s = novo(estado);
  if (s.vencedor !== null) throw new Error('o duelo já acabou');

  const indice = FASES_ORDEM.indexOf(s.fase);
  if (indice === -1 || indice === FASES_ORDEM.length - 1) {
    // Fase 'fim' (ou inválida): termina o turno.
    return terminarTurno(s);
  }

  s.fase = FASES_ORDEM[indice + 1]!;

  // Entrando na Finalização, as marcas vencidas são varridas: uma
  // marca criada no turno T vive até a Finalização de T+1, que é
  // quando some. É isso que faz o escudo usado no combate do seu
  // turno continuar valendo no combate do turno do oponente.
  if (s.fase === 'finalizacao') varrerMarcas(s);

  return {
    estado: s,
    evento: registrar(s, {
      tipo: 'fase',
      mensagem: `Fase de ${s.fase}.`,
    }),
  };
}

/**
 * Remove as marcas cujo prazo venceu. O rastro "espelho" é
 * permanente (o modo copiado fica até o fim do duelo), então só o
 * ícone sai — o modo copiado continua valendo.
 */
function varrerMarcas(s: EstadoDuelo): void {
  let vencidas = 0;
  for (const jogador of [0, 1] as const) {
    const antesJogador = s.marcas[jogador]!.length;
    s.marcas[jogador] = s.marcas[jogador]!.filter(
      (m) => m.efeito === 'espelho' || m.expiraEmTurno > s.turno,
    );
    vencidas += antesJogador - s.marcas[jogador]!.length;

    for (const pilha of s.campo[jogador]!) {
      for (const instancia of pilha) {
        if (!instancia.marcas?.length) continue;
        const antes = instancia.marcas.length;
        instancia.marcas = instancia.marcas.filter(
          (m) => m.efeito === 'espelho' || m.expiraEmTurno > s.turno,
        );
        vencidas += antes - instancia.marcas.length;
      }
    }
  }
  if (vencidas > 0) {
    registrar(s, {
      tipo: 'fase',
      mensagem: `${vencidas} efeito(s) de carta expiraram na finalização.`,
    });
  }
}

/** Prepara o turno do jogador da vez (fase de compra). */
function iniciarTurno(estado: EstadoDuelo): void {
  const vez = estado.vez;
  estado.fase = 'compra';
  estado.invocouMonstro[vez] = false;
  // Todas as cartas da vez (inclusive as enterradas) liberam o ataque.
  for (const pilha of estado.campo[vez]!) {
    for (const instancia of pilha) instancia.atacou = false;
  }
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

/**
 * Nível que a pilha `pilha` aceita agora: 0 se está vazia,
 * ou um acima do nível da carta que está no topo.
 */
function nivelAceitoPela(pilha: Pilha): number {
  const topo = cartaAtiva(pilha);
  return topo ? CARTAS_POR_ID[topo.cartaId]!.nivel + 1 : 0;
}

/** Índices das pilhas que aceitam uma carta de `nivel` agora. */
export function pilhasQueAceitam(estado: EstadoDuelo, jogador: Jogador, nivel: number): number[] {
  return estado.campo[jogador]!
    .map((pilha, indice) => ({ pilha, indice }))
    .filter(({ pilha }) => nivelAceitoPela(pilha) === nivel)
    .map(({ indice }) => indice);
}

/**
 * Motivo de não poder invocar `uid` na pilha `zona`,
 * ou null se pode.
 */
export function motivoNaoPodeInvocar(
  estado: EstadoDuelo,
  jogador: Jogador,
  uid: string,
  zona: number,
): string | null {
  if (estado.vencedor !== null) return 'o duelo já acabou';
  if (estado.vez !== jogador) return 'não é a sua vez';
  if (estado.fase !== 'principal') return 'só se invoca na fase principal';
  if (estado.invocouMonstro[jogador]!) return 'só se invoca 1 monstro por turno';
  if (!estado.mao[jogador]!.includes(uid)) return 'essa carta não está na sua mão';
  const carta = CARTAS_POR_ID[cartaIdDe(uid)];
  if (!carta) return 'carta desconhecida';
  if (carta.tipo === 'acao') return 'carta de Ação não se invoca: ela é jogada da mão';
  if (carta.tipo === 'reacao') return 'carta de Reação não se invoca: ela é jogada da mão';
  if (estado.levelPartida[jogador]! < carta.nivel) {
    return `seu level na partida (${estado.levelPartida[jogador]}) não alcança o nível ${carta.nivel} da carta`;
  }

  const pilhas = estado.campo[jogador]!;
  if (!Number.isInteger(zona) || zona < 0 || zona >= pilhas.length) {
    return 'essa pilha não existe (o campo tem 5)';
  }

  // Regra da pilha: a carta precisa ser exatamente o próximo nível.
  const aceito = nivelAceitoPela(pilhas[zona]!);
  if (carta.nivel !== aceito) {
    if (carta.nivel < aceito) {
      return `a pilha ${zona + 1} já está no nível ${aceito - 1}: para ${carta.nome} (nível ${carta.nivel}) use outra pilha`;
    }
    return `a pilha ${zona + 1} só aceita nível ${aceito} agora — faltam as cartas de baixo`;
  }
  return null;
}

export function invocar(
  estado: EstadoDuelo,
  jogador: Jogador,
  uid: string,
  zona: number,
): { estado: EstadoDuelo; evento: EventoDuelo } {
  const s = novo(estado);
  const motivo = motivoNaoPodeInvocar(s, jogador, uid, zona);
  if (motivo) throw new Error(motivo);

  const cartaId = cartaIdDe(uid);
  const carta = CARTAS_POR_ID[cartaId]!;
  s.mao[jogador] = s.mao[jogador]!.filter((u) => u !== uid);
  s.invocouMonstro[jogador] = true;
  // A carta entra por CIMA da pilha e passa a ser a ativa.
  s.campo[jogador]![zona]!.push({ uid, cartaId, atacou: false, modo: 'ataque' });

  const empilhada = s.campo[jogador]![zona]!.length > 1;
  return {
    estado: s,
    evento: registrar(s, {
      tipo: 'invocar',
      mensagem: empilhada
        ? `Jogador ${jogador + 1} empilhou ${carta.nome} (nível ${carta.nivel}) sobre a pilha ${zona + 1} (nível ${carta.nivel - 1}).`
        : `Jogador ${jogador + 1} invocou ${carta.nome} (nível ${carta.nivel}) na pilha ${zona + 1}.`,
    }),
  };
}

/** Troca a criatura ATIVA entre modo ataque e defesa (fase principal). */
export function alternarModo(
  estado: EstadoDuelo,
  jogador: Jogador,
  uid: string,
): { estado: EstadoDuelo; evento: EventoDuelo } {
  const s = novo(estado);
  if (s.vencedor !== null) throw new Error('o duelo já acabou');
  if (s.vez !== jogador) throw new Error('não é a sua vez');
  if (s.fase !== 'principal') throw new Error('só se muda de modo na fase principal');
  const achado = instanciaNoCampo(s, jogador, uid);
  if (!achado) throw new Error('essa criatura não está em nenhuma das suas pilhas');
  if (!achado.ativa) throw new Error('só a carta de cima da pilha muda de modo');
  if (achado.instancia.atacou) {
    throw new Error('criatura que já atacou não troca de modo neste turno');
  }
  const carta = CARTAS_POR_ID[achado.instancia.cartaId]!;
  const proximo = achado.instancia.modo === 'ataque' ? 'defesa' : 'ataque';
  achado.instancia.modo = proximo;
  return {
    estado: s,
    evento: registrar(s, {
      tipo: 'modo',
      mensagem: `${carta.nome} (pilha ${achado.zona + 1}) entrou em modo ${proximo}.`,
    }),
  };
}

/** Onde está uma criatura: em qual pilha e em que altura dela. */
function instanciaNoCampo(
  estado: EstadoDuelo,
  jogador: Jogador,
  uid: string,
): { instancia: Instancia; zona: number; altura: number; ativa: boolean } | null {
  const pilhas = estado.campo[jogador]!;
  for (let z = 0; z < pilhas.length; z++) {
    const pilha = pilhas[z]!;
    for (let h = 0; h < pilha.length; h++) {
      if (pilha[h]!.uid === uid) {
        return { instancia: pilha[h]!, zona: z, altura: h, ativa: h === indiceAtivo(pilha) };
      }
    }
  }
  return null;
}

/** A carta ativa de cada pilha inimiga que ainda pode ser atacada. */
export function alvosAtivos(estado: EstadoDuelo, jogador: Jogador): Instancia[] {
  return estado.campo[adversario(jogador)]!
    .map((pilha) => cartaAtiva(pilha))
    .filter((c): c is Instancia => c !== null);
}

/** Alguma pilha do jogador tem alguma carta (para a regra do direto)? */
export function temCriatura(estado: EstadoDuelo, jogador: Jogador): boolean {
  return estado.campo[jogador]!.some((pilha) => pilha.length > 0);
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
  if (estado.fase !== 'combate') return 'só se ataca na fase de combate';
  const atacante = instanciaNoCampo(estado, jogador, uidAtacante);
  if (!atacante) return 'essa criatura não está em nenhuma das suas pilhas';
  if (!atacante.ativa) return 'só a carta de cima da pilha ataca';
  if (atacante.instancia.atacou) return 'essa criatura já atacou neste turno';
  if (temMarca(atacante.instancia, 'silencio')) return 'essa criatura está silenciada';
  if (temMarca(atacante.instancia, 'espelho') && atacante.instancia.modo === 'defesa') {
    return 'essa criatura está desarmada';
  }
  if (atacante.instancia.modo !== 'ataque') {
    return 'criatura em modo defesa não ataca';
  }
  if (alvo.tipo === 'carta') {
    const alvoCarta = instanciaNoCampo(estado, adversario(jogador), alvo.uid);
    if (!alvoCarta) return 'a criatura-alvo não está em nenhuma pilha inimiga';
    if (!alvoCarta.ativa) return 'a criatura-alvo não está no topo da pilha';
    if (temMarca(alvoCarta.instancia, 'escudo')) return 'a criatura-alvo está protegida';
  }
  // Regra: direto só com o campo inimigo totalmente vazio, a menos
  // que o jogador tenha a marca "abrir-vida".
  if (alvo.tipo === 'jogador' && temCriatura(estado, adversario(jogador))) {
    if (!temMarcaNoJogador(estado, jogador, 'abrir-vida')) {
      return 'não pode atacar a vida do inimigo enquanto ele tiver criaturas no campo';
    }
  }
  return null;
}

/**
 * Jogar uma carta de Ação (fase Principal) ou de Reação (fase
 * Combate) da mão, com o alvo escolhido. A carta vai para o
 * Cemitério depois de resolver.
 */
export function usarCartaDeEfeito(
  estado: EstadoDuelo,
  jogador: Jogador,
  uid: string,
  escolha: EscolhaAlvo,
): { estado: EstadoDuelo; evento: EventoDuelo } {
  const motivo = podeUsar(estado, jogador, uid, escolha);
  if (motivo) throw new Error(motivo);
  return resolverMecanica(estado, jogador, uid, escolha);
}

/** A carta de efeito pode ser usada agora com algum alvo? */
export function motivoNaoPodeUsar(
  estado: EstadoDuelo,
  jogador: Jogador,
  uid: string,
  escolha: EscolhaAlvo,
): string | null {
  return podeUsar(estado, jogador, uid, escolha);
}

/** Marcas de uma carta (a UI usa para desenhar os ícones). */
export function marcasDe(i: Instancia): Marca[] {
  return i.marcas ?? [];
}

function destruir(
  estado: EstadoDuelo,
  jogador: Jogador,
  zona: number,
  altura: number,
  nome: string,
): void {
  const pilha = estado.campo[jogador]![zona]!;
  const removida = pilha.splice(altura, 1)[0]!;
  estado.cementerio[jogador]!.push(removida.uid);
  const revelou = altura === pilha.length;
  registrar(estado, {
    tipo: 'destruir',
    mensagem: `${nome} foi destruída.${revelou && pilha.length > 0 ? ` A carta de baixo (nível ${CARTAS_POR_ID[cartaIdDe(pilha[pilha.length - 1]!.uid)]!.nivel}) ficou ativa.` : ''}`,
  });
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
  const alvoPilha = instanciaNoCampo(s, alvoJogador, alvo.uid)!;
  const cartaAlvo = CARTAS_POR_ID[alvoPilha.instancia.cartaId]!;
  const atk = cartaAtacante.atk;
  const def = cartaAlvo.def;

  if (alvoPilha.instancia.modo === 'defesa') {
    if (atk > def) {
      // Def menor: destrói o alvo e NÃO causa dano.
      destruir(s, alvoJogador, alvoPilha.zona, alvoPilha.altura, cartaAlvo.nome);
      const evento = registrar(s, {
        tipo: 'destruir',
        mensagem: `${cartaAtacante.nome} rompeu a defesa de ${cartaAlvo.nome} (sem dano ao jogador).`,
      });
      checarFim(s);
      return { estado: s, evento };
    }
    if (atk < def) {
      // Def maior: o ATACANTE leva a diferença.
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

  // Alvo em modo ATAQUE: a diferença vai para a vida de quem perde.
  if (atk > def) {
    const dano = atk - def;
    aplicarDano(s, alvoJogador, dano);
    destruir(s, alvoJogador, alvoPilha.zona, alvoPilha.altura, cartaAlvo.nome);
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
    destruir(s, jogador, atacante.zona, atacante.altura, cartaAtacante.nome);
    const evento = registrar(s, {
      tipo: 'dano',
      mensagem: `${cartaAlvo.nome} venceu: ${cartaAtacante.nome} destruída, ${dano} de dano rebatido.`,
    });
    checarFim(s);
    return { estado: s, evento };
  }
  // Empate: as duas se destroem.
  destruir(s, alvoJogador, alvoPilha.zona, alvoPilha.altura, cartaAlvo.nome);
  destruir(s, jogador, atacante.zona, atacante.altura, cartaAtacante.nome);
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

/** Passa a vez: limpa flags e volta para a fase de compra. */
export function terminarTurno(estado: EstadoDuelo): { estado: EstadoDuelo; evento: EventoDuelo } {
  const s = novo(estado);
  if (s.vencedor !== null) throw new Error('o duelo já acabou');
  s.turno += 1;
  s.vez = adversario(s.vez);
  iniciarTurno(s);
  return {
    estado: s,
    evento: registrar(s, {
      tipo: 'turno',
      mensagem: `— Turno ${s.turno}: vez do Jogador ${s.vez + 1} (fase de compra).`,
    }),
  };
}
