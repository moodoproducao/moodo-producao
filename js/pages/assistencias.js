/* ============================================================
   PÁGINA: Assistências (seções 44-47) — pós-venda / garantia
   FASE 5 (handoff): garantia (4 estados) + N visitas por chamado, cada
   visita termina em "resolvida" ou "retorno necessário". Aditivo: o fluxo
   de status por botão (Avançar/Concluir) que já existia continua igual —
   "Registrar visita" é o novo caminho completo, que também define o status.
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  // FASE 7 (Assistências V2): STATUS_FLOW/STATUS_LABEL passam a viver em
  // js/data.js (M.STATUS_ASSISTENCIA_FLOW/M.STATUS_ASSISTENCIA_LABEL) —
  // centralizado, porque agora mais telas além desta (V2 desktop/mobile,
  // Hoje) precisam do mesmo vocabulário. Aliases locais mantidos só pra não
  // reescrever toda referência abaixo neste arquivo legado.
  const STATUS_FLOW = M.STATUS_ASSISTENCIA_FLOW;
  const STATUS_LABEL = M.STATUS_ASSISTENCIA_LABEL;

  // FASE 7 (item 3 — visita ganha status próprio): usa
  // M.Calc.statusEfetivoVisita em vez de inferir na mão aqui — cobre visita
  // legada sem `status` gravado e visita nova (AGENDADA/REALIZADA/CANCELADA)
  // com a mesma regra, em qualquer tela que precise mostrar o histórico.
  function visitasHtml(a){
    if(!a.visitas || !a.visitas.length) return `<p class="small muted">Nenhuma visita registrada ainda.</p>`;
    return `<div style="margin:8px 0;">${a.visitas.map((v,i)=>{
      const statusV = M.Calc.statusEfetivoVisita(v);
      const def = M.visitaStatusDef(statusV);
      return `
      <div class="check-row" style="align-items:flex-start;">
        <span class="dot ${def.tone}" style="margin-top:6px;"></span>
        <div class="label">
          <b>Visita ${i+1}</b> <span class="small muted">· ${C.fmtDate(v.data)}${v.horaInicio?" "+v.horaInicio:""} · ${UI.esc(v.tecnico||"—")}</span>
          ${v.diagnostico? `<div class="small muted" style="margin-top:2px;">${UI.esc(v.diagnostico)}</div>`:""}
          <div style="margin-top:4px;">
            <span class="chip ${def.tone}">${def.label}</span>
            ${statusV==="REALIZADA"? (v.desfecho==='RESOLVIDA'? ` <span class="chip good">${UI.icon('check',11)} Resolvida</span>` : ` <span class="chip warning">Retorno necessário</span>`) : ""}
            ${v.pendenciaGeradaId? ` <a href="#/pendencias" onclick="event.stopPropagation()" class="small">gerou pendência →</a>`:""}
          </div>
          ${v.fotos&&v.fotos.length? UI.fotosGaleriaHtml(v.fotos) : ""}
        </div>
      </div>`;
    }).join("")}</div>`;
  }

  // FASE 2 (Navegação V2): "Atendimentos" (rota nova "#/atendimentos", menu
  // do perfil Assistência) é o MESMO M.Pages.assistencias() de sempre — só
  // rótulo/crumb diferentes, mesma permissão (assistencia.ver), mesmos
  // dados. Não criamos uma tela nem uma tabela nova.
  //
  // AVISO EXPLÍCITO (checagem pedida antes do publish da Fase 2): "#/atendimentos"
  // é, NESTA FASE, só um alias/recorte de rótulo sobre a tela ATUAL de
  // Assistências — não é, e não deve ser confundido com, o fluxo final de
  // Assistência V2/mobile (tela própria, fluxo próprio, pensada do zero pra
  // quem faz atendimento em campo pelo celular). Isso continua pra fase
  // própria, ainda não iniciada. Quem for mexer aqui depois: não estenda
  // este parâmetro pra "virar" a V2 — quando a V2 vier, ela troca essa
  // função por uma nova, não acrescenta mais flags nesta.
  M.Pages.assistencias = function(comoAtendimentos){
    const f = M.UIState.assistFiltro;
    const nome = M.Store.state.usuarioAtual;
    const colab = M.colabByNome(nome);
    const somenteMinhas = colab && (colab.perfil==="OPERADOR"||colab.perfil==="MONTADOR");
    let list = M.Store.state.assistencias.slice();
    if(somenteMinhas) list = list.filter(a=>a.responsavel===nome);
    if(f.status) list = list.filter(a=>a.status===f.status);
    if(f.garantia) list = list.filter(a=>a.garantia===f.garantia);
    const resumo = C.assistenciasResumo();

    const cards = list.map(a=>{
      const vencida = a.prazo && C.diasAte(a.prazo)<0 && a.status!=="CONCLUIDA";
      const idxAtual = STATUS_FLOW.indexOf(a.status);
      const proximo = STATUS_FLOW[idxAtual+1];
      const expandido = M.UIState.assistExpandido===a.id;
      const nVisitas = (a.visitas||[]).length;
      const ultima = nVisitas? a.visitas[nVisitas-1] : null;
      return `<div class="asst-card" style="margin-bottom:10px;cursor:pointer;" onclick="Act.toggleAssistExpandido('${a.id}')">
        <div class="flex-between" style="flex-wrap:wrap;gap:8px;">
          <div>
            <div class="small muted">${UI.esc(a.categoria)} · ${a.obraId?`<a href="#/obra/${a.obraId}" onclick="event.stopPropagation()">${UI.esc(a.obraNome)}</a>`:UI.esc(a.cliente||"")} ${a.ambienteNome?"· "+UI.esc(a.ambienteNome):""}</div>
            <b>${UI.esc(a.descricao)}</b>
          </div>
          <div class="flex-gap" style="flex-wrap:wrap;">${UI.prioridadeChip(a.prioridade)}${UI.garantiaChip(a.garantia)}${UI.assistenciaStatusChip(a.status)}${a.fotos&&a.fotos.length?`<span class="chip neutral">${UI.icon('image',11)} ${a.fotos.length}</span>`:""}</div>
        </div>
        <div class="flex-between small muted" style="margin-top:10px;">
          <span>${UI.person(a.responsavel)} · origem: ${UI.esc(a.origem||"—")}</span>
          <span class="${vencida?'critical':''}" style="${vencida?'color:var(--critical);font-weight:700;':''}">${a.prazo? (vencida?"venceu "+C.fmtDate(a.prazo):"prazo "+C.fmtDate(a.prazo)) : "sem prazo"}</span>
        </div>
        <div class="small muted" style="margin-top:6px;">${nVisitas? `${nVisitas} visita${nVisitas>1?"s":""}` : "sem visitas ainda"}${ultima&&ultima.desfecho==='RETORNO_NECESSARIO'? ` · <span style="color:var(--warning);font-weight:700;">retorno necessário</span>`:""}</div>
        ${expandido? UI.fotosGaleriaHtml(a.fotos) : ""}
        ${expandido? `<div class="hr" style="margin:10px 0;"></div><label style="font-size:11.5px;font-weight:700;color:var(--ink-soft);">Visitas</label>${visitasHtml(a)}` : ""}
        ${expandido? `<div class="field" style="margin-top:6px;max-width:280px;" onclick="event.stopPropagation()">
          <label>Cobertura</label>
          <select onchange="Act.mudarGarantiaAssistencia('${a.id}', this.value)">
            ${M.GARANTIA_DEF.map(g=>`<option value="${g.key}" ${a.garantia===g.key?'selected':''}>${g.label}</option>`).join("")}
          </select>
        </div>` : ""}
        ${a.status!=="CONCLUIDA" ? `<div class="flex-gap" style="margin-top:10px;flex-wrap:wrap;" onclick="event.stopPropagation()">
          <button class="btn sm primary" onclick="Act.abrirRegistrarVisita('${a.id}')">${UI.icon('wrench',12)} Registrar visita</button>
          ${proximo? `<button class="btn sm" onclick="Act.setAssistenciaStatus('${a.id}','${proximo}')">Avançar → ${STATUS_LABEL[proximo]}</button>`:""}
          <button class="btn sm" onclick="Act.setAssistenciaStatus('${a.id}','CONCLUIDA')">Marcar concluída</button>
        </div>`:""}
      </div>`;
    }).join("") || `<p class="small muted">Nenhuma assistência encontrada.</p>`;

    const html = `
      <div class="help-banner">${UI.icon('lifebuoy',13)} Assistências cobrem ajustes, regulagens, danos e solicitações pós-entrega — para que isso não fique só na cabeça da liderança.</div>
      <div class="stat-row">
        <div class="stat-tile"><div class="label">Abertas</div><div class="value">${resumo.abertas}</div></div>
        <div class="stat-tile"><div class="label">Vencidas</div><div class="value ${resumo.vencidas?'critical':''}">${resumo.vencidas}</div></div>
        <div class="stat-tile"><div class="label">Aguardando peça</div><div class="value">${resumo.aguardandoPeca}</div></div>
        <div class="stat-tile"><div class="label">Agendadas</div><div class="value">${resumo.agendadas}</div></div>
        <div class="stat-tile"><div class="label">Com retorno necessário</div><div class="value ${resumo.comRetorno?'warning':''}">${resumo.comRetorno}</div></div>
        <div class="stat-tile"><div class="label">Concluídas</div><div class="value">${resumo.concluidas}</div></div>
      </div>
      <div class="card pad" style="margin-bottom:14px;">
        <div class="flex-gap" style="flex-wrap:wrap;">
          <select onchange="Act.setAssistFiltro('status',this.value)">
            <option value="">Todos os status</option>
            ${STATUS_FLOW.map(s=>`<option value="${s}" ${f.status===s?'selected':''}>${STATUS_LABEL[s]}</option>`).join("")}
          </select>
          <select onchange="Act.setAssistFiltro('garantia',this.value)">
            <option value="">Toda garantia</option>
            ${M.GARANTIA_DEF.map(g=>`<option value="${g.key}" ${f.garantia===g.key?'selected':''}>${g.label}</option>`).join("")}
          </select>
        </div>
      </div>
      ${cards}
    `;
    return {title: comoAtendimentos ? "Atendimentos" : (somenteMinhas?"Minhas Assistências":"Assistências"), crumb:"Ajuste, regulagem, dano, garantia e pós-venda", html,
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
          <div class="field-row">
            <div class="field"><label>Prazo</label><input type="date" name="prazo"></div>
            <!-- FASE 7 (item 2, aprovado): rótulo na tela vira "Cobertura" —
                 o campo salvo continua exatamente igual a garantia (M.GARANTIA_DEF),
                 nenhum campo paralelo cobertura foi criado. -->
            <div class="field"><label>Cobertura</label><select name="garantia">${M.GARANTIA_DEF.map(g=>`<option value="${g.key}" ${g.key==='EM_ANALISE'?'selected':''}>${g.label}</option>`).join("")}</select></div>
          </div>
          ${UI.fotoFieldHtml("fotos")}
        </div>
        <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Registrar assistência</button></div>
      </form>`;
  };

  // ---------- registrar visita (Fase 5 — handoff: N visitas por chamado) ----------
  // FASE 7 (item 3 e item 9): agora aceita um `visitaId` opcional — quando
  // vem preenchido (visita já estava AGENDADA), o modal COMPLETA aquela
  // visita em vez de anunciar uma "visita nº N+1" nova; sem visitaId,
  // comportamento 100% igual ao de sempre (cria e já realiza no mesmo passo).
  // Copy do desfecho "Resolvida" mudou (item 9/§12 — regra dura mantida):
  // resolver uma visita NUNCA conclui a assistência sozinho mais — quem
  // conclui é sempre uma ação própria e explícita (ver
  // M.Pages.concluirAssistenciaHtml). A opção antiga "já tenho a próxima
  // visita agendada" saiu deste formulário — agendar visita agora é sua
  // própria ação (Act.abrirAgendarVisita/M.Pages.agendarVisitaHtml),
  // não mais um valor escondido dentro do formulário de registro de visita.
  M.Pages.registrarVisitaHtml = function(assistId, visitaId){
    const a = M.Store.state.assistencias.find(x=>x.id===assistId); if(!a) return "";
    const visitas = a.visitas||[];
    const visitaAgendada = visitaId ? visitas.find(v=>v.id===visitaId) : null;
    const nVisitas = visitas.length;
    const numeroDaVisita = visitaAgendada ? visitas.indexOf(visitaAgendada)+1 : nVisitas+1;
    const tituloPasso = visitaAgendada
      ? `Completar visita agendada de ${C.fmtDate(visitaAgendada.data)}${visitaAgendada.horaInicio?" às "+visitaAgendada.horaInicio:""}`
      : (nVisitas? `${nVisitas} visita(s) anterior(es) — esta será a visita nº ${numeroDaVisita}.` : "");
    return `
      <div class="modal-head"><div><h2>Registrar visita</h2><div class="meta">${UI.esc(a.descricao)} · ${UI.esc(a.obraNome||a.cliente||"")}</div></div><button class="modal-close" data-close>✕</button></div>
      <form id="formRegistrarVisita" data-assist-id="${a.id}" ${visitaAgendada?`data-visita-id="${visitaAgendada.id}"`:""}>
        <div class="modal-body">
          ${tituloPasso? `<div class="small muted" style="margin-bottom:10px;">${UI.esc(tituloPasso)}</div>`:""}
          ${nVisitas? `${visitasHtml(a)}<div class="hr" style="margin:10px 0;"></div>` : ""}
          <div class="field-row">
            <div class="field"><label>Data da visita</label><input type="date" name="data" value="${(visitaAgendada&&visitaAgendada.data)||M.todayISO()}"></div>
            <div class="field"><label>Técnico</label><select name="tecnico">${M.COLABORADORES.map(c=>`<option ${(visitaAgendada?visitaAgendada.tecnico===c.nome:c.nome===M.Store.state.usuarioAtual)?'selected':''}>${c.nome}</option>`).join("")}</select></div>
          </div>
          <div class="field"><label>Diagnóstico / o que foi feito</label><textarea name="diagnostico" placeholder="Descreva o que foi encontrado e/ou executado nesta visita">${UI.esc((visitaAgendada&&visitaAgendada.diagnostico)||"")}</textarea></div>
          ${UI.fotoFieldHtml("fotosVisita")}
          <div class="field" style="margin-top:6px;">
            <label>Resultado desta visita</label>
            <label class="check-row"><input type="radio" name="desfecho" value="RESOLVIDA" style="width:auto;" onchange="document.getElementById('retornoFields').style.display='none'"> Resolvida — nenhum retorno necessário</label>
            <label class="check-row"><input type="radio" name="desfecho" value="RETORNO_NECESSARIO" style="width:auto;" checked onchange="document.getElementById('retornoFields').style.display='block'"> Retorno necessário — mantém aberta</label>
          </div>
          <div id="retornoFields">
            <div class="field"><label>O que falta agora?</label>
              <select name="proximoStatus">
                <option value="AGUARDANDO_MATERIAL">Aguardando peça/fornecedor</option>
                <option value="AGUARDANDO_CLIENTE">Aguardando cliente</option>
              </select>
              <p class="small muted" style="margin-top:4px;">Pra agendar a próxima visita, use "Agendar visita" depois de salvar esta.</p>
            </div>
            <div class="field">
              <label><input type="checkbox" id="chkPeca" style="width:auto;margin-right:6px;" onchange="document.getElementById('pecaFields').style.display=this.checked?'block':'none'">Precisa de peça nova? (abre pendência tipo Assistência)</label>
            </div>
            <div id="pecaFields" style="display:none;">
              <div class="field"><label>Categoria da peça</label><select name="pecaCategoria">${M.CATEGORIAS_PENDENCIA.map(c=>`<option ${c==='Peça para refazer'?'selected':''}>${c}</option>`).join("")}</select></div>
              <div class="field"><label>Descrição da peça</label><input name="pecaDescricao" placeholder="Ex: frente nova da porta empenada"></div>
              <div class="field"><label>Prazo da peça</label><input type="date" name="pecaPrazo"></div>
            </div>
          </div>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn" data-close>Cancelar</button>
          <button type="submit" class="btn primary">Salvar visita</button>
        </div>
      </form>
    `;
  };

  // ---------- agendar visita (Fase 7 — novo) ----------
  M.Pages.agendarVisitaHtml = function(assistId){
    const a = M.Store.state.assistencias.find(x=>x.id===assistId); if(!a) return "";
    return `
      <div class="modal-head"><div><h2>Agendar visita</h2><div class="meta">${UI.esc(a.descricao)} · ${UI.esc(a.obraNome||a.cliente||"")}</div></div><button class="modal-close" data-close>✕</button></div>
      <form id="formAgendarVisita" data-assist-id="${a.id}">
        <div class="modal-body">
          <div class="field-row">
            <div class="field"><label>Data</label><input type="date" name="data" required value="${M.todayISO()}"></div>
            <div class="field"><label>Horário (opcional)</label><input type="time" name="horaInicio"></div>
          </div>
          <div class="field"><label>Técnico/responsável</label><select name="tecnico">${M.COLABORADORES.map(c=>`<option ${c.nome===a.responsavel?'selected':''}>${c.nome}</option>`).join("")}</select></div>
          <div class="field"><label>Observação (opcional)</label><textarea name="observacao" placeholder="Combinado com o cliente, ponto de referência, etc."></textarea></div>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn" data-close>Cancelar</button>
          <button type="submit" class="btn primary">Agendar visita</button>
        </div>
      </form>
    `;
  };

  // ---------- concluir assistência (Fase 7 — novo; gate em Store.concluirAssistencia) ----------
  M.Pages.concluirAssistenciaHtml = function(assistId){
    const a = M.Store.state.assistencias.find(x=>x.id===assistId); if(!a) return "";
    return `
      <div class="modal-head"><div><h2>Concluir assistência</h2><div class="meta">${UI.esc(a.descricao)} · ${UI.esc(a.obraNome||a.cliente||"")}</div></div><button class="modal-close" data-close>✕</button></div>
      <form id="formConcluirAssistencia" data-assist-id="${a.id}">
        <div class="modal-body">
          <div class="field"><label>Cobertura definida</label>
            <select name="garantia">${M.GARANTIA_DEF.map(g=>`<option value="${g.key}" ${a.garantia===g.key?'selected':''}>${g.label}</option>`).join("")}</select>
            <p class="small muted" style="margin-top:4px;">Precisa estar diferente de "Em análise" pra concluir.</p>
          </div>
          <div class="field"><label>Resultado final</label><textarea name="resultado" required placeholder="O que foi resolvido / entregue ao cliente">${UI.esc(a.resultado||"")}</textarea></div>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn" data-close>Cancelar</button>
          <button type="submit" class="btn primary">Concluir</button>
        </div>
      </form>
    `;
  };

  // ---------- cancelar VISITA agendada (ajustes finais, item 4 — motivo obrigatório) ----------
  M.Pages.cancelarVisitaHtml = function(assistId, visitaId){
    const a = M.Store.state.assistencias.find(x=>x.id===assistId); if(!a) return "";
    const v = (a.visitas||[]).find(x=>x.id===visitaId); if(!v) return "";
    return `
      <div class="modal-head"><div><h2>Cancelar visita agendada</h2><div class="meta">${UI.esc(a.descricao)} · ${C.fmtDate(v.data)}${v.horaInicio?" "+v.horaInicio:""}</div></div><button class="modal-close" data-close>✕</button></div>
      <form id="formCancelarVisita" data-assist-id="${a.id}" data-visita-id="${v.id}">
        <div class="modal-body">
          <p class="small muted">A assistência continua com o status atual — só esta visita deixa de aparecer na Agenda.</p>
          <div class="field"><label>Motivo do cancelamento</label><textarea name="motivo" required placeholder="Ex.: cliente remarcou, técnico indisponível..."></textarea></div>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn" data-close>Voltar</button>
          <button type="submit" class="btn danger">Cancelar visita</button>
        </div>
      </form>
    `;
  };

  // ---------- cancelar ASSISTÊNCIA inteira (ajustes finais, itens 1/2/3) ----------
  // Gate real fica 100% em Store.cancelarAssistencia (permissão
  // "assistencia.cancelar" + motivo obrigatório) — este modal só é alcançável
  // por quem já vê o botão "Cancelar assistência" (o próprio template do
  // detalhe checa Store.pode("assistencia.cancelar") antes de renderizar o
  // botão — ver js/pages/assistenciasV2.js), então não existe um caminho de
  // UI que chegue aqui sem a permissão — o Store recusa de qualquer forma.
  M.Pages.cancelarAssistenciaHtml = function(assistId){
    const a = M.Store.state.assistencias.find(x=>x.id===assistId); if(!a) return "";
    return `
      <div class="modal-head"><div><h2>Cancelar assistência</h2><div class="meta">${UI.esc(a.descricao)} · ${UI.esc(a.obraNome||a.cliente||"")}</div></div><button class="modal-close" data-close>✕</button></div>
      <form id="formCancelarAssistencia" data-assist-id="${a.id}">
        <div class="modal-body">
          <p class="small muted">Isso encerra o chamado inteiro (status → Cancelada). Nenhuma visita, foto, pendência ou histórico é apagado — tudo continua registrado. Esta ação não pode ser desfeita pela tela.</p>
          <div class="field"><label>Motivo do cancelamento</label><textarea name="motivo" required placeholder="Ex.: cliente desistiu, chamado duplicado, item fora de garantia recusado pelo cliente..."></textarea></div>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn" data-close>Voltar</button>
          <button type="submit" class="btn danger">Cancelar assistência</button>
        </div>
      </form>
    `;
  };
})();
