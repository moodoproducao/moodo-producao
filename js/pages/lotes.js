/* ============================================================
   PÁGINA: Lotes de produção
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  const TIPO_LABEL = {CORTE:"Corte", USINAGEM:"Usinagem", FITAGEM:"Fitagem", PRE_MONTAGEM:"Pré-Montagem"};
  const STATUS_LABEL = {PROGRAMADO:["neutral","Programado"], EM_ANDAMENTO:["warning","Em andamento"], CONCLUIDO:["good","Concluído"]};

  M.Pages.lotes = function(){
    const lotes = M.Store.state.lotes;
    const sel = M.UIState.selecaoLote;

    // candidatos p/ atribuição em lote: móveis não concluídos
    const candidatos = M.Store.allMoveis().filter(x=>!C.movelConcluido(x.m));

    const html = `
      <div class="grid-2">
        <div>
          <div class="card-title" style="margin-bottom:10px;">Lotes programados</div>
          ${lotes.map(l=>{
            const [cls,label] = STATUS_LABEL[l.status];
            return `<div class="card pad" style="margin-bottom:12px;">
              <div class="flex-between"><b>Lote de ${TIPO_LABEL[l.tipo]}</b><span class="chip ${cls}">${label}</span></div>
              <div class="small muted" style="margin:2px 0 8px;">${C.fmtDate(l.data)} · resp. ${l.responsavel}${l.chapas?` · ${l.chapas} chapas`:""}</div>
              <ul style="margin:0 0 0 18px;font-size:12.5px;line-height:1.8;">${l.itens.map(i=>`<li>${UI.esc(i.label)}</li>`).join("")}</ul>
            </div>`;
          }).join("")}
        </div>
        <div>
          <div class="card-title" style="margin-bottom:10px;">Atribuição em lote</div>
          <div class="card pad">
            <p class="small muted" style="margin-bottom:10px;">Selecione móveis pendentes e crie um lote de produção para tocá-los juntos.</p>
            <div style="max-height:340px;overflow-y:auto;">
              ${candidatos.map(({o,a,m})=>`
                <label class="check-row" style="cursor:pointer;">
                  <input type="checkbox" ${sel.has(m.id)?'checked':''} onchange="Act.toggleSelecaoLote('${m.id}')">
                  <span class="label"><b>${UI.esc(m.nome)}</b> <span class="chip neutral">${UI.esc(M.Store.etapaById(m.etapa).nomeCurto)}</span>
                  <div class="small muted">${UI.esc(o.cliente)} · ${UI.esc(a.nome)}</div></span>
                </label>`).join("")}
            </div>
            <div class="hr"></div>
            <div class="field"><label>Tipo de lote</label>
              <select id="loteTipo"><option value="CORTE">Corte</option><option value="USINAGEM">Usinagem</option><option value="FITAGEM">Fitagem</option><option value="PRE_MONTAGEM">Pré-Montagem</option></select>
            </div>
            <div class="field"><label>Responsável</label>
              <select id="loteResp">${M.COLABORADORES.map(c=>`<option>${c.nome}</option>`).join("")}</select>
            </div>
            <button class="btn primary" style="width:100%;" ${sel.size?"":"disabled"} onclick="M.Pages.__criarLote()">Criar lote com ${sel.size} item(ns)</button>
          </div>
        </div>
      </div>
    `;
    return {title:"Lotes de Produção", crumb:"Agrupe itens de obras diferentes num mesmo lote de máquina", html};
  };

  M.Pages.__criarLote = function(){
    const tipo = document.getElementById("loteTipo").value;
    const resp = document.getElementById("loteResp").value;
    const itens = Array.from(M.UIState.selecaoLote).map(id=>{
      const f = M.Store.findMovel(id);
      return {obraId:f.o.id, label:f.o.cliente+" — "+f.m.nome};
    });
    M.Store.criarLote({tipo, responsavel:resp, chapas:null, itens});
    M.UIState.selecaoLote = new Set();
    M.UI.toast("Lote criado.");
  };
})();
