# Relatório — Fase 2 (Navegação V2)

**Status: aprovado, as duas checagens pré-publicação passaram (uma delas achou um problema real e foi corrigida — seção 5.3), pronto para commit/push.** Este documento é publicado junto com o código nesse mesmo commit.

---

## 1. O que foi feito, em uma frase

A navegação (menu desktop + menu mobile) foi reorganizada para a arquitetura V2 aprovada — 7 áreas de primeiro nível, um menu específico por perfil (8 perfis, 8 listas diferentes) — sem apagar nenhum arquivo, sem mexer em nenhuma tela por dentro, e sem tocar em uma vírgula da matriz de permissões da Fase 1.

---

## 2. Mapa do menu — antes → depois

### Antes (binário: um menu "cheio" com grupos + um menu "reduzido" pra Produção/Montador)

**MENU (Admin/PCP/Líder/Gestor/Assistência — cada um via o que a permissão liberava, mas a lista de origem era esta mesma pra todos):**

| Grupo | Itens |
|---|---|
| *(sem grupo)* | Hoje |
| Produção | Produção · Obras · Pendências · Para Finalizar · Tarefas · Lotes · Montagem · Assistências |
| Gestão | Indicadores · Desempenho · Auditoria · Calendário |
| Chão de fábrica | Chão de Fábrica · Painel TV · Minha Produção |
| *(rodapé)* | Equipe · Configurações |

**MENU_OPERADOR (Produção/Montador):**

| Grupo | Itens |
|---|---|
| *(sem grupo)* | Minha Produção |
| Meu trabalho | Produção · Minhas Tarefas · Minhas Pendências · Assistências · Calendário |
| *(rodapé)* | Equipe |

Mobile usava uma quinta lista fixa própria (`Hoje · Produção · Pendências · Tarefas · Eu`) pra quem não era Produção/Montador, ou uma lista mobile dedicada (`MOBILE_NAV_OPERADOR`) pra quem era — ou seja, **4 fontes de dados diferentes** (MENU, MENU_OPERADOR, nav mobile fixa, MOBILE_NAV_OPERADOR) que podiam divergir entre si.

### Depois (V2: uma lista por perfil, mesma fonte pro desktop e pro mobile)

| Perfil | Menu (nesta ordem) |
|---|---|
| **ADMIN** | Hoje · Obras · Pendências · Montagem · Assistências · Agenda · **Admin** |
| **GESTOR** | Hoje · Obras · Pendências · Montagem · Assistências · Agenda |
| **PCP** | Hoje · Obras · Pendências · Montagem · Agenda |
| **LÍDER** (LIDERANCA) | Hoje · Obras · Pendências · Montagem · Agenda |
| **PRODUÇÃO** (OPERADOR) | Hoje · Pendências |
| **MONTADOR** | Hoje · **Minhas Obras** · Agenda · Pendências |
| **ASSISTÊNCIA** | Hoje · **Atendimentos** · Agenda · Pendências |
| **TV** | *(sem menu — superfície separada, kiosk)* |

Confirmado ao vivo via Playwright (desktop **e** mobile, incluindo 375px e 360px) pra cada um dos 7 perfis com menu — ver seção 5.

**Uma exceção pontual na barra mobile, só pro Admin (7 itens):** em vez de espremer os 7 num único fundo de tela ou depender de rolagem sem nenhuma pista visual, os 5 primeiros (Hoje/Obras/Pendências/Montagem/Assistências) ficam soltos na barra e os 2 últimos (Agenda/Admin) entram atrás de um botão "Mais" — exatamente a preferência que você indicou na aprovação. Detalhe completo na seção 5.3 (foi um problema real, achado e corrigido antes do publish, não só uma medida preventiva).

Indicadores / Desempenho / Auditoria / Equipe / Configurações não desapareceram: passaram a viver dentro do hub **Admin** (só pra quem tem pelo menos uma das 4 permissões administrativas), em vez de serem itens soltos de topo.

---

## 3. Rotas que continuam respondendo como alias (fora do menu)

Nenhuma dessas rotas foi apagada — só saíram da navegação. Digitar a URL direto ainda funciona, e ainda respeita o guard de permissão da Fase 1 exatamente como respeitava antes (testado — seção 5):

