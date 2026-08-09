/* ============================================================
   PÁGINA: Produção (Kanban)
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  function movelCardHtml(o,a,m){
    const bloq = m.bloqueio;
    const dias = C.diasDesde(m.dataEntradaEtapa);
    const check = M.Store.checarRequisitos(m);
    // item 9 do backlog: checklist de componentes virou Tarefa — a barrinha de
    // progresso do cartão agora conta as tarefas reais do móvel, não mais um
    // checklist separado.
    const tarefasDoMovel = M.Store.state.tarefas.filter(t=>t.movelId===m.id);
    const done = tarefasDoMovel.filter(t=>t.status==="CONCLUIDA").length;
    const ressalva = !!m.ressalvaAberta;
    return `<div class="kcard" draggable="true"
        ondragstart="Act.dragStart(event,'${m.id}')" ondragend="Act.dragEnd(event)"
        onclick="Act.openMovel('${m.id}')">
      <div class="kproj"><span>${UI.esc(o.cliente)}</span><span>${UI.esc(a.nome)}</span></div>
      <div class="ktitle">${UI.esc(m.nome)}</div>
      <div class="krow">${UI.person(m.responsavel)}${UI.stageDaysChip(dias)}</div>
      ${tarefasDoMovel.length? `<div style="margin-top:7px;">${UI.progressBar(done/tarefasDoMovel.length*100)}</div>
      <div class="small muted" style="margin-top:3px;">${done}/${tarefasDoMovel.length} tarefas concluídas</div>`:""}
      ${ressalva? `<div class="kblocked" style="color:var(--warning);background:var(--warning-bg);">${UI.icon('alert',11)} avançou com ressalva</div>`:""}
      ${!check.liberado && !ressalva? `<div class="kblocked">${UI.icon('lock',11)} requisito pendente p/ avançar</div>`:""}
      ${bloq? `<div class="kblocked">${UI.icon('clock',11)} ${UI.esc(bloq.categoria)}</div>`:""}
      ${m.componentesCriticos.some(c=>c.status==="REFACAO")? `<div class="kblocked">${UI.icon('wrench',11)} retrabalho em aberto</div>`:""}
    </div>`;
  }

  function grupoCardHtml(o, ambiente, moveis, kind, id){
    const prog = C.progressoGrupo(moveis);
    const crit = C.itemCriticoGrupo(moveis);
    const pend = C.pendenciasAbertasDe(o.id).filter(p=> ambiente? p.ambienteId===ambiente.id : true).length;
    const onclick = kind==="ambiente" ? `Act.openAmbiente('${id}')` : `Act.go('#/obra/${id}')`;
    return `<div class="kcard" onclick="${onclick}">
      <div class="kproj"><span>${UI.esc(o.cliente)}</span><span>${o.numeroOS}</span></div>
      <div class="ktitle">${ambiente? UI.esc(ambiente.nome) : "Obra inteira"}</div>
      <div class="krow"><b style="font-size:15px;">${prog.pct}%</b><span class="small muted">${prog.concluidos} de ${prog.total} concluídos</span></div>
      ${UI.progressBar(prog.pct)}
      ${crit? `<div class="small" style="margin-top:7px;"><b>Item crítico:</b> ${UI.esc(crit.nome)} — ${UI.esc(M.Store.etapaById(crit.etapa).nome)}</div>`:""}
      <div class="krow">
        ${pend? `<span class="chip critical">${pend} pendência(s)</span>`:`<span class="chip good">sem pendências</span>`}
        <span class="small muted">entrega ${C.fmtDate(o.dataEntregaPrevista)}</span>
      </div>
    </div>`;
  }

  M.Pages.producao = function(){
    const view = M.UIState.kanbanView || "ambientes";
    // colunas do Kanban = etapas ATIVAS, na ordem configurada (Configurações → Processos → Etapas)
    const etapasCols = M.Store.etapasAtivas();
    const idxById = {}; etapasCols.forEach((e,i)=> idxById[e.id]=i);
    // um móvel numa etapa desativada (caso raro: a etapa foi desativada depois de já ter itens
    // nela) ainda precisa aparecer em algum lugar — cai na coluna ativa mais próxima à frente.
    function colFor(etapaId){
      if(idxById[etapaId]!==undefined) return idxById[etapaId];
      const pos = M.Store.posicaoEtapa(etapaId);
      const prox = etapasCols.find(e=> M.Store.posicaoEtapa(e.id) >= pos);
      return prox ? idxById[prox.id] : etapasCols.length-1;
    }
    const cols = etapasCols.map(()=>[]);

    // item 9: sem verTodasObras, só entram no board os itens das obras onde a
    // pessoa tem tarefa/pendência/assistência atribuída — derivado na hora,
    // não existe (nem deveria existir) um campo fixo "obra do fulano".
    const restrito = !M.Store.pode("verTodasObras");
    const meuObraIds = restrito ? M.Store.obraIdsDoColaborador(M.Store.state.usuarioAtual) : null;
    const obrasVisiveis = restrito ? M.Store.state.obras.filter(o=>meuObraIds.has(o.id)) : M.Store.state.obras;

    if(view==="moveis"){
      M.Store.allMoveis().forEach(({o,a,m})=>{
        if(restrito && !meuObraIds.has(o.id)) return;
        cols[colFor(m.etapa)].push(movelCardHtml(o,a,m));
      });
    }else if(view==="ambientes"){
      obrasVisiveis.forEach(o=> o.ambientes.forEach(a=>{
        const crit = C.itemCriticoGrupo(a.moveis);
        const etapaId = crit ? crit.etapa : "FINALIZADA";
        cols[colFor(etapaId)].push(grupoCardHtml(o,a,a.moveis,"ambiente",a.id));
      }));
    }else{
      obrasVisiveis.forEach(o=>{
        const allM = o.ambientes.flatMap(a=>a.moveis);
        const crit = C.itemCriticoGrupo(allM);
        const etapaId = crit ? crit.etapa : "FINALIZADA";
        cols[colFor(etapaId)].push(grupoCardHtml(o,null,allM,"obra",o.id));
      });
    }

    // grupos visuais do pipeline (Pré-produção / Fábrica / Logística-Obra) —
    // largura de cada rótulo de grupo é proporcional a quantas colunas ativas ele tem agora.
    const groupHeader = M.STAGE_GROUPS.map(g=>{
      const totalCols = etapasCols.filter(e=>e.grupo===g.key).length;
      return totalCols ? `<div class="stage-group-label" style="width:${totalCols*254 - 12}px;">${UI.esc(g.label)}</div>` : "";
    }).filter(Boolean).join(`<div style="width:12px;"></div>`);

    const board = etapasCols.map((e,i)=>`
      <div class="column" ondragover="Act.allowDrop(event)" ondragenter="Act.columnDragEnter(event)" ondragleave="Act.columnDragLeave(event)" ondrop="Act.columnDragLeave(event);Act.dropOnColumn(event,'${e.id}')">
        <div class="column-head"><span class="name">${UI.esc(e.nomeCurto||e.nome)}</span><span class="count">${cols[i].length}</span></div>
        <div class="column-cards">${cols[i].join("")}</div>
      </div>
    `).join("");

    const html = `
      ${restrito? `<div class="help-banner">${UI.icon('user',13)} Mostrando só as obras onde você tem tarefa, pendência ou assistência atribuída.</div>`:""}
      <div class="board-toolbar flex-between" style="margin-bottom:10px;">
        <div class="segmented">
          <button class="${view==='ambientes'?'active':''}" onclick="Act.setKanbanView('ambientes')">Ambientes</button>
          <button class="${view==='obras'?'active':''}" onclick="Act.setKanbanView('obras')">Obras</button>
          <button class="${view==='moveis'?'active':''}" onclick="Act.setKanbanView('moveis')">Móveis</button>
        </div>
        <div class="small muted">${view==='moveis' ? "Arraste os cartões entre etapas, ou clique para abrir o detalhe." : "Clique num cartão para ver o detalhe e avançar por móvel. Mude para \"Móveis\" para arrastar entre etapas."}</div>
      </div>
      <div class="board-wrap">
        <div class="stage-groups">${groupHeader}</div>
        <div class="board">${board}</div>
      </div>
    `;
    return {title:"Produção", crumb:"Kanban — obra / ambiente / móvel", html,
      actionsHtml:`<a href="#/nova-obra" class="btn primary">${UI.icon('plus',14)} Nova Obra</a>`};
  };

  // ---------- modal de móvel (compartilhado) ----------
  M.Pages.movelModalHtml = function(f){
    const {o,a,m} = f;
    const check = M.Store.checarRequisitos(m);
    // item 9 do backlog de melhorias: aqui era um checklist de checkbox isolado
    // (sem Iniciar/Concluir, sem aparecer em Tarefas). Agora mostra as tarefas
    // de verdade do móvel — mesmo botão Iniciar/Concluir de qualquer tarefa,
    // em qualquer tela do app.
    const tarefasDoMovel = M.Store.state.tarefas.filter(t=>t.movelId===m.id)
      .sort((x,y)=> (x.status==="EM_ANDAMENTO"?0:x.status==="PLANEJADA"?1:2) - (y.status==="EM_ANDAMENTO"?0:y.status==="PLANEJADA"?1:2));
    const tarefasHtml = tarefasDoMovel.length ? tarefasDoMovel.map(t=>`
      <div class="check-row ${t.status==='CONCLUIDA'?'done':''}" style="cursor:pointer;" onclick="Act.abrirDetalheTarefa('${t.id}')">
        <span class="dot ${t.status==='CONCLUIDA'?'good':t.status==='EM_ANDAMENTO'?'warning':'neutral'}"></span>
        <span class="label" style="flex:1;">${UI.esc(t.titulo)} ${UI.tarefaStatusChip(t.status)}</span>
        <span onclick="event.stopPropagation()">${UI.tarefaAcoesHtml(t, m.id)}</span>
      </div>`).join("") : `<p class="small muted">Nenhuma tarefa cadastrada para este móvel ainda.</p>`;

    const compHtml = m.componentesCriticos.map(c=>`
      <div class="check-row">
        <span class="dot ${c.status==='REFACAO'?'critical':c.status==='AGUARDANDO'?'warning':'good'}"></span>
        <span class="label"><b>${UI.esc(c.nome)}</b> — ${UI.esc(c.tipo)}
          ${c.status==='REFACAO'? ` · <span class="chip critical">retrabalho</span> motivo: ${UI.esc(c.motivo||'-')}`:''}
          ${c.status==='AGUARDANDO'? ` · <span class="chip warning">aguardando</span> ${UI.esc(c.fornecedor||'')}`:''}
        </span>
      </div>`).join("");

    const reqHtml = check.itens.length ? `
      <div class="field-row" style="flex-wrap:wrap;">
        ${check.itens.map(r=>`
          <label class="chip ${r.atendido?'good':(r.obrigatorio?'critical':'neutral')}" style="cursor:pointer;margin:0 6px 6px 0;" onclick="Act.toggleRequisito('${m.id}','${UI.esc(r.nome)}')">
            ${r.atendido?'✓':'✕'} ${UI.esc(r.nome)}${r.obrigatorio?'':' (recomendado)'}
          </label>`).join("")}
      </div>
      <div class="small muted" style="margin-top:6px;">Status da etapa atual: ${check.liberado? '<b style="color:var(--good)">liberado</b>':'<b style="color:var(--critical)">não liberado</b> — falta requisito obrigatório'}</div>
    ` : `<p class="small muted">Sem requisitos configurados para "${UI.esc(M.Store.etapaById(m.etapa).nome)}".</p>`;

    const respOptions = M.COLABORADORES.map(c=>`<option ${c.nome===m.responsavel?'selected':''}>${c.nome}</option>`).join("");

    return `
      <div class="modal-head">
        <div><h2>${UI.esc(m.nome)}</h2><div class="meta">${UI.esc(o.cliente)} · ${UI.esc(a.nome)} · ${o.numeroOS} · entrega ${C.fmtDate(o.dataEntregaPrevista)}</div></div>
        <button class="modal-close" data-close>✕</button>
      </div>
      <div class="modal-body">
        <div class="field-row">
          <div class="field"><label>Responsável</label><select onchange="Act.setResponsavel('${m.id}',this)">${respOptions}</select></div>
          <div class="field"><label>Valor líquido do móvel</label><input value="${M.Store.pode('verValores')?C.fmtBRL(m.valorLiquido):'•••••'}" disabled></div>
        </div>

        ${m.bloqueio? `<div class="help-banner" style="background:var(--critical-bg);border-color:var(--critical);color:var(--critical);">
          ${UI.icon('lock',13)} <b>Bloqueada:</b> ${UI.esc(m.bloqueio.categoria)} — ${UI.esc(m.bloqueio.descricao)}. Responsável: ${UI.esc(m.bloqueio.responsavel)}.
          <a href="#/pendencias" data-close style="text-decoration:underline;">ver em Pendências →</a>
        </div>` : ""}

        ${m.ressalvaAberta && m.ressalva? `<div class="help-banner" style="background:var(--warning-bg);border-color:var(--warning);color:var(--warning);">
          ${UI.icon('alert',13)} <b>Avançou com ressalva</b> para "${UI.esc(m.ressalva.etapaLabel)}" em ${C.fmtDate(m.ressalva.data)} (${UI.esc(m.ressalva.usuario||'-')}). Motivo: ${UI.esc(m.ressalva.motivo||'-')}.
          ${m.ressalva.itensPendentes&&m.ressalva.itensPendentes.length? `<div class="small" style="margin-top:4px;">Itens pendentes: ${m.ressalva.itensPendentes.map(UI.esc).join(", ")}</div>`:""}
          ${m.ressalva.novoResponsavel? `<div class="small" style="margin-top:2px;">Novo responsável: ${UI.esc(m.ressalva.novoResponsavel)}${m.ressalva.novoPrazo? " · novo prazo "+C.fmtDate(m.ressalva.novoPrazo):""}</div>`:""}
          <div style="margin-top:6px;"><button class="btn sm" onclick="Act.resolverRessalva('${m.id}')">${UI.icon('check',12)} Marcar itens pendentes como resolvidos</button></div>
        </div>` : ""}

        <div class="flex-between" style="margin-bottom:4px;">
          <label style="font-size:11.5px;font-weight:700;color:var(--ink-soft);">Tarefas do móvel</label>
          <button class="btn sm" onclick="Act.openTarefaForm('${o.id}')">${UI.icon('plus',12)} tarefa</button>
        </div>
        <div style="margin:6px 0 14px;">${tarefasHtml}</div>

        ${compHtml? `<label style="font-size:11.5px;font-weight:700;color:var(--ink-soft);">Componentes críticos / exceções</label><div style="margin:6px 0 14px;">${compHtml}</div>`:""}

        <label style="font-size:11.5px;font-weight:700;color:var(--ink-soft);">Requisitos da etapa "${UI.esc(M.Store.etapaById(m.etapa).nome)}"</label>
        <p class="small muted" style="margin:2px 0 6px;">São condições pra liberar a etapa (material disponível, aprovação etc.) — clique no chip pra marcar como atendido/pendente. Não é uma tarefa.</p>
        <div style="margin:6px 0 4px;">${reqHtml}</div>
      </div>
      <div class="modal-foot" style="justify-content:space-between;">
        <button class="btn" ${M.Store.etapaAnteriorId(m.etapa)?'':'disabled'} onclick="Act.moveStageBtn('${m.id}',-1)">◀ Etapa anterior</button>
        <span class="chip brand">${UI.esc(M.Store.etapaById(m.etapa).nome)}</span>
        <button class="btn primary" ${M.Store.proximaEtapaId(m.etapa)?'':'disabled'} onclick="Act.moveStageBtn('${m.id}',1)">Avançar etapa ▶</button>
      </div>
    `;
  };

  M.Pages.ambienteModalHtml = function(f){
    const {o,a} = f;
    const prog = C.progressoAmbiente(a);
    const rows = a.moveis.map(m=>`
      <div class="check-row" style="cursor:pointer;" onclick="UI.closeModal();Act.openMovel('${m.id}')">
        <span class="dot ${m.bloqueio?'critical':C.movelConcluido(m)?'good':'neutral'}"></span>
        <span class="label"><b>${UI.esc(m.nome)}</b> <span class="chip neutral" style="margin-left:4px;">${UI.esc(M.Store.etapaById(m.etapa).nome)}</span>
          <div class="small muted">resp. ${UI.esc(m.responsavel)}${m.bloqueio? " · ⏳ "+UI.esc(m.bloqueio.categoria):""}</div></span>
      </div>`).join("");
    return `
      <div class="modal-head">
        <div><h2>${UI.esc(a.nome)}</h2><div class="meta">${UI.esc(o.cliente)} · ${o.numeroOS} · valor líquido ${UI.valorOuOculto(C.fmtBRL(a.valorLiquido))}</div></div>
        <button class="modal-close" data-close>✕</button>
      </div>
      <div class="modal-body">
        <div class="flex-between" style="margin-bottom:10px;"><b>${prog.pct}% concluído</b><span class="small muted">${prog.concluidos}/${prog.total} móveis</span></div>
        ${UI.progressBar(prog.pct)}
        <div style="margin-top:16px;">${rows}</div>
      </div>
      <div class="modal-foot"><a class="btn" href="#/obra/${o.id}" data-close>Abrir obra completa →</a></div>
    `;
  };
})();
