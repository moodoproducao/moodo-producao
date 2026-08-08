/* ============================================================
   PÁGINA: Obras (lista de gestão)
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  M.Pages.obras = function(){
    const rows = M.Store.state.obras.map(o=>{
      const prog = C.progressoObra(o);
      const risco = C.riscoObra(o);
      return `<tr onclick="Act.go('#/obra/${o.id}')" style="cursor:pointer;">
        <td><b>${UI.esc(o.cliente)}</b><div class="small muted">${o.numeroOS}</div></td>
        <td>${o.ambientes.length} amb. · ${o.ambientes.reduce((s,a)=>s+a.moveis.length,0)} móveis</td>
        <td style="min-width:140px;">${UI.progressBar(prog.pct)}<div class="small muted">${prog.pct}% (${prog.concluidos}/${prog.total})</div></td>
        <td>${C.fmtBRL(o.valorLiquido)}</td>
        <td>${C.fmtDate(o.dataEntregaPrevista)} ${risco.diasEntrega<0?`<span class="chip critical">${-risco.diasEntrega}d atraso</span>`:""}</td>
        <td>${risco.pendencias? `<span class="chip critical">${risco.pendencias}</span>` : `<span class="chip good">0</span>`}</td>
        <td>${UI.riscoChip(risco.nivel)}</td>
      </tr>`;
    }).join("");

    const html = `
      <div class="card pad">
        <table class="tbl">
          <thead><tr><th>Obra</th><th>Escopo</th><th>Progresso</th><th>Valor líquido</th><th>Entrega</th><th>Pendências</th><th>Risco</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
    return {title:"Obras", crumb:"Todas as obras em produção", html,
      actionsHtml:`<a href="#/nova-obra" class="btn primary">+ Nova Obra</a>`};
  };
})();
