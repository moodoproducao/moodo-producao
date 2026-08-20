# Relatório — Fase 1 (Permissões) — Moodo Produção V2

Status: **Implementação concluída e testada localmente. NADA foi publicado — aguardando sua revisão e autorização explícita antes de qualquer commit/push.** Fase 2 (ou qualquer fase posterior) não foi iniciada.

---

## 1. Arquivos alterados

13 arquivos, todos aditivos sobre o que já existia (nada foi removido/renomeado destrutivamente):

| Arquivo | O que mudou |
|---|---|
| `js/data.js` | `PERFIS`: cada perfil ganhou as chaves de ação granulares novas; 2 perfis novos (`GESTOR`, `ASSISTENCIA`); label de `OPERADOR`→"Produção" e `LIDERANCA`→"Líder" (key interna preservada). |
| `js/store.js` | `load()`: migração de `permissoes` agora faz merge de verdade (`mergePermissoes`), não um "OU" cru. `finalizarAmbiente()`: guarda da ressalva aceita a permissão nova além da antiga. |
| `js/router.js` | `MENU`/`MENU_OPERADOR`/`FOOTER`/`FOOTER_OPERADOR`/`MOBILE_NAV_OPERADOR`: itens relevantes ganharam campo `perm`. Novo `ROUTE_PERMS` (camada ROTA). |
| `js/main.js` | `navHtml()`/`footerHtml()` filtram por permissão. `render()` bloqueia a chamada da página real quando falta a permissão da rota (mostra "Acesso restrito"). |
| `js/actions.js` | `novaObraCriar()` ganhou o guard de ação obrigatório (`obra.criar`). |
| `js/ui.js` | Novo `UI.botaoNovaObraHtml()` — ponto único que decide se o botão "+ Nova Obra" aparece. |
| `js/pages/obras.js`, `dashboard.js`, `hoje.js`, `producao.js` (×2) | Passaram a usar `UI.botaoNovaObraHtml()` em vez de montar o link "+ Nova Obra" sem checagem. |
| `js/pages/configuracoes.js` | Editor de Permissões: 2 colunas novas (Gestor, Assistência) + linhas novas com as ações granulares; `valorDe()` blindado contra `TypeError` em perfil sem entrada salva. |
| `css/styles.css` | Grade de permissões (`.perm-grid`) agora comporta número variável de colunas e rola horizontalmente em telas menores. |
| `tests/regressions.js` | +135 linhas de teste cobrindo os 11 itens obrigatórios da Fase 1 (lista na seção 6). |

Nenhum arquivo de Fase 2+ (Kanban, Agenda, Admin novo, TV, Montagem, Auth, Login, fluxo de Nova Obra) foi tocado.

## 2. Modelo de permissões — antes / depois

**Antes:** 10 flags fixas por perfil (`verValores`, `verIndicadores`, `verDesempenho`, `verRanking`, `verAuditoria`, `verTodasObras`, `verConfiguracoes`, `liberarExcecao`, `editarProcesso`, `editarPermissoes`), checadas em ~13 pontos espalhados pelo código. MENU: troca binária de array (operador/não-operador), sem filtro por item. ROTA: nenhuma — `router.js` chamava a página direto, sem checagem nenhuma, então digitar a URL sempre funcionava. AÇÃO: só ~4 pontos protegidos (ressalva de montagem, cortesia de garantia, editar permissões, e os já citados).

**Depois:** as 10 flags antigas continuam existindo e funcionando exatamente como antes (nenhuma removida, nenhum ponto de checagem antigo alterado) — mais 28 chaves de ação granulares novas (`obra.ver/criar/editar/arquivar/cancelar`, `pendencia.ver/criar/editar/atribuir/resolver`, `montagem.ver/marcarPronto/aprovarFinalizacao/finalizarComRessalva`, `assistencia.ver/criar/editar/concluir`, `agenda.ver/criar/editar`, `admin.ver/indicadores/auditoria/equipe/configuracoes/usuarios`, `tv.configurar`), com as 3 camadas reais:

