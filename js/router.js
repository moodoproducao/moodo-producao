/* ============================================================
   MOODO PRODUÇÃO — roteador (hash router simples)
   ============================================================ */
(function(){
  "use strict";
  const M = window.M;

  // FASE 1 (V2 — permissões por ação, camada MENU): item com "perm" só
  // aparece no menu se M.Store.pode(perm) — ver navHtml()/footerHtml() em
  // js/main.js. Item sem "perm" continua visível igual sempre foi (não
  // redesenhamos a navegação nesta fase — só acrescentamos o filtro sobre a
  // mesma estrutura MENU/MENU_OPERADOR/FOOTER/FOOTER_OPERADOR que já existia).
  const MENU = [
    {group:"", items:[
      {key:"hoje", label:"Hoje", icon:"home", route:"#/hoje"},
    ]},
    {group:"Produção", items:[
      {key:"producao", label:"Produção", icon:"kanban", route:"#/producao", perm:"producao.ver"},
      {key:"obras", label:"Obras", icon:"building", route:"#/obras", perm:"obra.ver"},
      {key:"pendencias", label:"Pendências", icon:"alert", route:"#/pendencias"},
      {key:"para-finalizar", label:"Para Finalizar", icon:"check-circle", route:"#/para-finalizar", perm:"montagem.ver"},
      {key:"tarefas", label:"Tarefas", icon:"list", route:"#/tarefas"},
      {key:"lotes", label:"Lotes", icon:"package", route:"#/lotes"},
      {key:"montagem", label:"Montagem", icon:"wrench", route:"#/montagem", perm:"montagem.ver"},
      {key:"assistencias", label:"Assistências", icon:"lifebuoy", route:"#/assistencias", perm:"assistencia.ver"},
    ]},
    {group:"Gestão", items:[
      {key:"indicadores", label:"Indicadores", icon:"bar-chart", route:"#/indicadores", perm:"admin.indicadores"},
      {key:"desempenho", label:"Desempenho", icon:"trophy", route:"#/desempenho", perm:"admin.indicadores"},
      {key:"auditoria", label:"Auditoria", icon:"shield", route:"#/auditoria", perm:"admin.auditoria"},
      {key:"calendario", label:"Calendário", icon:"calendar", route:"#/calendario", perm:"agenda.ver"},
    ]},
    {group:"Chão de fábrica", items:[
      {key:"chao-de-fabrica", label:"Chão de Fábrica", icon:"tv", route:"#/chao-de-fabrica"},
      {key:"tv", label:"Painel TV", icon:"tv", route:"#/tv"},
      {key:"meu-painel", label:"Minha Produção", icon:"user", route:"#/meu-painel"},
    ]},
  ];
  const FOOTER = [
    {key:"equipe", label:"Equipe", icon:"users", route:"#/equipe", perm:"admin.equipe"},
    {key:"configuracoes", label:"Configurações", icon:"settings", route:"#/configuracoes", perm:"admin.configuracoes"},
  ];

  // menu reduzido para OPERADOR/MONTADOR — regra de menor acesso (seção 56)
  const MENU_OPERADOR = [
    {group:"", items:[
      {key:"meu-painel", label:"Minha Produção", icon:"home", route:"#/meu-painel"},
    ]},
    {group:"Meu trabalho", items:[
      {key:"producao", label:"Produção", icon:"kanban", route:"#/producao", perm:"producao.ver"},
      {key:"tarefas", label:"Minhas Tarefas", icon:"list", route:"#/tarefas"},
      {key:"pendencias", label:"Minhas Pendências", icon:"alert", route:"#/pendencias"},
      {key:"assistencias", label:"Assistências", icon:"lifebuoy", route:"#/assistencias", perm:"assistencia.ver"},
      {key:"calendario", label:"Calendário", icon:"calendar", route:"#/calendario", perm:"agenda.ver"},
    ]},
  ];
  const FOOTER_OPERADOR = [
    {key:"equipe", label:"Equipe", icon:"users", route:"#/equipe", perm:"admin.equipe"},
  ];

  // navegação mobile do operador (seção "NAVEGAÇÃO MOBILE" do PWA)
  const MOBILE_NAV_OPERADOR = [
    {key:"meu-painel", label:"Hoje", icon:"home", route:"#/meu-painel"},
    {key:"tarefas", label:"Tarefas", icon:"list", route:"#/tarefas"},
    {key:"pendencias", label:"Pendências", icon:"alert", route:"#/pendencias"},
    {key:"assistencias", label:"Assist.", icon:"lifebuoy", route:"#/assistencias", perm:"assistencia.ver"},
    {key:"mais", label:"Mais", icon:"grip", route:"#/equipe", perm:"admin.equipe"},
  ];

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
  };

  M.Router = { MENU, FOOTER, MENU_OPERADOR, FOOTER_OPERADOR, MOBILE_NAV_OPERADOR, parseHash, ROUTES, ROUTE_PERMS };
})();
