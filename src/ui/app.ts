/**
 * UI do duelo — DOM/CSS. Sem Phaser na v1: um TCG é cartas e
 * texto; o DOM já faz isso bem.
 *
 * Layout em 3 colunas:
 *   esquerda  → log do duelo
 *   centro    → fases, decks, campos, mão
 *   direita  → detalhes da carta selecionada (amplificada)
 *
 * Efeitos de ataque:
 *   - vulto: projétil do atacante até o alvo
 *   - fogo: chama no HP quando ataque direto
 *   - seta: linha do atacante até o alvo
 *
 * A IA joga com delays (para o jogador ver as fases).
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
  motivoNaoPodeAtacar,
  motivoNaoPodeInvocar,
  proximaFase,
} from '../core/duelo.ts';
import { CARTAS_POR_ID, deckPadrao } from '../data/cartas.ts';
import {
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
  FASES_ORDEM,
  cartaIdDe,
  type Alvo,
  type CartaTCG,
  type EstadoDuelo,
  type Instancia,
  type Jogador,
} from '../core/types.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;

/** Seleção de ataque em curso (uid da criatura do jogador). */
let selecionado: string | null = null;
/** Painel do admin aberto? */
let adminAberto = false;
/** Estado do duelo em curso. */
let estado: EstadoDuelo;
/** Cartas do jogador: oficiais (GitHub) + locais (localStorage). */
let cartas: CartaTCG[];
/** Carta selecionada para detalhes (uid ou null). */
let detalheUid: string | null = null;
/** Animação de ataque em curso. */
let animacao: { tipo: 'vulto' | 'fogo' | 'seta'; de: string; para: string } | null = null;

export async function iniciar(): Promise<void> {
  const [oficiais, locais] = await Promise.all([
    carregarCartasOficiais(),
    Promise.resolve(carregarCartas()),
  ]);
  cartas = mesclarCartas(oficiais, locais);
  estado = novoDuelo();
  render();
}

function novoDuelo(): EstadoDuelo {
  return dueloNovo({
    deck: [meuDeck(), deckPadrao()],
    seed: (Date.now() % 2 ** 32) >>> 0,
  });
}

/** Seu deck = padrão + cartas cadastradas (oficiais + locais). */
function meuDeck(): string[] {
  return [...deckPadrao(), ...cartas.map((c) => c.id)];
}

function aviso(mensagem: string): void {
  estado = { ...estado, log: [...estado.log, `⚠ ${mensagem}`].slice(-60) };
  render();
}

function render(): void {
  app.innerHTML = '';
  const layout = document.createElement('div');
  layout.className = 'layout';
  layout.append(logPanel(), centroPainel(), detalhesPanel());
  app.append(hud(), layout);
  if (adminAberto) app.append(adminPanel());
  if (animacao) aplicarAnimacao();
}

// --- HUD ---------------------------------------------------------------

function hud(): HTMLElement {
  const bar = document.createElement('header');
  bar.className = 'hud';

  const turno = document.createElement('div');
  turno.className = 'turno';
  turno.innerHTML = `<strong>Turno ${estado.turno}</strong><span>vez do Jogador ${estado.vez + 1}</span>`;

  const placar = document.createElement('div');
  placar.className = 'placar';
  for (const lado of [0, 1] as const) {
    const pl = document.createElement('div');
    pl.className = 'lp' + (lado === 1 && selecionado && estado.fase === 'combate' ? ' alvejavel' : '');
    pl.dataset.lado = String(lado);
    pl.innerHTML = `
      <span class="nome">${lado === 0 ? 'Você' : 'Oponente'}</span>
      <span class="lp-num">${estado.lp[lado]}</span>
      <span class="level">Lv ${estado.levelPartida[lado]}</span>
      <span class="dano">${estado.danoRecebido[lado]} dano sofrido</span>`;
    if (lado === 1 && estado.fase === 'combate') {
      pl.addEventListener('click', () => {
        if (!selecionado) return;
        tentarAtaque(selecionado, { tipo: 'jogador' });
      });
    }
    placar.append(pl);
  }

  const acoes = document.createElement('div');
  acoes.className = 'acoes';
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
    detalheUid = null;
    render();
  });
  const botaoFase = document.createElement('button');
  botaoFase.className = 'botao-turno';
  botaoFase.textContent = estado.fase === 'fim' ? 'Passar turno' : 'Próxima fase';
  botaoFase.addEventListener('click', () => {
    if (estado.vencedor !== null) return;
    avancarFase();
  });
  acoes.append(botaoAdmin, botaoNovo, botaoFase);

  bar.append(turno, placar, acoes);
  return bar;
}

