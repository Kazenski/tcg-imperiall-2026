/**
 * UI do duelo — DOM/CSS. Sem Phaser: um TCG é cartas e texto;
 * o DOM já faz isso bem.
 *
 * Layout em 3 colunas:
 *   esquerda  → log do duelo
 *   centro    → campos (pilhas), separador de fases, mão
 *   direita  → detalhes da carta clicada (ampliada)
 *
 * Conceito de PILHA: cada zona do campo é uma pilha de cartas
 * empilhadas de baixo (índice 0) para cima. Só a carta de CIMA de
 * cada pilha está ativa: é a que ataca e a que pode ser atacada.
 * Para invocar é preciso respeitar a ordem de níveis — pilha
 * vazia aceita só nível 0, e a partir daí cada nova carta precisa
 * ser exatamente um nível acima do topo.
 *
 * Interação:
 *   - clique em QUALQUER carta (mão, pilha, enterrada) abre os
 *     detalhes na coluna da direita;
 *   - na fase principal, carta da mão + clique numa pilha empilha;
 *   - no combate, clique na carta ativa e depois no alvo — uma
 *     seta acompanha o alvo selecionado.
 *
 * A IA joga em passos (`iaPassos`) com delays, para o jogador ver.
 *
 * O estado nunca é mutado aqui: cada ação vem do `core/` como um
 * estado novo, e a tela é redesenhada do zero.
 */

import {
  alternarModo,
  atacar,
  comprarCarta,
  dueloNovo,
  invocar,
  marcasDe,
  motivoNaoPodeAtacar,
  motivoNaoPodeInvocar,
  pilhasQueAceitam,
  proximaFase,
  usarCartaDeEfeito,
} from '../core/duelo.ts';
import type { EscolhaAlvo } from '../core/efeitos.ts';
import { iaPassos, type EtapaIA } from '../core/ia.ts';
import { CARTAS_POR_ID, deckPadrao, registrarCartas } from '../data/cartas.ts';
import { explicarMecanica } from '../data/mecanicas.ts';
import {
  OPCOES_MECANICA,
  URL_CARTAS_OFICIAL,
  carregarCartas,
  carregarCartasOficiais,
  cartaValida,
  exportarJson,
  idParaNome,
  importarJson,
  mesclarCartas,
  salvarCartas,
} from '../core/admin.ts';
import { RARITY_CLASS } from '../core/raridade.ts';
import type { Rarity } from '../core/raridade.ts';
import {
  DECK_MAXIMO,
  FASES_ORDEM,
  cartaAtiva,
  cartaIdDe,
  indiceAtivo,
  type Alvo,
  type CartaMecanica,
  type CartaTCG,
  type EfeitoMarca,
  type EstadoDuelo,
  type Faixa,
  type Instancia,
  type Jogador,
  type Mecanica,
  type Pilha,
  type TipoCarta,
} from '../core/types.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;

/** Ícone e título de cada marca de carta (efeito pendente). */
const ICONE_MARCA: Record<EfeitoMarca, string> = {
  escudo: '🛡',
  silencio: '🤐',
  trava: '🔒',
  espelho: '🪞',
  fratura: '⚡',
  'abrir-vida': '🎯',
};

const TITULO_MARCA: Record<EfeitoMarca, string> = {
  escudo: 'Protegida: não pode ser alvo de ataque',
  silencio: 'Silenciada: não pode atacar',
  trava: 'Pilha travada: não aceita novas cartas',
  espelho: 'Modo espelhado',
  fratura: 'Pilha fraturada: levels foram removidos daqui',
  'abrir-vida': 'Ataque direto na vida liberado',
};

/** Atirador selecionado no combate (uid da carta ativa do jogador). */
let selecionado: string | null = null;
/** Carta da mão escolhida para empilhar (uid ou null). */
let naMao: string | null = null;
/**
 * Carta de Ação/Reação escolhida na mão para ser jogada (uid ou
 * null). Com ela setada, a mesa destaca os alvos legais.
 */
let jogando: string | null = null;
/**
 * Reação escolhida: índice da pilha que vai pagar o custo (1 level
 * sai do topo dela). Fica null até o jogador escolher.
 */
let custoPilha: number | null = null;
/** Painel do admin aberto? */
let adminAberto = false;
/** Estado do duelo em curso. */
let estado: EstadoDuelo;
/** Cartas do jogador: oficiais (GitHub) + locais (localStorage). */
let cartas: CartaTCG[];
/** Carta mostrada ampliada na lateral (uid ou null). */
let detalheUid: string | null = null;
/** Animação de ataque em curso. */
let animacao: { tipo: 'vulto' | 'fogo'; de: string; para: string } | null = null;

export async function iniciar(): Promise<void> {
  const [oficiais, locais] = await Promise.all([
    carregarCartasOficiais(),
    Promise.resolve(carregarCartas()),
  ]);
  cartas = mesclarCartas(oficiais, locais);
  // As cartas do Admin entram no índice global: o core das regras
  // resolve ids por ele, e sem isso uma carta cadastrada no jogo
  // quebraria o duelo assim que fosse para o campo.
  registrarCartas(cartas);
  estado = novoDuelo();
  render();
}

function novoDuelo(): EstadoDuelo {
  const meu = meuDeck();
  const novo = dueloNovo({
    deck: [meu.deck, deckPadrao()],
    seed: (Date.now() % 2 ** 32) >>> 0,
  });
  // O aviso do deck cortado entra no log do duelo novo.
  return meu.aviso ? { ...novo, log: [...novo.log, `⚠ ${meu.aviso}`].slice(-60) } : novo;
}

/** Seu deck = padrão + cartas cadastradas (oficiais + locais). */
/**
 * Seu deck = baralho padrão + as cartas cadastradas no Admin.
 *
 * A soma pode passar de `DECK_MAXIMO` (quem cria muita carta de
 * teste no Admin estourava o limite e o duelo nem começava), então
 * as extras são cortadas e um aviso entra no log. As oficiais têm
 * prioridade: a carta do Admin é a primeira a ser cortada.
 */
function meuDeck(): { deck: string[]; aviso: string | null } {
  const extras = cartas.map((c) => c.id);
  const base = deckPadrao();
  if (base.length + extras.length <= DECK_MAXIMO) {
    return { deck: [...base, ...extras], aviso: null };
  }
  const cabe = Math.max(0, DECK_MAXIMO - base.length);
  return {
    deck: [...base, ...extras.slice(0, cabe)],
    aviso: `deck grande demais: ${extras.length} cartas do Admin, couberam ${cabe} (limite ${DECK_MAXIMO}).`,
  };
}

