/**
 * Testes do core do duelo: fases do turno, invocação (level da
 * partida, sem gasto, máx 1 monstro/turno), batalha ATK/DEF com
 * modos ataque/defesa, level que cai a cada 100 de dano, IA e
 * admin de cartas.
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
  comprarCarta,
  dueloNovo,
  invocar,
  motivoNaoPodeAtacar,
  motivoNaoPodeInvocar,
  proximaFase,
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

/** Avança até a próxima fase de compra do jogador 0. */
function proximoTurno(s: ReturnType<typeof dueloNovo>): ReturnType<typeof dueloNovo> {
  for (let i = 0; i < 12 && !(s.vez === 0 && s.fase === 'compra'); i++) {
    s = proximaFase(s).estado;
  }
  return s;
}

/** Avança o duelo até a fase principal (compra + clique). */
function atePrincipal(estado: ReturnType<typeof dueloNovo>): ReturnType<typeof dueloNovo> {
  return comprarCarta(estado, estado.vez).estado;
}

/** Avança até a fase de combate. */
function ateCombate(estado: ReturnType<typeof dueloNovo>): ReturnType<typeof dueloNovo> {
  let s = atePrincipal(estado);
  s = proximaFase(s).estado;
  return s;
}

console.log('fases do turno');
ok('duelo começa na fase de compra', () => {
  const s = dueloNovo({ deck: [deckDe('golem-ferro'), deckDe('golem-ferro')], seed: 42 });
  assert.equal(s.fase, 'compra');
  assert.equal(s.vez, 0);
});

ok('comprar carta avança para a fase principal', () => {
  const s0 = dueloNovo({ deck: [deckDe('golem-ferro'), deckDe('golem-ferro')], seed: 42 });
  const maoAntes = s0.mao[0]!.length;
  const s1 = comprarCarta(s0, 0).estado;
  assert.equal(s1.fase, 'principal');
  assert.equal(s1.mao[0]!.length, maoAntes + 1);
});

ok('não compra fora da fase de compra', () => {
  const s0 = atePrincipal(dueloNovo({ deck: [deckDe('golem-ferro'), deckDe('golem-ferro')], seed: 42 }));
  assert.throws(() => comprarCarta(s0, 0), /fase de compra/);
});

ok('proximaFase avança compra → principal → combate', () => {
  let s = dueloNovo({ deck: [deckDe('golem-ferro'), deckDe('golem-ferro')], seed: 42 });
  s = proximaFase(s).estado;
  assert.equal(s.fase, 'principal');
  s = proximaFase(s).estado;
  assert.equal(s.fase, 'combate');
});

ok('fase fim termina o turno e volta para a compra', () => {
  let s = dueloNovo({ deck: [deckDe('golem-ferro'), deckDe('golem-ferro')], seed: 42 });
  for (let i = 0; i < 4; i++) s = proximaFase(s).estado; // compra → principal → combate → finalizacao → fim
  assert.equal(s.fase, 'fim');
  const s1 = proximaFase(s).estado; // termina o turno
  assert.equal(s1.vez, 1);
  assert.equal(s1.fase, 'compra');
  assert.equal(s1.turno, 2);
});

console.log('invocação (fase principal, level, máx 1 monstro)');
ok('invoca sem gastar: só valida level e zona', () => {
  const s0 = atePrincipal(dueloNovo({ deck: [deckDe('golem-ferro'), deckDe('golem-ferro')], seed: 42 }));
  const uid = primeiroUid(s0, 0, 'golem-ferro');
  const s1 = invocar(s0, 0, uid).estado;
  assert.ok(!s1.mao[0]!.includes(uid));
  assert.ok(s1.campo[0]!.some((z) => z?.uid === uid));
  assert.equal(s1.levelPartida[0], s0.levelPartida[0]);
});

ok('recusa se o level da partida não alcança o nível da carta', () => {
  const s0 = atePrincipal(dueloNovo({
    deck: [deckDe('sereia-vale'), deckDe('golem-ferro')],
    levelInicial: [1, 1],
    seed: 42,
  }));
  const uid = primeiroUid(s0, 0, 'sereia-vale');
  assert.equal(
    motivoNaoPodeInvocar(s0, 0, uid),
    'seu level na partida (1) não alcança o nível 2 da carta',
  );
  assert.throws(() => invocar(s0, 0, uid), /level/);
});