| Rota legada | Ainda responde? | Permissão exigida (inalterada) | Pra onde "migra" conceitualmente |
|---|---|---|---|
| `#/producao` | Sim | `producao.ver` | Hoje + Obras |
| `#/para-finalizar` | Sim | `montagem.ver` | Hoje + Montagem |
| `#/meu-painel` | Sim | *(livre)* | Hoje contextual |
| `#/tarefas` | Sim | *(livre)* | contexto de Hoje/Obra/Pendência |
| `#/lotes` | Sim | *(livre)* | fora da navegação Moodo |
| `#/indicadores` | Sim | `admin.indicadores` | Admin |
| `#/desempenho` | Sim | `admin.indicadores` | Admin |
| `#/auditoria` | Sim | `admin.auditoria` | Admin |
| `#/calendario` | Sim | `agenda.ver` | Agenda (rótulo novo, mesma tela) |
| `#/equipe` | Sim | `admin.equipe` | Admin |
| `#/configuracoes` | Sim | `admin.configuracoes` | Admin |
| `#/dashboard` | Sim | *(livre)* | Hoje (já era alias antes da Fase 2) |
| `#/chao-de-fabrica` | Sim | *(sem guard — quiosque)* | continua até a Fase 9, fora do menu |
| `#/tv` | Sim | *(sem guard — quiosque)* | continua até a Fase 9, fora do menu |

Nenhum link novo aponta pra essas rotas. Nenhuma delas aparece em `M.Router.menuDoPerfil(...)` pra nenhum dos 8 perfis (testado estruturalmente).

**Rotas novas** (todas reaproveitando tela e permissão já existentes — nenhuma tabela, tela ou permissão nova):

| Rota nova | Tela por trás | Permissão (já existia desde a Fase 1) |
|---|---|---|
| `#/minhas-obras` | `M.Pages.obras(true)` — mesma tela de Obras, filtro restrito forçado | `obra.verAtribuidas` |
| `#/atendimentos` | `M.Pages.assistencias(true)` — mesma tela de Assistências, só rótulo | `assistencia.ver` |
| `#/agenda` | `M.Pages.calendario()` — mesmo Calendário de sempre | `agenda.ver` |
| `#/admin` | `M.Pages.adminHub()` — hub novo, temporário (links pras 5 telas antigas) | qualquer uma das 4: `admin.equipe` / `admin.configuracoes` / `admin.indicadores` / `admin.auditoria` |

---

## 4. Arquivos alterados

| Arquivo | O que mudou |
|---|---|
| `js/router.js` | Menu binário (MENU/MENU_OPERADOR/FOOTER/FOOTER_OPERADOR) trocado por `MENU_ITEMS` + `MENU_POR_PERFIL` + `menuDoPerfil(perfilKey)`. `ROUTES`/`ROUTE_PERMS` só ganharam 4 entradas novas (minhas-obras/atendimentos/agenda/admin) — todas as antigas continuam intactas. Comentário do item `atendimentos` reforçado (checagem 2 — seção 5.4). |
| `js/main.js` | `navHtml()` reescrito pra ler de `M.Router.menuDoPerfil(colab.perfil)` (desktop e mobile, mesma fonte). `footerHtml()` removido (não existe mais rodapé separado — Admin agora é um item de menu normal). `isOperador()` removido. `DOMContentLoaded` simplificado: todo perfil cai em `#/hoje` (antes: Produção/Montador caíam em `#/meu-painel`). **Ajuste pós-aprovação (checagem 1):** acima de 6 itens, a barra mobile mostra os 5 primeiros + botão "Mais"; `render()` fecha o painel "Mais" sozinho em toda navegação real. Versão do app: 3.6.1 → 3.7.0. |
| `js/actions.js` | **Novo nesta rodada.** `M.UIState.mobileMaisAberto` (estado do painel "Mais") + `Act.toggleMobileMais()` — mesmo padrão já usado por todos os outros toggles de UI do app (`Act.setKanbanView`, `Act.togglePendExpandido` etc.), nada inventado. |
| `js/ui.js` | **Novo nesta rodada.** Ícone `more-horizontal` (3 pontinhos) pro botão "Mais" — mesmo estilo linear dos outros ícones do set. |
| `js/pages/adminHub.js` | **Novo.** Hub temporário: cartões pra Indicadores/Desempenho/Auditoria/Equipe/Configurações, cada um só aparece se o usuário tiver a permissão correspondente. Não é o Admin V2 (isso é Fase 8) — é só o ponto único de entrada pedido pra esta fase. |
| `js/pages/obras.js` | `M.Pages.obras()` ganhou parâmetro opcional `forcarMinhas` — quando true, força a visão restrita (mesma lógica que já existia pra quem não tem `verTodasObras`) e troca só o título/legenda pra "Minhas Obras". Nenhuma tabela nova, nenhum dado novo. |
| `js/pages/assistencias.js` | `M.Pages.assistencias()` ganhou parâmetro opcional `comoAtendimentos` — troca só o título pra "Atendimentos". Mesmo dado, mesma tela. **Comentário de aviso explícito adicionado** (checagem 2 — seção 5.4): isso não é a Assistência V2/mobile final. |
| `index.html` | 1 linha: `<script src="js/pages/adminHub.js">`. |
| `service-worker.js` | Cache da PWA: `v3.6.1` → `v3.7.0` (força os usuários a baixarem a versão nova) + `adminHub.js` na lista de arquivos do shell. |
| `css/styles.css` | `.mobile-nav` ganhou rolagem horizontal (`overflow-x:auto`, rede de segurança) + **ajuste pós-aprovação (checagem 1):** estilos novos do botão "Mais" (`.m-mais`) e do painel que ele abre (`.mobile-mais-painel`, `.mobile-mais-item`, `.mobile-mais-backdrop`). |
| `tests/regressions.js` | Testes que dependiam da estrutura antiga (MENU/MENU_OPERADOR/FOOTER) reescritos pra nova API `menuDoPerfil()`. +215 linhas de teste novo cobrindo tudo da lista de "testes obrigatórios" (seção 5). |
| `tests/fase2-playwright.js` | Ferramenta de QA (não faz parte do app — não vai no commit). Ganhou nesta rodada: verificação do botão/painel "Mais", e uma passada dedicada em 375px/360px pra todos os perfis (checagem 1). |

