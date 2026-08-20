/* ============================================================
   MOODO PRODUÇÃO — roteador (hash router simples)
   ============================================================ */
(function(){
  "use strict";
  const M = window.M;

  // FASE 2 (Navegação V2): a navegação deixa de ser o binário "MENU" (Admin/
  // PCP/Líder/Gestor/TV) vs. "MENU_OPERADOR" (Produção/Montador) e passa a
  // ser definida POR PERFIL — cada um dos 8 perfis tem sua própria lista de
  // itens de topo, exatamente a arquitetura V2 aprovada:
  //   HOJE · OBRAS · PENDÊNCIAS · MONTAGEM · ASSISTÊNCIAS · AGENDA · ADMIN
  // (TV continua como superfície separada — não entra nesta navegação.)
  //
  // Isso é REORGANIZAÇÃO DE NAVEGAÇÃO, não remoção de funcionalidade: as
  // rotas antigas (Produção, Para Finalizar, Tarefas, Lotes, Indicadores,
  // Desempenho, Auditoria, Calendário, Chão de Fábrica, Equipe,
  // Configurações, Minha Produção) continuam respondendo por compatibilidade
  // (ver ROUTES abaixo) — só saem do MENU. Nenhum arquivo/lógica foi
  // apagado; a remoção física é a Fase 10, não esta.
  //
  // Cada item aqui usa a MESMA chave de permissão já validada na Fase 1
  // (nenhuma permissão nova foi criada só pra fazer um item aparecer) — a
  // navegação se adapta à permissão que já existe, nunca o contrário. Item
  // sem "perm" é de acesso universal, igual sempre foi (Hoje/Pendências).
  const MENU_ITEMS = {
    hoje:         {label:"Hoje",         icon:"home",     route:"#/hoje"},
    obras:        {label:"Obras",        icon:"building", route:"#/obras",        perm:"obra.ver"},
    // "Minhas Obras" (Montador): mesma tela de Obras, mesmos dados — só
    // permissão diferente (obra.verAtribuidas, que o Montador já tinha desde
    // a Fase 1) e força a visão restrita/rótulo próprio (ver js/pages/obras.js).
    minhasObras:  {label:"Minhas Obras", icon:"building", route:"#/minhas-obras", perm:"obra.verAtribuidas"},
    pendencias:   {label:"Pendências",   icon:"alert",    route:"#/pendencias"},
    montagem:     {label:"Montagem",     icon:"wrench",   route:"#/montagem",     perm:"montagem.ver"},
    assistencias: {label:"Assistências", icon:"lifebuoy", route:"#/assistencias", perm:"assistencia.ver"},
    // "Atendimentos" (Assistência): alias/recorte de rótulo sobre a MESMA
    // tela/rota de Assistências de hoje, mesma permissão — NÃO é o fluxo
    // final de Assistência V2/mobile (isso é fase própria, ainda não
    // iniciada). Ver aviso completo em js/pages/assistencias.js.
    atendimentos: {label:"Atendimentos", icon:"lifebuoy", route:"#/atendimentos", perm:"assistencia.ver"},
    // "Agenda": mesmo Calendário de sempre, só com o rótulo novo pedido pra
    // esta fase — a tela nova da Agenda é a Fase 6, não reescrita aqui.
    agenda:       {label:"Agenda",       icon:"calendar", route:"#/agenda",       perm:"agenda.ver"},
    // "Admin": entrada única no menu (hub temporário — js/pages/adminHub.js).
    // Array = OR (mesma semântica já usada em ROUTE_PERMS["obra"]): aparece
    // pra quem tiver QUALQUER uma das permissões administrativas.
    admin:        {label:"Admin",        icon:"settings", route:"#/admin",        perm:["admin.equipe","admin.configuracoes","admin.indicadores","admin.auditoria"]},
  };

  // Lista de chaves de MENU_ITEMS, na ordem, por perfil — exatamente a
  // "MENU POR PERFIL" do pedido da Fase 2. TV não tem menu operacional
  // (superfície separada, sem colaborador real atribuído).
  const MENU_POR_PERFIL = {
    ADMIN:       ["hoje","obras","pendencias","montagem","assistencias","agenda","admin"],
    GESTOR:      ["hoje","obras","pendencias","montagem","assistencias","agenda"],
    PCP:         ["hoje","obras","pendencias","montagem","agenda"],
    LIDERANCA:   ["hoje","obras","pendencias","montagem","agenda"],
    OPERADOR:    ["hoje","pendencias"],
    MONTADOR:    ["hoje","minhasObras","agenda","pendencias"],
    ASSISTENCIA: ["hoje","atendimentos","agenda","pendencias"],
    TV:          [],
  };
  // monta a lista de itens (com perm já resolvida) pro perfil informado —
  // usada tanto pelo menu desktop quanto pelo mobile (mesma fonte de dados,
  // sem duas navegações divergentes por engano).
  function menuDoPerfil(perfilKey){
    return (MENU_POR_PERFIL[perfilKey] || []).map(k=> Object.assign({key:k}, MENU_ITEMS[k]));
  }

  // FASE 1 (V2 — permissões por ação, camada ROTA): chave da rota → ação
  // exigida. Se M.Store.pode(perm) for falso, main.js render() não chama a
  // função de página de verdade — mostra "Acesso restrito" no lugar (ver
  // js/main.js). O valor pode ser uma string (uma permissão exigida) OU um
  // array de strings (BASTA UMA — semântica "OU", usado por "obra" abaixo).
  //
  // "obra" (detalhe individual, rota "obra/:id" — item 3 do pedido de
  // ajuste da rodada 2, corrigido de verdade no item 1 da rodada 3): antes
  // ficava sem guard nenhum, de propósito, porque Montador/Produção/
  // Assistência precisam abrir uma obra específica sem ter acesso à lista
  // geral. A entrada abaixo (usada só pra saber SE a rota exige alguma
  // permissão — ver "permNecessaria" em js/main.js) exige pelo menos uma de
  // obra.verTodas / obra.verAtribuidas / obra.verContexto (ver comentário
  // longo em js/data.js sobre as 3), mas quem decide de verdade se ESTA
  // obra específica da URL pode ser aberta é M.Store.podeAbrirObra(obraId)
  // (js/store.js), chamado direto em js/main.js pra key==="obra" — não o
  // check genérico de string/array usado pelas outras rotas. verTodas
  // libera qualquer obra; verAtribuidas/verContexto só liberam se o obraId
  // estiver em Store.obraIdsDoColaborador(usuário atual) (tarefa, pendência
  // ou assistência vinculada à pessoa). Sem nenhuma das 3, ou com obraId
  // fora do contexto, nega — não existe mais brecha de digitar o ID de uma
  // obra alheia na URL.
  //
  // Deliberadamente NÃO cobre "chao-de-fabrica"/"tv" (painel de exibição,
  // hoje sem usuário logado dedicado — travar isso poderia quebrar o modo
  // quiosque da TV física) nem itens sem "perm" no MENU (pendencias,
  // tarefas, lotes, hoje, meu-painel — mantidos de acesso universal, igual
  // sempre foram). Documentado como limitação conhecida no relatório da
  // Fase 1, não como descuido.
  const ROUTE_PERMS = {
    "nova-obra": "obra.criar",
    "obras": "obra.ver",
    "obra": ["obra.verTodas", "obra.verAtribuidas", "obra.verContexto"],
    "producao": "producao.ver",
    "montagem": "montagem.ver",
    "para-finalizar": "montagem.ver",
    "assistencias": "assistencia.ver",
    "indicadores": "admin.indicadores",
    "desempenho": "admin.indicadores",
    "auditoria": "admin.auditoria",
    "calendario": "agenda.ver",
    "equipe": "admin.equipe",
    "configuracoes": "admin.configuracoes",
    // FASE 2 (Navegação V2) — rotas novas, todas reaproveitando permissão já
    // existente da Fase 1 (nenhuma permissão nova criada pra isso):
    "minhas-obras": "obra.verAtribuidas",
    "atendimentos": "assistencia.ver",
    "agenda": "agenda.ver",
    "admin": ["admin.equipe", "admin.configuracoes", "admin.indicadores", "admin.auditoria"],
  };

  function parseHash(){
    const h = (location.hash||"#/hoje").replace(/^#\//,"");
    const parts = h.split("/").filter(Boolean);
    return {key: parts[0]||"hoje", params: parts.slice(1)};
  }

  const ROUTES = {
    "hoje": ()=> M.Pages.hoje(),
    // FASE 3 (handoff): "Dashboard" saiu do menu, virou "Hoje" (fila de ação,
    // não mais KPIs). Mantido como alias de rota só pra não quebrar link/
    // favorito antigo — js/pages/dashboard.js continua no repo, só não é
    // mais alcançado pelo menu nem pelo fallback padrão.
    "dashboard": ()=> M.Pages.hoje(),
    "producao": ()=> M.Pages.producao(),
    "obras": ()=> M.Pages.obras(),
    "nova-obra": ()=> M.Pages.novaObra(),
    "obra": (p)=> M.Pages.obraDetail(p[0]),
    "pendencias": ()=> M.Pages.pendencias(),
    "para-finalizar": ()=> M.Pages.paraFinalizar(),
    "tarefas": ()=> M.Pages.tarefas(),
    "indicadores": ()=> M.Pages.indicadores(),
    "desempenho": ()=> M.Pages.desempenho(),
    "auditoria": ()=> M.Pages.auditoria(),
    "calendario": ()=> M.Pages.calendario(),
    "lotes": ()=> M.Pages.lotes(),
    "montagem": ()=> M.Pages.montagem(),
    "assistencias": ()=> M.Pages.assistencias(),
    "chao-de-fabrica": ()=> M.Pages.chaoDeFabrica(),
    "tv": ()=> M.Pages.tv(),
    "equipe": ()=> M.Pages.equipe(),
    "configuracoes": (p)=> M.Pages.configuracoes(p[0]),
    "meu-painel": ()=> M.Pages.meuPainel(),
    // FASE 2 (Navegação V2) — rotas novas, todas reaproveitando página/dado
    // que já existia (ver comentário em MENU_ITEMS acima e nos respectivos
    // js/pages/*.js — nenhuma tabela nem tela nova foi criada):
    "minhas-obras": ()=> M.Pages.obras(true),
    "atendimentos": ()=> M.Pages.assistencias(true),
    "agenda": ()=> M.Pages.calendario(),
    "admin": ()=> M.Pages.adminHub(),
  };

  M.Router = { menuDoPerfil, parseHash, ROUTES, ROUTE_PERMS };
})();