ok('cartas de nível 0 invocam mesmo em level 0', () => {
  const s0 = atePrincipal(dueloNovo({
    deck: [deckDe('sertanejo'), deckDe('golem-ferro')],
    levelInicial: [0, 0],
    seed: 42,
  }));
  const uid = primeiroUid(s0, 0, 'sertanejo');
  assert.equal(motivoNaoPodeInvocar(s0, 0, uid), null);
  const s1 = invocar(s0, 0, uid).estado;
  assert.ok(s1.campo[0]!.some((z) => z?.uid === uid));
});

ok('só invoca 1 monstro por turno', () => {
  const s0 = atePrincipal(dueloNovo({ deck: [deckDe('golem-ferro'), deckDe('golem-ferro')], seed: 42 }));
  const uid1 = primeiroUid(s0, 0, 'golem-ferro');
  const s1 = invocar(s0, 0, uid1).estado;
  const uid2 = primeiroUid(s1, 0, 'golem-ferro');
  assert.equal(motivoNaoPodeInvocar(s1, 0, uid2), 'só se invoca 1 monstro por turno');
});

ok('recusa com campo cheio (5 zonas)', () => {
  // Invoca 1 por turno: 5 turnos para encher o campo.
  let s = atePrincipal(dueloNovo({ deck: [deckDe('golem-ferro'), deckDe('golem-ferro')], seed: 42 }));
  for (let i = 0; i < ZONAS; i++) {
    const uid = primeiroUid(s, 0, 'golem-ferro');
    s = invocar(s, 0, uid).estado;
    s = proximoTurno(s);
    s = comprarCarta(s, 0).estado; // compra → principal
  }
  assert.ok(s.campo[0]!.every((z) => z !== null));
  const sobra = primeiroUid(s, 0, 'golem-ferro');
  assert.equal(motivoNaoPodeInvocar(s, 0, sobra), 'campo cheio (5 criaturas)');
});

console.log('level na partida');
ok('level cai 1 a cada 100 de dano cumulativo', () => {
  let s = atePrincipal(dueloNovo({ deck: [deckDe('golem-ferro'), deckDe('golem-ferro')], seed: 1 }));
  const golem = primeiroUid(s, 0, 'golem-ferro');
  s = invocar(s, 0, golem).estado;
  s = proximaFase(s).estado; // combate
  s = atacar(s, 0, golem, { tipo: 'jogador' }).estado;
  assert.equal(s.danoRecebido[1], 700);
  assert.equal(s.levelPartida[1], LEVEL_INICIAL - Math.floor(700 / DANO_POR_LEVEL));
});

ok('level nunca fica negativo', () => {
  let s = atePrincipal(dueloNovo({ deck: [deckDe('imperador-ruina'), deckDe('golem-ferro')], seed: 1 }));
  const imperador = primeiroUid(s, 0, 'imperador-ruina');
  s = invocar(s, 0, imperador).estado;
  s = proximaFase(s).estado; // combate
  for (let i = 0; i < 10 && s.vencedor === null; i++) {
    s = atacar(s, 0, imperador, { tipo: 'jogador' }).estado;
    if (s.vencedor === null) {
      s = proximoTurno(s); // volta à compra do jogador 0
      s = comprarCarta(s, 0).estado; // compra → principal
      s = proximaFase(s).estado; // combate
    }
  }
  assert.equal(s.levelPartida[1], 0);
});

console.log('modo ataque/defesa');

/**
 * Estado: golem (700/1100) no campo 0, alvo no campo 1,
 * vez do jogador 0, na fase PRINCIPAL (para testes de modo).
 */