- **MENU** — cada item relevante do menu/rodapé tem um campo `perm` opcional; sem `M.Store.pode(perm)`, o item simplesmente não é renderizado (aditivo sobre a troca de array que já existia).
- **ROTA** — `M.Router.ROUTE_PERMS` mapeia chave de rota → ação exigida; `render()` intercepta *antes* de chamar a página de verdade e mostra "Acesso restrito" se faltar a permissão — mesmo por link direto.
- **AÇÃO** — `novaObraCriar()` (o exemplo obrigatório do handoff) agora nega a criação de verdade sem `obra.criar`, além de já negada na MENU e na ROTA.

`Store.pode()`/`Store.setPermissao()` não precisaram de nenhuma mudança de código — já eram genéricos o bastante pra aceitar as chaves novas (só passaram a receber mais entradas). O editor em Configurações → Permissões também já é genérico (`Act.togglePermissao`), então as 28 chaves novas já são editáveis ali, perfil por perfil, sem precisar de outro deploy pra ajustar uma regra de negócio.

## 3. Matriz final por perfil (chaves de ação novas)

`true` = pode. Perfis antigos mantiveram os valores mostrados (pontos de partida, ajustáveis em Configurações → Permissões sem precisar de código):

| Ação | Admin | PCP | Líder | Produção | Montador | TV | Gestor | Assistência |
|---|---|---|---|---|---|---|---|---|
| obra.ver | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| obra.criar | ✅ | ✅ | ❌ | ❌ | **❌** | ❌ | ✅ | ❌ |
| obra.editar | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| obra.arquivar / obra.cancelar | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| pendencia.ver / criar | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| pendencia.editar / atribuir | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | editar sim, atribuir não |
| pendencia.resolver | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| montagem.ver | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |
| montagem.marcarPronto | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| montagem.aprovarFinalizacao | **✅ (só Admin)** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| montagem.finalizarComRessalva | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| assistencia.ver / criar | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| assistencia.editar / concluir | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| agenda.ver | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| agenda.criar / editar | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| admin.indicadores / auditoria | ✅ | ✅ | ✅ | ❌ | ❌ | indicadores sim | ✅ | ❌ |
| admin.equipe | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| admin.configuracoes | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| admin.usuarios | **✅ (só Admin)** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| tv.configurar | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

Decisões deliberadas que seguem sua instrução de "não hardcodar/não decidir ainda":

- **`montagem.aprovarFinalizacao`**: só `true` para Admin — não é uma regra de código fixa (tipo "se perfil === Líder"), é só o valor padrão do dado, trocável a qualquer momento em Configurações → Permissões assim que vocês decidirem quem aprova.
- **`admin.usuarios`**: mesma lógica — só Admin por padrão, ajustável depois.
- `obra.arquivar`/`obra.cancelar`: permissão pronta na matriz, mas **nenhum fluxo visual de arquivar/cancelar foi construído** (fora de escopo desta fase, como combinado).

`Produção`/`Montador` ganharam `assistencia.ver=true`, `agenda.ver=true` e `admin.equipe=true` deliberadamente — são exatamente os itens que já apareciam no menu reduzido deles antes da Fase 1; sem isso, a filtragem nova por permissão faria esses itens sumirem do menu, o que seria uma regressão visual, não uma mudança pedida.

## 4. Guards adicionados (as 3 camadas, no exemplo obrigatório)

**Montador → Criar Obra:**

- **MENU**: `UI.botaoNovaObraHtml()` não renderiza o botão "+ Nova Obra" (testado nas 4 telas onde ele aparecia: Hoje, Dashboard, Obras, Produção).
- **ROTA**: `#/nova-obra` direto na URL → `render()` mostra "Acesso restrito" sem chamar `M.Pages.novaObra()`.
- **AÇÃO**: mesmo que a pessoa chegasse na tela por algum outro caminho, `Act.novaObraCriar()` nega e mostra um toast — `M.Store.criarObra()` nunca é chamado.

Confirmado ao vivo num navegador real (Playwright) trocando pra "Roberto Diniz" (Montador de verdade nos dados): as 3 camadas bloquearam, nas 3 verificações.

