/* ============================================================
   PÁGINA: Dashboard — responde às 10 perguntas operacionais (seção 58)
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  function attentionTag(a){
    if(a.tipo==="URGENTE" || a.tipo==="REFACAO") return {tag:"Crítico", tone:"critical"};
    if(a.tipo==="ATRASO") return {tag:"Atenção", tone:"warning"};
    if(a.tipo==="PENDENCIA") return {tag:"Pendência", tone:"info"};
    if(a.tipo==="ENTREGA") return a.sev==="critical" ? {tag:"Crítico", tone:"critical"} : {tag:"Atenção", tone:"warning"};
    return {tag:"Info", tone:"neutral"};
  }

  M.Pages.dashboard = function(){
    const obras = M.Store.state.obras;
    const moveis = M.Store.allMoveis();
    const ind = C.indicadores();
    const meta = C.metaMensalProgresso();
    const asst = C.assistenciasResumo();
    const pendAbertas = M.Store.state.pendencias.filter(p=>p.status!=="RESOLVIDA");
    const bloqueados = moveis.filter(x=>M.Store.bloqueiosMovel(x.m.id).length).length;
    const entregas7 = obras.filter(o=> C.diasAte(o.dataEntregaPrevista)>=0 && C.diasAte(o.dataEntregaPrevista)<=7);
    const montagens7 = moveis.filter(({m})=> m.etapa==="MONTAGEM");
    const alerts = C.alertasGlobais().slice(0,8);
    const emAndamento = M.Store.state.tarefas.filter(t=>t.status==="EM_ANDAMENTO");
    const assistAtencao = M.Store.state.assistencias.filter(a=> a.status!=="CONCLUIDA" && (a.prazo? C.diasAte(a.prazo)<=2 : a.prioridade==="ALTA"));
    const prodHoje = C.producaoHoje();
    const wip = C.wipPorEtapa().filter(r=>r.etapa!=="FINALIZADA");
    const maxWip = Math.max(...wip.map(r=>r.qtd),1);

    const riscoRows = obras.map(o=>({o, risco:C.situacaoObra(o)}))
      .sort((a,b)=> ({ALTO:0,MEDIO:1,BAIXO:2}[a.risco.nivel]) - ({ALTO:0,MEDIO:1,BAIXO:2}[b.risco.nivel]));

    const html = `
      <div class="stat-row">
        ${UI.statTile({icon:'building', label:'Obras ativas', value:obras.length})}
        ${UI.statTile({icon:'kanban', label:'Em produção agora', value:moveis.filter(x=>!C.movelConcluido(x.m)).length})}
        ${M.Store.pode('verValores')
          ? UI.statTile({icon:'bar-chart', label:'R$ produzido no mês', value:C.fmtBRLk(ind.produzido), sub:`${meta.pct}% da meta de ${C.fmtBRLk(meta.meta)}`})
          : UI.statTile({icon:'bar-chart', label:'R$ produzido no mês', value:'•••••', sub:'seu perfil não vê valores'})}
        ${UI.statTile({icon:'lock', label:'Bloqueios ativos', value:bloqueados, critical:!!bloqueados})}
        ${UI.statTile({icon:'alert', label:'Pendências abertas', value:pendAbertas.length, critical:!!pendAbertas.length})}
        ${UI.statTile({icon:'truck', label:'Entregas em 7 dias', value:entregas7.length})}
        ${UI.statTile({icon:'wrench', label:'Em montagem agora', value:montagens7.length})}
        ${UI.statTile({icon:'lifebuoy', label:'Assistências que precisam atenção', value:assistAtencao.length, critical:!!assistAtencao.length})}
      </div>

      <div class="grid-2">
        ${UI.card({
          title:"Produção de hoje",
          right: prodHoje.rows.length? `<span style="color:var(--good);font-weight:700;">${prodHoje.pctGeral}% concluído</span>` : "",
          body: prodHoje.rows.length
            ? prodHoje.rows.map(r=> UI.progressRow({label:r.label, done:r.concluidas, total:r.total, tone:"good"})).join("")
            : `<p class="small muted">Nenhuma tarefa registrada para hoje.</p>`
        })}
        ${UI.card({
          title:"Atenção",
          body: alerts.length
            ? alerts.map(a=>{ const t=attentionTag(a); return UI.attentionItem({tone:t.tone, tag:t.tag, title:a.texto, sub:a.sub}); }).join("")
            : `<p class="small muted">Nenhum alerta no momento.</p>`
        })}
      </div>

      <div class="hr"></div>

      <div class="grid-2">
        <div class="card pad">
          <div class="card-title">Obras em risco <a href="#/obras" class="btn ghost sm">ver todas</a></div>
          ${riscoRows.map(({o,risco})=>`
            <div class="risk-card" style="margin-bottom:10px;">
              <div class="flex-between">
                <div><b>${UI.esc(o.cliente)}</b><div class="small muted">${o.numeroOS}</div></div>
                ${UI.riscoChip(risco)}
              </div>
              <div class="risk-bar"><div style="width:${risco.progresso}%;height:100%;background:var(--${risco.tone});border-radius:var(--radius-sm);"></div></div>
              <div class="flex-between small muted">
                <span>${risco.progresso}% concluído</span>
                <span>${risco.pendencias} pendência(s) · ${risco.diasEntrega<0? `${-risco.diasEntrega}d atrasada`: `entrega em ${risco.diasEntrega}d`}</span>
              </div>
              <a href="#/obra/${o.id}" class="btn ghost sm" style="margin-top:8px;">Abrir obra →</a>
            </div>
          `).join("")}
        </div>

        <div class="card pad">
          <div class="card-title">Quem está executando o quê agora</div>
          ${emAndamento.length ? emAndamento.map(t=>`
            <div class="alert-item">
              ${UI.person(t.executadoPor||t.responsavelPlanejado)}
              <div><div>${UI.esc(t.titulo)}</div><div class="alert-sub">${t.obraNome}${t.movelNome? " · "+t.movelNome:""}${t.etapa? " · "+ M.Store.etapaById(t.etapa).nome:""}</div></div>
            </div>`).join("") : `<p class="small muted">Ninguém com tarefa em andamento agora.</p>`}
        </div>
      </div>

      <div class="hr"></div>

      <div class="grid-2">
        ${UI.card({
          title:"O que deveria estar sendo produzido agora (WIP por etapa)",
          body: wip.map(r=>`<div class="progress-row">
              <div class="pr-label">${UI.esc(r.label)}</div>
              <div class="progress thin"><div style="width:${Math.round(r.qtd/maxWip*100)}%"></div></div>
              <div class="pr-pct" style="width:auto;white-space:nowrap;">${r.qtd}${M.Store.pode('verValores')?` · ${C.fmtBRLk(r.valor)}`:''}</div>
            </div>`).join("")
        })}
        ${UI.card({
          title:"Meta do mês",
          body: M.Store.pode('verValores') ? `
            <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:10px;">
              <div style="font-size:26px;font-weight:800;letter-spacing:-0.02em;">${C.fmtBRLk(meta.realizado)}</div>
              <div class="small muted">de ${C.fmtBRLk(meta.meta)}</div>
            </div>
            ${UI.progressBar(meta.pct,"good")}
            <div class="small muted" style="margin-top:8px;">${meta.pct}% realizado${meta.restante? ` · faltam ${C.fmtBRLk(meta.restante)} para a meta`:""}</div>
            <div class="flex-between" style="margin-top:16px;">
              <div><div style="font-size:16px;font-weight:800;">${C.fmtBRLk(ind.produzido)}</div><div class="small muted">Produzido</div></div>
              <div><div style="font-size:16px;font-weight:800;">${C.fmtBRLk(ind.entregue)}</div><div class="small muted">Entregue</div></div>
              <div><div style="font-size:16px;font-weight:800;">${C.fmtBRLk(ind.montado)}</div><div class="small muted">Montado</div></div>
            </div>
          ` : `
            ${UI.progressBar(meta.pct,"good")}
            <p class="small muted" style="margin-top:10px;">${meta.pct}% da meta do mês — seu perfil não vê os valores em R$.</p>
          `
        })}
      </div>
    `;
    return {title:"Dashboard", crumb:"O que está acontecendo agora na produção", html,
      actionsHtml:`${UI.pageSearchInput({id:'dashSearch', placeholder:'Buscar obra, cliente, OS...'})} ${UI.botaoNovaObraHtml()} <a href="#/chao-de-fabrica" class="btn hide-tv">${UI.icon('tv',14)} Modo TV</a>`,
      afterRender(){
        UI.attachQuickSearch('dashSearch', obras.map(o=>({label:o.cliente, sub:o.numeroOS, href:`#/obra/${o.id}`})));
      }
    };
  };
})();
