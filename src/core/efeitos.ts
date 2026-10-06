/**
 * ============================================================================
 * EXECUÇÃO DAS MECÂNICAS — CARTAS DE AÇÃO E DE REAÇÃO
 * ============================================================================
 * Uma mecânica tem duas metades:
 *
 *   1. `podeUsar`  — valida se o jogador pode usar a carta agora e
 *      se o alvo escolhido é legal. Devolve o motivo da recusa,
 *      ou null se estiver tudo certo. A UI usa isso para pintar
 *      o alvo e para mostrar o "⚠".
 *
 *   2. `resolver`   — aplica o efeito e devolve um estado NOVO
 *      (nunca mexe no original) mais o texto do que aconteceu.
 *
 * As marcas deixadas no alvo nascem com `expiraEmTurno = turno + 1`
 * e são varridas na Finalização — é por isso que um escudo usado no
 * combate do turno 3 ainda segura o ataque no combate do turno 4.
 */

import { CARTAS_POR_ID } from '../data/cartas.ts';
import { explicarMecanica } from '../data/mecanicas.ts';
import {
  cartaAtiva,
  cartaIdDe,
  type CartaMecanica,
  type EstadoDuelo,
  type EfeitoMarca,
  type EventoDuelo,
  type Instancia,
  type Jogador,
  type Marca,
  type Pilha,
} from './types.ts';

/** O que o jogador escolheu como alvo ao usar uma carta. */
export interface EscolhaAlvo {
  /** Índice da pilha alvo, quando a mecânica age sobre pilha. */
  zona?: number;
  /** uid da carta alvo, quando a mecânica age sobre carta. */
  alvoUid?: string;
  /**
   * Para `empilhar-rapido`: a carta da mão que vai ser empilhada.
   * Para `ressuscitar`: a carta do Cemitério que volta.
   */
  cartaMao?: string;
  /** Para `proteger`: a pilha de onde sai o custo da Reação. */
  pilhaCusto?: number;
}

/** Onde a mecânica age, já resolvido para a pilha/carta. */
interface AlvoResolvido {
  jogador: Jogador;
  pilha: Pilha | null;
  zona: number;
  instancia: Instancia | null;
}

function adversario(jogador: Jogador): Jogador {
  return jogador === 0 ? 1 : 0;
}

/**
 * Índice da carta ativa (a de cima) de uma pilha, ou -1 se vazia.
 * A UI usa isso para achar o uid da carta de cima.
 */
export function indiceDaAtiva(pilha: Pilha): number {
  return pilha.length - 1;
}

/** Todas as instâncias do jogador, pilha a pilha, com zona e altura. */
function instancias(s: EstadoDuelo, jogador: Jogador): Array<{ zona: number; altura: number; i: Instancia }> {
  const saida: Array<{ zona: number; altura: number; i: Instancia }> = [];
  s.campo[jogador]!.forEach((pilha, zona) => {
    pilha.forEach((i, altura) => saida.push({ zona, altura, i }));
  });
  return saida;
}

/** Ache a instância de um uid em qualquer pilha de um jogador. */
function acharInstancia(
  s: EstadoDuelo,
  jogador: Jogador,
  uid: string,
): { zona: number; altura: number; i: Instancia } | null {
  return instancias(s, jogador).find((e) => e.i.uid === uid) ?? null;
}

/** Marcas de uma instância. */
export function marcasDe(i: Instancia): Marca[] {
  return i.marcas ?? [];
}

export function temMarca(i: Instancia, efeito: Marca['efeito']): boolean {
  return marcasDe(i).some((m) => m.efeito === efeito);
}

/** Marca de jogador ativa? */
export function temMarcaNoJogador(s: EstadoDuelo, jogador: Jogador, efeito: Marca['efeito']): boolean {
  return s.marcas[jogador]!.some((m) => m.efeito === efeito);
}

