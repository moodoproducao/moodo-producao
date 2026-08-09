/* ============================================================
   MOODO PRODUÇÃO — ações globais (ligam UI a Store) + estado de UI
   ============================================================ */
(function(){
  "use strict";
  const M = window.M;
  const UI = M.UI;
  const C = M.Calc;

  M.UIState = {
    kanbanView: "ambientes",
    novaVersaoDisponivel: false,
    obraTab: {},
    novaObra: {osFile:null, orcFile:null, lido:false, ambientesAjuste:{}},
    pendFiltro: {categoria:"", status:""},
    pendExpandido: null,
    tarefaFiltro: {responsavel:"", status:""},
    calMonth: M.TODAY.getMonth(), calYear: M.TODAY.getFullYear(),
    calFiltros: new Set(["PRODUCAO","ENTREGAS","MONTAGENS","PENDENCIAS","FORNECEDORES","ASSISTENCIAS"]),
    desempenhoSel: null,
    selecaoLote: new Set(),
    auditoriaFiltro: {periodo:30, categoria:"", somenteExcecoes:false},
    assistFiltro: {status:""},
    tvWidgets: null, // preenchido a partir de M.Store.state se necessário
  };

  const Act = {
    go(route){ location.hash = route; },
    rerender(){ M.render(); },
    trocarUsuario(nome){ M.Store.setUsuarioAtual(nome); UI.toast("Agora navegando como "+nome+"."); location.hash = "#/dashboard"; },

    // ---------- checklist / responsável ----------
    toggleChecklist(movelId, itemId){ M.Store.toggleChecklistItem(movelId, itemId); },
    setResponsavel(movelId, sel){ M.Store.setResponsavel(movelId, sel.value); UI.toast("Responsável atualizado."); },

    // ---------- kanban ----------
    setKanbanView(v){ M.UIState.kanbanView = v; Act.rerender(); },
    dragStart(ev, movelId){ ev.dataTransfer.setData("text/plain", movelId); ev.target.classList.add("dragging"); },
    dragEnd(ev){ ev.target.classList.remove("dragging"); },
    allowDrop(ev){ ev.preventDefault(); },
    dropOnColumn(ev, etapaId){
      ev.preventDefault();
      const movelId = ev.dataTransfer.getData("text/plain");
      Act.tentarMoverEtapa(movelId, etapaId);
    },
    moveStageBtn(movelId, delta){
      const f = M.Store.findMovel(movelId); if(!f) return;
      const novaEtapaId = delta>0 ? M.Store.proximaEtapaId(f.m.etapa) : M.Store.etapaAnteriorId(f.m.etapa);
      if(!novaEtapaId) return;
      Act.tentarMoverEtapa(movelId, novaEtapaId);
    },
    tentarMoverEtapa(movelId, novaEtapaId){
      if(!novaEtapaId) return;
      const res = M.Store.moverEtapa(movelId, novaEtapaId, {});
      if(res.ok){ UI.toast("Etapa atualizada: "+M.Store.etapaById(novaEtapaId).nome); Act.openMovel(movelId, true); return; }
      if(res.motivo==="REQUISITOS"){
        Act.modalRequisitosFaltando(movelId, novaEtapaId, res.faltando, res.bloqueioDuro);
      }
    },
    modalRequisitosFaltando(movelId, novaEtapaId, faltando, bloqueioDuro){
      const podeLiberar = M.Store.pode("liberarExcecao");
      const duro = bloqueioDuro && bloqueioDuro.length;
      UI.openModal(`
        <div class="modal-head"><h2>Etapa bloqueada</h2><button class="modal-close" data-close>✕</button></div>
        <div class="modal-body">
          <p class="small muted">Tarefas/requisitos obrigatórios pendentes para avançar para <b>${UI.esc(M.Store.etapaById(novaEtapaId).nome)}</b>:</p>
          <ul style="margin:10px 0 0; padding-left:18px;">${faltando.map(f=>`<li>${UI.esc(f.nome)}${f.tarefa && f.permiteAvancoExcepcional===false?' <span class="chip critical">sem liberação excepcional</span>':''}</li>`).join("")}</ul>
          ${duro? `
            <div class="help-banner" style="background:var(--critical-bg);border-color:var(--critical);color:var(--critical);margin-top:14px;">
              ${UI.icon('lock',14)} Essa(s) tarefa(s) foram marcadas como <b>sem liberação excepcional</b> — nem administrador pode avançar sem executá-las.
            </div>
          ` : !podeLiberar ? `
            <div class="help-banner" style="margin-top:14px;">
              ${UI.icon('lock',14)} Seu perfil (<b>${UI.esc(M.Store.perfilAtual().label)}</b>) não pode liberar avanço excepcional. Peça para PCP, Liderança ou Administrador.
            </div>
          ` : `
            <div class="field" style="margin-top:16px;">
              <label>Usuário autorizando</label>
              <input value="${UI.esc(M.Store.state.usuarioAtual)} — ${UI.esc(M.Store.perfilAtual().label)}" disabled>
            </div>
            <div class="field">
              <label>Motivo da liberação excepcional</label>
              <textarea id="motivoForcar" placeholder="Ex: cliente autorizou seguir sem X, será resolvido em paralelo"></textarea>
            </div>
            <div class="field-row">
              <div class="field"><label>Novo responsável (opcional)</label>
                <select id="novoResponsavelForcar"><option value="">— mantém atual —</option>${M.COLABORADORES.map(c=>`<option>${UI.esc(c.nome)}</option>`).join("")}</select>
              </div>
              <div class="field"><label>Prazo para regularização (opcional)</label><input type="date" id="novoPrazoForcar"></div>
            </div>
          `}
        </div>
        <div class="modal-foot">
          <button class="btn" data-close>Voltar e concluir</button>
          ${(!duro && podeLiberar) ? `<button class="btn primary" id="btnForcar">Solicitar liberação excepcional</button>` : ""}
        </div>
      `);
      if(!duro && podeLiberar){
        document.getElementById("btnForcar").addEventListener("click", ()=>{
          const motivo = document.getElementById("motivoForcar").value.trim() || "(sem motivo informado)";
          const novoResponsavel = document.getElementById("novoResponsavelForcar").value || null;
          const novoPrazo = document.getElementById("novoPrazoForcar").value || null;
          const r = M.Store.moverEtapa(movelId, novaEtapaId, {forcar:true, motivoForcar:motivo, novoResponsavel, novoPrazo});
          UI.closeModal();
          UI.toast(r.ok? "Etapa avançou com ressalva — ficará visível em Pendências/Auditoria." : "Não foi possível liberar.");
        });
      }
    },
    toggleRequisito(movelId, nome){ M.Store.toggleRequisito(movelId, nome); Act.openMovel(movelId, true); },

    // ---------- modal móvel ----------
    openMovel(movelId, skipHistory){
      const f = M.Store.findMovel(movelId); if(!f) return;
      UI.openModal(M.Pages.movelModalHtml(f), {wide:true});
    },
    openAmbiente(ambienteId){
      const f = M.Store.findAmbiente(ambienteId); if(!f) return;
      UI.openModal(M.Pages.ambienteModalHtml(f), {wide:true});
    },

    // ---------- pendências (com fluxo) ----------
    openPendenciaForm(obraId, ambienteId, movelId){
      UI.openModal(M.Pages.pendenciaFormHtml(obraId, ambienteId, movelId), {});
      const form = document.getElementById("formPendencia");
      form.addEventListener("submit", (e)=>{
        e.preventDefault();
        const fd = new FormData(form);
        const mv = fd.get("movelId");
        const f = mv ? M.Store.findMovel(mv) : null;
        M.Store.criarPendencia({
          obraId: fd.get("obraId"), ambienteId: fd.get("ambienteId")||null, movelId: mv||null,
          obraNome: f? f.o.cliente : (M.Store.getObra(fd.get("obraId"))||{}).cliente,
          ambienteNome: f? f.a.nome : "", movelNome: f? f.m.nome : (fd.get("descricaoLivre")||"Item avulso"),
          categoria: fd.get("categoria"), descricao: fd.get("descricao"), responsavel: fd.get("responsavel"),
          fornecedor: fd.get("fornecedor"), prazo: fd.get("prazo")||null, prioridade: fd.get("prioridade"),
          origem: fd.get("origem")||null,
        });
        UI.closeModal(); UI.toast("Pendência criada — fluxo iniciado.");
      });
    },
    setPendenciaStatus(id, status){ M.Store.atualizarStatusPendencia(id, status); UI.toast(status==="RESOLVIDA"?"Pendência resolvida.":"Status atualizado."); },
    avancarFluxo(id){ M.Store.avancarFluxoPendencia(id); UI.toast("Pendência avançou no fluxo."); },
    reabrirPendencia(id){ M.Store.reabrirPendencia(id); UI.toast("Pendência reaberta."); },
    setPendFiltro(campo, val){ M.UIState.pendFiltro[campo]=val; Act.rerender(); },
    togglePendExpandido(id){ M.UIState.pendExpandido = (M.UIState.pendExpandido===id)?null:id; Act.rerender(); },

    // ---------- tarefas ----------
    openTarefaForm(obraId){
      UI.openModal(M.Pages.tarefaFormHtml(obraId), {});
      const form = document.getElementById("formTarefa");
      form.addEventListener("submit",(e)=>{
        e.preventDefault();
        const fd = new FormData(form);
        const mv = fd.get("movelId");
        const f = mv ? M.Store.findMovel(mv) : null;
        const etapa = fd.get("etapa")||null;
        const t = M.Store.criarTarefa({
          obraId: fd.get("obraId"), obraNome:(M.Store.getObra(fd.get("obraId"))||{}).cliente,
          ambienteId: f? f.a.id: null, ambienteNome: f? f.a.nome: null,
          movelId: mv||null, movelNome: f? f.m.nome: null,
          titulo: fd.get("titulo"), etapa: etapa,
          obrigatorio: fd.get("obrigatorio")||"OPCIONAL",
          responsavelPlanejado: fd.get("responsavel"), tipo: fd.get("tipo")||"COMPLEMENTAR",
          instrucoes: fd.get("instrucoes")||"",
        });
        if(fd.get("salvarPadrao")==="on" && etapa){
          M.Store.salvarTarefaComoPadrao(t);
          UI.toast("Tarefa criada e salva também como padrão de "+M.Store.etapaById(etapa).nome+".");
        } else {
          UI.toast("Tarefa criada.");
        }
        UI.closeModal();
      });
    },
    iniciarTarefa(id){ M.Store.iniciarTarefa(id); UI.toast("Tarefa iniciada."); },
    pausarTarefa(id){ M.Store.pausarTarefa(id); UI.toast("Tarefa pausada."); },
    pedirResultado(id){
      const t = M.Store.state.tarefas.find(x=>x.id===id);
      UI.openModal(`
        <div class="modal-head"><h2>Concluir tarefa</h2><button class="modal-close" data-close>✕</button></div>
        <div class="modal-body">
          <p class="small muted">Tudo certo com essa execução?</p>
          <div class="flex-gap" style="margin-top:14px;flex-wrap:wrap;">
            <button class="btn primary" id="rOk">${UI.icon('check',14)} Sim, tudo certo</button>
            <button class="btn" id="rRessalva">${UI.icon('alert',14)} Com ressalva</button>
            <button class="btn danger" id="rRefacao">${UI.icon('wrench',14)} Reportar problema</button>
          </div>
        </div>
      `);
      document.getElementById("rOk").addEventListener("click", ()=>{ M.Store.concluirTarefa(id,"OK"); UI.closeModal(); UI.toast("Tarefa concluída."); });
      document.getElementById("rRessalva").addEventListener("click", ()=>{ M.Store.concluirTarefa(id,"COM_RESSALVA"); UI.closeModal(); UI.toast("Tarefa concluída com ressalva."); });
      document.getElementById("rRefacao").addEventListener("click", ()=> Act.reportarProblema(id));
    },
    reportarProblema(tarefaId){
      UI.openModal(`
        <div class="modal-head"><h2>Reportar problema</h2><button class="modal-close" data-close>✕</button></div>
        <form id="formProblema">
          <div class="modal-body">
            <div class="field"><label>${UI.icon('camera',14)} Foto (opcional)</label><input type="file" accept="image/*" capture="environment" name="foto"></div>
            <div class="field"><label>Origem do problema</label>
              <select name="origem">${M.ORIGENS_PROBLEMA.map(o=>`<option>${o}</option>`).join("")}</select>
            </div>
            <div class="field"><label>Descrição</label><textarea name="descricao" placeholder="O que aconteceu?" required></textarea></div>
          </div>
          <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn danger" type="submit">Criar retrabalho</button></div>
        </form>
      `);
      document.getElementById("formProblema").addEventListener("submit",(e)=>{
        e.preventDefault();
        const fd = new FormData(e.target);
        M.Store.concluirTarefa(tarefaId,"GEROU_REFACAO",{observacao:fd.get("descricao"), origemProblema:fd.get("origem")});
        UI.closeModal(); UI.toast("Retrabalho registrado e visível em Auditoria.");
      });
    },
    setTarefaFiltro(campo,val){ M.UIState.tarefaFiltro[campo]=val; Act.rerender(); },

    // ---------- assistências ----------
    openAssistenciaForm(obraId){
      UI.openModal(M.Pages.assistenciaFormHtml(obraId), {});
      const form = document.getElementById("formAssistencia");
      form.addEventListener("submit",(e)=>{
        e.preventDefault();
        const fd = new FormData(form);
        const obra = M.Store.getObra(fd.get("obraId"));
        M.Store.criarAssistencia({
          obraId: fd.get("obraId"), obraNome: obra? obra.cliente: "", cliente: obra? obra.cliente: fd.get("clienteLivre"),
          ambienteNome: fd.get("ambienteNome"), movelNome: fd.get("movelNome"),
          descricao: fd.get("descricao"), categoria: fd.get("categoria"), origem: fd.get("origem"),
          prioridade: fd.get("prioridade"), responsavel: fd.get("responsavel"), prazo: fd.get("prazo")||null,
        });
        UI.closeModal(); UI.toast("Assistência registrada.");
      });
    },
    setAssistenciaStatus(id, status){ M.Store.atualizarAssistencia(id,{status}); UI.toast("Status da assistência atualizado."); },
    setAssistFiltro(campo,val){ M.UIState.assistFiltro[campo]=val; Act.rerender(); },

    // ---------- montagem ----------
    abrirEncerramentoMontagem(movelId){
      const f = M.Store.findMovel(movelId); if(!f) return;
      UI.openModal(M.Pages.encerramentoMontagemHtml(f), {});
      document.getElementById("btnEncerrar").addEventListener("click", ()=>{
        const checks = document.querySelectorAll(".mont-check:checked").length;
        const total = document.querySelectorAll(".mont-check").length;
        const temPendencias = document.getElementById("temPendencias").checked;
        M.Store.concluirMontagem(movelId, `${checks}/${total}`, temPendencias);
        UI.closeModal();
        UI.toast(temPendencias? "Montagem encerrada com pendências registradas." : "Montagem concluída!");
      });
    },

    // ---------- obra detail ----------
    setObraTab(obraId, tab){ M.UIState.obraTab[obraId]=tab; Act.rerender(); },

    // ---------- nova obra (tela única — seção 6) ----------
    novaObraDropFile(kind, name){
      if(kind==="os") M.UIState.novaObra.osFile = name || "OS_2026_350.pdf";
      else M.UIState.novaObra.orcFile = name || "Orcamento_2026_350.pdf";
      Act.rerender();
    },
    novaObraSimularLeitura(){
      M.UIState.novaObra.osFile = M.UIState.novaObra.osFile || "OS_2026_350.pdf";
      M.UIState.novaObra.orcFile = M.UIState.novaObra.orcFile || "Orcamento_2026_350.pdf";
      M.UIState.novaObra.lido = true;
      Act.rerender();
    },
    novaObraAjustarValor(ambKey, valor){
      M.UIState.novaObra.ambientesAjuste[ambKey] = Number(valor);
      Act.rerender();
    },
    novaObraResetAjustes(){ M.UIState.novaObra.ambientesAjuste = {}; Act.rerender(); },
    novaObraCriar(){
      const nova = M.Pages.novaObraMontar();
      M.Store.criarObra(nova);
      UI.toast("Obra criada com sucesso!");
      M.UIState.novaObra = {osFile:null, orcFile:null, lido:false, ambientesAjuste:{}};
      location.hash = "#/obra/"+nova.id;
    },

    // ---------- calendário ----------
    calNav(delta){
      let m = M.UIState.calMonth + delta, y = M.UIState.calYear;
      if(m<0){ m=11; y--; } if(m>11){ m=0; y++; }
      M.UIState.calMonth = m; M.UIState.calYear = y; Act.rerender();
    },
   toggleCalFiltro(tipo){
  const s = M.UIState.calFiltros;
  if(s.has(tipo)) s.delete(tipo); else s.add(tipo);
  Act.rerender();
},
abrirDiaCalendario(iso){
  UI.openModal(M.Pages.calendarioDiaModalHtml(iso));
},
    // ---------- lotes ----------
    toggleSelecaoLote(id){
      const s = M.UIState.selecaoLote;
      if(s.has(id)) s.delete(id); else s.add(id);
      Act.rerender();
    },

    // ---------- desempenho ----------
    setDesempenhoSel(nome){ M.UIState.desempenhoSel = (M.UIState.desempenhoSel===nome)?null:nome; Act.rerender(); },

    // ---------- auditoria ----------
    setAuditoriaFiltro(campo,val){
      M.UIState.auditoriaFiltro[campo] = (campo==="somenteExcecoes") ? val : val;
      Act.rerender();
    },
    toggleSomenteExcecoes(){ M.UIState.auditoriaFiltro.somenteExcecoes = !M.UIState.auditoriaFiltro.somenteExcecoes; Act.rerender(); },

    // ---------- configurações ----------
    salvarPesosDesempenho(form){
      const fd = new FormData(form);
      const novo = {};
      Object.keys(M.PESOS_DESEMPENHO_DEFAULT).forEach(k=>{ novo[k] = Number(fd.get(k))||0; });
      M.Store.setPesosDesempenho(novo);
      UI.toast("Pesos do índice de desempenho salvos.");
    },
    salvarNotificacoes(form){
      const fd = new FormData(form);
      const novo = {};
      Object.keys(M.NOTIFICACOES_DEFAULT).forEach(k=>{ novo[k] = fd.get(k)==="on"; });
      M.Store.setNotificacoes(novo);
      UI.toast("Preferências de notificação salvas.");
    },
    salvarMeta(input){ M.Store.setMetaMensal(Number(input.value)||0); UI.toast("Meta mensal atualizada."); },
    toggleTvWidget(id){ M.Store.toggleTvWidget(id); },
    restaurarDados(){
      UI.confirm("Isso vai apagar tudo o que foi alterado no protótipo e voltar aos dados de exemplo originais. Continuar?", ()=>{
        M.Store.reset(); UI.toast("Dados de exemplo restaurados."); location.hash = "#/dashboard";
      });
    },

    // ============================================================
    // ETAPAS CONFIGURÁVEIS — Configurações → Processos → Etapas
    // ============================================================
    novaEtapaForm(){
      UI.openModal(M.Pages.etapaFormHtml(null), {wide:true});
      Act._wireEtapaForm(null);
    },
    editarEtapaForm(id){
      const e = M.Store.etapaById(id);
      UI.openModal(M.Pages.etapaFormHtml(e), {wide:true});
      Act._wireEtapaForm(id);
    },
    _wireEtapaForm(id){
      const form = document.getElementById("formEtapa");
      form.addEventListener("submit",(ev)=>{
        ev.preventDefault();
        const fd = new FormData(form);
        const dados = {
          nome: fd.get("nome"), nomeCurto: fd.get("nomeCurto")||fd.get("nome"),
          grupo: fd.get("grupo"), cor: fd.get("cor"),
          tempoEsperadoDias: fd.get("tempoEsperadoDias"), responsavelPadrao: fd.get("responsavelPadrao"),
          pesoValorProcessado: fd.get("pesoValorProcessado"),
          exigeConferencia: fd.get("exigeConferencia")==="on",
          permiteAvancoExcepcional: fd.get("permiteAvancoExcepcional")==="on",
        };
        if(id){ M.Store.editarEtapa(id, dados); UI.toast("Etapa atualizada."); }
        else { M.Store.criarEtapa(dados); UI.toast("Etapa criada."); }
        UI.closeModal();
      });
    },
    duplicarEtapa(id){ M.Store.duplicarEtapa(id); UI.toast("Etapa duplicada."); },
    moverEtapaOrdem(id, direcao){ M.Store.moverEtapaOrdem(id, direcao); },
    desativarEtapa(id){
      const r = M.Store.desativarEtapa(id);
      UI.toast(r.ok ? "Etapa desativada." : "Não é possível desativar: precisa haver ao menos uma etapa ativa.");
    },
    ativarEtapa(id){ M.Store.ativarEtapa(id); UI.toast("Etapa reativada."); },
    excluirEtapaConfirm(id){
      const e = M.Store.etapaById(id);
      if(M.Store.etapaTemHistorico(id)){
        UI.toast(`"${e.nome}" já tem histórico — só pode ser desativada, não excluída definitivamente.`);
        return;
      }
      UI.confirm(`Excluir definitivamente a etapa "${e.nome}"? Essa ação não pode ser desfeita.`, ()=>{
        M.Store.excluirEtapa(id); UI.toast("Etapa excluída.");
      });
    },
    // arraste-e-solte para reordenar etapas
    etapaDragStart(ev, id){ ev.dataTransfer.setData("text/plain", id); ev.currentTarget.classList.add("dragging"); },
    etapaDragEnd(ev){ ev.currentTarget.classList.remove("dragging"); },
    etapaDragOver(ev){ ev.preventDefault(); },
    etapaDrop(ev, targetId){
      ev.preventDefault();
      const draggedId = ev.dataTransfer.getData("text/plain");
      if(!draggedId || draggedId===targetId) return;
      const ord = M.Store.etapasOrdenadas().map(e=>e.id);
      const from = ord.indexOf(draggedId), to = ord.indexOf(targetId);
      if(from<0||to<0) return;
      ord.splice(from,1); ord.splice(to,0,draggedId);
      M.Store.reordenarEtapas(ord);
      UI.toast("Ordem das etapas atualizada.");
    },

    // ---------- requisitos por etapa ----------
    novoRequisitoForm(etapaId){
      UI.openModal(M.Pages.requisitoFormHtml(etapaId, null));
      Act._wireRequisitoForm(etapaId, null);
    },
    editarRequisitoForm(etapaId, reqId){
      const req = (M.Store.requisitosDe(etapaId)||[]).find(r=>r.id===reqId);
      UI.openModal(M.Pages.requisitoFormHtml(etapaId, req));
      Act._wireRequisitoForm(etapaId, reqId);
    },
    _wireRequisitoForm(etapaId, reqId){
      const form = document.getElementById("formRequisito");
      form.addEventListener("submit",(ev)=>{
        ev.preventDefault();
        const fd = new FormData(form);
        const dados = {
          nome: fd.get("nome"), obrigatorio: fd.get("obrigatorio"),
          permiteOverride: fd.get("permiteOverride")==="on",
          exigeEvidencia: fd.get("exigeEvidencia")==="on",
        };
        if(reqId){ M.Store.editarRequisito(etapaId, reqId, dados); UI.toast("Requisito atualizado."); }
        else { M.Store.criarRequisito(etapaId, dados); UI.toast("Requisito criado."); }
        UI.closeModal();
      });
    },
    excluirRequisito(etapaId, reqId){
      UI.confirm("Excluir este requisito da etapa?", ()=>{ M.Store.excluirRequisito(etapaId, reqId); UI.toast("Requisito removido."); });
    },
    reqDrop(ev, etapaId, targetId){
      ev.preventDefault();
      const draggedId = ev.dataTransfer.getData("text/plain");
      if(!draggedId || draggedId===targetId) return;
      const ord = M.Store.requisitosDe(etapaId).map(r=>r.id);
      const from = ord.indexOf(draggedId), to = ord.indexOf(targetId);
      if(from<0||to<0) return;
      ord.splice(from,1); ord.splice(to,0,draggedId);
      M.Store.reordenarRequisitos(etapaId, ord);
    },

    // ---------- tarefas padrão por etapa ----------
    novaTarefaPadraoForm(etapaId){
      UI.openModal(M.Pages.tarefaPadraoFormHtml(etapaId, null));
      Act._wireTarefaPadraoForm(etapaId, null);
    },
    editarTarefaPadraoForm(etapaId, tarefaPadraoId){
      const t = (M.Store.state.tarefasPadrao[etapaId]||[]).find(x=>x.id===tarefaPadraoId);
      UI.openModal(M.Pages.tarefaPadraoFormHtml(etapaId, t));
      Act._wireTarefaPadraoForm(etapaId, tarefaPadraoId);
    },
    _wireTarefaPadraoForm(etapaId, tarefaPadraoId){
      const form = document.getElementById("formTarefaPadrao");
      form.addEventListener("submit",(ev)=>{
        ev.preventDefault();
        const fd = new FormData(form);
        const dados = {
          titulo: fd.get("titulo"), descricao: fd.get("descricao")||"",
          obrigatorio: fd.get("obrigatorio"), responsavelPadrao: fd.get("responsavelPadrao"),
          prazoPadraoDias: fd.get("prazoPadraoDias")? Number(fd.get("prazoPadraoDias")) : null,
          permiteAvancoExcepcional: fd.get("permiteAvancoExcepcional")==="on",
          exigeConferencia: fd.get("exigeConferencia")==="on",
          instrucoes: fd.get("instrucoes")||"",
        };
        if(tarefaPadraoId){ M.Store.editarTarefaPadrao(etapaId, tarefaPadraoId, dados); UI.toast("Tarefa padrão atualizada."); }
        else { M.Store.criarTarefaPadrao(etapaId, dados); UI.toast("Tarefa padrão criada."); }
        UI.closeModal();
      });
    },
    moverTarefaPadraoForm(etapaId, tarefaPadraoId){
      UI.openModal(M.Pages.moverTarefaPadraoFormHtml(etapaId, tarefaPadraoId));
      const form = document.getElementById("formMoverTarefaPadrao");
      form.addEventListener("submit",(ev)=>{
        ev.preventDefault();
        const fd = new FormData(form);
        const novaEtapaId = fd.get("novaEtapaId");
        if(novaEtapaId){ M.Store.moverTarefaPadraoParaEtapa(etapaId, tarefaPadraoId, novaEtapaId); UI.toast("Tarefa padrão movida para outra etapa."); }
        UI.closeModal();
      });
    },
    excluirTarefaPadrao(etapaId, tarefaPadraoId){
      UI.confirm("Excluir esta tarefa padrão da biblioteca?", ()=>{
        M.Store.excluirTarefaPadrao(etapaId, tarefaPadraoId); UI.toast("Tarefa padrão removida.");
      });
    },
  };

  M.Act = Act;
  window.Act = Act; // alias global — usado em handlers inline (onclick="Act....")
})();
