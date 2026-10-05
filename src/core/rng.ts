/**
 * RNG com seed, para o duelo ser determinístico e testável.
 *
 * O estado guarda só o número da seed; cada sorteio avança. Duas partidas
 * com a mesma seed e as mesmas ações têm exatamente os mesmos resultados —
 * é o que permite testar "a criatura esquivou" de forma reproduzível.
 */

export interface Rng {
  /** Próximo float em [0, 1). */
  proximo(): number;
  /** true com probabilidade `p` (0..1). */
  chance(p: number): boolean;
}

/** mulberry32: pequeno, rápido e suficiente para um jogo de cartas. */
export function rngCriar(seed: number): Rng {
  let a = seed >>> 0;
  const proximo = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    proximo,
    chance: (p: number) => proximo() < p,
  };
}
