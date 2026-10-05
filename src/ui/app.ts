/**
 * UI do duelo — DOM/CSS. Sem Phaser na v1: um TCG é cartas e
 * texto; o DOM já faz isso bem (e o scroll da mão agradece).
 *
 * Interações:
 *   - clique numa carta da MÃO      -> invoca na primeira zona livre
 *   - clique numa carta do SEU campo -> seleciona como atacante
 *   - com atacante selecionado:
 *       clique numa carta inimiga   -> ataca aquela criatura
 *       clique no LP inimigo        -> ataque direto ao jogador
 *   - "Finalizar turno"             -> a IA joga o turno do oponente
 *
 * O estado nunca é mutado aqui: cada ação vem do `core/` como um
 * estado novo, e a tela é redesenhada do zero (o estado é pequeno).
 */

import { iaJogarTurno } from '../core/ia.ts';
import {
  atacar,
  dueloNovo,
  invocar,
  motivoNaoPodeAtacar,
  motivoNaoPodeInvocar,
  terminarTurno,
} from '../core/duelo.ts';
import { CARTAS_POR_ID } from '../data/cartas.ts';
import { deckPadrao } from '../data/cartas.ts';
import { RARITY_CLASS } from '../core/raridade.ts';
import {
  cartaIdDe,
  pontosDeInvocacao,
  type Alvo,
  type EstadoDuelo,
  type Instancia,
  type Jogador,
} from '../core/types.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;

/** Seleção de ataque em curso (uid da criatura do jogador). */
let selecionado: string | null = null;

export function iniciar(): void {
  const estado = dueloNovo({
    deck: [deckPadrao(), deckPadrao()],
    // Level do dono: 10 -> 3 + floor(10/10) = 4 pontos de level/turno.
    nivelDono: [10, 10],
    seed: 42,
  });
  render(estado);
}

function aviso(estado: EstadoDuelo, mensagem: string): void {
  render({ ...estado, log: [...estado.log, `⚠ ${mensagem}`].slice(-60) });
}

function render(estado: EstadoDuelo): void {
  app.innerHTML = '';
  app.append(hud(estado), campoDo(estado, 1), campoDo(estado, 0), logPanel(estado));
}

function hud(estado: EstadoDuelo): HTMLElement {
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
    pl.innerHTML = `<span class="nome">${lado === 0 ? 'Você' : 'Oponente'}</span>
      <span class="lp-num">${estado.lp[lado]}</span>
      <span class="pontos">${estado.pontos[lado]} pts de level</span>`;
    if (lado === 1) {
      // Ataque direto: só com atacante selecionado.
      pl.addEventListener('click', () => {
        if (!selecionado) return;
        tentarAtaque(estado, 0, selecionado, { tipo: 'jogador' });
      });
    }
    placar.append(pl);
  }
  const botao = document.createElement('button');
  botao.className = 'botao-turno';
  botao.textContent = 'Finalizar turno';
  botao.addEventListener('click', () => {
    if (estado.vencedor !== null) return;
    let s = terminarTurno(estado).estado;
    if (s.vez === 1 && s.vencedor === null) s = iaJogarTurno(s);
    selecionado = null;
    render(s);
  });
  bar.append(turno, placar, botao);
  return bar;
}

function campoDo(estado: EstadoDuelo, lado: Jogador): HTMLElement {
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
    if (instancia) {
      slot.append(cartaElemento(estado, lado, instancia));
    }
    zonas.append(slot);
  }
  sec.append(zonas);
  if (lado === 0) sec.append(maoDo(estado));
  return sec;
}

function cartaElemento(
  estado: EstadoDuelo,
  lado: Jogador,
  instancia: Instancia,
): HTMLElement {
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
  el.title = `${carta.nome} — nível ${carta.nivel} (custa ${carta.nivel} pts de level)`;

  if (lado === 0) {
    el.addEventListener('click', () => {
      // No campo: seleciona/deseleciona como atacante.
      selecionado = selecionado === instancia.uid ? null : instancia.uid;
      render(estado);
    });
  } else if (selecionado) {
    el.addEventListener('click', () => {
      tentarAtaque(estado, 0, selecionado!, { tipo: 'carta', uid: instancia.uid });
    });
  }
  return el;
}

function maoDo(estado: EstadoDuelo): HTMLElement {
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
    el.title = `Custa ${carta.nivel} pontos de level · exige level ${carta.nivel} do dono`;
    el.addEventListener('click', () => {
      const motivo = motivoNaoPodeInvocar(estado, 0, uid);
      if (motivo) {
        aviso(estado, motivo);
        return;
      }
      const r = invocar(estado, 0, uid);
      selecionado = null;
      render(r.estado);
    });
    mao.append(el);
  }
  return mao;
}

function tentarAtaque(estado: EstadoDuelo, jogador: 0 | 1, uid: string, alvo: Alvo): void {
  const motivo = motivoNaoPodeAtacar(estado, jogador, uid, alvo);
  if (motivo) {
    aviso(estado, motivo);
    return;
  }
  const r = atacar(estado, jogador, uid, alvo);
  selecionado = null;
  render(r.estado);
}

function logPanel(estado: EstadoDuelo): HTMLElement {
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
    `Pontos de level/turno: 3 + level do dono ÷ 10 (level 10 → ${pontosDeInvocacao(10)}). ` +
    'Invocar custa o nível da carta e exige level do dono ≥ nível.';
  aside.append(info);
  return aside;
}
