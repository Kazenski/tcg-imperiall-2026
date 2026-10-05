/**
 * Admin de cartas — CRUD da coleção do jogador.
 *
 * Arquitetura em camadas:
 *
 *   1. localStorage  → rascunho local (rápido, offline, sem config)
 *   2. cartas-admin.json no repo → coleção OFICIAL (versionada no git)
 *   3. GitHub Pages → o jogo carrega o JSON oficial no boot (fetch)
 *
 * Fluxo:
 *   - Admin clica Salvar → localStorage
 *   - Botão Exportar → baixa o cartas-admin.json (localStorage → arquivo)
 *   - Você commita o JSON no repo (ou pede: "commita as cartas")
 *   - O jogo carrega o JSON do GitHub e mescla com o localStorage
 *
 * Nada aqui é código de regra: só armazenamento e validação.
 */

import type { AlvoMecanica, CartaTCG, Mecanica, TipoCarta } from './types.ts';
import type { Rarity } from './raridade.ts';

/** Tipos que o Admin sabe cadastrar. */
const TIPOS_CARTA: TipoCarta[] = ['criatura', 'acao', 'reacao'];
/** Nomes das mecânicas implementadas em `core/efeitos.ts`. */
const MECANICAS_CONHECIDAS = new Set<string>([
  'remover-niveis',
  'rodar-pilha',
  'trocar-topo',
  'silenciar',
  'desarmar',
  'espelhar-modo',
  'empilhar-rapido',
  'ressuscitar',
  'dano-direto',
  'cavar-level',
  'congelar-level',
  'abrir-vida',
  'proteger',
]);
const ALVOS_CONHECIDOS = new Set<string>([
  'pilha-inimiga',
  'pilha-sua',
  'carta-inimiga',
  'carta-sua',
  'jogador-inimigo',
  'mao-sua',
  'cemiterio-seu',
]);

/** Opções de mecânica que o Admin oferece (nome legível). */
export const OPCOES_MECANICA: Array<{
  valor: Mecanica;
  nome: string;
  alvo: AlvoMecanica;
  ajuda: string;
}> = [
  { valor: 'remover-niveis', nome: 'Remover níveis da pilha', alvo: 'pilha-inimiga', ajuda: 'Quantos levels tirar do topo da pilha inimiga (1 a 12).' },
  { valor: 'rodar-pilha', nome: 'Rodar a pilha', alvo: 'pilha-inimiga', ajuda: 'Manda o topo da pilha inimiga para o fundo.' },
  { valor: 'trocar-topo', nome: 'Trocar topo e fundo', alvo: 'pilha-inimiga', ajuda: 'Troca o topo da pilha inimiga com a carta de baixo.' },
  { valor: 'silenciar', nome: 'Silenciar', alvo: 'carta-inimiga', ajuda: 'A carta ativa inimiga não ataca neste ciclo.' },
  { valor: 'desarmar', nome: 'Desarmar', alvo: 'carta-inimiga', ajuda: 'Força a carta ativa inimiga a modo defesa.' },
  { valor: 'espelhar-modo', nome: 'Espelhar modo', alvo: 'pilha-inimiga', ajuda: 'Copia seu modo para a carta ativa da pilha inimiga.' },
  { valor: 'empilhar-rapido', nome: 'Empilhar rápido', alvo: 'pilha-sua', ajuda: 'Empilha uma carta da sua mão sem gastar a invocação.' },
  { valor: 'ressuscitar', nome: 'Ressuscitar', alvo: 'cemiterio-seu', ajuda: 'Traz uma carta do seu Cemitério para a mão.' },
  { valor: 'dano-direto', nome: 'Dano direto', alvo: 'jogador-inimigo', ajuda: 'Quanto de dano direto na vida do oponente.' },
  { valor: 'cavar-level', nome: 'Cavar level', alvo: 'jogador-inimigo', ajuda: 'Quantos levels tira do oponente sem dano.' },
  { valor: 'congelar-level', nome: 'Congelar level', alvo: 'jogador-inimigo', ajuda: 'O oponente não sobe de level neste ciclo.' },
  { valor: 'abrir-vida', nome: 'Abrir a vida', alvo: 'jogador-inimigo', ajuda: 'Libera o ataque direto mesmo com criaturas em campo.' },
  { valor: 'proteger', nome: 'Proteger', alvo: 'carta-sua', ajuda: 'Protege a sua carta ativa. Valor = quantas cartas (1 a 5).' },
];

const CHAVE = 'imperiall-tcg:cartas:v1';

export const RARIDADES: Rarity[] = ['comum', 'incomum', 'raro', 'epico', 'lendario'];

