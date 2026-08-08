/* ============================================================
   PÁGINA: Pendências — paralelas ao fluxo, com etapa/próxima ação
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

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

  M.Pages.pendencias = function(){
    const f = M.UIState.pendFiltro;
    const nome = M.Store.state.usuarioAtual;
    const colab = M.colabByNome(nome);
    const somenteMinhas = colab && (colab.perfil==="OPERADOR"||colab.perfil==="MONTADOR");
    let pend = M.Store.state.pendencias.slice();
    if(somenteMinhas) pend = pend.filter(p=>p.responsavel===nome);
    if(f.categoria) pend = pend.filter(p=>p.categoria===f.categoria);
    if(f.status) pend = pend.filter(p=>p.status===f.status);
    pend.sort((a,b)=> C.diasAte(a.prazo||"2099-01-01") - C.diasAte(b.prazo||"2099-01-01"));

    const rows = pend.map(p=>{
      const dias = C.diasDesde(p.abertura);
      const expandido = M.UIState.pendExpandido===p.id;
      const proximaAcao = p.status!=="RESOLVIDA" && p.fluxoPassos ? p.fluxoPassos[p.passoAtual] : null;
      return `<div class="card pad" style="margin-bottom:10px;cursor:pointer;" onclick="Act.togglePendExpandido('${p.id}')">
        <div class="flex-between" style="flex-wrap:wrap;gap:8px;">
          <div>
            <div class="small muted">${UI.esc(p.categoria)} · <a href="#/obra/${p.obraId}" onclick="event.stopPropagation()">${UI.esc(p.obraNome)}</a> · ${UI.esc(p.ambienteNome||"")} ${p.movelNome?"· "+UI.esc(p.movelNome):""}</div>
            <b>${UI.esc(p.descricao)}</b>
          </div>
          <div class="flex-gap" style="gap:8px;">
            ${UI.prioridadeChip(p.prioridade)}
            ${UI.statusPendenciaChip(p.status)}
            <span class="chip ${dias>=5?'critical':dias>=2?'warning':'neutral'}">${dias}d em aberto</span>
          </div>
        </div>
        ${proximaAcao? `<div class="next-action"><div class="lbl">Próxima ação</div><div class="txt">${UI.esc(proximaAcao)} — ${UI.person(p.responsavel)} ${p.prazo?" · prazo "+C.fmtDate(p.prazo):""}</div></div>`:""}
        ${expandido ? `
          ${fluxoStepsHtml(p,false)}
          <div class="flex-gap" style="margin-top:12px;flex-wrap:wrap;" onclick="event.stopPropagation()">
            ${p.status!=="RESOLVIDA"? `<button class="btn sm primary" onclick="Act.avancarFluxo('${p.id}')">${UI.icon('chevron-right',12)} Continuar fluxo</button>`:""}
            ${p.status!=="RESOLVIDA"? `<button class="btn sm" onclick="Act.setPendenciaStatus('${p.id}','RESOLVIDA')">Marcar resolvida</button>`:""}
            ${p.status==="RESOLVIDA"? `<button class="btn sm" onclick="Act.reabrirPendencia('${p.id}')">Reabrir</button>`:""}
          </div>
        ` : fluxoStepsHtml(p,true)}
      </div>`;
    }).join("");

    const html = `
      <div class="help-banner">${UI.icon('alert',13)} Uma pendência não é uma coluna do quadro — ela existe em paralelo à etapa, com um fluxo operacional próprio (ex.: vidro passa por medir → orçar → pedir → receber → instalar). O móvel continua na etapa normal do kanban até a pendência ser resolvida.</div>
      <div class="card pad" style="margin-bottom:14px;">
        <div class="flex-gap" style="flex-wrap:wrap;">
          <select onchange="Act.setPendFiltro('categoria',this.value)">
            <option value="">Todas as categorias</option>
            ${M.CATEGORIAS_PENDENCIA.map(c=>`<option ${f.categoria===c?'selected':''}>${c}</option>`).join("")}
          </select>
          <select onchange="Act.setPendFiltro('status',this.value)">
            <option value="">Todos os status</option>
            <option value="ABERTA" ${f.status==='ABERTA'?'selected':''}>Aberta</option>
            <option value="EM_COBRANCA" ${f.status==='EM_COBRANCA'?'selected':''}>Em cobrança</option>
            <option value="RESOLVIDA" ${f.status==='RESOLVIDA'?'selected':''}>Resolvida</option>
          </select>
        </div>
      </div>
      ${rows || `<p class="small muted">Nenhuma pendência encontrada com esse filtro.</p>`}
    `;
    return {title: somenteMinhas?"Minhas Pendências":"Pendências", crumb:"Categorizadas, com fluxo operacional e próxima ação", html,
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
              <option value="">— pendência avulsa —</option>
              ${M.Store.allMoveis().filter(x=>x.o.id===obraId).map(({a,m})=>`<option value="${m.id}" data-amb="${a.id}" ${m.id===movelId?'selected':''}>${a.nome} — ${m.nome}</option>`).join("")}
            </select>
          </div>
          <input type="hidden" name="ambienteId" id="pendAmbienteId" value="${ambienteId||''}">
          <div class="field-row">
            <div class="field"><label>Categoria</label>
              <select name="categoria" required>${M.CATEGORIAS_PENDENCIA.map(c=>`<option>${c}</option>`).join("")}</select>
            </div>
            <div class="field"><label>Origem do problema</label>
              <select name="origem"><option value="">—</option>${M.ORIGENS_PROBLEMA.map(o=>`<option>${o}</option>`).join("")}</select>
            </div>
          </div>
          <div class="field"><label>Descrição</label><textarea name="descricao" required placeholder="Descreva o que está faltando ou o problema"></textarea></div>
          <div class="field"><label>Descrição livre (se pendência avulsa, sem móvel)</label><input name="descricaoLivre" placeholder="Ex: Item avulso"></div>
          <div class="field-row">
            <div class="field"><label>Responsável pela cobrança</label><select name="responsavel">${M.COLABORADORES.map(c=>`<option>${c.nome}</option>`).join("")}</select></div>
            <div class="field"><label>Fornecedor (se houver)</label><input name="fornecedor" placeholder="Ex: Vidraçaria Pontal"></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Prazo</label><input type="date" name="prazo"></div>
            <div class="field"><label>Prioridade</label><select name="prioridade"><option value="ALTA">Alta</option><option value="MEDIA" selected>Média</option><option value="BAIXA">Baixa</option></select></div>
          </div>
        </div>
        <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Criar pendência</button></div>
      </form>`;
  };
  M.Pages.__refreshPendMoveis = function(obraId){
    const sel = document.getElementById("pendMovel");
    sel.innerHTML = `<option value="">— pendência avulsa —</option>` +
      M.Store.allMoveis().filter(x=>x.o.id===obraId).map(({a,m})=>`<option value="${m.id}" data-amb="${a.id}">${a.nome} — ${m.nome}</option>`).join("");
  };
})();