function aviso(mensagem: string): void {
  estado = { ...estado, log: [...estado.log, `⚠ ${mensagem}`].slice(-60) };
  render();
}

function render(): void {
  // As setas vivem no `body` (para poderem pointer-events: none e
  // não serem presas dentro do #app), então precisam ser removidas
  // aqui — `app.innerHTML = ''` não as alcançaria.
  for (const seta of document.querySelectorAll('.seta-ataque, .vulto, .fogo-hp')) {
    seta.remove();
  }
  app.innerHTML = '';
  const layout = document.createElement('div');
  layout.className = 'layout';
  layout.append(logPanel(), centroPainel(), detalhesPanel());
  app.append(hud(), layout);
  if (adminAberto) app.append(adminPanel());
  if (animacao) aplicarAnimacao();
  if (selecionado) aplicarSeta();
}

// --- HUD ---------------------------------------------------------------

function hud(): HTMLElement {
  const bar = document.createElement('header');
  bar.className = 'hud';

  const turno = document.createElement('div');
  turno.className = 'turno';
  turno.innerHTML = `<strong>Turno ${estado.turno}</strong><span>vez do ${estado.vez === 0 ? 'Jogador 1' : 'Oponente'}</span>`;

  const placar = document.createElement('div');
  placar.className = 'placar';
  for (const lado of [0, 1] as const) {
    const pl = document.createElement('div');
    pl.className = 'lp';
    pl.dataset.lado = String(lado);
    pl.innerHTML = `
      <span class="nome">${lado === 0 ? 'Você' : 'Oponente'}</span>
      <span class="lp-num">${estado.lp[lado]}</span>
      <span class="level">Lv ${estado.levelPartida[lado]}</span>
      <span class="dano">${estado.danoRecebido[lado]} dano sofrido</span>`;

    // Marcas presas ao jogador (ex.: "ataque direto liberado").
    if (estado.marcas[lado]!.length > 0) {
      const faixa = document.createElement('span');
      faixa.className = 'marcas marcas-jogador';
      for (const marca of estado.marcas[lado]!) {
        const icone = document.createElement('span');
        icone.className = `marca ${marca.efeito}`;
        icone.textContent = ICONE_MARCA[marca.efeito] ?? '•';
        icone.title = `${TITULO_MARCA[marca.efeito] ?? marca.efeito}`;
        faixa.append(icone);
      }
      pl.append(faixa);
    }

    // O HP só fica "alvejável" com um atacante selecionado E quando o
    // direto é legal (campo inimigo sem nenhuma carta).
    if (lado === 1 && selecionado && estado.fase === 'combate' && estado.vez === 0) {
      if (motivoNaoPodeAtacar(estado, 0, selecionado, { tipo: 'jogador' }) === null) {
        pl.classList.add('alvejavel');
        pl.title = 'Clique para atacar a vida diretamente';
        pl.addEventListener('click', () => tentarAtaque(selecionado!, { tipo: 'jogador' }));
      } else {
        pl.classList.add('bloqueado');
        pl.title = 'O oponente tem criaturas no campo: ataque uma carta';
      }
    }
    placar.append(pl);
  }

  const acoes = document.createElement('div');
  acoes.className = 'acoes';
  // Botão de ajuda: leva ao guia com as regras e o roadmap.
  const botaoAjuda = document.createElement('a');
  botaoAjuda.className = 'botao-ajuda';
  botaoAjuda.href = './tutorial.html';
  botaoAjuda.title = 'Como jogar — regras, pilhas, combate e roadmap';
  botaoAjuda.textContent = '?';
  const botaoAdmin = document.createElement('button');
  botaoAdmin.className = 'botao-sec';
  botaoAdmin.textContent = 'Admin';
  botaoAdmin.addEventListener('click', () => {
    adminAberto = !adminAberto;
    render();
  });
  const botaoNovo = document.createElement('button');
  botaoNovo.className = 'botao-sec';
  botaoNovo.textContent = 'Novo duelo';
  botaoNovo.addEventListener('click', () => {
    estado = novoDuelo();
    selecionado = null;
    naMao = null;
    jogando = null;
    custoPilha = null;
    detalheUid = null;
    render();
  });
  const botaoFase = document.createElement('button');
  botaoFase.className = 'botao-turno';
  botaoFase.textContent = estado.vencedor !== null ? 'Duelo encerrado' : proximoRotulo();
  botaoFase.disabled = estado.vencedor !== null;
  botaoFase.addEventListener('click', () => {
    if (estado.vencedor !== null) return;
    avancarFase();
  });
  acoes.append(botaoAjuda, botaoAdmin, botaoNovo, botaoFase);

  bar.append(turno, placar, acoes);
  if (estado.vencedor !== null) {
    const fim = document.createElement('div');
    fim.className = 'fim-duelo';
    fim.textContent = estado.vencedor === 0 ? '🏆 Você venceu!' : '💀 Oponente venceu!';
    bar.append(fim);
  }
  return bar;
}

function proximoRotulo(): string {
  return estado.fase === 'fim' ? 'Passar turno' : 'Próxima fase';
}

/** Avança a fase; se a vez passar para a IA, ela joga com tempo. */
async function avancarFase(): Promise<void> {
  selecionado = null;
  naMao = null;
  jogando = null;
  custoPilha = null;
  estado = proximaFase(estado).estado;
  render();
  if (estado.vez === 1 && estado.vencedor === null) await iaComDelays();
}

/** Quanto a UI espera por etapa da IA (ms). */
const ESPERA_IA: Record<EtapaIA, number> = {
  compra: 900,
  invocou: 800,
  atacou: 1100,
  passou: 500,
};

/** Roda a IA em passos, redesenhando e esperando entre cada um. */
async function iaComDelays(): Promise<void> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const gen = iaPassos(estado);
  for (;;) {
    const passo = gen.next();
    if (passo.done) {
      estado = passo.value;
      break;
    }
    estado = passo.value.estado;
    render();
    await sleep(ESPERA_IA[passo.value.etapa]);
  }
  render();
}

// --- Centro ------------------------------------------------------------

function centroPainel(): HTMLElement {
  const centro = document.createElement('div');
  centro.className = 'centro';

  // Oponente: deck na ESQUERDA, campo ao lado.
  const inimigo = document.createElement('div');
  inimigo.className = 'lado inimigo';
  inimigo.append(deckDo(1), campoDo(1));

  // Jogador: campo ao lado, deck na DIREITA (espelhado).
  const jogador = document.createElement('div');
  jogador.className = 'lado jogador';
  jogador.append(campoDo(0), deckDo(0));

  centro.append(inimigo, barraFases(), jogador, maoDo());
  return centro;
}

