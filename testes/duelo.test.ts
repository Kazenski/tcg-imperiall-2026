/**
 * Testes do core do duelo.
 *
 * Cobertura:
 *   - fases do turno;
 *   - invocação: level da partida, máx. 1 monstro/turno;
 *   - PILHAS: ordem de níveis obrigatória (0, 1, 2… uma sobre a
 *     outra), só a carta de cima é ativa, revelação de baixo quando
 *     a de cima cai;
 *   - matemática do combate (4 casos: ataque x ataque nos dois
 *     sentidos, ataque x defesa nos dois sentidos);
 *   - regra do ataque direto (só com o campo inimigo vazio);
 *   - level que cai a cada 100 de dano;
 *   - IA jogando o turno inteiro, em passos;
 *   - admin de cartas (localStorage).
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
  pilhasQueAceitam,
  proximaFase,
  temCriatura,
} from '../src/core/duelo.ts';
import { iaJogarTurno, iaPassos } from '../src/core/ia.ts';
import { carregarCartas, cartaValida, idParaNome, salvarCartas } from '../src/core/admin.ts';
import {
  cartaAtiva,
  cartaIdDe,
  DANO_POR_LEVEL,
  indiceAtivo,
  LEVEL_INICIAL,
  ZONAS,
  type EstadoDuelo,
  type Jogador,
  type Modo,
  type Pilha,
} from '../src/core/types.ts';

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

/**
 * Deck com 6 cópias de cada id informado (6 × n ids fica dentro do
 * limite de 60 cartas do core).
 */
function deckDeCada(...ids: string[]): string[] {
  return ids.flatMap((id) => Array<string>(6).fill(id));
}

/** Uma carta de referência por nível, para montar escadas de pilha. */
const POR_NIVEL: Record<number, string> = {
  0: 'sertanejo',
  1: 'golem-ferro',
  2: 'sereia-vale',
  3: 'ogro-masmorra',
  4: 'dragao-jovem',
  5: 'dragao-fogo',
  6: 'dragao-antigo',
  7: 'dragao-gelo',
  8: 'imperador-ruina',
};

/** Deck que cobre todos os níveis (para poder subir pilhas). */
function deckEscada(): string[] {
  return deckDeCada(...Object.values(POR_NIVEL));
}

function primeiroUid(estado: EstadoDuelo, jogador: Jogador, cartaId: string): string {
  const uid = estado.mao[jogador]!.find((u) => cartaIdDe(u) === cartaId);
  assert.ok(uid, `carta ${cartaId} não está na mão do jogador ${jogador + 1}`);
  return uid;
}

/** Primeiro uid da mão cujo carta tem o nível pedido. */
function primeiroUidNivel(estado: EstadoDuelo, jogador: Jogador, nivel: number): string {
  const uid = estado.mao[jogador]!.find((u) => CARTAS_POR_ID[cartaIdDe(u)]!.nivel === nivel);
  assert.ok(uid, `nenhuma carta de nível ${nivel} na mão do jogador ${jogador + 1}`);
  return uid;
}

