# Fase 1 — Rodada 3 (último ajuste antes da publicação)

Este relatório cobre só os dois pontos pedidos na última mensagem — **não fez push, não iniciou Fase 2**. A rodada 2 (matriz corrigida, guards de ação) continua valendo integralmente; isto é um adicional em cima dela.

## 1. Guard contextual REAL da rota de obra

### O problema que existia até a rodada 2

`obra.verTodas` / `obra.verAtribuidas` / `obra.verContexto` só precisavam **existir** — a rota `#/obra/:id` checava se o perfil tinha alguma das três, mas nunca conferia se **aquela obra específica da URL** era realmente do contexto da pessoa. Na prática: um Montador com `obra.verAtribuidas=true` podia digitar na mão o ID de uma obra qualquer e abrir do mesmo jeito, porque a permissão "existia" independente do ID pedido.

### O que foi implementado

Uma função nova, `Store.podeAbrirObra(obraId)` (`js/store.js`), que é a autoridade de verdade por trás da rota `obra` (chamada direto em `js/main.js`, substituindo o check genérico string/array só para essa rota):

```js
podeAbrirObra(obraId){
  if(Store.pode("obra.verTodas")) return true;
  if(!obraId) return false;
  const temAtribuidas = Store.pode("obra.verAtribuidas");
  const temContexto = Store.pode("obra.verContexto");
  if(!temAtribuidas && !temContexto) return false;
  const meuContexto = Store.obraIdsDoColaborador(state.usuarioAtual);
  return meuContexto.has(obraId);
},
```

Regra por chave, exatamente como pedido:

- **`obra.verTodas`** → abre qualquer obra (Admin/PCP/Líder/Gestor/TV) — não muda.
- **`obra.verAtribuidas`** → só abre se o `obraId` estiver em `Store.obraIdsDoColaborador(usuário atual)`.
- **`obra.verContexto`** → mesma verificação (`obraIdsDoColaborador`).

**Reutilizei `Store.obraIdsDoColaborador`**, como o pedido sugeriu — é o mecanismo que já existe e já é usado em Hoje/Produção/Montagem/Obras/Calendário para "minhas obras": obras onde a pessoa tem tarefa (`responsavelPlanejado`/`executadoPor`), pendência (`responsavel`) ou assistência (`responsavel`) vinculada. Isso cobre exatamente os vínculos que o pedido listou — pendência vinculada, tarefa vinculada, assistência vinculada e atividade de montagem atribuída (montagem usa a mesma tabela de tarefas) — sem inventar um cálculo novo.

**Se a pessoa não tem nenhuma das 3 chaves, ou tem alguma mas o `obraId` não está no conjunto dela, o resultado é `false`** — nunca libera "todas" como fallback. Sem `obraId` (rota `#/obra` sem parâmetro), também nega por padrão, a menos que a pessoa tenha `verTodas`.

A tela de "Acesso restrito" ganhou uma mensagem específica para esse caso: *"Esta obra não está no seu contexto (nenhuma tarefa, pendência ou assistência atribuída a você nela)."*

### Um ajuste extra necessário para não deixar links quebrados

Ao auditar todos os lugares que geram link para `#/obra/:id`, encontrei uma tela — **"Para Finalizar"** (`js/pages/paraFinalizar.js`) — que mostrava **todas** as obras para qualquer perfil com `montagem.ver` (inclui o Montador, que é restrito), sem aplicar o mesmo filtro `restrito`/`meuObraIds` que Produção/Hoje/Montagem/Obras/Calendário já usam. Antes da rodada 3 isso não importava (a rota não tinha guard nenhum, o link sempre funcionava); agora, sem esse filtro, um Montador veria um card levando a uma obra que `podeAbrirObra` corretamente nega — um link morto.

Apliquei o mesmo padrão já estabelecido nas outras 5 telas (não é regra de negócio nova, é a mesma regra já aprovada, só estendida para uma tela que tinha ficado de fora). Confirmado ao vivo: Montador agora vê 5 cards (as obras do contexto dele) em vez de 6, com o mesmo banner explicativo que já aparece em Produção/Montagem/Obras/Calendário; Admin continua vendo as 6.

Todos os outros geradores de link para `#/obra/:id` foram auditados e já eram seguros por construção (Pendências/Tarefas/Assistências para Produção/Montador já filtram "minhas" antes; Auditoria/Nova Obra só aparecem para perfis com `verTodas`). Para a **Assistência**, as telas de Pendências/Tarefas/Assistências continuam mostrando a lista completa (não mexi nisso — é o mesmo território "Fase 2 reorganiza" do item 4) — o efeito é que, se ela clicar num link de obra que não é do atendimento dela nessas listas específicas, verá "Acesso restrito". Isso é o comportamento correto e esperado pelo próprio pedido (exemplo obrigatório: "Assistência abre obra sem vínculo = negado"), não um bug — só registro aqui para não ser surpresa.

### Confirmação: usuário sem vínculo não abre obra por URL direta

Testado ao vivo (Playwright, navegação real por hash, não só chamada de função):

