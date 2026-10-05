/**
 * Testes do core do duelo: invocação (level da partida, sem
 * gasto), batalha ATK/DEF com modos ataque/defesa, level que
 * cai a cada 100 de dano, turnos, IA e admin de cartas.
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
  alternarModo,
  atacar,
  dueloNovo,
  invocar,
  motivoNaoPodeAtacar,
  motivoNaoPodeInvocar,
  terminarTurno,
} from '../src/core/duelo.ts';
import { iaJogarTurno } from '../src/core/ia.ts';
import { carregarCartas, cartaValida, idParaNome, salvarCartas } from '../src/core/admin.ts';
import { cartaIdDe, DANO_POR_LEVEL, LEVEL_INICIAL, ZONAS } from '../src/core/types.ts';

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

/** Dublê de localStorage para os testes do admin. */
const memoria = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => memoria.get(k) ?? null,
  setItem: (k: string, v: string) => void memoria.set(k, String(v)),
  removeItem: (k: string) => void memoria.delete(k),
  clear: () => memoria.clear(),
  key: (i: number) => [...memoria.keys()][i] ?? null,
  get length() {
    return memoria.size;
  },
} as Storage;

console.log('invocação (level da partida, sem gasto)');
ok('invoca sem gastar nada: só valida level e zona', () => {
  const s0 = dueloNovo({ deck: [deckDe('golem-ferro'), deckDe('golem-ferro')], seed: 42 });
  const uid = primeiroUid(s0, 0, 'golem-ferro');
  const { estado: s1 } = invocar(s0, 0, uid);
  assert.ok(!s1.mao[0]!.includes(uid));
  assert.ok(s1.campo[0]!.some((z) => z?.uid === uid));
  // Nenhum recurso foi gasto: o level segue o mesmo.
  assert.equal(s1.levelPartida[0], s0.levelPartida[0]);
});

ok('recusa se o level da partida não alcança o nível da carta', () => {
  // Level 1 não invoca nível 2 (Sereia do Vale).
  const s0 = dueloNovo({
    deck: [deckDe('sereia-vale'), deckDe('golem-ferro')],
    levelInicial: [1, 1],
    seed: 42,
  });
  const uid = primeiroUid(s0, 0, 'sereia-vale');
  assert.equal(
    motivoNaoPodeInvocar(s0, 0, uid),
    'seu level na partida (1) não alcança o nível 2 da carta',
  );
  assert.throws(() => invocar(s0, 0, uid), /level/);
});

ok('cartas de nível 0 invocam mesmo em level 0', () => {
  const s0 = dueloNovo({
    deck: [deckDe('sertanejo'), deckDe('golem-ferro')],
    levelInicial: [0, 0],
    seed: 42,
  });
  const uid = primeiroUid(s0, 0, 'sertanejo');
  assert.equal(motivoNaoPodeInvocar(s0, 0, uid), null);
  const { estado: s1 } = invocar(s0, 0, uid);
  assert.ok(s1.campo[0]!.some((z) => z?.uid === uid));
});

ok('recusa com campo cheio (5 zonas)', () => {
  // Mão inicial é 5: invoca 4, compra nos turnos e invoca a 5ª.
  let s = dueloNovo({ deck: [deckDe('golem-ferro'), deckDe('golem-ferro')], seed: 42 });
  for (let i = 0; i < 4; i++) {
    const uid = primeiroUid(s, 0, 'golem-ferro');
    s = invocar(s, 0, uid).estado;
  }
  s = terminarTurno(s).estado; // jogador 1 compra
  s = terminarTurno(s).estado; // jogador 0 compra (mão 2)
  const uid = primeiroUid(s, 0, 'golem-ferro');
  s = invocar(s, 0, uid).estado; // 5ª criatura: campo cheio
  assert.ok(s.campo[0]!.every((z) => z !== null));
  const sobra = primeiroUid(s, 0, 'golem-ferro');
  assert.equal(motivoNaoPodeInvocar(s, 0, sobra), 'campo cheio (5 criaturas)');
});

