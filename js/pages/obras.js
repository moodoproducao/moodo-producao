/* ============================================================
   PÁGINA: Obras (lista de gestão)
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  // CORREÇÃO (itens 9 e 10): sem verTodasObras, só mostra as obras onde a
  // pessoa tem algo atribuído (mesma regra do Kanban); sem verValores, o
  // valor líquido fica mascarado igual no resto do app.
  //
  // FASE 2 (Navegação V2): "Minhas Obras" (rota nova "#/minhas-obras", menu
  // do Montador) é o MESMO M.Pages.obras() de sempre, sem tabela nova nem
  // lógica nova — só força a visão restrita (mesmo sem verTodasObras=false)
  // e troca o título. "Obras" (rota "#/obras", menu de Admin/PCP/Líder/
  // Gestor) continua exatamente como era.
  M.Pages.obras = function(forcarMinhas){
    const restrito = forcarMinhas || !M.Store.pode("verTodasObras");
    const meuObraIds = restrito ? M.Store.obraIdsDoColaborador(M.Store.state.usuarioAtual) : null;
    const obras = restrito ? M.Store.state.obras.filter(o=>meuObraIds.has(o.id)) : M.Store.state.obras;
    const rows = obras.map(o=>{
      const prog = C.progressoObra(o);
      const risco = C.situacaoObra(o);
      return `<tr onclick="Act.go('#/obra/${o.id}')" style="cursor:pointer;">
        <td><b>${UI.esc(o.cliente)}</b><div class="small muted">${o.numeroOS}</div></td>
        <td>${o.ambientes.length} amb. · ${o.ambientes.reduce((s,a)=>s+a.moveis.length,0)} móveis</td>
        <td style="min-width:140px;">${UI.progressBar(prog.pct)}<div class="small muted">${prog.pct}% (${prog.concluidos}/${prog.total})</div></td>
        <td>${UI.valorOuOculto(C.fmtBRL(o.valorLiquido))}</td>
        <td>${C.fmtDate(o.dataEntregaPrevista)} ${risco.diasEntrega<0?`<span class="chip critical">${-risco.diasEntrega}d atraso</span>`:""}</td>
        <td>${risco.pendencias? `<span class="chip critical">${risco.pendencias}</span>` : `<span class="chip good">0</span>`}</td>
        <td>${UI.riscoChip(risco)}</td>
      </tr>`;
    }).join("");

    const html = `
      ${restrito? `<div class="help-banner">${UI.icon('user',13)} Mostrando só as obras onde você tem tarefa, pendência ou assistência atribuída.</div>`:""}
      <div class="card pad">
        <table class="tbl">
          <thead><tr><th>Obra</th><th>Escopo</th><th>Progresso</th><th>Valor líquido</th><th>Entrega</th><th>Pendências</th><th>Risco</th></tr></thead>
          <tbody>${rows.length?rows:`<tr><td colspan="7" class="small muted" style="text-align:center;padding:20px;">Nenhuma obra atribuída a você no momento.</td></tr>`}</tbody>
        </table>
      </div>
    `;
    return {title: forcarMinhas ? "Minhas Obras" : "Obras", crumb: forcarMinhas ? "Obras onde você tem algo atribuído" : "Todas as obras em produção", html,
      actionsHtml: UI.botaoNovaObraHtml()};
  };
})();
