/**
 * ============================================================================
 * CARTAS DE AÇÃO E DE REAÇÃO
 * ============================================================================
 * Cartas SEM ATK, DEF e EVA. Não vão para pilha nenhuma: são
 * jogadas da mão, resolvem um efeito em um alvo e vão para o
 * Cemitério.
 *
 *   AÇÃO     só na fase Principal. Age no campo do oponente (ou no
 *            seu) e resolve na hora.
 *   REAÇÃO   só na fase de Combate. Defende um alvo e custa 1 level
 *            de uma pilha sua.
 *
 * O que cada mecânica faz está explicado em `mecanicas.ts`. Aqui
 * é só a lista de cartas e o balanceamento (faixa, raridade e
 * level exigido para usar).
 *
 * Many cartas compartilham a mecânica `remover-niveis`: o que
 * muda é o `valor` (quantos levels cai) e a raridade. Por isso o
 * jogo tem cartaz de 1 a 12 levels.
 */

import type { CartaMecanica, CartaTCG, Faixa } from '../core/types.ts';

/** Faixa de um "remover N" pelo próprio N. */
function faixaDoValor(n: number): Faixa {
  if (n <= 3) return 'fraca';
  if (n <= 6) return 'media';
  if (n <= 9) return 'forte';
  return 'devastadora';
}

/** Raridade de um "remover N". */
function raridadeDoValor(n: number): CartaTCG['raridade'] {
  if (n <= 3) return 'comum';
  if (n <= 6) return 'incomum';
  if (n <= 9) return 'raro';
  if (n <= 11) return 'epico';
  return 'lendario';
}

/** Level exigido para usar um "remover N". */
function nivelDoValor(n: number): number {
  if (n <= 3) return 0;
  if (n <= 6) return 2;
  if (n <= 9) return 4;
  if (n <= 11) return 6;
  return 8;
}

/* ------------------------------------------------------------------ *
 * REMOVER-NÍVEIS: 12 cartas, uma por quantidade.
 * ------------------------------------------------------------------ */

const NOMES_REMOVE: Record<number, string> = {
  1: 'Lasca',
  2: 'Rachadura',
  3: 'Esfarela',
  4: 'Desmoronamento',
  5: 'Ruína menor',
  6: 'Terremoto de cinzas',
  7: 'Colapso',
  8: 'Abismo',
  9: 'Aniquilação',
  10: 'Extinção',
  11: 'Apocalipse menor',
  12: 'Fim dos tempos',
};

const DESC_REMOVE: Record<number, string> = {
  1: 'Uma lasca de pedra na pilha alheia. Cai um level.',
  2: 'A pilha alheia racha e perde dois levels.',
  3: 'Pedra miúda desaba. Três levels da pilha alheia vão embora.',
  4: 'Um pedaço do muro de alguém desmorona. Quatro levels.',
  5: 'Uma ruína pequena atinge a pilha. Cinco levels.',
  6: 'Cinzas em tempestade varrem seis levels da pilha alheia.',
  7: 'Colapso total: sete levels são levados.',
  8: 'A pilha inteira desce oito degraus para o Cemitério.',
  9: 'Nove levels apagados. Não sobra quase nada em pé.',
  10: 'Dez levels: a pilha alheia some inteira.',
  11: 'Onze levels. O que restou depois disso é entulho.',
  12: 'O próprio fim do mundo, em doze levels de uma vez.',
};

const remover = (n: number): CartaTCG => ({
  id: `remover-${n}`,
  nome: NOMES_REMOVE[n]!,
  descricao: DESC_REMOVE[n]!,
  raridade: raridadeDoValor(n),
  nivel: nivelDoValor(n),
  atk: 0,
  def: 0,
  eva: 0,
  tipo: 'acao',
  cartaMecanica: {
    mecanica: 'remover-niveis',
    valor: n,
    alvo: 'pilha-inimiga',
    efeitos: ['fratura'],
    faixa: faixaDoValor(n),
    unico: true,
  },
});

/* ------------------------------------------------------------------ *
 * PROTEGER: 5 cartas, de 1 a 5 alvos. As mais fortes custam
 * caro em level para usar.
 * ------------------------------------------------------------------ */

