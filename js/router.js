/* ============================================================
   MOODO PRODUÇÃO — roteador (hash router simples)
   ============================================================ */
(function(){
  "use strict";
  const M = window.M;

  const MENU = [
    {group:"", items:[
      {key:"hoje", label:"Hoje", icon:"home", route:"#/hoje"},
    ]},
    {group:"Produção", items:[
      {key:"producao", label:"Produção", icon:"kanban", route:"#/producao"},
      {key:"obras", label:"Obras", icon:"building", route:"#/obras"},
      {key:"pendencias", label:"Pendências", icon:"alert", route:"#/pendencias"},
      {key:"para-finalizar", label:"Para Finalizar", icon:"check-circle", route:"#/para-finalizar"},
      {key:"tarefas", label:"Tarefas", icon:"list", route:"#/tarefas"},
      {key:"lotes", label:"Lotes", icon:"package", route:"#/lotes"},
      {key:"montagem", label:"Montagem", icon:"wrench", route:"#/montagem"},
      {key:"assistencias", label:"Assistências", icon:"lifebuoy", route:"#/assistencias"},
    ]},
    {group:"Gestão", items:[
      {key:"indicadores", label:"Indicadores", icon:"bar-chart", route:"#/indicadores"},
      {key:"desempenho", label:"Desempenho", icon:"trophy", route:"#/desempenho"},
      {key:"auditoria", label:"Auditoria", icon:"shield", route:"#/auditoria"},
      {key:"calendario", label:"Calendário", icon:"calendar", route:"#/calendario"},
    ]},
    {group:"Chão de fábrica", items:[
      {key:"chao-de-fabrica", label:"Chão de Fábrica", icon:"tv", route:"#/chao-de-fabrica"},
      {key:"tv", label:"Painel TV", icon:"tv", route:"#/tv"},
      {key:"meu-painel", label:"Minha Produção", icon:"user", route:"#/meu-painel"},
    ]},
  ];
  const FOOTER = [
    {key:"equipe", label:"Equipe", icon:"users", route:"#/equipe"},
    {key:"configuracoes", label:"Configurações", icon:"settings", route:"#/configuracoes"},
  ];

  // menu reduzido para OPERADOR/MONTADOR — regra de menor acesso (seção 56)
  const MENU_OPERADOR = [
    {group:"", items:[
      {key:"meu-painel", label:"Minha Produção", icon:"home", route:"#/meu-painel"},
    ]},
    {group:"Meu trabalho", items:[
      {key:"producao", label:"Produção", icon:"kanban", route:"#/producao"},
      {key:"tarefas", label:"Minhas Tarefas", icon:"list", route:"#/tarefas"},
      {key:"pendencias", label:"Minhas Pendências", icon:"alert", route:"#/pendencias"},
      {key:"assistencias", label:"Assistências", icon:"lifebuoy", route:"#/assistencias"},
      {key:"calendario", label:"Calendário", icon:"calendar", route:"#/calendario"},
    ]},
  ];
  const FOOTER_OPERADOR = [
    {key:"equipe", label:"Equipe", icon:"users", route:"#/equipe"},
  ];

  // navegação mobile do operador (seção "NAVEGAÇÃO MOBILE" do PWA)
  const MOBILE_NAV_OPERADOR = [
    {key:"meu-painel", label:"Hoje", icon:"home", route:"#/meu-painel"},
    {key:"tarefas", label:"Tarefas", icon:"list", route:"#/tarefas"},
    {key:"pendencias", label:"Pendências", icon:"alert", route:"#/pendencias"},
    {key:"assistencias", label:"Assist.", icon:"lifebuoy", route:"#/assistencias"},
    {key:"mais", label:"Mais", icon:"grip", route:"#/equipe"},
  ];

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

  M.Router = { MENU, FOOTER, MENU_OPERADOR, FOOTER_OPERADOR, MOBILE_NAV_OPERADOR, parseHash, ROUTES };
})();
