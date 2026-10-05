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

import type { CartaTCG } from './types.ts';
import type { Rarity } from './raridade.ts';

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