function resolveAlvo(
  s: EstadoDuelo,
  jogador: Jogador,
  mec: CartaMecanica,
  escolha: EscolhaAlvo,
): AlvoResolvido {
  const inimigo = adversario(jogador);
  switch (mec.alvo) {
    case 'pilha-inimiga':
      return { jogador: inimigo, pilha: null, zona: escolha.zona ?? -1, instancia: null };
    case 'pilha-sua':
      return { jogador, pilha: null, zona: escolha.zona ?? -1, instancia: null };
    case 'carta-inimiga': {
      if (!escolha.alvoUid) return { jogador: inimigo, pilha: null, zona: -1, instancia: null };
      const achada = acharInstancia(s, inimigo, escolha.alvoUid);
      return { jogador: inimigo, pilha: null, zona: achada?.zona ?? -1, instancia: achada?.i ?? null };
    }
    case 'jogador-inimigo':
      return { jogador: inimigo, pilha: null, zona: -1, instancia: null };
    case 'mao-sua':
    case 'cemiterio-seu':
      return { jogador, pilha: null, zona: -1, instancia: null };
    default:
      return { jogador: inimigo, pilha: null, zona: -1, instancia: null };
  }
}

/* ------------------------------------------------------------------ *
 * 1. VALIDAÇÃO
 * ------------------------------------------------------------------ */

/** Motivo de não poder usar a carta com a escolha dada, ou null. */
export function podeUsar(
  s: EstadoDuelo,
  jogador: Jogador,
  uidCarta: string,
  escolha: EscolhaAlvo,
): string | null {
  if (s.vencedor !== null) return 'o duelo já acabou';
  if (s.vez !== jogador) return 'não é a sua vez';

  const carta = CARTAS_POR_ID[cartaIdDe(uidCarta)];
  if (!carta) return 'carta desconhecida';
  const mec = carta.cartaMecanica;
  if (!mec) return 'essa carta não é de efeito';
  if (!s.mao[jogador]!.includes(uidCarta)) return 'essa carta não está na sua mão';

  // AÇÃO só na Principal; REAÇÃO só no Combate.
  if (carta.tipo === 'acao' && s.fase !== 'principal') {
    return 'carta de Ação só pode ser usada na fase Principal';
  }
  if (carta.tipo === 'reacao' && s.fase !== 'combate') {
    return 'carta de Reação só pode ser usada na fase de Combate';
  }

  if (s.levelPartida[jogador]! < carta.nivel) {
    return `seu level na partida (${s.levelPartida[jogador]}) não alcança o nível ${carta.nivel} da carta`;
  }

  // --- Reação: só precisa pagar o custo e achar alvo válido ---
  if (carta.tipo === 'reacao') {
    if (temMarcaNoJogador(s, jogador, 'trava')) return 'seu level está congelado neste ciclo';
    if (escolha.pilhaCusto === undefined) return 'escolha a pilha que vai pagar o custo da Reação';
    const pilhaCusto = s.campo[jogador]![escolha.pilhaCusto];
    if (!pilhaCusto || pilhaCusto.length === 0) {
      return 'a pilha escolhida para pagar a Reação está vazia';
    }
    if (mec.alvo === 'carta-sua' && !escolha.alvoUid) {
      return 'escolha a sua carta que quer proteger';
    }
    // O custo sai do TOPO da pilha escolhida. Se for a mesma pilha
    // da carta que você quer proteger, a própria proteção se
    // pagaria em sangue — e o escudo nasceria sobre uma carta que
    // acabou de ir para o Cemitério.
    if (mec.alvo === 'carta-sua' && escolha.alvoUid) {
      const alvo = acharInstancia(s, jogador, escolha.alvoUid);
      if (alvo && alvo.zona === escolha.pilhaCusto) {
        return 'pague o custo em outra pilha: esta é a que você quer proteger';
      }
    }
    return alvoValido(s, jogador, mec, escolha);
  }

  // --- Ação ---
  if (mec.mecanica === 'empilhar-rapido') {
    if (!escolha.cartaMao) return 'escolha a carta da sua mão que vai empilhar';
    if (!s.mao[jogador]!.includes(escolha.cartaMao)) return 'essa carta não está na sua mão';
    return alvoValido(s, jogador, mec, escolha);
  }
  return alvoValido(s, jogador, mec, escolha);
}