/** Avança a fase; se a vez passar para a IA, ela joga com delays. */
async function avancarFase(): Promise<void> {
  let s = proximaFase(estado).estado;
  selecionado = null;
  estado = s;
  render();
  // Se a vez passou para a IA, ela joga o turno inteiro com tempo.
  if (s.vez === 1 && s.vencedor === null) {
    await iaComDelays();
  }
}

/** A IA joga o turno inteiro com delays entre as fases. */
async function iaComDelays(): Promise<void> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let s = estado;
  const jogador = s.vez;

  // 1. Fase de compra.
  if (s.fase === 'compra' && s.vencedor === null) {
    await sleep(800);
    s = comprarCarta(s, jogador).estado;
    estado = s;
    render();
  }

  // 2. Fase principal: invoca 1 monstro.
  if (s.fase === 'principal' && s.vencedor === null) {
    await sleep(800);
    const mao = [...s.mao[jogador]!].sort((a, b) => {
      const na = CARTAS_POR_ID[cartaIdDe(a)]!.nivel;
      const nb = CARTAS_POR_ID[cartaIdDe(b)]!.nivel;
      return nb - na;
    });
    for (const uid of mao) {
      if (motivoNaoPodeInvocar(s, jogador, uid) === null) {
        s = invocar(s, jogador, uid).estado;
        estado = s;
        render();
        break;
      }
    }
    await sleep(600);
    s = proximaFase(s).estado;
    estado = s;
    render();
  }

  // 3. Fase de combate: cada criatura ataca.
  if (s.fase === 'combate' && s.vencedor === null) {
    for (let i = 0; i < s.campo[jogador]!.length && s.vencedor === null; i++) {
      const zona = s.campo[jogador]![i];
      if (zona == null || zona.atacou || zona.modo !== 'ataque') continue;
      await sleep(700);
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
        if (
          motivoNaoPodeAtacar(s, jogador, zona.uid, {
            tipo: 'carta',
            uid: escolha.e.z.uid,
          }) === null
        ) {
          s = atacar(s, jogador, zona.uid, {
            tipo: 'carta',
            uid: escolha.e.z.uid,
          }).estado;
          estado = s;
          render();
          await sleep(700);
        }
      } else if (motivoNaoPodeAtacar(s, jogador, zona.uid, { tipo: 'jogador' }) === null) {
        s = atacar(s, jogador, zona.uid, { tipo: 'jogador' }).estado;
        estado = s;
        render();
        await sleep(700);
      }
    }
    s = proximaFase(s).estado;
    estado = s;
    render();
  }

  // 4. Finalização → fim → termina turno.
  if (s.fase === 'finalizacao' && s.vencedor === null) {
    await sleep(500);
    s = proximaFase(s).estado;
    estado = s;
    render();
  }
  if (s.fase === 'fim' && s.vencedor === null) {
    await sleep(500);
    s = proximaFase(s).estado;
    estado = s;
    render();
  }
}

function adversario(jogador: 0 | 1): 0 | 1 {
  return jogador === 0 ? 1 : 0;
}

// --- Centro (fases, decks, campos, mão) -------------------------------

function centroPainel(): HTMLElement {
  const centro = document.createElement('div');
  centro.className = 'centro';
  centro.append(barraFases(), deckDo(1), campoDo(1), campoDo(0), deckDo(0), maoDo());
  return centro;
}