/** A mão tem alguma carta do nível pedido? */
function temNivel(estado: EstadoDuelo, jogador: Jogador, nivel: number): boolean {
  return estado.mao[jogador]!.some((u) => CARTAS_POR_ID[cartaIdDe(u)]!.nivel === nivel);
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

/** Avança até a fase de compra do jogador pedido. */
function proximoTurnoPara(s: EstadoDuelo, jogador: Jogador): EstadoDuelo {
  let atual = s;
  for (let i = 0; i < 16 && !(atual.vez === jogador && atual.fase === 'compra'); i++) {
    atual = proximaFase(atual).estado;
  }
  return atual;
}

/** Avança até a próxima fase de compra do jogador 0. */
function proximoTurno(s: EstadoDuelo): EstadoDuelo {
  return proximoTurnoPara(s, 0);
}

/** Avança o duelo até a fase principal (compra + clique). */
function atePrincipal(estado: EstadoDuelo): EstadoDuelo {
  return comprarCarta(estado, estado.vez).estado;
}

/** Avança até a fase de combate. */
function ateCombate(estado: EstadoDuelo): EstadoDuelo {
  return proximaFase(atePrincipal(estado)).estado;
}

/**
 * Avança turnos inteiros até a mão do jogador ter uma carta do
 * `nivel` pedido e o duelo estar na fase principal dele (pronto
 * para invocar). Evita depender da sorte do embaralhado.
 */
function ateTerNivel(s: EstadoDuelo, jogador: Jogador, nivel: number): EstadoDuelo {
  let atual = s;
  for (let i = 0; i < 40; i++) {
    if (temNivel(atual, jogador, nivel)) {
      while (atual.vez !== jogador || atual.fase !== 'principal') {
        atual = proximaFase(atual).estado;
      }
      return atual;
    }
    // anda até a próxima compra do jogador e compra
    while (!(atual.vez === jogador && atual.fase === 'compra')) {
      atual = proximaFase(atual).estado;
    }
    atual = comprarCarta(atual, jogador).estado;
    while (atual.fase !== 'principal') atual = proximaFase(atual).estado;
  }
  throw new Error(`nenhuma carta de nível ${nivel} apareceu para o jogador ${jogador + 1}`);
}

/** Empilha os níveis informados na pilha `zona` (1 carta por turno). */
function empilharNiveis(
  s: EstadoDuelo,
  jogador: Jogador,
  zona: number,
  niveis: number[],
): EstadoDuelo {
  let atual = s;
  for (const nivel of niveis) {
    atual = ateTerNivel(atual, jogador, nivel);
    // 1 monstro por turno: se já invocou neste turno, espera o próximo.
    if (atual.invocouMonstro[jogador]!) {
      atual = proximoTurnoPara(atual, jogador);
      atual = ateTerNivel(atual, jogador, nivel);
    }
    const uid = primeiroUidNivel(atual, jogador, nivel);
    const motivo = motivoNaoPodeInvocar(atual, jogador, uid, zona);
    assert.equal(motivo, null, `esperava invocar nível ${nivel} na pilha ${zona + 1}: ${motivo}`);
    atual = invocar(atual, jogador, uid, zona).estado;
  }
  return atual;
}

/** Empilha por id, convertendo cada carta para o seu nível. */
function empilharTurnos(
  s: EstadoDuelo,
  jogador: Jogador,
  zona: number,
  ids: string[],
): EstadoDuelo {
  return empilharNiveis(
    s,
    jogador,
    zona,
    ids.map((id) => CARTAS_POR_ID[id]!.nivel),
  );
}

/** Escada de níveis que termina em `nivel` (topo 3 -> 0,1,2,3). */
function niveisAte(nivel: number): number[] {
  return Array.from({ length: nivel + 1 }, (_, i) => i);
}

/** O outro jogador. */
function adversarioDe(jogador: Jogador): Jogador {
  return jogador === 0 ? 1 : 0;
}

/** Pilha do jogador num índice de zona. */
function pilha(s: EstadoDuelo, jogador: Jogador, zona: number): Pilha {
  return s.campo[jogador]![zona]!;
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
  for (let i = 0; i < 4; i++) s = proximaFase(s).estado; // até 'fim'
  assert.equal(s.fase, 'fim');
  const s1 = proximaFase(s).estado;
  assert.equal(s1.vez, 1);
  assert.equal(s1.fase, 'compra');
  assert.equal(s1.turno, 2);
});

console.log('invocação (fase principal, level, máx 1 monstro)');
ok('invoca sem gastar: só valida level e pilha', () => {
  const s0 = atePrincipal(dueloNovo({ deck: [deckDe('sertanejo'), deckDe('sertanejo')], seed: 42 }));
  const uid = primeiroUidNivel(s0, 0, 0);
  const s1 = invocar(s0, 0, uid, 0).estado;
  assert.ok(!s1.mao[0]!.includes(uid));
  assert.equal(pilha(s1, 0, 0).length, 1);
  assert.equal(pilha(s1, 0, 0)[0]!.uid, uid);
  assert.equal(s1.levelPartida[0], s0.levelPartida[0]);
});

ok('recusa se o level da partida não alcança o nível da carta', () => {
  const s0 = atePrincipal(dueloNovo({
    deck: [deckDe('sereia-vale'), deckDe('golem-ferro')],
    levelInicial: [1, 1],
    seed: 42,
  }));
  const uid = primeiroUidNivel(s0, 0, 2); // nível 2
  assert.equal(
    motivoNaoPodeInvocar(s0, 0, uid, 0),
    'seu level na partida (1) não alcança o nível 2 da carta',
  );
  assert.throws(() => invocar(s0, 0, uid, 0), /level/);
});

