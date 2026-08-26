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

  // Lista "crua" de todos os eventos visíveis (respeitando os filtros ativos),
  // cada um já com a informação de para onde deve levar quando clicado.
  // FASE 4 (§9/§10 handoff): recebe um Set de filtros opcional — desacopla a
  // função do estado de UI da própria tela Calendário (M.UIState.calFiltros),
  // pra Hoje poder reusar sem depender do que a pessoa deixou filtrado lá.
  // Sem argumento, mantém o comportamento antigo (usa o filtro da tela).
  function todosEventosRaw(filtrosSet){
    const raw = [];
    function add(iso, label, cls, obraId, extra){
      if(!iso || !obraId) return;
      raw.push(Object.assign({iso, label, cls, obraId}, extra||{}));
    }
    const ativos = filtrosSet || M.UIState.calFiltros;
    // FASE 7.5: rascunho não entra no Calendário (item 7 do pedido).
    M.Store.obrasOperacionais().forEach(o=>{
      if(ativos.has("ENTREGAS")) add(o.dataEntregaPrevista, "Entrega — "+o.cliente, "critical", o.id, {tipo:"obra"});
    });
    if(ativos.has("PRODUCAO")){
      M.Store.allMoveis().forEach(({o,m})=> add(m.dataPrevista, m.nome+" ("+o.cliente+")", "", o.id, {tipo:"movel", movelId:m.id}));
    }
    if(ativos.has("MONTAGENS")){
      M.Store.allMoveis().forEach(({o,m})=>{ if(m.etapa==="MONTAGEM") add(m.dataPrevista, "Montagem — "+o.cliente, "warning", o.id, {tipo:"movel", movelId:m.id}); });
    }
    if(ativos.has("PENDENCIAS")){
      M.Store.state.pendencias.forEach(p=>{ if(p.status!=="RESOLVIDA" && p.prazo) add(p.prazo, "Prazo pendência — "+p.categoria, "warning", p.obraId, {tipo:"pendencia", tab:"pendencias"}); });
    }
    if(ativos.has("FORNECEDORES")){
      M.Store.state.pendencias.forEach(p=>{ if(p.fornecedor && p.status!=="RESOLVIDA" && p.prazo) add(p.prazo, p.fornecedor+" — retorno previsto", "", p.obraId, {tipo:"pendencia", tab:"pendencias"}); });
    }
    if(ativos.has("ASSISTENCIAS")){
      M.Store.state.assistencias.forEach(a=>{ if(a.status!=="CONCLUIDA" && a.prazo) add(a.prazo, "Assistência — "+(a.obraNome||a.cliente||""), "warning", a.obraId, {tipo:"assistencia", tab:"assistencias"}); });
    }
    // item 9: mesma regra do Kanban — sem verTodasObras, só os eventos das
    // obras onde a pessoa tem algo atribuído.
    if(!M.Store.pode("verTodasObras")){
      const meuObraIds = M.Store.obraIdsDoColaborador(M.Store.state.usuarioAtual);
      return raw.filter(e=> meuObraIds.has(e.obraId));
    }
    return raw;
  }

  function eventosDoMes(mes, ano){
    const evts = {}; // dia -> [evento,...]
    todosEventosRaw().forEach(e=>{
      const d = new Date(e.iso+"T00:00:00");
      if(d.getMonth()!==mes || d.getFullYear()!==ano) return;
      (evts[d.getDate()] = evts[d.getDate()]||[]).push(e);
    });
    return evts;
  }

  // API pública usada pelo modal de "dia" (aberto a partir de Act.abrirDiaCalendario)
  M.Calendario = {
    eventosDoDia(iso){ return todosEventosRaw().filter(e=>e.iso===iso); },
    // FASE 4 (§9/§10 handoff): "próximos compromissos" pra Hoje — mesma fonte
    // de sempre (M.Calendario), sem duplicar lógica de agregação de eventos.
    // filtrosChaves: array de chaves de FILTROS (ex.: ["ENTREGAS","MONTAGENS"]);
    // sem informar, usa todos os tipos.
    proximosEventos(diasAFrente, filtrosChaves){
      const set = filtrosChaves ? new Set(filtrosChaves) : new Set(FILTROS.map(f=>f.key));
      const limite = diasAFrente==null ? Infinity : diasAFrente;
      return todosEventosRaw(set)
        .filter(e=> C.diasAte(e.iso)>=0 && C.diasAte(e.iso)<=limite)
        .sort((a,b)=> a.iso.localeCompare(b.iso));
    },
  };

  M.Pages.calendarioDiaModalHtml = function(iso){
    const eventos = M.Calendario.eventosDoDia(iso);
    const d = new Date(iso+"T00:00:00");
    const dataFmt = d.toLocaleDateString("pt-BR",{weekday:"long", day:"2-digit", month:"long"});
    const rows = eventos.length ? eventos.map(e=>{
      const acao = e.tipo==="movel" ? `Act.openMovel('${e.movelId}')`
        : e.tab ? `Act.setObraTab('${e.obraId}','${e.tab}'); Act.go('#/obra/${e.obraId}')`
        : `Act.go('#/obra/${e.obraId}')`;
      return `<div class="check-row" style="cursor:pointer;" onclick="UI.closeModal(); ${acao}">
        <span class="dot ${e.cls||'neutral'}"></span>
        <span class="label">${UI.esc(e.label)}</span>
      </div>`;
    }).join("") : `<p class="small muted">Nenhum evento neste dia.</p>`;
    return `
      <div class="modal-head"><h2 style="text-transform:capitalize;">${UI.esc(dataFmt)}</h2><button class="modal-close" data-close>✕</button></div>
      <div class="modal-body">${rows}</div>
    `;
  };

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
      const iso = `${ano}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const hoje = new Date(M.todayISO()+"T12:00:00");
      const isToday = d===hoje.getDate() && mes===hoje.getMonth() && ano===hoje.getFullYear();
      const dayEvts = evts[d]||[];
      const list = dayEvts.slice(0,3).map(e=>`<div class="cal-evt ${e.cls}" style="${e.cls?'':'background:var(--brand-wash);color:var(--brand-dark);'}">${UI.esc(e.label)}</div>`).join("");
      const more = dayEvts.length>3 ? `<div class="cal-more">+${dayEvts.length-3} mais</div>` : "";
      cells += `<div class="cal-cell ${isToday?'today':''}" onclick="Act.abrirDiaCalendario('${iso}')"><div class="cal-daynum">${d}</div>${list}${more}</div>`;
    }
    const dows = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map(x=>`<div class="cal-dow">${x}</div>`).join("");

    const html = `
      ${!M.Store.pode("verTodasObras")? `<div class="help-banner">${UI.icon('user',13)} Mostrando só eventos das obras onde você tem tarefa, pendência ou assistência atribuída.</div>`:""}
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
        <div class="cal-scroll"><div class="cal-grid">${dows}${cells}</div></div>
      </div>
    `;
    return {title:"Calendário", crumb:"Medição, executivo, corte, fornecedores, entregas, montagens e prazos de pendência", html};
  };
})();
