/* ============================================================
   PÁGINA: Calendário
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  const FILTROS = [
    {key:"PRODUCAO", label:"Produção"}, {key:"ENTREGAS", label:"Entregas"}, {key:"MONTAGENS", label:"Montagens"},
    {key:"PENDENCIAS", label:"Pendências"}, {key:"FORNECEDORES", label:"Fornecedores"}, {key:"ASSISTENCIAS", label:"Assistências"},
  ];

  function eventosDoMes(mes, ano){
    const evts = {}; // dia -> [{label,cls}]
    function add(iso, label, cls){
      const d = new Date(iso+"T00:00:00");
      if(d.getMonth()!==mes || d.getFullYear()!==ano) return;
      (evts[d.getDate()] = evts[d.getDate()]||[]).push({label,cls});
    }
    const ativos = M.UIState.calFiltros;
    M.Store.state.obras.forEach(o=>{
      if(ativos.has("ENTREGAS")) add(o.dataEntregaPrevista, "Entrega — "+o.cliente, "critical");
    });
    if(ativos.has("PRODUCAO")){
      M.Store.allMoveis().forEach(({o,m})=> add(m.dataPrevista, m.nome+" ("+o.cliente+")", ""));
    }
    if(ativos.has("MONTAGENS")){
      M.Store.allMoveis().forEach(({o,m})=>{ if(m.etapa==="MONTAGEM") add(m.dataPrevista, "Montagem — "+o.cliente, "warning"); });
    }
    if(ativos.has("PENDENCIAS")){
      M.Store.state.pendencias.forEach(p=>{ if(p.status!=="RESOLVIDA" && p.prazo) add(p.prazo, "Prazo pendência — "+p.categoria, "warning"); });
    }
    if(ativos.has("FORNECEDORES")){
      M.Store.state.pendencias.forEach(p=>{ if(p.fornecedor && p.status!=="RESOLVIDA" && p.prazo) add(p.prazo, p.fornecedor+" — retorno previsto", ""); });
    }
    if(ativos.has("ASSISTENCIAS")){
      M.Store.state.assistencias.forEach(a=>{ if(a.status!=="CONCLUIDA" && a.prazo) add(a.prazo, "Assistência — "+(a.obraNome||a.cliente||""), "warning"); });
    }
    return evts;
  }

  M.Pages.calendario = function(){
    const mes = M.UIState.calMonth, ano = M.UIState.calYear;
    const first = new Date(ano,mes,1);
    const startDow = first.getDay();
    const dim = new Date(ano,mes+1,0).getDate();
    const monthName = first.toLocaleDateString("pt-BR",{month:"long",year:"numeric"});
    const evts = eventosDoMes(mes,ano);

    let cells = "";
    for(let i=0;i<startDow;i++) cells += `<div class="cal-cell empty"></div>`;
    for(let d=1; d<=dim; d++){
      const isToday = d===M.TODAY.getDate() && mes===M.TODAY.getMonth() && ano===M.TODAY.getFullYear();
      const list = (evts[d]||[]).slice(0,4).map(e=>`<div class="cal-evt ${e.cls}" style="${e.cls?'':'background:var(--brand-wash);color:var(--brand-dark);'}">${UI.esc(e.label)}</div>`).join("");
      cells += `<div class="cal-cell ${isToday?'today':''}"><div class="cal-daynum">${d}</div>${list}</div>`;
    }
    const dows = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map(x=>`<div class="cal-dow">${x}</div>`).join("");

    const html = `
      <div class="card pad" style="margin-bottom:14px;">
        <div class="flex-gap" style="flex-wrap:wrap;">
          ${FILTROS.map(f=>`<button class="chip ${M.UIState.calFiltros.has(f.key)?'brand':'neutral'}" style="cursor:pointer;border:none;" onclick="Act.toggleCalFiltro('${f.key}')">${f.label}</button>`).join("")}
        </div>
      </div>
      <div class="card pad">
        <div class="cal-head">
          <button class="btn-icon" onclick="Act.calNav(-1)">${UI.icon('chevron-left',14)}</button>
          <b style="text-transform:capitalize;">${monthName}</b>
          <button class="btn-icon" onclick="Act.calNav(1)">${UI.icon('chevron-right',14)}</button>
        </div>
        <div class="cal-grid">${dows}${cells}</div>
      </div>
    `;
    return {title:"Calendário", crumb:"Medição, executivo, corte, fornecedores, entregas, montagens e prazos de pendência", html};
  };
})();
