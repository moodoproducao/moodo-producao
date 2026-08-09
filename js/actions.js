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
    obraFoco: {}, // {obraId: ambienteId} — ambiente em destaque na página operacional da obra (plano "obra no centro")
    novaObra: {osFileObj:null, osFileName:null, orcFileObj:null, orcFileName:null,
      lendo:false, lido:false, erro:null, dados:null, enderecoManual:"", ambientesAjuste:{}},
    pendFiltro: {categoria:"", status:""},
    pendExpandido: null,
    tarefaFiltro: {responsavel:"", status:"", obraId:""},
    calMonth: M.TODAY.getMonth(), calYear: M.TODAY.getFullYear(),
    calFiltros: new Set(["PRODUCAO","ENTREGAS","MONTAGENS","PENDENCIAS","FORNECEDORES","ASSISTENCIAS"]),
    desempenhoSel: null,
    selecaoLote: new Set(),
    auditoriaFiltro: {periodo:30, categoria:"", somenteExcecoes:false},
    assistFiltro: {status:""},
    assistExpandido: null,
    tvWidgets: null, // preenchido a partir de M.Store.state se necessário
    fluxoDraft: null, // {tipo, passos:[]} — rascunho em edição do editor de fluxo padrão de pendência (item 12)
  };

  // ---------- upload de arquivos/fotos (Supabase Storage) ----------
  // Compartilhado por: Arquivos do projeto (obra), fotos de pendência/tarefa/assistência.
  // Organiza automaticamente em pastas por obra dentro do bucket "arquivos-obra".
  async function uploadArquivos(fileList, pastaPrefix, max){
    const arquivos = [];
    if(!fileList || !fileList.length) return arquivos;
    if(!(M.Supa && M.Supa.habilitado)){
      UI.toast("Envio de arquivos precisa da nuvem conectada — configure o Supabase antes de anexar arquivos.");
      return arquivos;
    }
    const ok = await M.Supa.ready;
    if(!ok){ UI.toast("Não consegui conectar à nuvem agora — tente enviar o arquivo de novo em instantes."); return arquivos; }
    const arquivosSelecionados = Array.from(fileList).slice(0, max||fileList.length);
    for(const file of arquivosSelecionados){
      const path = `${pastaPrefix}/${Date.now()}_${file.name}`.replace(/\s+/g,"_");
      const { error } = await M.Supa.client.storage.from("arquivos-obra").upload(path, file);
      if(error){ UI.toast("Erro ao enviar "+file.name+": "+error.message); continue; }
      const { data: urlData } = M.Supa.client.storage.from("arquivos-obra").getPublicUrl(path);
      arquivos.push({nome:file.name, url:urlData.publicUrl, tipo:file.type, tamanho:file.size, enviadoPor:M.Store.state.usuarioAtual});
    }
    return arquivos;
  }

  const Act = {
    go(route){ location.hash = route; },
    rerender(){ M.render(); },
    trocarUsuario(nome){ M.Store.setUsuarioAtual(nome); UI.toast("Agora navegando como "+nome+"."); location.hash = "#/dashboard"; },

    // ---------- equipe (grava direto na tabela colaboradores do Supabase) ----------
    openColaboradorForm(id){
      if(!(M.Supa && M.Supa.habilitado)){ UI.toast("Cadastro de equipe precisa da nuvem conectada — configure o Supabase antes."); return; }
      const c = id ? M.COLABORADORES.find(x=>x.id===id) : null;
      UI.openModal(M.Pages.colaboradorFormHtml(c), {});
      const form = document.getElementById("formColaborador");
      form.addEventListener("submit", async (e)=>{
        e.preventDefault();
        const fd = new FormData(form);
        const nome = (fd.get("nome")||"").trim();
        const dados = {
          nome, cargo: fd.get("cargo")||null, telefone: fd.get("telefone")||null, perfil: fd.get("perfil"),
          iniciais: nome.split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0].toUpperCase()).join(""),
        };
        const submitBtn = form.querySelector('button[type=submit]');
        if(submitBtn) submitBtn.disabled = true;
        try{
          if(c){
            const atualizado = await M.Supa.atualizarColaborador(c.id, dados);
            Object.assign(c, atualizado);
          } else {
            const criado = await M.Supa.criarColaborador(dados);
            M.COLABORADORES.push(criado);
          }
          M.Store.notify();
          UI.closeModal(); UI.toast(c? "Colaborador atualizado.":"Colaborador criado.");
        }catch(err){
          UI.toast("Erro ao salvar: "+(err.message||"tente de novo"));
          if(submitBtn) submitBtn.disabled = false;
        }
      });
    },
    async desativarColaborador(id){
      const c = M.COLABORADORES.find(x=>x.id===id); if(!c) return;
      try{
        const atualizado = await M.Supa.atualizarColaborador(id, {ativo:false});
        Object.assign(c, atualizado);
        M.Store.notify(); UI.toast("Colaborador desativado.");
      }catch(err){ UI.toast("Erro ao desativar: "+(err.message||"tente de novo")); }
    },
    async reativarColaborador(id){
      const c = M.COLABORADORES.find(x=>x.id===id); if(!c) return;
      try{
        const atualizado = await M.Supa.atualizarColaborador(id, {ativo:true});
        Object.assign(c, atualizado);
        M.Store.notify(); UI.toast("Colaborador reativado.");
      }catch(err){ UI.toast("Erro ao reativar: "+(err.message||"tente de novo")); }
    },

    // ---------- responsável ----------
    setResponsavel(movelId, sel){ M.Store.setResponsavel(movelId, sel.value); UI.toast("Responsável atualizado."); },

    // ---------- página da obra (foco de ambiente + avanço em lote) ----------
    focarAmbiente(obraId, ambienteId){ M.UIState.obraFoco[obraId] = ambienteId; Act.rerender(); },
    // "Kanban vira mapa" (plano obra no centro): clicar num card de ambiente/móvel
    // no Kanban leva direto pra página operacional da obra, já com o ambiente
    // certo em foco — em vez de abrir um modal por cima do Kanban. Reaproveita o
    // mesmo M.UIState.obraFoco usado por focarAmbiente/avancarEtapaAmbiente.
    irParaObra(obraId, ambienteId){
      if(ambienteId) M.UIState.obraFoco[obraId] = ambienteId;
      Act.go('#/obra/'+obraId);
    },
    avancarEtapaAmbiente(obraId, ambienteId, etapaAtualId){
      const f = M.Store.findAmbiente(ambienteId); if(!f) return;
      const alvos = f.a.moveis.filter(m=>m.etapa===etapaAtualId);
      if(!alvos.length) return;
      const novaEtapaId = M.Store.proximaEtapaId(etapaAtualId);
      // se algum dos móveis desse ambiente/etapa está travado, mostra o motivo do
      // primeiro (os outros teriam o mesmo requisito de etapa, quase sempre) em vez
      // de avançar parcialmente sem avisar.
      const bloqueado = alvos.map(m=>({m, check:M.Store.checarRequisitos(m)})).find(x=>!x.check.liberado);
      if(bloqueado){ Act.modalRequisitosFaltando(bloqueado.m.id, novaEtapaId, bloqueado.check.faltando, bloqueado.check.bloqueioDuro); return; }
      let ok=0, total=alvos.length;
      alvos.forEach(m=>{ const r = M.Store.moverEtapa(m.id, novaEtapaId, {}); if(r.ok) ok++; });
      UI.toast(ok===total? `${ok===1?'Móvel avançou':'Móveis avançaram'} para ${M.Store.etapaById(novaEtapaId).nome}.` : `${ok}/${total} avançaram — o resto ficou pra trás, confira o bloqueio.`);
    },

    // ---------- kanban ----------
    setKanbanView(v){ M.UIState.kanbanView = v; Act.rerender(); },
    dragStart(ev, movelId){ ev.dataTransfer.setData("text/plain", movelId); ev.target.classList.add("dragging"); },
    dragEnd(ev){
      ev.target.classList.remove("dragging");
      // rede de segurança: se o drag foi cancelado (ex.: Esc) em cima de uma
      // coluna, garante que nenhum destaque "drag-over" fique preso na tela.
      document.querySelectorAll(".column.drag-over").forEach(c=>c.classList.remove("drag-over"));
    },
    allowDrop(ev){ ev.preventDefault(); },
    // feedback visual de onde o cartão vai cair — sem isto, arrastar num board
    // de várias colunas fica "cego" (não dá pra saber se soltar ali vai contar).
    columnDragEnter(ev){ ev.preventDefault(); ev.currentTarget.classList.add("drag-over"); },
    columnDragLeave(ev){ ev.currentTarget.classList.remove("drag-over"); },
    // CORREÇÃO/melhoria (item 11 da lista): antes, soltar o cartão numa coluna
    // já efetivava a mudança de etapa na hora — um deslize sem querer no drag
    // já bastava pra mexer na produção de verdade. Agora solta = pedido, não
    // efetivação: sempre pede confirmação antes de chamar Store.moverEtapa
    // (a checagem de requisitos/liberação excepcional continua rodando normal
    // depois que a pessoa confirma, dentro de tentarMoverEtapa).
    dropOnColumn(ev, etapaId){
      ev.preventDefault();
      const movelId = ev.dataTransfer.getData("text/plain");
      const f = M.Store.findMovel(movelId); if(!f) return;
      if(f.m.etapa===etapaId) return; // soltou na mesma coluna: nada a fazer
      const etapaDestino = M.Store.etapaById(etapaId);
      const etapaAtual = M.Store.etapaById(f.m.etapa);
      const indoParaFrente = M.Store.posicaoEtapa(etapaId) > M.Store.posicaoEtapa(f.m.etapa);
      UI.confirm(
        `Mover "${f.m.nome}" de "${etapaAtual.nome}" para "${etapaDestino.nome}"${indoParaFrente?'':' (voltar etapa)'}?`,
        ()=> Act.tentarMoverEtapa(movelId, etapaId)
      );
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
    resolverRessalva(movelId){
      M.Store.resolverRessalva(movelId);
      UI.toast("Ressalva marcada como resolvida.");
      Act.openMovel(movelId, true);
    },

    // ---------- modal móvel ----------
    openMovel(movelId, skipHistory){
      const f = M.Store.findMovel(movelId); if(!f) return;
      UI.openModal(M.Pages.movelModalHtml(f), {wide:true});
    },
    openAmbiente(ambienteId){
      const f = M.Store.findAmbiente(ambienteId); if(!f) return;
      UI.openModal(M.Pages.ambienteModalHtml(f), {wide:true});
    },

    // ---------- componentes críticos / exceções (plano "obra no centro") ----------
    abrirFormComponente(movelId){
      UI.openModal(M.Pages.componenteFormHtml(movelId), {});
      const form = document.getElementById("formComponente");
      form.addEventListener("submit", (e)=>{
        e.preventDefault();
        const fd = new FormData(form);
        M.Store.criarComponenteCritico(movelId, {
          nome: fd.get("nome"), tipo: fd.get("tipo"), fornecedor: fd.get("fornecedor")||"",
          responsavel: fd.get("responsavel")||"", prazo: fd.get("prazo")||null, observacao: fd.get("observacao")||"",
        });
        UI.toast("Componente criado — pendência aberta.");
        Act._voltar(movelId);
      });
    },
    resolverComponente(movelId, componenteId){
      M.Store.mudarStatusComponente(movelId, componenteId, "RESOLVIDO");
      UI.toast("Componente marcado como resolvido.");
      Act.openMovel(movelId, true);
    },
    reabrirComponente(movelId, componenteId){
      M.Store.mudarStatusComponente(movelId, componenteId, "AGUARDANDO");
      UI.toast("Componente reaberto.");
      Act.openMovel(movelId, true);
    },

    // ---------- pendências (com fluxo) ----------
    openPendenciaForm(obraId, ambienteId, movelId){
      UI.openModal(M.Pages.pendenciaFormHtml(obraId, ambienteId, movelId), {});
      const form = document.getElementById("formPendencia");
      form.addEventListener("submit", async (e)=>{
        e.preventDefault();
        const fd = new FormData(form);
        const mv = fd.get("movelId");
        const f = mv ? M.Store.findMovel(mv) : null;
        const submitBtn = form.querySelector('button[type=submit]');
        if(submitBtn) submitBtn.disabled = true;
        const fotos = await uploadArquivos(fd.getAll("fotos").filter(x=>x && x.size), (fd.get("obraId")||"avulsas")+"/pendencias");
        M.Store.criarPendencia({
          obraId: fd.get("obraId"), ambienteId: fd.get("ambienteId")||null, movelId: mv||null,
          obraNome: f? f.o.cliente : (M.Store.getObra(fd.get("obraId"))||{}).cliente,
          ambienteNome: f? f.a.nome : "", movelNome: f? f.m.nome : (fd.get("descricaoLivre")||"Item avulso"),
          categoria: fd.get("categoria"), descricao: fd.get("descricao"), responsavel: fd.get("responsavel"),
          fornecedor: fd.get("fornecedor"), prazo: fd.get("prazo")||null, prioridade: fd.get("prioridade"),
          origem: fd.get("origem")||null, fotos,
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
      form.addEventListener("submit", async (e)=>{
        e.preventDefault();
        const fd = new FormData(form);
        const mv = fd.get("movelId");
        const f = mv ? M.Store.findMovel(mv) : null;
        const etapa = fd.get("etapa")||null;
        const fotos = await uploadArquivos(fd.getAll("fotos").filter(x=>x && x.size), (fd.get("obraId")||"geral")+"/tarefas");
        const t = M.Store.criarTarefa({
          obraId: fd.get("obraId"), obraNome:(M.Store.getObra(fd.get("obraId"))||{}).cliente,
          ambienteId: f? f.a.id: null, ambienteNome: f? f.a.nome: null,
          movelId: mv||null, movelNome: f? f.m.nome: null,
          titulo: fd.get("titulo"), etapa: etapa,
          obrigatorio: fd.get("obrigatorio")||"OPCIONAL",
          responsavelPlanejado: fd.get("responsavel"), tipo: fd.get("tipo")||"COMPLEMENTAR",
          instrucoes: fd.get("instrucoes")||"", fotos,
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
    abrirDetalheTarefa(id, voltarMovelId){
      const t = M.Store.state.tarefas.find(x=>x.id===id); if(!t) return;
      UI.openModal(M.Pages.tarefaDetalheModalHtml(t, voltarMovelId));
    },
    // voltarMovelId (opcional): quando a tarefa é aberta/concluída de dentro do
    // modal do móvel (checklist de componentes virou tarefa — item 9), depois da
    // ação a gente volta pro MESMO modal do móvel atualizado, em vez de fechar
    // tudo — o modal do móvel não se re-renderiza sozinho quando o estado muda
    // (é um overlay à parte do resto da tela), então precisa disto explicitamente.
    _voltar(voltarMovelId){ voltarMovelId ? Act.openMovel(voltarMovelId, true) : UI.closeModal(); },
    iniciarTarefa(id, voltarMovelId){ M.Store.iniciarTarefa(id); UI.toast("Tarefa iniciada."); Act._voltar(voltarMovelId); },
    pausarTarefa(id){ M.Store.pausarTarefa(id); UI.toast("Tarefa pausada."); },
    pedirResultado(id, voltarMovelId){
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
      document.getElementById("rOk").addEventListener("click", ()=>{ M.Store.concluirTarefa(id,"OK"); Act._voltar(voltarMovelId); UI.toast("Tarefa concluída."); });
      document.getElementById("rRessalva").addEventListener("click", ()=>{ M.Store.concluirTarefa(id,"COM_RESSALVA"); Act._voltar(voltarMovelId); UI.toast("Tarefa concluída com ressalva."); });
      document.getElementById("rRefacao").addEventListener("click", ()=> Act.reportarProblema(id, voltarMovelId));
    },
    reportarProblema(tarefaId, voltarMovelId){
      UI.openModal(`
        <div class="modal-head"><h2>Reportar problema</h2><button class="modal-close" data-close>✕</button></div>
        <form id="formProblema">
          <div class="modal-body">
            ${UI.fotoFieldHtml("fotos")}
            <div class="field"><label>Origem do problema</label>
              <select name="origem">${M.ORIGENS_PROBLEMA.map(o=>`<option>${o}</option>`).join("")}</select>
            </div>
            <div class="field"><label>Descrição</label><textarea name="descricao" placeholder="O que aconteceu?" required></textarea></div>
          </div>
          <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn danger" type="submit">Criar retrabalho</button></div>
        </form>
      `);
      document.getElementById("formProblema").addEventListener("submit", async (e)=>{
        e.preventDefault();
        const fd = new FormData(e.target);
        const fotos = await uploadArquivos(fd.getAll("fotos").filter(x=>x && x.size), tarefaId+"/problema");
        M.Store.concluirTarefa(tarefaId,"GEROU_REFACAO",{observacao:fd.get("descricao"), origemProblema:fd.get("origem"), fotos});
        Act._voltar(voltarMovelId); UI.toast("Retrabalho registrado e visível em Auditoria.");
      });
    },
    setTarefaFiltro(campo,val){ M.UIState.tarefaFiltro[campo]=val; Act.rerender(); },
    // item 9 do backlog: atalho da aba Tarefas da obra pra a tela geral, já filtrada.
    verTarefasDaObra(obraId){
      M.UIState.tarefaFiltro = {responsavel:"", status:"", obraId};
      location.hash = "#/tarefas";
    },

    // ---------- assistências ----------
    openAssistenciaForm(obraId){
      UI.openModal(M.Pages.assistenciaFormHtml(obraId), {});
      const form = document.getElementById("formAssistencia");
      form.addEventListener("submit", async (e)=>{
        e.preventDefault();
        const fd = new FormData(form);
        const obra = M.Store.getObra(fd.get("obraId"));
        const fotos = await uploadArquivos(fd.getAll("fotos").filter(x=>x && x.size), (fd.get("obraId")||"avulsas")+"/assistencias");
        M.Store.criarAssistencia({
          obraId: fd.get("obraId"), obraNome: obra? obra.cliente: "", cliente: obra? obra.cliente: fd.get("clienteLivre"),
          ambienteNome: fd.get("ambienteNome"), movelNome: fd.get("movelNome"),
          descricao: fd.get("descricao"), categoria: fd.get("categoria"), origem: fd.get("origem"),
          prioridade: fd.get("prioridade"), responsavel: fd.get("responsavel"), prazo: fd.get("prazo")||null, fotos,
        });
        UI.closeModal(); UI.toast("Assistência registrada.");
      });
    },
    setAssistenciaStatus(id, status){ M.Store.atualizarAssistencia(id,{status}); UI.toast("Status da assistência atualizado."); },
    setAssistFiltro(campo,val){ M.UIState.assistFiltro[campo]=val; Act.rerender(); },
    toggleAssistExpandido(id){ M.UIState.assistExpandido = (M.UIState.assistExpandido===id)?null:id; Act.rerender(); },

    // ---------- montagem ----------
    abrirEncerramentoMontagem(movelId){
      const f = M.Store.findMovel(movelId); if(!f) return;
      UI.openModal(M.Pages.encerramentoMontagemHtml(f), {});
      document.getElementById("btnEncerrar").addEventListener("click", ()=>{
        const checks = document.querySelectorAll(".mont-check:checked").length;
        const total = document.querySelectorAll(".mont-check").length;
        const temPendenciasInformado = document.getElementById("temPendencias").checked;
        const r = M.Store.concluirMontagem(movelId, `${checks}/${total}`, temPendenciasInformado);
        UI.closeModal();
        UI.toast(r.temPendencias? "Montagem encerrada como concluída com pendências — segue visível em Para Finalizar." : "Montagem concluída!");
      });
    },

    // ---------- obra detail ----------
    setObraTab(obraId, tab){ M.UIState.obraTab[obraId]=tab; Act.rerender(); },
    async enviarArquivoObra(obraId, inputEl){
      const arquivos = await uploadArquivos(Array.from(inputEl.files||[]), obraId+"/arquivos", 5);
      arquivos.forEach(a=> M.Store.adicionarArquivo(obraId, a));
      if(arquivos.length) UI.toast(arquivos.length>1? "Arquivos enviados.":"Arquivo enviado.");
      inputEl.value = "";
    },
    removerArquivo(obraId, arquivoId){
      UI.confirm("Remover este arquivo da obra?", ()=>{ M.Store.removerArquivo(obraId, arquivoId); UI.toast("Arquivo removido."); });
    },

    // ---------- nova obra (tela única — seção 6, leitura real de PDF) ----------
    novaObraArquivoSelecionado(kind, file){
      if(!file) return;
      const w = M.UIState.novaObra;
      if(kind==="os"){ w.osFileObj = file; w.osFileName = file.name; }
      else { w.orcFileObj = file; w.orcFileName = file.name; }
      // troca de arquivo depois de já ter lido: limpa o resultado anterior,
      // senão a tela ficaria mostrando dados de um PDF que não é mais esse.
      w.lido = false; w.dados = null; w.erro = null;
      Act.rerender();
    },
    async novaObraLerPdf(){
      const w = M.UIState.novaObra;
      w.lendo = true; w.erro = null; Act.rerender();
      try{
        const [orcLinhas, osLinhas] = await Promise.all([
          w.orcFileObj ? M.PdfImport.extrairLinhas(w.orcFileObj) : Promise.resolve(null),
          w.osFileObj ? M.PdfImport.extrairLinhas(w.osFileObj) : Promise.resolve(null),
        ]);
        const orcParsed = orcLinhas ? M.PdfImport.parseDocumento(orcLinhas) : null;
        const osParsed = osLinhas ? M.PdfImport.parseDocumento(osLinhas) : null;
        const dados = M.PdfImport.combinar(orcParsed, osParsed);
        if(!dados){
          w.erro = "Não consegui identificar os ambientes/itens neste PDF. Confira se é o formato padrão da Moodo (Orçamento ou Ordem de Serviço).";
        } else {
          w.dados = dados;
          w.lido = true;
        }
      }catch(err){
        console.error("[Moodo] erro ao ler PDF:", err);
        w.erro = err.message || "Erro ao ler o PDF.";
      }
      w.lendo = false;
      Act.rerender();
    },
    novaObraRecomecar(){
      M.UIState.novaObra = {osFileObj:null, osFileName:null, orcFileObj:null, orcFileName:null,
        lendo:false, lido:false, erro:null, dados:null, enderecoManual:"", ambientesAjuste:{}};
      Act.rerender();
    },
    novaObraSetEndereco(valor){ M.UIState.novaObra.enderecoManual = valor; },
    novaObraSetVendido(valor){
      M.UIState.novaObra.dados.valorFinalVendido = Number(valor);
      M.UIState.novaObra.ambientesAjuste = {}; // valor vendido mudou: rateio automático recalcula do zero
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
      Act.novaObraRecomecar();
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
    togglePermissao(perfilKey, acao, valor){
      const r = M.Store.setPermissao(perfilKey, acao, valor);
      if(!r.ok){
        if(r.motivo==="AUTOBLOQUEIO") UI.toast("Você não pode tirar de si mesmo o acesso a Configurações/Permissões — peça pra outro administrador fazer essa mudança.");
        else UI.toast("Sem permissão para editar.");
        Act.rerender(); // desfaz visualmente o clique no checkbox
        return;
      }
      UI.toast(`Permissão "${acao}" do perfil "${M.perfilDef(perfilKey).label}" ${valor?"liberada":"bloqueada"}.`);
    },
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

    // ---------- editor de fluxo padrão de pendência (item 12) ----------
    editarFluxoPadrao(tipo){
      const atual = M.Store.state.fluxosPadrao[tipo] || [];
      M.UIState.fluxoDraft = { tipo, passos: atual.slice() }; // rascunho isolado — não mexe no Store até Salvar
      UI.openModal(M.Pages.fluxoPadraoFormHtml());
    },
    // digitar num passo não precisa reabrir o modal (perderia o foco/cursor) —
    // só atualiza o rascunho em memória; o valor já aparece no próprio input.
    editarPassoFluxo(idx, valor){
      if(!M.UIState.fluxoDraft) return;
      M.UIState.fluxoDraft.passos[idx] = valor;
    },
    moverPassoFluxo(idx, delta){
      const d = M.UIState.fluxoDraft; if(!d) return;
      const novo = idx+delta; if(novo<0 || novo>=d.passos.length) return;
      const [item] = d.passos.splice(idx,1);
      d.passos.splice(novo,0,item);
      UI.openModal(M.Pages.fluxoPadraoFormHtml());
    },
    excluirPassoFluxo(idx){
      const d = M.UIState.fluxoDraft; if(!d || d.passos.length<=1) return;
      d.passos.splice(idx,1);
      UI.openModal(M.Pages.fluxoPadraoFormHtml());
    },
    adicionarPassoFluxo(){
      const d = M.UIState.fluxoDraft; if(!d) return;
      d.passos.push("Novo passo");
      UI.openModal(M.Pages.fluxoPadraoFormHtml());
    },
    cancelarEdicaoFluxo(){ M.UIState.fluxoDraft = null; },
    salvarFluxoPadrao(){
      const d = M.UIState.fluxoDraft; if(!d) return;
      const passos = d.passos.map(p=>(p||"").trim()).filter(Boolean);
      if(!passos.length){ UI.toast("O fluxo precisa ter pelo menos um passo."); return; }
      M.Store.setFluxoPadrao(d.tipo, passos);
      M.UIState.fluxoDraft = null;
      UI.closeModal();
      UI.toast("Fluxo padrão atualizado — pendências novas dessa categoria já seguem o novo caminho.");
    },
  };

  M.Act = Act;
  window.Act = Act; // alias global — usado em handlers inline (onclick="Act....")
})();
