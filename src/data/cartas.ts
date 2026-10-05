/**
 * ============================================================================
 * CONTEÚDO — CARTAS DO TCG IMPERIALL
 * ============================================================================
 * Mesmo universo dark fantasy do idle RPG (bestiário, armas de eras,
 * relíquias). Ids são ESTAVEIS: nunca mude um id já publicado.
 *
 * COMO PREENCHER (nada aqui é código, é só dado):
 *   nivel  1..8 — custo em pontos de level do turno E requisito do
 *                 level do dono (o nível do herói do idle RPG).
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

/** Lookup por id — o índice do deck é o id da carta. */
export const CARTAS_POR_ID: Record<string, CartaTCG> = Object.fromEntries(
  CARTAS.map((c) => [c.id, c]),
);

/**
 * Deck padrão de 20 cartas: 8 de nível 0 (o povo), 6 de
 * nível 1, 4 de nível 2-3 e 2 de nível 2-4. Cada posição
 * vira um uid único (`id#posição`) na criação do duelo.
 */
export function deckPadrao(): string[] {
  return [
    'sertanejo', 'sertanejo',
    'gato-de-rua', 'gato-de-rua',
    'tocha-vigia', 'tocha-vigia',
    'cria-morcego', 'cria-morcego',
    'recruta-espada', 'recruta-espada',
    'golem-ferro', 'golem-ferro',
    'goblin-saqueador', 'goblin-saqueador',
    'sereia-vale',
    'espirito-abismo',
    'arqueira-vigia',
    'ogro-masmorra',
    'elmo-abismo',
    'dragao-jovem',
  ];
}
