/**
 * UI do duelo — DOM/CSS. Sem Phaser na v1: um TCG é cartas e
 * texto; o DOM já faz isso bem (e o scroll da mão agradece).
 *
 * Interações:
 *   - clique numa carta da MÃO      -> invoca (só valida level)
 *   - clique numa carta do SEU campo -> seleciona como atacante
 *   - badge ⚔/🛡 na sua criatura     -> alterna modo ataque/defesa
 *   - com atacante selecionado:
 *       clique numa carta inimiga   -> ataca aquela criatura
 *       clique no LP inimigo        -> ataque direto ao jogador
 *   - "Finalizar turno"             -> a IA joga o turno do oponente
 *   - "Admin"                        -> cadastra cartas (localStorage)
 *
 * O estado nunca é mutado aqui: cada ação vem do `core/` como um
 * estado novo, e a tela é redesenhada do zero (o estado é pequeno).
 */

import { iaJogarTurno } from '../core/ia.ts';
import {
  alternarModo,
  atacar,
  dueloNovo,
  invocar,
  motivoNaoPodeAtacar,
  motivoNaoPodeInvocar,
  terminarTurno,
} from '../core/duelo.ts';
import { CARTAS_POR_ID, deckPadrao } from '../data/cartas.ts';
import {
  RARIDADES,
  carregarCartas,
  cartaValida,
  idParaNome,
  salvarCartas,
} from '../core/admin.ts';
import { RARITY_CLASS } from '../core/raridade.ts';
import type { Rarity } from '../core/raridade.ts';
import {
  cartaIdDe,
  type Alvo,
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

export function iniciar(): void {
  estado = novoDuelo();
  render();
}

function novoDuelo(): EstadoDuelo {
  return dueloNovo({
    deck: [meuDeck(), deckPadrao()],
    seed: (Date.now() % 2 ** 32) >>> 0,
  });
}

/** Seu deck = padrão + cartas cadastradas no admin. */
function meuDeck(): string[] {
  return [...deckPadrao(), ...carregarCartas().map((c) => c.id)];
}

function aviso(mensagem: string): void {
  estado = { ...estado, log: [...estado.log, `⚠ ${mensagem}`].slice(-60) };
  render();
}

function render(): void {
  app.innerHTML = '';
  app.append(hud(), campoDo(1), campoDo(0), logPanel());
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
    pl.className = 'lp' + (lado === 1 && selecionado ? ' alvejavel' : '');
    pl.dataset.lado = String(lado);
    pl.innerHTML = `
      <span class="nome">${lado === 0 ? 'Você' : 'Oponente'}</span>
      <span class="lp-num">${estado.lp[lado]}</span>
      <span class="level">Lv ${estado.levelPartida[lado]}</span>
      <span class="dano">${estado.danoRecebido[lado]} dano sofrido</span>`;
    if (lado === 1) {
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
  const botaoTurno = document.createElement('button');
  botaoTurno.className = 'botao-turno';
  botaoTurno.textContent = 'Finalizar turno';
  botaoTurno.addEventListener('click', () => {
    if (estado.vencedor !== null) return;
    let s = terminarTurno(estado).estado;
    if (s.vez === 1 && s.vencedor === null) s = iaJogarTurno(s);
    selecionado = null;
    estado = s;
    render();
  });
  acoes.append(botaoAdmin, botaoNovo, botaoTurno);

  bar.append(turno, placar, acoes);
  return bar;
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
  if (lado === 0) sec.append(maoDo());
  return sec;
}

function cartaElemento(lado: Jogador, instancia: Instancia): HTMLElement {
  const carta = CARTAS_POR_ID[instancia.cartaId]!;
  const el = document.createElement('div');
  el.className = `carta ${RARITY_CLASS[carta.raridade]}`;
  if (instancia.atacou) el.classList.add('atacou');
  if (selecionado === instancia.uid) el.classList.add('selecionada');
  el.innerHTML = `
    <span class="nivel">${carta.nivel}</span>
    <span class="nome-carta">${carta.nome}</span>
    <span class="desc">${carta.descricao}</span>
    <span class="stats">
      <b class="atk">⚔ ${carta.atk}</b>
      <b class="def">🛡 ${carta.def}</b>
      <b class="eva">💨 ${carta.eva}%</b>
    </span>`;
  el.title = `${carta.nome} — nível ${carta.nivel} (exige level ${carta.nivel} na partida)`;

  if (lado === 0) {
    // Badge de modo: alterna ataque/defesa.
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
      selecionado = selecionado === instancia.uid ? null : instancia.uid;
      render();
    });
  } else if (selecionado) {
    el.addEventListener('click', () => {
      tentarAtaque(selecionado!, { tipo: 'carta', uid: instancia.uid });
    });
  }
  return el;
}

function maoDo(): HTMLElement {
  const mao = document.createElement('div');
  mao.className = 'mao';
  const label = document.createElement('span');
  label.className = 'label-mao';
  label.textContent = `Mão (${estado.mao[0]!.length}) — clique para invocar:`;
  mao.append(label);
  for (const uid of estado.mao[0]!) {
    const carta = CARTAS_POR_ID[cartaIdDe(uid)]!;
    const el = document.createElement('div');
    el.className = `carta na-mao ${RARITY_CLASS[carta.raridade]}`;
    el.innerHTML = `
      <span class="nivel">${carta.nivel}</span>
      <span class="nome-carta">${carta.nome}</span>
      <span class="stats">
        <b class="atk">⚔ ${carta.atk}</b>
        <b class="def">🛡 ${carta.def}</b>
        <b class="eva">💨 ${carta.eva}%</b>
      </span>`;
    el.title = `Exige level ${carta.nivel} na partida (você está em ${estado.levelPartida[0]})`;
    el.addEventListener('click', () => {
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
    mao.append(el);
  }
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
  render();
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
    campoSelect('raridade', 'Raridade', RARIDADES),
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
    const ids = new Set([
      ...Object.keys(CARTAS_POR_ID),
      ...carregarCartas().map((c) => c.id),
    ]);
    const motivo = cartaValida(carta, ids);
    if (motivo) {
      erro.textContent = motivo;
      return;
    }
    salvarCartas([...carregarCartas(), carta as never]);
    erro.textContent = '';
    form.reset();
    render();
  });

  painel.append(form);
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

function listaAdmin(): HTMLElement {
  const sec = document.createElement('section');
  sec.className = 'admin-lista';
  const titulo = document.createElement('h3');
  titulo.textContent = `Suas cartas (${carregarCartas().length}) — entram no seu deck`;
  sec.append(titulo);
  const lista = document.createElement('ul');
  for (const carta of carregarCartas()) {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${carta.nome}</strong> <span class="admin-stats">Nv ${carta.nivel} · ⚔${carta.atk} · 🛡${carta.def} · 💨${carta.eva}%</span>`;
    const remover = document.createElement('button');
    remover.className = 'botao-sec';
    remover.textContent = 'remover';
    remover.addEventListener('click', () => {
      salvarCartas(carregarCartas().filter((c) => c.id !== carta.id));
      render();
    });
    li.append(remover);
    lista.append(li);
  }
  if (carregarCartas().length === 0) {
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