/** Barra de fases do turno (estilo YGO). */
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
    case 'compra': return 'Clique no deck para comprar 1 carta';
    case 'principal': return 'Invoque (1 monstro/turno), mude modos, use magias';
    case 'combate': return 'Selecione o atacante e clique no alvo';
    case 'finalizacao': return 'Avançar sem ações';
    case 'fim': return 'Última olhada — sem mexer no campo';
    default: return '';
  }
}

// --- Deck --------------------------------------------------------------

function deckDo(lado: Jogador): HTMLElement {
  const sec = document.createElement('section');
  sec.className = 'deck';
  const titulo = document.createElement('h2');
  titulo.textContent = `Deck ${lado === 0 ? '(você)' : '(oponente)'} (${estado.deck[lado]!.length})`;
  sec.append(titulo);

  const pilha = document.createElement('div');
  pilha.className = 'deck-pilha';
  const carta = document.createElement('div');
  carta.className = 'carta vertical deck-carta';
  carta.innerHTML = `
    <span class="deck-verso">🂠</span>
    <span class="deck-texto">${lado === 0 ? 'Clique para comprar' : 'Oponente'}</span>`;
  if (lado === 0 && estado.fase === 'compra' && estado.vez === 0 && estado.vencedor === null) {
    carta.classList.add('clicavel');
    carta.addEventListener('click', () => {
      const r = comprarCarta(estado, 0);
      selecionado = null;
      estado = r.estado;
      render();
    });
  }
  pilha.append(carta);
  sec.append(pilha);
  return sec;
}

// --- Campo -------------------------------------------------------------

function campoDo(lado: Jogador): HTMLElement {
  const sec = document.createElement('section');
  sec.className = 'campo lado-' + lado;
  const titulo = document.createElement('h2');
  titulo.textContent = lado === 0 ? 'Seu campo' : 'Campo inimigo';
  sec.append(titulo);
  const zonas = document.createElement('div');
  zonas.className = 'zonas';
  for (let i = 0; i < estado.campo[lado]!.length; i++) {
    const slot = document.createElement('div');
    slot.className = 'zona';
    const instancia = estado.campo[lado]![i] ?? null;
    if (instancia) slot.append(cartaElemento(lado, instancia));
    zonas.append(slot);
  }
  sec.append(zonas);
  return sec;
}

function cartaElemento(lado: Jogador, instancia: Instancia): HTMLElement {
  const carta = CARTAS_POR_ID[instancia.cartaId]!;
  const el = document.createElement('div');
  el.className = `carta vertical ${RARITY_CLASS[carta.raridade]}`;
  el.dataset.uid = instancia.uid;
  if (instancia.atacou) el.classList.add('atacou');
  if (selecionado === instancia.uid) el.classList.add('selecionada');
  el.innerHTML = `
    <span class="carta-nome">${carta.nome}</span>
    <span class="carta-nivel">Nv ${carta.nivel}</span>
    <span class="carta-stats">
      <b class="atk">⚔ ${carta.atk}</b>
      <b class="def">🛡 ${carta.def}</b>
    </span>`;
  el.title = `${carta.nome} — nível ${carta.nivel} (exige level ${carta.nivel} na partida)`;

  // Clique para ver detalhes (sempre).
  el.addEventListener('click', () => {
    detalheUid = instancia.uid;
    render();
  });

  if (lado === 0) {
    // Badge de modo: alterna ataque/defesa (fase principal).
    const modo = document.createElement('span');
    modo.className = `modo ${instancia.modo}`;
    modo.textContent = instancia.modo === 'ataque' ? '⚔' : '🛡';
    modo.title = `Modo ${instancia.modo} — clique para alternar`;
    modo.addEventListener('click', (e) => {
      e.stopPropagation();
      tentarModo(instancia.uid);
    });
    el.append(modo);

    // Selecionar atacante (fase combate).
    if (estado.fase === 'combate') {
      el.addEventListener('click', () => {
        selecionado = selecionado === instancia.uid ? null : instancia.uid;
        render();
      });
    }
  } else if (selecionado && estado.fase === 'combate') {
    el.addEventListener('click', () => {
      tentarAtaque(selecionado!, { tipo: 'carta', uid: instancia.uid });
    });
  }
  return el;
}