ok('cartas de nível 0 invocam mesmo em level 0', () => {
  const s0 = atePrincipal(dueloNovo({
    deck: [deckDe('sertanejo'), deckDe('golem-ferro')],
    levelInicial: [0, 0],
    seed: 42,
  }));
  const uid = primeiroUidNivel(s0, 0, 0);
  assert.equal(motivoNaoPodeInvocar(s0, 0, uid, 0), null);
  assert.equal(pilha(invocar(s0, 0, uid, 0).estado, 0, 0).length, 1);
});

ok('só invoca 1 monstro por turno', () => {
  const s0 = atePrincipal(dueloNovo({ deck: [deckDe('sertanejo'), deckDe('sertanejo')], seed: 42 }));
  const uid1 = primeiroUidNivel(s0, 0, 0);
  const s1 = invocar(s0, 0, uid1, 0).estado;
  const uid2 = primeiroUidNivel(s1, 0, 0);
  assert.equal(motivoNaoPodeInvocar(s1, 0, uid2, 0), 'só se invoca 1 monstro por turno');
});

ok('recusa índice de pilha inexistente', () => {
  const s0 = atePrincipal(dueloNovo({ deck: [deckDe('sertanejo'), deckDe('sertanejo')], seed: 42 }));
  const uid = primeiroUidNivel(s0, 0, 0);
  assert.equal(motivoNaoPodeInvocar(s0, 0, uid, 99), 'essa pilha não existe (o campo tem 5)');
  assert.equal(motivoNaoPodeInvocar(s0, 0, uid, -1), 'essa pilha não existe (o campo tem 5)');
});

console.log('PILHAS (ordem de níveis)');
ok('pilha vazia só aceita nível 0', () => {
  // deck só de nível 1: a pilha vazia tem de recusar
  const s0 = atePrincipal(dueloNovo({ deck: [deckDe('golem-ferro'), deckDe('golem-ferro')], seed: 42 }));
  const lv1 = primeiroUidNivel(s0, 0, 1);
  assert.deepEqual(pilhasQueAceitam(s0, 0, 0), [0, 1, 2, 3, 4]);
  assert.deepEqual(pilhasQueAceitam(s0, 0, 1), []);
  assert.match(motivoNaoPodeInvocar(s0, 0, lv1, 0)!, /só aceita nível 0 agora/);
});

ok('empilha em ordem: nível 0, depois 1, 2… uma sobre a outra', () => {
  let s = dueloNovo({ deck: [deckEscada(), deckEscada()], seed: 42 });
  s = empilharNiveis(s, 0, 0, niveisAte(3));
  const p = pilha(s, 0, 0);
  assert.equal(p.length, 4);
  assert.deepEqual(
    p.map((i) => CARTAS_POR_ID[cartaIdDe(i.uid)]!.nivel),
    [0, 1, 2, 3],
  );
  assert.equal(cartaAtiva(p)!.uid, p[3]!.uid);
  assert.equal(indiceAtivo(p), 3);
});

ok('para ter nível 8 ativo é preciso ter de 0 a 7 embaixo', () => {
  let s = dueloNovo({ deck: [deckEscada(), deckEscada()], seed: 42 });
  s = empilharNiveis(s, 0, 0, niveisAte(8));
  const p = pilha(s, 0, 0);
  assert.equal(p.length, 9);
  assert.deepEqual(
    p.map((i) => CARTAS_POR_ID[cartaIdDe(i.uid)]!.nivel),
    [0, 1, 2, 3, 4, 5, 6, 7, 8],
  );
  assert.equal(CARTAS_POR_ID[cartaIdDe(cartaAtiva(p)!.uid)]!.nivel, 8);
});

ok('pula de nível é recusado: falta a carta de baixo', () => {
  let s = dueloNovo({ deck: [deckEscada(), deckEscada()], seed: 42 });
  s = ateTerNivel(s, 0, 0);
  s = invocar(s, 0, primeiroUidNivel(s, 0, 0), 0).estado; // nível 0
  // espera aparecer uma carta de nível 2 (depois de passar o turno)
  s = proximoTurnoPara(s, 0);
  s = ateTerNivel(s, 0, 2);
  const lv2 = primeiroUidNivel(s, 0, 2);
  assert.match(motivoNaoPodeInvocar(s, 0, lv2, 0)!, /só aceita nível 1 agora/);
});