/** Separador de fases — fica ENTRE os dois campos. */
function barraFases(): HTMLElement {
  const barra = document.createElement('nav');
  barra.className = 'fases';
  for (const fase of FASES_ORDEM) {
    const el = document.createElement('span');
    el.className = 'fase' + (estado.fase === fase ? ' ativa' : '');
    el.textContent = nomeFase(fase);
    if (estado.fase === fase) el.title = descricaoFase(fase);
    barra.append(el);
  }
  const legenda = document.createElement('span');
  legenda.className = 'fase-legenda';
  legenda.textContent = `${estado.vez === 0 ? 'Sua vez' : 'Vez do oponente'} — ${descricaoFase(estado.fase)}`;
  barra.append(legenda);
  return barra;
}

function nomeFase(fase: string): string {
  switch (fase) {
    case 'compra': return 'Compra';
    case 'principal': return 'Principal';
    case 'combate': return 'Combate';
    case 'finalizacao': return 'Finalização';
    case 'fim': return 'Fim';
    default: return fase;
  }
}

function descricaoFase(fase: string): string {
  switch (fase) {
    case 'compra': return 'clique no seu deck para comprar 1 carta';
    case 'principal': return 'clique numa carta da mão e depois na pilha que vai receber';
    case 'combate': return 'clique na sua carta ativa e depois no alvo (ou na vida, se o campo inimigo estiver vazio)';
    case 'finalizacao': return 'avance sem ações';
    case 'fim': return 'última olhada — passe o turno';
    default: return '';
  }
}

// --- Deck --------------------------------------------------------------

function deckDo(lado: Jogador): HTMLElement {
  const sec = document.createElement('section');
  sec.className = 'deck';
  const titulo = document.createElement('h2');
  titulo.textContent = `${lado === 0 ? 'Seu deck' : 'Deck inimigo'} (${estado.deck[lado]!.length})`;
  sec.append(titulo);

  const pilha = document.createElement('div');
  pilha.className = 'deck-pilha';
  const verso = document.createElement('div');
  verso.className = 'carta deck-carta';
  verso.innerHTML = `<span class="deck-verso">🂠</span><span class="deck-texto">${lado === 0 ? 'Comprar' : 'Oponente'}</span>`;
  const podeComprar = lado === 0 && estado.fase === 'compra' && estado.vez === 0 && estado.vencedor === null;
  if (podeComprar) {
    verso.classList.add('clicavel');
    verso.addEventListener('click', () => {
      selecionado = null;
      naMao = null;
      estado = comprarCarta(estado, 0).estado;
      render();
    });
  }
  pilha.append(verso);
  sec.append(pilha);
  return sec;
}

// --- Campo (pilhas) ----------------------------------------------------

function campoDo(lado: Jogador): HTMLElement {
  const sec = document.createElement('section');
  sec.className = 'campo lado-' + lado;
  const titulo = document.createElement('h2');
  titulo.textContent = lado === 0 ? 'Seu campo' : 'Campo inimigo';
  sec.append(titulo);

  const zonas = document.createElement('div');
  // O campo inimigo é espelhado para os dois lados ficarem simétricos.
  zonas.className = 'zonas' + (lado === 1 ? ' espelhado' : '');
  for (let i = 0; i < estado.campo[lado]!.length; i++) {
    zonas.append(pilhaElemento(lado, i, estado.campo[lado]![i]!));
  }
  sec.append(zonas);
  return sec;
}

/** Uma zona do campo: a pilha de cartas, da de baixo para a de cima. */
function pilhaElemento(lado: Jogador, indice: number, pilha: Pilha): HTMLElement {
  const zona = document.createElement('div');
  const ativa = cartaAtiva(pilha);
  zona.className = 'zona';
  zona.dataset.zona = String(indice);
  zona.dataset.lado = String(lado);
  if (pilha.length === 0) zona.classList.add('vazia');
  if (ativa && selecionado && estado.fase === 'combate' && lado === 1) {
    if (motivoNaoPodeAtacar(estado, 0, selecionado, { tipo: 'carta', uid: ativa.uid }) === null) {
      zona.classList.add('alvo-valido');
    }
  }

  const marco = document.createElement('span');
  marco.className = 'pilha-marca';
  marco.textContent = pilha.length > 0 ? `P${indice + 1} · ${pilha.length} carta${pilha.length > 1 ? 's' : ''}` : `P${indice + 1}`;
  zona.append(marco);
  // a caixa da pilha cresce junto com o conteúdo (ver `.zona` no CSS)
  zona.style.setProperty('--altura-pilha', String(Math.max(1, pilha.length)));

  if (pilha.length === 0) {
    const vazio = document.createElement('span');
    vazio.className = 'pilha-vazia';
    vazio.textContent = naMao !== null && lado === 0 ? 'crave aqui' : '';
    zona.append(vazio);
    if (naMao !== null && lado === 0) {
      zona.classList.add('destino');
      zona.addEventListener('click', () => empilhar(lado, indice));
    }
    return zona;
  }

  // Alvo de mecânica: pilha inteira (remover levels, rodar, espelhar)
  // ou, na Reação, a pilha que vai pagar o custo.
  if (pilhaAlvoValida(lado, indice)) {
    zona.classList.add('destino');
    if (jogandoEhReacao()) {
      zona.addEventListener('click', () => {
        custoPilha = indice;
        render();
      });
    } else {
      zona.addEventListener('click', () => jogarEfeito({ zona: indice }));
    }
  }

  // Cada carta da pilha: as de baixo ficam "enfiadas" atrás.
  const altura = pilha.length;
  for (let i = 0; i < altura; i++) {
    const instancia = pilha[i]!;
    const el = cartaElemento(lado, instancia, {
      ativa: i === indiceAtivo(pilha),
      profundidade: altura - 1 - i,
      zona: indice,
    });
    el.style.setProperty('--prof', String(i));
    zona.append(el);
  }
  return zona;
}