console.log('level na partida');
ok('level cai 1 a cada 100 de dano cumulativo', () => {
  // golem (700 atk) ataca direto: 700 de dano -> level 10 -> 3.
  let s = dueloNovo({ deck: [deckDe('golem-ferro'), deckDe('golem-ferro')], seed: 1 });
  const golem = primeiroUid(s, 0, 'golem-ferro');
  s = invocar(s, 0, golem).estado;
  s = atacar(s, 0, golem, { tipo: 'jogador' }).estado;
  assert.equal(s.danoRecebido[1], 700);
  assert.equal(s.levelPartida[1], LEVEL_INICIAL - Math.floor(700 / DANO_POR_LEVEL));
});

ok('level nunca fica negativo', () => {
  // Dano massivo: level vai a 0 e para.
  let s = dueloNovo({ deck: [deckDe('imperador-ruina'), deckDe('golem-ferro')], seed: 1 });
  const imperador = primeiroUid(s, 0, 'imperador-ruina');
  s = invocar(s, 0, imperador).estado;
  for (let i = 0; i < 10 && s.vencedor === null; i++) {
    s = atacar(s, 0, imperador, { tipo: 'jogador' }).estado;
    if (s.vencedor === null) {
      s = terminarTurno(s).estado; // vez do jogador 1
      if (s.vencedor === null) s = terminarTurno(s).estado; // volta ao jogador 0
    }
  }
  assert.equal(s.levelPartida[1], 0);
});

console.log('modo ataque/defesa');
/** Estado: golem (700/1100) no campo 0, alvo no campo 1, vez do 0. */
function dueloGolemVs(alvoId: string, seed: number, vezJogador0 = true) {
  let s = dueloNovo({
    deck: [deckDe('golem-ferro'), deckDe(alvoId)],
    seed,
  });
  const golem = primeiroUid(s, 0, 'golem-ferro');
  s = invocar(s, 0, golem).estado;
  s = terminarTurno(s).estado;
  const alvo = primeiroUid(s, 1, alvoId);
  s = invocar(s, 1, alvo).estado;
  if (vezJogador0) s = terminarTurno(s).estado;
  const golemUid = s.campo[0]!.find((z) => z && cartaIdDe(z.uid) === 'golem-ferro')!.uid;
  const alvoUid = s.campo[1]!.find((z) => z && cartaIdDe(z.uid) === alvoId)!.uid;
  return { s, golemUid, alvoUid };
}

ok('criatura em modo defesa não ataca', () => {
  const { s, golemUid } = dueloGolemVs('morcego-sombra', 1);
  const s1 = alternarModo(s, 0, golemUid).estado;
  assert.equal(
    motivoNaoPodeAtacar(s1, 0, golemUid, { tipo: 'jogador' }),
    'criatura em modo defesa não ataca',
  );
});

ok('ataque a modo defesa: atk > def destrói sem dano ao jogador', () => {
  // Turno 1: golem invocado. Turno 2: morcego invocado e
  // posto em defesa. Turno 3: golem ataca — destrói sem dano.
  let s = dueloNovo({ deck: [deckDe('golem-ferro'), deckDe('morcego-sombra')], seed: 1 });
  const golem = primeiroUid(s, 0, 'golem-ferro');
  s = invocar(s, 0, golem).estado;
  s = terminarTurno(s).estado; // vez do jogador 1
  const morcego = primeiroUid(s, 1, 'morcego-sombra');
  s = invocar(s, 1, morcego).estado;
  s = alternarModo(s, 1, morcego).estado; // morcego em defesa
  s = terminarTurno(s).estado; // volta ao jogador 0
  const antes = s.lp[1]!;
  const { estado: s2 } = atacar(s, 0, golem, { tipo: 'carta', uid: morcego });
  assert.equal(s2.lp[1], antes); // sem dano ao jogador
  assert.ok(s2.campo[1]!.every((z) => z === null || z.uid !== morcego));
});

