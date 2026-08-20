# Relatório — Fase 1 (Permissões), rodada 2 — ajustes pedidos antes da publicação

Status: **Ajustes aplicados e testados. Nada publicado — aguardando sua revisão.** Não iniciei a Fase 2.

Este relatório documenta só o que mudou nesta rodada (em cima do que já estava aprovado tecnicamente na rodada 1). Os arquivos continuam sendo os mesmos 13 de antes — nenhum arquivo novo.

---

## 1. Matriz revisada (defaults corrigidos)

Removida qualquer permissão que só existia pra preservar item de menu antigo. `true`/`false` abaixo são os NOVOS defaults; tudo continua editável em Configurações → Permissões sem precisar de código.

| Ação | Admin | PCP | Líder | Produção | Montador | TV | Gestor | Assistência |
|---|---|---|---|---|---|---|---|---|
| obra.ver (lista) | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| obra.criar | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| obra.editar | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| obra.arquivar / obra.cancelar | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | **❌ (era ✅)** | ❌ |
| **obra.verTodas** *(novo)* | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| **obra.verAtribuidas** *(novo)* | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |
| **obra.verContexto** *(novo)* | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| pendencia.ver / criar | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (só ver) | ✅ | ✅ |
| pendencia.editar / atribuir / resolver | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | editar+resolver sim, atribuir não |
| montagem.ver / marcarPronto | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ (só ver) | ✅ | ❌ |
| montagem.aprovarFinalizacao | ✅ (só Admin) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| montagem.finalizarComRessalva | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| assistencia.ver / criar | ✅ | ✅ | ✅ | **❌ (era ✅)** | **❌ (era ✅)** | ❌ | ✅ | ✅ |
| assistencia.editar / concluir | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| agenda.ver | ✅ | ✅ | ✅ | **❌ (era ✅)** | ✅ (mantido, pedido explícito) | ❌ | ✅ | ✅ |
| agenda.criar / editar | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| admin.indicadores | ✅ | **❌ (era ✅)** | ✅ (não pedido) | ❌ | ❌ | ✅ | ✅ | ❌ |
| admin.auditoria | ✅ | **❌ (era ✅)** | **❌ (era ✅)** | ❌ | ❌ | ❌ | ✅ | ❌ |
| admin.equipe | ✅ | **❌ (era ✅)** | **❌ (era ✅)** | **❌ (era ✅)** | **❌ (era ✅)** | ❌ | ✅ | ❌ |
| admin.configuracoes | ✅ | **❌ (era ✅)** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| admin.usuarios | ✅ (só Admin) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **producao.ver** *(novo)* | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **❌** |
| tv.configurar | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

Negrito = mudou nesta rodada. Tudo que não está em negrito continua igual à rodada 1 (já aprovada).

### As 3 chaves novas de contexto de obra (item 3 do pedido)

- **obra.verTodas** — acesso amplo (lista completa), equivalente ao `obra.ver` de hoje.
- **obra.verAtribuidas** — obras onde a pessoa tem algo atribuído (tarefa/pendência/assistência) — mesmo conceito que `Store.obraIdsDoColaborador` já usa hoje pra filtrar a lista restrita em Obras/Calendário.
- **obra.verContexto** — pode abrir UMA obra específica quando chega até ela por um caminho legítimo (a própria pendência/tarefa/atendimento que menciona aquela obra), mesmo sem lista geral nem "atribuídas".

`obra.ver` continua controlando só a **lista** (menu/rota `obras`) — sem mudança de comportamento aí. As 3 novas controlam o **detalhe** (rota `obra/:id`), que agora exige pelo menos uma delas (antes não exigia nenhuma — ver seção 3).

## 2. Diferenças em relação à versão atual da Fase 1 (o que muda de verdade pra quem usa o sistema)

Isto é uma correção de defaults, não uma reimplementação — os arquivos e mecanismos continuam os mesmos da rodada 1. O que muda é **quem vê o quê**, hoje mesmo, se isso for publicado:

- **Produção (Willian, Gabriel, Marcos, Carlos, Ana, Pedro)** deixam de ver no menu: Assistências, Calendário. E, no rodapé: Equipe. Continuam com: Hoje, Produção, Tarefas, Pendências (e suas próprias ações ali).
- **Montador (Roberto, Fernanda)** deixam de ver no menu: Assistências. E, no rodapé: Equipe. Continuam com: Minha Produção, Produção, Tarefas, Pendências, Calendário, e o acesso ao detalhe de obras onde têm algo atribuído (preservado, ver item 3).
- **PCP (Beatriz)** deixa de ver: Indicadores, Desempenho, Auditoria no menu, e Equipe/Configurações no rodapé. Continua com todo o resto (Produção, Obras, Pendências, Para Finalizar, Tarefas, Lotes, Montagem, Assistências, Calendário) e com as ações de pré-produção (criar/editar obra, marcar montagem pronta, atribuir pendência).
- **Líder (Juliana)** deixa de ver: Auditoria no menu, e Equipe no rodapé. Mantém Indicadores/Desempenho (não foram pedidos na lista de correção) e o resto do menu.
- **Gestor** (perfil novo, ninguém atribuído ainda) perde `obra.arquivar`/`obra.cancelar` por padrão — mas como não há fluxo visual pra isso ainda (nem havia antes), não muda nada visível na tela hoje.
- **Assistência** (perfil novo, ninguém atribuído ainda) agora realmente só vê Assistências/Agenda/Pendências no menu — antes (rodada 1) ainda aparecia com Produção/Lotes visíveis por não terem gate. Isso só importa quando alguém for de fato atribuído a este perfil.
- **Admin** — nenhuma mudança.
- **TV** — já estava 100% somente-leitura desde a rodada 1 (nenhuma ação mutável era `true`); esta rodada só confirmou isso com um teste dedicado e documentou explicitamente cada permissão de leitura mantida (ver seção 5).

**Atenção**: PCP perder `admin.configuracoes`/`admin.auditoria`/`admin.equipe`/`admin.indicadores` é a mudança de maior impacto prático desta lista, porque a Beatriz Nogueira (única PCP hoje) realmente usa o sistema. A flag antiga `verConfiguracoes` dela continua `true` (não mexi nas 10 flags legadas, só nas novas), mas a nova ROTA (`admin.configuracoes`) agora bloqueia o acesso mesmo assim — a permissão nova, mais restrita, prevalece porque é checada primeiro em `render()`. Ou seja: **se isso for publicado do jeito que está, a Beatriz perde acesso a Configurações, Indicadores, Auditoria e à lista de Equipe até alguém (Admin) reativar essas permissões dela em Configurações → Permissões.** Sinalizo isso com destaque porque é uma mudança de acesso real de uma pessoa que usa o sistema hoje — não é uma limitação teórica.

## 3. Acesso contextual à obra — o que foi feito e o que falta

A rota `obra/:id` (detalhe) passou de "sem guard nenhum" para "exige pelo menos uma de `obra.verTodas`/`obra.verAtribuidas`/`obra.verContexto`" (`js/router.js`, `ROUTE_PERMS["obra"]`, e `js/main.js` no guard de rota, que agora aceita string OU array de permissões — basta uma).

**O que isso resolve**: a permissão deixa de ser conceitualmente contraditória (Montador tinha `obra.ver=false` mas a rota de detalhe não reconhecia permissão nenhuma pra ele acessá-la mesmo assim — agora reconhece, via `verAtribuidas`/`verContexto`).

**O que isso NÃO resolve ainda (de propósito, combinado)**: o guard checa se o perfil TEM alguma dessas 3 permissões — não checa se A OBRA ESPECÍFICA da URL pertence ao contexto daquela pessoa. Hoje todo perfil tem pelo menos `obra.verContexto=true`, então este guard não bloqueia ninguém sozinho ainda (é esperado — ver comentário longo em `js/router.js`). A filtragem de dado real (cruzar o `obraId` da URL com as tarefas/pendências/assistências da pessoa) fica pra Fase 2/Obras V2, como você pediu. Documentei o TODO exato no código (`js/router.js`, no comentário de `ROUTE_PERMS`).