**Nada foi apagado.** `git status`/`git diff --stat origin/main` confirmam: 10 arquivos modificados, 2 novos no commit (`adminHub.js`, `RELATORIO-FASE-2.md`) — **zero arquivos removidos** (0 linhas de "delete" no diff contra `origin/main`). `tests/fase2-playwright.js` e `tests/screenshots/` ficam de fora do commit (ferramenta de QA e capturas, mesmo padrão de não versionar isso já usado nas fases anteriores).

---

## 5. Testes

### 5.1 Testes automatizados (`node tests/regressions.js`) — todos passando

Cobre, especificamente, cada item da lista de "testes obrigatórios" do pedido:

- **Menu por perfil**, exato (não só "item X sumiu"), pros 8 perfis — incluindo os 2 que não têm colaborador real no seed (Gestor/Assistência, testados via reatribuição temporária de perfil, como já era padrão nos testes da Fase 1).
- **Ausência estrutural das rotas legadas no menu** — nenhum item de `menuDoPerfil(qualquerPerfil)` aponta pra uma das 14 rotas legadas, checado programaticamente.
- **Acesso direto às rotas legadas ainda respeita os guards da Fase 1** — `#/producao`, `#/equipe`, `#/indicadores`, `#/configuracoes`, `#/assistencias`, `#/calendario` etc. testados por perfil, confirmando que o guard não mudou (mesmo permitir/negar de antes).
- **Produção vê só Hoje/Pendências**; **Montador vê Hoje/Minhas Obras/Agenda/Pendências**; **Assistência vê Hoje/Atendimentos/Agenda/Pendências**; **PCP/Líder sem Admin indevido**; **Admin com as 7 áreas** — todos com `assert.deepEqual` na lista exata, não só checagem solta.
- **Rotas novas gating pela permissão certa** (`minhas-obras`→`obra.verAtribuidas`, `atendimentos`→`assistencia.ver`, `agenda`→`agenda.ver`, `admin`→OR das 4 admin.*).
- **Hoje como destino inicial** — parte testável sem DOM (rota sem guard, sempre 1º item do menu de todo perfil) confirmada aqui; a troca de fato em `DOMContentLoaded` (que só roda com DOM real) confirmada ao vivo no Playwright (5.2).
- **Nenhuma permissão nova foi inventada** — toda chave usada em `ROUTE_PERMS`/`MENU_ITEMS` checada programaticamente contra a matriz de perfis (teria que já existir).
- **Nenhum arquivo/lógica legado foi apagado** — as 21 páginas antigas carregadas num contexto isolado e confirmadas como funções existentes; as 14 rotas legadas confirmadas mapeadas de verdade em `ROUTES`.
- **Nenhuma permissão foi relaxada** — snapshot das chaves usadas pela navegação nova (`obra.ver`, `montagem.ver`, `assistencia.ver`, `agenda.ver`, as 4 `admin.*`, `obra.verAtribuidas`) comparado valor-a-valor, por perfil, contra o que já estava definido desde a Fase 1 (rodada 3).

Resultado:
```
$ node tests/regressions.js
Regressoes criticas: OK
```

### 5.2 Validação ao vivo (Playwright, headless Chromium, servidor estático local)