ok('nível abaixo do topo vai para outra pilha', () => {
  let s = dueloNovo({ deck: [deckEscada(), deckEscada()], seed: 42 });
  s = empilharNiveis(s, 0, 0, niveisAte(1)); // pilha 1 em nível 1
  s = proximoTurnoPara(s, 0);
  s = ateTerNivel(s, 0, 0);
  const lv0 = primeiroUidNivel(s, 0, 0);
  assert.match(motivoNaoPodeInvocar(s, 0, lv0, 0)!, /já está no nível 1.*use outra pilha/);
  assert.equal(motivoNaoPodeInvocar(s, 0, lv0, 1), null, 'pilha 2 vazia aceita nível 0');
});

ok('cada pilha tem a própria contagem de níveis', () => {
  let s = dueloNovo({ deck: [deckEscada(), deckEscada()], seed: 42 });
  s = empilharNiveis(s, 0, 0, niveisAte(1)); // pilha 1 → nv1
  s = proximoTurnoPara(s, 0);
  s = ateTerNivel(s, 0, 0);
  s = invocar(s, 0, primeiroUidNivel(s, 0, 0), 1).estado; // pilha 2 → nv0
  assert.equal(CARTAS_POR_ID[cartaIdDe(cartaAtiva(pilha(s, 0, 0))!.uid)]!.nivel, 1);
  assert.equal(CARTAS_POR_ID[cartaIdDe(cartaAtiva(pilha(s, 0, 1))!.uid)]!.nivel, 0);
});

ok('as 5 pilhas são independentes', () => {
  const s = dueloNovo({ deck: [deckPadrao(), deckPadrao()], seed: 42 });
  assert.equal(s.campo[0]!.length, ZONAS);
  for (const p of s.campo[0]!) assert.equal(p.length, 0);
});

console.log('pilha no combate');
ok('NENHUMA carta enterrada interage — só o topo, sempre', () => {
  /*
   * Trava a regra: com uma pilha cheia (lv0..lv8) dos dois lados,
   * nenhuma das 8 cartas enterradas de cada lado pode atacar nem
   * ser atacada, em nenhuma hipótese. Só o topo responde.
   */
  let s = dueloNovo({ deck: [deckEscada(), deckEscada()], seed: 42 });
  s = empilharNiveis(s, 0, 0, niveisAte(8)); // pilha 1 do jogador 0, cheia
  s = empilharNiveis(s, 1, 0, niveisAte(8)); // pilha 1 do jogador 1, cheia
  s = proximoTurno(s);
  s = atePrincipal(s);
  s = proximaFase(s).estado; // fase de combate do jogador 0

  for (const jogador of [0, 1] as const) {
    const inimigo = adversarioDe(jogador);
    // Estado na fase de combate COM a vez deste jogador, senão a
    // validação para em "não é a sua vez" antes de olhar a pilha.
    const meu = { ...s, vez: jogador, fase: 'combate' as const };
    const turnoInimigo = { ...s, vez: inimigo, fase: 'combate' as const };
    const turnoPrincipal = { ...s, vez: jogador, fase: 'principal' as const };
    const p = pilha(s, jogador, 0);
    assert.equal(p.length, 9, 'pilha cheia de 9 cartas');

    for (let h = 0; h < p.length - 1; h++) {
      const enterrada = p[h]!.uid;

      // 1) enterrada não ataca (nem a vida, nem outra carta)
      assert.equal(
        motivoNaoPodeAtacar(meu, jogador, enterrada, { tipo: 'jogador' }),
        'só a carta de cima da pilha ataca',
        `nv ${h} do jogador ${jogador + 1} não pode atacar`,
      );
      const alvoTopo = cartaAtiva(pilha(s, inimigo, 0))!.uid;
      assert.equal(
        motivoNaoPodeAtacar(meu, jogador, enterrada, { tipo: 'carta', uid: alvoTopo }),
        'só a carta de cima da pilha ataca',
        `nv ${h} do jogador ${jogador + 1} não pode atacar carta`,
      );

      // 2) enterrada não é alvo válido de nenhuma pilha inimiga
      const atacanteTopo = cartaAtiva(pilha(s, inimigo, 0))!.uid;
      assert.equal(
        motivoNaoPodeAtacar(turnoInimigo, inimigo, atacanteTopo, { tipo: 'carta', uid: enterrada }),
        'a criatura-alvo não está no topo da pilha',
        `nv ${h} do jogador ${jogador + 1} não pode ser atacada`,
      );

      // 3) enterrada não troca de modo
      assert.throws(
        () => alternarModo(turnoPrincipal, jogador, enterrada),
        /só a carta de cima da pilha muda de modo/,
        `nv ${h} do jogador ${jogador + 1} não muda de modo`,
      );
    }
  }

  // o topo de cada lado continua funcionando normalmente
  const meuTopo = cartaAtiva(pilha(s, 0, 0))!.uid;
  assert.notEqual(
    motivoNaoPodeAtacar(s, 0, meuTopo, { tipo: 'jogador' }),
    'só a carta de cima da pilha ataca',
    'o topo do jogador 1 pode atacar',
  );
});

