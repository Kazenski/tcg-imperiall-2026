# Imperiall TCG

Duelo de cartas do universo **Imperiall** (o mesmo mundo dark
fantasy do [imperiall idle](https://github.com/Kazenski/jogo_idle_imperiall_2026)):
criaturas com **ATK, DEF e EVA**, invocadas pelo **level do dono**.
Roda no navegador como PWA (instalável, offline).

**Inspiração:** a dinâmica de duelo de *Yu-Gi-Oh! Forbidden
Memories Recompiled* — campo com zonas, invocação por custo,
turnos, batalha entre criaturas — recriada do zero para a web.

## O duelo

- Deck de **20** cartas, mão inicial de **5**, campo de **5** zonas.
- **LP 4000**: vence quem zerar o LP do oponente (ou quem
  ficar sem deck — *deck-out*).
- **Invocar** custa o **nível da carta** em pontos de level
  e exige **level do dono ≥ nível da carta**.
  Pontos por turno = `3 + level do dono ÷ 10`.
- **Batalha** (cada criatura ataca 1× por turno):
  - a criatura-alvo rola sua **EVA** (cap 60%) — se esquivar, nada acontece;
  - **atk > def**: alvo destruído, dano = diferença;
  - **def > atk**: atacante destruído, dano rebatido = diferença;
  - **empate**: ambas destruídas;
  - ataque direto ao jogador sempre acerta (dano = atk).

## Rodando

```sh
cd tcg-imperiall-2026
npm install
npm run dev      # http://localhost:5173
npm test         # regras do core, em Node puro
npm run build    # typecheck + build estático
```

## Decisões de arquitetura

Mesmo padrão do idle RPG:

```
src/
  core/   ← regras puras, sem DOM, determinísticas (seed)
  data/   ← conteúdo: as cartas (é só dado, não código)
  ui/     ← DOM/CSS: campo, mão, HUD, log
testes/   ← testes do núcleo (npm test)
```

Consequências práticas:

- O duelo inteiro é **dado puro e serializável** — cabe num
  JSON, o que futuramente permite save, replay e multiplayer.
- O RNG tem **seed no estado**: mesma seed + mesmas ações =
  mesma partida. Por isso os testes reproduzem "a criatura
  esquivou" de forma confiável.
- A UI **não decide nada**: cada ação vem do `core/` como um
  estado novo. Trocar DOM por Canvas/Phaser não toca em regra.
- A IA do oponente (`core/ia.ts`) é só mais um consumidor
  do core — substituível por rede no futuro.

## Próximos passos (ideias)

- [ ] Cartas mágicas/armadilhas (efeitos além de ATK/DEF/EVA)
- [ ] Modo ataque/defesa por criatura (defesa não rebate)
- [ ] Deck builder (montar seu deck de 20)
- [ ] Progressão: ganhar level de dono com duelos (liga com o idle)
- [ ] Phaser: animações de ataque e EVA
- [ ] Save de duelos e coleção no localStorage

## Licença

MIT — código e textos. O universo Imperiall é seu; as cartas
são conteúdo original do projeto.
