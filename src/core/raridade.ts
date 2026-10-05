/**
 * Raridade compartilhada com o idle RPG (mesma ordem de tiers).
 */

export type Rarity = 'comum' | 'incomum' | 'raro' | 'epico' | 'lendario';

export const RARITY_ORDER: Rarity[] = ['comum', 'incomum', 'raro', 'epico', 'lendario'];

/** Ícone/classe CSS por raridade, para a moldura da carta. */
export const RARITY_CLASS: Record<Rarity, string> = {
  comum: 'rar-comum',
  incomum: 'rar-incomum',
  raro: 'rar-raro',
  epico: 'rar-epico',
  lendario: 'rar-lendario',
};