/** Uma carta em campo (ativa ou enfiada na pilha). */
function cartaElemento(
  lado: Jogador,
  instancia: Instancia,
  info: { ativa: boolean; profundidade: number; zona: number },
): HTMLElement {
  const carta = CARTAS_POR_ID[instancia.cartaId]!;
  const el = document.createElement('div');
  el.className = `carta vertical ${RARITY_CLASS[carta.raridade]}`;
  el.dataset.uid = instancia.uid;
  el.dataset.prof = String(info.profundidade);
  if (!info.ativa) el.classList.add('enterrada');
  if (instancia.atacou && info.ativa) el.classList.add('atacou');
  if (selecionado === instancia.uid) el.classList.add('selecionada');
  if (detalheUid === instancia.uid) el.classList.add('vendo');
  el.innerHTML = `
    <span class="carta-nome">${carta.nome}</span>
    <span class="carta-nivel">Nv ${carta.nivel}</span>
    <span class="carta-stats">
      <b class="atk">⚔ ${carta.atk}</b>
      <b class="def">🛡 ${carta.def}</b>
    </span>`;
  el.title =
    `${carta.nome} — nível ${carta.nivel}\n` +
    (info.ativa ? 'carta ativa da pilha' : `enterrada na pilha ${info.zona + 1}`) +
    ' — clique para ver detalhes';

  // Marcas deixadas por cartas de Ação/Reação (ícones no canto).
  const marcas = marcasDe(instancia);
  if (marcas.length > 0) {
    const faixa = document.createElement('span');
    faixa.className = 'marcas';
    for (const marca of marcas) {
      const icone = document.createElement('span');
      icone.className = `marca ${marca.efeito}`;
      icone.textContent = ICONE_MARCA[marca.efeito] ?? '•';
      icone.title = `${TITULO_MARCA[marca.efeito] ?? marca.efeito} — some na finalização do turno ${marca.expiraEmTurno}`;
      faixa.append(icone);
    }
    el.append(faixa);
  }

  // Clique na carta: SEMPRE mostra os detalhes. O que acontece
  // depois depende de onde ela está e da fase:
  //   - combate, minha carta ativa → seleciona como atacante;
  //   - combate, carta ativa do inimigo → ataca;
  //   - o resto → só os detalhes.
  // Alternar ataque/defesa fica no badge ⚔/🛡, não no clique da
  // carta (senão "ver detalhes" virava "mudar de modo").
  el.addEventListener('click', (ev) => {
    ev.stopPropagation();
    // Alvo de mecânica jogada da mão.
    const jaMarcada = marcasDe(instancia).length > 0;
    if (info.ativa && cartaAlvoValida(lado, instancia, jaMarcada)) {
      detalheUid = instancia.uid;
      const escolha: EscolhaAlvo = { alvoUid: instancia.uid };
      // Reação custa 1 level de uma pilha sua.
      if (jogandoEhReacao()) escolha.pilhaCusto = custoPilha ?? undefined;
      jogarEfeito(escolha);
      return;
    }
    const selecionandoAtacante =
      lado === 0 && info.ativa && estado.fase === 'combate' && estado.vez === 0;
    if (selecionandoAtacante) {
      selecionado = selecionado === instancia.uid ? null : instancia.uid;
    } else if (lado === 1 && info.ativa && selecionado && estado.fase === 'combate') {
      tentarAtaque(selecionado, { tipo: 'carta', uid: instancia.uid });
      return;
    }
    detalheUid = instancia.uid;
    render();
  });

  if (lado === 0 && info.ativa) {
    const modo = document.createElement('span');
    modo.className = `modo ${instancia.modo}`;
    modo.textContent = instancia.modo === 'ataque' ? '⚔' : '🛡';
    modo.title = `Modo ${instancia.modo} — clique para alternar`;
    if (estado.fase === 'combate') {
      modo.title = `Modo ${instancia.modo} — o modo só muda na fase principal`;
    }
    modo.addEventListener('click', (ev) => {
      ev.stopPropagation();
      detalheUid = instancia.uid;
      if (estado.fase !== 'principal') {
        render();
        aviso('O modo ataque/defesa só muda na fase principal');
        return;
      }
      trocarModo(instancia.uid);
    });
    el.append(modo);
  }
  return el;
}

// --- Mão ----------------------------------------------------------------

function maoDo(): HTMLElement {
  const mao = document.createElement('section');
  mao.className = 'mao';
  const label = document.createElement('h2');
  label.textContent = `Sua mão (${estado.mao[0]!.length})`;
  mao.append(label);
  const lista = document.createElement('div');
  lista.className = 'mao-lista';
  for (const uid of estado.mao[0]!) {
    const carta = CARTAS_POR_ID[cartaIdDe(uid)]!;
    const el = document.createElement('div');
    el.className = `carta vertical na-mao ${RARITY_CLASS[carta.raridade]}`;
    if (detalheUid === uid) el.classList.add('vendo');
    if (naMao === uid || jogando === uid) el.classList.add('selecionada');
    el.dataset.uid = uid;

    // Cartas de Ação/Reação não têm ATK/DEF: mostram o tipo e a
    // descrição da mecânica no lugar dos números.
    const efeito = carta.cartaMecanica;
    const ehEfeito = carta.tipo === 'acao' || carta.tipo === 'reacao';
    el.innerHTML = `
      <span class="carta-nome">${carta.nome}</span>
      <span class="carta-nivel">Nv ${carta.nivel}</span>
      ${ehEfeito ? `<span class="carta-desc">${explicarMecanica(efeito!)}</span>` : ''}
      <span class="carta-stats">${
        ehEfeito
          ? ''
          : `<b class="atk">⚔ ${carta.atk}</b><b class="def">🛡 ${carta.def}</b>`
      }</span>
      ${
        ehEfeito
          ? `<span class="carta-tipo ${carta.tipo}">${
              carta.tipo === 'acao' ? 'Carta de Ação' : 'Carta de Reação'
            }</span>`
          : ''
      }`;
    el.title = ehEfeito
      ? `${carta.nome}\n${explicarMecanica(efeito!)}\n` +
        `Nível ${carta.nivel} — você está em Lv ${estado.levelPartida[0]}`
      : `Nível ${carta.nivel} — você está em Lv ${estado.levelPartida[0]}\n` +
        'clique para ver detalhes; na fase principal, escolha e clique numa pilha';

    el.addEventListener('click', () => {
      detalheUid = uid;
      if (ehEfeito) {
        escolherEfeito(uid);
        return;
      }
      if (estado.fase !== 'principal') {
        render();
        return;
      }
      const candidatas = pilhasQueAceitam(estado, 0, carta.nivel);
      if (candidatas.length === 0) {
        naMao = null;
        render();
        aviso(
          `Nenhuma pilha aceita nível ${carta.nivel} agora. ` +
            (carta.nivel === 0
              ? 'Comece empilhando uma carta de nível 0.'
              : `Você precisa empilhar até o nível ${carta.nivel - 1} antes desta.`),
        );
        return;
      }
      // Se só uma pilha serve, empilha direto; se várias, deixa escolher.
      if (candidatas.length === 1) {
        naMao = null;
        empilhar(0, candidatas[0]!);
        return;
      }
      naMao = naMao === uid ? null : uid;
      render();
    });
    lista.append(el);
  }
  mao.append(lista);
  return mao;
}

