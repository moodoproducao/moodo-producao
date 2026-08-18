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

  // ordena por impacto (mais severo primeiro) e depois por prazo — resolvidas
  // sempre por último (handoff: "ordenado por impacto e depois por prazo ·
  // resolvidas aparecem no fim").
  function ordenarPendencias(lista){
    return lista.slice().sort((a,b)=>{
      const ra = a.status==="RESOLVIDA"?1:0, rb = b.status==="RESOLVIDA"?1:0;
      if(ra!==rb) return ra-rb;
      const sa = M.IMPACTO_SEVERIDADE[a.impacto]??9, sb = M.IMPACTO_SEVERIDADE[b.impacto]??9;
      if(sa!==sb) return sa-sb;
      return C.diasAte(a.prazo||"2099-01-01") - C.diasAte(b.prazo||"2099-01-01");
    });
  }

  function aplicarFiltros(lista, f, somenteMinhas, nome){
    let out = lista;
    if(somenteMinhas) out = out.filter(p=>p.responsavel===nome);
    if(f.tipo) out = out.filter(p=>p.tipo===f.tipo);
    if(f.categoria) out = out.filter(p=>p.categoria===f.categoria);
    if(f.status) out = out.filter(p=>p.status===f.status);
    if(f.obraId) out = out.filter(p=>p.obraId===f.obraId);
    if(f.responsavel) out = out.filter(p=>p.responsavel===f.responsavel);
    if(f.prioridade) out = out.filter(p=>p.prioridade===f.prioridade);
    if(f.bloqueiaFechamento) out = out.filter(p=>M.bloqueiaFechamento(p.impacto));
    if(f.busca && f.busca.trim()){
      const q = f.busca.trim().toLowerCase();
      out = out.filter(p=> (p.descricao||"").toLowerCase().includes(q) || (p.obraNome||"").toLowerCase().includes(q)
        || (p.movelNome||"").toLowerCase().includes(q) || (p.ambienteNome||"").toLowerCase().includes(q));
    }
    return out;
  }

  function filtrosHtml(f){
    const obras = M.Store.state.obras;
    return `
      <div class="card pad" style="margin-bottom:14px;">
        <div class="flex-gap" style="flex-wrap:wrap;margin-bottom:8px;">
          <input type="text" value="${UI.esc(f.busca||"")}" placeholder="Buscar obra, móvel, descrição… (Enter para buscar)" style="flex:1;min-width:200px;padding:8px 10px;border-radius:var(--radius-sm);border:1px solid var(--border-strong);background:var(--surface);color:var(--ink);font-size:13px;" onchange="Act.setPendFiltro('busca', this.value)">
        </div>
        <div class="flex-gap" style="flex-wrap:wrap;">
          <select onchange="Act.setPendFiltro('tipo',this.value)">
            <option value="">Todos os tipos</option>
            ${M.TIPOS_PENDENCIA.map(t=>`<option ${f.tipo===t?'selected':''}>${t}</option>`).join("")}
          </select>
          <select onchange="Act.setPendFiltro('obraId',this.value)">
            <option value="">Todas as obras</option>
            ${obras.map(o=>`<option value="${o.id}" ${f.obraId===o.id?'selected':''}>${UI.esc(o.cliente)}</option>`).join("")}
          </select>
          <select onchange="Act.setPendFiltro('responsavel',this.value)">
            <option value="">Todos os responsáveis</option>
            ${M.COLABORADORES.map(c=>`<option ${f.responsavel===c.nome?'selected':''}>${UI.esc(c.nome)}</option>`).join("")}
          </select>
          <select onchange="Act.setPendFiltro('prioridade',this.value)">
            <option value="">Toda prioridade</option>
            ${M.PRIORIDADES_PENDENCIA_DEF.map(p=>`<option value="${p.key}" ${f.prioridade===p.key?'selected':''}>${p.label}</option>`).join("")}
          </select>
          <select onchange="Act.setPendFiltro('status',this.value)">
            <option value="">Todos os status</option>
            ${M.STATUS_PENDENCIA_DEF.map(s=>`<option value="${s.key}" ${f.status===s.key?'selected':''}>${s.label}</option>`).join("")}
          </select>
          <label class="chip ${f.bloqueiaFechamento?'critical':'neutral'}" style="cursor:pointer;" onclick="Act.setPendFiltro('bloqueiaFechamento', ${!f.bloqueiaFechamento})">
            ${UI.icon('lock',11)} Bloqueia fechamento
          </label>
          ${(f.tipo||f.obraId||f.responsavel||f.prioridade||f.status||f.bloqueiaFechamento||f.busca)? `<button class="btn ghost sm" onclick="Act.limparPendFiltros()">Limpar filtros</button>`:""}
        </div>
      </div>
    `;
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
            <div class="small" style="font-weight:700;color:var(--ink-soft);margin-top:10px;">Fotos de abertura</div>
            ${UI.fotosGaleriaHtml(p.fotosAbertura&&p.fotosAbertura.length?p.fotosAbertura:p.fotos) || `<p class="small muted">Nenhuma foto de abertura.</p>`}
            <div class="small" style="font-weight:700;color:var(--ink-soft);margin-top:10px;">Fotos de resolução</div>
            ${UI.fotosGaleriaHtml(p.fotosResolucao) || `<p class="small muted">Nenhuma foto de resolução${p.status!=='RESOLVIDA'?' — serão exigidas ao marcar como resolvida':''}.</p>`}
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

  M.Pages.pendencias = function(){
    const f = M.UIState.pendFiltro;
    const view = M.UIState.pendView || "lista";
    const nome = M.Store.state.usuarioAtual;
    const colab = M.colabByNome(nome);
    const somenteMinhas = colab && (colab.perfil==="OPERADOR"||colab.perfil==="MONTADOR");
    const filtradas = ordenarPendencias(aplicarFiltros(M.Store.state.pendencias, f, somenteMinhas, nome));
    const bloqueiam = filtradas.filter(p=>p.status!=="RESOLVIDA" && M.bloqueiaFechamento(p.impacto)).length;
    const abertas = filtradas.filter(p=>p.status!=="RESOLVIDA").length;

    const html = `
      <div class="help-banner">${UI.icon('alert',13)} Uma pendência não é uma coluna do quadro — ela existe em paralelo à etapa, com impacto próprio (o que ela trava) e um fluxo operacional (ex.: vidro passa por medir → orçar → pedir → receber → instalar). "Bloqueia fechamento" nunca é escolhido à parte — é sempre consequência do impacto.</div>
      <div class="flex-between" style="flex-wrap:wrap;gap:10px;margin-bottom:4px;">
        <div class="small muted">${abertas} aberta${abertas===1?"":"s"} · ${bloqueiam} bloqueia${bloqueiam===1?"":"m"} fechamento</div>
        <div class="segmented">
          <button class="${view==='lista'?'active':''}" onclick="Act.setPendView('lista')">Lista</button>
          <button class="${view==='kanban'?'active':''}" onclick="Act.setPendView('kanban')">Kanban</button>
        </div>
      </div>
      ${filtrosHtml(f)}
      ${view==='kanban' ? kanbanHtml(filtradas) : (filtradas.length? filtradas.map(linhaLista).join("") : `<p class="small muted">Nenhuma pendência encontrada com esse filtro.</p>`)}
    `;
    return {title: somenteMinhas?"Minhas Pendências":"Pendências", crumb:"Tipo + impacto — bloqueia fechamento é sempre derivado, nunca campo manual", html,
      actionsHtml:`<button class="btn primary" onclick="Act.openPendenciaForm(null,null,null)">${UI.icon('plus',14)} Nova pendência</button>`};
  };

  M.Pages.pendenciaFormHtml = function(obraId, ambienteId, movelId){
    const obras = M.Store.state.obras;
    return `
      <div class="modal-head"><h2>Nova pendência</h2><button class="modal-close" data-close>✕</button></div>
      <form id="formPendencia">
        <div class="modal-body">
          <div class="field"><label>Obra</label>
            <select name="obraId" id="pendObra" required onchange="M.Pages.__refreshPendMoveis(this.value)">
              <option value="">Selecione...</option>
              ${obras.map(o=>`<option value="${o.id}" ${o.id===obraId?'selected':''}>${o.numeroOS} — ${o.cliente}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Móvel afetado (opcional)</label>
            <select name="movelId" id="pendMovel">
              ${M.Store.allMoveis().filter(x=>x.o.id===obraId).map(({a,m})=>`<option value="${m.id}" data-amb="${a.id}" ${m.id===movelId?'selected':''}>${a.nome} — ${m.nome}${m.ressalvaAberta?' — ⚠️ com ressalva':''}</option>`).join("")}
              <option value="" ${!movelId?'selected':''}>— pendência avulsa (sem móvel específico) —</option>
            </select>
          </div>
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
    sel.innerHTML = M.Store.allMoveis().filter(x=>x.o.id===obraId).map(({a,m})=>`<option value="${m.id}" data-amb="${a.id}">${a.nome} — ${m.nome}${m.ressalvaAberta?' — ⚠️ com ressalva':''}</option>`).join("")
      + `<option value="" selected>— pendência avulsa (sem móvel específico) —</option>`;
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
