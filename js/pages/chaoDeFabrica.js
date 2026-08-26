/* ============================================================
   PÁGINA: Chão de Fábrica — Modo TV (seções 60-66) — preto/dourado premium
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  function porEtapa(etapaId){
    return M.Store.allMoveis().filter(({m})=>m.etapa===etapaId);
  }

  const ROT_SLOTS = [
    {key:"pendencias", label:"Pendências urgentes", build(){
      return M.Store.state.pendencias.filter(p=>p.status!=="RESOLVIDA" && p.prioridade==="ALTA").slice(0,6)
        .map(p=>({t:p.categoria+" — "+p.obraNome, s:p.descricao}));
    }},
    {key:"retrabalhos", label:"Retrabalhos em aberto", build(){
      return M.Store.allMoveis().flatMap(({o,m})=>m.componentesCriticos.filter(c=>c.status==="REFACAO").map(c=>({t:c.nome+" — "+o.cliente, s:"motivo: "+(c.motivo||"-")})));
    }},
    {key:"assistencias", label:"Assistências abertas", build(){
      return M.Store.state.assistencias.filter(a=>a.status!=="CONCLUIDA").slice(0,6)
        .map(a=>({t:a.categoria+" — "+(a.obraNome||a.cliente||""), s:a.descricao}));
    }},
    {key:"atrasadas", label:"Tarefas paradas há mais tempo", build(){
      return M.Store.allMoveis().filter(({m})=>!C.movelConcluido(m) && C.diasDesde(m.dataEntradaEtapa)>=4).slice(0,6)
        .map(({o,m})=>({t:m.nome+" — "+o.cliente, s:C.diasDesde(m.dataEntradaEtapa)+"d parado em "+M.Store.etapaById(m.etapa).nome}));
    }},
  ];

  M.Pages.chaoDeFabrica = function(){
    const ativos = M.Store.state.tvWidgetsAtivos || {};
    const show = (id)=> ativos[id]!==false;
    const corte = porEtapa("CORTE"), usinagem = porEtapa("USINAGEM"), fitagem = porEtapa("FITAGEM"), preMont = porEtapa("PRE_MONTAGEM");
    // FASE 7.5: rascunho não entra na TV do Chão de Fábrica (item 7).
    const entregas = M.Store.obrasOperacionais().slice().sort((a,b)=> C.diasAte(a.dataEntregaPrevista)-C.diasAte(b.dataEntregaPrevista)).slice(0,5);
    const meta = C.metaMensalProgresso();
    const rotIdx = (M.UIState.tvRotIndex||0) % ROT_SLOTS.length;
    const rotSlot = ROT_SLOTS[rotIdx];
    const rotItens = rotSlot.build();

    const colHtml = (titulo, lista)=> `
      <div class="tv-col">
        <h3>${titulo} <span style="opacity:.55;">${lista.length}</span></h3>
        ${lista.slice(0,6).map(({o,m})=>`<div class="tv-item"><div class="tv-item-title">${UI.esc(o.cliente)}</div><div class="tv-item-sub">${UI.esc(m.nome)}</div></div>`).join("") || `<div class="tv-item-sub" style="opacity:.5;">Nada nesta etapa agora.</div>`}
      </div>`;

    const ringR = 34, ringC = 2*Math.PI*ringR;
    const metaRing = `
      <svg width="90" height="90" viewBox="0 0 90 90">
        <circle cx="45" cy="45" r="${ringR}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="9"/>
        <circle cx="45" cy="45" r="${ringR}" fill="none" stroke="#d4af6e" stroke-width="9" stroke-linecap="round"
          stroke-dasharray="${ringC}" stroke-dashoffset="${ringC*(1-meta.pct/100)}" transform="rotate(-90 45 45)"/>
        <text x="45" y="50" text-anchor="middle" fill="#fff" font-size="18" font-weight="800">${meta.pct}%</text>
      </svg>`;

    const html = `
      <div class="tv-screen">
        <div class="tv-head">
          <div><div class="brandmark">Moodo Produção</div><h1>Chão de Fábrica</h1></div>
          <div style="text-align:right;">
            <div class="tv-clock" id="tvClock"></div>
            <div class="tv-date" id="tvDate"></div>
          </div>
        </div>

        ${show("producao-hoje") ? `<div class="tv-grid" style="margin-bottom:18px;">
          ${colHtml("Corte", corte)}
          ${colHtml("Usinagem", usinagem)}
          ${colHtml("Fitagem", fitagem)}
          ${colHtml("Pré-Montagem", preMont)}
        </div>` : ""}

        <div class="tv-grid">
          ${show("meta-mensal") ? `
          <div class="tv-col">
            <h3>Meta do mês</h3>
            <div class="tv-meta-ring">
              ${metaRing}
              <div>
                <div class="tv-bignum gold" style="font-size:22px;">${C.fmtBRLk(meta.realizado)}</div>
                <div class="tv-sub">de ${C.fmtBRLk(meta.meta)}</div>
              </div>
            </div>
          </div>` : ""}

          <div class="tv-col destaque">
            <h3>${UI.esc(rotSlot.label)}<span>${rotItens.length}</span></h3>
            ${rotItens.length ? rotItens.map(it=>`<div class="tv-item"><div class="tv-item-title">${UI.esc(it.t)}</div><div class="tv-item-sub">${UI.esc(it.s)}</div></div>`).join("")
              : `<div class="tv-item-sub" style="opacity:.6;">Nada nesta categoria agora — tudo em dia.</div>`}
            <div class="tv-dots">${ROT_SLOTS.map((_,i)=>`<span class="d ${i===rotIdx?'active':''}"></span>`).join("")}</div>
          </div>

          ${show("entregas") ? `
          <div class="tv-col" style="grid-column:span 2;">
            <h3>Próximas entregas</h3>
            ${entregas.map(o=>{
              const dias = C.diasAte(o.dataEntregaPrevista);
              return `<div class="tv-item"><div class="tv-item-title">${C.fmtDate(o.dataEntregaPrevista)} — ${UI.esc(o.cliente)}</div>
                <div class="tv-item-sub">${dias<0? `atrasada ${-dias}d`: dias<=2? `em ${dias}d`: `em ${dias} dias`}</div></div>`;
            }).join("")}
          </div>` : ""}
        </div>
      </div>
    `;
    return {html, afterRender(){
      if(window.__tvInterval) clearInterval(window.__tvInterval);
      if(window.__tvRotInterval) clearInterval(window.__tvRotInterval);
      const tick = ()=>{
        const el=document.getElementById("tvClock"); if(el) el.textContent = new Date().toLocaleTimeString("pt-BR");
        const dEl=document.getElementById("tvDate"); if(dEl) dEl.textContent = new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"});
      };
      tick(); window.__tvInterval = setInterval(tick, 1000);
      window.__tvRotInterval = setInterval(()=>{ M.UIState.tvRotIndex = ((M.UIState.tvRotIndex||0)+1) % ROT_SLOTS.length; M.render(); }, 8000);
    }};
  };
})();