/** URL do JSON oficial no GitHub Pages (deploy). */
export const URL_CARTAS_OFICIAL =
  'https://kazenski.github.io/tcg-imperiall-2026/cartas-admin.json';

// --- localStorage (rascunho local) -----------------------------------

/** Cartas cadastradas pelo admin. [] se nada ainda (ou sem storage). */
export function carregarCartas(): CartaTCG[] {
  try {
    const raw = localStorage.getItem(CHAVE);
    if (!raw) return [];
    const dados = JSON.parse(raw) as CartaTCG[];
    return Array.isArray(dados) ? dados.filter((c) => c != null) : [];
  } catch {
    return [];
  }
}

export function salvarCartas(cartas: CartaTCG[]): void {
  localStorage.setItem(CHAVE, JSON.stringify(cartas));
}

// --- JSON oficial (GitHub) --------------------------------------------

/**
 * Carrega o cartas-admin.json do GitHub Pages.
 * Falha silenciosa ([]) se o arquivo não existe ainda ou
 * se está offline — o localStorage cobre esse caso.
 */
export async function carregarCartasOficiais(): Promise<CartaTCG[]> {
  try {
    const resposta = await fetch(URL_CARTAS_OFICIAL, { cache: 'no-store' });
    if (!resposta.ok) return [];
    const dados = (await resposta.json()) as CartaTCG[];
    return Array.isArray(dados) ? dados.filter((c) => c != null) : [];
  } catch {
    return [];
  }
}

/**
 * Mescla o JSON oficial com o localStorage: o oficial tem
 * prioridade (é a coleção versionada); o local complementa
 * com cartas que ainda não foram commitadas.
 */
export function mesclarCartas(oficiais: CartaTCG[], locais: CartaTCG[]): CartaTCG[] {
  const porId = new Map<string, CartaTCG>();
  for (const c of locais) porId.set(c.id, c);
  for (const c of oficiais) porId.set(c.id, c); // oficial sobrescreve
  return [...porId.values()];
}

// --- Exportar / Importar -----------------------------------------------

/** Serializa as cartas como JSON bonito (para o arquivo do repo). */
export function exportarJson(cartas: CartaTCG[]): string {
  return JSON.stringify(cartas, null, 2) + '\n';
}

/** Lê um cartas-admin.json (do disco) e devolve as cartas válidas. */
export function importarJson(texto: string): CartaTCG[] {
  const dados = JSON.parse(texto) as CartaTCG[];
  if (!Array.isArray(dados)) throw new Error('o arquivo precisa ser um array de cartas');
  return dados.filter((c) => c != null && typeof c.id === 'string');
}

// --- Validação ----------------------------------------------------------

/** slug estável a partir do nome (acentos viram letras puras). */
export function idParaNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Valida os campos do formulário. Devolve o motivo ou null
 * se a carta pode ser salva.
 */
export function cartaValida(
  carta: Partial<CartaTCG>,
  idsExistentes: Set<string>,
): string | null {
  const nome = (carta.nome ?? '').trim();
  if (nome.length < 2) return 'nome precisa de ao menos 2 letras';
  const id = idParaNome(nome);
  if (id.length < 2) return 'nome precisa de ao menos 2 letras';
  if (idsExistentes.has(id)) return `já existe uma carta "${nome}" (id ${id})`;

  const nivel = carta.nivel ?? 0;
  if (!Number.isInteger(nivel) || nivel < 0 || nivel > 8) {
    return 'nível precisa ser inteiro de 0 a 8';
  }

  // Cartas de efeito não têm ATK/DEF/EVA: precisam de uma mecânica
  // conhecida do catálogo, senão o jogo não sabe o que fazer com elas.
  const tipo = carta.tipo ?? 'criatura';
  if (!TIPOS_CARTA.includes(tipo)) return 'tipo de carta inválido';
  if (tipo !== 'criatura') {
    const mec = carta.cartaMecanica;
    if (!mec) return 'escolha a mecânica da carta de efeito';
    if (!MECANICAS_CONHECIDAS.has(mec.mecanica)) return 'mecânica desconhecida';
    if (!Number.isInteger(mec.valor) || mec.valor < 0) {
      return 'o valor da mecânica precisa ser um inteiro >= 0';
    }
    if (!ALVOS_CONHECIDOS.has(mec.alvo)) return 'alvo de mecânica inválido';
    return null;
  }

  for (const campo of ['atk', 'def', 'eva'] as const) {
    const valor = carta[campo] ?? 0;
    if (!Number.isInteger(valor) || valor < 0 || valor > 99999) {
      return `${campo.toUpperCase()} precisa ser inteiro de 0 a 99999`;
    }
  }
  if (!RARIDADES.includes((carta.raridade ?? 'comum') as Rarity)) {
    return 'raridade inválida';
  }
  return null;
}
