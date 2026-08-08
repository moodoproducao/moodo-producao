/* ============================================================
   PÁGINA: Equipe
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  M.Pages.equipe = function(){
    const podeVerDesempenho = M.Store.pode("verDesempenho");
    const html = `
      <div class="grid-3">
        ${M.COLABORADORES.map(c=>{
          const perf = C.desempenhoColaborador(c.nome);
          const emAndamento = M.Store.state.tarefas.filter(t=>t.executadoPor===c.nome && t.status==="EM_ANDAMENTO");
          return `<div class="card pad">
            <div class="flex-gap"><span class="avatar lg">${UI.initials(c.nome)}</span>
              <div><b>${UI.esc(c.nome)}</b><div class="small muted">${UI.esc(c.cargo)}</div></div>
            </div>
            <div class="flex-gap" style="margin-top:8px;flex-wrap:wrap;">
              ${UI.perfilChip(c.perfil)}
              <span class="small muted">${UI.icon('phone',11)} ${UI.esc(c.telefone)}</span>
            </div>
            <div class="hr"></div>
            ${podeVerDesempenho ? `<div class="small"><b>${perf.tarefasConcluidas}</b> tarefas concluídas · <b>${C.fmtBRLk(perf.valorProcessado)}</b> processados</div>` : ""}
            ${emAndamento.length? `<div class="small muted" style="margin-top:6px;">Agora: ${UI.esc(emAndamento[0].titulo)}</div>`: `<div class="small muted" style="margin-top:6px;">Sem tarefa em andamento</div>`}
          </div>`;
        }).join("")}
      </div>
    `;
    return {title:"Equipe", crumb:"Colaboradores, cargo e perfil de acesso", html};
  };
})();