function dueloGolemVsPrincipal(alvoId: string, seed: number) {
  let s = atePrincipal(dueloNovo({
    deck: [deckDe('golem-ferro'), deckDe(alvoId)],
    seed,
  }));
  const golem = primeiroUid(s, 0, 'golem-ferro');
  s = invocar(s, 0, golem).estado; // fase principal
  // Turno do jogador 1: compra e invoca o alvo.
  s = proximaFase(s).estado; // combate
  s = proximaFase(s).estado; // finalizacao
  s = proximaFase(s).estado; // fim
  s = proximaFase(s).estado; // termina turno → vez 1, compra
  s = comprarCarta(s, 1).estado; // compra → principal
  const alvo = primeiroUid(s, 1, alvoId);
  s = invocar(s, 1, alvo).estado; // fase principal
  // Volta ao jogador 0 na fase PRINCIPAL.
  s = proximaFase(s).estado; // combate
  s = proximaFase(s).estado; // finalizacao
  s = proximaFase(s).estado; // fim
  s = proximaFase(s).estado; // termina turno → vez 0, compra
  s = comprarCarta(s, 0).estado; // compra → principal
  const golemUid = s.campo[0]!.find((z) => z && cartaIdDe(z.uid) === 'golem-ferro')!.uid;
  const alvoUid = s.campo[1]!.find((z) => z && cartaIdDe(z.uid) === alvoId)!.uid;
  return { s, golemUid, alvoUid };
}

/**
 * Estado: golem no campo 0, alvo no campo 1, vez do jogador 1,
 * na fase PRINCIPAL (para o jogador 1 mudar o modo do alvo).
 */
function dueloGolemVsPrincipalP1(alvoId: string, seed: number) {
  let s = atePrincipal(dueloNovo({
    deck: [deckDe('golem-ferro'), deckDe(alvoId)],
    seed,
  }));
  const golem = primeiroUid(s, 0, 'golem-ferro');
  s = invocar(s, 0, golem).estado; // fase principal
  // Turno do jogador 1: compra e invoca o alvo.
  s = proximaFase(s).estado; // combate
  s = proximaFase(s).estado; // finalizacao
  s = proximaFase(s).estado; // fim
  s = proximaFase(s).estado; // termina turno → vez 1, compra
  s = comprarCarta(s, 1).estado; // compra → principal
  const alvo = primeiroUid(s, 1, alvoId);
  s = invocar(s, 1, alvo).estado; // fase principal
  const golemUid = s.campo[0]!.find((z) => z && cartaIdDe(z.uid) === 'golem-ferro')!.uid;
  const alvoUid = s.campo[1]!.find((z) => z && cartaIdDe(z.uid) === alvoId)!.uid;
  return { s, golemUid, alvoUid };
}

/**
 * Estado: golem (700/1100) no campo 0, alvo no campo 1,
 * vez do jogador 0, na fase COMBATE (para testes de ataque).
 */
function dueloGolemVsCombate(alvoId: string, seed: number) {
  const { s: estado } = dueloGolemVsPrincipal(alvoId, seed);
  // Define a fase diretamente (sem proximaFase, que poderia
  // terminar o turno se houvesse deck-out).
  const s = { ...estado, fase: 'combate' as const };
  const golemUid = s.campo[0]!.find((z) => z && cartaIdDe(z.uid) === 'golem-ferro')!.uid;
  const alvoUid = s.campo[1]!.find((z) => z && cartaIdDe(z.uid) === alvoId)!.uid;
  return { s, golemUid, alvoUid };
}

ok('criatura em modo defesa não ataca', () => {
  // Golem em defesa na fase combate.
  const { s: s0, golemUid } = dueloGolemVsPrincipal('morcego-sombra', 1);
  let s = alternarModo(s0, 0, golemUid).estado; // golem em defesa (fase principal)
  s = proximaFase(s).estado; // combate
  assert.equal(
    motivoNaoPodeAtacar(s, 0, golemUid, { tipo: 'jogador' }),
    'criatura em modo defesa não ataca',
  );
});

ok('ataque a modo defesa: atk > def destrói sem dano ao jogador', () => {
  // Jogador 1 põe o morcego em defesa na fase principal.
  const { s: s0, alvoUid } = dueloGolemVsPrincipalP1('morcego-sombra', 1);
  const s1 = alternarModo(s0, 1, alvoUid).estado; // morcego em defesa
  // Volta ao jogador 0 na fase de combate.
  let s = proximaFase(s1).estado; // combate
  s = proximaFase(s).estado; // finalizacao
  s = proximaFase(s).estado; // fim
  s = proximaFase(s).estado; // termina turno → vez 0, compra
  s = comprarCarta(s, 0).estado; // compra → principal
  s = proximaFase(s).estado; // combate
  const golemUid = s.campo[0]!.find((z) => z && cartaIdDe(z.uid) === 'golem-ferro')!.uid;
  const morcegoUid = s.campo[1]!.find((z) => z && cartaIdDe(z.uid) === 'morcego-sombra')!.uid;
  const antes = s.lp[1]!;
  const s2 = atacar(s, 0, golemUid, { tipo: 'carta', uid: morcegoUid }).estado;
  assert.equal(s2.lp[1], antes);
  assert.ok(s2.campo[1]!.every((z) => z === null || z.uid !== morcegoUid));
});

