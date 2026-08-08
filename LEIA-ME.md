# MOODO PRODUÇÃO — v2.1 (etapas do pipeline 100% configuráveis)

Protótipo navegável e instalável (PWA) do sistema operacional de produção da Moodo — o ponto
em que uma venda aprovada no SIS Marcenaria vira trabalho real de fábrica, logística e
montagem, até a entrega e eventual assistência pós-venda.

Esta é a **segunda geração** do protótipo: não é um conjunto de telas novas coladas na v1, é um
redesenho do sistema inteiro em cima da especificação completa (78 seções + adendo de PWA),
com o objetivo de responder, todo dia, na prática: o que precisa ser feito agora, quem precisa
fazer, o que está impedindo, o que falta pra finalizar, quem está atrasado, quanto produzimos,
onde os problemas se repetem.

## Novidade da v2.1 — as etapas do pipeline deixaram de ser fixas no código

Até a v2.0, o pipeline (Agendada → Medição → ... → Montagem → Finalizada) era uma lista fixa
escrita no código-fonte — mudar uma etapa exigia mexer em JavaScript. Isso não atendia ao
requisito de processo configurável, então a v2.1 reconstruiu essa parte do zero:

- **Nova tela: Configurações → Processos → Etapas do pipeline.** Cada etapa agora é um registro
  editável, com nome, nome curto (o que aparece no Kanban), grupo visual (Pré-produção / Fábrica
  / Logística-Obra), cor/status visual, tempo esperado em dias, responsável padrão, peso no valor
  processado, se exige conferência e se permite avanço excepcional.
- **Ações por etapa:** `+ Nova etapa`, `Editar`, `Duplicar`, mover para cima/baixo (setas) ou
  **arrastar a linha da tabela** para reordenar livremente, `Desativar`/`Ativar`, e `Excluir`.
- **Etapa com histórico nunca é apagada de verdade** — se algum móvel, tarefa ou evento de
  auditoria já passou por ela, o botão de excluir fica bloqueado e só resta desativar. O nome que
  aparece no histórico antigo continua sendo o nome original da etapa, mesmo que ela seja
  renomeada depois. Sem histórico, a etapa pode ser excluída definitivamente.
- **Biblioteca de tarefas padrão por etapa, agora editável de verdade**: título, descrição,
  ordem, obrigatoriedade, responsável padrão, prazo esperado, se permite avanço excepcional, se
  exige conferência — e um botão para **mover a tarefa padrão para outra etapa** (o exemplo que
  você deu, "Conferir ferragens" saindo de Embalagem e indo para Pré-Montagem, funciona
  exatamente assim, sem tocar em código).
- **Biblioteca de requisitos por etapa, também configurável**: antes eram constantes fixas no
  código; agora cada etapa tem sua própria lista de requisitos, com adicionar/editar/excluir,
  reordenar (arrastar), obrigatório/recomendado/opcional, permite avanço excepcional (override) e
  exige evidência/anexo.
- **Todo o resto do sistema passou a ler essa configuração dinamicamente** — Kanban (colunas e
  agrupamento visual), Tarefas, Auditoria, Indicadores (WIP por etapa, valor processado),
  Desempenho e as regras de bloqueio/avanço excepcional não têm mais nenhuma lista fixa de etapas
  no código: tudo vem de `Configurações → Processos → Etapas`. O exemplo do enunciado — inserir
  "Conferência Final" entre Pré-Montagem e Limpeza e Embalagem — funciona direto pela tela, sem
  precisar de mim para editar código.
- Por baixo do capô, cada móvel agora guarda a etapa como uma **chave estável** (ex.:
  `"EMBALAGEM"`) em vez de uma posição numérica na lista — é o que torna seguro inserir, remover
  ou reordenar etapas sem corromper os dados de móveis que já estão em produção.

## Como abrir

**Opção mais simples:** dê duplo-clique em `index.html`. Funciona offline, sem instalar nada.

Alguns navegadores restringem `localStorage` e o Service Worker (PWA) quando o arquivo é aberto
direto do disco (`file://`). Se os dados não salvarem entre sessões, ou o app não oferecer
"instalar", use a opção abaixo.

**Opção recomendada (ativa o PWA por completo):**

1. Abra um terminal dentro da pasta `moodo-producao`.
2. Rode: `python3 -m http.server 8080` (ou qualquer servidor HTTP estático — `npx serve`, etc.)
3. Acesse `http://localhost:8080` no navegador.
4. No Chrome/Edge, o navegador vai oferecer "Instalar app" — isso cria um atalho que abre em
   janela própria, sem barra de endereço, como um app nativo (celular, tablet, notebook ou TV).

