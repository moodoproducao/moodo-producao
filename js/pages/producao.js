/* ============================================================
   PÁGINA: Produção (Kanban)
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  function movelCardHtml(o,a,m){
    const bloqueios = M.Store.bloqueiosMovel(m.id);
    const dias = C.diasDesde(m.dataEntradaEtapa);
    const check = M.Store.checarRequisitos(m);
    // item 9 do backlog: checklist de componentes virou Tarefa — a barrinha de
    // progresso do cartão agora conta as tarefas reais do móvel, não mais um
    // checklist separado.
    const tarefasDoMovel = M.Store.state.tarefas.filter(t=>t.movelId===m.id);
    const done = tarefasDoMovel.filter(t=>t.status==="CONCLUIDA").length;
    const ressalva = !!m.ressalvaAberta;
    // "Kanban vira mapa": o card leva direto pra página da obra com o ambiente
    // desse móvel em foco, em vez de abrir modal (ver plano "obra no centro").
    return `<div class="kcard" draggable="true"
        ondragstart="Act.dragStart(event,'${m.id}')" ondragend="Act.dragEnd(event)"
        onclick="Act.irParaObra('${o.id}','${a.id}')">
      <div class="kproj"><span>${UI.esc(o.cliente)}</span><span>${UI.esc(a.nome)}</span></div>
      <div class="ktitle">${UI.esc(m.nome)}</div>
      <div class="krow">${UI.person(m.responsavel)}${UI.stageDaysChip(dias)}</div>
      ${tarefasDoMovel.length? `<div style="margin-top:7px;">${UI.progressBar(done/tarefasDoMovel.length*100)}</div>
      <div class="small muted" style="margin-top:3px;">${done}/${tarefasDoMovel.length} tarefas concluídas</div>`:""}
      ${ressalva? `<div class="kblocked" style="color:var(--warning);background:var(--warning-bg);">${UI.icon('alert',11)} avançou com ressalva</div>`:""}
      ${!check.liberado && !ressalva? `<div class="kblocked">${UI.icon('lock',11)} requisito pendente p/ avançar</div>`:""}
      ${bloqueios.length? `<div class="kblocked">${UI.icon('clock',11)} ${UI.esc(bloqueios[0].categoria)}${bloqueios.length>1?` +${bloqueios.length-1}`:''}</div>`:""}
      ${m.componentesCriticos.some(c=>c.status==="REFACAO")? `<div class="kblocked">${UI.icon('wrench',11)} retrabalho em aberto</div>`:""}
    </div>`;
  }

  function grupoCardHtml(o, ambiente, moveis, kind, id){
    const prog = C.progressoGrupo(moveis);
    const crit = C.itemCriticoGrupo(moveis);
    const pend = C.pendenciasAbertasDe(o.id).filter(p=> ambiente? p.ambienteId===ambiente.id : true).length;
    // "Kanban vira mapa": card de ambiente leva direto pra página da obra com
    // esse ambiente em foco; card de obra inteira já ia direto (mantido).
    const onclick = kind==="ambiente" ? `Act.irParaObra('${o.id}','${id}')` : `Act.go('#/obra/${id}')`;
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

  // ============================================================
  // "Produção" macro (handoff — Fase 3): "painel de obras, macro por
  // padrão" — obra é a unidade de linha; ambiente só aparece por expansão,
  // e só quando há exceção (bloqueio). KPIs no topo são filtros combináveis
  // (seguindo o texto do handoff: "cada indicador é um filtro · combináveis").
  // Coexiste com o Kanban existente via toggle — nada do Kanban foi removido.
  // ============================================================
  function kpiSetsProducao(obras){
    return {
      EM_PRODUCAO: obras.filter(o=> o.status!=="FINALIZADA"),
      EM_RISCO:    obras.filter(o=> C.situacaoObra(o).nivel!=="BAIXO"),
      PARADA:      obras.filter(o=> C.obraParada(o)),
      CRITICAS:    obras.filter(o=> C.pendenciasAbertasDe(o.id).some(p=> p.impacto==="BLOQUEIA_AMBIENTE"||p.impacto==="BLOQUEIA_OBRA")),
      ENTREGAS_7D: obras.filter(o=> o.status!=="FINALIZADA" && C.diasAte(o.dataEntregaPrevista)>=0 && C.diasAte(o.dataEntregaPrevista)<=7),
    };
  }
  function kpiChipsHtml(sets, obrasTodas){
    const criticasPend = obrasTodas.reduce((s,o)=> s + C.pendenciasAbertasDe(o.id).filter(p=>p.impacto==="BLOQUEIA_AMBIENTE"||p.impacto==="BLOQUEIA_OBRA").length, 0);
    const defs = [
      {key:"EM_PRODUCAO", label:"Em produção", count:sets.EM_PRODUCAO.length, tone:""},
      {key:"EM_RISCO",    label:"Em risco",     count:sets.EM_RISCO.length,    tone:"warning"},
      {key:"PARADA",      label:"Paradas",      count:sets.PARADA.length,      tone:"critical"},
      {key:"CRITICAS",    label:"Pendências críticas", count:criticasPend,     tone:"critical"},
      {key:"ENTREGAS_7D", label:"Entregas 7 dias", count:sets.ENTREGAS_7D.length, tone:""},
    ];
    const ativos = M.UIState.producaoFiltros;
    return `<div class="stat-row" style="margin-bottom:14px;">${defs.map(d=>`
      <button class="stat-tile" style="text-align:left;cursor:pointer;border:1px solid ${ativos.has(d.key)?'var(--brand)':'var(--border)'};background:${ativos.has(d.key)?'var(--brand-wash)':'var(--surface)'};" onclick="Act.toggleProducaoFiltro('${d.key}')">
        <div class="label">${UI.esc(d.label)}</div>
        <div class="value${d.tone==='critical' && d.count? ' critical':''}">${d.count}</div>
      </button>`).join("")}</div>`;
  }
  function ambientesExcecaoHtml(o){
    const ambs = o.ambientes.filter(a=> C.itemCriticoGrupo(a.moveis) && M.Store.bloqueiosMovel(C.itemCriticoGrupo(a.moveis).id).length);
    if(!ambs.length) return `<div class="small muted" style="padding:8px 0;">Nenhum ambiente com exceção aberta agora.</div>`;
    return ambs.map(a=>{
      const crit = C.itemCriticoGrupo(a.moveis);
      const bloqueios = M.Store.bloqueiosMovel(crit.id);
      const prog = C.progressoAmbiente(a);
      return `<div class="check-row" style="cursor:pointer;" onclick="Act.irParaObra('${o.id}','${a.id}')">
        <span class="dot critical"></span>
        <span class="label"><b>${UI.esc(a.nome)}</b> <span class="chip neutral" style="margin-left:4px;">${prog.pct}%</span>
          <div class="small muted">${UI.esc(crit.nome)} · ${UI.esc(bloqueios[0].descricao||bloqueios[0].categoria)}</div></span>
      </div>`;
    }).join("");
  }
  function producaoMacroHtml(obrasVisiveis){
    const sets = kpiSetsProducao(obrasVisiveis);
    const setIds = {}; Object.keys(sets).forEach(k=> setIds[k] = new Set(sets[k].map(o=>o.id)));
    let filtradas = obrasVisiveis;
    M.UIState.producaoFiltros.forEach(key=>{ if(setIds[key]) filtradas = filtradas.filter(o=> setIds[key].has(o.id)); });
    filtradas = filtradas.map(o=>({o, sit:C.situacaoObra(o)}))
      .sort((a,b)=> ({ALTO:0,MEDIO:1,BAIXO:2}[a.sit.nivel]) - ({ALTO:0,MEDIO:1,BAIXO:2}[b.sit.nivel]) || a.sit.diasEntrega - b.sit.diasEntrega);

    const rows = filtradas.map(({o,sit})=>{
      const allM = o.ambientes.flatMap(a=>a.moveis);
      const crit = C.itemCriticoGrupo(allM);
      const etapaLabel = crit ? (M.Store.etapaById(crit.etapa).nomeCurto||M.Store.etapaById(crit.etapa).nome) : "Concluída";
      const pend = C.pendenciasAbertasDe(o.id);
      const bloqueantes = C.pendenciasBloqueantesDe(o.id);
      const expandido = M.UIState.producaoExpandidas.has(o.id);
      return `<tr style="cursor:pointer;" onclick="Act.toggleProducaoExpandida('${o.id}')">
          <td><b>${UI.esc(o.cliente)}</b><div class="small muted">${o.numeroOS}</div></td>
          <td style="min-width:110px;"><b>${sit.progresso}%</b>${UI.progressBar(sit.progresso, sit.tone==='critical'?'':'')}</td>
          <td><span class="chip brand">${UI.esc(etapaLabel)}</span></td>
          <td>${pend.length? `<span class="chip ${bloqueantes.length?'critical':'neutral'}">${pend.length}${bloqueantes.length?` (${bloqueantes.length} bloq.)`:''}</span>` : `<span class="chip good">sem pendências</span>`}</td>
          <td>${UI.riscoChip(sit)}</td>
          <td>${C.fmtDate(o.dataEntregaPrevista)}<div class="small muted">${sit.diasEntrega<0?`${-sit.diasEntrega}d atrasada`:`em ${sit.diasEntrega}d`}</div></td>
          <td>${UI.person(o.responsavel)}</td>
          <td onclick="event.stopPropagation()"><a class="btn sm" href="#/obra/${o.id}">Abrir →</a></td>
        </tr>
        ${expandido ? `<tr><td colspan="8" style="background:var(--surface-alt);padding:10px 14px;">${ambientesExcecaoHtml(o)}</td></tr>` : ""}`;
    }).join("");

    return `
      ${kpiChipsHtml(sets, obrasVisiveis)}
      <div class="card pad">
        ${filtradas.length ? `<div style="overflow-x:auto;"><table class="tbl">
          <thead><tr><th>Obra</th><th>Progresso</th><th>Etapa atual</th><th>Pendências</th><th>Risco</th><th>Entrega</th><th>Resp.</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>` : `<p class="small muted">Nenhuma obra com os filtros combinados atuais.</p>`}
      </div>
      <p class="small muted" style="margin-top:8px;">Clique numa linha para expandir e ver os ambientes com exceção aberta — móvel/peça só aparecem dentro da pendência, na tela de Pendências.</p>
    `;
  }

  M.Pages.producao = function(){
    // item 9: sem verTodasObras, só entram no board os itens das obras onde a
    // pessoa tem tarefa/pendência/assistência atribuída — derivado na hora,
    // não existe (nem deveria existir) um campo fixo "obra do fulano".
    const restrito = !M.Store.pode("verTodasObras");
    const meuObraIds = restrito ? M.Store.obraIdsDoColaborador(M.Store.state.usuarioAtual) : null;
    const obrasVisiveis = restrito ? M.Store.state.obras.filter(o=>meuObraIds.has(o.id)) : M.Store.state.obras;

    // FASE 3 (handoff): "Produção" agora tem duas visões — Macro (obra como
    // unidade de linha, "painel de obras, macro por padrão") e o Kanban que
    // já existia (obra/ambiente/móvel, arrastável). Nada do Kanban mudou;
    // só ganhou um irmão que abre por padrão, seguindo o handoff.
    const producaoView = M.UIState.producaoView || "macro";
    const toggleTopoHtml = `
      ${restrito? `<div class="help-banner">${UI.icon('user',13)} Mostrando só as obras onde você tem tarefa, pendência ou assistência atribuída.</div>`:""}
      <div class="board-toolbar flex-between" style="margin-bottom:10px;">
        <div class="segmented">
          <button class="${producaoView==='macro'?'active':''}" onclick="Act.setProducaoView('macro')">Macro</button>
          <button class="${producaoView==='kanban'?'active':''}" onclick="Act.setProducaoView('kanban')">Kanban</button>
        </div>
        <div class="small muted">${producaoView==='macro' ? "Obra é a unidade da linha — clique para expandir e ver ambientes com exceção." : "Arraste os cartões entre etapas, ou clique para abrir o detalhe."}</div>
      </div>
    `;

    if(producaoView==="macro"){
      const html = toggleTopoHtml + producaoMacroHtml(obrasVisiveis);
      return {title:"Produção", crumb:"Painel de obras — macro por padrão", html,
        actionsHtml:`<a href="#/nova-obra" class="btn primary">${UI.icon('plus',14)} Nova Obra</a>`};
    }

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

    const html = toggleTopoHtml + `
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

    // plano "obra no centro": componente crítico agora tem ação de verdade
    // (igual tarefa) — Resolver fecha a pendência vinculada automaticamente;
    // Reabrir volta a bloquear (ex.: chegou danificado de novo).
    const compHtml = m.componentesCriticos.map(c=>`
      <div class="check-row">
        <span class="dot ${c.status==='REFACAO'?'critical':c.status==='AGUARDANDO'?'warning':'good'}"></span>
        <span class="label" style="flex:1;"><b>${UI.esc(c.nome)}</b> — ${UI.esc(c.tipo)}
          ${c.status==='REFACAO'? ` · <span class="chip critical">retrabalho</span> motivo: ${UI.esc(c.motivo||'-')}`:''}
          ${c.status==='AGUARDANDO'? ` · <span class="chip warning">aguardando</span> ${UI.esc(c.fornecedor||'')}`:''}
          ${c.status==='RESOLVIDO'? ` · <span class="chip good">resolvido</span>`:''}
        </span>
        <span onclick="event.stopPropagation()">
          ${c.status==='RESOLVIDO'
            ? `<button class="btn sm" onclick="Act.reabrirComponente('${m.id}','${c.id}')">Reabrir</button>`
            : `<button class="btn sm primary" onclick="Act.resolverComponente('${m.id}','${c.id}')">Resolver</button>`}
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
    // fase 4 do plano "obra no centro": todas as pendências abertas do móvel,
    // não só a mais recente (m.bloqueio era um objeto único e sobrescrevia).
    const bloqueiosM = M.Store.bloqueiosMovel(m.id);

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

        ${bloqueiosM.map(p=>`<div class="help-banner" style="background:var(--critical-bg);border-color:var(--critical);color:var(--critical);margin-bottom:8px;">
          ${UI.icon('lock',13)} <b>Bloqueada:</b> ${UI.esc(p.categoria)} — ${UI.esc(p.descricao)}. Responsável: ${UI.esc(p.responsavel)}.
          <a href="#/pendencias" data-close style="text-decoration:underline;">ver em Pendências →</a>
        </div>`).join("")}

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

        <div class="flex-between" style="margin-bottom:4px;">
          <label style="font-size:11.5px;font-weight:700;color:var(--ink-soft);">Componentes críticos / exceções</label>
          <button class="btn sm" onclick="Act.abrirFormComponente('${m.id}')">${UI.icon('plus',12)} componente</button>
        </div>
        <p class="small muted" style="margin:2px 0 6px;">Só pra exceções — vidro, serralheria, pintura, item comprado fora etc. Cadastrar aqui já cria a pendência correspondente.</p>
        ${compHtml? `<div style="margin:6px 0 14px;">${compHtml}</div>` : `<p class="small muted" style="margin-bottom:14px;">Nenhum componente crítico neste móvel.</p>`}

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

  // ---------- form de componente crítico (exceção) — cadastrar já cria a pendência ----------
  M.Pages.componenteFormHtml = function(movelId){
    return `
      <div class="modal-head"><h2>Novo componente crítico</h2><button class="modal-close" data-close>✕</button></div>
      <form id="formComponente">
        <div class="modal-body">
          <div class="field"><label>Nome do item</label><input name="nome" required placeholder="Ex: Porta de vidro"></div>
          <div class="field-row">
            <div class="field"><label>Tipo</label><select name="tipo" required>${M.TIPOS_COMPONENTE.map(t=>`<option>${t}</option>`).join("")}</select></div>
            <div class="field"><label>Fornecedor (se houver)</label><input name="fornecedor" placeholder="Ex: Vidraçaria Pontal"></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Responsável</label><select name="responsavel">${M.COLABORADORES.map(c=>`<option>${c.nome}</option>`).join("")}</select></div>
            <div class="field"><label>Prazo</label><input type="date" name="prazo"></div>
          </div>
          <div class="field"><label>Observação</label><textarea name="observacao" placeholder="Detalhe o que está sendo esperado ou feito"></textarea></div>
          <p class="small muted">Cria já com status "aguardando" e a pendência correspondente — some das duas juntas quando você marcar como resolvido.</p>
        </div>
        <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Criar componente</button></div>
      </form>`;
  };

  M.Pages.ambienteModalHtml = function(f){
    const {o,a} = f;
    const prog = C.progressoAmbiente(a);
    const rows = a.moveis.map(m=>{
      const bloqueiosM = M.Store.bloqueiosMovel(m.id);
      const sit = C.situacaoMovel(m);
      return `
      <div class="check-row" style="cursor:pointer;" onclick="UI.closeModal();Act.openMovel('${m.id}')">
        <span class="dot ${sit.tone}"></span>
        <span class="label"><b>${UI.esc(m.nome)}</b> <span class="chip neutral" style="margin-left:4px;">${UI.esc(M.Store.etapaById(m.etapa).nome)}</span>
          <div class="small muted">resp. ${UI.esc(m.responsavel)}${bloqueiosM.length? " · ⏳ "+UI.esc(bloqueiosM[0].categoria)+(bloqueiosM.length>1?` +${bloqueiosM.length-1}`:''):""}</div></span>
      </div>`;}).join("");
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
