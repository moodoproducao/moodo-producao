# Relatório — Fase 0 (Estabilização) — Moodo Produção V2

Status: **Fase 0 aprovada tecnicamente por você, com ressalva de correção no relatório (já aplicada abaixo). Nenhum push feito ainda — aguardando esclarecimento da identidade Git antes de publicar. Fase 1 NÃO iniciada.**

> **Correção desta versão do relatório**: a versão anterior deste documento afirmava, na seção E, que "em produção, com a CDN acessível, o Supabase sincroniza normalmente" — isso foi uma inferência, não algo validado. Corrigido abaixo (seção E) e adicionado um plano de smoke test em produção (seção J) para validar isso de fato, depois da publicação.

Escopo autorizado: somente Fase 0, conforme sua mensagem "PLANO APROVADO COM AJUSTES — AUTORIZAÇÃO SOMENTE DA FASE 0". Nenhum item das Fases 1+ foi tocado (ver seção F).

---

## A. Base usada

Como o clone do meu sandbox estava divergente do `origin/main` real (achado do plano anterior), **não usei aquele clone**. Cloneiei de novo, direto do GitHub (`github.com/moodoproducao/moodo-producao`), e confirmei:

```
HEAD: 26f7baea3f9a78180413183f588d69bd3072691a
Fase 6: Admin + Auditoria + TV
working tree limpo
```

Esse é exatamente o commit que você já validou como estado real de produção. Todo o trabalho da Fase 0 foi feito em cima dele.

---

## B. Arquivos alterados

Só 4 arquivos, nenhum outro:

| Arquivo | O que mudou |
|---|---|
| `js/data.js` | Correção do bug P0 da data fixa |
| `js/main.js` | Bump `APP_VERSION`: 3.6.0 → 3.6.1 |
| `service-worker.js` | Bump `CACHE_NAME`: v3.6.0 → v3.6.1 |
| `tests/regressions.js` | Suíte de testes reescrita (ver seção D) |

### Diff conceitual — `js/data.js`

Antes:
```js
const TODAY = new Date(2026,7,8); // 8 ago 2026
function dOff(days){ ... }
function todayISO(){ return TODAY.toISOString().slice(0,10); }
```

Depois:
```js
const _agoraReal = new Date();
const TODAY = new Date(_agoraReal.getFullYear(), _agoraReal.getMonth(), _agoraReal.getDate());
function dOff(days){ ... }              // inalterado
function todayISO(){ ... }              // inalterado
```

Só a **origem** do valor de `TODAY` mudou — de uma data fixa gravada no código para a data real do aparelho, à meia-noite local (mesma construção de antes, só trocando a fonte). `dOff()` e `todayISO()` continuam com o mesmo código, então tudo que depende deles (37 pontos de uso mapeados no plano anterior) passa a receber a data real automaticamente, sem precisar mexer em mais nada.

Isso também corrige de brinde um efeito colateral que não estava no seu pedido original mas é a mesma causa raiz: `M.TODAY` (usado em `js/actions.js` e `js/data.js` para abrir o Calendário sempre em agosto/2026) agora abre no mês/ano reais.

### O que **não** foi alterado

Nenhuma obra, pendência, tarefa, assistência ou histórico já salvo é reescrito por essa mudança. `TODAY` só é usado: (1) na função `todayISO()`, que é chamada toda vez que o sistema precisa "agora" — isso é cálculo em tempo real, nunca fica gravado; e (2) na semente de dados de demonstração (`SEED_OBRAS` etc., dentro de `js/data.js`), que só é usada quando **não existe nenhum dado salvo** no aparelho (primeira instalação, sem localStorage/Supabase). Confirmei isso lendo a função `load()` do `js/store.js`: se já existe estado salvo, ele é sempre usado — a semente nunca sobrescreve dado real.

---

## C. Impacto esperado nos dados reais existentes (obras já cadastradas)

Nenhuma perda ou reescrita de dado. O que muda é o **resultado de cálculos** que já existiam, porque agora comparam contra a data real em vez de uma data congelada em 8/ago/2026:

- **Hoje**: passa a mostrar tarefas/pendências do dia real, não mais "congelado" em agosto.
- **Atraso / dias até entrega** (`Calc.diasAte`/`diasDesde`): resultados corretos a partir de agora — antes, qualquer obra com prazo depois de 8/ago/2026 provavelmente aparecia com contagem errada ou "no prazo" incorretamente.
- **Risco** (`Calc.riscoObra`): passa a calcular com a distância real até a entrega. Isso é só o efeito da data corrigida — **não mexi na fórmula de risco em si** (o bug de ordenação do `if/else` que classifica obra quase pronta como risco BAIXO continua existindo; correção dele é fora do escopo da Fase 0, fica para a fase de Obras V2, conforme você aprovou no plano).
- **Agenda/Calendário**: abre no mês real.
- **Indicadores/Auditoria**: relatórios "do mês atual" passam a considerar o mês real.