Para usar em celular, tablet ou TV na mesma rede, rode o servidor num computador e acesse pelo
IP dele (ex.: `http://192.168.0.10:8080`) a partir do outro dispositivo. Quando o sistema for
hospedado de verdade (Vercel, por exemplo), isso passa a funcionar de qualquer lugar, com
domínio próprio (`producao.moodo.com.br`, por exemplo).

## O usuário padrão ao abrir

O protótipo abre logado como **Paulo Henrique — Administrador**, para você ver o sistema
completo de cara (Dashboard, Kanban, todas as obras, Indicadores, Desempenho, Auditoria,
Configurações). Use o seletor de usuário no rodapé do menu lateral para trocar para qualquer
colaborador (ex.: "Willian Souza — Operador") e ver a experiência reduzida, focada em "Minha
Produção", que é o que abre primeiro no celular de cada colaborador no dia a dia real.

## O que mudou nesta versão (visão geral)

- **Redesenho visual completo**: paleta creme/marrom/dourado da Moodo, tipografia com mais
  hierarquia e respiro, cards limpos, sombras discretas — e **nenhum ícone emoji**: todos os
  ícones agora são lineares (SVG), no mesmo estilo em toda a tela, do menu à TV.
- **Kanban de Ambientes** como visão padrão (não mais Móveis), com as etapas agrupadas
  visualmente em Pré-produção / Fábrica / Logística-Obra, e progresso mostrado como "X de Y
  concluídos" — não mais só a etapa do item mais atrasado.
- **Nova Obra em página única**: o wizard de 5 passos virou uma tela só, rolável, com 7 seções
  (documentos, dados extraídos, valores, ambientes, itens, componentes especiais, resumo) — menos
  clique, mais visão do todo antes de confirmar.
- **Bloqueio com liberação excepcional controlada**: tarefas obrigatórias travam o avanço de
  etapa. Quem tem permissão pode pedir liberação excepcional (com motivo, usuário identificado e
  data/hora registrados), mas isso **não conclui a tarefa** — o item avança "com ressalva" e a
  pendência continua visível em todo lugar até ser resolvida de verdade. Tarefas marcadas como
  "não permite avanço excepcional" travam mesmo para o administrador.
- **Fluxos operacionais por categoria de pendência**: Vidro, Serralheria, Pintura, Estofado,
  Falta de material, Ferragem, Material do cliente, Aprovação, Medição, Obra civil, Retrabalho e
  Outro têm, cada um, um caminho padrão de passos (ex.: Vidro → medir → confirmar → orçar →
  aprovar → pedir → acompanhar → receber → conferir → instalar → finalizar), com "próxima ação"
  sempre visível no card da pendência.
- **"Refação" virou "Retrabalho"** em toda a interface, com fluxo próprio (origem, responsável,
  nova produção, conferência) e sem contar como produção nova no valor processado.
- **Minha Produção**, o painel do colaborador, foi reconstruído como a tela inicial de quem abre
  o sistema no celular: saudação, o que fazer agora (com Iniciar/Pausar/Concluir), próximas
  tarefas, minhas pendências com próxima ação e prazo, atrasadas e concluídas hoje.
- **Montagem com checklist de encerramento** (8 itens: móveis instalados, portas e gavetas
  reguladas, ferragens conferidas, limpeza, fotos finais, conferência final, pendências
  registradas) — a obra fecha como "concluída" ou "concluída com pendências", nunca no escuro.
- **Dois módulos novos**: **Assistências** (pós-venda/garantia — origem, categoria, prioridade,
  prazo, ciclo de vida completo até concluída) e **Auditoria** (todo avanço com ressalva,
  liberação excepcional, retrabalho, reabertura de pendência e mudança crítica fica registrado,
  categorizado em Operacional/Qualidade/Governança — o objetivo é enxergar onde o processo
  falha, não apontar culpado).
- **Permissões por perfil**: Administrador, PCP/Gestão, Liderança, Operador, Montador e
  Consulta/TV, cada um vendo só o que precisa (regra de menor acesso) — operador e montador têm
  menu reduzido (Minha Produção, Tarefas, Pendências, Assistências, Calendário).
- **Desempenho da equipe** com ranking por índice geral (valor processado, pontualidade,
  qualidade, pendências, velocidade de resolução, participação — pesos configuráveis) e uma área
  de Bonificação claramente marcada como **BETA / em definição**, sem calcular folha real.
- **Modo TV redesenhado** — fundo preto, dourado, alto contraste, relógio e data fixos, meta
  mensal em anel circular, e um **editor de painel** simplificado em Configurações → Modo TV
  para ativar/desativar cada widget (produção por etapa, meta, WIP, atenção da equipe, próximas
  entregas) e ajustar a ordem.
