/**
 * ============================================================================
 * CATÁLOGO DE MECÂNICAS — CARTAS DE AÇÃO E DE REAÇÃO
 * ============================================================================
 * Aqui está escrito, em português claro, **o que cada mecânica
 * faz**. Não é a lista das cartas: são as mecânicas. Várias cartas
 * compartilham a mesma mecânica mudando `valor` (por exemplo,
 * `remover-niveis` com valor 1 tira um level, com valor 12 tira
 * doze).
 *
 * A execução de cada uma fica em `src/core/efeitos.ts`; aqui é só a
 * explicação e o balanceamento.
 *
 * FAIXAS (usadas para equilibrar e explicadas no tutorial):
 *   fraca        1–3 levels — pequeno arranjo, quase sempre feio
 *   media        4–6 levels — abre a pilha de meio
 *   forte        7–9 levels — derruba a pilha inteira do oponente
 *   devastadora  10–12    — apaga tudo que estiver no topo
 *   defesa       protege ou trava; não destrói nada
 *   utilitaria   dano, level e cartas: muda o relógio, não a pilha
 *
 * ALVOS:
 *   pilha-inimiga / pilha-sua   uma das 5 pilhas (a carta do topo)
 *   carta-inimiga / carta-sua   uma carta específica (tem que ser a
 *                               ativa da sua pilha)
 *   jogador-inimigo             o próprio jogador (level, dano)
 *   mao-sua                     uma carta da sua mão
 *   cemiterio-seu               uma carta do seu Cemitério
 */

import type { AlvoMecanica, CartaMecanica, EfeitoMarca, Faixa, Mecanica } from '../core/types.ts';

/** Uma mecânica, com o texto que explica o que ela faz. */
export interface FichaMecanica {
  mecanica: Mecanica;
  /** Nome curto da mecânica (aparece no Admin e no tutorial). */
  nome: string;
  /** Explicação do que acontece, em uma frase. */
  efeito: string;
  /** O que o jogador precisa escolher como alvo. */
  alvo: AlvoMecanica;
  faixa: Faixa;
  /** Marcas que a mecânica deixa no alvo. */
  efeitos: EfeitoMarca[];
  /** Se só pode existir uma marca igual por alvo. */
  unico: boolean;
  /** Observação de balanceamento / regra especial. */
  notas?: string;
}