// --- Cartas de Ação / Reação -------------------------------------------

/**
 * Escolhe (ou desiste de escolher) uma carta de efeito da mão.
 * Quando está escolhida, a mesa pinta os alvos legais.
 *
 * Reação tem dois passos: primeiro a pilha que paga o custo, depois
 * a carta a proteger. Por isso `custoPilha` fica guardado aqui.
 */
function escolherEfeito(uid: string): void {
  if (jogando === uid) {
    jogando = null;
    custoPilha = null;
    render();
    return;
  }
  const carta = CARTAS_POR_ID[cartaIdDe(uid)]!;
  if (carta.tipo === 'acao' && estado.fase !== 'principal') {
    render();
    aviso('Carta de Ação só pode ser usada na fase Principal');
    return;
  }
  if (carta.tipo === 'reacao' && estado.fase !== 'combate') {
    render();
    aviso('Carta de Reação só pode ser usada na fase de Combate');
    return;
  }
  if (estado.levelPartida[0]! < carta.nivel) {
    render();
    aviso(`Seu level (${estado.levelPartida[0]}) não alcança o nível ${carta.nivel} dessa carta`);
    return;
  }
  if (carta.tipo === 'reacao' && pilhasComCarta().length === 0) {
    render();
    aviso('Reação custa 1 level: você precisa ter uma pilha com carta para pagar');
    return;
  }
  jogando = uid;
  naMao = null;
  custoPilha = null;
  render();
}

/** Usa a carta escolhida com o alvo dado. */
function jogarEfeito(escolha: EscolhaAlvo): void {
  if (!jogando) return;
  const uid = jogando;
  try {
    estado = usarCartaDeEfeito(estado, 0, uid, escolha).estado;
    jogando = null;
    custoPilha = null;
    selecionado = null;
    render();
  } catch (e) {
    jogando = null;
    custoPilha = null;
    render();
    aviso(e instanceof Error ? e.message : String(e));
  }
}

/** Índices das suas pilhas que têm pelo menos uma carta. */
function pilhasComCarta(): number[] {
  const saida: number[] = [];
  for (let z = 0; z < estado.campo[0]!.length; z++) {
    if (estado.campo[0]![z]!.length > 0) saida.push(z);
  }
  return saida;
}

/** A carta em jogo é uma Reação (que precisa pagar custo)? */
function jogandoEhReacao(): boolean {
  return jogando !== null && CARTAS_POR_ID[cartaIdDe(jogando)]?.tipo === 'reacao';
}

/** A pilha é alvo legal para a mecânica em jogo? */
function pilhaAlvoValida(lado: Jogador, zona: number): boolean {
  if (!jogando) return false;
  const mec = CARTAS_POR_ID[cartaIdDe(jogando)]!.cartaMecanica!;
  // Reação: primeiro passo é escolher a pilha que paga o custo.
  if (jogandoEhReacao()) {
    return lado === 0 && custoPilha === null && estado.campo[0]![zona]!.length > 0;
  }
  if (mec.alvo === 'pilha-inimiga') return lado === 1;
  if (mec.alvo === 'pilha-sua') return lado === 0;
  return false;
}

/**
 * Uma carta é alvo legal? `proteger` protege a SUA carta ativa;
 * `silenciar` e `desarmar` miram na carta ativa do INIMIGO.
 */
function cartaAlvoValida(lado: Jogador, ativa: Instancia | null, marcada: boolean): boolean {
  if (!jogando || !ativa) return false;
  // Reação só vira jogável depois de escolher quem paga o custo.
  if (jogandoEhReacao() && custoPilha === null) return false;
  const mec = CARTAS_POR_ID[cartaIdDe(jogando)]!.cartaMecanica!;
  if (mec.alvo === 'carta-sua') return lado === 0 && !marcada;
  if (mec.alvo === 'carta-inimiga') return lado === 1 && !marcada;
  return false;
}

// --- Ações --------------------------------------------------------------

/** Empilha a carta escolhida na mão (`naMao`) na pilha `zona`. */
function empilhar(lado: Jogador, zona: number): void {
  if (naMao === null) return;
  const uid = naMao;
  const motivo = motivoNaoPodeInvocar(estado, lado, uid, zona);
  if (motivo) {
    naMao = null;
    aviso(motivo);
    return;
  }
  selecionado = null;
  naMao = null;
  estado = invocar(estado, lado, uid, zona).estado;
  render();
}

/** Alterna o modo da carta ativa entre ataque e defesa. */
function trocarModo(uid: string): void {
  try {
    estado = alternarModo(estado, 0, uid).estado;
  } catch (e) {
    aviso(e instanceof Error ? e.message : String(e));
    return;
  }
  render();
}

function tentarAtaque(uid: string, alvo: Alvo): void {
  const motivo = motivoNaoPodeAtacar(estado, 0, uid, alvo);
  if (motivo) {
    aviso(motivo);
    return;
  }
  selecionado = null;
  estado = atacar(estado, 0, uid, alvo).estado;
  animacao =
    alvo.tipo === 'carta'
      ? { tipo: 'vulto', de: uid, para: alvo.uid }
      : { tipo: 'fogo', de: uid, para: 'hp1' };
  render();
  setTimeout(() => {
    animacao = null;
    render();
  }, 750);
}

// --- Setas e animações ---------------------------------------------------

/** Desenha a seta do atacante até o alvo selecionado (ou o HP). */
function aplicarSeta(): void {
  if (!selecionado) return;
  const de = app.querySelector<HTMLElement>(`[data-uid="${selecionado}"]`);
  if (!de) return;

  const emCombate = estado.fase === 'combate' && estado.vez === 0;
  let destino: HTMLElement | null = null;
  if (emCombate && motivoNaoPodeAtacar(estado, 0, selecionado, { tipo: 'jogador' }) === null) {
    destino = app.querySelector<HTMLElement>('.lp[data-lado="1"]');
  }
  if (!destino) {
    for (const zona of app.querySelectorAll<HTMLElement>('.campo.lado-1 .zona')) {
      const ativa = zona.querySelector<HTMLElement>('.carta:not(.enterrada)');
      if (ativa) {
        destino = ativa;
        break;
      }
    }
  }
  if (!destino) return;

  const a = de.getBoundingClientRect();
  const b = destino.getBoundingClientRect();
  const seta = document.createElement('div');
  seta.className = 'seta-ataque';
  seta.style.left = `${a.left + a.width / 2}px`;
  seta.style.top = `${a.top + a.height / 2}px`;
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const comprimento = Math.hypot(dx, dy);
  const angulo = (Math.atan2(dy, dx) * 180) / Math.PI;
  seta.style.setProperty('--comprimento', `${comprimento}px`);
  seta.style.setProperty('--angulo', `${angulo}deg`);
  document.body.append(seta);
}