Rodada com o Supabase **interceptado/desligado** (não é a app rodando contra o banco de produção — ver nota de segurança abaixo), pra confirmar no navegador de verdade, não só em teste unitário:

- Menu **desktop** e **mobile** renderizados batem, item por item, com a tabela da seção 2 — pros 7 perfis com menu.
- **`location.hash === "#/hoje"`** e a tela "Hoje" renderiza de fato como ponto de entrada, pros 7 perfis.
- `#/producao` (rota legada) continua respondendo quando acessada direto — renderiza "Produção" pra quem tem permissão, "Acesso restrito" pra quem não tem (ex.: Assistência) — mesmo comportamento de guard de antes, só sumiu do menu.
- Zero erros de console reais. (O único "erro" que apareceu nos primeiros runs foi `ERR_TUNNEL_CONNECTION_FAILED` pro CDN do Google Fonts — limitação **deste sandbox de validação**, que não tem internet geral; não acontece em produção, onde o CDN é alcançável normalmente. Documentado, não escondido.)
- Screenshots capturados (desktop 1280×800 + mobile 390×844) pra cada um dos 7 perfis na tela Hoje, + TV (kiosk, sem menu) — 16 imagens no total, enviadas junto com este relatório.

**Nota de segurança sobre o Playwright:** o `supabase-config.js` foi interceptado (`page.route`) e substituído por uma versão com URL/chave vazias só durante essa validação — isso faz o app cair automaticamente em modo 100% `localStorage` (comportamento documentado no próprio `js/supabase-client.js`). Nenhuma chamada de rede foi feita pro Supabase de produção, e nenhum dado real foi lido, gravado ou sobrescrito. Troca de usuário/perfil durante o teste (`Store.setUsuarioAtual`, reatribuição temporária de perfil pra testar Gestor/Assistência) ficou só na memória do navegador headless, que foi fechado ao final — nada disso tocou o banco real.

### 5.3 Checagem 1 (pedida antes do publish): mobile pequeno — 375px e 360px

**Achei um problema real, não publiquei com ele, e corrigi antes de seguir — exatamente como combinado.**

**O que eu vi antes da correção:** com `overflow-x:auto` como único mecanismo (a solução original da Fase 2), o perfil Admin (7 itens) precisava rolar a barra mobile pra alcançar os últimos itens. Em 390px isso não aparecia (a barra cabia por pouco), mas em 375px e principalmente 360px o item "Admin" ficava **cortado bem na borda da tela, sem nenhuma pista visual de que dava pra rolar até ele** — na prática, quase invisível pra quem não soubesse que existia. Isso é "navegação desconfortável" de verdade, do jeito que você descreveu, não só um risco teórico.

**O que eu NÃO fiz:** não redesenhei a barra mobile inteira, não mudei nada pros outros 6 perfis (que já cabiam sem rolar em 360px, testado e confirmado).

**A correção (exatamente a preferência que você indicou):** só quem passa de 6 itens (hoje, só o Admin) ganha um botão **"Mais"** no lugar do 6º item em diante — os 5 primeiros do perfil continuam soltos, fixos, do jeito que sempre estiveram. Tocar em "Mais" abre um painel pequeno, ancorado acima da barra, com os itens que sobraram (no caso do Admin: Agenda + Admin). Fecha sozinho ao navegar pra qualquer lugar.

**Resultado depois da correção, testado ao vivo (Playwright) em 375px e 360px, nos 7 perfis:**

| Largura | Precisa rolar a barra? (qualquer perfil) | Admin: itens soltos | Admin: dentro de "Mais" |
|---|---|---|---|
| 375px | Não | Hoje, Obras, Pendências, Montagem, Assistências | Agenda, Admin |
| 360px | Não | Hoje, Obras, Pendências, Montagem, Assistências | Agenda, Admin |

Texto não é comprimido nem cortado em nenhum item, em nenhum perfil, nas duas larguras — os 5 itens soltos mantêm o mesmo tamanho de sempre, e o painel "Mais" fica inteiro dentro da área visível da tela (confirmado por coordenadas, não só visualmente). Achado extra, fora do que foi pedido: em 320px (abaixo do que você pediu pra checar) a barra do Admin ainda precisa de um pixinho de rolagem pra alcançar o botão "Mais" — a rede de segurança (`overflow-x:auto`) cobre esse caso, mas registro aqui por transparência; não impede nada em 375/360px, que era o pedido.

Screenshots enviados: `mobile-admin-375px.png`, `mobile-admin-360px.png` (barra fechada) e `mobile-admin-*-mais-aberto.png` (painel aberto, mostrando Agenda + Admin).