const NOMES_PROTEGE: Record<number, string> = {
  1: 'Apoio',
  2: 'Barreira',
  3: 'Égide',
  4: 'Aurora',
  5: 'Véu do Imperador',
};

const DESC_PROTEGE: Record<number, string> = {
  1: 'Uma mão estendida no meio do golpe. Protege 1 carta.',
  2: 'Duas fileiras de escudos. Protege 2 cartas.',
  3: 'Três escudos erguidos ao mesmo tempo.',
  4: 'Quatro barrieras de luz se acendem de uma vez.',
  5: 'O véu do próprio Imperador cobre cinco cartas. Nada passa.',
};

const nivelDoProtege: Record<number, number> = { 1: 0, 2: 1, 3: 3, 4: 5, 5: 7 };
const raridadeDoProtege: Record<number, CartaTCG['raridade']> = {
  1: 'comum',
  2: 'comum',
  3: 'incomum',
  4: 'raro',
  5: 'lendario',
};

const proteger = (n: number): CartaTCG => ({
  id: `proteger-${n}`,
  nome: NOMES_PROTEGE[n]!,
  descricao: DESC_PROTEGE[n]!,
  raridade: raridadeDoProtege[n]!,
  nivel: nivelDoProtege[n]!,
  atk: 0,
  def: 0,
  eva: 0,
  tipo: 'reacao',
  cartaMecanica: {
    mecanica: 'proteger',
    valor: n,
    alvo: 'carta-sua',
    efeitos: ['escudo'],
    faixa: 'defesa',
    unico: true,
  },
});

/* ------------------------------------------------------------------ *
 * As demais mecânicas, uma carta cada.
 * ------------------------------------------------------------------ */