ok('só a carta de cima da pilha ataca', () => {
  let s = dueloNovo({ deck: [deckEscada(), deckEscada()], seed: 42 });
  s = empilharNiveis(s, 0, 0, niveisAte(1)); // pilha 1 com nv0 e nv1
  s = proximoTurnoPara(s, 0);
  s = ateTerNivel(s, 0, 0);
  s = invocar(s, 0, primeiroUidNivel(s, 0, 0), 1).estado; // pilha 2 só nv0
  s = proximaFase(s).estado; // combate

  const p = pilha(s, 0, 0);
  assert.equal(motivoNaoPodeAtacar(s, 0, p[0]!.uid, { tipo: 'jogador' }), 'só a carta de cima da pilha ataca');
  assert.notEqual(
    motivoNaoPodeAtacar(s, 0, cartaAtiva(p)!.uid, { tipo: 'jogador' }),
    'só a carta de cima da pilha ataca',
  );
});

ok('só a carta ativa do inimigo pode ser atacada', () => {
  let s = dueloNovo({ deck: [deckEscada(), deckEscada()], seed: 42 });
  s = empilharNiveis(s, 0, 0, niveisAte(1));
  s = empilharNiveis(s, 1, 0, niveisAte(1));
  s = proximoTurno(s);
  s = atePrincipal(s);
  s = proximaFase(s).estado; // combate

  const inimiga = pilha(s, 1, 0);
  const meuAtacante = cartaAtiva(pilha(s, 0, 0))!.uid;
  assert.equal(
    motivoNaoPodeAtacar(s, 0, meuAtacante, { tipo: 'carta', uid: inimiga[0]!.uid }),
    'a criatura-alvo não está no topo da pilha',
  );
  assert.equal(motivoNaoPodeAtacar(s, 0, meuAtacante, { tipo: 'carta', uid: cartaAtiva(inimiga)!.uid }), null);
});

ok('quando a ativa cai, a carta de baixo assume', () => {
  // jogador 0: pilha nv0 (sertanejo 300/250) com nv1 por cima (golem 700/1100)
  let s = dueloNovo({ deck: [deckEscada(), deckEscada()], seed: 42 });
  s = empilharNiveis(s, 0, 0, niveisAte(1));
  // jogador 1: pilha nv0 + nv1 (golem 700/1100): o golem de 700 ganha do
  // de 1100? não — quem morre é o atacante. Vamos dar um alvo forte.
  s = empilharNiveis(s, 1, 0, niveisAte(2)); // nv2 sereia-vale (atk alto)
  s = proximoTurno(s);
  s = atePrincipal(s);
  s = proximaFase(s).estado; // combate

  const minha = pilha(s, 0, 0);
  const lv0 = minha[0]!.uid;
  const ativa = cartaAtiva(minha)!;
  const alvo = cartaAtiva(pilha(s, 1, 0))!;

  // a ativa do jogador 0 é atacada pelo topo do jogador 1 só no
  // próximo turno; aqui simulamos a queda da ativa de outra forma:
  // o jogador 1 ataca e destrói a ativa do jogador 0.
  s = proximoTurnoPara(s, 1);
  s = atePrincipal(s);
  s = proximaFase(s).estado; // combate do jogador 1
  const atacante1 = cartaAtiva(pilha(s, 1, 0))!;
  const minhaAgora = cartaAtiva(pilha(s, 0, 0))!;
  assert.equal(minhaAgora.uid, ativa.uid);

  // força: se o ataque do jogador 1 derrubar a ativa, a de baixo assume
  const s2 = atacar(s, 1, atacante1.uid, { tipo: 'carta', uid: minhaAgora.uid }).estado;
  const caiu = pilha(s2, 0, 0).every((i) => i.uid !== minhaAgora.uid);
  assert.ok(caiu, 'a ativa do jogador 0 caiu');
  assert.equal(cartaAtiva(pilha(s2, 0, 0))!.uid, lv0, 'a carta de baixo ficou ativa');
  assert.equal(cartaAtiva(pilha(s2, 0, 0))!.atacou, false, 'a revelada pode atacar de novo');
  assert.ok(pilha(s2, 0, 0).length < minha.length, 'a pilha encolheu');
  assert.ok(alvo);
});