Nada disso é migração de dado — é o mesmo cálculo de sempre, agora com o insumo (data de hoje) correto.

---

## D. Suíte de testes — reescrita, não só corrigida a data

Confirmei sua decisão (#10): a suíte antiga (`tests/regressions.js` de antes da Fase 1) estava referenciando símbolos que não existem mais no código atual — `RATEIO_INVALIDO`, `RESPONSAVEL_INVALIDO`, `OS_DUPLICADA` (como retorno `.motivo` de `Store.criarObra`), `m.historicoEtapas`, `Calc.periodoMesAtual()`, `prepararTabelasResponsivas`. Nenhum desses existe hoje.

Reescrevi o arquivo do zero, mantendo o mesmo formato de harness (Node + `node:vm`, sem dependências externas), cobrindo o comportamento **real e atual**:

1. `M.todayISO()` retorna a data real (regressão direta do bug P0).
2. Importação de PDF: detecção de componentes especiais (LED não gera pendência padrão; Espelho/Serralheria geram) e parsing de valores (subtotal prevalece; documento sem valor não quebra).
3. Nova Obra: componente desmarcado na revisão não vira componente crítico/pendência inicial.
4. `Store.criarObra`: componente crítico nasce com pendência real vinculada e bloqueia o móvel (`Store.bloqueiosMovel`).
5. `Store.moverEtapa`: grava no histórico central (`Store.state.historico`), não mais num array por móvel.
6. `Store.resolverPendencia`: sincroniza o componente crítico e libera o bloqueio.
7. **Novo**: `Store.pode()`/`Store.setPermissao()` — override de permissão por perfil, e proteção de que só quem já pode editar permissões consegue alterar.
8. `Calc.indicadores()`: verifiquei linha a linha contra o código real de `js/calc.js` e confirmei que os números do teste batem com a lógica de fato implementada (liberado/produzido/entregue/montado/emProducao/aguardandoMontagem por posição de etapa).
9. **Novo**: `Calc.diasAte`/`diasDesde`.

Validei rodando `node tests/regressions.js` — passou 100%, sem nenhum ajuste no código de produção para "fazer o teste passar" (fiz o caminho inverso: li o código real primeiro, só depois escrevi o teste).

### Achado da auditoria (não é bug da Fase 0 — é comportamento real de hoje, documentado para decisão futura)

`Store.criarObra` **não valida OS duplicada, responsável nem rateio** hoje — essas checagens existiam só no teste antigo, não existem mais em `js/store.js`. Não é algo que a Fase 0 deveria corrigir (não estava no escopo autorizado, e é uma decisão de regra de negócio, não um bug técnico).

**Registrado no backlog da futura revisão de Nova Obra** (conforme sua instrução — sem implementar agora):
- Validação de OS duplicada.
- Validação de responsável.
- Validação de rateio.

---

## E. Validação do app completo

Rodei o app real (servidor local + Chromium headless via Playwright) em três cenários, comparando **antes** (clone limpo do `origin/main`, sem nenhuma mudança) e **depois** (com a Fase 0 aplicada):

- **Antes**: `APP_VERSION 3.6.0`, `M.todayISO() = 2026-08-08` (bug presente).
- **Depois**: `APP_VERSION 3.6.1`, `M.todayISO() = 2026-08-19` (data real do dia).
- Menu e todas as rotas testadas (`#/hoje`, `#/obras`, `#/pendencias`, `#/agenda`, `#/admin`, `#/tv`) renderizam normalmente, idênticas antes e depois — nenhum item de menu foi adicionado, removido ou alterado.
- **Persistência**: criei um marcador, recarreguei a página — as 6 obras de exemplo continuaram lá, localStorage (`moodo_producao_state_v1`) intacto.
- **Service Worker / PWA**: registra e ativa normalmente, já servindo `service-worker.js?v=3.6.1` (cache-bust funcionando).
- **Supabase — o que foi validado, com precisão**: este sandbox não tem acesso à CDN do Supabase, então **a sincronização real com o Supabase não pôde ser validada aqui, nem antes nem depois da Fase 0**. O que de fato foi confirmado:
  - Nenhuma linha de `js/supabase-client.js` (ou qualquer código de integração com Supabase) foi tocada — o diff da Fase 0 não inclui esse arquivo.
  - O fallback local (cair para localStorage quando a nuvem está inacessível) funciona corretamente.
  - O comportamento observado no sandbox é **idêntico** entre o clone limpo do `origin/main` e o código com a Fase 0 aplicada — mesmo erro de rede, mesma mensagem de fallback, nos dois casos.
  - **Não estou afirmando** que a sincronização com o Supabase funciona em produção — isso depende de um ambiente com a CDN acessível, que não existe aqui. Ver seção J (smoke test em produção) para o plano de validar isso depois da publicação.

---

## F. Confirmação: nenhum item das Fases 1+ foi implementado

Conferi o `git diff` inteiro contra o `origin/main` — só os 4 arquivos da seção B foram tocados. Não criei nem alterei: novos perfis, novo menu, `faseMacro`, novo Kanban, nova Agenda, novo Admin, nova TV, nova Montagem, migração de status de Assistência, Auth, tela de Login, ou o novo fluxo de Nova Obra. Nada disso está no repositório.

---

## G. Sobre a identidade Git "Letícia Stefany" (seu ponto #8)

Não fiz nenhum push, nem mexi em configuração de identidade Git. Os 4 arquivos alterados estão prontos para entrega — vou te mandar aqui no chat e também gravar em `E:\moodo-producao-repo-pronto` (só escrita de arquivo, não é comando Git nenhum), do mesmo jeito que fiz nas Fases 1-6. Quem decide comitar/publicar esses arquivos — e esclarecer quem/o que é essa identidade "Letícia Stefany" que aparece nos commits reais — é você. Não vou tocar nisso sozinho.

---

## H. Riscos identificados (nenhum bloqueante para a Fase 0, registrados para transparência)

1. **Timezone**: `TODAY` é construído com hora local do aparelho (mesmo padrão de antes). Isso é seguro para o Brasil (UTC-3, sem horário de verão desde 2019) porque meia-noite local nunca "pula" para o dia UTC anterior. Testei no sandbox (que roda em UTC) e o resultado bateu certo com a data real.
2. **Repositório com lixo acumulado**: os 9 arquivos `.patch` soltos na raiz e as duas cópias paralelas obsoletas (sub-repo aninhado e a pasta em `F:\`) continuam lá — não toquei neles, ficam para a Fase 10 (limpeza), conforme combinado.
3. **`Store.criarObra` sem validação de duplicidade** — ver seção D, achado de auditoria, decisão sua para quando quiser.

---

## I. Critério de aceite da Fase 0 — checagem

| Critério | Status |
|---|---|
| `todayISO` usa data real | ✅ |
| Histórico existente não foi reescrito | ✅ |
| Nenhuma data antiga foi alterada indevidamente | ✅ |
| Testes V2 básicos passam | ✅ (`node tests/regressions.js` → `Regressões críticas: OK`) |
| App inicia normalmente | ✅ |
| Supabase sync continua funcionando | ⏳ Não validável neste sandbox (sem CDN). Confirmado: código não alterado + fallback local funcionando + comportamento idêntico ao `origin/main` sem a Fase 0. Sincronização real fica para o smoke test em produção (seção J) |
| PWA continua carregando | ✅ (Service Worker v3.6.1 ativo) |
| Navegação atual ainda funciona | ✅ (todas as rotas testadas renderizam) |
| Nenhum recurso V2 estrutural foi antecipado | ✅ (seção F) |
| Não há perda de dados | ✅ (localStorage intacto após reload) |

---

## J. Plano de smoke test em produção (a executar depois da publicação)

Assim que a Fase 0 estiver publicada em produção (https://moodo-producao.vercel.app/), pretendo verificar, nessa ordem:

1. **Carregamento dos dados do Supabase** — abrir o app em produção e confirmar que os dados carregados vêm da nuvem (não só do localStorage local), comparando com o que já existe no painel do Supabase.
2. **Criação de um registro de teste não destrutivo** — quando possível, criar algo claramente identificável como teste (ex.: uma pendência ou tarefa com um título tipo "TESTE FASE 0 — pode ignorar/excluir"), sem tocar em nenhuma obra real, e confirmar que ela é salva na nuvem.
3. **Atualização/reload** — recarregar a página e confirmar que o registro de teste persiste (veio do Supabase, não só da memória local).
4. **Sincronização entre sessões** — abrir em uma segunda aba/aparelho e confirmar que o mesmo registro de teste aparece lá também.
5. **Ausência de erros no console relacionados ao Supabase** — checar o console do navegador em produção por qualquer erro de conexão/sincronização.

Reporto o resultado de cada um desses 5 pontos no relatório de publicação (seção abaixo).

---

## Próximo passo

Fico por aqui, sem fazer push e sem iniciar a Fase 1, aguardando:

1. Esclarecimento sobre a identidade "Letícia Stefany" (seção G) — preciso entender quem/o que ela é antes de preparar qualquer publicação;
2. Depois de publicada a Fase 0, vou rodar o smoke test da seção J e te entregar: commit/hash publicado, versão em produção, resultado do smoke test, confirmação da data real, confirmação do Supabase, e erros encontrados (se houver);
3. Só depois disso, com sua confirmação explícita, seguir para a Fase 1.

**Não vou iniciar a Fase 1 automaticamente em nenhuma hipótese.**
