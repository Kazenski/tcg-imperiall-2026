/**
 * Testes do core do duelo: invocação (custo de level do dono),
 * batalha ATK/DEF, EVA, turnos e IA.
 *
 *   npm test
 *
 * Roda em Node puro, sem DOM. `core/` é puro e determinístico
 * (seed fixa + decks customizados), então cada regra é
 * reproduzível e independente do embaralhado.
 */

import assert from 'node:assert/strict';

import { CARTAS_POR_ID, deckPadrao } from '../src/data/cartas.ts';
import {
  atacar,
  dueloNovo,
  invocar,
  motivoNaoPodeAtacar,
  motivoNaoPodeInvocar,
  terminarTurno,
} from '../src/core/duelo.ts';
import { iaJogarTurno } from '../src/core/ia.ts';
import { cartaIdDe, pontosDeInvocacao, ZONAS } from '../src/core/types.ts';

let passou = 0;
function ok(nome: string, fn: () => void): void {
  fn();
  passou++;
  console.log(`  ✓ ${nome}`);
}

/** Deck de 20 cópias de uma carta: estados previsíveis. */
function deckDe(id: string): string[] {
  return Array<string>(20).fill(id);
}

function primeiroUid(estado: ReturnType<typeof dueloNovo>, jogador: 0 | 1, cartaId: string): string {
  const uid = estado.mao[jogador]!.find((u) => cartaIdDe(u) === cartaId);
  assert.ok(uid, `carta ${cartaId} não está na mão do jogador ${jogador + 1}`);
  return uid;
}

console.log('pontos de invocação');
ok('level 10 dá 4 pontos (3 + 10÷10)', () => {
  assert.equal(pontosDeInvocacao(10), 4);
  assert.equal(pontosDeInvocacao(25), 5);
  assert.equal(pontosDeInvocacao(0), 3);
});

console.log('invocação');
ok('gasta pontos de level e tira da mão', () => {
  const s0 = dueloNovo({ deck: [deckDe('golem-ferro'), deckDe('golem-ferro')], nivelDono: [10, 10], seed: 42 });
  const uid = primeiroUid(s0, 0, 'golem-ferro');
  const antes = s0.pontos[0]!;
  const { estado: s1 } = invocar(s0, 0, uid);
  assert.equal(s1.pontos[0], antes - 1);
  assert.ok(!s1.mao[0]!.includes(uid));
  assert.ok(s1.campo[0]!.some((z) => z?.uid === uid));
});

ok('recusa se o level do dono não alcança o nível da carta', () => {
  // Dono level 1 não invoca nível 2 (Sereia do Vale).
  const s0 = dueloNovo({ deck: [deckDe('sereia-vale'), deckDe('golem-ferro')], nivelDono: [1, 1], seed: 42 });
  const uid = primeiroUid(s0, 0, 'sereia-vale');
  assert.equal(
    motivoNaoPodeInvocar(s0, 0, uid),
    'seu level (1) não alcança o nível 2 da carta',
  );
  assert.throws(() => invocar(s0, 0, uid), /level/);
});

ok('recusa sem pontos de level suficientes', () => {
  // Level 10 → 4 pontos: 4 golems cabem, o 5º não.
  const s0 = dueloNovo({ deck: [deckDe('golem-ferro'), deckDe('golem-ferro')], nivelDono: [10, 10], seed: 42 });
  let s = s0;
  for (let i = 0; i < 4; i++) {
    const uid = primeiroUid(s, 0, 'golem-ferro');
    s = invocar(s, 0, uid).estado;
  }
  assert.equal(s.pontos[0], 0);
  const proxima = primeiroUid(s, 0, 'golem-ferro');
  assert.ok(motivoNaoPodeInvocar(s, 0, proxima)!.includes('faltam pontos'));
});

ok('recusa com campo cheio (5 zonas)', () => {
  // Level 20 → 5 pontos/turno. Enche as 5 zonas em dois
  // turnos (a mão inicial é 5; o draw repõe).
  let s = dueloNovo({ deck: [deckDe('golem-ferro'), deckDe('golem-ferro')], nivelDono: [20, 20], seed: 42 });
  for (let i = 0; i < 4; i++) {
    const uid = primeiroUid(s, 0, 'golem-ferro');
    s = invocar(s, 0, uid).estado;
  }
  s = terminarTurno(s).estado; // jogador 1 só compra
  s = terminarTurno(s).estado; // jogador 0 compra e tem pontos de novo
  const uid = primeiroUid(s, 0, 'golem-ferro');
  s = invocar(s, 0, uid).estado;
  assert.ok(s.campo[0]!.every((z) => z !== null));
  const sobra = primeiroUid(s, 0, 'golem-ferro');
  assert.equal(motivoNaoPodeInvocar(s, 0, sobra), 'campo cheio (5 criaturas)');
});

console.log('batalha');
/**
 * Estado fixo: golem (700/1100) no campo do jogador 0,
 * morcego (600/400) no campo do jogador 1, vez do jogador 0.
 */
/**
 * Estado fixo: golem (700/1100) no campo do jogador 0,
 * morcego (600/400) no campo do jogador 1.
 * `vezJogador0` = false deixa a vez com o jogador 1
 * (para testar o morcego atacando).
 */