console.log('matemática do combate');
/**
 * Monta um duelo com as pilhas dos dois jogadores e entrega o estado
 * na fase de combate do jogador 0.
 */
function dueloProntos(niveisJ0: number[], niveisJ1: number[], modoJ1: Modo = 'ataque'): EstadoDuelo {
  const deck = deckDeCada(...Object.values(POR_NIVEL));
  let s = dueloNovo({ deck: [deck, deck], seed: 7 });
  s = empilharNiveis(s, 0, 0, niveisJ0);
  s = empilharNiveis(s, 1, 0, niveisJ1);
  if (modoJ1 === 'defesa') {
    s = proximoTurnoPara(s, 1);
    s = atePrincipal(s);
    s = alternarModo(s, 1, cartaAtiva(pilha(s, 1, 0))!.uid).estado;
  }
  s = proximoTurno(s);
  s = atePrincipal(s);
  return proximaFase(s).estado;
}

ok('ataque x ataque: ATK maior → alvo morre e a diferença vai na vida', () => {
  // nv1 (golem-ferro 700) contra nv0 (qualquer carta fraca)
  const s = dueloProntos(niveisAte(1), [0]);
  const atacante = cartaAtiva(pilha(s, 0, 0))!;
  const alvo = cartaAtiva(pilha(s, 1, 0))!;
  const atk = CARTAS_POR_ID[atacante.cartaId]!.atk;
  const def = CARTAS_POR_ID[alvo.cartaId]!.def;
  assert.ok(atk > def, `premissa: ${atk} > ${def}`);
  const antes = s.lp[1]!;
  const s1 = atacar(s, 0, atacante.uid, { tipo: 'carta', uid: alvo.uid }).estado;
  assert.equal(s1.lp[1], antes - (atk - def), 'a diferença vai na vida de quem perdeu a carta');
  assert.ok(pilha(s1, 1, 0).every((i) => i.uid !== alvo.uid), 'o alvo foi destruído');
  assert.ok(pilha(s1, 0, 0).some((i) => i.uid === atacante.uid), 'o atacante sobrevive');
});

ok('ataque x ataque: DEF maior → atacante morre e a diferença vai na vida dele', () => {
  // nv0 fraco contra nv1 forte (golem-ferro def 1100)
  const s = dueloProntos([0], niveisAte(1));
  const atacante = cartaAtiva(pilha(s, 0, 0))!;
  const alvo = cartaAtiva(pilha(s, 1, 0))!;
  const atk = CARTAS_POR_ID[atacante.cartaId]!.atk;
  const def = CARTAS_POR_ID[alvo.cartaId]!.def;
  assert.ok(def > atk, `premissa: def ${def} > atk ${atk}`);
  const antes = s.lp[0]!;
  const s1 = atacar(s, 0, atacante.uid, { tipo: 'carta', uid: alvo.uid }).estado;
  assert.equal(s1.lp[0], antes - (def - atk), 'a diferença vai na vida do dono do atacante');
  assert.equal(s1.lp[1], s.lp[1]!, 'o defensor não leva dano');
  assert.ok(pilha(s1, 0, 0).every((i) => i.uid !== atacante.uid), 'o atacante foi destruído');
  assert.ok(pilha(s1, 1, 0).some((i) => i.uid === alvo.uid), 'o alvo sobrevive');
});