ok('ataque a modo defesa: atk < def rebate no atacante, alvo sobrevive', () => {
  // Turno 1: golem em defesa. Turno 2: morcego ataca.
  let s = atePrincipal(dueloNovo({ deck: [deckDe('golem-ferro'), deckDe('morcego-sombra')], seed: 1 }));
  const golem = primeiroUid(s, 0, 'golem-ferro');
  s = invocar(s, 0, golem).estado;
  s = alternarModo(s, 0, golem).estado; // golem em defesa
  s = proximaFase(s).estado; // combate
  s = proximaFase(s).estado; // finalizacao
  s = proximaFase(s).estado; // fim
  s = proximaFase(s).estado; // termina turno → vez 1
  s = comprarCarta(s, 1).estado; // compra → principal
  const morcego = primeiroUid(s, 1, 'morcego-sombra');
  s = invocar(s, 1, morcego).estado;
  s = proximaFase(s).estado; // combate
  const antes = s.lp[1]!;
  const s2 = atacar(s, 1, morcego, { tipo: 'carta', uid: golem }).estado;
  assert.equal(s2.lp[1], antes - 500);
  assert.ok(s2.campo[0]!.some((z) => z?.uid === golem));
});

ok('batalha em modo ataque: atk > def destrói e fere', () => {
  const { s, golemUid, alvoUid } = dueloGolemVsCombate('morcego-sombra', 1);
  const antes = s.lp[1]!;
  const s1 = atacar(s, 0, golemUid, { tipo: 'carta', uid: alvoUid }).estado;
  assert.equal(s1.lp[1], antes - 300);
  assert.ok(s1.campo[1]!.every((z) => z === null || z.uid !== alvoUid));
});

ok('batalha em modo ataque: def > atk rebate no atacante', () => {
  let s = atePrincipal(dueloNovo({ deck: [deckDe('golem-ferro'), deckDe('morcego-sombra')], seed: 1 }));
  const golem = primeiroUid(s, 0, 'golem-ferro');
  s = invocar(s, 0, golem).estado;
  s = proximaFase(s).estado; // combate
  s = proximaFase(s).estado; // finalizacao
  s = proximaFase(s).estado; // fim
  s = proximaFase(s).estado; // termina turno → vez 1
  s = comprarCarta(s, 1).estado; // compra → principal
  const morcego = primeiroUid(s, 1, 'morcego-sombra');
  s = invocar(s, 1, morcego).estado;
  s = proximaFase(s).estado; // combate
  const antes = s.lp[1]!;
  const s1 = atacar(s, 1, morcego, { tipo: 'carta', uid: golem }).estado;
  assert.equal(s1.lp[1], antes - 500);
  assert.ok(s1.campo[1]!.every((z) => z === null || z.uid !== morcego));
});

ok('criatura não ataca duas vezes no mesmo turno', () => {
  const { s, golemUid, alvoUid } = dueloGolemVsCombate('morcego-sombra', 1);
  const s1 = atacar(s, 0, golemUid, { tipo: 'carta', uid: alvoUid }).estado;
  assert.equal(
    motivoNaoPodeAtacar(s1, 0, golemUid, { tipo: 'jogador' }),
    'essa criatura já atacou neste turno',
  );
});