## 4. Inventário das mutações existentes (camada AÇÃO)

| Mutação | Função | Classificação (antes desta rodada) | O que foi feito |
|---|---|---|---|
| Criar obra | `Act.novaObraCriar` → `Store.criarObra` | A (guardado na rodada 1: `obra.criar`) | sem mudança |
| Criar pendência | `Store.criarPendencia` | C (sem guard nenhum) | **→ A**: guard `pendencia.criar` |
| Editar pendência (mudar status: avançar fluxo, reabrir) | `Store.atualizarStatusPendencia`, `Store.avancarFluxoPendencia`, `Store.reabrirPendencia` | C (sem guard nenhum) | **→ A**: guard `pendencia.editar` |
| Resolver pendência | `Store.resolverPendencia`, e o desfecho "resolver" de `atualizarStatusPendencia`/`avancarFluxoPendencia` | C (sem guard nenhum) | **→ A**: guard `pendencia.resolver` (mais restrito que "editar") |
| Atribuir pendência (reatribuir responsável) | — | **D**: não existe função de reatribuição hoje — o responsável só é definido na criação (`criarPendencia`), coberto por `pendencia.criar` | nada implementado — não inventei uma feature de reatribuição que não existe |
| Editar obra (campos: cliente, número OS, endereço etc.) | — | **D**: não existe função de editar obra hoje — os campos são fixos após a criação | nada implementado |
| Mover etapa (fluxo normal de produção) | `Store.moverEtapa` (caminho sem `opts.forcar`) | **D**: é o trabalho central de Produção/Montador; nenhuma chave nova foi pedida especificamente pra isso — criar uma agora seria inventar regra de negócio | mantido como está, documentado |
| Mover etapa com avanço excepcional (ressalva de etapa) | `Store.moverEtapa` (`opts.forcar`) | B (já usa `liberarExcecao`, flag antiga, compatível) | sem mudança |
| Marcar montagem pronta (por móvel) | `Store.concluirMontagem` | C (sem guard nenhum) | **→ A**: guard `montagem.marcarPronto` |
| Finalizar ambiente — caminho normal (sem ressalva) | `Store.finalizarAmbiente` (sem `opts.ressalva`) | C, mas correção depende de decisão de produto ainda pendente (quem aprova — `montagem.aprovarFinalizacao` só tem Admin=true hoje) | **mantido como está, por instrução explícita sua de não hardcodar aprovador** — travar isso agora deixaria só o Admin finalizando ambiente, quebrando o trabalho normal do Montador. Documentado, não implementado. |
| Finalizar ambiente com ressalva | `Store.finalizarAmbiente` (`opts.ressalva`) | A (já guardado desde a rodada 1: `liberarExcecao` OU `montagem.finalizarComRessalva`) | sem mudança |
| Criar assistência | `Store.criarAssistencia` | C (sem guard nenhum) | **→ A**: guard `assistencia.criar` |
| Editar assistência / mudar status | `Store.atualizarAssistencia`, `Store.registrarVisitaAssistencia` (retorno necessário) | C (sem guard nenhum) | **→ A**: guard `assistencia.editar` |
| Concluir assistência | `Store.atualizarAssistencia` (status=CONCLUIDA), `Store.registrarVisitaAssistencia` (desfecho=RESOLVIDA) | C (sem guard nenhum) | **→ A**: guard `assistencia.concluir` (mais restrito que "editar") |
| Garantia "cortesia" | `Store.definirGarantiaAssistencia` | A (já usa `liberarExcecao`, pré-existente, nada da Fase 1) | sem mudança |
| Criar/editar compromissos (agenda) | — | **D**: não existe nenhuma entidade "compromisso" no código hoje — o Calendário é 100% derivado (leitura) de obras/tarefas/pendências/assistências, sem CRUD próprio | `agenda.criar`/`agenda.editar` continuam existindo como chaves preparadas, sem nada pra proteger ainda |
| Editar permissões | `Store.setPermissao` | A (já guardado, `editarPermissoes`, pré-existente) | sem mudança |
| Acessar/editar configurações | `M.Pages.configuracoes` | A (guard de página `verConfiguracoes` pré-existente + ROTA `admin.configuracoes` desde a rodada 1) | sem mudança |
| Arquivar/cancelar obra | — | **D**: não existe fluxo visual — combinado que não seria implementado nesta fase | permissões `obra.arquivar`/`obra.cancelar` continuam preparadas na matriz |