ok('contra defesa: ATK maior → destrói o alvo sem dano', () => {
  const s = dueloProntos(niveisAte(1), [0], 'defesa');
  const atacante = cartaAtiva(pilha(s, 0, 0))!;
  const alvo = cartaAtiva(pilha(s, 1, 0))!;
  const atk = CARTAS_POR_ID[atacante.cartaId]!.atk;
  const def = CARTAS_POR_ID[alvo.cartaId]!.def;
  assert.ok(atk > def, `premissa: ${atk} > ${def}`);
  assert.equal(alvo.modo, 'defesa');
  const antes = s.lp[1]!;
  const s1 = atacar(s, 0, atacante.uid, { tipo: 'carta', uid: alvo.uid }).estado;
  assert.equal(s1.lp[1], antes, 'defesa não leva dano no jogador');
  assert.ok(pilha(s1, 1, 0).every((i) => i.uid !== alvo.uid), 'o alvo foi destruído');
  assert.ok(pilha(s1, 0, 0).some((i) => i.uid === atacante.uid), 'o atacante sobrevive');
});

ok('contra defesa: DEF maior → o atacante leva a diferença', () => {
  const s = dueloProntos([0], niveisAte(1), 'defesa');
  const atacante = cartaAtiva(pilha(s, 0, 0))!;
  const alvo = cartaAtiva(pilha(s, 1, 0))!;
  const atk = CARTAS_POR_ID[atacante.cartaId]!.atk;
  const def = CARTAS_POR_ID[alvo.cartaId]!.def;
  assert.ok(def > atk, `premissa: def ${def} > atk ${atk}`);
  assert.equal(alvo.modo, 'defesa');
  const antes = s.lp[0]!;
  const s1 = atacar(s, 0, atacante.uid, { tipo: 'carta', uid: alvo.uid }).estado;
  assert.equal(s1.lp[0], antes - (def - atk), 'o atacante rebateu a diferença');
  assert.ok(pilha(s1, 1, 0).some((i) => i.uid === alvo.uid), 'o alvo em defesa sobrevive');
  assert.ok(pilha(s1, 0, 0).some((i) => i.uid === atacante.uid), 'o atacante sobreviveu');
});

console.log('ataque direto');
ok('não ataca a vida com criaturas no campo inimigo', () => {
  const s = dueloProntos(niveisAte(1), [0]);
  assert.ok(temCriatura(s, 1));
  const atacante = cartaAtiva(pilha(s, 0, 0))!;
  assert.equal(
    motivoNaoPodeAtacar(s, 0, atacante.uid, { tipo: 'jogador' }),
    'não pode atacar a vida do inimigo enquanto ele tiver criaturas no campo',
  );
  assert.throws(() => atacar(s, 0, atacante.uid, { tipo: 'jogador' }), /criaturas no campo/);
});

ok('a regra vale igual para o jogador 2 atacando o jogador 1', () => {
  const s0 = dueloNovo({ deck: [deckEscada(), deckEscada()], seed: 7 });
  let s = empilharNiveis(s0, 0, 0, niveisAte(1));
  s = empilharNiveis(s, 1, 0, niveisAte(1));
  s = proximoTurnoPara(s, 1);
  s = atePrincipal(s);
  s = proximaFase(s).estado; // combate do jogador 1
  const atacante = cartaAtiva(pilha(s, 1, 0))!;
  assert.ok(temCriatura(s, 0));
  assert.equal(
    motivoNaoPodeAtacar(s, 1, atacante.uid, { tipo: 'jogador' }),
    'não pode atacar a vida do inimigo enquanto ele tiver criaturas no campo',
  );
});

ok('ataque direto passa com o campo inimigo vazio', () => {
  const s0 = ateCombate(dueloNovo({ deck: [deckDe('sertanejo'), deckDe('sertanejo')], seed: 42 }));
  const uid = primeiroUidNivel(s0, 0, 0);
  const atk = CARTAS_POR_ID[cartaIdDe(uid)]!.atk;
  const comGol = invocar({ ...s0, fase: 'principal' as const }, 0, uid, 0).estado;
  const combate = { ...comGol, fase: 'combate' as const };
  assert.ok(comGol.campo[1]!.every((p) => p.length === 0));
  assert.equal(motivoNaoPodeAtacar(combate, 0, uid, { tipo: 'jogador' }), null);
  const antes = comGol.lp[1]!;
  const s1 = atacar(combate, 0, uid, { tipo: 'jogador' }).estado;
  assert.equal(s1.lp[1], antes - atk);
});