const OUTRAS: CartaTCG[] = [
  {
    id: 'rodar-pilha',
    nome: 'Rodar',
    descricao: 'Manda o topo da pilha alheia para o fundo. Quem estava escondido assume.',
    raridade: 'comum',
    nivel: 0,
    atk: 0,
    def: 0,
    eva: 0,
    tipo: 'acao',
    cartaMecanica: { mecanica: 'rodar-pilha', valor: 1, alvo: 'pilha-inimiga', efeitos: [], faixa: 'utilitaria' },
  },
  {
    id: 'trocar-topo',
    nome: 'Inversão',
    descricao: 'Troca a carta do topo da pilha alheia com a carta do fundo.',
    raridade: 'incomum',
    nivel: 2,
    atk: 0,
    def: 0,
    eva: 0,
    tipo: 'acao',
    cartaMecanica: { mecanica: 'trocar-topo', valor: 1, alvo: 'pilha-inimiga', efeitos: ['espelho'], faixa: 'media' },
  },
  {
    id: 'empilhar-rapido',
    nome: 'Emergir',
    descricao: 'Empilha agora uma carta da sua mão, sem gastar a invocação do turno.',
    raridade: 'incomum',
    nivel: 2,
    atk: 0,
    def: 0,
    eva: 0,
    tipo: 'acao',
    cartaMecanica: { mecanica: 'empilhar-rapido', valor: 1, alvo: 'pilha-sua', efeitos: [], faixa: 'media' },
  },
  {
    id: 'ressuscitar',
    nome: 'Ressurreição',
    descricao: 'Traz uma carta do seu Cemitério de volta para a sua mão.',
    raridade: 'incomum',
    nivel: 1,
    atk: 0,
    def: 0,
    eva: 0,
    tipo: 'acao',
    cartaMecanica: { mecanica: 'ressuscitar', valor: 1, alvo: 'cemiterio-seu', efeitos: [], faixa: 'utilitaria' },
  },
  {
    id: 'dano-direto-1',
    nome: 'Chama rápida',
    descricao: '400 de dano direto na vida do oponente, sem passar por ATK nem DEF.',
    raridade: 'comum',
    nivel: 1,
    atk: 0,
    def: 0,
    eva: 0,
    tipo: 'acao',
    cartaMecanica: { mecanica: 'dano-direto', valor: 400, alvo: 'jogador-inimigo', efeitos: [], faixa: 'utilitaria' },
  },
  {
    id: 'dano-direto-2',
    nome: 'Sopro do deserto',
    descricao: '900 de dano direto na vida do oponente.',
    raridade: 'incomum',
    nivel: 3,
    atk: 0,
    def: 0,
    eva: 0,
    tipo: 'acao',
    cartaMecanica: { mecanica: 'dano-direto', valor: 900, alvo: 'jogador-inimigo', efeitos: [], faixa: 'utilitaria' },
  },
  {
    id: 'cavar-level-1',
    nome: 'Cavar',
    descricao: 'Corta 1 de level do oponente na hora, sem ele levar dano.',
    raridade: 'raro',
    nivel: 4,
    atk: 0,
    def: 0,
    eva: 0,
    tipo: 'acao',
    cartaMecanica: { mecanica: 'cavar-level', valor: 1, alvo: 'jogador-inimigo', efeitos: [], faixa: 'forte' },
  },
  {
    id: 'cavar-level-2',
    nome: 'Desfazer alicerce',
    descricao: 'Corta 2 de level do oponente na hora.',
    raridade: 'epico',
    nivel: 6,
    atk: 0,
    def: 0,
    eva: 0,
    tipo: 'acao',
    cartaMecanica: { mecanica: 'cavar-level', valor: 2, alvo: 'jogador-inimigo', efeitos: [], faixa: 'devastadora' },
  },
  {
    id: 'congelar-level',
    nome: 'Inverno',
    descricao: 'O oponente não consegue subir de level neste ciclo.',
    raridade: 'raro',
    nivel: 4,
    atk: 0,
    def: 0,
    eva: 0,
    tipo: 'acao',
    cartaMecanica: { mecanica: 'congelar-level', valor: 1, alvo: 'jogador-inimigo', efeitos: ['trava'], faixa: 'forte', unico: true },
  },
  {
    id: 'abrir-vida',
    nome: 'Furar o cerco',
    descricao: 'Libera o ataque direto na vida do oponente mesmo com criaturas no campo dele.',
    raridade: 'raro',
    nivel: 4,
    atk: 0,
    def: 0,
    eva: 0,
    tipo: 'acao',
    cartaMecanica: { mecanica: 'abrir-vida', valor: 1, alvo: 'jogador-inimigo', efeitos: ['abrir-vida'], faixa: 'forte', unico: true },
  },
  {
    id: 'silenciar',
    nome: 'Silêncio',
    descricao: 'A carta ativa daquela pilha não pode atacar neste ciclo.',
    raridade: 'incomum',
    nivel: 2,
    atk: 0,
    def: 0,
    eva: 0,
    tipo: 'acao',
    cartaMecanica: { mecanica: 'silenciar', valor: 1, alvo: 'carta-inimiga', efeitos: ['silencio'], faixa: 'defesa', unico: true },
  },
  {
    id: 'desarmar',
    nome: 'Desarmar',
    descricao: 'Força a carta ativa daquela pilha a ficar em modo defesa até a marca sumir.',
    raridade: 'raro',
    nivel: 4,
    atk: 0,
    def: 0,
    eva: 0,
    tipo: 'acao',
    cartaMecanica: { mecanica: 'desarmar', valor: 1, alvo: 'carta-inimiga', efeitos: ['espelho'], faixa: 'forte', unico: true },
  },
  {
    id: 'espelhar-modo',
    nome: 'Espelhar',
    descricao: 'Copia o modo da sua carta ativa para a carta ativa da pilha alheia.',
    raridade: 'incomum',
    nivel: 2,
    atk: 0,
    def: 0,
    eva: 0,
    tipo: 'acao',
    cartaMecanica: { mecanica: 'espelhar-modo', valor: 1, alvo: 'pilha-inimiga', efeitos: ['espelho'], faixa: 'media', unico: true },
  },
];

/** Todas as cartas de Ação e de Reação. */
export const CARTAS_MECANICA: CartaTCG[] = [
  ...Array.from({ length: 12 }, (_, i) => remover(i + 1)),
  ...Array.from({ length: 5 }, (_, i) => proteger(i + 1)),
  ...OUTRAS,
];

/** Índice das cartas de efeito por id. */
export const MECANICAS_POR_ID: Record<string, CartaMecanica> = Object.fromEntries(
  CARTAS_MECANICA.map((c) => [c.id, c.cartaMecanica!]),
);