Todos os guards novos foram colocados **dentro do próprio `Store`** (não só no `Act` do `actions.js`) — valem mesmo se alguém chamar `Store.criarPendencia(...)` direto, sem passar pela tela. Os wrappers em `actions.js` foram atualizados pra checar o resultado (`{ok, motivo}`) e mostrar um toast + desfazer a mudança visual quando a permissão falta, em vez de assumir sucesso sempre (esse era exatamente o risco de "guard só visual" que você apontou no item 4).

**Verifiquei um risco de efeito cascata antes de mexer**: `criarPendencia` agora exige `pendencia.criar`, e existe UM lugar dentro do próprio Store que chama `Store.criarPendencia` internamente (`registrarVisitaAssistencia`, quando a visita gera pendência de peça). Conferi que todo perfil que pode chegar em "editar assistência" (`assistencia.editar=true`) também tem `pendencia.criar=true` na matriz — não existe combinação que quebre esse fluxo automático. A geração automática de pendência por componente crítico (`criarPendenciaDoComponente`, chamada por `Store.criarObra`/`mudarStatusComponente`) é uma função interna separada que grava direto em `state.pendencias` sem passar pelo `Store.criarPendencia` público — não é afetada por este guard.

## 5. TV — matriz somente-leitura (item 2 do pedido)

A matriz da TV já estava 100% somente-leitura desde a rodada 1 — nenhuma ação mutável (criar/editar/atribuir/resolver/marcarPronto/aprovar/finalizar/concluir/configurar) era `true`. Esta rodada não precisou mudar nenhum valor da TV — só documentei explicitamente e escrevi um teste dedicado (`tests/regressions.js`) que confere, uma por uma, que nenhuma das ~20 chaves mutáveis é `true` pra TV.

Permissões de leitura que a TV mantém, e por que cada uma é necessária pro painel de chão de fábrica:

- `obra.ver` / `obra.verTodas` / `obra.verAtribuidas` / `obra.verContexto` — o painel mostra visão geral de todas as obras (não faz sentido restringir por "atribuição", já que ninguém está logado de verdade).
- `montagem.ver` — o painel mostra status de montagem.
- `pendencia.ver` — o painel mostra contagem/alertas de pendências.
- `admin.indicadores` — espelha a flag legada `verIndicadores`, que já era `true` e alimenta os widgets numéricos do painel.
- `producao.ver` (nova) — não afeta a TV na prática hoje (o modo TV usa as rotas `chao-de-fabrica`/`tv`, que não passam pelo menu lateral), mantida `true` só por não haver motivo pra restringir.

TV continua sem ser atribuída a nenhum colaborador real (confirmado, e testado).

## 6. Testes atualizados

`node tests/regressions.js` → **`Regressoes criticas: OK`**, suíte inteira (Fase 0 + Fase 1 completa) passando 100%.

Os testes da Fase 1 foram reescritos pra refletir a matriz corrigida (os que testavam o comportamento ERRADO da rodada 1 — tipo "Montador precisa continuar vendo Assistências" — foram removidos/invertidos) e cobrem, além do que já existia:

