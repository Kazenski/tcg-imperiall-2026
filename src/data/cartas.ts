/**
 * ============================================================================
 * CONTEÚDO — CARTAS DO TCG IMPERIALL
 * ============================================================================
 * Mesmo universo dark fantasy do idle RPG (bestiário, armas de eras,
 * relíquias). Ids são ESTAVEIS: nunca mude um id já publicado.
 *
 * COMO PREENCHER (nada aqui é código, é só dado):
 *   nivel  1..8 — level exigido NA PARTIDA para invocar (0-8).
 *                 Não há gasto: só valida `levelPartida >= nivel`.
 *   atk    dano de batalha.
 *   def    absorve batalha; def alta vira escudo (rebate o excesso).
 *   eva    % de chance de esquivar um ataque (cap de 60%).
 *
 * REGRA DE BALANCEAMENTO: cartas de nível alto valem mais, mas o
 * dono precisa ser forte para invocá-las — level do dono >= nivel.
 * EVA alta + def baixa = carta frágil e esquiva (atacante a odeia).
 * ============================================================================
 */
import type { CartaTCG } from '../core/types.ts';
import { CARTAS_MECANICA } from './acoes.ts';

export const CARTAS: CartaTCG[] = [
  // -- Nível 0: o povo — invocável mesmo em level 0 -----------------
  {
    id: 'sertanejo',
    nome: 'Sertanejo',
    descricao: 'Do sertão, com um bastão e fé. Vai onde a seca mandar.',
    raridade: 'comum',
    nivel: 0,
    atk: 300,
    def: 250,
    eva: 0,
  },
  {
    id: 'gato-de-rua',
    nome: 'Gato de Rua',
    descricao: 'Ninguém sabe de onde veio. Sobrevive a tudo.',
    raridade: 'comum',
    nivel: 0,
    atk: 250,
    def: 200,
    eva: 0,
  },
  {
    id: 'tocha-vigia',
    nome: 'Tocha do Vigia',
    descricao: 'Um pau e uma chama. Melhor que nada — e às vezes suficiente.',
    raridade: 'comum',
    nivel: 0,
    atk: 350,
    def: 150,
    eva: 0,
  },
  {
    id: 'cria-morcego',
    nome: 'Cria de Morcego',
    descricao: 'Ainda aprende a voar. Já sabe se esconder.',
    raridade: 'comum',
    nivel: 0,
    atk: 200,
    def: 200,
    eva: 0,
  },
  {
    id: 'pescador',
    nome: 'Pescador do Rio',
    descricao: 'Conhece cada correnteza. E cada segredo que o rio guarda.',
    raridade: 'comum',
    nivel: 0,
    atk: 280,
    def: 220,
    eva: 0,
  },
  {
    id: 'menino-erro',
    nome: 'Menino do Erro',
    descricao: 'Dizem que ele nunca erra. Dizem.',
    raridade: 'comum',
    nivel: 0,
    atk: 320,
    def: 180,
    eva: 0,
  },
  {
    id: 'velha-moleque',
    nome: 'Velha Moleque',
    descricao: 'Rápida como um raio, teimosa como uma mula.',
    raridade: 'comum',
    nivel: 0,
    atk: 260,
    def: 240,
    eva: 0,
  },
  {
    id: 'cao-vadio',
    nome: 'Cão Vadão',
    descricao: 'Não tem dono, não tem medo, não tem paciência.',
    raridade: 'comum',
    nivel: 0,
    atk: 340,
    def: 160,
    eva: 0,
  },

  // -- Nível 1: o exército barato -----------------------------------------
  {
    id: 'recruta-espada',
    nome: 'Recruta Imperial',
    descricao: 'Aço simples do arsenal da vila. Confiável e barato.',
    raridade: 'comum',
    nivel: 1,
    atk: 900,
    def: 700,
    eva: 10,
  },
  {
    id: 'golem-ferro',
    nome: 'Golem de Ferro',
    descricao: 'Servo de pedra dos portões imperiais. Lento, mas não cede.',
    raridade: 'comum',
    nivel: 1,
    atk: 700,
    def: 1100,
    eva: 5,
  },
  {
    id: 'goblin-saqueador',
    nome: 'Goblin Saqueador',
    descricao: 'Rápido, rabugento e sempre com algo no bolso.',
    raridade: 'comum',
    nivel: 1,
    atk: 1000,
    def: 500,
    eva: 15,
  },
  {
    id: 'morcego-sombra',
    nome: 'Morcego das Sombras',
    descricao: 'Nasceu no abismo. A luz do dia é só uma lenda para ele.',
    raridade: 'comum',
    nivel: 1,
    atk: 600,
    def: 400,
    eva: 35,
  },
  {
    id: 'gato-feral',
    nome: 'Gato Feral',
    descricao: 'Ninguém sabe de onde veio. Ninguém consegue acertá-lo.',
    raridade: 'incomum',
    nivel: 1,
    atk: 650,
    def: 450,
    eva: 40,
  },
  {
    id: 'arqueiro-real',
    nome: 'Arqueiro Real',
    descricao: 'Flecha certeira desde a primeira guerra.',
    raridade: 'comum',
    nivel: 1,
    atk: 850,
    def: 600,
    eva: 12,
  },
  {
    id: 'escudeiro',
    nome: 'Escudeiro Leal',
    descricao: 'O escudo é pesado. A levidade, mais ainda.',
    raridade: 'comum',
    nivel: 1,
    atk: 500,
    def: 1200,
    eva: 5,
  },
  {
    id: 'lobo-cinzento',
    nome: 'Lobo Cinzento',
    descricao: 'A alcateia é forte. Ele é o dobro.',
    raridade: 'comum',
    nivel: 1,
    atk: 950,
    def: 550,
    eva: 18,
  },
  {
    id: 'mercenario',
    nome: 'Mercenário',
    descricao: 'Luta por ouro. Morre por ouro. Às vezes.',
    raridade: 'comum',
    nivel: 1,
    atk: 1100,
    def: 400,
    eva: 8,
  },
  {
    id: 'monge-guerra',
    nome: 'Monge da Guerra',
    descricao: 'A paz é uma arma. Ele a empunha.',
    raridade: 'incomum',
    nivel: 1,
    atk: 800,
    def: 900,
    eva: 10,
  },

  // -- Nível 2: o corpo do exército ---------------------------------------
  {
    id: 'sereia-vale',
    nome: 'Sereia do Vale',
    descricao: 'Cantam na névoa da manhã. Os que respondem, não voltam.',
    raridade: 'incomum',
    nivel: 2,
    atk: 1200,
    def: 900,
    eva: 20,
  },
  {
    id: 'espirito-abismo',
    nome: 'Espírito do Abismo',
    descricao: 'Um sussurro com garras. Atravessa armaduras.',
    raridade: 'incomum',
    nivel: 2,
    atk: 1400,
    def: 700,
    eva: 25,
  },
  {
    id: 'arqueira-vigia',
    nome: 'Arqueira da Vigia',
    descricao: 'Feita de teixo branco. Nunca erra a distância calibrada.',
    raridade: 'incomum',
    nivel: 2,
    atk: 1250,
    def: 800,
    eva: 22,
  },
  {
    id: 'elmo-abismo',
    nome: 'Elmo do Abismo',
    descricao: 'O capacete de um cavaleiro que nunca se encontrou. Só a guarda resta.',
    raridade: 'raro',
    nivel: 2,
    atk: 600,
    def: 1800,
    eva: 5,
  },
  {
    id: 'escudo-carvalho',
    nome: 'Escudo de Carvalho',
    descricao: 'Tacos reforçados com couro. Segura o primeiro golpe sempre.',
    raridade: 'raro',
    nivel: 2,
    atk: 700,
    def: 1900,
    eva: 5,
  },
  {
    id: 'cavaleiro-ferro',
    nome: 'Cavaleiro de Ferro',
    descricao: 'A armadura é dele. A guerra, também.',
    raridade: 'incomum',
    nivel: 2,
    atk: 1300,
    def: 1100,
    eva: 8,
  },
  {
    id: 'bruxa-cinzas',
    nome: 'Bruxa das Cinzas',
    descricao: 'Queima o que toca. Abraça o que queima.',
    raridade: 'incomum',
    nivel: 2,
    atk: 1350,
    def: 750,
    eva: 15,
  },
  {
    id: 'troll-ponte',
    nome: 'Troll da Ponte',
    descricao: 'Cobra pedágio em carne. Ninguém reclama.',
    raridade: 'raro',
    nivel: 2,
    atk: 1500,
    def: 1000,
    eva: 5,
  },

  // -- Nível 3: elite ------------------------------------------------------
  {
    id: 'ogro-masmorra',
    nome: 'Ogro da Masmorra',
    descricao: 'Guarda as profundezas há três séculos. Nunca dorme.',
    raridade: 'raro',
    nivel: 3,
    atk: 1700,
    def: 1200,
    eva: 8,
  },
  {
    id: 'corvo-noturno',
    nome: 'Corvo Noturno',
    descricao: 'Bica olhos antes que o relógio termine de contar.',
    raridade: 'raro',
    nivel: 3,
    atk: 1100,
    def: 800,
    eva: 30,
  },
  {
    id: 'pocao-sangue',
    nome: 'Criadouro de Sangue',
    descricao: 'Destilado da vinha vermelha do vale. Amargo, mas vital.',
    raridade: 'raro',
    nivel: 3,
    atk: 1300,
    def: 900,
    eva: 15,
  },
  {
    id: 'cavaleiro-sombra',
    nome: 'Cavaleiro Sombra',
    descricao: 'A sombra dele chega antes dele.',
    raridade: 'raro',
    nivel: 3,
    atk: 1600,
    def: 1000,
    eva: 20,
  },
  {
    id: 'golem-granito',
    nome: 'Golem de Granito',
    descricao: 'A montanha andou. A montanha luta.',
    raridade: 'raro',
    nivel: 3,
    atk: 1400,
    def: 1600,
    eva: 3,
  },
  {
    id: 'serpente-gelo',
    nome: 'Serpente de Gelo',
    descricao: 'O frio dela não mata — ele espera.',
    raridade: 'raro',
    nivel: 3,
    atk: 1550,
    def: 950,
    eva: 12,
  },

  // -- Nível 4: oficiais ---------------------------------------------------
  {
    id: 'martelo-guerra',
    nome: 'Martelo da Guerra',
    descricao: 'O martelão que ergueu as muralhas — e as derrubou depois.',
    raridade: 'epico',
    nivel: 4,
    atk: 1900,
    def: 1500,
    eva: 5,
  },
  {
    id: 'dragao-jovem',
    nome: 'Dragão Jovem',
    descricao: 'Ainda aprende a voar. Já aprendeu a queimar.',
    raridade: 'epico',
    nivel: 4,
    atk: 2100,
    def: 1700,
    eva: 10,
  },
  {
    id: 'capa-sombra',
    nome: 'Capa das Sombras',
    descricao: 'Quem a veste deixa de ser visto — até querer ser.',
    raridade: 'epico',
    nivel: 4,
    atk: 1500,
    def: 1400,
    eva: 28,
  },
  {
    id: 'mago-tempestade',
    nome: 'Mago da Tempestade',
    descricao: 'O raio obedece. A tempestade, também.',
    raridade: 'epico',
    nivel: 4,
    atk: 2000,
    def: 1200,
    eva: 15,
  },
  {
    id: 'golem-obsidiana',
    nome: 'Golem de Obsidiana',
    descricao: 'Vidro vulcânico com pés. E com fúria.',
    raridade: 'epico',
    nivel: 4,
    atk: 1800,
    def: 1600,
    eva: 4,
  },
  {
    id: 'valquiria',
    nome: 'Valquíria',
    descricao: 'Escolhe os que morrem. E os que matam.',
    raridade: 'epico',
    nivel: 4,
    atk: 2200,
    def: 1400,
    eva: 18,
  },

  // -- Nível 5: campeões ---------------------------------------------------
  {
    id: 'cavaleiro-abismo',
    nome: 'Cavaleiro do Abismo',
    descricao: 'Jurou lealdade ao trono de ruínas. Nunca mais tirou o elmo.',
    raridade: 'epico',
    nivel: 5,
    atk: 2400,
    def: 2100,
    eva: 12,
  },
  {
    id: 'sereia-rainha',
    nome: 'Rainha das Sereias',
    descricao: 'O vale inteiro é o salão dela. A coroa é de ossos.',
    raridade: 'epico',
    nivel: 5,
    atk: 2200,
    def: 2300,
    eva: 18,
  },
  {
    id: 'dragao-fogo',
    nome: 'Dragão de Fogo',
    descricao: 'O incêndio tem nome. O nome dele é este.',
    raridade: 'epico',
    nivel: 5,
    atk: 2600,
    def: 1900,
    eva: 8,
  },
  {
    id: 'colosso-ferro',
    nome: 'Colosso de Ferro',
    descricao: 'A guerra fez dele um monumento. Ele fez da guerra um esporte.',
    raridade: 'epico',
    nivel: 5,
    atk: 2300,
    def: 2500,
    eva: 3,
  },
  {
    id: 'anjo-guerra',
    nome: 'Anjo da Guerra',
    descricao: 'As asas são de espada. O julgamento, de fogo.',
    raridade: 'epico',
    nivel: 5,
    atk: 2500,
    def: 2000,
    eva: 15,
  },

  // -- Nível 6: lendas -----------------------------------------------------
  {
    id: 'dragao-antigo',
    nome: 'Dragão Antigo',
    descricao: 'Viu o império nascer e o viu virar pó. Cinzas são o prato favorito dele.',
    raridade: 'lendario',
    nivel: 6,
    atk: 2900,
    def: 2400,
    eva: 10,
  },
  {
    id: 'golem-colosso',
    nome: 'Golem Colosso',
    descricao: 'O primeiro servo de pedra. Carrega a própria muralha nas costas.',
    raridade: 'lendario',
    nivel: 6,
    atk: 2600,
    def: 2900,
    eva: 5,
  },
  {
    id: 'fenix',
    nome: 'Fênix',
    descricao: 'Morre todo nascer do sol. Renasce todo pôr.',
    raridade: 'lendario',
    nivel: 6,
    atk: 2700,
    def: 2200,
    eva: 20,
  },
  {
    id: 'leviata',
    nome: 'Leviatã',
    descricao: 'O mar tem fundo. Ele não.',
    raridade: 'lendario',
    nivel: 6,
    atk: 2800,
    def: 2300,
    eva: 8,
  },

  // -- Nível 7: raras ------------------------------------------------------
  {
    id: 'dragao-gelo',
    nome: 'Dragão de Gelo',
    descricao: 'O inverno tem dentes. Ele é o sorriso.',
    raridade: 'lendario',
    nivel: 7,
    atk: 3200,
    def: 2700,
    eva: 10,
  },
  {
    id: 'tita-guerra',
    nome: 'Titã da Guerra',
    descricao: 'A montanha que decidiu lutar.',
    raridade: 'lendario',
    nivel: 7,
    atk: 3100,
    def: 2900,
    eva: 5,
  },

  // -- Nível 8: o ápice ----------------------------------------------------
  {
    id: 'imperador-ruina',
    nome: 'Imperador da Ruína',
    descricao: 'O trono não foi destruído: ele simplesmente se levantou.',
    raridade: 'lendario',
    nivel: 8,
    atk: 3600,
    def: 3200,
    eva: 8,
  },
];

