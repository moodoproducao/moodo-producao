/* ============================================================
   PÁGINA: Pendências — entidade única com tipo (handoff · Fase 2)
   Kanban (por status) | Lista (tabular), com impacto como campo único e
   "bloqueia fechamento" sempre derivado — nunca campo manual.
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  // FASE 4 (handoff — permissões em Montagem): "'Bloqueia o ambiente' e
  // 'bloqueia a obra' exigem Líder ou acima". Nosso modelo de perfis não tem
  // a granularidade exata do handoff (Admin/Gestor/PCP vs. Líder vs.
  // Produção/Montador/Assistência) — uso a permissão liberarExcecao já
  // existente (ADMIN/PCP/LIDERANCA=true, OPERADOR/MONTADOR/TV=false) como
  // proxy de "Líder ou acima", decisão registrada no relatório de entrega.
  // Opção aparece desabilitada e visível (não escondida), com o motivo —
  // mesmo padrão do handoff: "esconder a opção faria o usuário achar que a
  // regra não existe".
  function impactoOptionsHtml(selecionado){
    const podeTravar = M.Store.pode("liberarExcecao");
    return M.IMPACTOS_PENDENCIA_DEF.map(i=>{
      const restrito = !podeTravar && (i.key==="BLOQUEIA_AMBIENTE" || i.key==="BLOQUEIA_OBRA");
      return `<option value="${i.key}" ${i.key===selecionado?'selected':''} ${restrito?'disabled':''}>${UI.esc(i.label)}${restrito?' — requer liderança':''}</option>`;
    }).join("");
  }

  function fluxoStepsHtml(p, compact){
    if(!p.fluxoPassos || !p.fluxoPassos.length) return "";
    const steps = compact ? p.fluxoPassos.slice(Math.max(0,p.passoAtual-1), p.passoAtual+2) : p.fluxoPassos;
    const offset = compact ? Math.max(0,p.passoAtual-1) : 0;
    return `<div class="fluxo-steps">${steps.map((s,i)=>{
      const idx = i+offset;
      const cls = idx<p.passoAtual? "done" : idx===p.passoAtual? "current" : "";
      return `<div class="fluxo-step ${cls}"><span class="num">${idx<p.passoAtual?UI.icon('check',10):idx+1}</span>${UI.esc(s)}</div>${i<steps.length-1?'<div class="fluxo-sep"></div>':''}`;
    }).join("")}</div>`;
  }

  // FASE 4 (§8 handoff): prioridade agora vem de M.Calc.compararPrioridadePendencia
  // (5 critérios exatos do handoff — ver calc.js). Resolvidas continuam por
  // último — isso é convenção de exibição, não um dos 5 critérios de prioridade.
  function ordenarPendencias(lista){
    return lista.slice().sort((a,b)=>{
      const ra = a.status==="RESOLVIDA"?1:0, rb = b.status==="RESOLVIDA"?1:0;
      if(ra!==rb) return ra-rb;
      return C.compararPrioridadePendencia(a,b);
    });
  }

  // FASE 4 (§7 handoff): "Filtros prioritários EXATAMENTE: Minhas, Todas,
  // Status, Impacto, Obra, Responsável. Não criar dezenas de filtros."
  // Tipo, Prioridade e o chip "Bloqueia fechamento" saíram da barra — Impacto
  // já é a fonte única sobre bloqueio (§5), então o chip virou redundante; e
  // Tipo/Prioridade não estão na lista exata do handoff. A busca livre
  // continua (não é um dos "filtros" enumerados, é o campo de busca).
  function aplicarFiltros(lista, f, somenteMinhas, nome){
    let out = lista;
    if(somenteMinhas) out = out.filter(p=>p.responsavel===nome);
    if(f.status) out = out.filter(p=>p.status===f.status);
    if(f.impacto) out = out.filter(p=>p.impacto===f.impacto);
    if(f.obraId) out = out.filter(p=>p.obraId===f.obraId);
    if(f.responsavel) out = out.filter(p=>p.responsavel===f.responsavel);
    if(f.busca && f.busca.trim()){
      const q = f.busca.trim().toLowerCase();
      out = out.filter(p=> (p.descricao||"").toLowerCase().includes(q) || (p.obraNome||"").toLowerCase().includes(q)
        || (p.movelNome||"").toLowerCase().includes(q) || (p.ambienteNome||"").toLowerCase().includes(q));
    }
    return out;
  }

  function filtrosHtml(f, somenteMinhas, podeAlternarTodas){
    // FASE 4 (AJUSTE): o seletor de Obra também não pode oferecer obra fora
    // do escopo de quem está vendo a tela — mesmo não sendo em si um
    // vazamento de dado (a lista de pendências já vem filtrada pelo Store),
    // oferecer uma obra que a pessoa não tem acesso é ruído/confuso.
    const obras = M.Store.pode("verTodasObras") ? M.Store.state.obras
      : M.Store.state.obras.filter(o=> M.Store.obraIdsDoColaborador(M.Store.state.usuarioAtual).has(o.id));
    return `
      <div class="card pad" style="margin-bottom:14px;">
        <div class="flex-gap" style="flex-wrap:wrap;margin-bottom:8px;">
          <input type="text" value="${UI.esc(f.busca||"")}" placeholder="Buscar obra, móvel, descrição… (Enter para buscar)" style="flex:1;min-width:200px;padding:8px 10px;border-radius:var(--radius-sm);border:1px solid var(--border-strong);background:var(--surface);color:var(--ink);font-size:13px;" onchange="Act.setPendFiltro('busca', this.value)">
        </div>
        <div class="flex-gap" style="flex-wrap:wrap;align-items:center;">
          ${podeAlternarTodas ? `
          <div class="segmented">
            <button class="${somenteMinhas?'active':''}" onclick="Act.setPendSomenteMinhas(true)">Minhas</button>
            <button class="${!somenteMinhas?'active':''}" onclick="Act.setPendSomenteMinhas(false)">Todas</button>
          </div>` : `<span class="chip neutral">${UI.icon('lock',11)} Minhas pendências</span>`}
          <select onchange="Act.setPendFiltro('status',this.value)">
            <option value="">Todos os status</option>
            ${M.STATUS_PENDENCIA_DEF.map(s=>`<option value="${s.key}" ${f.status===s.key?'selected':''}>${s.label}</option>`).join("")}
          </select>
          <select onchange="Act.setPendFiltro('impacto',this.value)">
            <option value="">Todo impacto</option>
            ${M.IMPACTOS_PENDENCIA_DEF.map(i=>`<option value="${i.key}" ${f.impacto===i.key?'selected':''}>${UI.esc(i.label)}</option>`).join("")}
          </select>
          <select onchange="Act.setPendFiltro('obraId',this.value)">
            <option value="">Todas as obras</option>
            ${obras.map(o=>`<option value="${o.id}" ${f.obraId===o.id?'selected':''}>${UI.esc(o.cliente)}</option>`).join("")}
          </select>
          <select onchange="Act.setPendFiltro('responsavel',this.value)">
            <option value="">Todos os responsáveis</option>
            ${M.COLABORADORES.map(c=>`<option ${f.responsavel===c.nome?'selected':''}>${UI.esc(c.nome)}</option>`).join("")}
          </select>
          ${(f.obraId||f.responsavel||f.status||f.impacto||f.busca)? `<button class="btn ghost sm" onclick="Act.limparPendFiltros()">Limpar filtros</button>`:""}
        </div>
      </div>
    `;
  }

  // FASE 4 (§1 handoff): "histórico/auditoria" — lê do histórico central já
  // existente (Store.log), filtrado por pendenciaId (Store.historicoDaPendencia).
  // Não duplica armazenamento — mesma fonte que a aba Histórico da Obra usa.
  function historicoPendenciaHtml(pendId){
    const h = M.Store.historicoDaPendencia(pendId);
    if(!h.length) return `<p class="small muted">Sem eventos registrados.</p>`;
    return `<ul style="margin:4px 0 0 18px;font-size:12px;line-height:1.9;color:var(--ink-soft);">
      ${h.slice(0,8).map(e=>`<li>${C.fmtDate(e.data.slice(0,10))} — <b>${UI.esc(e.usuario||"—")}</b>: ${UI.esc(e.descricao)}</li>`).join("")}
    </ul>`;
  }

  // ---------- linha da Lista ----------
  function linhaLista(p){
    const dias = C.diasDesde(p.abertura);
    const expandido = M.UIState.pendExpandido===p.id;
    const proximaAcao = p.status!=="RESOLVIDA" && p.fluxoPassos ? p.fluxoPassos[p.passoAtual] : null;
    const impDef = M.impactoDef(p.impacto);
    const foto = (p.fotosAbertura&&p.fotosAbertura[0]) || (p.fotos&&p.fotos[0]);
    return `<div class="card pad" style="margin-bottom:10px;cursor:pointer;" onclick="Act.togglePendExpandido('${p.id}')">
      <div class="pend-row">
        <div class="impacto-bar ${impDef.tone}" title="${UI.esc(impDef.label)}"></div>
        <div class="pend-body">
          <div class="flex-between" style="flex-wrap:wrap;gap:8px;">
            <div class="flex-gap" style="align-items:flex-start;gap:10px;">
              ${foto? `<a href="${foto.url}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="foto-thumb" style="width:44px;height:44px;flex-shrink:0;"><img src="${foto.url}" loading="lazy" alt=""></a>`:""}
              <div>
                <div class="small muted">${UI.tipoChip(p.tipo)} ${UI.esc(p.categoria)} · <a href="#/obra/${p.obraId}" onclick="event.stopPropagation()">${UI.esc(p.obraNome)}</a> · ${UI.esc(p.ambienteNome||"")} ${p.movelNome?"· "+UI.esc(p.movelNome):""}</div>
                <b>${UI.esc(p.descricao)}</b>
              </div>
            </div>
            <div class="flex-gap" style="gap:8px;flex-wrap:wrap;">
              ${UI.impactoChip(p.impacto)}
              ${UI.prioridadeChip(p.prioridade)}
              ${UI.statusPendenciaChip(p.status)}
              <span class="chip ${dias>=5?'critical':dias>=2?'warning':'neutral'}">${dias}d em aberto</span>
              ${(p.fotosAbertura&&p.fotosAbertura.length)||( p.fotos&&p.fotos.length)? `<span class="chip neutral">${UI.icon('image',11)} ${(p.fotosAbertura&&p.fotosAbertura.length)||p.fotos.length}</span>`:""}
            </div>
          </div>
          <div class="small muted" style="margin-top:4px;">origem: ${UI.esc(p.origem||"—")} · resp. ${UI.esc(p.responsavel||"—")}${p.prazo?" · prazo "+C.fmtDate(p.prazo):""}</div>
          ${proximaAcao? `<div class="next-action"><div class="lbl">Próxima ação</div><div class="txt">${UI.esc(proximaAcao)} — ${UI.person(p.responsavel)} ${p.prazo?" · prazo "+C.fmtDate(p.prazo):""}</div></div>`:""}
          ${expandido ? `
            ${fluxoStepsHtml(p,false)}
            ${M.Store.pode("pendencia.atribuir") ? `
            <div class="field-row" style="margin-top:10px;align-items:flex-end;" onclick="event.stopPropagation()">
              <div class="field" style="flex:1;"><label>Responsável</label>
                <select id="pendResp_${p.id}">${M.COLABORADORES.map(c=>`<option ${c.nome===p.responsavel?'selected':''}>${UI.esc(c.nome)}</option>`).join("")}</select>
              </div>
              <button class="btn sm" onclick="Act.atribuirPendencia('${p.id}', document.getElementById('pendResp_${p.id}').value)">Atribuir</button>
            </div>` : ""}
            <div class="flex-between" style="margin-top:10px;" onclick="event.stopPropagation()">
              <div class="small" style="font-weight:700;color:var(--ink-soft);">Fotos de abertura</div>
              ${M.Store.pode("pendencia.editar")? `<button class="btn sm ghost" onclick="Act.adicionarFotosPendencia('${p.id}','abertura')">${UI.icon('camera',11)} + fotos</button>`:""}
            </div>
            ${UI.fotosGaleriaHtml(p.fotosAbertura&&p.fotosAbertura.length?p.fotosAbertura:p.fotos) || `<p class="small muted">Nenhuma foto de abertura.</p>`}
            <div class="flex-between" style="margin-top:10px;" onclick="event.stopPropagation()">
              <div class="small" style="font-weight:700;color:var(--ink-soft);">Fotos de resolução</div>
              ${M.Store.pode("pendencia.editar")? `<button class="btn sm ghost" onclick="Act.adicionarFotosPendencia('${p.id}','resolucao')">${UI.icon('camera',11)} + fotos</button>`:""}
            </div>
            ${UI.fotosGaleriaHtml(p.fotosResolucao) || `<p class="small muted">Nenhuma foto de resolução${p.status!=='RESOLVIDA'?' — serão exigidas ao marcar como resolvida':''}.</p>`}
            <div class="small" style="font-weight:700;color:var(--ink-soft);margin-top:10px;">Histórico</div>
            ${historicoPendenciaHtml(p.id)}
            <div class="flex-gap" style="margin-top:12px;flex-wrap:wrap;" onclick="event.stopPropagation()">
              ${p.status!=="RESOLVIDA"? `<button class="btn sm primary" onclick="Act.avancarFluxo('${p.id}')">${UI.icon('chevron-right',12)} Continuar fluxo</button>`:""}
              ${p.status!=="RESOLVIDA"? `<button class="btn sm" onclick="Act.setPendenciaStatus('${p.id}','RESOLVIDA')">Marcar resolvida</button>`:""}
              ${p.status==="RESOLVIDA"? `<button class="btn sm" onclick="Act.reabrirPendencia('${p.id}')">Reabrir</button>`:""}
            </div>
          ` : fluxoStepsHtml(p,true)}
        </div>
      </div>
    </div>`;
  }

  // ---------- card do Kanban (colunas = status, handoff baixa/média-fi) ----------
  function cardKanban(p){
    const impDef = M.impactoDef(p.impacto);
    return `<div class="kcard" onclick="Act.togglePendExpandido('${p.id}');Act.go('#/pendencias')">
      <div class="pend-row">
        <div class="impacto-bar ${impDef.tone}"></div>
        <div class="pend-body">
          <div class="kproj"><span>${UI.esc(p.tipo)}</span><span>${UI.esc(p.obraNome)}</span></div>
          <div class="ktitle">${UI.esc(p.descricao)}</div>
          <div class="small muted">${UI.esc(p.ambienteNome||"")}${p.movelNome?" · "+UI.esc(p.movelNome):""}</div>
          <div class="krow">${UI.person(p.responsavel)}${p.prazo?`<span class="small muted">${C.fmtDate(p.prazo)}</span>`:""}</div>
          ${M.bloqueiaFechamento(p.impacto)? `<div class="kblocked">${UI.icon('lock',11)} ${UI.esc(impDef.label)}</div>`:""}
        </div>
      </div>
    </div>`;
  }

  function kanbanHtml(lista){
    const cols = M.STATUS_PENDENCIA_DEF;
    return `<div class="board-wrap"><div class="board">
      ${cols.map(c=>{
        const itens = lista.filter(p=>p.status===c.key);
        return `<div class="column">
          <div class="column-head"><span class="name">${UI.esc(c.label)}</span><span class="count">${itens.length}</span></div>
          <div class="column-cards">${itens.map(cardKanban).join("")}</div>
        </div>`;
      }).join("")}
    </div></div>`;
  }

  // REFINO VISUAL V2 (§6 — novo layout de Pendências): linha compacta usada
  // nos 3 grupos do topo (Críticas/Em tratamento/Resolver hoje) — mais
  // densa que linhaLista (sem fluxo/histórico/fotos expandidos). Clicar
  // expande o item na LISTA COMPLETA abaixo (mesmo M.UIState.pendExpandido
  // que a lista completa já lê — não é um estado paralelo novo).
  function pendCompactRowHtml(p){
    const dias = C.diasDesde(p.abertura);
    const impDef = M.impactoDef(p.impacto);
    const prazoTxt = p.prazo ? (C.diasAte(p.prazo)<=0 ? "vencida" : "prazo "+C.fmtDate(p.prazo)) : `${dias}d em aberto`;
    return `<div class="compact-row" onclick="Act.togglePendExpandido('${p.id}')">
      <div class="impacto-bar ${impDef.tone}" style="align-self:stretch;"></div>
      <div class="cr-main">
        <div class="cr-top"><span class="cr-title">${UI.esc(p.descricao||p.categoria)}</span>${UI.statusPendenciaChip(p.status)}</div>
        <div class="cr-sub">${UI.esc(p.obraNome)}${p.ambienteNome? " · "+UI.esc(p.ambienteNome):""} · ${UI.esc(prazoTxt)}</div>
      </div>
      <div class="cr-action">${UI.impactoChip(p.impacto)}</div>
    </div>`;
  }

  M.Pages.pendencias = function(){
    const f = M.UIState.pendFiltro;
    const view = M.UIState.pendView || "lista";
    const nome = M.Store.state.usuarioAtual;
    const colab = M.colabByNome(nome);
    const perfilKey = colab ? colab.perfil : null;
    // FASE 4 (AJUSTE — escopo real de "Minhas/Todas"): a base já vem
    // pré-filtrada pelo Store (M.Store.pendenciasVisiveis()), não mais de
    // state.pendencias cru — quem não tem verTodasObras só recebe pendência
    // das próprias obras (obraIdsDoColaborador), e Produção (OPERADOR) só
    // recebe a própria (responsavel===nome), sempre, não importa o que a
    // tela mande. O toggle abaixo é só sobre ESSA base já seguraf; nunca
    // amplia o que o Store decidiu devolver (a base já vem segura).
    const base = M.Store.pendenciasVisiveis();
    // Produção: "somente Minhas" é regra, não preferência — nem exibe o
    // botão "Todas" (nem adiantaria: a base já veio só com as dela).
    const podeAlternarTodas = perfilKey !== "OPERADOR";
    const padraoMinhas = perfilKey==="OPERADOR" || perfilKey==="MONTADOR";
    const somenteMinhas = !podeAlternarTodas ? true
      : (M.UIState.pendSomenteMinhas===null ? !!padraoMinhas : M.UIState.pendSomenteMinhas);
    const filtradas = ordenarPendencias(aplicarFiltros(base, f, somenteMinhas, nome));
    const bloqueiam = filtradas.filter(p=>p.status!=="RESOLVIDA" && M.bloqueiaFechamento(p.impacto)).length;
    const abertas = filtradas.filter(p=>p.status!=="RESOLVIDA").length;

    // REFINO VISUAL V2 (ajustes finais, §3): "Crítica" usa IMPACTO REAL, nunca
    // prioridade sozinha — fonte única M.Calc.pendenciaCritica (mesma função
    // usada em Hoje > Exceções críticas), pra uma pendência INFORMATIVO/
    // NAO_IMPEDE nunca aparecer como "Crítica" só porque prioridade="Crítica"
    // foi preenchida. Prioridade continua ordenando/desempatando a lista via
    // compararPrioridadePendencia — não decide mais criticidade.
    //   Resolver hoje = vencida OU com a mesma antiguidade (5 dias) que já
    //   é usada como limiar de "crítico"/"obra parada" em outros pontos do
    //   app (mesma régua, não uma nova).
    const criticas = filtradas.filter(C.pendenciaCritica);
    const emTratamento = filtradas.filter(p=> p.status==="EM_TRATAMENTO");
    const resolverHoje = filtradas.filter(p=> p.status!=="RESOLVIDA" &&
      ((p.prazo && C.diasAte(p.prazo)<=0) || C.diasDesde(p.abertura)>=5));
    const vencidas = filtradas.filter(p=> p.status!=="RESOLVIDA" && p.prazo && C.diasAte(p.prazo)<=0).length;
    const resolvidasHoje = filtradas.filter(p=> p.status==="RESOLVIDA" && p.resolvidoEm===M.todayISO()).length;

    function grupoColuna(key, titulo, icon, tone, itens, vazio){
      const {itensHtml, toggleHtml} = UI.secaoComVerTodos({key, itens: itens.map(pendCompactRowHtml), limite:5});
      return `<div class="col-group">
        ${UI.secHead({titulo, icon, count:itens.length, tone})}
        ${itens.length? `${itensHtml}${toggleHtml}` : `<div class="group-empty">${UI.esc(vazio)}</div>`}
      </div>`;
    }

    const html = `
      <div class="help-banner">${UI.icon('alert',13)} Uma pendência não é uma coluna do quadro — ela existe em paralelo à etapa, com impacto próprio (o que ela trava) e um fluxo operacional (ex.: vidro passa por medir → orçar → pedir → receber → instalar). "Bloqueia fechamento" nunca é escolhido à parte — é sempre consequência do impacto.</div>

      ${UI.kpiRow([
        UI.kpiTile({icon:'alert', label:'Abertas', value:abertas}),
        UI.kpiTile({icon:'lock', label:'Críticas', value:criticas.length, tone: criticas.length?'critical':''}),
        UI.kpiTile({icon:'clock', label:'Em tratamento', value:emTratamento.length, tone: emTratamento.length?'warning':''}),
        UI.kpiTile({icon:'alert', label:'Vencidas', value:vencidas, tone: vencidas?'critical':''}),
        UI.kpiTile({icon:'check', label:'Resolvidas hoje', value:resolvidasHoje, tone: resolvidasHoje?'good':''}),
      ])}

      <div class="cols-3-tight">
        ${grupoColuna('pend:CRITICAS', 'Críticas', 'alert', 'critical', criticas, 'Nenhuma pendência crítica agora.')}
        ${grupoColuna('pend:TRATAMENTO', 'Em tratamento', 'clock', 'warning', emTratamento, 'Nada em tratamento agora.')}
        ${grupoColuna('pend:HOJE', 'Resolver hoje', 'check-circle', 'neutral', resolverHoje, 'Nada vencendo ou envelhecendo hoje.')}
      </div>

      <div class="flex-between" style="flex-wrap:wrap;gap:10px;margin:22px 0 8px;">
        <div class="sec-title" style="margin:0;">${UI.icon('alert',12)}<b>Lista completa</b> <span class="chip neutral">${filtradas.length}</span></div>
        <div class="segmented">
          <button class="${view==='lista'?'active':''}" onclick="Act.setPendView('lista')">Lista</button>
          <button class="${view==='kanban'?'active':''}" onclick="Act.setPendView('kanban')">Kanban</button>
        </div>
      </div>
      ${filtrosHtml(f, somenteMinhas, podeAlternarTodas)}
      ${view==='kanban' ? kanbanHtml(filtradas) : (filtradas.length? filtradas.map(linhaLista).join("") : `<p class="small muted">Nenhuma pendência encontrada com esse filtro.</p>`)}
    `;
    return {title: somenteMinhas?"Minhas Pendências":"Pendências", crumb:"Prioridade explicável (impacto · antiguidade · prazo da obra) — bloqueia fechamento é sempre derivado, nunca campo manual", html,
      actionsHtml:`<button class="btn primary" onclick="Act.openPendenciaForm(null,null,null)">${UI.icon('plus',14)} Nova pendência</button>`};
  };

  // FASE 4 (§3 handoff): "abrir Pendência de dentro de Obra/Ambiente/Móvel/
  // Montagem/Assistência deve herdar contexto automaticamente, evitando
  // repetir obra/ambiente/móvel." Quando o contexto já é conhecido (obraId/
  // ambienteId/movelId vindos de quem chamou), essa informação vira um
  // cabeçalho fixo em vez de select — nada pra re-escolher. Sem contexto
  // (ex.: "Nova pendência" solta em Hoje/Pendências), o form continua
  // pedindo Obra + Móvel do jeito que já funcionava.
  M.Pages.pendenciaFormHtml = function(obraId, ambienteId, movelId){
    const obras = M.Store.state.obras;
    // móvel é o contexto mais específico — se veio, ele já resolve obra+ambiente.
    let fMovel = movelId ? M.Store.findMovel(movelId) : null;
    if(fMovel){ obraId = fMovel.o.id; ambienteId = fMovel.a.id; }
    let fAmbiente = (!fMovel && ambienteId) ? M.Store.findAmbiente(ambienteId) : null;
    if(fAmbiente){ obraId = fAmbiente.o.id; }
    const obraCtx = obraId ? M.Store.getObra(obraId) : null;

    const contextoHtml = obraCtx ? `
      <div class="help-banner" style="margin-bottom:12px;">
        ${UI.icon('building',13)} <b>${UI.esc(obraCtx.numeroOS)} — ${UI.esc(obraCtx.cliente)}</b>${fAmbiente? ` · ${UI.esc(fAmbiente.a.nome)}` : ""}${fMovel? ` · ${UI.esc(fMovel.a.nome)} — ${UI.esc(fMovel.m.nome)}` : ""}
      </div>` : "";

    // móvel: escondido quando já veio fixado pelo contexto; filtrado ao
    // ambiente quando o ambiente é conhecido; senão, filtrado só pela obra
    // (ou vazio, à espera da obra ser escolhida).
    const moveisDisponiveis = obraId
      ? M.Store.allMoveis().filter(x=>x.o.id===obraId && (!fAmbiente || x.a.id===ambienteId))
      : [];
    // com ambiente já fixado pelo contexto, trocar de móvel nunca deve mudar
    // o ambienteId (continua sendo o mesmo ambiente) — só sincroniza quando
    // o ambiente ainda não é conhecido de antemão.
    const movelSelectHtml = fMovel ? `<input type="hidden" name="movelId" value="${fMovel.m.id}">` : `
      <div class="field"><label>Móvel afetado (opcional)</label>
        <select name="movelId" id="pendMovel" ${fAmbiente? "" : `onchange="M.Pages.__syncPendAmbiente()"`}>
          ${moveisDisponiveis.map(({a,m})=>`<option value="${m.id}" data-amb="${a.id}" ${m.id===movelId?'selected':''}>${UI.esc(a.nome)} — ${UI.esc(m.nome)}${m.ressalvaAberta?' — ⚠️ com ressalva':''}</option>`).join("")}
          <option value="" selected>— pendência avulsa (sem móvel específico) —</option>
        </select>
      </div>`;

    return `
      <div class="modal-head"><h2>Nova pendência</h2><button class="modal-close" data-close>✕</button></div>
      <form id="formPendencia">
        <div class="modal-body">
          ${contextoHtml}
          ${obraCtx ? `<input type="hidden" name="obraId" value="${obraCtx.id}">` : `
          <div class="field"><label>Obra</label>
            <select name="obraId" id="pendObra" required onchange="M.Pages.__refreshPendMoveis(this.value)">
              <option value="">Selecione...</option>
              ${obras.map(o=>`<option value="${o.id}">${o.numeroOS} — ${o.cliente}</option>`).join("")}
            </select>
          </div>`}
          ${movelSelectHtml}
          <input type="hidden" name="ambienteId" id="pendAmbienteId" value="${ambienteId||''}">
          <div class="field-row">
            <div class="field"><label>Tipo</label>
              <select name="tipo" required>${M.TIPOS_PENDENCIA.map(t=>`<option>${t}</option>`).join("")}</select>
            </div>
            <div class="field"><label>Impacto <span class="small muted">(o que isso trava)</span></label>
              <select name="impacto" required>${impactoOptionsHtml('IMPEDE_FINALIZAR')}</select>
            </div>
          </div>
          <div class="field-row">
            <div class="field"><label>Categoria <span class="small muted">(fluxo operacional)</span></label>
              <select name="categoria" required>${M.CATEGORIAS_PENDENCIA.map(c=>`<option>${c}</option>`).join("")}</select>
            </div>
            <div class="field"><label>Origem <span class="small muted">(de onde veio)</span></label>
              <select name="origem"><option value="">—</option>${M.ORIGENS_PENDENCIA.map(o=>`<option>${o}</option>`).join("")}</select>
            </div>
          </div>
          <div class="field"><label>Descrição</label><textarea name="descricao" required placeholder="Descreva o que está faltando ou o problema"></textarea></div>
          <div class="field"><label>Descrição livre (se pendência avulsa, sem móvel)</label><input name="descricaoLivre" placeholder="Ex: Item avulso"></div>
          <div class="field-row">
            <div class="field"><label>Responsável <span class="small muted">(quem age agora)</span></label><select name="responsavel">${M.COLABORADORES.map(c=>`<option>${c.nome}</option>`).join("")}</select></div>
            <div class="field"><label>Fornecedor (se houver)</label><input name="fornecedor" placeholder="Ex: Vidraçaria Pontal"></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Prazo</label><input type="date" name="prazo"></div>
            <div class="field"><label>Prioridade</label><select name="prioridade">${M.PRIORIDADES_PENDENCIA_DEF.map(p=>`<option value="${p.key}" ${p.key==='MEDIA'?'selected':''}>${p.label}</option>`).join("")}</select></div>
          </div>
          <label style="font-size:11.5px;font-weight:700;color:var(--ink-soft);">${UI.icon('camera',13)} Fotos de abertura</label>
          ${UI.fotoFieldHtml("fotos")}
        </div>
        <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Criar pendência</button></div>
      </form>`;
  };
  M.Pages.__refreshPendMoveis = function(obraId){
    const sel = document.getElementById("pendMovel");
    if(!sel) return;
    sel.innerHTML = M.Store.allMoveis().filter(x=>x.o.id===obraId).map(({a,m})=>`<option value="${m.id}" data-amb="${a.id}">${a.nome} — ${m.nome}${m.ressalvaAberta?' — ⚠️ com ressalva':''}</option>`).join("")
      + `<option value="" selected>— pendência avulsa (sem móvel específico) —</option>`;
    M.Pages.__syncPendAmbiente();
  };
  // CORREÇÃO (Fase 4, §3): o campo oculto ambienteId nunca era sincronizado
  // quando o móvel escolhido mudava — uma pendência criada apontando pra um
  // móvel de um ambiente podia ficar sem o ambienteId correspondente (e
  // portanto não contar em bloqueiosAmbiente). Mantém herança de contexto
  // consistente mesmo quando o usuário troca o móvel manualmente no form.
  M.Pages.__syncPendAmbiente = function(){
    const sel = document.getElementById("pendMovel");
    const hid = document.getElementById("pendAmbienteId");
    if(!sel || !hid) return;
    const opt = sel.options[sel.selectedIndex];
    hid.value = (opt && opt.value) ? (opt.getAttribute("data-amb")||"") : hid.value;
    if(opt && !opt.value) hid.value = ""; // "avulsa" selecionada explicitamente
  };

  // ---------- resolver pendência (fotos de resolução — handoff) ----------
  M.Pages.resolverPendenciaFormHtml = function(p){
    return `
      <div class="modal-head"><div><h2>Resolver pendência</h2><div class="meta">${UI.esc(p.descricao)}</div></div><button class="modal-close" data-close>✕</button></div>
      <form id="formResolverPendencia">
        <div class="modal-body">
          <p class="small muted">Fotos de resolução ficam separadas das fotos de abertura — é o que permite auditar depois o antes/depois de um retrabalho ou avaria.</p>
          <label style="font-size:11.5px;font-weight:700;color:var(--ink-soft);">${UI.icon('camera',13)} Fotos de resolução</label>
          ${UI.fotoFieldHtml("fotos")}
          <div class="field" style="margin-top:10px;"><label>Observação (opcional)</label><textarea name="observacao" placeholder="O que foi feito pra resolver"></textarea></div>
        </div>
        <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Confirmar resolução</button></div>
      </form>`;
  };
})();
