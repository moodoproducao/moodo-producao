/* ============================================================
   PÁGINA: Indicadores mensais
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  // CORREÇÃO (item 10 da lista): antes o link "Indicadores" só sumia do menu
  // pra quem não tinha permissão — quem soubesse o endereço #/indicadores via
  // os números financeiros de qualquer jeito. Agora a própria página bloqueia,
  // igual já era feito em Auditoria.
  M.Pages.indicadores = function(){
    if(!M.Store.pode("verIndicadores")){
      return {title:"Indicadores", html:`<div class="card pad"><p>Seu perfil (<b>${UI.esc(M.Store.perfilAtual().label)}</b>) não tem acesso aos Indicadores.</p></div>`};
    }
    const ind = C.indicadores();
    const obras = M.Store.state.obras;
    const moveis = M.Store.allMoveis();
    const refacoes = M.Store.state.tarefas.filter(t=>t.tipo==="REFACAO"||t.resultado==="GEROU_REFACAO").length;
    const pendAbertas = M.Store.state.pendencias.filter(p=>p.status!=="RESOLVIDA").length;
    const ambientes = obras.reduce((s,o)=>s+o.ambientes.length,0);
    const prazoMedio = Math.round(obras.reduce((s,o)=>s+C.diasAte(o.dataEntregaPrevista),0)/Math.max(1,obras.length));
    const mesLabel = M.TODAY.toLocaleDateString("pt-BR",{month:"long",year:"numeric"});
    const wip = C.wipPorEtapa();
    const maxWip = Math.max(...wip.map(r=>r.valor),1);
    const meta = C.metaMensalProgresso();
    const asst = C.assistenciasResumo();

    const html = `
      <div class="help-banner">${UI.icon('bar-chart',13)} Estes números representam o volume da carteira processada — não são um indicador de eficiência industrial pura (isso viria de dados físicos de máquina, ainda uma fase futura).</div>
      <div class="card-title" style="margin-bottom:2px;text-transform:capitalize;">${mesLabel}</div>
      <div class="stat-row">
        <div class="stat-tile"><div class="label">Carteira liberada</div><div class="value">${C.fmtBRLk(ind.liberado)}</div></div>
        <div class="stat-tile"><div class="label">Produzido</div><div class="value">${C.fmtBRLk(ind.produzido)}</div></div>
        <div class="stat-tile"><div class="label">Entregue</div><div class="value">${C.fmtBRLk(ind.entregue)}</div></div>
        <div class="stat-tile"><div class="label">Montado</div><div class="value">${C.fmtBRLk(ind.montado)}</div></div>
        <div class="stat-tile"><div class="label">Em produção</div><div class="value">${C.fmtBRLk(ind.emProducao)}</div></div>
        <div class="stat-tile"><div class="label">Aguardando montagem</div><div class="value">${C.fmtBRLk(ind.aguardandoMontagem)}</div></div>
      </div>

      <div class="card pad" style="margin-bottom:16px;">
        <div class="card-title">Meta do mês</div>
        <div class="flex-between" style="flex-wrap:wrap;gap:14px;">
          <div><div class="small muted">Meta</div><b style="font-size:18px;">${C.fmtBRLk(meta.meta)}</b></div>
          <div><div class="small muted">Realizado</div><b style="font-size:18px;">${C.fmtBRLk(meta.realizado)}</b></div>
          <div><div class="small muted">Restante</div><b style="font-size:18px;">${C.fmtBRLk(meta.restante)}</b></div>
          <div><div class="small muted">Progresso</div><b style="font-size:18px;color:var(--brand);">${meta.pct}%</b></div>
        </div>
        <div style="margin-top:10px;">${UI.progressBar(meta.pct,"")}</div>
      </div>

      <div class="grid-2">
        <div class="card pad">
          <div class="card-title">WIP — valor parado por etapa (R$)</div>
          ${wip.filter(r=>r.etapa!=="FINALIZADA").map(r=>`
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <div style="width:110px;font-size:11px;color:var(--ink-mute);text-align:right;flex-shrink:0;">${UI.esc(r.label)}</div>
              <div style="flex:1;background:var(--surface-alt);border-radius:4px;height:14px;"><div style="width:${r.valor/maxWip*100}%;height:14px;background:var(--brand);border-radius:4px;"></div></div>
              <div style="width:86px;font-size:11px;text-align:right;color:var(--ink-soft);">${r.qtd} · ${C.fmtBRLk(r.valor)}</div>
            </div>`).join("")}
        </div>
        <div class="card pad">
          <div class="card-title">Outros indicadores do mês</div>
          <table class="tbl">
            <tbody>
              <tr><td>Móveis produzidos (embalados ou além)</td><td class="right"><b>${ind.moveisProduzidos}</b></td></tr>
              <tr><td>Ambientes em produção</td><td class="right"><b>${ambientes}</b></td></tr>
              <tr><td>Obras ativas</td><td class="right"><b>${obras.length}</b></td></tr>
              <tr><td>Tarefas registradas</td><td class="right"><b>${M.Store.state.tarefas.length}</b></td></tr>
              <tr><td>Retrabalhos</td><td class="right"><b class="${refacoes?'critical':''}">${refacoes}</b></td></tr>
              <tr><td>Pendências abertas</td><td class="right"><b class="${pendAbertas?'critical':''}">${pendAbertas}</b></td></tr>
              <tr><td>Assistências abertas</td><td class="right"><b class="${asst.abertas?'critical':''}">${asst.abertas}</b></td></tr>
              <tr><td>Prazo médio até entrega</td><td class="right"><b>${prazoMedio} dias</b></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
    return {title:"Indicadores", crumb:"Carteira processada em R$ e métricas operacionais do mês", html};
  };
})();
