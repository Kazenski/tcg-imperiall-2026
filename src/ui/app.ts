/**
 * UI do duelo — DOM/CSS. Sem Phaser na v1: um TCG é cartas e
 * texto; o DOM já faz isso bem.
 *
 * Visual estilo Yu-Gi-Oh: cartas verticais (nome no topo,
 * nível, stats), mão com scroll horizontal, indicadores de
 * fase, deck clicável na fase de compra.
 *
 * Fases do turno:
 *   compra      → clica no deck para comprar 1 carta
 *   principal   → invoca (máx 1 monstro/turno), muda modo
 *   combate     → seleciona atacante e dá alvo
 *   finalizacao → avança sem ações
 *   fim         → última olhada (sem ações)
 *
 * O estado nunca é mutado aqui: cada ação vem do `core/` como um
 * estado novo, e a tela é redesenhada do zero.
 */

import { iaJogarTurno } from '../core/ia.ts';
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
/** Animação de ataque em curso (uid da carta atingida). */
let animacaoAlvo: string | null = null;

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
  app.append(hud(), barraFases(), deckDoJogador(), campoDo(1), campoDo(0), maoDo(), logPanel());
  if (adminAberto) app.append(adminPanel());
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
    render();
  });
  const botaoFase = document.createElement('button');
  botaoFase.className = 'botao-turno';
  botaoFase.textContent = estado.fase === 'fim' ? 'Passar turno' : 'Próxima fase';
  botaoFase.addEventListener('click', () => {
    if (estado.vencedor !== null) return;
    let s = proximaFase(estado).estado;
    // Se a IA passou a vez (vez 1), ela joga o turno inteiro.
    if (s.vez === 1 && s.vencedor === null) s = iaJogarTurno(s);
    selecionado = null;
    estado = s;
    render();
  });
  acoes.append(botaoAdmin, botaoNovo, botaoFase);

  bar.append(turno, placar, acoes);
  return bar;
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

// --- Deck (fase de compra) ---------------------------------------------

function deckDoJogador(): HTMLElement {
  const sec = document.createElement('section');
  sec.className = 'deck';
  const titulo = document.createElement('h2');
  titulo.textContent = `Deck (${estado.deck[0]!.length})`;
  sec.append(titulo);

  const pilha = document.createElement('div');
  pilha.className = 'deck-pilha';
  const carta = document.createElement('div');
  carta.className = 'carta deck-carta';
  carta.innerHTML = `
    <span class="deck-verso">🂠</span>
    <span class="deck-texto">Clique para comprar</span>`;
  if (estado.fase === 'compra' && estado.vez === 0 && estado.vencedor === null) {
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
  if (instancia.atacou) el.classList.add('atacou');
  if (selecionado === instancia.uid) el.classList.add('selecionada');
  if (animacaoAlvo === instancia.uid) el.classList.add('atingida');
  el.innerHTML = `
    <span class="carta-nome">${carta.nome}</span>
    <span class="carta-nivel">Nv ${carta.nivel}</span>
    <span class="carta-stats">
      <b class="atk">⚔ ${carta.atk}</b>
      <b class="def">🛡 ${carta.def}</b>
    </span>`;
  el.title = `${carta.nome} — nível ${carta.nivel} (exige level ${carta.nivel} na partida)`;

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

    el.addEventListener('click', () => {
      if (estado.fase === 'combate') {
        selecionado = selecionado === instancia.uid ? null : instancia.uid;
        render();
      }
    });
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
  // Animação: marca a carta atingida por 600ms.
  if (alvo.tipo === 'carta') {
    animacaoAlvo = alvo.uid;
    render();
    setTimeout(() => {
      animacaoAlvo = null;
      render();
    }, 600);
  } else {
    render();
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

// --- Log ---------------------------------------------------------------

function logPanel(): HTMLElement {
  const aside = document.createElement('aside');
  aside.className = 'log';
  const titulo = document.createElement('h3');
  titulo.textContent = 'Log do duelo';
  aside.append(titulo);
  const lista = document.createElement('ol');
  for (const linha of estado.log.slice(-14)) {
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
