# Imperiall TCG

Duelo de cartas do universo **Imperiall** (o mesmo mundo dark
fantasy do [imperiall idle](https://github.com/Kazenski/jogo_idle_imperiall_2026)):
criaturas com **ATK, DEF e EVA**, invocadas pelo **level da partida**.
Roda no navegador como PWA (instalável, offline).

**Jogue em:** <https://kazenski.github.io/tcg-imperiall-2026/>

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
  **100 de dano recebido cumulativo**, cai 1 (mínimum 0).
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
nível exigido (0-8), ATK, DEF e EVA. As cartas salvas entram no
**seu deck** no próximo duelo; o oponente continua com o deck
padrão.

### Arquitetura da coleção (3 camadas)

```
┌─────────────────────┐
│ data/cartas-admin.json │  ← OFICIAL: versionada no git
│ (no repo)              │     (deploy via GitHub Pages)
└──────────┬──────────┘
           │ fetch no boot
┌──────────▼──────────┐
│ Jogo (navegador)    │  ← mescla oficial + local
└──────────┬──────────┘
           │ salvar/remover
┌──────────▼──────────┐
│ localStorage        │  ← rascunho local (offline)
└─────────────────────┘
```

**Fluxo de sincronização:**

1. **Salvar** no admin → grava no `localStorage` (rápido, offline)
2. **Exportar JSON** → baixa o `cartas-admin.json`
3. **Commit no repo** → versiona as cartas (ou peça: *"commita as cartas"*)
4. **Deploy** → o jogo carrega o JSON oficial no boot e mescla com o local

| Camada | Onde | Prós | Contras |
|---|---|---|---|
| **localStorage** | navegador | Offline, zero config | Só naquele navegador |
| **cartas-admin.json** | repo (git) | Versionado, compartilhado | Precisa commit + deploy |
| **Firebase** (futuro) | nuvem | Sincroniza em tempo real | Requer projeto + regras |

Para brincar, o **GitHub é o mais prático**: sem configuração,
com histórico de cada carta no git.

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
- O admin (`core/admin.ts`) é CRUD puro: localStorage para o
  rascunho, JSON no repo para a coleção oficial.

## Deploy

**GitHub Actions** (não branch `gh-pages`): o workflow
`.github/workflows/pages.yml` roda a cada push na `main`,
faz `npm ci` + `npm run build` e publica o `dist/`. O Pages
precisa estar com **Source = GitHub Actions** (Settings → Pages).

## Próximos passos (ideias)

- [ ] Cartas mágicas/armadilhas (consomem a EVA)
- [ ] Deck builder (montar seu deck de 20)
- [ ] Progressão: ganhar level de dono com duelos (liga com o idle)
- [ ] Phaser: animações de ataque e defesa
- [ ] Save de duelos e coleção no localStorage

## Licença

MIT — código e textos. O universo Imperiall é seu; as cartas
são conteúdo original do projeto.
