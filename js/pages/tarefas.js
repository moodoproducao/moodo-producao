/* ============================================================
   PÁGINA: Tarefas (todas as obras)
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  M.Pages.tarefas = function(){
    const f = M.UIState.tarefaFiltro;
    const nome = M.Store.state.usuarioAtual;
    const colab = M.colabByNome(nome);
    const somenteMinhas = colab && (colab.perfil==="OPERADOR"||colab.perfil==="MONTADOR");
    let tarefas = M.Store.state.tarefas.slice().sort((a,b)=> (a.status==="EM_ANDAMENTO"?0:a.status==="PLANEJADA"?1:2) - (b.status==="EM_ANDAMENTO"?0:b.status==="PLANEJADA"?1:2));
    if(somenteMinhas) tarefas = tarefas.filter(t=>t.responsavelPlanejado===nome || t.executadoPor===nome);
    if(f.responsavel) tarefas = tarefas.filter(t=>t.responsavelPlanejado===f.responsavel);
    if(f.status) tarefas = tarefas.filter(t=>t.status===f.status);
    if(f.obraId) tarefas = tarefas.filter(t=>t.obraId===f.obraId);

    const respOptions = ["",...M.COLABORADORES.map(c=>c.nome)];
    // item 9 do backlog: dá pra ver as tarefas de uma obra específica sem sair
    // desta tela — mesma lista de sempre, só filtrada.
    // FASE 7.5: rascunho não entra no filtro de obra de Tarefas (item 7).
    const obrasOptions = M.Store.obrasOperacionais().slice().sort((a,b)=>a.cliente.localeCompare(b.cliente));
    const html = `
      <div class="card pad" style="margin-bottom:14px;">
        <div class="flex-gap" style="flex-wrap:wrap;">
          <select onchange="Act.setTarefaFiltro('obraId',this.value)">
            <option value="" ${!f.obraId?'selected':''}>Todas as obras</option>
            ${obrasOptions.map(o=>`<option value="${o.id}" ${f.obraId===o.id?'selected':''}>${UI.esc(o.cliente)} — ${o.numeroOS}</option>`).join("")}
          </select>
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
            <tr style="cursor:pointer;" onclick="Act.abrirDetalheTarefa('${t.id}')">
              <td>${UI.esc(t.titulo)} ${t.tipo==='REFACAO'?'<span class="chip critical">retrabalho</span>':t.tipo==='COMPLEMENTAR'?'<span class="chip neutral">complementar</span>':''} ${(t.fotos&&t.fotos.length)||t.instrucoes? `<span class="chip neutral">${UI.icon('file-text',10)}</span>`:""}</td>
              <td class="small muted"><a href="#/obra/${t.obraId}" onclick="event.stopPropagation()">${UI.esc(t.obraNome)}</a>${t.movelNome? " · "+UI.esc(t.movelNome):""}</td>
              <td>${UI.person(t.responsavelPlanejado)}</td>
              <td>${t.executadoPor? UI.person(t.executadoPor):'<span class="small muted">—</span>'}</td>
              <td class="small muted">${t.inicio||"—"} ${t.fim?"– "+t.fim:""}</td>
              <td>${UI.tarefaStatusChip(t.status)}</td>
              <td>${UI.resultadoChip(t.resultado)}</td>
              <td onclick="event.stopPropagation()">${UI.tarefaAcoesHtml(t)}</td>
            </tr>`).join("")}</tbody>
        </table>
      </div>
    `;
    return {title: somenteMinhas?"Minhas Tarefas":"Tarefas", crumb:"Responsável × executor, apontamento de produção", html,
      actionsHtml:`<button class="btn primary" onclick="Act.openTarefaForm(null)">+ Nova tarefa</button>`};
  };

  M.Pages.tarefaFormHtml = function(obraId){
    // FASE 7.5: rascunho não pode receber tarefa manual (item 7).
    const obras = M.Store.obrasOperacionais();
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
          <div class="field"><label>Instruções (opcional)</label><textarea name="instrucoes" placeholder="Detalhes de como executar, cuidados especiais, etc."></textarea></div>
          ${UI.fotoFieldHtml("fotos")}
        </div>
        <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Criar tarefa</button></div>
      </form>`;
  };

  // Modal de detalhe — aberto ao clicar numa tarefa em qualquer lista (título/local
  // continuam clicáveis separadamente; o clique na linha inteira abre isto).
  M.Pages.tarefaDetalheModalHtml = function(t, voltarMovelId){
    return `
      <div class="modal-head"><h2>${UI.esc(t.titulo)}</h2><button class="modal-close" data-close>✕</button></div>
      <div class="modal-body">
        <div class="flex-gap" style="gap:8px;flex-wrap:wrap;margin-bottom:10px;">
          ${UI.tarefaStatusChip(t.status)} ${UI.resultadoChip(t.resultado)}
          ${t.tipo==='REFACAO'?'<span class="chip critical">retrabalho</span>':''}
        </div>
        <p class="small muted">${t.obraId?`<a href="#/obra/${t.obraId}" onclick="UI.closeModal()">${UI.esc(t.obraNome||"")}</a>`:UI.esc(t.obraNome||"")}${t.ambienteNome?" · "+UI.esc(t.ambienteNome):""}${t.movelNome?" · "+UI.esc(t.movelNome):""}</p>
        <p class="small">Responsável: ${UI.person(t.responsavelPlanejado)}${t.executadoPor?" · Executor: "+UI.person(t.executadoPor):""}</p>
        ${t.instrucoes? `<div class="card pad" style="margin-top:10px;"><div class="card-title">Instruções</div><p style="white-space:pre-wrap;margin:0;">${UI.esc(t.instrucoes)}</p></div>`:""}
        ${t.motivoRefacao? `<div class="card pad" style="margin-top:10px;"><div class="card-title">Motivo do retrabalho</div><p style="margin:0;">${UI.esc(t.motivoRefacao)}</p></div>`:""}
        ${t.fotos&&t.fotos.length? `<div style="margin-top:10px;"><div class="card-title">Fotos</div>${UI.fotosGaleriaHtml(t.fotos)}</div>`:""}
        <div class="flex-gap" style="margin-top:14px;flex-wrap:wrap;">
          ${t.status==='PLANEJADA'? `<button class="btn primary" onclick="Act.iniciarTarefa('${t.id}'${voltarMovelId?`,'${voltarMovelId}'`:''})">${UI.icon('play',14)} Iniciar</button>`:""}
          ${t.status==='EM_ANDAMENTO'? `<button class="btn primary" onclick="Act.pedirResultado('${t.id}'${voltarMovelId?`,'${voltarMovelId}'`:''})">${UI.icon('check',14)} Concluir</button>`:""}
        </div>
      </div>
    `;
  };
})();