export const MECANICAS: FichaMecanica[] = [
  // =====================================================================
  // REDUÇÃO DE PILHA — as que pedem para derrubar levels do oponente
  // =====================================================================
  {
    mecanica: 'remover-niveis',
    nome: 'Remover níveis',
    efeito:
      'Tira cartas do TOPO da pilha alvo, uma por level, e envia cada uma para o Cemitério. Reduzir uma pilha de level 5 para 3 entrega de graça as cartas de nível 5 e 4 para o Cemitério dele.',
    alvo: 'pilha-inimiga',
    faixa: 'fraca',
    efeitos: ['fratura'],
    unico: true,
    notas:
      'Vale por N: uma carta com valor 1 remove 1, com valor 12 remove 12. Se a pilha tiver menos cartas que N, ela é esvaziada.',
  },
  {
    mecanica: 'rodar-pilha',
    nome: 'Rodar a pilha',
    efeito:
      'Manda a carta do TOPO da pilha alvo para o FUNDO dela. A carta de baixo vira a ativa de graça — útil para se livrar de uma carta de topo morta sem gastar invocação.',
    alvo: 'pilha-inimiga',
    faixa: 'utilitaria',
    efeitos: [],
    unico: false,
    notas: 'Se a pilha tiver só uma carta, nada acontece (não há para trocar).',
  },
  {
    mecanica: 'trocar-topo',
    nome: 'Trocar topo e fundo',
    efeito:
      'Troca de lugar a carta do topo da pilha alvo com a carta do fundo. O que estava escondido assume o comando da pilha.',
    alvo: 'pilha-inimiga',
    faixa: 'media',
    efeitos: ['espelho'],
    unico: false,
    notas: 'Precisa de pelo menos 2 cartas na pilha.',
  },

  // =====================================================================
  // PILHA SUA — construir mais rápido
  // =====================================================================
  {
    mecanica: 'empilhar-rapido',
    nome: 'Empilhar rápido',
    efeito:
      'Empilha na hora uma carta da sua mão na pilha que você escolher, sem gastar a invocação do turno. A regra de ordem de níveis continua valendo: a pilha só aceita o próximo nível.',
    alvo: 'pilha-sua',
    faixa: 'media',
    efeitos: [],
    unico: false,
    notas:
      'Exige que você tenha uma carta na mão cujo nível caiba na pilha alvo. O texto pede a carta da mão; a mecânica revalida antes de resolver.',
  },
  {
    mecanica: 'ressuscitar',
    nome: 'Ressuscitar',
    efeito: 'Traz uma carta do seu Cemitério de volta para a sua mão.',
    alvo: 'cemiterio-seu',
    faixa: 'utilitaria',
    efeitos: [],
    unico: false,
    notas: 'Se for uma carta de Ação ou Reação, ela volta como mão e pode ser usada de novo.',
  },

  // =====================================================================
  // O RELÓGIO — dano, level e abertura da vida
  // =====================================================================
  {
    mecanica: 'dano-direto',
    nome: 'Dano direto',
    efeito:
      'Causa dano direto na vida do oponente, furando a regra do "campo vazio". Não passa por ATK nem por DEF.',
    alvo: 'jogador-inimigo',
    faixa: 'utilitaria',
    efeitos: [],
    unico: false,
    notas: 'O valor é a quantidade de dano. O dano acumulado também derruba o level do oponente.',
  },
  {
    mecanica: 'cavar-level',
    nome: 'Cavar level',
    efeito:
      'O level do oponente desce na hora, sem precisar levar dano. Cada level cortado leva junto as cartas de nível mais alto que ele já não pode invocar.',
    alvo: 'jogador-inimigo',
    faixa: 'forte',
    efeitos: [],
    unico: false,
    notas: 'Nunca cai abaixo de 0. Não soma para o dano acumulado.',
  },
  {
    mecanica: 'congelar-level',
    nome: 'Congelar level',
    efeito:
      'O oponente não consegue subir level neste ciclo, então não consegue empilhar nada. A marca sai sozinha na Finalização seguinte.',
    alvo: 'jogador-inimigo',
    faixa: 'forte',
    efeitos: ['trava'],
    unico: true,
  },
  {
    mecanica: 'abrir-vida',
    nome: 'Abrir a vida',
    efeito:
      'Libera o ataque direto na vida do oponente mesmo com criaturas no campo dele, até a marca expirar. É o jeito de furar a regra mais dura do jogo.',
    alvo: 'jogador-inimigo',
    faixa: 'forte',
    efeitos: ['abrir-vida'],
    unico: true,
    notas: 'Guardada como marca no jogador, não numa carta. Reutilizável enquanto durar.',
  },

  // =====================================================================
  // CONTROLE — silenciar, desarmar e espelhar
  // =====================================================================
  {
    mecanica: 'silenciar',
    nome: 'Silenciar',
    efeito:
      'A carta ativa daquela pilha não pode atacar neste ciclo. A marca some na Finalização seguinte.',
    alvo: 'carta-inimiga',
    faixa: 'defesa',
    efeitos: ['silencio'],
    unico: true,
    notas: 'Só afeta a carta ATIVA (a de cima) da pilha alvo.',
  },
  {
    mecanica: 'desarmar',
    nome: 'Desarmar',
    efeito:
      'A carta ativa daquela pilha é forçada a modo DEFESA e fica assim até a marca expirar. Ela não ataca enquanto estiver desarmada.',
    alvo: 'carta-inimiga',
    faixa: 'forte',
    efeitos: ['espelho'],
    unico: true,
    notas: 'Some na Finalização seguinte, e a carta volta ao modo que tinha antes.',
  },
  {
    mecanica: 'espelhar-modo',
    nome: 'Espelhar modo',
    efeito:
      'Copia o modo (ataque ou defesa) da sua carta ativa para a carta ativa da pilha alvo.',
    alvo: 'pilha-inimiga',
    faixa: 'media',
    efeitos: ['espelho'],
    unico: true,
    notas: 'A troca não expira: fica até o final do duelo.',
  },

  // =====================================================================
  // REAÇÃO — a única jogada na fase de Combate
  // =====================================================================
  {
    mecanica: 'proteger',
    nome: 'Proteger',
    efeito:
      'A SUA carta ativa não pode ser alvo de ataque neste ciclo. Enquanto a marca estiver lá, o oponente não consegue nem escolhê-la como alvo.',
    alvo: 'carta-sua',
    faixa: 'defesa',
    efeitos: ['escudo'],
    unico: true,
    notas:
      'Reação só pode ser jogada na fase de Combate (a sua), e custa 1 level de uma pilha sua: escolha uma pilha e a carta do topo dela vai para o Cemitério. Cuidado para não pagar o custo na mesma pilha que você está protegendo. Proteger várias cartas ao mesmo tempo exige usar várias Reações.',
  },
];

export const MECANICAS_POR_NOME: Record<Mecanica, FichaMecanica> = Object.fromEntries(
  MECANICAS.map((m) => [m.mecanica, m]),
) as Record<Mecanica, FichaMecanica>;

/** Texto curto que explica o que a mecânica faz (log e tutorial). */
export function explicarMecanica(mec: CartaMecanica): string {
  const ficha = MECANICAS_POR_NOME[mec.mecanica];
  if (!ficha) return '';
  if (mec.valor > 1 && mec.mecanica === 'remover-niveis') {
    return `remove ${mec.valor} levels do topo da pilha alvo`;
  }
  if (mec.valor > 1 && mec.mecanica === 'dano-direto') {
    return `causa ${mec.valor} de dano direto na vida do oponente`;
  }
  if (mec.valor > 1 && mec.mecanica === 'proteger') {
    return `protege ${mec.valor} cartas alvo do ataque`;
  }
  if (mec.valor > 1 && mec.mecanica === 'cavar-level') {
    return `corta ${mec.valor} de level do oponente`;
  }
  return ficha.efeito;
}

/** Faixa da mecânica (a da ficha, já que a faixa não muda por carta). */
export function faixaDe(mec: Mecanica): Faixa {
  return MECANICAS_POR_NOME[mec]?.faixa ?? 'utilitaria';
}