console.log('ataque direto bloqueado por criaturas');
ok('não ataca a vida do inimigo com criaturas no campo dele', () => {
  // Golem do jogador 0, morcego do jogador 1 em campo.
  const { s, golemUid } = dueloGolemVsCombate('morcego-sombra', 1);
  assert.ok(s.campo[1]!.some((z) => z !== null));
  assert.equal(
    motivoNaoPodeAtacar(s, 0, golemUid, { tipo: 'jogador' }),
    'não pode atacar a vida do inimigo enquanto ele tiver criaturas no campo',
  );
  assert.throws(
    () => atacar(s, 0, golemUid, { tipo: 'jogador' }),
    /criaturas no campo/,
  );
});

ok('a regra vale igual para o jogador 2 atacando o jogador 1', () => {
  // Controle: jogador 1 com criatura, jogador 0 sem nenhuma.
  let s = atePrincipal(dueloNovo({ deck: [deckDe('golem-ferro'), deckDe('morcego-sombra')], seed: 1 }));
  const golem = primeiroUid(s, 0, 'golem-ferro');
  s = invocar(s, 0, golem).estado;
  s = proximaFase(s).estado; // combate
  s = proximaFase(s).estado; // finalizacao
  s = proximaFase(s).estado; // fim
  s = proximaFase(s).estado; // termina turno → vez 1
  s = comprarCarta(s, 1).estado; // compra → principal
  const morcego = primeiroUid(s, 1, 'morcego-sombra');
  s = invocar(s, 1, morcego).estado;
  s = proximaFase(s).estado; // combate
  assert.ok(s.campo[0]!.some((z) => z !== null));
  assert.equal(
    motivoNaoPodeAtacar(s, 1, morcego, { tipo: 'jogador' }),
    'não pode atacar a vida do inimigo enquanto ele tiver criaturas no campo',
  );
});

ok('ataque direto passa quando o campo inimigo está vazio', () => {
  // Só o jogador 0 tem criatura; o campo 1 está limpo.
  const s = ateCombate(dueloNovo({ deck: [deckDe('golem-ferro'), deckDe('golem-ferro')], seed: 42 }));
  const golem = primeiroUid(s, 0, 'golem-ferro');
  const comGolem = invocar({ ...s, fase: 'principal' as const }, 0, golem).estado;
  assert.ok(comGolem.campo[1]!.every((z) => z === null));
  assert.equal(motivoNaoPodeAtacar({ ...comGolem, fase: 'combate' as const }, 0, golem, { tipo: 'jogador' }), null);
  const antes = comGolem.lp[1]!;
  const s2 = atacar({ ...comGolem, fase: 'combate' as const }, 0, golem, { tipo: 'jogador' }).estado;
  assert.equal(s2.lp[1], antes - CARTAS_POR_ID['golem-ferro']!.atk);
});

ok('derrotar a última criatura libera o ataque direto', () => {
  const { s, golemUid, alvoUid } = dueloGolemVsCombate('morcego-sombra', 1);
  // Primeiro o golem limpa o campo do oponente...
  const s1 = atacar(s, 0, golemUid, { tipo: 'carta', uid: alvoUid }).estado;
  assert.ok(s1.campo[1]!.every((z) => z === null));
  // ...e a próxima criatura já pode bater direto na vida.
  const uid2 = primeiroUid(s1, 0, 'golem-ferro');
  let s2 = proximoTurno(s1);
  s2 = comprarCarta(s2, 0).estado;
  s2 = invocar(s2, 0, uid2).estado;
  s2 = proximaFase(s2).estado; // combate
  assert.equal(motivoNaoPodeAtacar(s2, 0, uid2, { tipo: 'jogador' }), null);
});

console.log('IA');
ok('a IA joga o turno inteiro respeitando as fases', () => {
  const s0 = dueloNovo({ deck: [deckPadrao(), deckPadrao()], seed: 42 });
  const s1 = iaJogarTurno(s0);
  // A IA termina o turno: vez do jogador 1, fase compra, turno 2.
  assert.equal(s1.vez, 1);
  assert.equal(s1.fase, 'compra');
  assert.equal(s1.turno, 2);
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

  assert.match(cartaValida(carta, new Set([carta.id])), /já existe/);
  assert.match(cartaValida({ ...carta, nivel: 9 }, new Set()), /nível/);
  assert.match(cartaValida({ ...carta, atk: -1 }, new Set()), /ATK/);

  salvarCartas([]);
  assert.deepEqual(carregarCartas(), []);
});

console.log(`\n${passou} testes passaram`);
