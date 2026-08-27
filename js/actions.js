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
    // FASE 7.5 (Nova Obra V2) — wizard em 5 etapas (Início/Dados/Ambientes e
    // móveis/Revisão/Ativar). obraId só é preenchido depois do primeiro
    // "Salvar rascunho"/"Ativar obra" — antes disso o rascunho vive só aqui
    // em UIState, nada é gravado no Store (ver comentário completo em
    // js/pages/novaObra.js e Act.novaObra* em js/actions.js).
    novaObra: {
      obraId:null, step:"inicio", modo:null,
      // ---- import (PDF) ----
      osFileObj:null, osFileName:null, orcFileObj:null, orcFileName:null,
      lendo:false, lido:false, erro:null, dados:null, ambientesAjuste:{},
      // ---- identificação (comum a import e manual) ----
      nomeManual:"", numeroOSManual:"", clienteManual:"", responsavelProducao:"",
      enderecoManual:"", observacoesManual:"", dataEntregaPrevistaManual:"", componentesSelecionados:{},
      // ---- estrutura manual (só usada quando modo==="manual") ----
      ambientesManual:[],
      osDuplicadaConfirmada:false,
      // CORREÇÃO PÓS-ENTREGA (item 2) — "extração é semente, edição humana
      // é soberana": true depois da primeira conversão import→ambientesManual
      // (ver M.Pages.novaObraSincronizarEstruturaImportada). Nunca mais
      // reconstrói do PDF depois disso, mesmo se a pessoa voltar pra
      // Estrutura e avançar de novo.
      estruturaImportadaSincronizada:false,
    },
    // FASE 4 (§7 handoff): filtros exatos — status/impacto/obraId/responsavel
    // + busca livre. categoria/tipo/prioridade/bloqueiaFechamento saíram da
    // barra (ver comentário em pages/pendencias.js filtrosHtml).
    pendFiltro: {status:"", impacto:"", obraId:"", responsavel:"", busca:""},
    pendExpandido: null,
    pendView: "lista", // "lista" | "kanban" (handoff — Fase 2)
    // FASE 4 (§7 handoff): null = usa o padrão do perfil (Produção/Montador
    // abrem em "Minhas"); true/false = escolha explícita da pessoa nesta sessão.
    pendSomenteMinhas: null,
    producaoView: "macro", // "macro" | "kanban" (handoff — Fase 3: "painel de obras, macro por padrão")
    producaoFiltros: new Set(), // chips combináveis: EM_PRODUCAO/EM_RISCO/PARADA/CRITICAS/ENTREGAS_7D
    producaoExpandidas: new Set(), // obraIds com a linha expandida (ambientes só aparecem sob demanda)
    tarefaFiltro: {responsavel:"", status:"", obraId:""},
    calMonth: M.TODAY.getMonth(), calYear: M.TODAY.getFullYear(),
    calFiltros: new Set(["PRODUCAO","ENTREGAS","MONTAGENS","PENDENCIAS","FORNECEDORES","ASSISTENCIAS"]),
    desempenhoSel: null,
    selecaoLote: new Set(),
    auditoriaFiltro: {periodo:30, categoria:"", somenteExcecoes:false, area:"", usuario:"", obraId:"", view:"cronologico"},
    assistFiltro: {status:"", garantia:""},
    assistExpandido: null,
    // FASE 7 (Assistências V2) — filtro/expansão da tela nova (desktop lista
    // + detalhe, mobile Atendimentos). Efêmero, mesmo padrão de assistFiltro
    // acima — nunca persistido em localStorage/Supabase.
    atendFiltro: {status:"", garantia:"", grupo:"", obraId:"", busca:""},
    atendExpandidoId: null,
    tvWidgets: null, // preenchido a partir de M.Store.state se necessário
    fluxoDraft: null, // {tipo, passos:[]} — rascunho em edição do editor de fluxo padrão de pendência (item 12)
    // FASE 2 (Navegação V2 — ajuste pós-aprovação, checagem de mobile
    // pequeno): painel "Mais" da barra mobile, usado só quando o menu do
    // perfil não cabe em 375/360px sem cortar item (hoje só o Admin, 7
    // itens — ver comentário completo em js/main.js navHtml()).
    mobileMaisAberto: false,
    // REFINO VISUAL V2 (§8/§9 — "Ver todos"/expansão sob demanda): estado
    // genérico e reusável entre páginas — cada seção "top N com Ver todos"
    // (Montagem Opção A, grupos de Pendências) usa uma chave própria
    // ("montagem:TRAVADO", "pend:CRITICAS", ...), sem precisar de um campo
    // de UIState dedicado por página/seção. Nada disto é persistido
    // (localStorage/Supabase) — é só estado efêmero de navegação, do mesmo
    // jeito que pendExpandido/producaoExpandidas já são hoje.
    expandSections: new Set(),
    // FASE 6 (Agenda V2) — estado de navegação da tela nova (efêmero, igual
    // a calMonth/calYear do Calendário legado — nunca persistido).
    agendaView: "SEMANA", // Semana é a visão operacional principal (§7)
    agendaAno: M.TODAY.getFullYear(), agendaMes: M.TODAY.getMonth(),
    agendaSemanaInicio: null, // preenchido no boot (ver fim deste arquivo) — segunda-feira da semana atual
    agendaDia: M.todayISO(),
    agendaFiltros: {tipo:"", equipe:"", obraId:"", status:""},
    agendaEventoSelId: null,
    agendaMobileTab: "HOJE",
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
      arquivos.push({nome:file.name, url:urlData.publicUrl, tipo:file.type, tamanho:file.size,
        enviadoPor:M.Store.state.usuarioAtual, data:new Date().toISOString(), principal:arquivos.length===0});
    }
    return arquivos;
  }

  const Act = {
    go(route){
      // HOTFIX pós-publicação: quando `route` já é o hash atual, o navegador
      // NUNCA dispara "hashchange" (é assim que location.hash sempre
      // funcionou) — e é só o listener de hashchange (main.js) que chama
      // render(). Isso é inofensivo na maioria dos Act.go(...) (troca de
      // página de verdade sempre muda o hash), mas quebra os call-sites que
      // usam Act.go pra "voltar pra tela atual, só que com um filtro/aba
      // diferente já setado antes" (ex.: M.Drawer.abrirCompletoPendencia
      // chamando Act.go('#/pendencias') a partir da própria tela de
      // Pendências) — o estado (filtro, aba) fica gravado certinho, mas a
      // tela continua mostrando o que já estava, até QUALQUER outra ação
      // não relacionada forçar um re-render por fora. Achado no smoke test
      // em produção testando o Detalhe Rápido com uma pendência real.
      // Forçar o render manualmente quando o hash não muda fecha essa
      // classe inteira de bug, sem precisar caçar call-site por call-site.
      if(location.hash === route){ M.render(); return; }
      location.hash = route;
    },
    rerender(){ M.render(); },
    trocarUsuario(nome){ M.Store.setUsuarioAtual(nome); UI.toast("Agora navegando como "+nome+"."); location.hash = "#/hoje"; },
    toggleMobileMais(){ M.UIState.mobileMaisAberto = !M.UIState.mobileMaisAberto; Act.rerender(); },

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

    // ---------- Produção macro (handoff — Fase 3) ----------
    setProducaoView(v){ M.UIState.producaoView = v; Act.rerender(); },
    toggleProducaoFiltro(key){
      const s = M.UIState.producaoFiltros;
      if(s.has(key)) s.delete(key); else s.add(key);
      Act.rerender();
    },
    toggleProducaoExpandida(obraId){
      const s = M.UIState.producaoExpandidas;
      if(s.has(obraId)) s.delete(obraId); else s.add(obraId);
      Act.rerender();
    },

    // FASE 7.5 (Detalhe Rápido, item 21): clicar numa pendência em QUALQUER
    // lugar (Hoje, Pendências lista/Kanban, Obra, Montagem, Assistência)
    // abre o mesmo Context Drawer — nunca navega automaticamente. Esta
    // função (chamada de Hoje desde a Fase 3) antes pulava direto pra
    // #/pendencias com o item expandido lá; esse era exatamente o
    // comportamento que o pedido classificou como bug ("muitos cards só
    // navegam ou não fazem nada").
    abrirPendenciaEm(pendId){ M.Drawer.abrirPendencia(pendId); },

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
        const ambId = fd.get("ambienteId")||null;
        const f = mv ? M.Store.findMovel(mv) : null;
        // ambiente sem móvel escolhido (pendência avulsa dentro de um
        // ambiente com contexto herdado) ainda deve trazer o nome do ambiente.
        const fAmb = (!f && ambId) ? M.Store.findAmbiente(ambId) : null;
        const submitBtn = form.querySelector('button[type=submit]');
        if(submitBtn) submitBtn.disabled = true;
        const fotos = await uploadArquivos(fd.getAll("fotos").filter(x=>x && x.size), (fd.get("obraId")||"avulsas")+"/pendencias");
        const r = M.Store.criarPendencia({
          obraId: fd.get("obraId"), ambienteId: ambId, movelId: mv||null,
          obraNome: f? f.o.cliente : (M.Store.getObra(fd.get("obraId"))||{}).cliente,
          ambienteNome: f? f.a.nome : (fAmb? fAmb.a.nome : ""), movelNome: f? f.m.nome : (fd.get("descricaoLivre")||"Item avulso"),
          categoria: fd.get("categoria"), tipo: fd.get("tipo")||null, impacto: fd.get("impacto")||null,
          descricao: fd.get("descricao"), responsavel: fd.get("responsavel"),
          fornecedor: fd.get("fornecedor"), prazo: fd.get("prazo")||null, prioridade: fd.get("prioridade"),
          origem: fd.get("origem")||null, fotos,
        });
        if(!r.ok){ UI.toast("Seu perfil não tem permissão para criar pendência."); if(submitBtn) submitBtn.disabled = false; return; }
        UI.closeModal(); UI.toast("Pendência criada — fluxo iniciado.");
      });
    },
    setPendenciaStatus(id, status){
      // "Resolvida" pede fotos de resolução (handoff) — abre um passo extra em
      // vez de resolver na hora; qualquer outro status muda direto.
      if(status==="RESOLVIDA"){ Act.abrirResolverPendencia(id); return; }
      const r = M.Store.atualizarStatusPendencia(id, status);
      if(!r.ok){ UI.toast("Seu perfil não tem permissão para alterar esta pendência."); Act.rerender(); return; }
      UI.toast("Status atualizado.");
    },
    avancarFluxo(id){
      const r = M.Store.avancarFluxoPendencia(id);
      if(!r.ok){ UI.toast("Seu perfil não tem permissão para avançar esta pendência."); Act.rerender(); return; }
      UI.toast("Pendência avançou no fluxo.");
    },
    reabrirPendencia(id){
      const r = M.Store.reabrirPendencia(id);
      if(!r.ok){ UI.toast("Seu perfil não tem permissão para reabrir pendência."); Act.rerender(); return; }
      UI.toast("Pendência reaberta.");
    },
    setPendFiltro(campo, val){ M.UIState.pendFiltro[campo]=val; Act.rerender(); },
    limparPendFiltros(){ M.UIState.pendFiltro = {status:"", impacto:"", obraId:"", responsavel:"", busca:""}; Act.rerender(); },
    // REFINO VISUAL V2 — toggle genérico de "Ver todos" (§8/§9). Usado por
    // UI.secaoComVerTodos (js/ui.js) — não referenciar diretamente o Set,
    // pra manter um único ponto de entrada.
    toggleExpand(key){
      const s = M.UIState.expandSections;
      if(s.has(key)) s.delete(key); else s.add(key);
      Act.rerender();
    },
    setPendView(v){ M.UIState.pendView = v; Act.rerender(); },
    // FASE 4 (§7 handoff): toggle real Minhas/Todas — antes era fixo por perfil.
    // FASE 4 (AJUSTE): Produção não pode "Todas" nem manipulando estado —
    // o guard de verdade é M.Store.pendenciasVisiveis() (a tela ignora esse
    // valor pra esse perfil de qualquer forma), mas nem deixa a intenção
    // ficar guardada aqui, pra não sugerir uma opção que não existe de fato.
    setPendSomenteMinhas(v){
      const colab = M.colabByNome(M.Store.state.usuarioAtual);
      if(colab && colab.perfil==="OPERADOR" && !v) return;
      M.UIState.pendSomenteMinhas = !!v; Act.rerender();
    },
    togglePendExpandido(id){ M.UIState.pendExpandido = (M.UIState.pendExpandido===id)?null:id; Act.rerender(); },
    // FASE 4 (§6/§10 handoff): "pendencia.atribuir" já existia na matriz, sem
    // função nenhuma usando — reassignar responsável direto na tela.
    atribuirPendencia(id, novoResponsavel){
      const r = M.Store.atribuirPendencia(id, novoResponsavel);
      if(!r.ok){ UI.toast("Seu perfil não tem permissão para atribuir esta pendência."); Act.rerender(); return; }
      UI.toast("Responsável atualizado.");
    },
    // FASE 4 (§2 handoff): "possibilidade de adicionar [fotos] depois" — sem
    // precisar reabrir/editar status.
    async adicionarFotosPendencia(id, destino){
      const p = M.Store.state.pendencias.find(x=>x.id===id); if(!p) return;
      const input = document.createElement("input");
      input.type = "file"; input.accept = "image/*"; input.multiple = true; input.capture = "environment";
      input.onchange = async ()=>{
        if(!input.files || !input.files.length) return;
        UI.toast("Enviando foto(s)...");
        const fotos = await uploadArquivos(input.files, (p.obraId||"avulsas")+"/pendencias"+(destino==="resolucao"?"-resolucao":""));
        if(!fotos.length) return;
        const r = M.Store.adicionarFotosPendencia(id, fotos, destino);
        if(!r.ok){ UI.toast("Seu perfil não tem permissão para editar esta pendência."); return; }
        UI.toast("Foto(s) adicionada(s).");
      };
      input.click();
    },

    // "Serão exigidas [fotos] ao marcar como resolvida" (handoff) — passo
    // dedicado, com fotos de resolução separadas das fotos de abertura.
    abrirResolverPendencia(id){
      const p = M.Store.state.pendencias.find(x=>x.id===id); if(!p) return;
      UI.openModal(M.Pages.resolverPendenciaFormHtml(p), {});
      const form = document.getElementById("formResolverPendencia");
      form.addEventListener("submit", async (e)=>{
        e.preventDefault();
        const fd = new FormData(form);
        const submitBtn = form.querySelector('button[type=submit]');
        if(submitBtn) submitBtn.disabled = true;
        const fotosResolucao = await uploadArquivos(fd.getAll("fotos").filter(x=>x && x.size), (p.obraId||"avulsas")+"/pendencias-resolucao");
        const r = M.Store.resolverPendencia(id, {fotosResolucao, observacao: fd.get("observacao")||""});
        if(!r.ok){ UI.toast("Seu perfil não tem permissão para resolver pendência."); if(submitBtn) submitBtn.disabled = false; return; }
        UI.closeModal(); UI.toast("Pendência resolvida.");
      });
    },

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
        const r = M.Store.criarAssistencia({
          obraId: fd.get("obraId"), obraNome: obra? obra.cliente: "", cliente: obra? obra.cliente: fd.get("clienteLivre"),
          ambienteNome: fd.get("ambienteNome"), movelNome: fd.get("movelNome"),
          descricao: fd.get("descricao"), categoria: fd.get("categoria"), origem: fd.get("origem"),
          prioridade: fd.get("prioridade"), responsavel: fd.get("responsavel"), prazo: fd.get("prazo")||null, fotos,
          garantia: fd.get("garantia")||"EM_ANALISE",
        });
        if(!r.ok){ UI.toast("Seu perfil não tem permissão para registrar assistência."); return; }
        UI.closeModal(); UI.toast("Assistência registrada.");
      });
    },
    // FASE 7 (item 9): CONCLUIDA não passa mais por aqui (Store.atualizarAssistencia
    // recusa essa transição — ver Store.concluirAssistencia/Act.abrirConcluirAssistencia).
    setAssistenciaStatus(id, status){
      const r = M.Store.atualizarAssistencia(id,{status});
      if(!r.ok){
        UI.toast(r.motivo==="USE_CONCLUIR_ASSISTENCIA" ? "Use \"Concluir\" pra encerrar esta assistência." : "Seu perfil não tem permissão para alterar esta assistência.");
        Act.rerender(); return;
      }
      UI.toast("Status da assistência atualizado.");
    },
    setAssistFiltro(campo,val){ M.UIState.assistFiltro[campo]=val; Act.rerender(); },
    toggleAssistExpandido(id){ M.UIState.assistExpandido = (M.UIState.assistExpandido===id)?null:id; Act.rerender(); },
    // ---------- Assistências V2 (Fase 7) — filtros/expansão da tela nova ----------
    setAtendFiltro(campo,val){ M.UIState.atendFiltro[campo]=val; Act.rerender(); },
    limparAtendFiltro(){ M.UIState.atendFiltro = {status:"", garantia:"", grupo:"", obraId:"", busca:""}; Act.rerender(); },
    toggleAtendExpandido(id){ M.UIState.atendExpandidoId = (M.UIState.atendExpandidoId===id)?null:id; Act.rerender(); },
    verAtendimentosDaObra(obraId){
      M.UIState.atendFiltro = Object.assign({status:"", garantia:"", grupo:"", busca:""}, {obraId});
      Act.go("#/assistencias");
    },
    // ---------- N visitas por chamado + garantia (Fase 5 — handoff; Fase 7 — Cobertura) ----------
    mudarGarantiaAssistencia(id, garantia){
      const r = M.Store.definirGarantiaAssistencia(id, garantia);
      if(!r.ok){
        if(r.motivo==="SEM_PERMISSAO") UI.toast("Só PCP, Liderança ou Administrador podem marcar \"Cortesia\" — é decisão comercial da Moodo.");
        Act.rerender(); // desfaz visualmente a troca no <select>, já que o estado não mudou
        return;
      }
      UI.toast("Cobertura atualizada.");
    },
    // FASE 7 (item 3/4): abre uma visita já AGENDADA pra ser realizada — o
    // form vem PREENCHIDO com data/técnico já combinados (ver
    // M.Pages.registrarVisitaHtml(assistId, visitaId)).
    abrirAgendarVisita(assistId){
      UI.openModal(M.Pages.agendarVisitaHtml(assistId), {});
      const form = document.getElementById("formAgendarVisita");
      form.addEventListener("submit", (e)=>{
        e.preventDefault();
        const fd = new FormData(form);
        if(!fd.get("data")){ UI.toast("Escolha a data da visita."); return; }
        const r = M.Store.agendarVisitaAssistencia(assistId, {
          data: fd.get("data"), horaInicio: fd.get("horaInicio")||null,
          tecnico: fd.get("tecnico"), observacao: fd.get("observacao"),
        });
        if(!r.ok){ UI.toast("Seu perfil não tem permissão para agendar esta visita."); return; }
        UI.closeModal(); UI.toast("Visita agendada — já aparece na Agenda.");
      });
    },
    // AJUSTES FINAIS (item 4): motivo passou a ser obrigatório em
    // Store.cancelarVisitaAssistencia — UI.confirm (só sim/não) não coleta
    // texto, por isso trocado por um modal próprio com textarea required
    // (M.Pages.cancelarVisitaHtml), mesmo padrão dos outros forms desta fase.
    abrirCancelarVisita(assistId, visitaId){
      const html = M.Pages.cancelarVisitaHtml(assistId, visitaId);
      if(!html) return;
      UI.openModal(html, {});
      const form = document.getElementById("formCancelarVisita");
      form.addEventListener("submit", (e)=>{
        e.preventDefault();
        const fd = new FormData(form);
        const motivo = (fd.get("motivo")||"").trim();
        if(!motivo){ UI.toast("Descreva o motivo do cancelamento."); return; }
        const r = M.Store.cancelarVisitaAssistencia(assistId, visitaId, motivo);
        if(!r.ok){
          const msgs = {
            SEM_PERMISSAO:"Seu perfil não tem permissão para cancelar esta visita.",
            MOTIVO_OBRIGATORIO:"Descreva o motivo do cancelamento.",
            VISITA_NAO_ESTA_AGENDADA:"Esta visita não está mais agendada.",
          };
          UI.toast(msgs[r.motivo] || "Não foi possível cancelar esta visita.");
          return;
        }
        UI.closeModal(); UI.toast("Visita cancelada.");
      });
    },
    // AJUSTES FINAIS (itens 1/2): abre o formulário de cancelamento da
    // ASSISTÊNCIA INTEIRA (não a visita). O botão que chama isto só é
    // renderizado quando Store.pode("assistencia.cancelar") já é true (ver
    // js/pages/assistenciasV2.js) — mas o gate de verdade é sempre o do
    // Store, nunca a UI.
    abrirCancelarAssistencia(assistId){
      const html = M.Pages.cancelarAssistenciaHtml(assistId);
      if(!html) return;
      UI.openModal(html, {});
      const form = document.getElementById("formCancelarAssistencia");
      form.addEventListener("submit", (e)=>{
        e.preventDefault();
        const fd = new FormData(form);
        const motivo = (fd.get("motivo")||"").trim();
        if(!motivo){ UI.toast("Descreva o motivo do cancelamento."); return; }
        const r = M.Store.cancelarAssistencia(assistId, {motivo});
        if(!r.ok){
          const msgs = {
            SEM_PERMISSAO:"Seu perfil não tem permissão para cancelar esta assistência.",
            MOTIVO_OBRIGATORIO:"Descreva o motivo do cancelamento.",
            ASSISTENCIA_CONCLUIDA:"Esta assistência já foi concluída — não é possível cancelar uma assistência concluída.",
          };
          UI.toast(msgs[r.motivo] || "Não foi possível cancelar esta assistência.");
          return;
        }
        UI.closeModal();
        UI.toast(r.jaCancelada ? "Esta assistência já estava cancelada." : "Assistência cancelada.");
        Act.rerender();
      });
    },
    // FASE 7 (item 9/§12): "Concluir" agora abre um passo próprio — pede
    // resultado final + confirma a cobertura (Store.concluirAssistencia
    // recusa se cobertura ainda estiver "Em análise", se houver visita
    // AGENDADA pendente, ou pendência bloqueante vinculada ao chamado).
    abrirConcluirAssistencia(assistId){
      UI.openModal(M.Pages.concluirAssistenciaHtml(assistId), {});
      const form = document.getElementById("formConcluirAssistencia");
      form.addEventListener("submit", (e)=>{
        e.preventDefault();
        const fd = new FormData(form);
        const garantia = fd.get("garantia");
        const resultado = (fd.get("resultado")||"").trim();
        if(!resultado){ UI.toast("Descreva o resultado final."); return; }
        if(garantia !== M.Store.state.assistencias.find(x=>x.id===assistId).garantia){
          const rg = M.Store.definirGarantiaAssistencia(assistId, garantia);
          if(!rg.ok){ UI.toast(rg.motivo==="SEM_PERMISSAO" ? "Só PCP, Liderança ou Administrador podem marcar \"Cortesia\"." : "Não foi possível salvar a cobertura."); return; }
        }
        const r = M.Store.concluirAssistencia(assistId, {resultado});
        if(!r.ok){
          const msgs = {
            SEM_PERMISSAO:"Seu perfil não tem permissão para concluir esta assistência.",
            COBERTURA_NAO_DEFINIDA:"Defina a cobertura (não pode ficar \"Em análise\") antes de concluir.",
            RESULTADO_OBRIGATORIO:"Descreva o resultado final.",
            VISITA_AGENDADA_PENDENTE:"Ainda existe uma visita agendada pendente — realize ou cancele antes de concluir.",
            PENDENCIA_BLOQUEANTE:"Existe uma pendência vinculada que bloqueia o fechamento — resolva antes de concluir.",
          };
          UI.toast(msgs[r.motivo] || "Não foi possível concluir esta assistência.");
          return;
        }
        UI.closeModal(); UI.toast("Assistência concluída.");
      });
    },
    // FASE 7 (item 6, aprovado): "Abrir pendência" a partir de uma
    // assistência precisa HERDAR o contexto (obra/ambiente/móvel — os que
    // existirem) e marcar origem="ASSISTENCIA" + assistenciaId — nenhuma das
    // duas coisas o formulário genérico de pendência (Act.openPendenciaForm)
    // faz sozinho, por isso este wrapper próprio em vez de reusar aquele
    // direto (o MODAL/HTML é o mesmo — M.Pages.pendenciaFormHtml — só o
    // submit ganha os 2 campos extras).
    abrirPendenciaDeAssistencia(assistId){
      const a = M.Store.state.assistencias.find(x=>x.id===assistId); if(!a) return;
      UI.openModal(M.Pages.pendenciaFormHtml(a.obraId||null, null, null), {});
      const form = document.getElementById("formPendencia");
      form.addEventListener("submit", async (e)=>{
        e.preventDefault();
        const fd = new FormData(form);
        const mv = fd.get("movelId");
        const f = mv ? M.Store.findMovel(mv) : null;
        const fotos = await uploadArquivos(fd.getAll("fotos").filter(x=>x && x.size), (fd.get("obraId")||a.obraId||"avulsas")+"/pendencias");
        const r = M.Store.criarPendencia({
          obraId: fd.get("obraId")||a.obraId||null,
          ambienteId: fd.get("ambienteId")||null, movelId: mv||null,
          obraNome: (f? f.o.cliente : (M.Store.getObra(fd.get("obraId"))||{}).cliente) || a.obraNome,
          ambienteNome: f? f.a.nome : (a.ambienteNome||""), movelNome: f? f.m.nome : (fd.get("descricaoLivre")||a.movelNome||"Item avulso"),
          categoria: fd.get("categoria"), tipo: fd.get("tipo")||null, impacto: fd.get("impacto")||null,
          descricao: fd.get("descricao"), responsavel: fd.get("responsavel")||a.responsavel,
          fornecedor: fd.get("fornecedor"), prazo: fd.get("prazo")||null, prioridade: fd.get("prioridade"),
          origem:"ASSISTENCIA", assistenciaId: a.id, fotos,
        });
        if(!r.ok){ UI.toast("Seu perfil não tem permissão para criar pendência."); return; }
        UI.closeModal(); UI.toast("Pendência criada e vinculada a esta assistência.");
      });
    },
    abrirRegistrarVisita(assistId, visitaId){
      UI.openModal(M.Pages.registrarVisitaHtml(assistId, visitaId), {});
      const form = document.getElementById("formRegistrarVisita");
      form.addEventListener("submit", async (e)=>{
        e.preventDefault();
        const fd = new FormData(form);
        const desfecho = fd.get("desfecho");
        if(!desfecho){ UI.toast("Escolha o resultado desta visita."); return; }
        const fotosVisita = await uploadArquivos(fd.getAll("fotosVisita").filter(x=>x && x.size), assistId+"/visitas");
        const pecaNecessaria = document.getElementById("chkPeca") && document.getElementById("chkPeca").checked
          ? {categoria: fd.get("pecaCategoria"), descricao: fd.get("pecaDescricao"), prazo: fd.get("pecaPrazo")||null}
          : null;
        const r = M.Store.registrarVisitaAssistencia(assistId, {
          visitaId: form.dataset.visitaId || undefined,
          data: fd.get("data")||M.todayISO(), tecnico: fd.get("tecnico"), diagnostico: fd.get("diagnostico"),
          fotos: fotosVisita, desfecho, proximoStatus: fd.get("proximoStatus"), pecaNecessaria,
        });
        if(!r.ok){
          UI.toast(r.motivo==="SEM_PERMISSAO" ? "Seu perfil não tem permissão para registrar esta visita." : "Escolha o resultado desta visita.");
          return;
        }
        UI.closeModal();
        UI.toast(r.pendenciaGerada? "Visita registrada — pendência de peça criada." : (desfecho==="RESOLVIDA"? "Visita registrada como resolvida." : "Visita registrada — retorno necessário."));
      });
    },

    // ---------- montagem ----------
    abrirEncerramentoMontagem(movelId){
      const f = M.Store.findMovel(movelId); if(!f) return;
      UI.openModal(M.Pages.encerramentoMontagemHtml(f), {});
      document.getElementById("btnEncerrar").addEventListener("click", ()=>{
        const checks = document.querySelectorAll(".mont-check:checked").length;
        const total = document.querySelectorAll(".mont-check").length;
        const temPendenciasInformado = document.getElementById("temPendencias").checked;
        const r = M.Store.concluirMontagem(movelId, `${checks}/${total}`, temPendenciasInformado);
        if(!r.ok){ UI.toast("Seu perfil não tem permissão para concluir montagem."); return; }
        UI.closeModal();
        UI.toast(r.temPendencias? "Montagem encerrada como concluída com pendências — segue visível em Para Finalizar." : "Montagem concluída!");
      });
    },
    // ---------- marcar pronto / finalizar com ressalva (Fase 4 — handoff; fluxo de 2 passos — Fase 5, rodada de ajustes) ----------
    // Esta ação NUNCA finaliza um ambiente direto — no máximo marca "pronto
    // para finalizar" (Store.marcarProntoAmbiente). Aprovar é sempre uma ação
    // separada (ver aprovarFinalizacaoAmbiente, abaixo). A única saída que
    // fecha por aqui sem passar pela aprovação é a ressalva explícita
    // (Store.finalizarComRessalva), quando a caixa "finalizar com ressalva"
    // está marcada.
    abrirFinalizarAmbiente(ambienteId){
      const f = M.Store.findAmbiente(ambienteId); if(!f) return;
      UI.openModal(M.Pages.finalizarAmbienteHtml(f), {});
      const form = document.getElementById("formFinalizarAmbiente");
      form.addEventListener("submit", (e)=>{
        e.preventDefault();
        const fd = new FormData(form);
        const checklist = {};
        document.querySelectorAll(".amb-check").forEach(el=>{ checklist[el.dataset.item] = el.checked; });
        const ressalvaEl = document.getElementById("ambRessalva");
        const ressalva = ressalvaEl ? ressalvaEl.checked : false;
        const r = ressalva
          ? M.Store.finalizarComRessalva(ambienteId, {checklist, motivo: fd.get("motivo")||"", pendenciaVinculada: fd.get("pendenciaVinculada")||null})
          : M.Store.marcarProntoAmbiente(ambienteId, {checklist});
        if(!r.ok){
          if(r.motivo==="MOTIVO_OBRIGATORIO"){ UI.toast("Descreva o motivo da ressalva antes de finalizar."); return; }
          if(r.motivo==="SEM_PERMISSAO"){ UI.toast(ressalva? "Seu perfil não pode finalizar com ressalva." : "Seu perfil não pode marcar este ambiente como pronto."); return; }
          if(r.motivo==="TRANSICAO_INVALIDA"){ UI.toast("Este ambiente não está em um estado que permite essa ação agora."); return; }
          UI.toast("Ainda há pendências — marque \"Finalizar com ressalva\" ou resolva antes."); return;
        }
        UI.closeModal();
        if(r.status==="FINALIZADO_COM_RESSALVA") UI.toast("Ambiente finalizado com ressalva.");
        else if(r.jaEstavaPronto) UI.toast("Este ambiente já está pronto para finalizar, aguardando aprovação.");
        else UI.toast("Marcado como pronto para finalizar — aguardando aprovação.");
      });
    },
    // ---------- Montagem V2 (Fase 5) — novas ações de estado do ambiente ----------
    iniciarMontagemAmbiente(ambienteId){
      const r = M.Store.iniciarMontagemAmbiente(ambienteId);
      if(!r.ok){ UI.toast("Seu perfil não pode iniciar a montagem deste ambiente."); return; }
      UI.toast(r.jaIniciado? "Montagem já estava iniciada." : "Montagem iniciada.");
    },
    abrirMarcarTravado(ambienteId){
      const f = M.Store.findAmbiente(ambienteId); if(!f) return;
      UI.openModal(M.Pages.marcarTravadoHtml(f), {});
      const form = document.getElementById("formMarcarTravado");
      form.addEventListener("submit", (e)=>{
        e.preventDefault();
        const motivo = new FormData(form).get("motivo")||"";
        const r = M.Store.marcarAmbienteTravado(ambienteId, motivo);
        if(!r.ok){
          if(r.motivo==="MOTIVO_OBRIGATORIO"){ UI.toast("Descreva o motivo do travamento."); return; }
          UI.toast("Não foi possível travar este ambiente."); return;
        }
        UI.closeModal();
        UI.toast("Ambiente marcado como travado.");
      });
    },
    destravarAmbiente(ambienteId){
      UI.confirm("Destravar este ambiente?", ()=>{
        const r = M.Store.destravarAmbiente(ambienteId);
        if(!r.ok){
          if(r.motivo==="TRAVADO_POR_PENDENCIA"){ UI.toast("Este travamento vem de uma pendência aberta — resolva a pendência em Pendências para destravar."); return; }
          UI.toast("Não foi possível destravar."); return;
        }
        UI.toast("Ambiente destravado.");
      });
    },
    aprovarFinalizacaoAmbiente(ambienteId){
      UI.confirm("Aprovar a finalização deste ambiente? Ele vai contar como Finalizado.", ()=>{
        const r = M.Store.aprovarFinalizacaoAmbiente(ambienteId);
        if(!r.ok){
          if(r.motivo==="SEM_PERMISSAO"){ UI.toast("Seu perfil não pode aprovar finalização."); return; }
          if(r.motivo==="NAO_ESTA_PRONTO"){ UI.toast("Este ambiente ainda não foi marcado como pronto para finalizar."); return; }
          if(r.motivo==="BLOQUEIO_SURGIU_APOS_PRONTO"){ UI.toast("Surgiu um bloqueio (pendência ou travamento) depois que o ambiente foi marcado pronto — resolva antes de aprovar."); return; }
          if(r.motivo==="TRANSICAO_INVALIDA"){ UI.toast("Este ambiente não está em um estado que permite aprovar agora."); return; }
          UI.toast("Não foi possível aprovar."); return;
        }
        UI.toast("Finalização aprovada — ambiente finalizado.");
      });
    },
    // ---------- planejamento de montagem (Fase 5, §10) ----------
    abrirPlanejamentoMontagem(obraId){
      const o = M.Store.getObra(obraId); if(!o) return;
      UI.openModal(M.Pages.planejamentoMontagemHtml(o), {});
      const form = document.getElementById("formPlanejamentoMontagem");
      form.addEventListener("submit", (e)=>{
        e.preventDefault();
        const fd = new FormData(form);
        const r = M.Store.setPlanejamentoMontagem(obraId, {
          inicioPrevisto: fd.get("inicioPrevisto")||null,
          duracaoEstimadaValor: fd.get("duracaoEstimadaValor")||null,
          duracaoEstimadaUnidade: fd.get("duracaoEstimadaUnidade")||"dias_uteis",
          equipePlanejada: fd.get("equipePlanejada")||"",
          observacoes: fd.get("observacoes")||"",
        });
        if(!r.ok){ UI.toast("Seu perfil não pode editar o planejamento desta obra."); return; }
        UI.closeModal();
        UI.toast("Planejamento de montagem atualizado.");
      });
    },
    // recalcula, em tempo real (sem re-render de tela), o contador do
    // checklist e o texto do botão do modal "Finalizar ambiente" conforme
    // o usuário marca/desmarca itens — o valor gravado de fato só acontece
    // no submit (ver abrirFinalizarAmbiente), isto é só o feedback visual.
    atualizarFinalizarAmbiente(){
      const form = document.getElementById("formFinalizarAmbiente");
      if(!form) return;
      const total = document.querySelectorAll(".amb-check").length;
      const feitos = document.querySelectorAll(".amb-check:checked").length;
      const label = document.getElementById("faChecklistLabel");
      if(label) label.textContent = `Checklist de finalização · ${feitos}/${total}`;
      const bloqueios = parseInt(form.dataset.bloqueios||"0",10);
      const naoMontados = parseInt(form.dataset.naoMontados||"0",10);
      const travamentoManual = form.dataset.travamentoManual==="1";
      const pendente = bloqueios>0 || travamentoManual || feitos<total || naoMontados>0;
      const pendSection = document.getElementById("faPendenteSection");
      const prontoMsg = document.getElementById("faProntoMsg");
      if(pendSection) pendSection.style.display = pendente? "block":"none";
      if(prontoMsg) prontoMsg.style.display = pendente? "none":"block";
      const btn = document.getElementById("faSubmitBtn");
      // AJUSTE (rodada de ajustes): este modal nunca finaliza direto, mesmo
      // para quem tem montagem.aprovarFinalizacao — no máximo marca "pronto
      // para finalizar" (Store.marcarProntoAmbiente). Aprovar é sempre uma
      // ação separada, feita depois, noutro lugar (ver
      // Act.aprovarFinalizacaoAmbiente). O texto do botão reflete isso sem
      // depender de qual permissão quem está vendo a tela tem.
      if(btn) btn.textContent = pendente? "Finalizar com ressalva" : "Marcar pronto para finalizar";
      if(!pendente){
        const ressalvaEl = document.getElementById("ambRessalva");
        if(ressalvaEl) ressalvaEl.checked = false;
        const fields = document.getElementById("ambRessalvaFields");
        if(fields) fields.style.display = "none";
      }
    },
    reabrirAmbiente(ambienteId){
      UI.confirm("Reabrir este ambiente? Ele volta a aparecer como pendente de fechamento.", ()=>{
        M.Store.reabrirAmbiente(ambienteId); UI.toast("Ambiente reaberto.");
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

    // ---------- FASE 7.5 — Edição V2 (Parte B) ----------------------------
    // Defesa em profundidade de sempre: cada mutator de Store.* NÃO checa
    // permissão sozinho — só o Act.* que chama checa Store.pode(...) antes
    // (mesmo padrão de cancelarAssistencia na Fase 7).
    abrirEditarObra(obraId){
      const o = M.Store.getObra(obraId); if(!o) return;
      if(!M.Store.pode("obra.editar")){ UI.toast("Seu perfil não tem permissão para editar esta obra."); return; }
      UI.openModal(M.Pages.editarObraFormHtml(o), {});
      const form = document.getElementById("formEditarObra");
      form.addEventListener("submit", (e)=>{
        e.preventDefault();
        const fd = new FormData(form);
        const patch = {
          nome: fd.get("nome")||"", cliente: fd.get("cliente")||"", responsavel: fd.get("responsavel")||"",
          dataEntregaPrevista: fd.get("dataEntregaPrevista")||null, endereco: fd.get("endereco")||"",
          observacoes: fd.get("observacoes")||"",
        };
        const numeroOSNovo = String(fd.get("numeroOS")||"").trim();
        if(numeroOSNovo !== (o.numeroOS||"")) patch.numeroOS = numeroOSNovo;
        const motivo = fd.get("motivoOS")||"";
        const r = M.Store.atualizarObra(obraId, patch, {motivo});
        if(!r.ok){
          if(r.motivo==="MOTIVO_OBRIGATORIO_OS"){ UI.toast("Esta obra já está em fase avançada — informe o motivo da alteração do número de OS para continuar."); return; }
          UI.toast("Não foi possível salvar as alterações."); return;
        }
        UI.closeModal();
        UI.toast(r.semAlteracao? "Nenhuma alteração." : "Obra atualizada.");
      });
    },
    obraAdicionarAmbiente(obraId, inputId){
      if(!M.Store.pode("obra.editar")){ UI.toast("Seu perfil não tem permissão para editar esta obra."); return; }
      const el = document.getElementById(inputId);
      const nome = el ? String(el.value||"").trim() : "";
      if(!nome){ UI.toast("Digite o nome do ambiente."); return; }
      const r = M.Store.adicionarAmbiente(obraId, {nome});
      if(!r.ok){ UI.toast("Não foi possível adicionar o ambiente."); return; }
      if(el) el.value = "";
      UI.toast("Ambiente adicionado." + (M.Store.getObra(obraId).revisaoPCPNecessaria ? " Revisão PCP necessária." : ""));
    },
    obraRemoverAmbiente(obraId, ambienteId){
      if(!M.Store.pode("obra.editar")){ UI.toast("Seu perfil não tem permissão para editar esta obra."); return; }
      UI.confirm("Remover este ambiente? Só é possível se não houver pendência, tarefa, assistência ou progresso vinculado a ele.", ()=>{
        const r = M.Store.removerAmbiente(obraId, ambienteId);
        if(!r.ok){
          if(r.motivo==="VINCULOS_EXISTENTES"){ UI.toast("Não é possível remover — já tem: " + r.vinculos.join(", ") + "."); return; }
          UI.toast("Não foi possível remover o ambiente."); return;
        }
        UI.toast("Ambiente removido.");
      });
    },
    obraAdicionarMovel(obraId, ambienteId, inputId){
      if(!M.Store.pode("obra.editar")){ UI.toast("Seu perfil não tem permissão para editar esta obra."); return; }
      const el = document.getElementById(inputId);
      const nome = el ? String(el.value||"").trim() : "";
      if(!nome){ UI.toast("Digite o nome do móvel."); return; }
      const r = M.Store.adicionarMovel(obraId, ambienteId, {nome});
      if(!r.ok){ UI.toast("Não foi possível adicionar o móvel."); return; }
      if(el) el.value = "";
      UI.toast("Móvel adicionado.");
    },
    obraRemoverMovel(obraId, ambienteId, movelId){
      if(!M.Store.pode("obra.editar")){ UI.toast("Seu perfil não tem permissão para editar esta obra."); return; }
      UI.confirm("Remover este móvel? Só é possível se não houver pendência, tarefa, assistência ou progresso vinculado a ele.", ()=>{
        const r = M.Store.removerMovel(obraId, ambienteId, movelId);
        if(!r.ok){
          if(r.motivo==="VINCULOS_EXISTENTES"){ UI.toast("Não é possível remover — já tem: " + r.vinculos.join(", ") + "."); return; }
          UI.toast("Não foi possível remover o móvel."); return;
        }
        UI.toast("Móvel removido.");
      });
    },
    obraMoverMovel(obraId, movelId, novoAmbienteId){
      if(!novoAmbienteId) return;
      if(!M.Store.pode("obra.editar")){ UI.toast("Seu perfil não tem permissão para editar esta obra."); return; }
      const r = M.Store.moverMovel(obraId, movelId, novoAmbienteId);
      if(!r.ok){ UI.toast("Não foi possível mover o móvel."); return; }
      UI.toast("Móvel movido.");
    },
    limparRevisaoPCP(obraId){
      if(!M.Store.pode("obra.editar")){ UI.toast("Seu perfil não tem permissão."); return; }
      M.Store.limparRevisaoPCP(obraId);
      UI.toast("Revisão de PCP marcada como concluída.");
    },

    // ---------- FASE 7.5 — Nova Obra V2 (wizard em etapas) ----------------
    // Fluxo: Início (escolhe modo) → Dados (identificação) → Ambientes e
    // móveis (estrutura) → Revisão → Ativar. "Salvar rascunho" funciona em
    // qualquer etapa a partir de "Dados". Nada é gravado no Store até o
    // primeiro "Salvar rascunho"/"Ativar obra" (ver comentário completo em
    // js/pages/novaObra.js).
    novaObraEscolherModo(modo){
      const w = M.UIState.novaObra;
      w.modo = modo; w.step = "dados";
      Act.rerender();
    },
    novaObraIrParaEtapa(step){ M.UIState.novaObra.step = step; Act.rerender(); },
    novaObraVoltarEtapa(){
      const ORDEM = ["inicio","dados","estrutura","revisao","ativar"];
      const w = M.UIState.novaObra;
      const i = ORDEM.indexOf(w.step);
      w.step = ORDEM[Math.max(0, i-1)];
      Act.rerender();
    },
    novaObraProximaEtapa(){
      const ORDEM = ["inicio","dados","estrutura","revisao","ativar"];
      const w = M.UIState.novaObra;
      // Saindo de "estrutura" em modo import: converte o rateio/valores/
      // componentes calculados a partir do PDF pra mesma estrutura editável
      // (w.ambientesManual) que o modo manual já usa — a partir daqui
      // (Revisão/Ativar) os dois modos passam a compartilhar um único
      // caminho de edição/persistência (ver comentário em novaObra.js).
      if(w.step==="estrutura" && w.modo==="import" && M.Pages.novaObraSincronizarEstruturaImportada){
        M.Pages.novaObraSincronizarEstruturaImportada();
      }
      const i = ORDEM.indexOf(w.step);
      w.step = ORDEM[Math.min(ORDEM.length-1, i+1)];
      Act.rerender();
    },
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
        let orcParsed, osParsed, dados;
        try{
          orcParsed = orcLinhas ? M.PdfImport.parseDocumento(orcLinhas) : null;
          osParsed = osLinhas ? M.PdfImport.parseDocumento(osLinhas) : null;
          dados = M.PdfImport.combinar(orcParsed, osParsed);
        }catch(err){
          throw new Error("[interpretar-conteudo] " + ((err && err.message) || err));
        }
        if(!dados){
          w.erro = "Não consegui identificar os ambientes/itens neste PDF. Confira se é o formato padrão da Moodo (Orçamento ou Ordem de Serviço).";
        } else {
          w.dados = dados;
          w.lido = true;
          // ITEM 3 do pedido: só preenche o que veio de verdade do PDF, e só
          // se a pessoa ainda não tiver digitado nada manualmente nesta
          // sessão (não sobrescreve edição já feita na revisão).
          if(!w.numeroOSManual && dados.numeroOS) w.numeroOSManual = dados.numeroOS;
          if(!w.clienteManual && dados.cliente) w.clienteManual = dados.cliente;
          if(!w.nomeManual && dados.cliente) w.nomeManual = dados.cliente;
          if(!w.enderecoManual && dados.endereco) w.enderecoManual = dados.endereco;
          if(!w.dataEntregaPrevistaManual && dados.dataEntregaPrevista) w.dataEntregaPrevistaManual = dados.dataEntregaPrevista;
        }
      }catch(err){
        console.error("[Moodo] erro ao ler PDF:", err);
        const nome = err && err.name && err.name!=="Error" ? err.name+": " : "";
        w.erro = nome + ((err && err.message) || "Erro ao ler o PDF.");
      }
      w.lendo = false;
      Act.rerender();
    },
    // ITEM 2 do pedido: "não obrigar documento pra criar obra" — reset total
    // volta pro Início, pronto pra escolher de novo (import ou manual).
    novaObraRecomecar(){
      M.UIState.novaObra = {
        obraId:null, step:"inicio", modo:null,
        osFileObj:null, osFileName:null, orcFileObj:null, orcFileName:null,
        lendo:false, lido:false, erro:null, dados:null, ambientesAjuste:{},
        nomeManual:"", numeroOSManual:"", clienteManual:"", responsavelProducao:"",
        enderecoManual:"", observacoesManual:"", dataEntregaPrevistaManual:"", componentesSelecionados:{},
        ambientesManual:[], osDuplicadaConfirmada:false, estruturaImportadaSincronizada:false,
      };
      Act.rerender();
    },
    novaObraCancelar(){ Act.novaObraRecomecar(); location.hash = "#/obras"; },
    // setter único pros campos de identificação (comum a import e manual —
    // substitui os antigos novaObraSetIdentificacao/SetResponsavel, que
    // nunca existiram de verdade, ver achado de auditoria no relatório).
    novaObraSetCampo(campo, valor){
      const CAMPOS_VALIDOS = ["nomeManual","numeroOSManual","clienteManual","responsavelProducao","enderecoManual","observacoesManual","dataEntregaPrevistaManual"];
      if(CAMPOS_VALIDOS.indexOf(campo)===-1) return;
      M.UIState.novaObra[campo] = valor;
      M.UIState.novaObra.osDuplicadaConfirmada = false; // qualquer edição de identificação reabre a confirmação de OS duplicada
      // HOTFIX pós-publicação: faltava Act.rerender() aqui (todo outro
      // setter da etapa Dados/Ambientes chama — novaObraToggleComponente,
      // novaObraSetVendido, novaObraAjustarValor, novaObraConfirmarOsDuplicada
      // — só este ficou de fora). O valor digitado aparecia certo porque é o
      // próprio <input> do navegador guardando o texto, mas qualquer coisa
      // DERIVADA do estado (o banner de OS duplicada e o aviso de
      // "responsável não corresponde à equipe") ficava desatualizada na tela
      // até algum outro clique forçar um re-render (ex.: Continuar/Voltar).
      // Achado no smoke test em produção testando importação com uma OS que
      // colidia com uma obra real: corrigir a OS no campo não fazia o aviso
      // de duplicidade sumir da tela (o dado por trás já estava certo — só a
      // tela que não avisava até sair e voltar da etapa).
      Act.rerender();
    },
    novaObraToggleComponente(descricaoItem){
      const w = M.UIState.novaObra;
      w.componentesSelecionados[descricaoItem] = !w.componentesSelecionados[descricaoItem];
      Act.rerender();
    },
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
    novaObraConfirmarOsDuplicada(checked){ M.UIState.novaObra.osDuplicadaConfirmada = !!checked; Act.rerender(); },

    // ---- estrutura manual (modo==="manual") — ambientes/móveis simples,
    // sem rateio de valor (item 5: hierarquia Cliente→Obra→Ambiente→Móvel,
    // sem granularidade de peça/operação — isso é DinaBox). ----
    novaObraManualAddAmbiente(nomeInputId){
      const el = document.getElementById(nomeInputId);
      const nome = el ? String(el.value||"").trim() : "";
      if(!nome){ UI.toast("Digite o nome do ambiente."); return; }
      M.UIState.novaObra.ambientesManual.push({tid:M.uid("tmpamb"), nome, moveis:[]});
      if(el) el.value = "";
      Act.rerender();
    },
    novaObraManualRemoverAmbiente(tid){
      const w = M.UIState.novaObra;
      w.ambientesManual = w.ambientesManual.filter(a=>a.tid!==tid);
      Act.rerender();
    },
    novaObraManualAddMovel(ambTid, nomeInputId){
      const el = document.getElementById(nomeInputId);
      const nome = el ? String(el.value||"").trim() : "";
      if(!nome){ UI.toast("Digite o nome do móvel."); return; }
      const w = M.UIState.novaObra;
      const amb = w.ambientesManual.find(a=>a.tid===ambTid); if(!amb) return;
      amb.moveis.push({tid:M.uid("tmpmov"), nome});
      if(el) el.value = "";
      Act.rerender();
    },
    novaObraManualRemoverMovel(ambTid, movTid){
      const w = M.UIState.novaObra;
      const amb = w.ambientesManual.find(a=>a.tid===ambTid); if(!amb) return;
      amb.moveis = amb.moveis.filter(m=>m.tid!==movTid);
      Act.rerender();
    },
    // Usado na etapa Revisão (item 4 do pedido — "com capacidade de edição
    // completa": corrigir/excluir/adicionar item, mover móvel entre
    // ambientes, criar ambiente/móvel) — funciona igual em modo import ou
    // manual, porque a partir da etapa Estrutura os dois já convergem pra
    // w.ambientesManual (ver M.Pages.novaObraSincronizarEstruturaImportada).
    novaObraManualMoverMovel(ambTidOrigem, movTid, ambTidDestino){
      const w = M.UIState.novaObra;
      if(!ambTidDestino || ambTidOrigem===ambTidDestino) return;
      const origem = w.ambientesManual.find(a=>a.tid===ambTidOrigem); if(!origem) return;
      const destino = w.ambientesManual.find(a=>a.tid===ambTidDestino); if(!destino) return;
      const idx = origem.moveis.findIndex(m=>m.tid===movTid); if(idx===-1) return;
      const mv = origem.moveis.splice(idx,1)[0];
      destino.moveis.push(mv);
      Act.rerender();
    },
    novaObraManualRenomearAmbiente(tid, valor){
      const w = M.UIState.novaObra;
      const a = w.ambientesManual.find(a=>a.tid===tid); if(!a) return;
      a.nome = String(valor||"").trim();
      Act.rerender();
    },
    novaObraManualRenomearMovel(ambTid, movTid, valor){
      const w = M.UIState.novaObra;
      const a = w.ambientesManual.find(a=>a.tid===ambTid); if(!a) return;
      const m = a.moveis.find(m=>m.tid===movTid); if(!m) return;
      m.nome = String(valor||"").trim();
      Act.rerender();
    },

    // FASE 7.5 (Nova Obra V2, item 7) — toggle "Ativas"/"Rascunhos" da tela
    // Obras (js/pages/obras.js lê M.UIState.obrasFiltroStatus). HOTFIX
    // pós-publicação: essa função era chamada pelo onclick dos botões mas
    // nunca tinha sido implementada aqui — o toggle não fazia nada (clique
    // silenciosamente lançava "Act.setObrasFiltroStatus is not a function").
    // Achado durante o smoke test em produção; sem isso "Rascunhos" fica
    // inacessível pela UI (dado continua correto no Store, só a troca de
    // aba que não acontecia).
    setObrasFiltroStatus(status){
      M.UIState.obrasFiltroStatus = status;
      Act.rerender();
    },

    // ---- persistência: salvar rascunho / ativar ----------------------
    // Mesma defesa em profundidade de sempre (rota + ação — ver comentário
    // histórico de novaObraCriar): mesmo chegando aqui por fora da tela
    // normal, sem obra.criar nada é gravado.
    novaObraSalvarRascunho(){
      if(!M.Store.pode("obra.criar")){ UI.toast("Seu perfil não tem permissão para criar obra."); return; }
      const w = M.UIState.novaObra;
      if(!w.obraId){
        const nova = M.Pages.novaObraMontarManual();
        nova.status = "RASCUNHO";
        const criada = M.Store.criarObra(nova);
        w.obraId = criada.id;
        UI.toast("Rascunho salvo — você pode continuar depois em Obras → Rascunhos.");
      } else {
        const camposObj = M.Pages.novaObraMontarManual();
        M.Store.atualizarObra(w.obraId, {
          nome:camposObj.nome, cliente:camposObj.cliente, numeroOS:camposObj.numeroOS,
          responsavel:camposObj.responsavel, dataEntregaPrevista:camposObj.dataEntregaPrevista,
          endereco:camposObj.endereco, observacoes:camposObj.observacoes,
        });
        M.Store.atualizarEstruturaRascunho(w.obraId, camposObj.ambientes);
        UI.toast("Rascunho atualizado.");
      }
      Act.rerender();
    },
    novaObraAtivar(){
      if(!M.Store.pode("obra.criar")){ UI.toast("Seu perfil não tem permissão para criar obra."); return; }
      const w = M.UIState.novaObra;
      // ITEM 9 do pedido — OS duplicada exige confirmação explícita antes de
      // ativar (não bloqueia rígido, mas também não deixa passar batido).
      // CORREÇÃO PÓS-ENTREGA (item 1) — "w.obraId ? null : ..." desligava a
      // checagem inteira pra qualquer rascunho retomado (rascunho já tem
      // obraId). Um rascunho retomado ainda precisa saber se ALGUMA OUTRA
      // obra tem esse número — só a própria obra sendo editada é ignorada.
      const osAtual = w.modo==="import" ? String(w.numeroOSManual||"").trim() : String(w.numeroOSManual||"").trim();
      if(osAtual){
        const existente = M.Store.getObraByNumeroOS(osAtual, w.obraId);
        if(existente && !w.osDuplicadaConfirmada){
          UI.toast(`Já existe uma obra com esse número de OS (${existente.nome||existente.cliente}). Confirme "mesmo assim continuar" antes de ativar.`);
          return;
        }
      }
      // Ativar sempre depende de w.ambientesManual já sincronizado (etapa
      // Estrutura, ao "Continuar", sincroniza sozinha — ver
      // Act.novaObraProximaEtapa). Se por algum motivo a pessoa chegou aqui
      // sem passar por lá (ex.: retomou um rascunho e foi direto pra
      // Ativar), sincroniza aqui também como rede de segurança.
      if(w.modo==="import" && !w.ambientesManual.length && w.dados && M.Pages.novaObraSincronizarEstruturaImportada){
        M.Pages.novaObraSincronizarEstruturaImportada();
      }
      if(!w.obraId){
        const nova = M.Pages.novaObraMontarManual();
        nova.status = "RASCUNHO";
        const criada = M.Store.criarObra(nova);
        w.obraId = criada.id;
      } else {
        const camposObj = M.Pages.novaObraMontarManual();
        M.Store.atualizarObra(w.obraId, {
          nome:camposObj.nome, cliente:camposObj.cliente, numeroOS:camposObj.numeroOS,
          responsavel:camposObj.responsavel, dataEntregaPrevista:camposObj.dataEntregaPrevista,
          endereco:camposObj.endereco, observacoes:camposObj.observacoes,
        });
        M.Store.atualizarEstruturaRascunho(w.obraId, camposObj.ambientes);
      }
      const r = M.Store.ativarObra(w.obraId);
      if(!r.ok){
        UI.toast("Ainda falta: " + (r.faltando||[]).join(", ") + ".");
        Act.rerender();
        return;
      }
      UI.toast("Obra ativada com sucesso!");
      const obraId = w.obraId;
      Act.novaObraRecomecar();
      location.hash = "#/obra/"+obraId;
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

    // ---------- Agenda V2 (Fase 6) ----------
    setAgendaView(v){ M.UIState.agendaView = v; M.UIState.agendaEventoSelId = null; Act.rerender(); },
    agendaNav(delta){
      const S = M.UIState, v = S.agendaView;
      if(v==="MES"){
        let m=S.agendaMes+delta, y=S.agendaAno;
        if(m<0){ m=11; y--; } if(m>11){ m=0; y++; }
        S.agendaMes=m; S.agendaAno=y;
      } else if(v==="DIA"){
        S.agendaDia = M.Agenda.addDias(S.agendaDia, delta);
      } else {
        S.agendaSemanaInicio = M.Agenda.addDias(S.agendaSemanaInicio, 7*delta);
      }
      Act.rerender();
    },
    agendaHoje(){
      const S = M.UIState;
      S.agendaMes = M.TODAY.getMonth(); S.agendaAno = M.TODAY.getFullYear();
      S.agendaDia = M.todayISO();
      S.agendaSemanaInicio = M.Agenda.segundaFeiraDe(M.todayISO());
      Act.rerender();
    },
    agendaVerDia(iso){
      // §6: "clique no dia abre/resume compromissos daquele dia" — navega
      // pra visão Dia (§8) na data clicada, sem modal grande nenhum.
      M.UIState.agendaView = "DIA"; M.UIState.agendaDia = iso; M.UIState.agendaEventoSelId = null;
      Act.rerender();
    },
    setAgendaFiltro(campo, val){ M.UIState.agendaFiltros[campo] = val; Act.rerender(); },
    selecionarEventoAgenda(id){ M.UIState.agendaEventoSelId = id; Act.rerender(); },
    setAgendaMobileTab(t){ M.UIState.agendaMobileTab = t; Act.rerender(); },
    openEventoForm(evento){
      UI.openModal(M.Pages.eventoFormHtml(evento||null), {});
      const form = document.getElementById("formEvento");
      form.addEventListener("submit", (e)=>{
        e.preventDefault();
        const fd = new FormData(form);
        const dados = {
          tipo: fd.get("tipo"), titulo: fd.get("titulo") || undefined,
          obraId: fd.get("obraId")||null, cliente: fd.get("clienteLivre")||null,
          endereco: fd.get("endereco")||"", data: fd.get("data"),
          horaInicio: fd.get("horaInicio")||null, horaFim: fd.get("horaFim")||null,
          equipe: fd.get("equipe")||"", observacao: fd.get("observacao")||"",
        };
        const r = evento ? M.Store.atualizarEvento(evento.id, dados) : M.Store.criarEvento(dados);
        if(!r.ok){
          UI.toast(r.motivo==="SEM_PERMISSAO" ? "Seu perfil não tem permissão para isso na Agenda."
            : r.motivo==="ORIGEM_NAO_EDITAVEL" ? "Este compromisso vem de outro módulo — edite por lá."
            : "Não foi possível salvar o compromisso.");
          return;
        }
        UI.closeModal();
        UI.toast(evento? "Compromisso atualizado." : "Compromisso criado.");
      });
    },
    editarEventoAgenda(id){
      const evt = M.Store.state.eventos.find(x=>x.id===id); if(!evt) return;
      Act.openEventoForm(evt);
    },
    cancelarEventoAgenda(id){
      UI.confirm("Cancelar este compromisso da Agenda?", ()=>{
        const r = M.Store.cancelarEvento(id);
        if(!r.ok){ UI.toast("Seu perfil não tem permissão para cancelar este compromisso."); return; }
        UI.toast("Compromisso cancelado.");
      });
    },
    // "Editar" de evento derivado leva ao contexto de origem (§15) — nunca
    // edita dado de Montagem/Assistência a partir da Agenda.
    // FASE 7 (item 9 — "abrir atendimento" aponta pro detalhe V2): antes
    // levava pra lista V1 já expandida (#/assistencias + assistExpandido);
    // agora leva direto pro detalhe do chamado (Resumo/Visitas/Pendências/
    // Fotos/Histórico — M.Pages.assistenciaDetail).
    abrirAssistenciaDaAgenda(assistId){
      Act.go("#/assistencia/"+assistId);
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
    // exporta exatamente o que está filtrado na tela, como CSV (handoff: botão "Exportar")
    exportarAuditoria(){
      const csv = M.Pages._auditoriaExportarCsv();
      const blob = new Blob(["﻿"+csv], {type:"text/csv;charset=utf-8;"});
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `auditoria_${M.todayISO()}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      UI.toast("Auditoria exportada.");
    },

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
        M.Store.reset(); UI.toast("Dados de exemplo restaurados."); location.hash = "#/hoje";
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
