/* ============================================================
   PÁGINA: Assistências (seções 44-47) — pós-venda / garantia
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  const STATUS_FLOW = ["ABERTA","EM_TRIAGEM","AGENDADA","EM_EXECUCAO","AGUARDANDO_MATERIAL","AGUARDANDO_CLIENTE","CONCLUIDA"];
  const STATUS_LABEL = {ABERTA:"Aberta",EM_TRIAGEM:"Em triagem",AGENDADA:"Agendada",EM_EXECUCAO:"Em execução",
    AGUARDANDO_MATERIAL:"Aguard. material",AGUARDANDO_CLIENTE:"Aguard. cliente",CONCLUIDA:"Concluída"};

  M.Pages.assistencias = function(){
    const f = M.UIState.assistFiltro;
    const nome = M.Store.state.usuarioAtual;
    const colab = M.colabByNome(nome);
    const somenteMinhas = colab && (colab.perfil==="OPERADOR"||colab.perfil==="MONTADOR");
    let list = M.Store.state.assistencias.slice();
    if(somenteMinhas) list = list.filter(a=>a.responsavel===nome);
    if(f.status) list = list.filter(a=>a.status===f.status);
    const resumo = C.assistenciasResumo();

    const cards = list.map(a=>{
      const vencida = a.prazo && C.diasAte(a.prazo)<0 && a.status!=="CONCLUIDA";
      const idxAtual = STATUS_FLOW.indexOf(a.status);
      const proximo = STATUS_FLOW[idxAtual+1];
      return `<div class="asst-card" style="margin-bottom:10px;">
        <div class="flex-between" style="flex-wrap:wrap;gap:8px;">
          <div>
            <div class="small muted">${UI.esc(a.categoria)} · ${a.obraId?`<a href="#/obra/${a.obraId}">${UI.esc(a.obraNome)}</a>`:UI.esc(a.cliente||"")} ${a.ambienteNome?"· "+UI.esc(a.ambienteNome):""}</div>
            <b>${UI.esc(a.descricao)}</b>
          </div>
          <div class="flex-gap">${UI.prioridadeChip(a.prioridade)}${UI.assistenciaStatusChip(a.status)}</div>
        </div>
        <div class="flex-between small muted" style="margin-top:10px;">
          <span>${UI.person(a.responsavel)} · origem: ${UI.esc(a.origem||"—")}</span>
          <span class="${vencida?'critical':''}" style="${vencida?'color:var(--critical);font-weight:700;':''}">${a.prazo? (vencida?"venceu "+C.fmtDate(a.prazo):"prazo "+C.fmtDate(a.prazo)) : "sem prazo"}</span>
        </div>
        ${a.status!=="CONCLUIDA" ? `<div class="flex-gap" style="margin-top:10px;">
          ${proximo? `<button class="btn sm primary" onclick="Act.setAssistenciaStatus('${a.id}','${proximo}')">Avançar → ${STATUS_LABEL[proximo]}</button>`:""}
          <button class="btn sm" onclick="Act.setAssistenciaStatus('${a.id}','CONCLUIDA')">Marcar concluída</button>
        </div>`:""}
      </div>`;
    }).join("") || `<p class="small muted">Nenhuma assistência encontrada.</p>`;

    const html = `
      <div class="help-banner">${UI.icon('lifebuoy',13)} Assistências cobrem ajustes, regulagens, danos e solicitações pós-entrega — para que isso não fique só na cabeça da liderança.</div>
      <div class="stat-row">
        <div class="stat-tile"><div class="label">Abertas</div><div class="value">${resumo.abertas}</div></div>
        <div class="stat-tile"><div class="label">Vencidas</div><div class="value ${resumo.vencidas?'critical':''}">${resumo.vencidas}</div></div>
        <div class="stat-tile"><div class="label">Concluídas</div><div class="value">${resumo.concluidas}</div></div>
      </div>
      <div class="card pad" style="margin-bottom:14px;">
        <select onchange="Act.setAssistFiltro('status',this.value)">
          <option value="">Todos os status</option>
          ${STATUS_FLOW.map(s=>`<option value="${s}" ${f.status===s?'selected':''}>${STATUS_LABEL[s]}</option>`).join("")}
        </select>
      </div>
      ${cards}
    `;
    return {title: somenteMinhas?"Minhas Assistências":"Assistências", crumb:"Ajuste, regulagem, dano, garantia e pós-venda", html,
      actionsHtml:`<button class="btn primary" onclick="Act.openAssistenciaForm(null)">${UI.icon('plus',14)} Nova assistência</button>`};
  };

  M.Pages.assistenciaFormHtml = function(obraId){
    const obras = M.Store.state.obras;
    return `
      <div class="modal-head"><h2>Nova assistência</h2><button class="modal-close" data-close>✕</button></div>
      <form id="formAssistencia">
        <div class="modal-body">
          <div class="field"><label>Obra</label>
            <select name="obraId"><option value="">— cliente avulso —</option>${obras.map(o=>`<option value="${o.id}" ${o.id===obraId?'selected':''}>${o.numeroOS} — ${o.cliente}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Cliente (se avulso)</label><input name="clienteLivre" placeholder="Nome do cliente"></div>
          <div class="field-row">
            <div class="field"><label>Ambiente</label><input name="ambienteNome" placeholder="Ex: Cozinha"></div>
            <div class="field"><label>Móvel</label><input name="movelNome" placeholder="Ex: Armário superior"></div>
          </div>
          <div class="field"><label>Descrição</label><textarea name="descricao" required placeholder="O que o cliente relatou / o que foi identificado"></textarea></div>
          <div class="field-row">
            <div class="field"><label>Categoria</label><select name="categoria">${M.CATEGORIAS_ASSISTENCIA.map(c=>`<option>${c}</option>`).join("")}</select></div>
            <div class="field"><label>Origem do problema</label><select name="origem">${M.ORIGENS_PROBLEMA.map(o=>`<option>${o}</option>`).join("")}</select></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Responsável</label><select name="responsavel">${M.COLABORADORES.map(c=>`<option>${c.nome}</option>`).join("")}</select></div>
            <div class="field"><label>Prioridade</label><select name="prioridade"><option value="ALTA">Alta</option><option value="MEDIA" selected>Média</option><option value="BAIXA">Baixa</option></select></div>
          </div>
          <div class="field"><label>Prazo</label><input type="date" name="prazo"></div>
          <div class="field"><label>${UI.icon('camera',13)} Foto (opcional)</label><input type="file" accept="image/*" capture="environment" name="foto"></div>
        </div>
        <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Registrar assistência</button></div>
      </form>`;
  };
})();