ok('limpar o campo inimigo libera o ataque direto', () => {
  const s = dueloProntos(niveisAte(1), [0]);
  const atacante = cartaAtiva(pilha(s, 0, 0))!;
  const alvo = cartaAtiva(pilha(s, 1, 0))!;
  const s1 = atacar(s, 0, atacante.uid, { tipo: 'carta', uid: alvo.uid }).estado;
  assert.ok(s1.campo[1]!.every((p) => p.length === 0));
  let s2 = proximoTurno(s1);
  s2 = atePrincipal(s2);
  s2 = proximaFase(s2).estado;
  assert.equal(motivoNaoPodeAtacar(s2, 0, atacante.uid, { tipo: 'jogador' }), null);
});

console.log('level na partida');
ok('level cai 1 a cada 100 de dano cumulativo', () => {
  let s = atePrincipal(dueloNovo({ deck: [deckDe('sertanejo'), deckDe('sertanejo')], seed: 1 }));
  const lv0 = primeiroUidNivel(s, 0, 0);
  const dano = CARTAS_POR_ID[cartaIdDe(lv0)]!.atk;
  s = invocar(s, 0, lv0, 0).estado;
  s = proximaFase(s).estado; // combate
  s = atacar(s, 0, lv0, { tipo: 'jogador' }).estado;
  assert.equal(s.danoRecebido[1], dano);
  assert.equal(s.levelPartida[1], LEVEL_INICIAL - Math.floor(dano / DANO_POR_LEVEL));
});

ok('level nunca fica negativo', () => {
  let s = atePrincipal(dueloNovo({ deck: [deckEscada(), deckEscada()], seed: 1 }));
  // imperador-ruina é nível 8: precisa subir a escada inteira (9 turnos)
  s = empilharNiveis(s, 0, 0, niveisAte(8));
  const imperador = cartaAtiva(pilha(s, 0, 0))!.uid;
  for (let i = 0; i < 10 && s.vencedor === null; i++) {
    s = proximaFase(s).estado; // combate
    s = atacar(s, 0, imperador, { tipo: 'jogador' }).estado;
    if (s.vencedor === null) {
      s = proximoTurno(s);
      s = comprarCarta(s, 0).estado;
    }
  }
  assert.equal(s.levelPartida[1], 0);
});

console.log('IA');
ok('a IA joga o turno inteiro respeitando as fases', () => {
  const s0 = dueloNovo({ deck: [deckPadrao(), deckPadrao()], seed: 42 });
  const s1 = iaJogarTurno(s0);
  assert.equal(s1.vez, 1);
  assert.equal(s1.fase, 'compra');
  assert.equal(s1.turno, 2);
});

ok('a IA empilha respeitando a ordem de níveis', () => {
  const s0 = dueloNovo({ deck: [deckPadrao(), deckPadrao()], seed: 42 });
  const s1 = iaJogarTurno(s0);
  for (let z = 0; z < ZONAS; z++) {
    const p = pilha(s1, 1, z);
    if (p.length === 0) continue;
    const niveis = p.map((i) => CARTAS_POR_ID[cartaIdDe(i.uid)]!.nivel);
    for (let h = 1; h < niveis.length; h++) {
      assert.equal(niveis[h], niveis[h - 1]! + 1, `pilha ${z + 1} quebrou a ordem: ${niveis.join(',')}`);
    }
    for (const nivel of niveis) {
      assert.ok(nivel <= s1.levelPartida[1]!, `nível ${nivel} acima do level ${s1.levelPartida[1]}`);
    }
  }
});

ok('iaPassos devolve o estado a cada jogada', () => {
  const s0 = dueloNovo({ deck: [deckPadrao(), deckPadrao()], seed: 42 });
  const gen = iaPassos(s0);
  const etapas: string[] = [];
  let passo = gen.next();
  while (!passo.done) {
    etapas.push(passo.value.etapa);
    assert.ok(passo.value.estado.log.length > 0);
    passo = gen.next();
  }
  assert.ok(etapas.includes('compra'));
  assert.equal(passo.value.vez, 1);
  assert.equal(passo.value.fase, 'compra');
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
    atk: 900,
    def: 800,
    eva: 12,
  };
  assert.equal(cartaValida(carta, new Set()), null);
  salvarCartas([carta]);
  assert.equal(carregarCartas().length, 1);
  assert.equal(carregarCartas()[0]!.nome, 'Cavaleiro Teste');
  assert.match(cartaValida(carta, new Set([carta.id]))!, /já existe/);
  memoria.clear();
});

console.log(`\n${passou} testes passaram`);