Outras rotas que ganharam guard de ROTA nesta fase: `obras`, `montagem`, `para-finalizar`, `assistencias`, `indicadores`, `desempenho`, `auditoria`, `calendario`, `equipe`, `configuracoes`.

## 5. Compatibilidade com dados existentes

- **Nenhum colaborador salvo quebra.** `COLABORADORES[].perfil` continua usando as mesmas strings de sempre (`"OPERADOR"`, `"LIDERANCA"`, etc.) — só o *label* mudou (o que a pessoa vê na tela), a *key* interna não. Testei isso explicitamente: um colaborador com `perfil:"OPERADOR"` salvo continua resolvendo perfil, permissões e menu certinho.
- **Zero atribuição automática.** Nenhum colaborador em `COLABORADORES` tem `perfil:"GESTOR"` ou `perfil:"ASSISTENCIA"` — só um admin escolhendo manualmente (dropdown em Equipe, que já lista `M.PERFIS` inteiro, então já inclui os 2 novos automaticamente) atribui alguém a esses perfis.
- **Estado salvo antes da Fase 1 não quebra.** Achei e corrigi um risco real aqui: a migração antiga de `state.permissoes` era um "OU" cru (`parsed.permissoes || fresh.permissoes`) — um estado salvo antes desta fase manteria seu objeto de permissões *inteiro*, sem nunca ganhar as chaves novas. Isso não quebrava `Store.pode()` (ele já cai no padrão de `M.PERFIS` quando a chave não existe), mas quebraria a tela de edição de permissões (ela lê `state.permissoes[perfilKey]` direto, e daria erro pra perfil que não existisse ali). Corrigi com um merge de verdade (`mergePermissoes`, em `js/store.js`): toda chave nova (perfil novo ou ação nova) ganha o padrão atual, e qualquer edição já feita por um administrador continua valendo — nada se perde. Escrevi um teste específico simulando exatamente esse cenário (estado salvo só com os 6 perfis antigos e as 10 flags antigas) — passou.
- **`Store.pode()`/`Store.setPermissao()` não mudaram de código** — só passaram a ver mais chaves. Zero risco de regressão nesse mecanismo em si.

## 6. Testes executados

`node tests/regressions.js` → **`Regressoes criticas: OK`** (100%, suíte inteira, incluindo a Fase 0).

Os 11 itens obrigatórios da Fase 1, todos com teste específico novo:

1. **Perfil × menu** — Montador não vê "Obras" mas continua vendo "Assistências"/"Calendário" (regressão evitada); Admin vê tudo.
2. **Perfil × rota** — Produção bloqueada em `#/configuracoes`, `#/indicadores`, `#/auditoria` mesmo tentando ir direto.
3. **Perfil × ação** — matriz checada para os casos citados no handoff.
4. **Override de permissão** — numa chave granular nova (`obra.arquivar` do Montador), não só nas 10 antigas.
5. **Compatibilidade com flags antigas** — `verConfiguracoes` continua se comportando igual pra PCP/Produção.
6. **Usuário sem permissão tentando URL direta** — mesma condição usada no guard real de `render()`.
7. **Usuário sem permissão tentando ação direta** — mesma condição usada no guard real de `Act.novaObraCriar()`.
8. **Montador não pode criar obra** — nas 3 camadas (ver seção 4).
9. **Produção não pode acessar Admin** — `#/configuracoes`, `#/indicadores`, `#/auditoria` todos bloqueados.
10. **PCP pode executar ações do pré-produção permitidas** — `obra.criar/editar`, `montagem.marcarPronto`, `pendencia.atribuir` = sim; `admin.usuarios` = não.
11. **Novos perfis não são atribuídos automaticamente** — checado contra `COLABORADORES` de verdade.

Mais um teste de migração dedicado (item 5 acima) simulando um `localStorage` de antes da Fase 1.

**Validação end-to-end num navegador real (Playwright, Chromium headless), fora do harness de teste:**