/**
 * Índice único de cartas: criaturas + cartas de Ação/Reação.
 * Todo lugar do jogo que olha uma carta por id usa este mapa.
 *
 * O Admin também escreve aqui (via `registrarCartas`), porque o core
 * das regras precisa achar a carta de um id que o jogador cadastrou.
 */
export const CARTAS_POR_ID: Record<string, CartaTCG> = Object.fromEntries(
  [...CARTAS, ...CARTAS_MECANICA].map((c) => [c.id, c]),
);

/**
 * Acrescenta cartas ao índice (usado pelo Admin no boot do jogo).
 * Official sempre vence: uma carta do mesmo id já no repositório
 * não é sobrescrita por um rascunho local.
 */
export function registrarCartas(novas: CartaTCG[]): void {
  for (const carta of novas) {
    if (CARTAS_POR_ID[carta.id]) continue;
    CARTAS_POR_ID[carta.id] = carta;
  }
}

/**
 * Deck padrão de 40 cartas: criaturas de nível 0 a 4 mais um
 * pacote inicial de cartas de Ação e de Reação.
 *
 * Criaturas (30):
 *   8 de nível 0 (o povo), 10 de nível 1, 6 de nível 2,
 *   4 de nível 3 e 2 de nível 4.
 * Efeitos (10):
 *   3 Remover (1, 4 e 8), 2 Reações (Proteger 1 e 2), e 5 utilitárias
 *   (Emergir, Ressurreição, Chama rápida, Silêncio, Espelhar).
 *
 * Cada posição vira um uid único (`id#posição`) na criação do duelo.
 */
export function deckPadrao(): string[] {
  return [
    'sertanejo', 'sertanejo',
    'gato-de-rua', 'gato-de-rua',
    'tocha-vigia', 'tocha-vigia',
    'cria-morcego', 'cria-morcego',
    'pescador', 'menino-erro',
    'velha-moleque', 'cao-vadio',
    'recruta-espada', 'recruta-espada',
    'golem-ferro', 'golem-ferro',
    'goblin-saqueador', 'goblin-saqueador',
    'morcego-sombra', 'morcego-sombra',
    'gato-feral', 'gato-feral',
    'arqueiro-real', 'escudeiro',
    'lobo-cinzento', 'mercenario',
    'monge-guerra',
    'sereia-vale', 'espirito-abismo',
    'arqueira-vigia', 'elmo-abismo',
    'escudo-carvalho', 'cavaleiro-ferro',
    'bruxa-cinzas', 'troll-ponte',

    // --- pacote de efeitos ---
    'remover-1', 'remover-4', 'remover-8',
    'proteger-1', 'proteger-2',
    'empilhar-rapido', 'ressuscitar',
    'dano-direto-1', 'silenciar', 'espelhar-modo',
  ];
}