// --- Mão (scroll horizontal) -------------------------------------------

function maoDo(): HTMLElement {
  const mao = document.createElement('section');
  mao.className = 'mao';
  const label = document.createElement('h2');
  label.textContent = `Mão (${estado.mao[0]!.length})`;
  mao.append(label);
  const lista = document.createElement('div');
  lista.className = 'mao-lista';
  for (const uid of estado.mao[0]!) {
    const carta = CARTAS_POR_ID[cartaIdDe(uid)]!;
    const el = document.createElement('div');
    el.className = `carta vertical na-mao ${RARITY_CLASS[carta.raridade]}`;
    el.innerHTML = `
      <span class="carta-nome">${carta.nome}</span>
      <span class="carta-nivel">Nv ${carta.nivel}</span>
      <span class="carta-stats">
        <b class="atk">⚔ ${carta.atk}</b>
        <b class="def">🛡 ${carta.def}</b>
      </span>`;
    el.title = `Exige level ${carta.nivel} na partida (você está em ${estado.levelPartida[0]})`;
    el.addEventListener('click', () => {
      if (estado.fase !== 'principal') {
        aviso('Só se invoca na fase principal');
        return;
      }
      const motivo = motivoNaoPodeInvocar(estado, 0, uid);
      if (motivo) {
        aviso(motivo);
        return;
      }
      const r = invocar(estado, 0, uid);
      selecionado = null;
      estado = r.estado;
      render();
    });
    lista.append(el);
  }
  mao.append(lista);
  return mao;
}

// --- Ações -------------------------------------------------------------

function tentarAtaque(uid: string, alvo: Alvo): void {
  const motivo = motivoNaoPodeAtacar(estado, 0, uid, alvo);
  if (motivo) {
    aviso(motivo);
    return;
  }
  const r = atacar(estado, 0, uid, alvo);
  selecionado = null;
  estado = r.estado;
  // Animação de ataque.
  if (alvo.tipo === 'carta') {
    animacao = { tipo: 'vulto', de: uid, para: alvo.uid };
    render();
    setTimeout(() => {
      animacao = null;
      render();
    }, 700);
  } else {
    animacao = { tipo: 'fogo', de: uid, para: 'hp1' };
    render();
    setTimeout(() => {
      animacao = null;
      render();
    }, 700);
  }
}

function tentarModo(uid: string): void {
  try {
    const r = alternarModo(estado, 0, uid);
    estado = r.estado;
  } catch (e) {
    aviso(e instanceof Error ? e.message : String(e));
    return;
  }
  render();
}

// --- Animações de ataque -----------------------------------------------

function aplicarAnimacao(): void {
  if (!animacao) return;
  const { tipo, de, para } = animacao;
  const deEl = app.querySelector(`[data-uid="${de}"]`);
  if (!deEl) return;

  if (tipo === 'vulto') {
    const paraEl = app.querySelector(`[data-uid="${para}"]`);
    if (!paraEl) return;
    const deRect = deEl.getBoundingClientRect();
    const paraRect = paraEl.getBoundingClientRect();
    const vulto = document.createElement('div');
    vulto.className = 'vulto';
    vulto.style.left = `${deRect.left + deRect.width / 2}px`;
    vulto.style.top = `${deRect.top + deRect.height / 2}px`;
    document.body.append(vulto);
    requestAnimationFrame(() => {
      vulto.style.transform = `translate(${paraRect.left + paraRect.width / 2 - deRect.left - deRect.width / 2}px, ${paraRect.top + paraRect.height / 2 - deRect.top - deRect.height / 2}px)`;
      vulto.style.opacity = '0';
    });
    setTimeout(() => vulto.remove(), 700);
  }

  if (tipo === 'fogo') {
    const hpEl = app.querySelector('[data-lado="1"]');
    if (!hpEl) return;
    const fogo = document.createElement('div');
    fogo.className = 'fogo-hp';
    fogo.textContent = '🔥';
    hpEl.append(fogo);
    setTimeout(() => fogo.remove(), 700);
  }
}