- **PWA de verdade**: manifesto, ícone, tela de splash, modo standalone, indicador
  online/offline sempre visível, aviso discreto de nova versão disponível, cache básico do shell
  do app para abrir mesmo com internet instável (sincronização offline completa fica para uma
  fase seguinte, por decisão explícita do escopo do MVP).

## Prioridades já implementadas (na ordem da especificação)

Design geral · Dashboard · Kanban · Nova Obra · Obra · Ambiente · Tarefas · Minha Produção ·
Pendências · Fluxos de Pendência · Para Finalizar · Bloqueios e Liberação Excepcional ·
Montagem · Assistências · Desempenho · Auditoria · Calendário · Modo TV · Editor do Modo TV ·
Configurações · Permissões · **Etapas do pipeline 100% configuráveis (nova em v2.1)** ·
Biblioteca de tarefas padrão por etapa (editável e movível entre etapas) · Biblioteca de
requisitos por etapa (editável, sem constantes fixas no código).

## O que é simulado ou simplificado nesta fase (MVP), por decisão da própria especificação

- **Importação de PDF (OS + Orçamento):** não há OCR real. O botão "simular leitura automática"
  preenche dados de exemplo pré-definidos, só para validar o fluxo de Nova Obra.
- **Integração com o SIS Marcenaria:** existe o texto "Conectar API SIS Marcenaria — em breve"
  em Configurações → Integrações, explicando o que a API pública hoje expõe e o que não expõe.
  Nenhuma chamada real é feita.
- **Editor do Modo TV:** nesta versão é ativar/desativar widget e reordenar — não é ainda um
  editor livre de arrastar/redimensionar posição na grade. Isso é evolução natural quando o Modo
  TV tiver um backend real sincronizando em tempo real com desktop e TV.
- **Login/permissões:** o seletor de usuário no rodapé do menu é um "modo demonstração" — troca
  quem está logado sem senha, só para você navegar pelos diferentes perfis. Login persistente e
  seguro de verdade é arquitetura prevista, mas depende de um backend (ver abaixo).
- **Bonificação:** a tela existe e já acumula os números que uma régua de bonificação usaria
  (valor processado, pontualidade, qualidade, pendências, retrabalho, participação), mas está
  marcada como BETA e **não deve ser usada como cálculo definitivo de bônus ou pagamento**.
- **Sincronização offline completa:** o app mostra claramente quando está online/sem conexão e
  nunca finge que salvou algo que não salvou, mas a fila de ações pendentes para sincronizar
  automaticamente quando a conexão voltar é uma evolução futura — o MVP não exige isso.
- **Produtividade física (chapas, m², metros de fita, peças por operador):** não implementado
  ainda; os campos e a estrutura de dados já antecipam isso para quando houver apontamento
  físico real vindo de máquina/operador.
- **Persistência:** os dados ficam salvos no `localStorage` do navegador (por
  dispositivo/navegador). Não há backend, login real ou sincronização entre usuários — é o
  próximo passo natural quando o protótipo for validado com a equipe (ver seção seguinte).

## Caminho sugerido para virar sistema real

A arquitetura já foi pensada para isso, mas nada disso está implementado ainda:

- **Frontend:** hoje é HTML/CSS/JS puro (sem build), para funcionar neste ambiente de protótipo.
  Num projeto real, migra para React + TypeScript + Tailwind, hospedado na Vercel.
- **Backend:** Supabase (Postgres + Auth + Storage + Realtime) — permite login de verdade por
  perfil, múltiplos colaboradores editando ao mesmo tempo, sincronização quase instantânea entre
  celular, desktop e a TV do chão de fábrica, e histórico/auditoria realmente auditável.
- **Domínio:** dá para publicar em `producao.moodo.com.br`, apontando para a Vercel.
- **WhatsApp:** com um backend real, é possível notificar colaboradores de novas tarefas/
  pendências via WhatsApp (API oficial da Meta ou provedores não-oficiais, como conversamos).

## Dados de exemplo

O protótipo já vem com 6 obras de exemplo (incluindo a "OS 2026/336 — Marcela e Cristiano",
usada como referência na especificação), colaboradores com perfis diferentes, pendências em
vários estágios de fluxo, assistências abertas e eventos de auditoria — tudo pra você navegar
sem precisar cadastrar nada.

Use "+ Nova Obra" para testar o fluxo de importação do zero — ele cria uma obra nova de verdade
sem mexer nos dados de exemplo. Para zerar tudo e voltar aos dados de exemplo originais, vá em
Configurações → "Dados de exemplo" → "Restaurar dados de exemplo".