/** O alvo escolhido é válido para a mecânica? */
function alvoValido(
  s: EstadoDuelo,
  jogador: Jogador,
  mec: CartaMecanica,
  escolha: EscolhaAlvo,
): string | null {
  const inimigo = adversario(jogador);

  if (mec.alvo === 'pilha-inimiga' || mec.alvo === 'pilha-sua') {
    const alvoJogador = mec.alvo === 'pilha-inimiga' ? inimigo : jogador;
    const pilhas = s.campo[alvoJogador]!;
    if (escolha.zona === undefined || escolha.zona < 0 || escolha.zona >= pilhas.length) {
      return 'escolha uma pilha como alvo';
    }
    const pilha = pilhas[escolha.zona]!;
    // O "Emergir" é a única mecânica que age numa pilha SUA: ela
    // empilha por cima do que já existe, então pilha vazia é
    // resultado válido e não motivo de recusa.
    if (pilha.length === 0 && mec.mecanica !== 'empilhar-rapido') {
      return 'essa pilha está vazia';
    }
    const topo = cartaAtiva(pilha);
    if (topo && temMarca(topo, 'trava') && mec.alvo === 'pilha-sua') {
      return 'essa pilha está travada neste ciclo';
    }
    if (mec.mecanica === 'trocar-topo' && pilha.length < 2) {
      return 'essa pilha precisa de pelo menos 2 cartas para inverter';
    }
    if (mec.mecanica === 'espelhar-modo') {
      const minha = cartaAtiva(pilhaAtivaDoJogador(s, jogador));
      if (!minha) return 'você não tem carta ativa para espelhar';
      if (minha.modo === topo!.modo) return 'o modo já é o mesmo dos dois lados';
    }
    if (mec.mecanica === 'empilhar-rapido') {
      const cartaMao = CARTAS_POR_ID[cartaIdDe(escolha.cartaMao ?? '')];
      if (!cartaMao) return 'escolha uma carta da sua mão';
      if (cartaMao.tipo === 'acao' || cartaMao.tipo === 'reacao') {
        return 'essa carta é de efeito e não entra em pilha';
      }
      // Mesma ordem de níveis da invocação normal.
      const aceito = pilha.length === 0 ? 0 : CARTAS_POR_ID[cartaAtiva(pilha)!.cartaId]!.nivel + 1;
      if (cartaMao.nivel !== aceito) {
        return `essa pilha só aceita nível ${aceito} agora`;
      }
    }
    return null;
  }

  if (mec.alvo === 'carta-inimiga') {
    if (!escolha.alvoUid) return 'escolha uma carta como alvo';
    const achada = acharInstancia(s, inimigo, escolha.alvoUid);
    if (!achada) return 'essa carta não está em nenhuma pilha inimiga';
    if (achada.i !== cartaAtiva(s.campo[inimigo]![achada.zona]!)) {
      return 'só a carta de cima da pilha pode ser alvo';
    }
    if (mec.unico && temMarca(achada.i, mec.efeitos[0]!)) {
      return 'essa carta já está marcada com esse efeito';
    }
    if (mec.mecanica === 'desarmar' && achada.i.modo === 'defesa') {
      return 'essa carta já está em defesa';
    }
    return null;
  }

  // carta-sua: só a ativa de uma pilha sua pode ser protegida.
  if (mec.alvo === 'carta-sua') {
    if (!escolha.alvoUid) return 'escolha a sua carta que quer proteger';
    const achada = acharInstancia(s, jogador, escolha.alvoUid);
    if (!achada) return 'essa carta não está em nenhuma pilha sua';
    if (achada.i !== cartaAtiva(s.campo[jogador]![achada.zona]!)) {
      return 'só a carta de cima da pilha pode ser protegida';
    }
    if (temMarca(achada.i, mec.efeitos[0]!)) return 'essa carta já está protegida';
    return null;
  }

  if (mec.alvo === 'cemiterio-seu') {
    if (s.cementerio[jogador]!.length === 0) return 'seu Cemitério está vazio';
    if (!escolha.cartaMao) return 'escolha a carta do seu Cemitério';
    if (!s.cementerio[jogador]!.includes(escolha.cartaMao)) return 'essa carta não está no seu Cemitério';
    return null;
  }

  // jogador-inimigo
  if (mec.mecanica === 'cavar-level' && s.levelPartida[inimigo]! <= 0) {
    return 'o level do oponente já está em 0';
  }
  return null;
}