// --- Log (lateral esquerda) -------------------------------------------

function logPanel(): HTMLElement {
  const aside = document.createElement('aside');
  aside.className = 'log';
  const titulo = document.createElement('h3');
  titulo.textContent = 'Log do duelo';
  aside.append(titulo);
  const lista = document.createElement('ol');
  for (const linha of estado.log.slice(-20)) {
    const li = document.createElement('li');
    li.textContent = linha;
    lista.append(li);
  }
  aside.append(lista);
  const info = document.createElement('p');
  info.className = 'regra';
  info.textContent =
    'Invocar não gasta: exige level da partida ≥ nível da carta. ' +
    'A cada 100 de dano sofrido, seu level cai 1 (mínimo 0).';
  aside.append(info);
  return aside;
}

// --- Detalhes (lateral direita) ----------------------------------------

function detalhesPanel(): HTMLElement {
  const aside = document.createElement('aside');
  aside.className = 'detalhes';
  const titulo = document.createElement('h3');
  titulo.textContent = 'Detalhes';
  aside.append(titulo);

  if (!detalheUid) {
    const vazio = document.createElement('p');
    vazio.className = 'detalhes-vazio';
    vazio.textContent = 'Clique numa carta para ver detalhes.';
    aside.append(vazio);
    return aside;
  }

  const cartaId = cartaIdDe(detalheUid);
  const carta = CARTAS_POR_ID[cartaId];
  if (!carta) {
    const vazio = document.createElement('p');
    vazio.className = 'detalhes-vazio';
    vazio.textContent = 'Carta não encontrada.';
    aside.append(vazio);
    return aside;
  }

  const ampliada = document.createElement('div');
  ampliada.className = `carta vertical ampliada ${RARITY_CLASS[carta.raridade]}`;
  ampliada.innerHTML = `
    <span class="carta-nome">${carta.nome}</span>
    <span class="carta-nivel">Nv ${carta.nivel}</span>
    <span class="carta-desc">${carta.descricao}</span>
    <span class="carta-stats">
      <b class="atk">⚔ ${carta.atk}</b>
      <b class="def">🛡 ${carta.def}</b>
      <b class="eva">💨 ${carta.eva}%</b>
    </span>`;
  aside.append(ampliada);

  const info = document.createElement('p');
  info.className = 'detalhes-info';
  info.textContent = `Raridade: ${carta.raridade} · Exige level ${carta.nivel} na partida`;
  aside.append(info);
  return aside;
}

// --- Admin -------------------------------------------------------------

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
    campoTexto('nome', 'Nome da carta', 'Ex: Cavaleiro do Abismo'),
    campoTexto('descricao', 'Descrição', 'Ex: Jurou lealdade ao trono de ruínas.'),
    campoSelect('raridade', 'Raridade', ['comum', 'incomum', 'raro', 'epico', 'lendario']),
    campoNumero('nivel', 'Nível exigido (0-8)', 0, 8),
    campoNumero('atk', 'ATK', 0, 99999),
    campoNumero('def', 'DEF', 0, 99999),
    campoNumero('eva', 'EVA (reservada p/ efeitos)', 0, 100),
  );

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
    const carta = {
      id: idParaNome(String(dados.get('nome') ?? '')),
      nome: String(dados.get('nome') ?? '').trim(),
      descricao: String(dados.get('descricao') ?? '').trim(),
      raridade: String(dados.get('raridade') ?? 'comum') as Rarity,
      nivel: Number(dados.get('nivel') ?? 0),
      atk: Number(dados.get('atk') ?? 0),
      def: Number(dados.get('def') ?? 0),
      eva: Number(dados.get('eva') ?? 0),
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
