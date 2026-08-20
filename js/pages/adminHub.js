/* ============================================================
   PÁGINA: Admin (hub) — FASE 2 (Navegação V2)
   ------------------------------------------------------------
   Objetivo desta fase: uma entrada ÚNICA "Admin" no menu principal, no
   lugar de Indicadores/Desempenho/Auditoria/Equipe/Configurações
   aparecerem cada um como item separado (ver ARQUITETURA PRINCIPAL V2 no
   pedido da Fase 2). Esta página é só um HUB temporário — uma tela de
   links pras páginas administrativas que já existem e continuam
   funcionando exatamente como antes (nada de código/permissão delas
   mudou). O Admin V2 "de verdade" (redesenho completo dessas telas numa
   experiência única) é a Fase 8 — não antecipado aqui.

   Cada card só aparece se o perfil atual tiver a permissão daquela área
   (mesma matriz da Fase 1, nenhuma permissão nova) — ninguém vê um link
   morto pra uma tela que não pode abrir.
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI;
  M.Pages = M.Pages || {};

  const CARDS = [
    {perm:"admin.indicadores", route:"#/indicadores", icon:"bar-chart", titulo:"Indicadores", desc:"Carteira processada e métricas operacionais do mês."},
    {perm:"admin.indicadores", route:"#/desempenho",  icon:"trophy",    titulo:"Desempenho",  desc:"Índice geral, ranking e valor processado por colaborador."},
    {perm:"admin.auditoria",   route:"#/auditoria",   icon:"shield",    titulo:"Auditoria",    desc:"Exceções, overrides e alterações críticas."},
    {perm:"admin.equipe",      route:"#/equipe",      icon:"users",     titulo:"Equipe",       desc:"Colaboradores, cargo e perfil de acesso."},
    {perm:"admin.configuracoes",route:"#/configuracoes",icon:"settings",titulo:"Configurações",desc:"Processos, indicadores, TV, permissões e notificações."},
  ];

  M.Pages.adminHub = function(){
    const cards = CARDS.filter(c=> M.Store.pode(c.perm));
    if(!cards.length){
      return {title:"Admin", html:`<div class="card pad"><p>Seu perfil (<b>${UI.esc(M.Store.perfilAtual().label)}</b>) não tem acesso a nenhuma área administrativa.</p></div>`};
    }
    const html = `
      <div class="help-banner">${UI.icon('circle',13)} Hub temporário da Fase 2 — cada área abaixo continua sendo a mesma tela de sempre. O redesenho do Admin (uma experiência única) é de uma fase futura.</div>
      <div class="grid-2">
        ${cards.map(c=>`
          <a href="${c.route}" class="card pad" style="display:block;text-decoration:none;color:inherit;">
            <div class="flex-gap" style="align-items:center;gap:10px;">
              ${UI.icon(c.icon,20)}
              <div>
                <b>${UI.esc(c.titulo)}</b>
                <div class="small muted" style="margin-top:2px;">${UI.esc(c.desc)}</div>
              </div>
            </div>
          </a>
        `).join("")}
      </div>
    `;
    return {title:"Admin", crumb:"Área administrativa", html};
  };
})();