/** Qualquer pilha do jogador com carta — usado pelo espelhar. */
function pilhaAtivaDoJogador(s: EstadoDuelo, jogador: Jogador): Pilha {
  return s.campo[jogador]!.find((p) => p.length > 0) ?? [];
}

/* ------------------------------------------------------------------ *
 * 2. RESOLUÇÃO
 * ------------------------------------------------------------------ */

/** Uma cópia mutável do estado; a UI sempre recria do zero. */
function clonar(s: EstadoDuelo): EstadoDuelo {
  return structuredClone(s);
}

/** Marca que nasce com prazo de expirar na Finalização do turno seguinte. */
function novaMarca(cartaId: string, efeito: Marca['efeito'], turno: number): Marca {
  return { cartaId, efeito, expiraEmTurno: turno + 1 };
}

/** Aplica as marcas na instância, pulando as que já existem. */
function marcar(
  s: EstadoDuelo,
  i: Instancia,
  cartaId: string,
  efeitos: EfeitoMarca[],
  turno: number,
): void {
  if (efeitos.length === 0) return;
  for (const efeito of efeitos) {
    if (i.marcas?.some((m) => m.efeito === efeito)) continue;
    (i.marcas ??= []).push(novaMarca(cartaId, efeito, turno));
  }
  registrar(
    s,
    'acao',
    `${nomeDaCarta(cartaId)} marcou ${nomeDaCarta(i.cartaId)} com ${efeitos.join(', ')}.`,
  );
}

/** Marca no jogador (usada por "abrir-vida"). */
function marcarJogador(
  s: EstadoDuelo,
  jogador: Jogador,
  cartaId: string,
  efeitos: EfeitoMarca[],
  turno: number,
): void {
  for (const efeito of efeitos) {
    if (s.marcas[jogador]!.some((m) => m.efeito === efeito)) continue;
    s.marcas[jogador]!.push(novaMarca(cartaId, efeito, turno));
  }
  registrar(
    s,
    'acao',
    `${nomeDaCarta(cartaId)} marcou o jogador ${jogador + 1} com ${efeitos.join(', ')}.`,
  );
}

function nomeDaCarta(cartaId: string): string {
  return CARTAS_POR_ID[cartaIdDe(cartaId)]?.nome ?? cartaId;
}

/** Escreve no log. Aqui as mecânicas empilham várias linhas, então
 *  cada chamada vira uma entrada própria em vez de um evento só. */
function registrar(s: EstadoDuelo, _tipo: EventoDuelo['tipo'], mensagem: string): void {
  s.log.push(mensagem);
  if (s.log.length > 60) s.log.shift();
}

/** Envia uma carta para o Cemitério de um jogador. */
function paraCemiterio(s: EstadoDuelo, jogador: Jogador, uid: string): void {
  s.cementerio[jogador]!.push(uid);
}

/** Remove `n` cartas do topo da pilha para o Cemitério. */
function removerDoTopo(s: EstadoDuelo, jogador: Jogador, zona: number, n: number): string[] {
  const pilha = s.campo[jogador]![zona]!;
  const removidas: string[] = [];
  while (removidas.length < n && pilha.length > 0) {
    const uid = pilha.pop()!.uid;
    paraCemiterio(s, jogador, uid);
    removidas.push(uid);
  }
  return removidas;
}

/** Aplica dano na vida (reaproveita a regra do level). */
function dano(s: EstadoDuelo, jogador: Jogador, quantidade: number): void {
  if (quantidade <= 0) return;
  s.lp[jogador] = Math.max(0, s.lp[jogador]! - quantidade);
  s.danoRecebido[jogador] = s.danoRecebido[jogador]! + quantidade;
  const alvo = Math.max(0, s.levelInicial[jogador]! - Math.floor(s.danoRecebido[jogador]! / 100));
  if (alvo < s.levelPartida[jogador]!) {
    s.levelPartida[jogador] = alvo;
    registrar(s, 'dano', `Jogador ${jogador + 1} caiu para level ${alvo}.`);
  }
}

