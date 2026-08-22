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
  //
  // REFINO VISUAL V2 (§5 — absorve o padrão visual do mockup "Produção" pra
  // OBRAS, sem reintroduzir "Produção" como módulo/menu): topo resumido em
  // KPIs + lista por exceção (obras em risco) + tabela macro. Colunas
  // continuam só com informação que já é do Moodo — faseMacro (a etapa
  // GERENCIAL da obra), Produção % (progressoObra — mesmo cálculo de
  // sempre), Montagem física/fechamento % quando a obra já tem algo em
  // montagem, risco, entrega, pendências, status. Nenhuma etapa granular
  // de fábrica (corte/usinagem/máquina/lote) — isso é execução do
  // DinaBox, não da visão macro de obra do Moodo (ver comentário no
  // handoff, §5 do pedido desta rodada).
  function faseMacroChip(o){
    const f = M.Store.faseMacroDeObra(o);
    return `<span class="chip ${f.legado?'neutral':'brand'}">${UI.esc(f.label)}</span>`;
  }
  function linhaObraHtml(o){
    const prog = C.progressoObra(o);
    const risco = C.situacaoObra(o);
    const montagemIniciada = o.ambientes.some(a=> C.situacaoAmbiente(a).key!=="NAO_INICIADO");
    return `<tr onclick="Act.go('#/obra/${o.id}')" style="cursor:pointer;">
        <td><b>${UI.esc(o.cliente)}</b><div class="small muted">${o.numeroOS}</div></td>
        <td>${faseMacroChip(o)}</td>
        <td style="min-width:120px;">${UI.progressBar(prog.pct)}<div class="small muted">Produção ${prog.pct}%</div></td>
        <td class="small muted">${montagemIniciada? `${C.progressoFisicoMontagem(o)}% físico · ${C.taxaFechamento(o)}% fech.` : "—"}</td>
        <td>${C.fmtDate(o.dataEntregaPrevista)} ${risco.diasEntrega<0?`<span class="chip critical">${-risco.diasEntrega}d atraso</span>`:""}</td>
        <td>${risco.pendencias? `<span class="chip critical">${risco.pendencias}</span>` : `<span class="chip good">0</span>`}</td>
        <td>${UI.riscoChip(risco)}</td>
      </tr>`;
  }
  // REFINO VISUAL V2 (ajustes finais, §2): versão em cartão da mesma linha,
  // só pro mobile (≤880px, via .mobile-only) — MESMOS dados de linhaObraHtml,
  // sem tentar caber todas as colunas da tabela desktop. Só: obra, faseMacro,
  // entrega, risco, Produção%, Montagem/Fechamento% (quando pertinente),
  // pendências. Apresentação apenas — nenhum dado/regra novo.
  function linhaObraCardMobileHtml(o){
    const prog = C.progressoObra(o);
    const risco = C.situacaoObra(o);
    const montagemIniciada = o.ambientes.some(a=> C.situacaoAmbiente(a).key!=="NAO_INICIADO");
    return `<div class="mcard" onclick="Act.go('#/obra/${o.id}')" style="cursor:pointer;">
      <div class="mcard-top">
        <div><div class="mcard-title">${UI.esc(o.cliente)}</div><div class="small muted">${o.numeroOS}</div></div>
        ${UI.riscoChip(risco)}
      </div>
      <div class="mcard-rows">
        <div class="mcard-row"><span class="mcard-k">Fase</span><span class="mcard-v">${faseMacroChip(o)}</span></div>
        <div class="mcard-row"><span class="mcard-k">Produção</span><span class="mcard-v">${prog.pct}%</span></div>
        ${montagemIniciada? `<div class="mcard-row"><span class="mcard-k">Montagem / Fech.</span><span class="mcard-v">${C.progressoFisicoMontagem(o)}% / ${C.taxaFechamento(o)}%</span></div>` : ""}
        <div class="mcard-row"><span class="mcard-k">Entrega</span><span class="mcard-v">${C.fmtDate(o.dataEntregaPrevista)}${risco.diasEntrega<0?` · ${-risco.diasEntrega}d atraso`:""}</span></div>
        <div class="mcard-row"><span class="mcard-k">Pendências</span><span class="mcard-v">${risco.pendencias||0}</span></div>
      </div>
    </div>`;
  }
  M.Pages.obras = function(forcarMinhas){
    const restrito = forcarMinhas || !M.Store.pode("verTodasObras");
    const meuObraIds = restrito ? M.Store.obraIdsDoColaborador(M.Store.state.usuarioAtual) : null;
    const obras = restrito ? M.Store.state.obras.filter(o=>meuObraIds.has(o.id)) : M.Store.state.obras;

    // "listas por exceção" (§5) — mesma definição de risco/parada já usada
    // em Hoje (C.situacaoObra/C.obraParada), reaproveitada aqui, não uma
    // nova regra. N/A não é risco (mesma regra da Fase 3).
    const emRisco = obras.map(o=>({o, sit:C.situacaoObra(o), parada:C.obraParada(o)}))
      .filter(r=> r.sit.nivel==="ALTO" || r.sit.nivel==="MEDIO")
      .sort((a,b)=> ({ALTO:0,MEDIO:1}[a.sit.nivel]) - ({ALTO:0,MEDIO:1}[b.sit.nivel]) || a.sit.diasEntrega-b.sit.diasEntrega);
    const atrasadas = emRisco.filter(r=> r.sit.diasEntrega<0).length;

    const excecaoRowHtml = ({o,sit,parada})=> `<div class="compact-row" onclick="Act.go('#/obra/${o.id}')">
      <div class="cr-main">
        <div class="cr-top"><span class="cr-title">${UI.esc(o.cliente)}</span>${UI.riscoChip(sit)}</div>
        <div class="cr-sub">${o.numeroOS} · ${faseMacroChip(o)} ${parada? ` · <span style="color:var(--critical);font-weight:700;">parada há ${C.diasParada(o)}d</span>`:""}</div>
      </div>
      <div class="cr-action">${sit.diasEntrega<0? `<span class="chip critical">${-sit.diasEntrega}d atraso</span>` : `<span class="small muted">entrega em ${sit.diasEntrega}d</span>`}</div>
    </div>`;
    const {itensHtml:riscoItensHtml, toggleHtml:riscoToggleHtml} = UI.secaoComVerTodos({
      key:"obras:RISCO", itens: emRisco.map(excecaoRowHtml), limite:5,
    });

    const rows = obras.map(linhaObraHtml).join("");

    const html = `
      ${restrito? `<div class="help-banner">${UI.icon('user',13)} Mostrando só as obras onde você tem tarefa, pendência ou assistência atribuída.</div>`:""}

      ${UI.kpiRow([
        UI.kpiTile({icon:'building', label:'Obras', value:obras.length}),
        UI.kpiTile({icon:'alert', label:'Em risco', value:emRisco.length, tone: emRisco.length?'warning':''}),
        UI.kpiTile({icon:'clock', label:'Atrasadas', value:atrasadas, tone: atrasadas?'critical':''}),
        UI.kpiTile({icon:'lock', label:'Bloqueando fechamento', value:obras.reduce((s,o)=>s+C.situacaoObra(o).pendencias,0)}),
      ])}

      ${UI.secHead({titulo:'Obras em risco', icon:'alert', count:emRisco.length, tone:emRisco.length?'warning':'neutral'})}
      ${emRisco.length ? `${riscoItensHtml}${riscoToggleHtml}` : `<p class="small muted">Nenhuma obra em risco agora.</p>`}

      ${UI.secHead({titulo:'Todas as obras', icon:'building'})}
      <div class="desktop-only card pad">
        <div style="overflow-x:auto;">
        <table class="tbl">
          <thead><tr><th>Obra</th><th>Fase</th><th>Produção</th><th>Montagem</th><th>Entrega</th><th>Pendências</th><th>Risco</th></tr></thead>
          <tbody>${rows.length?rows:`<tr><td colspan="7" class="small muted" style="text-align:center;padding:20px;">Nenhuma obra atribuída a você no momento.</td></tr>`}</tbody>
        </table>
        </div>
      </div>
      <div class="mobile-only">
        ${obras.length? obras.map(linhaObraCardMobileHtml).join("") : `<p class="small muted">Nenhuma obra atribuída a você no momento.</p>`}
      </div>
    `;
    return {title: forcarMinhas ? "Minhas Obras" : "Obras", crumb: forcarMinhas ? "Obras onde você tem algo atribuído" : "Todas as obras em produção", html,
      actionsHtml: UI.botaoNovaObraHtml()};
  };
})();
