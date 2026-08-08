/* ============================================================
   PÁGINA: Tarefas (todas as obras)
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  M.Pages.tarefas = function(){
    const f = M.UIState.tarefaFiltro;
    let tarefas = M.Store.state.tarefas.slice().sort((a,b)=> (a.status==="EM_ANDAMENTO"?0:a.status==="PLANEJADA"?1:2) - (b.status==="EM_ANDAMENTO"?0:b.status==="PLANEJADA"?1:2));
    if(f.responsavel) tarefas = tarefas.filter(t=>t.responsavelPlanejado===f.responsavel);
    if(f.status) tarefas = tarefas.filter(t=>t.status===f.status);

    const respOptions = ["",...M.COLABORADORES.map(c=>c.nome)];
    const html = `
      <div class="card pad" style="margin-bottom:14px;">
        <div class="flex-gap" style="flex-wrap:wrap;">
          <select onchange="Act.setTarefaFiltro('responsavel',this.value)">
            ${respOptions.map(r=>`<option value="${r}" ${f.responsavel===r?'selected':''}>${r||"Todos os responsáveis"}</option>`).join("")}
          </select>
          <select onchange="Act.setTarefaFiltro('status',this.value)">
            <option value="" ${!f.status?'selected':''}>Todos os status</option>
            <option value="PLANEJADA" ${f.status==='PLANEJADA'?'selected':''}>Planejada</option>
            <option value="EM_ANDAMENTO" ${f.status==='EM_ANDAMENTO'?'selected':''}>Em andamento</option>
            <option value="CONCLUIDA" ${f.status==='CONCLUIDA'?'selected':''}>Concluída</option>
          </select>
        </div>
      </div>
      <div class="card pad">
        <table class="tbl">
          <thead><tr><th>Tarefa</th><th>Obra / local</th><th>Responsável</th><th>Executor</th><th>Início–Fim</th><th>Status</th><th>Resultado</th><th></th></tr></thead>
          <tbody>${tarefas.map(t=>`
            <tr>
              <td>${UI.esc(t.titulo)} ${t.tipo==='REFACAO'?'<span class="chip critical">retrabalho</span>':t.tipo==='COMPLEMENTAR'?'<span class="chip neutral">complementar</span>':''}</td>
              <td class="small muted"><a href="#/obra/${t.obraId}">${UI.esc(t.obraNome)}</a>${t.movelNome? " · "+UI.esc(t.movelNome):""}</td>
              <td>${UI.person(t.responsavelPlanejado)}</td>
              <td>${t.executadoPor? UI.person(t.executadoPor):'<span class="small muted">—</span>'}</td>
              <td class="small muted">${t.inicio||"—"} ${t.fim?"– "+t.fim:""}</td>
              <td>${UI.tarefaStatusChip(t.status)}</td>
              <td>${UI.resultadoChip(t.resultado)}</td>
              <td>${t.status==='PLANEJADA'? `<button class="btn sm" onclick="Act.iniciarTarefa('${t.id}')">Iniciar</button>`
                  : t.status==='EM_ANDAMENTO'? `<button class="btn sm primary" onclick="Act.pedirResultado('${t.id}')">Concluir</button>` : ""}</td>
            </tr>`).join("")}</tbody>
        </table>
      </div>
    `;
    return {title:"Tarefas", crumb:"Responsável × executor, apontamento de produção", html,
      actionsHtml:`<button class="btn primary" onclick="Act.openTarefaForm(null)">+ Nova tarefa</button>`};
  };

  M.Pages.tarefaFormHtml = function(obraId){
    const obras = M.Store.state.obras;
    return `
      <div class="modal-head"><h2>Nova tarefa</h2><button class="modal-close" data-close>✕</button></div>
      <form id="formTarefa">
        <div class="modal-body">
          <div class="field"><label>Obra</label>
            <select name="obraId" required>${obras.map(o=>`<option value="${o.id}" ${o.id===obraId?'selected':''}>${o.numeroOS} — ${o.cliente}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Título da tarefa</label><input name="titulo" required placeholder="Ex: buscar vidro, conferir medidas, montar gabarito..."></div>
          <div class="field-row">
            <div class="field"><label>Etapa relacionada (opcional)</label>
              <select name="etapa"><option value="">—</option>${M.Store.etapasAtivas().map(e=>`<option value="${e.id}">${UI.esc(e.nome)}</option>`).join("")}</select>
            </div>
            <div class="field"><label>Móvel (opcional)</label>
              <select name="movelId"><option value="">—</option>${M.Store.allMoveis().filter(x=>x.o.id===obraId).map(({m})=>`<option value="${m.id}">${m.nome}</option>`).join("")}</select>
            </div>
          </div>
          <div class="field-row">
            <div class="field"><label>Responsável</label><select name="responsavel">${M.COLABORADORES.map(c=>`<option>${c.nome}</option>`).join("")}</select></div>
            <div class="field"><label>Tipo</label><select name="tipo"><option value="COMPLEMENTAR">Complementar</option><option value="PRODUCAO">Produção</option></select></div>
          </div>
        </div>
        <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Criar tarefa</button></div>
      </form>`;
  };
})();