/** Efeito visual do golpe: vulto na carta ou fogo no HP. */
function aplicarAnimacao(): void {
  if (!animacao) return;
  const { tipo, de, para } = animacao;
  const deEl = app.querySelector<HTMLElement>(`[data-uid="${de}"]`);
  if (!deEl) return;

  if (tipo === 'vulto') {
    const paraEl = app.querySelector<HTMLElement>(`[data-uid="${para}"]`);
    if (!paraEl) return;
    const a = deEl.getBoundingClientRect();
    const b = paraEl.getBoundingClientRect();
    const vulto = document.createElement('div');
    vulto.className = 'vulto';
    vulto.style.left = `${a.left + a.width / 2}px`;
    vulto.style.top = `${a.top + a.height / 2}px`;
    document.body.append(vulto);
    requestAnimationFrame(() => {
      vulto.style.transform = `translate(${b.left + b.width / 2 - a.left - a.width / 2}px, ${b.top + b.height / 2 - a.top - a.height / 2}px)`;
      vulto.style.opacity = '0';
    });
    setTimeout(() => vulto.remove(), 700);
  }

  if (tipo === 'fogo') {
    const hpEl = app.querySelector<HTMLElement>('[data-lado="1"]');
    if (!hpEl) return;
    const fogo = document.createElement('div');
    fogo.className = 'fogo-hp';
    fogo.textContent = '🔥';
    hpEl.append(fogo);
    setTimeout(() => fogo.remove(), 750);
  }
}

// --- Log ----------------------------------------------------------------

function logPanel(): HTMLElement {
  const aside = document.createElement('aside');
  aside.className = 'log';
  const titulo = document.createElement('h3');
  titulo.textContent = 'Log do duelo';
  aside.append(titulo);
  const lista = document.createElement('ol');
  for (const linha of estado.log.slice(-24)) {
    const li = document.createElement('li');
    li.textContent = linha;
    lista.append(li);
  }
  aside.append(lista);
  const info = document.createElement('p');
  info.className = 'regra';
  info.textContent =
    'PILHAS: cada zona do campo é uma pilha. Só a carta de cima está ativa. ' +
    'Para invocar, o nível tem que subir de 1 em 1: pilha vazia aceita só nível 0, ' +
    'depois nível 1, e assim por diante — para ter uma carta nível 8 ativa é preciso ' +
    'ter de 0 a 7 embaixo. As de baixo ficam guardadas para consultas e efeitos futuros.' +
    'COMBATE: se o ATK do atacante passar a DEF do alvo, o alvo é destruído e a diferença ' +
    'vai para a vida de quem perdeu; se a DEF for maior, o atacante morre e leva a diferença ' +
    'para a vida. Contra alvo em DEFESA: DEF maior rebate a diferença no atacante, ATK maior ' +
    'destrói o alvo sem causar dano. Só se ataca a vida direto com o campo inimigo VAZIO.';
  aside.append(info);
  return aside;
}

// --- Detalhes -----------------------------------------------------------

function detalhesPanel(): HTMLElement {
  const aside = document.createElement('aside');
  aside.className = 'detalhes';
  const titulo = document.createElement('h3');
  titulo.textContent = 'Detalhes da carta';
  aside.append(titulo);

  if (!detalheUid) {
    const vazio = document.createElement('p');
    vazio.className = 'detalhes-vazio';
    vazio.textContent = 'Clique em qualquer carta — da mão, do topo da pilha ou de uma carta enterrada — para ver aqui, ampliada.';
    aside.append(vazio);
    return aside;
  }

  const carta = CARTAS_POR_ID[cartaIdDe(detalheUid)];
  if (!carta) {
    const vazio = document.createElement('p');
    vazio.className = 'detalhes-vazio';
    vazio.textContent = 'Carta não encontrada.';
    aside.append(vazio);
    return aside;
  }

  // Onde essa carta está (pilha/altura) — consultas de pilha.
  const onde = situacaoDaCarta(detalheUid);

  const ampliada = document.createElement('div');
  ampliada.className = `carta vertical ampliada ${RARITY_CLASS[carta.raridade]}`;
  ampliada.innerHTML = `
    <span class="carta-nome">${carta.nome}</span>
    <span class="carta-nivel">Nv ${carta.nivel}</span>
    <span class="carta-arte" aria-hidden="true">🂠</span>
    <span class="carta-desc">${carta.descricao}</span>
    <span class="carta-stats">
      <b class="atk">⚔ ${carta.atk}</b>
      <b class="def">🛡 ${carta.def}</b>
      <b class="eva">💨 ${carta.eva}%</b>
    </span>`;
  aside.append(ampliada);

  const info = document.createElement('dl');
  info.className = 'detalhes-info';
  info.innerHTML = `
    <dt>Raridade</dt><dd>${carta.raridade}</dd>
    <dt>Nível</dt><dd>${carta.nivel} (exige Lv ${carta.nivel}; você está em Lv ${estado.levelPartida[0]})</dd>
    <dt>ATK</dt><dd>${carta.atk}</dd>
    <dt>DEF</dt><dd>${carta.def}</dd>
    <dt>EVA</dt><dd>${carta.eva}% (reservada para efeitos)</dd>
    <dt>Situação</dt><dd>${onde}</dd>`;
  aside.append(info);
  return aside;
}