ok('ataque a modo defesa: atk < def rebate no atacante, alvo sobrevive', () => {
  // Turno 1: golem invocado e posto em defesa. Turno 2: morcego
  // ataca — golem sobrevive, 500 de dano rebatido no atacante.
  let s = dueloNovo({ deck: [deckDe('golem-ferro'), deckDe('morcego-sombra')], seed: 1 });
  const golem = primeiroUid(s, 0, 'golem-ferro');
  s = invocar(s, 0, golem).estado;
  s = alternarModo(s, 0, golem).estado; // golem em defesa
  s = terminarTurno(s).estado; // vez do jogador 1
  const morcego = primeiroUid(s, 1, 'morcego-sombra');
  s = invocar(s, 1, morcego).estado;
  const antes = s.lp[1]!;
  const { estado: s2 } = atacar(s, 1, morcego, { tipo: 'carta', uid: golem });
  assert.equal(s2.lp[1], antes - 500);
  assert.ok(s2.campo[0]!.some((z) => z?.uid === golem));
});

ok('batalha em modo ataque: atk > def destrói e fere', () => {
  const { s, golemUid, alvoUid } = dueloGolemVs('morcego-sombra', 1);
  const antes = s.lp[1]!;
  const { estado: s1 } = atacar(s, 0, golemUid, { tipo: 'carta', uid: alvoUid });
  assert.equal(s1.lp[1], antes - 300);
  assert.ok(s1.campo[1]!.every((z) => z === null || z.uid !== alvoUid));
});

ok('batalha em modo ataque: def > atk rebate no atacante', () => {
  const { s, golemUid, alvoUid } = dueloGolemVs('morcego-sombra', 1, false);
  const antes = s.lp[1]!;
  const { estado: s1 } = atacar(s, 1, alvoUid, { tipo: 'carta', uid: golemUid });
  assert.equal(s1.lp[1], antes - 500);
  assert.ok(s1.campo[1]!.every((z) => z === null || z.uid !== alvoUid));
});

ok('criatura não ataca duas vezes no mesmo turno', () => {
  const { s, golemUid, alvoUid } = dueloGolemVs('morcego-sombra', 1);
  const s1 = atacar(s, 0, golemUid, { tipo: 'carta', uid: alvoUid }).estado;
  assert.equal(
    motivoNaoPodeAtacar(s1, 0, golemUid, { tipo: 'jogador' }),
    'essa criatura já atacou neste turno',
  );
});

console.log('turnos e IA');
ok('finalizar turno compra 1 e passa a vez', () => {
  const s0 = dueloNovo({ deck: [deckPadrao(), deckPadrao()], seed: 42 });
  const maoAntes = s0.mao[1]!.length;
  const { estado: s1 } = terminarTurno(s0);
  assert.equal(s1.vez, 1);
  assert.equal(s1.turno, 2);
  assert.equal(s1.mao[1]!.length, maoAntes + 1);
});

ok('a IA joga um turno inteiro respeitando as regras', () => {
  const s0 = dueloNovo({ deck: [deckPadrao(), deckPadrao()], seed: 42 });
  const s1 = iaJogarTurno(terminarTurno(s0).estado);
  assert.equal(s1.vez, 1); // a IA não passa a vez; é o fim do turno dela
  // Nenhuma carta invocada pede level acima do dono.
  for (const zona of s1.campo[1]!) {
    if (!zona) continue;
    const carta = CARTAS_POR_ID[cartaIdDe(zona.uid)]!;
    assert.ok(carta.nivel <= s1.levelPartida[1]!);
  }
});

console.log('admin de cartas');
ok('cadastra, lista e remove cartas (localStorage)', () => {
  memoria.clear();
  assert.deepEqual(carregarCartas(), []);

  const carta = {
    id: idParaNome('Cavaleiro Teste'),
    nome: 'Cavaleiro Teste',
    descricao: 'Uma carta de teste.',
    raridade: 'raro' as const,
    nivel: 3,
    atk: 1500,
    def: 1200,
    eva: 10,
  };
  assert.equal(cartaValida(carta, new Set()), null);
  salvarCartas([carta]);
  assert.equal(carregarCartas().length, 1);

  // Id duplicado é recusado.
  assert.match(cartaValida(carta, new Set([carta.id])), /já existe/);

  // Valores inválidos são recusados.
  assert.match(cartaValida({ ...carta, nivel: 9 }, new Set()), /nível/);
  assert.match(cartaValida({ ...carta, atk: -1 }, new Set()), /ATK/);

  // Remove.
  salvarCartas([]);
  assert.deepEqual(carregarCartas(), []);
});

console.log(`\n${passou} testes passaram`);
