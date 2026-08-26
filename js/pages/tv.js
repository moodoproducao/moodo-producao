/* ============================================================
   PÁGINA: TV (Fase 6 — handoff seções TV) — painel de parede, 3 modos
   rotativos a cada 30s: Produção · Montagem · Atenção.
   Rota NOVA (#/tv), somada ao Chão de Fábrica (#/chao-de-fabrica) já
   existente — o TV antigo continua funcionando sem alterações, este é
   um painel adicional fiel ao wireframe do handoff (preto/fundo, texto
   grande, leitura a distância, zero dado sensível de cliente/valor).
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  const MODOS = ["producao", "montagem", "atencao"];
  const MODO_LABEL = {producao:"Produção", montagem:"Montagem", atencao:"Atenção"};

  function head(titulo){
    return `
      <div class="tv3-head">
        <div><div class="brandmark">Moodo Produção</div><h1>${UI.esc(titulo)}</h1></div>
        <div style="text-align:right;">
          <div class="tv-clock" id="tvClock"></div>
          <div class="tv-date" id="tvDate"></div>
        </div>
      </div>`;
  }

  function modosStrip(ativo){
    return `<div class="tv3-modos">${MODOS.map(m=>`<span class="tv3-modo ${m===ativo?'active':''}">${MODO_LABEL[m]}</span>`).join("")}</div>`;
  }

  // ---------- Modo 1: Produção ----------
  function telaProducao(){
    const r = C.tvResumoProducao();
    const kpis = [
      {value:r.emProducao, label:"Em produção", tone:""},
      {value:r.emRisco, label:"Em risco", tone: r.emRisco?"warning":""},
      {value:r.paradas, label:"Paradas", tone: r.paradas?"critical":""},
      {value:r.entregas7d, label:"Entregas em 7 dias", tone: r.entregas7d?"info":""},
    ];
    return `
      <div class="tv3-screen">
        ${head("Produção")}
        <div class="tv3-kpi-row">
          ${kpis.map(k=>`<div class="tv3-kpi"><div class="value ${k.tone}">${k.value}</div><div class="label">${UI.esc(k.label)}</div></div>`).join("")}
        </div>
        <div class="tv3-list-title">Prioridades do dia ${r.prioridades.length? `<span style="opacity:.55;">${r.prioridades.length}</span>`:""}</div>
        ${r.prioridades.length ? r.prioridades.map(p=>`
          <div class="tv3-list-item"><div class="obra">${UI.esc(p.numeroOS)}</div><div class="motivo">${UI.esc(p.motivo)}</div></div>
        `).join("") : `<div class="tv3-list-item"><div class="motivo" style="text-align:left;opacity:.6;">Nada exigindo ação agora — tudo em dia.</div></div>`}
        ${modosStrip("producao")}
        <div class="tv3-disclaimer">Sem dado de cliente, valor ou contato nesta tela · identificação por número de OS</div>
      </div>`;
  }

  // ---------- Modo 2: Montagem ----------
  function telaMontagem(){
    // FASE 7.5: rascunho não aparece na TV (item 7 do pedido).
    const obras = M.Store.obrasOperacionais();
    const agg = C.agregarMontagem(obras);
    const fila = C.prioridadeParaFinalizar(obras).slice(0,4);
    // "Oportunidade": fechamento projetado se a fila de prioridade (poucos
    // itens faltando) fosse concluída hoje — dá ao chão de fábrica um alvo
    // concreto e alcançável, não só o número frio de hoje.
    const projFinalizados = Math.min(agg.ambientesTotal, agg.ambientesFinalizados + fila.length);
    const oportunidadePct = agg.ambientesTotal ? Math.round(100*projFinalizados/agg.ambientesTotal) : agg.fechamento;
    return `
      <div class="tv3-screen">
        ${head("Montagem")}
        <div class="tv3-split">
          <div>
            <div class="tv3-list-title">Prioridade para finalizar ${fila.length? `<span style="opacity:.55;">${fila.length}</span>`:""}</div>
            ${fila.length ? fila.map(l=>`
              <div class="tv3-list-item"><div class="obra">${UI.esc(l.a.nome)}</div><div class="motivo">${l.itensFaltando} item(ns) faltando · ${l.pct}%</div></div>
            `).join("") : `<div class="tv3-list-item"><div class="motivo" style="text-align:left;opacity:.6;">Nenhum ambiente perto do fechamento agora.</div></div>`}
          </div>
          <div class="tv3-bigpct">
            <div class="value">${oportunidadePct}%</div>
            <div class="label">Oportunidade de fechamento hoje</div>
            <div style="margin-top:18px;font-size:13px;color:#c9b8a4;">Fechamento atual: ${agg.fechamento}% · Físico: ${agg.fisico}%</div>
          </div>
        </div>
        ${modosStrip("montagem")}
        <div class="tv3-disclaimer">Sem dado de cliente, valor ou contato nesta tela · identificação por ambiente</div>
      </div>`;
  }

  // ---------- Modo 3: Atenção ----------
  function telaAtencao(){
    const itens = C.tvAtencaoItens();
    return `
      <div class="tv3-screen">
        ${head("Atenção")}
        <div class="tv3-list-title">O que está travando o fechamento agora ${itens.length? `<span style="opacity:.55;">${itens.length}</span>`:""}</div>
        ${itens.length ? itens.map(it=>`
          <div class="tv3-list-item">
            <div class="obra">${UI.esc(it.obraLabel)}</div>
            <div class="motivo">${UI.esc(it.local||it.descricao)} · resp. ${UI.esc(it.funcao)} · ${UI.esc(it.prazoTxt)}</div>
          </div>
        `).join("") : `<div class="tv3-list-item"><div class="motivo" style="text-align:left;opacity:.6;">Nada travando o fechamento agora.</div></div>`}
        ${modosStrip("atencao")}
        <div class="tv3-disclaimer">Sem dado de cliente, valor ou contato nesta tela · responsável identificado só pela função</div>
      </div>`;
  }

  M.Pages.tv = function(){
    const idx = (M.UIState.tvModoIndex||0) % MODOS.length;
    const modo = MODOS[idx];
    const html = modo==="producao" ? telaProducao() : modo==="montagem" ? telaMontagem() : telaAtencao();
    return {html, afterRender(){
      if(window.__tv3Interval) clearInterval(window.__tv3Interval);
      if(window.__tv3RotInterval) clearInterval(window.__tv3RotInterval);
      const tick = ()=>{
        const el=document.getElementById("tvClock"); if(el) el.textContent = new Date().toLocaleTimeString("pt-BR");
        const dEl=document.getElementById("tvDate"); if(dEl) dEl.textContent = new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"});
      };
      tick(); window.__tv3Interval = setInterval(tick, 1000);
      window.__tv3RotInterval = setInterval(()=>{ M.UIState.tvModoIndex = ((M.UIState.tvModoIndex||0)+1) % MODOS.length; M.render(); }, 30000);
    }};
  };
})();
