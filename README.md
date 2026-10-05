# Imperiall TCG

Duelo de cartas do universo **Imperiall** (o mesmo mundo dark
fantasy do [imperiall idle](https://github.com/Kazenski/jogo_idle_imperiall_2026)):
criaturas com **ATK, DEF e EVA**, invocadas pelo **level da partida**.
Roda no navegador como PWA (instalável, offline).

**Inspiração:** a dinâmica de duelo de *Yu-Gi-Oh! Forbidden
Memories Recompiled* — campo com zonas, invocação por nível,
turnos, batalha entre criaturas — recriada do zero para a web.

## O duelo

- Deck de **20** cartas (pode crescer com as do admin), mão
  inicial de **5**, campo de **5** zonas.
- **LP 4000**: vence quem zerar o LP do oponente (ou quem
  ficar sem deck — *deck-out*).
- **Invocar NÃO GASTA**: basta ter **level da partida ≥ nível
  da carta** e uma zona livre. Cartas de **nível 0** existem
  para o duelo acontecer mesmo em level 0.
- **Level na partida**: começa em **10** e **só desce** — a cada
  **100 de dano recebido cumulativo**, cai 1 (mínimo 0).
- **Modo ataque/defesa** (cada criatura ataca 1× por turno):
  - alvo em **ataque**: atk>def destrói e fere a diferença;
    atk<def destrói o atacante e rebate a diferença; empate
    destrói ambos.
  - alvo em **defesa**: atk>def destrói **sem dano** ao jogador;
    atk<def o alvo sobrevive e o atacante toma a diferença;
    empate não faz nada.
  - ataque direto ao jogador sempre acerta (dano = atk).
- **EVA** está **reservada** para cartas de efeitos especiais
  (mágicas/armadilhas) — não afeta o combate.

## Admin de cartas

O botão **Admin** abre o cadastro: nome, descrição, raridade,
nível exigido (0-8), ATK, DEF e EVA. As cartas salvas
(localStorage) entram no **seu deck** no próximo duelo; o
opponente continua com o deck padrão.

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
  core/   ← regras puras, sem DOM, determinísticas (seed no estado)
  data/   ← conteúdo: as cartas (é só dado, não código)
  ui/     ← DOM/CSS: campo, mão, HUD, log, admin
testes/   ← testes do núcleo (npm test)
```

Consequências práticas:

- O duelo inteiro é **dado puro e serializável** — cabe num
  JSON, o que futuramente permite save, replay e multiplayer.
- O RNG tem **seed no estado**: mesma seed + mesmas ações =
  mesma partida. Por isso os testes reproduzem cada regra de
  forma confiável.
- A UI **não decide nada**: cada ação vem do `core/` como um
  estado novo. Trocar DOM por Canvas/Phaser não toca em regra.
- A IA do oponente (`core/ia.ts`) é só mais um consumidor
  do core — substituível por rede no futuro.
- O admin (`core/admin.ts`) é CRUD puro de localStorage —
  as cartas cadastradas entram no deck do jogador.

## Próximos passos (ideias)

- [ ] Cartas mágicas/armadilhas (consomem a EVA)
- [ ] Deck builder (montar seu deck de 20)
- [ ] Progressão: ganhar level de dono com duelos (liga com o idle)
- [ ] Phaser: animações de ataque e defesa
- [ ] Save de duelos e coleção no localStorage

## Licença

MIT — código e textos. O universo Imperiall é seu; as cartas
são conteúdo original do projeto.
