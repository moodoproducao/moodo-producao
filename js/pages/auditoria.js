/* ============================================================
   PÁGINA: Auditoria (seções 48-52) — exceções e alterações críticas
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  const TIPO_LABEL = {
    AVANCO_COM_RESSALVA:"Avanço com ressalva", MUDANCA_RESPONSAVEL:"Mudança de responsável",
    PENDENCIA_REABERTA:"Pendência reaberta", RETRABALHO:"Retrabalho", ASSISTENCIA_ABERTA:"Assistência aberta",
    ASSISTENCIA_CONCLUIDA:"Assistência concluída", ALTERACAO_PROCESSO:"Alteração de processo",
    MONTAGEM_COM_PENDENCIA:"Montagem com pendência",
  };

  M.Pages.auditoria = function(){
    if(!M.Store.pode("verAuditoria")){
      return {title:"Auditoria", html:`<div class="card pad"><p>Seu perfil (<b>${UI.esc(M.Store.perfilAtual().label)}</b>) não tem acesso à Auditoria.</p></div>`};
    }
    const filtro = M.UIState.auditoriaFiltro;
    const resumo = C.auditoriaResumo(filtro.periodo);
    let eventos = resumo.eventos;
    if(filtro.categoria) eventos = eventos.filter(e=>e.categoria===filtro.categoria);
    if(filtro.somenteExcecoes) eventos = eventos.filter(e=> e.categoria!=="OPERACIONAL");

    const html = `
      <div class="help-banner">${UI.icon('shield',13)} Registra exceções e alterações críticas — avanços com ressalva, overrides, retrabalhos, assistências e mudanças de processo. O objetivo é identificar falhas de processo, não culpar indivíduos.</div>

      <div class="stat-row">
        <div class="stat-tile"><div class="label">Exceções no período</div><div class="value">${resumo.total}</div></div>
        <div class="stat-tile"><div class="label">Avanços com ressalva</div><div class="value">${resumo.avancosRessalva}</div></div>
        <div class="stat-tile"><div class="label">Pendências vencidas</div><div class="value ${resumo.pendenciasVencidas?'critical':''}">${resumo.pendenciasVencidas}</div></div>
        <div class="stat-tile"><div class="label">Retrabalhos</div><div class="value">${resumo.retrabalhos}</div></div>
        <div class="stat-tile"><div class="label">Assistências abertas</div><div class="value">${resumo.assistencias}</div></div>
        <div class="stat-tile"><div class="label">Alterações críticas (governança)</div><div class="value">${resumo.alteracoesCriticas}</div></div>
      </div>

      <div class="card pad" style="margin-bottom:14px;">
        <div class="flex-gap" style="flex-wrap:wrap;">
          <select onchange="Act.setAuditoriaFiltro('periodo', Number(this.value))">
            <option value="7" ${filtro.periodo===7?'selected':''}>Últimos 7 dias</option>
            <option value="30" ${filtro.periodo===30?'selected':''}>Últimos 30 dias</option>
            <option value="90" ${filtro.periodo===90?'selected':''}>Últimos 90 dias</option>
          </select>
          <select onchange="Act.setAuditoriaFiltro('categoria', this.value)">
            <option value="">Todas as categorias</option>
            <option value="OPERACIONAL" ${filtro.categoria==='OPERACIONAL'?'selected':''}>Operacional</option>
            <option value="QUALIDADE" ${filtro.categoria==='QUALIDADE'?'selected':''}>Qualidade</option>
            <option value="GOVERNANCA" ${filtro.categoria==='GOVERNANCA'?'selected':''}>Governança</option>
          </select>
          <label class="chip ${filtro.somenteExcecoes?'brand':'neutral'}" style="cursor:pointer;" onclick="Act.toggleSomenteExcecoes()">Somente exceções (qualidade/governança)</label>
        </div>
      </div>

      <div class="card pad">
        <div class="card-title">Linha do tempo</div>
        ${eventos.length ? eventos.map(e=>`
          <div class="audit-row">
            <span class="audit-cat ${e.categoria}"></span>
            <div style="flex:1;">
              <div class="flex-between">
                <b>${UI.esc(TIPO_LABEL[e.tipo]||e.tipo)}</b>
                <span class="audit-time">${C.fmtDate(e.data)} ${e.hora||""}</span>
              </div>
              <div class="small">${UI.esc(e.descricao)}</div>
              <div class="small muted">${UI.esc(e.usuario)}${e.motivo && e.motivo!=="-" ? " · motivo: "+UI.esc(e.motivo):""}${e.novoResponsavel? " · novo responsável: "+UI.esc(e.novoResponsavel):""}${e.novoPrazo? " · novo prazo: "+C.fmtDate(e.novoPrazo):""}</div>
            </div>
          </div>`).join("") : `<p class="small muted">Nenhum evento de auditoria no período selecionado.</p>`}
      </div>
    `;
    return {title:"Auditoria", crumb:"Exceções, overrides e alterações críticas", html};
  };
})();