/**
 * Resolve a mecânica. Devolve o estado novo e o evento do log.
 * `podeUsar` precisa ter sido checado antes.
 */
export function resolverMecanica(
  estado: EstadoDuelo,
  jogador: Jogador,
  uidCarta: string,
  escolha: EscolhaAlvo,
): { estado: EstadoDuelo; evento: EventoDuelo } {
  const s = clonar(estado);
  const carta = CARTAS_POR_ID[cartaIdDe(uidCarta)]!;
  const mec = carta.cartaMecanica!;
  const inimigo = adversario(jogador);
  const turno = s.turno;
  const alvo = resolveAlvo(s, jogador, mec, escolha);
  const nome = carta.nome;

  // A carta jogada sai da mão.
  s.mao[jogador] = s.mao[jogador]!.filter((u) => u !== uidCarta);

  registrar(s, 'acao', `${nome} — ${explicarMecanica(mec)}.`);

  switch (mec.mecanica) {
    // ---------------------------------------------------------- reduzir
    case 'remover-niveis': {
      const antes = s.campo[alvo.jogador]![alvo.zona]!.length;
      const pilha = s.campo[alvo.jogador]![alvo.zona]!;
      const removidas = removerDoTopo(s, alvo.jogador, alvo.zona, mec.valor);
      if (pilha.length > 0) {
        marcar(s, cartaAtiva(pilha)!, carta.id, mec.efeitos, turno);
      }
      const lista = removidas.map((u) => nomeDaCarta(u)).join(', ');
      registrar(
        s,
        'destruir',
        removidas.length >= antes
          ? `A pilha inteira do jogador ${alvo.jogador + 1} foi para o Cemitério (${lista}).`
          : `${removidas.length} de ${antes} cartas saíram do topo da pilha ${alvo.zona + 1}: ${lista}.`,
      );
      break;
    }

    case 'rodar-pilha': {
      const pilha = s.campo[alvo.jogador]![alvo.zona]!;
      const topo = pilha.pop()!;
      pilha.unshift(topo);
      registrar(
        s,
        'acao',
        `${nomeDaCarta(topo.cartaId)} foi para o fundo da pilha ${alvo.zona + 1}; a carta de baixo assumiu.`,
      );
      break;
    }

    case 'trocar-topo': {
      const pilha = s.campo[alvo.jogador]![alvo.zona]!;
      const topo = pilha.pop()!;
      const fundo = pilha.shift()!;
      pilha.unshift(topo);
      pilha.push(fundo);
      marcar(s, topo, carta.id, mec.efeitos, turno);
      registrar(s, 'acao', `Topo e fundo da pilha ${alvo.zona + 1} trocaram de lugar.`);
      break;
    }

    // ---------------------------------------------------------- construir
    case 'empilhar-rapido': {
      const uid = escolha.cartaMao!;
      const pilha = s.campo[jogador]![escolha.zona!]!;
      s.mao[jogador] = s.mao[jogador]!.filter((u) => u !== uid);
      pilha.push({ uid, cartaId: cartaIdDe(uid), atacou: false, modo: 'ataque' });
      registrar(s, 'invocar', `${nomeDaCarta(cartaIdDe(uid))} empilhou na pilha ${escolha.zona! + 1} sem gastar invocação.`);
      break;
    }

    case 'ressuscitar': {
      const uid = escolha.cartaMao!;
      s.cementerio[jogador] = s.cementerio[jogador]!.filter((u) => u !== uid);
      s.mao[jogador]!.push(uid);
      registrar(s, 'acao', `${nomeDaCarta(cartaIdDe(uid))} voltou do Cemitério para a sua mão.`);
      break;
    }

    // ---------------------------------------------------------- o relógio
    case 'dano-direto': {
      const antes = s.lp[inimigo]!;
      dano(s, inimigo, mec.valor);
      registrar(s, 'dano', `${mec.valor} de dano direto: vida do jogador ${inimigo + 1} foi de ${antes} para ${s.lp[inimigo]}.`);
      break;
    }

    case 'cavar-level': {
      const antes = s.levelPartida[inimigo]!;
      s.levelPartida[inimigo] = Math.max(0, antes - mec.valor);
      registrar(
        s,
        'dano',
        `Level do jogador ${inimigo + 1} cavado de ${antes} para ${s.levelPartida[inimigo]}.`,
      );
      break;
    }

    case 'congelar-level': {
      marcarJogador(s, inimigo, carta.id, mec.efeitos, turno);
      break;
    }

    case 'abrir-vida': {
      marcarJogador(s, jogador, carta.id, mec.efeitos, turno);
      break;
    }

    // ---------------------------------------------------------- controle
    case 'silenciar': {
      marcar(s, alvo.instancia!, carta.id, mec.efeitos, turno);
      break;
    }

    case 'desarmar': {
      alvo.instancia!.modo = 'defesa';
      marcar(s, alvo.instancia!, carta.id, mec.efeitos, turno);
      registrar(s, 'modo', `${nomeDaCarta(alvo.instancia!.cartaId)} foi forçado a modo defesa.`);
      break;
    }

    case 'espelhar-modo': {
      const minha = cartaAtiva(pilhaAtivaDoJogador(s, jogador));
      const alvoAtiva = cartaAtiva(s.campo[alvo.jogador]![alvo.zona]!);
      if (minha && alvoAtiva) {
        alvoAtiva.modo = minha.modo;
        marcar(s, alvoAtiva, carta.id, mec.efeitos, turno);
        registrar(s, 'modo', `${nomeDaCarta(alvoAtiva.cartaId)} passou para modo ${minha.modo}.`);
      }
      break;
    }

    // ---------------------------------------------------------- REAÇÃO
    case 'proteger': {
      // Custo: 1 level sai do topo da pilha escolhida.
      const removidas = removerDoTopo(s, jogador, escolha.pilhaCusto!, 1);
      // A proteção é nas SUAS cartas: a escolhida e, se ainda
      // houver cota, outras ativas automaticamente.
      const candidatas = escolherAtivasProtegidas(
        s,
        jogador,
        mec.valor,
        escolha.alvoUid ? [escolha.alvoUid] : [],
      );
      // Só conta o que ainda existe: `podeUsar` já impede pagar o
      // custo na pilha protegida, mas o custo pode esvaziar uma
      // pilha que estava na cota extra de alvos automáticos.
      let protegidas = 0;
      for (const uid of candidatas) {
        const achada = acharInstancia(s, jogador, uid);
        if (!achada) continue;
        marcar(s, achada.i, carta.id, mec.efeitos, turno);
        protegidas++;
      }
      registrar(
        s,
        'acao',
        `${nome} protegeu ${protegidas} carta(s) sua(s). Custo: ${
          removidas.map((u) => nomeDaCarta(u)).join(', ') || 'nada'
        } foi para o Cemitério.`,
      );
      break;
    }

    default:
      registrar(s, 'acao', `${nome} não teve efeito.`);
  }

  // A carta jogada sempre vai para o Cemitério.
  paraCemiterio(s, jogador, uidCarta);
  s.jogadas[jogador]!.push({ uid: uidCarta, cartaId: carta.id, turno, ...escolha });

  return { estado: s, evento: { tipo: 'acao', mensagem: `${nome} resolvida.` } };
}

/**
 * Escolhe até N cartas SUAS para proteger: a indicada e, se ainda
 * houver cota, outras cartas ativas que ainda não têm escudo.
 */
function escolherAtivasProtegidas(
  s: EstadoDuelo,
  jogador: Jogador,
  n: number,
  jaEscolhidas: string[],
): string[] {
  const escolhidos = new Set(jaEscolhidas);
  for (const pilha of s.campo[jogador]!) {
    if (escolhidos.size >= n) break;
    const ativa = cartaAtiva(pilha);
    if (!ativa) continue;
    if (temMarca(ativa, 'escudo')) continue;
    escolhidos.add(ativa.uid);
  }
  return [...escolhidos];
}