function dueloGolemVsMorcego(vezJogador0 = true): ReturnType<typeof dueloNovo> {
  // seed 1: golem ACERTA o morcego (roll >= 35%) e o
  // morcego ACERTA o golem (roll >= 5%) — reproduzível.
  const s0 = dueloNovo({
    deck: [deckDe('golem-ferro'), deckDe('morcego-sombra')],
    nivelDono: [10, 10],
    seed: 1,
  });
  let s = s0;
  const golem = primeiroUid(s, 0, 'golem-ferro');
  s = invocar(s, 0, golem).estado;
  s = terminarTurno(s).estado;
  const morcego = primeiroUid(s, 1, 'morcego-sombra');
  s = invocar(s, 1, morcego).estado;
  if (vezJogador0) s = terminarTurno(s).estado;
  return s;
}

ok('atk > def destrói a carta e aplica a diferença', () => {
  const s = dueloGolemVsMorcego();
  const golem = s.campo[0]!.find((z) => z && cartaIdDe(z.uid) === 'golem-ferro')!.uid;
  const morcego = s.campo[1]!.find((z) => z && cartaIdDe(z.uid) === 'morcego-sombra')!.uid;
  // golem 700 atk x morcego 400 def: dano 300, morcego destruída.
  const antes = s.lp[1]!;
  const { estado: s1 } = atacar(s, 0, golem, { tipo: 'carta', uid: morcego });
  assert.equal(s1.lp[1], antes - 300);
  assert.ok(s1.campo[1]!.every((z) => z === null || cartaIdDe(z.uid) !== 'morcego-sombra'));
  assert.ok(s1.cementerio[1]!.includes(morcego));
});

ok('def > atk rebate o excesso no atacante', () => {
  // Vez do jogador 1: o morcego ataca.
  const s = dueloGolemVsMorcego(false);
  const golem = s.campo[0]!.find((z) => z && cartaIdDe(z.uid) === 'golem-ferro')!.uid;
  const morcego = s.campo[1]!.find((z) => z && cartaIdDe(z.uid) === 'morcego-sombra')!.uid;
  // morcego 600 atk x golem 1100 def: morcego destruída,
  // 500 de dano rebatido no atacante (jogador 1).
  const antes = s.lp[1]!;
  const { estado: s1 } = atacar(s, 1, morcego, { tipo: 'carta', uid: golem });
  assert.equal(s1.lp[1], antes - 500);
  assert.ok(s1.campo[1]!.every((z) => z === null || z.uid !== morcego));
  assert.ok(s1.campo[0]!.some((z) => z?.uid === golem));
});

ok('criatura não ataca duas vezes no mesmo turno', () => {
  const s = dueloGolemVsMorcego();
  const golem = s.campo[0]!.find((z) => z && cartaIdDe(z.uid) === 'golem-ferro')!.uid;
  const morcego = s.campo[1]!.find((z) => z && cartaIdDe(z.uid) === 'morcego-sombra')!.uid;
  const s1 = atacar(s, 0, golem, { tipo: 'carta', uid: morcego }).estado;
  assert.equal(
    motivoNaoPodeAtacar(s1, 0, golem, { tipo: 'jogador' }),
    'essa criatura já atacou neste turno',
  );
});

ok('EVA pode esquivar o ataque (seed forçada)', () => {
  // golem ataca gato-feral (40% de EVA); com a seed 7 o
  // roll cai abaixo de 40%: o gato esquiva.
  const s0 = dueloNovo({
    deck: [deckDe('golem-ferro'), deckDe('gato-feral')],
    nivelDono: [10, 10],
    seed: 7,
  });
  let s = s0;
  const golem = primeiroUid(s, 0, 'golem-ferro');
  s = invocar(s, 0, golem).estado;
  s = terminarTurno(s).estado;
  const gato = primeiroUid(s, 1, 'gato-feral');
  s = invocar(s, 1, gato).estado;
  s = terminarTurno(s).estado;
  const alvo = s.campo[1]!.find((z) => z && cartaIdDe(z.uid) === 'gato-feral')!.uid;
  const antes = s.lp[1]!;
  const { estado: s1, evento } = atacar(s, 0, golem, { tipo: 'carta', uid: alvo });
  assert.match(evento.mensagem, /evad/i);
  assert.equal(s1.lp[1], antes);
  assert.ok(s1.campo[1]!.some((z) => z?.uid === alvo));
});

console.log('turnos e IA');
ok('finalizar turno reseta pontos e compra 1', () => {
  const s0 = dueloNovo({ deck: [deckPadrao(), deckPadrao()], nivelDono: [10, 10], seed: 42 });
  const maoAntes = s0.mao[1]!.length;
  const { estado: s1 } = terminarTurno(s0);
  assert.equal(s1.vez, 1);
  assert.equal(s1.turno, 2);
  assert.equal(s1.pontos[1], 4);
  assert.equal(s1.mao[1]!.length, maoAntes + 1);
});

ok('a IA joga um turno inteiro respeitando as regras', () => {
  const s0 = dueloNovo({ deck: [deckPadrao(), deckPadrao()], nivelDono: [10, 10], seed: 42 });
  const s1 = iaJogarTurno(terminarTurno(s0).estado);
  assert.equal(s1.vez, 1); // a IA não passa a vez; é o fim do turno dela
  // Soma dos níveis invocados não ultrapassa os pontos do turno,
  // e nenhuma carta pede level acima do dono.
  let niveisInvocados = 0;
  for (const zona of s1.campo[1]!) {
    if (!zona) continue;
    const carta = CARTAS_POR_ID[cartaIdDe(zona.uid)]!;
    niveisInvocados += carta.nivel;
    assert.ok(carta.nivel <= s1.nivelDono[1]!);
    assert.ok(zona.atacou); // a IA atacou com tudo que pôde
  }
  assert.ok(niveisInvocados <= pontosDeInvocacao(10));
});

console.log(`\n${passou} testes passaram`);