- Troquei entre Admin, Produção (Willian Souza), Montador (Roberto Diniz) e — simulando o que um admin faria em Equipe — Gestor e Assistência (atribuídos temporariamente em memória, só pra validar, sem gravar em lugar nenhum).
- Confirmei visualmente: menu certo por perfil, botão "Nova Obra" some pra Montador, `#/nova-obra` e `#/obras` mostram "Acesso restrito" pra Montador, Montador continua acessando o detalhe de uma obra individual (dependência do PWA de montagem, preservada de propósito), Gestor acessa Obras mas não Configurações, Assistência acessa Assistências mas não Obras.
- Testei a edição de permissão de verdade: cliquei no checkbox "Obra: arquivar" da coluna Gestor em Configurações → Permissões — mudou de ligado pra desligado e voltou, sem erro.
- **Nenhum erro novo no console.** Os únicos erros observados (`ERR_TUNNEL_CONNECTION_FAILED`, falha ao carregar Supabase, `Cannot read properties of null (reading 'from')`) são exatamente os mesmos, nas mesmas linhas, que aparecem rodando o `origin/main` publicado (`7ac0aa3`) sem nenhuma mudança minha — comparei os dois lado a lado pra confirmar. É a mesma limitação de rede do sandbox (sem acesso ao CDN do Supabase) já documentada no relatório da Fase 0, não uma regressão desta fase.

## 7. Riscos e limitações conhecidas (decisão deliberada, não descuido)

- **Rotas propositalmente deixadas sem guard nesta fase**: `obra` (detalhe individual — Montador depende de acesso direto pelo celular; travar isso é uma mudança maior, fora de escopo), `chao-de-fabrica`/`tv` (painel de exibição sem usuário logado dedicado — travar poderia quebrar o modo quiosque da TV física), e os itens de menu sem `perm` (`producao`, `pendencias`, `tarefas`, `lotes`, `hoje`, `meu-painel` — mantidos de acesso universal, igual sempre foram, pra não regredir o Montador/Produção que já contam com eles no menu reduzido).
- **Perfil Assistência (novo) fica mais aberto do que o ideal em 3 itens**: como ele usa o mesmo array `MENU` "cheio" (não o reduzido do Operador — a troca hoje é só `Operador/Montador` vs. "todo o resto"), e como `Produção`/`Tarefas`/`Lotes` não têm `perm` (pelo motivo do ponto acima), uma pessoa com perfil Assistência veria esses 3 itens no menu, mesmo a descrição pedir "restrita a atendimentos/agenda/pendências". Não é uma falha de segurança (não dá acesso a nada sensível — produção/tarefas/lotes já eram universais), mas é menos enxuto do que o ideal. Como isso depende de redesenhar a navegação por perfil (não só filtrar o que já existe), decidi não fazer isso agora — é claramente trabalho de Fase 2 (a fase que trata de menu/IA), e hoje **zero colaboradores têm esse perfil**, então o impacto real é zero até alguém ser atribuído a ele.
- **`montagem.aprovarFinalizacao`/`admin.usuarios`**: como pedido, só o dado padrão foi definido (Admin), sem lógica hardcoded — mas isso significa que, do jeito que está hoje, só o Admin pode aprovar finalização/gerenciar usuários até vocês decidirem diferente e ajustarem em Configurações → Permissões.
- Nenhuma migração de dado foi necessária além da correção de `state.permissoes` (seção 5) — não existe nenhum outro campo dependente do valor antigo do perfil que precisasse de tratamento.

## 8. O que NÃO foi feito (fora do escopo da Fase 1, de propósito)

Novo Kanban, nova Agenda, novo Admin, nova TV, nova Montagem (a máquina de estado "Em montagem → Pronto para finalizar → Aprovação → Finalizado" continua não existindo — só a permissão `montagem.aprovarFinalizacao` foi preparada), Auth/tela de Login real, novo fluxo de Nova Obra, redesenho de navegação/IA, remoção de qualquer coisa (TV continua no código, com dependência preservada).

---

## Próximo passo

Aguardando sua revisão desta matriz e desses guards. **Não vou publicar nada** até você confirmar — nem pedir pra eu preparar o commit. Os 13 arquivos já estão prontos e testados; posso te dar o mesmo passo a passo de cópia/commit que usamos na Fase 0 assim que você aprovar (com ou sem ajustes na matriz da seção 3).