/** Texto de onde a carta está (mão, pilha e altura, ou=dead). */
function situacaoDaCarta(uid: string): string {
  if (estado.mao[0]!.includes(uid)) return 'na sua mão';
  for (let z = 0; z < estado.campo[0]!.length; z++) {
    const pilha = estado.campo[0]![z]!;
    const h = pilha.findIndex((i) => i.uid === uid);
    if (h !== -1) {
      return h === indiceAtivo(pilha)
        ? `pilha ${z + 1}, carta ATIVA (topo)`
        : `pilha ${z + 1}, carta enterrada (posição ${h + 1} de baixo)`;
    }
  }
  for (let z = 0; z < estado.campo[1]!.length; z++) {
    const pilha = estado.campo[1]![z]!;
    const h = pilha.findIndex((i) => i.uid === uid);
    if (h !== -1) {
      return h === indiceAtivo(pilha)
        ? `campo inimigo, pilha ${z + 1}, ATIVA`
        : `campo inimigo, pilha ${z + 1}, enterrada`;
    }
  }
  if (estado.cementerio[0]!.includes(uid)) return 'no seu cemitério';
  return 'no deck';
}

// --- Admin --------------------------------------------------------------

/**
 * Monta a `cartaMecanica` a partir do formulário do Admin. O alvo,
 * os efeitos e a faixa saem da ficha da mecânica — o Admin só
 * escolhe qual mecânica e qual valor.
 */
function cartaMecanicaDoFormulario(
  mecanica: string,
  valor: number,
): CartaMecanica | undefined {
  const ficha = OPCOES_MECANICA.find((m) => m.valor === mecanica);
  if (!ficha) return undefined;
  return {
    mecanica: ficha.valor,
    valor,
    alvo: ficha.alvo,
    efeitos: efeitosPadraoDe(ficha.valor),
    faixa: faixaPadraoDe(ficha.valor),
    unico: mecanicaUnica(ficha.valor),
  };
}

/** Marcas que a mecânica deixa, por padrão. */
function efeitosPadraoDe(mec: Mecanica): EfeitoMarca[] {
  switch (mec) {
    case 'silenciar':
      return ['silencio'];
    case 'desarmar':
    case 'espelhar-modo':
    case 'trocar-topo':
      return ['espelho'];
    case 'congelar-level':
      return ['trava'];
    case 'abrir-vida':
      return ['abrir-vida'];
    case 'proteger':
      return ['escudo'];
    case 'remover-niveis':
      return ['fratura'];
    default:
      return [];
  }
}

/** Faixa de poder a partir do próprio valor da mecânica. */
function faixaPadraoDe(mec: Mecanica): Faixa {
  switch (mec) {
    case 'remover-niveis':
    case 'cavar-level':
    case 'desarmar':
    case 'congelar-level':
    case 'abrir-vida':
      return 'forte';
    case 'proteger':
    case 'silenciar':
      return 'defesa';
    case 'espelhar-modo':
    case 'empilhar-rapido':
    case 'trocar-topo':
      return 'media';
    case 'rodar-pilha':
    case 'ressuscitar':
    case 'dano-direto':
      return 'utilitaria';
    default:
      return 'forte';
  }
}

/** Só pode existir uma marca igual no mesmo alvo? */
function mecanicaUnica(mec: Mecanica): boolean {
  return (
    mec === 'remover-niveis' ||
    mec === 'silenciar' ||
    mec === 'desarmar' ||
    mec === 'espelhar-modo' ||
    mec === 'congelar-level' ||
    mec === 'abrir-vida' ||
    mec === 'proteger'
  );
}

function adminPanel(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'admin-overlay';
  const painel = document.createElement('div');
  painel.className = 'admin';

  const titulo = document.createElement('h2');
  titulo.textContent = 'Admin — cadastrar cartas';
  painel.append(titulo);

  const form = document.createElement('form');
  form.className = 'admin-form';
  form.append(
    campoSelect('tipo', 'Tipo de carta', ['criatura', 'acao', 'reacao']),
    campoTexto('nome', 'Nome da carta', 'Ex: Cavaleiro do Abismo'),
    campoTexto('descricao', 'Descrição', 'Ex: Jurou lealdade ao trono de ruínas.'),
    campoSelect('raridade', 'Raridade', ['comum', 'incomum', 'raro', 'epico', 'lendario']),
    campoNumero('nivel', 'Nível exigido (0-8)', 0, 8),
    campoNumero('atk', 'ATK', 0, 99999),
    campoNumero('def', 'DEF', 0, 99999),
    campoNumero('eva', 'EVA (reservada p/ efeitos)', 0, 100),
  );

  // Bloco só das cartas de efeito: mecânica + quanto ela tira.
  const blocoEfeito = document.createElement('div');
  blocoEfeito.className = 'admin-efeito';
  const selectMecanica = campoSelect(
    'mecanica',
    'Mecânica (o que a carta faz)',
    OPCOES_MECANICA.map((m) => m.valor),
  );
  const ajudaMecanica = document.createElement('p');
  ajudaMecanica.className = 'admin-ajuda';
  const campoValor = campoNumero('valor', 'Valor (quantos níveis / quanto dano / quantos alvos)', 1, 9999);
  blocoEfeito.append(selectMecanica, ajudaMecanica, campoValor);
  form.append(blocoEfeito);

  const rotulos: Record<string, string> = {
    'remover-niveis': 'Remover níveis',
    'rodar-pilha': 'Rodar a pilha',
    'trocar-topo': 'Trocar topo e fundo',
    silenciar: 'Silenciar',
    desarmar: 'Desarmar',
    'espelhar-modo': 'Espelhar modo',
    'empilhar-rapido': 'Empilhar rápido',
    ressuscitar: 'Ressuscitar',
    'dano-direto': 'Dano direto',
    'cavar-level': 'Cavar level',
    'congelar-level': 'Congelar level',
    'abrir-vida': 'Abrir a vida',
    proteger: 'Proteger',
  };
  const opcoesMecanica = [...selectMecanica.querySelectorAll('select')][0]!;
  for (const op of [...opcoesMecanica.options]) op.textContent = rotulos[op.value] ?? op.value;

  /** Mostra/esconde os campos que só servem a criaturas e a efeitos. */
  const sincronizarTipo = (): void => {
    const tipo = String(new FormData(form).get('tipo') ?? 'criatura');
    const ehCriatura = tipo === 'criatura';
    for (const nomeCampo of ['atk', 'def', 'eva']) {
      const campo = form.querySelector<HTMLElement>(`[data-campo="${nomeCampo}"]`);
      if (campo) campo.hidden = !ehCriatura;
    }
    blocoEfeito.hidden = ehCriatura;
    const mec = String(new FormData(form).get('mecanica') ?? '');
    const ficha = OPCOES_MECANICA.find((m) => m.valor === mec);
    ajudaMecanica.textContent = ficha
      ? `${ficha.ajuda} Alvo: ${ficha.alvo}.`
      : 'Escolha a mecânica para ver o que ela faz.';
  };
  form.addEventListener('change', sincronizarTipo);
  sincronizarTipo();

  const erro = document.createElement('p');
  erro.className = 'admin-erro';
  form.append(erro);

  const botoes = document.createElement('div');
  botoes.className = 'admin-botoes';
  const salvar = document.createElement('button');
  salvar.type = 'submit';
  salvar.className = 'botao-turno';
  salvar.textContent = 'Salvar carta';
  const fechar = document.createElement('button');
  fechar.type = 'button';
  fechar.className = 'botao-sec';
  fechar.textContent = 'Fechar';
  fechar.addEventListener('click', () => {
    adminAberto = false;
    render();
  });
  botoes.append(salvar, fechar);
  form.append(botoes);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const dados = new FormData(form);
    const tipo = String(dados.get('tipo') ?? 'criatura') as TipoCarta;
    const ehCriatura = tipo === 'criatura';
    const base = {
      id: idParaNome(String(dados.get('nome') ?? '')),
      nome: String(dados.get('nome') ?? '').trim(),
      descricao: String(dados.get('descricao') ?? '').trim(),
      raridade: String(dados.get('raridade') ?? 'comum') as Rarity,
      nivel: Number(dados.get('nivel') ?? 0),
    };
    // Criatura tem ATK/DEF/EVA; carta de efeito não tem nenhum dos
    // três e carrega uma mecânica no lugar.
    const carta: Partial<CartaTCG> = ehCriatura
      ? {
          ...base,
          atk: Number(dados.get('atk') ?? 0),
          def: Number(dados.get('def') ?? 0),
          eva: Number(dados.get('eva') ?? 0),
        }
      : {
          ...base,
          atk: 0,
          def: 0,
          eva: 0,
          tipo,
          cartaMecanica: cartaMecanicaDoFormulario(
            String(dados.get('mecanica') ?? ''),
            Number(dados.get('valor') ?? 1),
          ),
        };
    const motivo = cartaValida(
      carta,
      new Set([...Object.keys(CARTAS_POR_ID), ...cartas.map((c) => c.id)]),
    );
    if (motivo) {
      erro.textContent = motivo;
      return;
    }
    cartas = [...cartas, carta as CartaTCG];
    salvarCartas(cartas);
    erro.textContent = '';
    form.reset();
    render();
  });

  painel.append(form);
  painel.append(sincronizarPainel());
  painel.append(listaAdmin());
  overlay.append(painel);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      adminAberto = false;
      render();
    }
  });
  return overlay;
}