- Produção não acessa Assistências, Agenda geral, Equipe ou Admin (nenhuma chave `admin.*`).
- Montador não acessa Assistências gerais nem Equipe, mas mantém Montagem/Agenda.
- Montador continua acessando o contexto de obra atribuído (`obra.verAtribuidas`/`verContexto`, e o guard OR da rota `obra` não o bloqueia).
- PCP não acessa Configurações/Admin por padrão (checado via `Store.pode` E via o guard de rota de verdade), mas mantém as ações de pré-produção.
- Gestor não arquiva/cancela obra por padrão (simulei atribuição temporária do perfil pra testar de verdade, não só ler o dado estático).
- TV não possui nenhuma ação mutável (as ~20 chaves conferidas uma a uma).
- Assistência só acessa seu contexto (obra.verContexto=true, mas verTodas/verAtribuidas/producao.ver/montagem.ver=false, e o menu de verdade reflete isso).
- Admin continua com tudo (iteração sobre todas as chaves da própria matriz do Admin, não uma lista fixa que poderia ficar desatualizada).
- **Guards de ação não são só visuais**: chamei `Store.criarPendencia`/`resolverPendencia`/`atualizarStatusPendencia`/`criarAssistencia`/`concluirMontagem` **diretamente**, sem passar pela tela, como Produção e Montador, e confirmei `{ok:false, motivo:"SEM_PERMISSAO"}` nos casos que deveriam ser negados, e sucesso real nos casos permitidos.

**Validação end-to-end num navegador real (Playwright)**, além dos testes automatizados: troquei entre Produção, Montador, PCP, Líder, Gestor (simulado) e Assistência (simulado) e confirmei visualmente cada item de menu/rodapé aparecendo ou sumindo exatamente como a matriz revisada prevê, cada rota bloqueada mostrando "Acesso restrito", o Montador continuando a abrir o detalhe de uma obra normalmente, e chamei `Act.novaObraCriar()` direto pelo console como Montador pra confirmar que a ação de verdade (não só a tela) continua negada — nenhuma obra nova foi criada, hash não mudou. A tela de Configurações → Permissões renderizou certo com as 8 colunas e as 42 linhas (10 antigas + 32 novas, incluindo as 3 de contexto de obra e a de Produção), e o toggle de um checkbox novo (Montador × "Obra: ver atribuídas") funcionou normalmente. **Nenhum erro novo no console** — os únicos erros observados continuam sendo os mesmos, já documentados desde a Fase 0, de o sandbox não alcançar o CDN do Supabase (não relacionados a este código).

## 7. Riscos restantes

- **PCP (Beatriz Nogueira) perde acesso real a Configurações/Indicadores/Auditoria/Equipe** se isso for publicado como está — destacado com força na seção 2. Se isso não for a intenção, me avise antes da publicação e eu ajusto o default (ou você mesmo ajusta depois em Configurações → Permissões, sem precisar de novo deploy).
- **Assistência ainda vê alguns itens de menu não explicitamente restritos** (Pendências, Tarefas, Lotes continuam sem gate — só "Produção" ganhou o novo `producao.ver` nesta rodada, por ter sido citada nominalmente no seu pedido). Como zero colaboradores têm esse perfil hoje, o impacto real é zero — mas registro que Tarefas/Lotes não foram tocados, pra não presumir uma correção que você não pediu.
- **O guard da rota "obra" ainda não filtra por obra específica** — é presença de permissão, não filtragem de dado (seção 3). Continua sendo trabalho de Fase 2/Obras V2, como combinado.
- **`montagem.aprovarFinalizacao` continua só com Admin**, e o caminho normal de `finalizarAmbiente` continua sem guard — ambos por decisão explícita sua de não hardcodar aprovador ainda.
- Nenhum outro risco novo identificado nesta rodada além dos já registrados no relatório da rodada 1 (rotas `chao-de-fabrica`/`tv`/detalhe de obra deliberadamente não gateadas onde caberia risco de quebrar o modo quiosque da TV ou o app do Montador).

## 8. Arquivos alterados (mesmos 13 da rodada 1, sem arquivo novo)

`js/data.js`, `js/store.js`, `js/router.js`, `js/main.js`, `js/actions.js`, `js/ui.js`, `css/styles.css`, `js/pages/configuracoes.js`, `js/pages/dashboard.js`, `js/pages/hoje.js`, `js/pages/obras.js`, `js/pages/producao.js`, `tests/regressions.js`.

---

## Próximo passo

Aguardando sua revisão — principalmente da observação sobre a Beatriz/PCP na seção 2. **Não vou publicar nada** até você confirmar. Já deixei os 13 arquivos atualizados em `E:\moodo-producao-repo-pronto` (mesmo mecanismo de antes, sem nenhum comando git) pra você olhar quando quiser.
