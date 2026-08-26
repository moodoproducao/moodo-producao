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
        <td><b>${UI.esc(o.nome||o.cliente)}</b><div class="small muted">${o.numeroOS||"sem OS"}</div></td>
        <td>${faseMacroChip(o)}</td>
        <td style="min-width:120px;">${UI.progressBar(prog.pct)}<div class="small muted">Produção ${prog.pct}%</div></td>
        <td class="small muted">${montagemIniciada? `${C.progressoFisicoMontagem(o)}% físico · ${C.taxaFechamento(o)}% fech.` : "—"}</td>
        <td>${C.fmtDate(o.dataEntregaPrevista)} ${risco.diasEntrega<0?`<span class="chip critical">${-risco.diasEntrega}d atraso</span>`:""}</td>
        <td>${risco.pendencias? `<span class="chip critical">${risco.pendencias}</span>` : `<span class="chip good">0</span>`}</td>
        <td>${UI.riscoChip(risco)}</td>
      </tr>`;
  }
  // FASE 7.5 (Nova Obra V2, item 7) — linha simplificada pro filtro
  // "Rascunhos": nada de progresso/risco/montagem (rascunho nunca entrou no
  // pipeline), só o que já foi preenchido até agora + quem criou/quando +
  // "Continuar" (volta pro wizard nesse rascunho).
  function linhaRascunhoHtml(o){
    const totalMoveis = (o.ambientes||[]).reduce((s,a)=>s+(a.moveis||[]).length,0);
    return `<tr onclick="Act.go('#/nova-obra/${o.id}')" style="cursor:pointer;">
        <td><b>${UI.esc(o.nome||o.cliente||"(sem nome ainda)")}</b><div class="small muted">${UI.esc(o.cliente||"cliente não preenchido")}</div></td>
        <td class="small muted">${(o.ambientes||[]).length} ambiente(s) · ${totalMoveis} móvel(is)</td>
        <td class="small muted">${UI.person(o.criadoPor)}</td>
        <td class="small muted">${C.fmtDate(o.criadoEm)}</td>
        <td><button class="btn sm" onclick="event.stopPropagation();Act.go('#/nova-obra/${o.id}')">${UI.icon('edit',12)} Continuar</button></td>
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
        <div><div class="mcard-title">${UI.esc(o.nome||o.cliente)}</div><div class="small muted">${o.numeroOS||"sem OS"}</div></div>
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

    // FASE 7.5 (item 7 do pedido) — "Rascunhos" só existe como filtro/status
    // dedicado aqui em Obras, atrás de "Somente usuários autorizados": mesma
    // permissão que já controla quem pode criar obra (obra.criar). Sem essa
    // permissão o toggle nem aparece — a lista continua 100% igual a antes.
    const podeVerRascunhos = !forcarMinhas && M.Store.pode("obra.criar");
    const filtroStatus = podeVerRascunhos ? (M.UIState.obrasFiltroStatus||"ATIVAS") : "ATIVAS";
    const verRascunhos = filtroStatus==="RASCUNHO";

    const obrasBase = verRascunhos ? M.Store.obrasRascunho() : M.Store.obrasOperacionais();
    const obras = restrito ? obrasBase.filter(o=>meuObraIds.has(o.id)) : obrasBase;

    const toggleStatusHtml = podeVerRascunhos ? `
      <div class="segmented" style="margin-bottom:14px;">
        <button class="${!verRascunhos?'active':''}" onclick="Act.setObrasFiltroStatus('ATIVAS')">Ativas</button>
        <button class="${verRascunhos?'active':''}" onclick="Act.setObrasFiltroStatus('RASCUNHO')">Rascunhos${M.Store.obrasRascunho().length?` (${M.Store.obrasRascunho().length})`:""}</button>
      </div>` : "";

    if(verRascunhos){
      const rowsRascunho = obras.map(linhaRascunhoHtml).join("");
      const htmlRascunho = `
        ${toggleStatusHtml}
        <div class="help-banner">${UI.icon('alert',13)} Rascunho não aparece em Hoje, risco, Montagem, Agenda nem gera pendência automática — só existe aqui até ser ativado ou descartado.</div>
        <div class="card pad">
          <div style="overflow-x:auto;">
          <table class="tbl">
            <thead><tr><th>Obra</th><th>Estrutura</th><th>Criado por</th><th>Criado em</th><th></th></tr></thead>
            <tbody>${rowsRascunho.length?rowsRascunho:`<tr><td colspan="5" class="small muted" style="text-align:center;padding:20px;">Nenhum rascunho no momento.</td></tr>`}</tbody>
          </table>
          </div>
        </div>
      `;
      return {title:"Obras", crumb:"Rascunhos — obras ainda não ativadas", html:htmlRascunho, actionsHtml: UI.botaoNovaObraHtml()};
    }

    // "listas por exceção" (§5) — mesma definição de risco/parada já usada
    // em Hoje (C.situacaoObra/C.obraParada), reaproveitada aqui, não uma
    // nova regra. N/A não é risco (mesma regra da Fase 3).
    const emRisco = obras.map(o=>({o, sit:C.situacaoObra(o), parada:C.obraParada(o)}))
      .filter(r=> r.sit.nivel==="ALTO" || r.sit.nivel==="MEDIO")
      .sort((a,b)=> ({ALTO:0,MEDIO:1}[a.sit.nivel]) - ({ALTO:0,MEDIO:1}[b.sit.nivel]) || a.sit.diasEntrega-b.sit.diasEntrega);
    const atrasadas = emRisco.filter(r=> r.sit.diasEntrega<0).length;

    const excecaoRowHtml = ({o,sit,parada})=> `<div class="compact-row" onclick="Act.go('#/obra/${o.id}')">
      <div class="cr-main">
        <div class="cr-top"><span class="cr-title">${UI.esc(o.nome||o.cliente)}</span>${UI.riscoChip(sit)}</div>
        <div class="cr-sub">${o.numeroOS||"sem OS"} · ${faseMacroChip(o)} ${parada? ` · <span style="color:var(--critical);font-weight:700;">parada há ${C.diasParada(o)}d</span>`:""}</div>
      </div>
      <div class="cr-action">${sit.diasEntrega<0? `<span class="chip critical">${-sit.diasEntrega}d atraso</span>` : `<span class="small muted">entrega em ${sit.diasEntrega}d</span>`}</div>
    </div>`;
    const {itensHtml:riscoItensHtml, toggleHtml:riscoToggleHtml} = UI.secaoComVerTodos({
      key:"obras:RISCO", itens: emRisco.map(excecaoRowHtml), limite:5,
    });

    const rows = obras.map(linhaObraHtml).join("");

    const html = `
      ${toggleStatusHtml}
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