### 5.4 Checagem 2 (pedida antes do publish): documentar que Atendimentos é só um alias nesta fase

Feito em dois lugares, não só neste relatório:

- **`js/pages/assistencias.js`**, direto acima de `M.Pages.assistencias`: comentário explícito dizendo que `#/atendimentos` "é, NESTA FASE, só um alias/recorte de rótulo sobre a tela ATUAL de Assistências" e que isso "não é, e não deve ser confundido com, o fluxo final de Assistência V2/mobile" — com um aviso pra quem for mexer depois não estender esse parâmetro pra "virar" a V2 por engano.
- **`js/router.js`**, no item `atendimentos` de `MENU_ITEMS`: comentário resumido apontando pro aviso completo em `assistencias.js`.

Aqui, pro registro: a tela por trás de "Atendimentos" é pixel-a-pixel a mesma tela de Assistências de sempre (mesmo filtro, mesma listagem, mesmo formulário) — só o título muda. O fluxo pensado especificamente pra atendimento em campo pelo celular (V2/mobile) continua sem nenhuma linha de código escrita, aguardando a fase própria.

---

## 6. Riscos

- **Hub Admin é temporário.** `adminHub.js` é uma tela simples de cartões-link, não o Admin V2 (isso é Fase 8, explicitamente fora de escopo aqui). Se alguém abrir `#/admin` esperando a experiência final, vai ver um hub básico — esperado, mas vale avisar a equipe.
- **`#/calendario` e `#/agenda` são duas URLs pra exatamente a mesma tela.** Isso é intencional (rótulo novo sem reescrever a tela — a Agenda de verdade é Fase 6), mas quem favoritar `#/calendario` não vai perceber diferença nenhuma até a Fase 6 trocar o conteúdo por trás de `#/agenda`.
- **Menu mobile agora varia de 2 a 7 itens por perfil.** Testado em 390/375/360px nos 7 perfis, incluindo o botão "Mais" do Admin (seção 5.3) — sem rolagem necessária em nenhum deles. Em 320px (abaixo do pedido) o Admin ainda depende de um pixinho da rolagem de segurança pra alcançar "Mais"; não é bloqueante, mas vale um teste num aparelho físico bem pequeno depois do publish, sem pressa.
- **Nenhum dado foi migrado ou alterado** — mudança é 100% de navegação/roteamento. Risco de regressão funcional é baixo, mas como qualquer mudança de shell, vale um smoke test rápido em produção logo após o publish (não antes — é exatamente o próximo passo, quando você autorizar).
- **Divergência de repositório notada e corrigida durante este trabalho:** o clone local usado pra esta fase estava um commit atrás do que você publicou (`origin/main` tinha 4 arquivos `.md` de relatório a mais, adicionados fora deste ambiente) — sincronizado via `git reset --hard origin/main` antes de qualquer edição da Fase 2, com a suíte de testes confirmada verde antes de começar. Não afeta o código-fonte da Fase 2 (o conteúdo de código já estava idêntico), só registro de higiene.

---

## 7. Confirmação: nenhuma Fase 3+ foi antecipada

- **faseMacro completa** — não implementada.
- **Kanban V2** — não implementado (o Kanban de Produção continua exatamente como estava, só acessível por rota legada).
- **Nova Agenda** — não implementada. `#/agenda` é rótulo novo sobre a tela de Calendário existente, nada reescrito.
- **Novo Admin completo** — não implementado. `adminHub.js` é hub temporário, explicitamente descrito como tal no próprio código.
- **Nova TV** — não implementada. `#/tv`/`#/chao-de-fabrica` seguem exatamente como estavam, fora do menu.
- **Auth / Login** — não tocado.
- **Novo fluxo de Nova Obra** — não tocado.
- **Nova máquina de estados da Montagem** — não tocada.
- Nenhum dado foi migrado. Nenhum arquivo legado foi apagado. Nenhuma permissão foi relaxada (confirmado programaticamente na seção 5.1).

---

## 8. Próximo passo

As duas checagens pedidas antes da publicação passaram (uma delas achou e corrigiu um problema real — seção 5.3). Checklist pré-commit também confirmado: regressões verdes, diff final contra `origin/main` sem nenhuma remoção de arquivo, `APP_VERSION` e `CACHE_NAME` em `3.7.0`. Este relatório vai junto no commit da Fase 2. Depois do commit e do push, aguardo o deploy da Vercel e rodo o smoke test em produção pedido — resultado desse smoke test vai num relatório separado, entregue a você ao final, e então paro (Fase 3 continua não autorizada).
