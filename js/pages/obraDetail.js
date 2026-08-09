/* ============================================================
   PÁGINA: Detalhe da Obra (abas)
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  const TABS = [
    {key:"geral", label:"Visão Geral"},
    {key:"ambientes", label:"Ambientes"},
    {key:"tarefas", label:"Tarefas"},
    {key:"pendencias", label:"Pendências"},
    {key:"assistencias", label:"Assistências"},
    {key:"cronograma", label:"Cronograma"},
    {key:"arquivos", label:"Arquivos"},
    {key:"historico", label:"Histórico"},
  ];

  function tabAssistencias(o){
    const list = M.Store.state.assistencias.filter(a=>a.obraId===o.id);
    if(!list.length) return `<p class="small muted">Nenhuma assistência registrada nesta obra.</p>`;
    return `<div class="card pad"><table class="tbl">
      <thead><tr><th>Descrição</th><th>Categoria</th><th>Origem</th><th>Responsável</th><th>Prazo</th><th>Status</th></tr></thead>
      <tbody>${list.map(a=>`
        <tr><td><b>${UI.esc(a.descricao)}</b><div class="small muted">${UI.esc(a.ambienteNome||"")} · ${UI.esc(a.movelNome||"")}</div></td>
          <td>${UI.esc(a.categoria)}</td><td class="small muted">${UI.esc(a.origem||"—")}</td>
          <td>${UI.person(a.responsavel)}</td><td>${a.prazo?C.fmtDate(a.prazo):"—"}</td><td>${UI.assistenciaStatusChip(a.status)}</td>
        </tr>`).join("")}</tbody></table></div>`;
  }

  function tabGeral(o){
    const prog = C.progressoObra(o);
    const risco = C.riscoObra(o);
    const faltam = C.paraFinalizar(o);
    return `
      <div class="grid-2">
        <div class="card pad">
          <div class="card-title">Rateio bruto → líquido</div>
          <table class="tbl">
            <thead><tr><th>Ambiente</th><th>Bruto</th><th>Líquido</th></tr></thead>
            <tbody>
              ${o.ambientes.map(a=>`<tr><td>${UI.esc(a.nome)}</td><td>${C.fmtBRL(a.valorBruto)}</td><td>${C.fmtBRL(a.valorLiquido)}</td></tr>`).join("")}
              <tr style="font-weight:700;"><td>Total</td><td>${C.fmtBRL(o.valorBruto)}</td><td>${C.fmtBRL(o.valorLiquido)}</td></tr>
            </tbody>
          </table>
          <p class="small muted" style="margin-top:8px;">Desconto aplicado: ${C.fmtBRL(o.desconto)} (${Math.round(o.descontoPct*10000)/100}%)</p>
        </div>
        <div class="card pad">
          <div class="card-title">O que falta para finalizar</div>
          ${faltam.length ? faltam.map(g=>`
            <div style="margin-bottom:10px;">
              <div class="small" style="font-weight:700;color:var(--ink-soft);">${UI.esc(g.ambienteNome)}</div>
              <ul style="margin:2px 0 0 18px; font-size:12.5px; line-height:2;">${g.itens.map(f=>`<li>${UI.esc(f)}</li>`).join("")}</ul>
            </div>`).join("") : `<p class="small muted">Nada pendente — obra pronta para finalizar.</p>`}
          ${o.fichaTecnica ? `<div class="hr"></div><div class="card-title" style="margin-bottom:8px;">Ficha técnica (lista de materiais)</div>
            <p class="small">${o.fichaTecnica.chapasMDF} chapas de MDF (~${o.fichaTecnica.m2MDF} m²) · ~${o.fichaTecnica.metrosFitagem} m de fitagem</p>
            <p class="small muted">Componentes: ${o.fichaTecnica.componentes.join(", ")}</p>
            <p class="small muted" style="margin-top:6px;">Leitura completa da lista de materiais é uma fase futura — hoje esses dados vêm como ficha de referência.</p>` : ""}
        </div>
      </div>
    `;
  }

  function tabAmbientes(o){
    return o.ambientes.map(a=>{
      const prog = C.progressoAmbiente(a);
      return `<div class="card pad" style="margin-bottom:12px;">
        <div class="flex-between"><b>${UI.esc(a.nome)}</b><span class="small muted">${C.fmtBRL(a.valorLiquido)} · ${prog.pct}%</span></div>
        ${UI.progressBar(prog.pct)}
        <div style="margin-top:10px;">
          ${a.moveis.map(m=>`
            <div class="check-row" style="cursor:pointer;" onclick="Act.openMovel('${m.id}')">
              <span class="dot ${m.bloqueio?'critical':C.movelConcluido(m)?'good':'neutral'}"></span>
              <span class="label"><b>${UI.esc(m.nome)}</b> <span class="chip neutral" style="margin-left:4px;">${UI.esc(M.Store.etapaById(m.etapa).nome)}</span>
                <div class="small muted">resp. ${UI.esc(m.responsavel)} · ${C.fmtBRL(m.valorLiquido)}${m.bloqueio? " · ⏳ "+UI.esc(m.bloqueio.categoria):""}</div></span>
            </div>`).join("")}
        </div>
      </div>`;
    }).join("");
  }

  function tabTarefas(o){
    const tarefas = M.Store.state.tarefas.filter(t=>t.obraId===o.id);
    return `
      <div class="flex-between" style="margin-bottom:10px;"><span class="small muted">${tarefas.length} tarefa(s)</span>
        <button class="btn sm primary" onclick="Act.openTarefaForm('${o.id}')">+ Nova tarefa</button></div>
      <div class="card pad">
        <table class="tbl">
          <thead><tr><th>Tarefa</th><th>Local</th><th>Responsável</th><th>Executor</th><th>Status</th><th>Resultado</th><th></th></tr></thead>
          <tbody>${tarefas.map(t=>`
            <tr>
              <td>${UI.esc(t.titulo)}${t.tipo==='REFACAO'?' <span class="chip critical">retrabalho</span>':''}</td>
              <td class="small muted">${t.movelNome||t.ambienteNome||"—"}</td>
              <td>${UI.person(t.responsavelPlanejado)}</td>
              <td>${t.executadoPor? UI.person(t.executadoPor) : '<span class="small muted">—</span>'}</td>
              <td>${UI.tarefaStatusChip(t.status)}</td>
              <td>${UI.resultadoChip(t.resultado)}</td>
              <td>${t.status==='PLANEJADA'? `<button class="btn sm" onclick="Act.iniciarTarefa('${t.id}')">Iniciar</button>`
                  : t.status==='EM_ANDAMENTO'? `<button class="btn sm primary" onclick="Act.pedirResultado('${t.id}')">Concluir</button>` : ""}</td>
            </tr>`).join("")}</tbody>
        </table>
      </div>`;
  }

  function tabPendencias(o){
    const pend = M.Store.state.pendencias.filter(p=>p.obraId===o.id);
    if(!pend.length) return `<p class="small muted">Nenhuma pendência nesta obra.</p>`;
    return `<div class="card pad"><table class="tbl">
      <thead><tr><th>Categoria</th><th>Local</th><th>Responsável</th><th>Prazo</th><th>Status</th><th></th></tr></thead>
      <tbody>${pend.map(p=>`
        <tr><td>${UI.esc(p.categoria)}<div class="small muted">${UI.esc(p.descricao)}</div></td>
          <td class="small muted">${UI.esc(p.ambienteNome)} · ${UI.esc(p.movelNome)}</td>
          <td>${UI.person(p.responsavel)}</td><td>${C.fmtDate(p.prazo)}</td><td>${UI.statusPendenciaChip(p.status)}</td>
          <td>${p.status!=='RESOLVIDA'? `<button class="btn sm primary" onclick="Act.setPendenciaStatus('${p.id}','RESOLVIDA')">Resolver</button>`:""}</td>
        </tr>`).join("")}</tbody></table></div>`;
  }

  function tabCronograma(o){
    const rows = o.ambientes.flatMap(a=>a.moveis.map(m=>({a,m})));
    return `<div class="card pad"><table class="tbl">
      <thead><tr><th>Móvel</th><th>Etapa atual</th><th>Previsto</th><th>Real</th><th>Status</th></tr></thead>
      <tbody>${rows.map(({a,m})=>{
        const atraso = !m.dataReal && C.diasAte(m.dataPrevista) < 0 && !C.movelConcluido(m);
        return `<tr><td><b>${UI.esc(m.nome)}</b><div class="small muted">${UI.esc(a.nome)}</div></td>
          <td>${UI.esc(M.Store.etapaById(m.etapa).nome)}</td><td>${C.fmtDate(m.dataPrevista)}</td><td>${m.dataReal? C.fmtDate(m.dataReal):"—"}</td>
          <td>${atraso? `<span class="chip critical">atrasado ${-C.diasAte(m.dataPrevista)}d</span>` : `<span class="chip good">no prazo</span>`}</td>
        </tr>`;
      }).join("")}</tbody></table></div>`;
  }

  function tabArquivos(o){
    return `<div class="card pad">
      <div class="check-row"><span>${UI.icon('file-text',15)}</span><span class="label">${o.numeroOS.replace(/\s/g,"_")}.pdf <span class="small muted">— Ordem de Serviço original</span></span></div>
      <div class="check-row"><span>${UI.icon('file-text',15)}</span><span class="label">Orcamento_${o.numeroOS.replace(/[^\d]/g,"")}.pdf <span class="small muted">— Orçamento aprovado</span></span></div>
      <div class="hr"></div>
      <p class="small muted">Lista de materiais / lista de compras em PDF é uma integração de fase futura — quando disponível, aparecerá aqui vinculada à obra.</p>
    </div>`;
  }

  function tabHistorico(o){
    const hist = M.Store.state.historico.filter(h=>h.obraId===o.id);
    if(!hist.length) return `<p class="small muted">Sem eventos registrados ainda.</p>`;
    return `<div class="card pad">${hist.map(h=>`
      <div class="check-row"><span class="dot neutral"></span><span class="label"><b>${UI.esc(h.tipo.replace(/_/g," "))}</b> — ${UI.esc(h.descricao)}
        <div class="small muted">${new Date(h.data).toLocaleString("pt-BR")} · ${UI.esc(h.usuario)}</div></span></div>`).join("")}</div>`;
  }

  M.Pages.obraDetail = function(id){
    const o = M.Store.getObra(id);
    if(!o) return {title:"Obra não encontrada", html:`<p>Obra não encontrada. <a href="#/obras">Voltar</a></p>`};
    const tab = M.UIState.obraTab[o.id] || "geral";
    const prog = C.progressoObra(o);
    const risco = C.riscoObra(o);

    const header = `
      <div class="card pad" style="margin-bottom:16px;">
        <div class="flex-between" style="flex-wrap:wrap;gap:12px;">
          <div>
            <div class="small muted">${o.numeroOS} · ${UI.esc(o.endereco||"")}</div>
            <h2 style="font-size:19px;">${UI.esc(o.cliente)}</h2>
          </div>
          <div class="flex-gap" style="gap:18px;flex-wrap:wrap;">
            <div><div class="small muted">Valor líquido</div><b>${C.fmtBRL(o.valorLiquido)}</b></div>
            <div><div class="small muted">Progresso</div><b>${prog.pct}%</b></div>
            <div><div class="small muted">Entrega</div><b>${C.fmtDate(o.dataEntregaPrevista)}</b></div>
            <div><div class="small muted">Risco</div>${UI.riscoChip(risco.nivel)}</div>
          </div>
        </div>
        <div style="margin-top:10px;">${UI.progressBar(prog.pct)}</div>
      </div>
      <div class="tabs">${TABS.map(t=>`<div class="tab ${t.key===tab?'active':''}" onclick="Act.setObraTab('${o.id}','${t.key}')">${t.label}</div>`).join("")}</div>
    `;

    const bodies = {geral:tabGeral, ambientes:tabAmbientes, tarefas:tabTarefas, pendencias:tabPendencias, assistencias:tabAssistencias, cronograma:tabCronograma, arquivos:tabArquivos, historico:tabHistorico};
    const body = bodies[tab](o);

    return {title:o.cliente, crumb:`<a href="#/obras">Obras</a> / ${o.numeroOS}`, html: header + body,
      actionsHtml:`<button class="btn sm" onclick="Act.openPendenciaForm('${o.id}')">+ Pendência</button> <button class="btn sm" onclick="Act.openTarefaForm('${o.id}')">+ Tarefa</button> <button class="btn sm" onclick="Act.openAssistenciaForm('${o.id}')">+ Assistência</button>`};
  };
})();
