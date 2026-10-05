/**
 * Admin de cartas — CRUD da coleção do jogador em localStorage.
 *
 * As cartas cadastradas aqui entram no SEU deck no próximo
 * duelo (o oponente continua com o deck padrão). Nada aqui
 * é código de regra: só armazenamento e validação de formulário.
 *
 * O localStorage não existe em Node; `carregarCartas()` devolve
 * [] quando indisponível (os testes plantam um dublê quando precisam).
 */

import type { CartaTCG } from './types.ts';
import type { Rarity } from './raridade.ts';

const CHAVE = 'imperiall-tcg:cartas:v1';

export const RARIDADES: Rarity[] = ['comum', 'incomum', 'raro', 'epico', 'lendario'];

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