- Montador (Roberto Diniz) em `#/obra/real-bothanic` (atribuída) → abre normalmente.
- Montador em `#/obra/os336` (não atribuída) → "Acesso restrito", mensagem contextual.
- Produção (Willian Souza) em obra fora do contexto dele → negado; na obra do contexto dele → abre.
- Assistência (perfil simulado) sem nenhum atendimento vinculado a uma obra → negado; depois de criar uma assistência de verdade (`Store.criarAssistencia`, guard de ação da rodada 2 continua valendo) vinculada àquela obra → passa a abrir.
- Admin em qualquer obra → sempre abre.

## 2. Líder — Indicadores

`admin.indicadores` do perfil `LIDERANCA` mudou de `true` para `false` em `js/data.js`. Efeito automático (mesma chave já usada em `ROUTE_PERMS`/MENU desde a rodada 2, nenhum código novo de rota precisou mudar):

- Itens "Indicadores" e "Desempenho" somem do menu do Líder.
- Rotas `#/indicadores` e `#/desempenho` passam a bloquear com "Acesso restrito" mesmo por URL direta.
- Resto do acesso operacional do Líder (obra.editar, pendencia.atribuir, liberarExcecao, montagem.finalizarComRessalva) continua intacto — não toquei em mais nada do perfil.

A flag legada `verIndicadores` foi **mantida `true`** de propósito (compatibilidade, mesmo raciocínio já documentado para o PCP na rodada 2) — não tem efeito prático porque a camada ROTA usa `admin.indicadores` e bloqueia antes de `M.Pages.indicadores()` ser chamada.

## 3. PCP / Beatriz — confirmado, sem mudança

A matriz do PCP não foi tocada nesta rodada. Continua exatamente como ficou na rodada 2 (`admin.configuracoes/equipe/auditoria/indicadores=false` por padrão) — o efeito sobre a Beatriz Nogueira já estava sinalizado no relatório da rodada 2 e é reafirmado aqui como intencional, por instrução explícita.

## 4. Assistência / Tarefas / Lotes — não tocado, como pedido

Nenhuma mudança nas rotas de Tarefas/Lotes nem no menu geral delas para a Assistência. Fica para a Fase 2, como combinado.

## Testes novos (`tests/regressions.js`)

Bloco "RODADA 3, item 1" — todos chamando `Store.podeAbrirObra` diretamente (camada Store, não só UI):

- Montador abre obra atribuída (`real-bothanic`, vínculo via assistência do seed) = permitido.
- Montador abre obra não atribuída (`os336`) = negado.
- Produção abre obra com pendência sob sua responsabilidade = permitido.
- Produção tenta obra aleatória sem vínculo = negado.
- Assistência (perfil simulado) sem atendimento vinculado = negado; depois de `Store.criarAssistencia` vinculando a obra = permitido.
- Admin / PCP (Beatriz) / Líder (Juliana) / Gestor (perfil simulado) com `verTodas=true` = sempre permitido, qualquer obra.
- Caso de borda: `podeAbrirObra(undefined)` — nega para quem não tem `verTodas`, libera para Admin.

Bloco "RODADA 3, item 2":

- Líder perde `admin.indicadores`; `passaNaRota("indicadores")` e `passaNaRota("desempenho")` ficam `false`; itens somem do menu; resto do perfil confirmado intacto.

Resultado: **`Regressoes criticas: OK`** (suíte completa, incluindo toda a rodada 2). Validação ao vivo feita com Playwright/Chromium headless contra um servidor local, navegando por hash de verdade (não só chamando função) nos cenários acima — sem erros de console novos além dos já documentados desde a Fase 0 (falha de CDN do Supabase / sandbox sem rede, que não têm relação com este código).

## Confirmação: nada da Fase 2 foi antecipado

Não houve: filtragem real de dado nas listas gerais (Obras, Pendências, Tarefas, Assistências) além do que já existia antes desta rodada; reorganização de menu; remoção de TV; criação de página nova; mudança de regra de negócio não pedida explicitamente. A única extensão além dos dois pontos pedidos foi o ajuste de consistência em `js/pages/paraFinalizar.js`, necessário para o próprio guard do item 1 não deixar links quebrados — documentado acima com justificativa.

## Arquivos alterados nesta rodada

- `js/data.js` — Líder: `admin.indicadores:false`; comentários atualizados.
- `js/store.js` — `Store.podeAbrirObra(obraId)`.
- `js/main.js` — guard da rota `obra` usa `podeAbrirObra`; mensagem de "Acesso restrito" contextual.
- `js/router.js` — comentário do `ROUTE_PERMS["obra"]` atualizado (não é mais "sem filtro real").
- `js/pages/paraFinalizar.js` — mesmo filtro `restrito`/`meuObraIds` já usado nas outras 5 telas.
- `tests/regressions.js` — testes descritos acima.

Nenhum outro arquivo das 13 entregues na rodada 2 precisou mudar.

## Riscos / pontos de atenção remanescentes

- O ajuste em `paraFinalizar.js` é uma extensão de escopo pequena, mas real, além dos dois pontos pedidos — se preferir que eu reverta e deixe a tela como estava (com o link quebrado documentado como risco conhecido, igual ao caso das listas de Pendências/Tarefas para Assistência), avise.
- Continuam valendo os riscos já listados no relatório da rodada 2 (PCP/Beatriz, filtragem de dado real ainda pendente para Fase 2, `montagem.aprovarFinalizacao` no fluxo normal).

**Não fiz push. Não iniciei Fase 2.**