/** Painel Exportar/Importar — sincroniza localStorage ↔ JSON do repo. */
function sincronizarPainel(): HTMLElement {
  const sec = document.createElement('section');
  sec.className = 'admin-sync';
  const titulo = document.createElement('h3');
  titulo.textContent = 'Sincronizar com o GitHub';
  sec.append(titulo);

  const info = document.createElement('p');
  info.className = 'admin-sync-info';
  info.textContent =
    `Oficial: ${URL_CARTAS_OFICIAL}\n` +
    'Salve as cartas no localStorage, clique em Exportar, commite o JSON no repo e faça o deploy.';
  sec.append(info);

  const botoes = document.createElement('div');
  botoes.className = 'admin-botoes';

  const exportar = document.createElement('button');
  exportar.className = 'botao-sec';
  exportar.textContent = 'Exportar JSON';
  exportar.addEventListener('click', () => {
    const blob = new Blob([exportarJson(cartas)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cartas-admin.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  const importar = document.createElement('button');
  importar.className = 'botao-sec';
  importar.textContent = 'Importar JSON';
  const arquivo = document.createElement('input');
  arquivo.type = 'file';
  arquivo.accept = 'application/json';
  arquivo.style.display = 'none';
  arquivo.addEventListener('change', async () => {
    const file = arquivo.files?.[0];
    if (!file) return;
    try {
      const importadas = importarJson(await file.text());
      const ids = new Set(cartas.map((c) => c.id));
      const novas = importadas.filter((c) => !ids.has(c.id));
      cartas = [...cartas, ...novas];
      salvarCartas(cartas);
      aviso(`Importadas ${novas.length} cartas do arquivo.`);
      render();
    } catch (e) {
      aviso(`Erro ao importar: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  importar.addEventListener('click', () => arquivo.click());

  botoes.append(exportar, importar, arquivo);
  sec.append(botoes);
  return sec;
}

function listaAdmin(): HTMLElement {
  const sec = document.createElement('section');
  sec.className = 'admin-lista';
  const titulo = document.createElement('h3');
  titulo.textContent = `Suas cartas (${cartas.length}) — entram no seu deck`;
  sec.append(titulo);
  const lista = document.createElement('ul');
  for (const carta of cartas) {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${carta.nome}</strong> <span class="admin-stats">Nv ${carta.nivel} · ⚔${carta.atk} · 🛡${carta.def} · 💨${carta.eva}%</span>`;
    const remover = document.createElement('button');
    remover.className = 'botao-sec';
    remover.textContent = 'remover';
    remover.addEventListener('click', () => {
      cartas = cartas.filter((c) => c.id !== carta.id);
      salvarCartas(cartas);
      render();
    });
    li.append(remover);
    lista.append(li);
  }
  if (cartas.length === 0) {
    const vazio = document.createElement('li');
    vazio.className = 'admin-vazio';
    vazio.textContent = 'Nenhuma carta cadastrada ainda.';
    lista.append(vazio);
  }
  sec.append(lista);
  return sec;
}

function campoTexto(nome: string, rotulo: string, placeholder: string): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'admin-campo';
  const span = document.createElement('span');
  span.textContent = rotulo;
  const input = document.createElement('input');
  input.name = nome;
  input.placeholder = placeholder;
  input.required = true;
  wrap.append(span, input);
  return wrap;
}

function campoSelect(nome: string, rotulo: string, opcoes: string[]): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'admin-campo';
  wrap.dataset.campo = nome;
  const span = document.createElement('span');
  span.textContent = rotulo;
  const select = document.createElement('select');
  select.name = nome;
  for (const op of opcoes) {
    const opt = document.createElement('option');
    opt.value = op;
    opt.textContent = op;
    select.append(opt);
  }
  wrap.append(span, select);
  return wrap;
}

function campoNumero(nome: string, rotulo: string, min: number, max: number): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'admin-campo';
  wrap.dataset.campo = nome;
  const span = document.createElement('span');
  span.textContent = rotulo;
  const input = document.createElement('input');
  input.name = nome;
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.value = String(min);
  wrap.append(span, input);
  return wrap;
}