/* ============================================================
   PÁGINA: Montagem — entrega + montagem final + encerramento
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  const CHECKLIST_ENCERRAMENTO = [
    "Todos os móveis instalados","Portas reguladas","Gavetas reguladas","Ferragens conferidas",
    "Limpeza","Fotos finais","Conferência final","Pendências registradas",
  ];

  M.Pages.montagem = function(){
    const posEntrega = M.Store.posicaoEtapa("ENTREGA"), posMontagem = M.Store.posicaoEtapa("MONTAGEM");
    const relevantes = M.Store.allMoveis().filter(({m})=>{
      const p = M.Store.posicaoEtapa(m.etapa);
      return p>=posEntrega && p<=posMontagem;
    });

    const html = relevantes.length ? `
      <div class="card pad">
        <table class="tbl">
          <thead><tr><th>Móvel</th><th>Obra</th><th>Etapa</th><th>Requisitos</th><th>Responsável</th><th>Entrega prevista</th><th></th></tr></thead>
          <tbody>${relevantes.map(({o,a,m})=>{
            const check = M.Store.checarRequisitos(m);
            return `<tr>
              <td><b>${UI.esc(m.nome)}</b><div class="small muted">${UI.esc(a.nome)}</div></td>
              <td><a href="#/obra/${o.id}">${UI.esc(o.cliente)}</a></td>
              <td><span class="chip brand">${UI.esc(M.Store.etapaById(m.etapa).nome)}</span></td>
              <td>${check.liberado? `<span class="chip good">liberado</span>` : `<span class="chip critical">${check.faltando.length} pendente(s)</span>`}</td>
              <td>${UI.person(m.responsavel)}</td>
              <td>${C.fmtDate(o.dataEntregaPrevista)}</td>
              <td>
                <button class="btn sm" onclick="Act.openMovel('${m.id}')">Abrir</button>
                ${m.etapa==="MONTAGEM"? `<button class="btn sm primary" onclick="Act.abrirEncerramentoMontagem('${m.id}')">${UI.icon('check-circle',12)} Encerrar</button>`
                  : M.Store.posicaoEtapa(m.etapa)<posMontagem? `<button class="btn sm primary" onclick="Act.moveStageBtn('${m.id}',1)">Avançar</button>`:""}
              </td>
            </tr>`;
          }).join("")}</tbody>
        </table>
      </div>
    ` : `<p class="small muted">Nenhum móvel em entrega ou montagem no momento.</p>`;

    return {title:"Montagem", crumb:"Itens entregues e em fase de montagem final", html};
  };

  // checklist de encerramento (seção 32)
  M.Pages.encerramentoMontagemHtml = function(f){
    const {o,a,m} = f;
    return `
      <div class="modal-head"><div><h2>Encerrar montagem</h2><div class="meta">${UI.esc(m.nome)} · ${UI.esc(o.cliente)} · ${UI.esc(a.nome)}</div></div><button class="modal-close" data-close>✕</button></div>
      <div class="modal-body">
        ${CHECKLIST_ENCERRAMENTO.map((c,i)=>`
          <div class="check-row"><input type="checkbox" class="mont-check" id="mc${i}"><label class="label" for="mc${i}">${c}</label></div>
        `).join("")}
        <div class="field" style="margin-top:14px;">
          <label><input type="checkbox" id="temPendencias" style="width:auto;margin-right:6px;">Ficaram pendências para depois (ex: peça em falta, ajuste futuro)</label>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn" data-close>Cancelar</button>
        <button class="btn primary" id="btnEncerrar">Encerrar montagem</button>
      </div>
    `;
  };
})();
