/* ============================================================
   MOODO PRODUÇÃO — store (estado local + localStorage)
   ============================================================ */
(function(){
  "use strict";
  const M = window.M;
  const LS_KEY = "moodo_producao_state_v1";

  function deepClone(o){ return JSON.parse(JSON.stringify(o)); }
  function slug(txt){
    return (txt||"").toString().trim().toUpperCase()
      .normalize("NFD").replace(/[̀-ͯ]/g,"")
      .replace(/[^A-Z0-9]+/g,"_").replace(/^_+|_+$/g,"") || "ETAPA";
  }

  // ---------- semente de etapas / requisitos / tarefas padrão com ids/ordem ----------
  function seedEtapas(){ return deepClone(M.ETAPAS_SEED); }
  function seedRequisitos(){
    const out = {};
    Object.keys(M.REQUISITOS_SEED).forEach(etapaId=>{
      out[etapaId] = M.REQUISITOS_SEED[etapaId].map((r,i)=> Object.assign({
        id: M.uid("req"), ordem:i, permiteOverride:true, exigeEvidencia:false,
      }, r));
    });
    return out;
  }
  function seedTarefasPadrao(){
    const out = {};
    Object.keys(M.TAREFAS_PADRAO_ETAPA).forEach(etapaId=>{
      out[etapaId] = M.TAREFAS_PADRAO_ETAPA[etapaId].map((t,i)=> Object.assign({
        id: M.uid("tskp"), ordem:i, descricao:"", exigeConferencia:false,
      }, t));
    });
    return out;
  }

  function seedState(){
    // pendências ganham fluxo operacional padrão + situação de conclusão da etapa do móvel
    const pend = deepClone(M.PENDENCIAS).map(p=>{
      const def = M.categoriaDef(p.categoria);
      const passos = (M.FLUXOS_PENDENCIA_PADRAO[def.fluxo]||["Resolver"]).slice();
      return Object.assign({fluxoTipo:def.fluxo, fluxoPassos:passos, passoAtual:0, origem:p.origem||null}, p);
    });
    return {
      obras: deepClone(M.OBRAS),
      pendencias: pend,
      tarefas: deepClone(M.TAREFAS),
      lotes: deepClone(M.LOTES),
      assistencias: deepClone(M.ASSISTENCIAS),
      etapas: seedEtapas(),
      requisitosPorEtapa: seedRequisitos(),
      pesosDesempenho: Object.assign({}, M.PESOS_DESEMPENHO_DEFAULT),
      tarefasPadrao: seedTarefasPadrao(),
      fluxosPadrao: deepClone(M.FLUXOS_PENDENCIA_PADRAO),
      notificacoes: Object.assign({}, M.NOTIFICACOES_DEFAULT),
      metaMensal: Object.assign({}, M.META_MENSAL),
      tvWidgetsAtivos: {},
      historico: [],
      auditoria: [],
      usuarioAtual: "Paulo Henrique",
      criadoEm: new Date().toISOString(),
    };
  }

  function load(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(raw){
        const parsed = JSON.parse(raw);
        if(parsed && parsed.obras && parsed.obras.length){
          // migração leve: garante que estados salvos de versões antigas do protótipo
          // ganhem os novos módulos (assistências, auditoria, fluxos, etapas configuráveis
          // etc.) sem perder o que já existia.
          const fresh = seedState();
          const migrado = Object.assign({}, fresh, parsed, {
            assistencias: parsed.assistencias || fresh.assistencias,
            auditoria: parsed.auditoria || fresh.auditoria,
            tarefasPadrao: parsed.tarefasPadrao || fresh.tarefasPadrao,
            fluxosPadrao: parsed.fluxosPadrao || fresh.fluxosPadrao,
            pesosDesempenho: parsed.pesosDesempenho || fresh.pesosDesempenho,
            notificacoes: parsed.notificacoes || fresh.notificacoes,
            metaMensal: parsed.metaMensal || fresh.metaMensal,
            // estado salvo de uma versão anterior (v2.0) ainda não tinha etapas
            // configuráveis nem requisitosPorEtapa — usa a semente nesse caso.
            etapas: (parsed.etapas && parsed.etapas.length) ? parsed.etapas : fresh.etapas,
            requisitosPorEtapa: parsed.requisitosPorEtapa || fresh.requisitosPorEtapa,
          });
          // saneamento: se algum móvel salvo antigamente ainda tiver etapa numérica
          // (índice de array, formato pré-v2.1), converte pra chave da etapa nessa posição.
          const ordenadas = migrado.etapas.slice().sort((a,b)=>a.ordem-b.ordem);
          migrado.obras.forEach(o=>o.ambientes.forEach(a=>a.moveis.forEach(m=>{
            if(typeof m.etapa === "number"){
              m.etapa = (ordenadas[m.etapa]||ordenadas[ordenadas.length-1]).id;
            }
          })));
          return migrado;
        }
      }
    }catch(e){ console.warn("Falha ao carregar estado salvo, usando dados de exemplo.", e); }
    return seedState();
  }

  // boot local instantâneo — localStorage (ou a semente) renderiza a tela na
  // hora; se o Supabase estiver configurado, o estado de verdade chega logo
  // em seguida (ver sincronizarComSupabase(), no fim deste arquivo) e
  // substitui isto aqui sem o usuário perceber um "piscar" de tela vazia.
  const state = load();
  const listeners = [];

  function persist(){
    try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }catch(e){ /* quota etc: ignora */ }
  }
  // SUPABASE: cada emit() já salvava só no localStorage; agora, quando o
  // Supabase está configurado, também manda o estado inteiro pra nuvem
  // (fire-and-forget — não trava a UI esperando a rede). localStorage
  // continua sendo gravado sempre, como cache local/offline.
  let supaSaveTimer = null;
  let supaRetryTimer = null;
  let supaSaveFailing = false;
  // CORREÇÃO (auditoria): antes, uma falha de gravação na nuvem (rede caiu,
  // Supabase fora do ar etc.) era só um console.error — o operador continuava
  // vendo a tela normal, achando que estava tudo sincronizado, quando na
  // verdade só o localStorage deste aparelho tinha o dado novo. Agora avisa
  // com um toast (uma vez, não a cada tentativa) e tenta de novo sozinho.
  function avisarFalhaNuvem(){
    if(supaSaveFailing) return;
    supaSaveFailing = true;
    if(M.UI && M.UI.toast) M.UI.toast("⚠️ Não foi possível salvar na nuvem agora. Os dados continuam salvos neste aparelho — tentando reconectar…");
    if(!supaRetryTimer){
      supaRetryTimer = setInterval(()=>{
        M.Supa.salvarEstado(state).then(ok=>{ if(ok) avisarNuvemOk(); });
      }, 15000);
    }
  }
  function avisarNuvemOk(){
    if(supaRetryTimer){ clearInterval(supaRetryTimer); supaRetryTimer = null; }
    if(supaSaveFailing){
      supaSaveFailing = false;
      if(M.UI && M.UI.toast) M.UI.toast("Conexão com a nuvem restabelecida — dados sincronizados.");
    }
  }
  function persistSupabase(){
    if(!(M.Supa && M.Supa.habilitado)) return;
    // debounce curto: ações em sequência rápida (ex.: digitando) viram 1 gravação só
    clearTimeout(supaSaveTimer);
    supaSaveTimer = setTimeout(()=>{
      M.Supa.salvarEstado(state).then(ok=>{ ok ? avisarNuvemOk() : avisarFalhaNuvem(); });
    }, 400);
  }
  function emit(){ persist(); persistSupabase(); listeners.forEach(fn=>fn()); }

  // SUPABASE: aplica um estado vindo da nuvem (carga inicial ou tempo real de
  // outro aparelho) por cima do estado local, sem trocar a referência do
  // objeto `state` (todo o resto do app já guardou essa referência).
  function aplicarEstadoRemoto(remoto){
    if(!remoto) return;
    Object.keys(state).forEach(k=>{ delete state[k]; });
    Object.assign(state, remoto);
    persist();
    listeners.forEach(fn=>fn());
  }
  function sincronizarComSupabase(){
    if(!(M.Supa && M.Supa.habilitado)) return;
    M.Supa.ready.then(ok=>{
      if(!ok) return;
      M.Supa.carregarEstado().then(remoto=>{
        if(remoto){
          aplicarEstadoRemoto(remoto);
        } else {
          // tabela vazia: primeiro acesso de todos — semeia a nuvem com o
          // estado local (de exemplo ou já salvo neste aparelho).
          M.Supa.salvarEstado(state);
        }
        // a partir daqui, mudanças feitas em QUALQUER outro aparelho chegam aqui.
        M.Supa.assinarMudancas(remoto2=> aplicarEstadoRemoto(remoto2));
      });
      sincronizarEquipeComSupabase();
    });
  }

  // SUPABASE: a equipe (M.COLABORADORES) vive numa tabela relacional própria,
  // separada do blob de estado_operacional — mutamos o array NO LUGAR (nunca
  // reatribuímos M.COLABORADORES) porque data.js guarda uma referência interna
  // ao mesmo array (colabByNome) que precisa continuar enxergando os dados novos.
  function aplicarColaboradoresRemotos(lista){
    if(!lista) return;
    M.COLABORADORES.length = 0;
    lista.forEach(c=> M.COLABORADORES.push(c));
    listeners.forEach(fn=>fn());
  }
  function sincronizarEquipeComSupabase(){
    M.Supa.listarColaboradores().then(lista=>{
      if(lista && lista.length) aplicarColaboradoresRemotos(lista);
      // se vier vazia, mantém o elenco de exemplo local até alguém cadastrar a equipe real.
      M.Supa.assinarMudancasColaboradores(()=>{
        M.Supa.listarColaboradores().then(lista2=> aplicarColaboradoresRemotos(lista2));
      });
    });
  }

  const Store = {
    state,
    subscribe(fn){ listeners.push(fn); return ()=>{ const i=listeners.indexOf(fn); if(i>=0) listeners.splice(i,1); }; },
    reset(){ Object.assign(state, seedState()); emit(); },
    // re-renderiza sem persistir `state` — usado depois de mudanças que vivem
    // fora do estado principal (hoje: equipe, gravada direto na tabela colaboradores).
    notify(){ listeners.forEach(fn=>fn()); },

    // ---------- lookups ----------
    getObra(obraId){ return state.obras.find(o=>o.id===obraId); },
    findMovel(movelId){
      for(const o of state.obras) for(const a of o.ambientes) for(const m of a.moveis)
        if(m.id===movelId) return {o,a,m};
      return null;
    },
    findAmbiente(ambienteId){
      for(const o of state.obras) for(const a of o.ambientes) if(a.id===ambienteId) return {o,a};
      return null;
    },
    allMoveis(){
      const out=[];
      state.obras.forEach(o=>o.ambientes.forEach(a=>a.moveis.forEach(m=>out.push({o,a,m}))));
      return out;
    },

    // ---------- histórico ----------
    log(obraId, tipo, descricao){
      state.historico.unshift({id:M.uid("hist"), obraId, tipo, descricao, data:new Date().toISOString(), usuario:state.usuarioAtual});
    },

    // ---------- auditoria (seção 48-52) — registra exceções e alterações críticas ----------
    audit(entry){
      const item = Object.assign({
        id:M.uid("aud"), data:M.todayISO(), hora:new Date().toTimeString().slice(0,5),
        usuario: state.usuarioAtual, categoria:"OPERACIONAL",
      }, entry);
      state.auditoria.unshift(item);
      return item;
    },

    // ---------- permissões ----------
    perfilAtual(){
      const c = M.colabByNome(state.usuarioAtual);
      return M.perfilDef(c? c.perfil : "OPERADOR");
    },
    pode(acao){ return !!Store.perfilAtual().pode[acao]; },

    // ============================================================
    // ETAPAS — configuráveis (Configurações → Processos → Etapas)
    // ============================================================
    // todas as etapas cadastradas, na ordem configurada (ativas ou não)
    etapasOrdenadas(){ return state.etapas.slice().sort((a,b)=>a.ordem-b.ordem); },
    // só as ativas, na ordem — é o que o Kanban/fluxo normal usa
    etapasAtivas(){ return Store.etapasOrdenadas().filter(e=>e.ativa); },
    etapaById(id){
      return state.etapas.find(e=>e.id===id) || {id, nome:id||"—", nomeCurto:id||"—", grupo:null, ordem:9999, cor:"neutral", ativa:true};
    },
    grupoLabel(grupoKey){ const g = M.STAGE_GROUPS.find(x=>x.key===grupoKey); return g? g.label : "—"; },
    // posição relativa dentro de TODAS as etapas configuradas (ativas ou não) —
    // usado pra comparações "essa etapa está antes/depois daquela", que continuam
    // corretas mesmo que uma etapa nova seja inserida no meio do fluxo depois.
    posicaoEtapa(id){
      const ord = Store.etapasOrdenadas();
      const i = ord.findIndex(e=>e.id===id);
      return i<0 ? ord.length : i;
    },
    proximaEtapaId(id){
      const ativas = Store.etapasAtivas();
      const pos = ativas.findIndex(e=>e.id===id);
      if(pos<0){
        // etapa atual está desativada/desconhecida: usa a próxima ativa depois dela na ordem geral
        const p = Store.posicaoEtapa(id);
        const prox = Store.etapasOrdenadas().slice(p+1).find(e=>e.ativa);
        return prox? prox.id : null;
      }
      return pos < ativas.length-1 ? ativas[pos+1].id : null;
    },
    etapaAnteriorId(id){
      const ativas = Store.etapasAtivas();
      const pos = ativas.findIndex(e=>e.id===id);
      if(pos<0){
        const p = Store.posicaoEtapa(id);
        const ant = Store.etapasOrdenadas().slice(0,p).reverse().find(e=>e.ativa);
        return ant? ant.id : null;
      }
      return pos > 0 ? ativas[pos-1].id : null;
    },
    // uma etapa "tem histórico" se alguma tarefa (mesmo concluída há tempos) ou
    // algum móvel (mesmo já tendo avançado) já passou por ela — nesse caso ela
    // só pode ser desativada, nunca excluída de vez (senão o histórico mentiria).
    etapaTemHistorico(id){
      if(state.tarefas.some(t=>t.etapa===id)) return true;
      if(Store.allMoveis().some(({m})=>m.etapa===id)) return true;
      if(state.auditoria.some(a=>a.etapa===id)) return true;
      return false;
    },
    criarEtapa(dados){
      let id = slug(dados.nome);
      if(state.etapas.some(e=>e.id===id)) id = id + "_" + M.uid("e").split("-")[1];
      const ordemMax = state.etapas.length ? Math.max(...state.etapas.map(e=>e.ordem)) : -1;
      const nova = Object.assign({
        id, nome:dados.nome||id, nomeCurto:dados.nomeCurto||dados.nome||id,
        grupo:dados.grupo||M.STAGE_GROUPS[0].key, ordem:ordemMax+1, cor:dados.cor||"neutral",
        tempoEsperadoDias:Number(dados.tempoEsperadoDias)||1, responsavelPadrao:dados.responsavelPadrao||"",
        pesoValorProcessado:Number(dados.pesoValorProcessado)||0, exigeConferencia:!!dados.exigeConferencia,
        permiteAvancoExcepcional: dados.permiteAvancoExcepcional!==false, ativa:true,
      });
      state.etapas.push(nova);
      state.requisitosPorEtapa[id] = [];
      state.tarefasPadrao[id] = [];
      Store.audit({categoria:"GOVERNANCA", tipo:"ALTERACAO_PROCESSO", descricao:`Nova etapa criada: "${nova.nome}"`});
      emit();
      return nova;
    },
    editarEtapa(id, patch){
      const e = state.etapas.find(x=>x.id===id); if(!e) return {ok:false};
      const campos = ["nome","nomeCurto","grupo","cor","tempoEsperadoDias","responsavelPadrao","pesoValorProcessado","exigeConferencia","permiteAvancoExcepcional"];
      campos.forEach(c=>{ if(patch[c]!==undefined) e[c] = (c==="tempoEsperadoDias"||c==="pesoValorProcessado") ? Number(patch[c]) : patch[c]; });
      Store.audit({categoria:"GOVERNANCA", tipo:"ALTERACAO_PROCESSO", descricao:`Etapa "${e.nome}" editada`});
      emit();
      return {ok:true, etapa:e};
    },
    duplicarEtapa(id){
      const e = state.etapas.find(x=>x.id===id); if(!e) return null;
      const clone = Object.assign({}, e);
      let novoId = slug(e.nome+"_copia");
      while(state.etapas.some(x=>x.id===novoId)) novoId = novoId+"_2";
      clone.id = novoId; clone.nome = e.nome+" (cópia)"; clone.nomeCurto = e.nomeCurto+" (cópia)";
      // insere logo depois da original e renumera
      const ord = Store.etapasOrdenadas();
      const pos = ord.findIndex(x=>x.id===id);
      ord.splice(pos+1, 0, clone);
      ord.forEach((x,i)=>x.ordem=i);
      state.etapas.push(clone);
      state.requisitosPorEtapa[novoId] = deepClone(state.requisitosPorEtapa[id]||[]);
      state.tarefasPadrao[novoId] = deepClone(state.tarefasPadrao[id]||[]).map(t=>Object.assign({},t,{id:M.uid("tskp")}));
      Store.audit({categoria:"GOVERNANCA", tipo:"ALTERACAO_PROCESSO", descricao:`Etapa "${e.nome}" duplicada como "${clone.nome}"`});
      emit();
      return clone;
    },
    moverEtapaOrdem(id, direcao){
      const ord = Store.etapasOrdenadas();
      const pos = ord.findIndex(x=>x.id===id); if(pos<0) return;
      const alvo = direcao==="up" ? pos-1 : pos+1;
      if(alvo<0 || alvo>=ord.length) return;
      const tmp = ord[pos].ordem; ord[pos].ordem = ord[alvo].ordem; ord[alvo].ordem = tmp;
      emit();
    },
    reordenarEtapas(idsEmNovaOrdem){
      idsEmNovaOrdem.forEach((id,i)=>{ const e = state.etapas.find(x=>x.id===id); if(e) e.ordem = i; });
      Store.audit({categoria:"GOVERNANCA", tipo:"ALTERACAO_PROCESSO", descricao:"Ordem das etapas do pipeline foi alterada"});
      emit();
    },
    desativarEtapa(id){
      const e = state.etapas.find(x=>x.id===id); if(!e) return {ok:false};
      if(Store.etapasAtivas().length<=1) return {ok:false, motivo:"UNICA_ATIVA"};
      e.ativa = false;
      Store.audit({categoria:"GOVERNANCA", tipo:"ALTERACAO_PROCESSO", descricao:`Etapa "${e.nome}" desativada`});
      emit();
      return {ok:true};
    },
    ativarEtapa(id){
      const e = state.etapas.find(x=>x.id===id); if(!e) return;
      e.ativa = true;
      Store.audit({categoria:"GOVERNANCA", tipo:"ALTERACAO_PROCESSO", descricao:`Etapa "${e.nome}" reativada`});
      emit();
    },
    excluirEtapa(id){
      if(Store.etapaTemHistorico(id)) return {ok:false, motivo:"HISTORICO"};
      const e = state.etapas.find(x=>x.id===id); if(!e) return {ok:false};
      state.etapas = state.etapas.filter(x=>x.id!==id);
      delete state.requisitosPorEtapa[id];
      delete state.tarefasPadrao[id];
      Store.etapasOrdenadas().forEach((x,i)=>x.ordem=i);
      Store.audit({categoria:"GOVERNANCA", tipo:"ALTERACAO_PROCESSO", descricao:`Etapa "${e.nome}" excluída (nunca teve histórico)`});
      emit();
      return {ok:true};
    },

    // ---------- requisitos por etapa (biblioteca configurável) ----------
    requisitosDe(etapaId){
      return (state.requisitosPorEtapa[etapaId]||[]).slice().sort((a,b)=>a.ordem-b.ordem);
    },
    criarRequisito(etapaId, dados){
      state.requisitosPorEtapa[etapaId] = state.requisitosPorEtapa[etapaId] || [];
      const arr = state.requisitosPorEtapa[etapaId];
      const item = Object.assign({id:M.uid("req"), ordem:arr.length, obrigatorio:"OBRIGATORIO", permiteOverride:true, exigeEvidencia:false}, dados);
      arr.push(item);
      Store.audit({categoria:"GOVERNANCA", tipo:"ALTERACAO_PROCESSO", descricao:`Requisito "${item.nome}" adicionado à etapa "${Store.etapaById(etapaId).nome}"`});
      emit();
      return item;
    },
    editarRequisito(etapaId, reqId, patch){
      const arr = state.requisitosPorEtapa[etapaId]||[];
      const r = arr.find(x=>x.id===reqId); if(!r) return;
      Object.assign(r, patch);
      emit();
    },
    excluirRequisito(etapaId, reqId){
      state.requisitosPorEtapa[etapaId] = (state.requisitosPorEtapa[etapaId]||[]).filter(x=>x.id!==reqId);
      emit();
    },
    reordenarRequisitos(etapaId, idsEmOrdem){
      idsEmOrdem.forEach((id,i)=>{ const r = (state.requisitosPorEtapa[etapaId]||[]).find(x=>x.id===id); if(r) r.ordem=i; });
      emit();
    },

    // tarefas obrigatórias da etapa ATUAL do móvel, ainda não concluídas
    tarefasObrigatoriasAbertas(m){
      return state.tarefas.filter(t=> t.movelId===m.id && t.etapa===m.etapa
        && t.obrigatorio==="OBRIGATORIO" && t.status!=="CONCLUIDA");
    },
    checarRequisitos(m){
      const req = Store.requisitosDe(m.etapa);
      const overrides = m.requisitosOverride || {};
      const itens = req.map(r=>({...r, atendido: overrides[r.nome] !== undefined ? overrides[r.nome] : true }));
      const faltandoReq = itens.filter(r=>r.obrigatorio==="OBRIGATORIO" && !r.atendido)
        .map(r=>({nome:r.nome, obrigatorio:true, permiteAvancoExcepcional: r.permiteOverride!==false}));
      const tarefasAbertas = Store.tarefasObrigatoriasAbertas(m).map(t=>({nome:t.titulo, obrigatorio:true, tarefa:true, permiteAvancoExcepcional: t.permiteAvancoExcepcional!==false}));
      const faltando = faltandoReq.concat(tarefasAbertas);
      const bloqueioDuro = faltando.filter(t=> t.permiteAvancoExcepcional===false);
      return {itens, liberado: faltando.length===0, faltando, bloqueioDuro};
    },
    toggleRequisito(movelId, nomeReq){
      const f = Store.findMovel(movelId); if(!f) return;
      f.m.requisitosOverride = f.m.requisitosOverride || {};
      const atual = f.m.requisitosOverride[nomeReq];
      f.m.requisitosOverride[nomeReq] = atual === undefined ? false : !atual;
      emit();
    },
    // cria automaticamente as tarefas padrão da biblioteca ao entrar numa etapa (seção 12)
    criarTarefasPadraoParaEtapa(f, etapaId){
      const padroes = state.tarefasPadrao[etapaId] || [];
      padroes.forEach(p=>{
        const jaExiste = state.tarefas.some(t=> t.movelId===f.m.id && t.etapa===etapaId && t.titulo===p.titulo && t.origemPadrao);
        if(jaExiste) return;
        state.tarefas.push({
          id:M.uid("tsk"), obraId:f.o.id, obraNome:f.o.cliente, ambienteId:f.a.id, ambienteNome:f.a.nome,
          movelId:f.m.id, movelNome:f.m.nome, titulo:p.titulo, etapa:etapaId, tipo:"PRODUCAO",
          obrigatorio:p.obrigatorio||"RECOMENDADO", responsavelPlanejado:p.responsavelPadrao||f.m.responsavel,
          executadoPor:null, conferidoPor:null, instrucoes:p.instrucoes||"", prazo: p.prazoPadraoDias? M.dOff(p.prazoPadraoDias):null,
          permiteAvancoExcepcional: p.permiteAvancoExcepcional!==false, exigeConferencia: !!p.exigeConferencia, origemPadrao:true,
          inicio:null, fim:null, data:M.todayISO(), status:"PLANEJADA",
        });
      });
    },
    moverEtapa(movelId, novaEtapaId, opts){
      opts = opts || {};
      const f = Store.findMovel(movelId); if(!f) return {ok:false};
      if(!novaEtapaId) return {ok:false, motivo:"SEM_PROXIMA_ETAPA"};
      const novaEtapa = Store.etapaById(novaEtapaId);
      const indoParaFrente = Store.posicaoEtapa(novaEtapaId) > Store.posicaoEtapa(f.m.etapa);
      const etapaAnteriorLabel = Store.etapaById(f.m.etapa).nome;
      // opts.ignorarRequisitos: usado só pelo encerramento de montagem
      // (Store.concluirMontagem), que já faz seu PRÓPRIO levantamento do estado
      // real (pendenciasReaisMovel) e registra tudo em montagemEncerramento —
      // sem isto, um item "sem liberação excepcional" (bloqueioDuro) travava a
      // etapa em FINALIZADA silenciosamente: o toast dizia "montagem encerrada"
      // mas o móvel continuava preso na etapa anterior.
      if(indoParaFrente && !opts.ignorarRequisitos){
        // CORREÇÃO: checar requisitos/tarefas obrigatórias da etapa ATUAL do móvel
        // (o que falta para poder SAIR dela), não da etapa de destino — antes disto,
        // Object.assign(...,{etapa:novaEtapaId}) fazia a checagem olhar pra etapa
        // errada, e tarefas obrigatórias da etapa atual nunca bloqueavam nada.
        const check = Store.checarRequisitos(f.m);
        // CORREÇÃO: uma pendência aberta vinculada ao móvel (m.bloqueio) também
        // precisa travar o avanço normal, igual a um requisito — antes disto era
        // só decorativo no card, dava pra avançar a etapa com o móvel bloqueado.
        const faltandoBloqueio = f.m.bloqueio
          ? [{nome:`Pendência aberta: ${f.m.bloqueio.categoria} — ${f.m.bloqueio.descricao}`, obrigatorio:true, bloqueio:true, permiteAvancoExcepcional:true}]
          : [];
        const faltando = check.faltando.concat(faltandoBloqueio);
        const liberado = faltando.length===0;
        if(!liberado && !opts.forcar){
          return {ok:false, motivo:"REQUISITOS", faltando, bloqueioDuro:check.bloqueioDuro};
        }
        if(!liberado && opts.forcar){
          if(check.bloqueioDuro.length){
            return {ok:false, motivo:"BLOQUEIO_DURO", faltando:check.bloqueioDuro};
          }
          if(!Store.pode("liberarExcecao")){
            return {ok:false, motivo:"SEM_PERMISSAO"};
          }
          f.m.ressalva = {
            etapa: novaEtapa.id, etapaLabel: novaEtapa.nome,
            motivo: opts.motivoForcar||"-", usuario: state.usuarioAtual,
            data: M.todayISO(), hora: new Date().toTimeString().slice(0,5),
            novoResponsavel: opts.novoResponsavel||null, novoPrazo: opts.novoPrazo||null,
            itensPendentes: faltando.map(x=>x.nome),
          };
          // CORREÇÃO: fica marcado como aberto até alguém resolver de propósito
          // (Store.resolverRessalva) — antes disto, o aviso "avançou com ressalva"
          // desaparecia sozinho assim que o móvel avançava mais uma etapa, mesmo
          // que os itens pendentes nunca tivessem sido resolvidos de verdade.
          f.m.ressalvaAberta = true;
          Store.log(f.o.id, "LIBERACAO_FORCADA", `${f.m.nome}: avançou para "${novaEtapa.nome}" com ressalva. Motivo: ${opts.motivoForcar||"-"}`);
          Store.audit({categoria:"GOVERNANCA", tipo:"AVANCO_COM_RESSALVA", obraId:f.o.id, ambienteId:f.a.id, movelId:f.m.id,
            etapa:novaEtapa.id, descricao:`${f.m.nome} avançou de "${etapaAnteriorLabel}" para "${novaEtapa.nome}" sem concluir: ${faltando.map(x=>x.nome).join(", ")}`,
            motivo:opts.motivoForcar||"-", novoResponsavel:opts.novoResponsavel||null, novoPrazo:opts.novoPrazo||null});
          if(opts.novoResponsavel) f.m.responsavel = opts.novoResponsavel;
        }
      }
      f.m.etapa = novaEtapa.id;
      f.m.dataEntradaEtapa = M.todayISO();
      Store.log(f.o.id, "MUDANCA_ETAPA", `${f.m.nome} → ${novaEtapa.nome}`);
      Store.criarTarefasPadraoParaEtapa(f, novaEtapa.id);
      emit();
      return {ok:true, ressalva: !!f.m.ressalvaAberta};
    },
    // marca os itens pendentes de uma liberação excepcional como resolvidos de
    // fato — só assim o aviso sai do Kanban/Para Finalizar (não sozinho com o tempo).
    resolverRessalva(movelId){
      const f = Store.findMovel(movelId); if(!f || !f.m.ressalvaAberta) return;
      f.m.ressalvaAberta = false;
      Store.log(f.o.id, "RESSALVA_RESOLVIDA", `${f.m.nome}: itens pendentes da liberação excepcional (${(f.m.ressalva&&f.m.ressalva.itensPendentes||[]).join(", ")}) marcados como resolvidos.`);
      Store.audit({categoria:"GOVERNANCA", tipo:"RESSALVA_RESOLVIDA", obraId:f.o.id, ambienteId:f.a.id, movelId:f.m.id,
        descricao:`Itens pendentes da liberação excepcional de "${f.m.nome}" resolvidos.`});
      emit();
    },

    // ---------- checklist ----------
    toggleChecklistItem(movelId, itemId){
      const f = Store.findMovel(movelId); if(!f) return;
      const it = f.m.checklist.find(c=>c.id===itemId); if(!it) return;
      it.concluido = !it.concluido;
      emit();
    },
    setResponsavel(movelId, nome){
      const f = Store.findMovel(movelId); if(!f) return;
      const anterior = f.m.responsavel;
      f.m.responsavel = nome;
      Store.audit({categoria:"OPERACIONAL", tipo:"MUDANCA_RESPONSAVEL", obraId:f.o.id, ambienteId:f.a.id, movelId:f.m.id,
        etapa:f.m.etapa, descricao:`Responsável de "${f.m.nome}" alterado`, responsavelAnterior:anterior, novoResponsavel:nome});
      emit();
    },

    // ---------- pendências (com fluxo operacional — seção 24) ----------
    criarPendencia(p){
      const def = M.categoriaDef(p.categoria);
      const passos = (state.fluxosPadrao[def.fluxo]||["Resolver"]).slice();
      const item = Object.assign({id:M.uid("pnd"), status:"ABERTA", anexo:false, abertura:M.todayISO(),
        fluxoTipo:def.fluxo, fluxoPassos:passos, passoAtual:0, origem:p.origem||null}, p);
      state.pendencias.push(item);
      const f = Store.findMovel(p.movelId);
      if(f){ f.m.bloqueio = {categoria:p.categoria, descricao:p.descricao, responsavel:p.responsavel, fornecedor:p.fornecedor, abertura:item.abertura, prazo:p.prazo, prioridade:p.prioridade, status:"ABERTA"}; }
      Store.log(p.obraId, "PENDENCIA_ABERTA", `${p.categoria}: ${p.descricao}`);
      emit();
      return item;
    },
    avancarFluxoPendencia(pendId){
      const p = state.pendencias.find(x=>x.id===pendId); if(!p) return;
      if(p.passoAtual < p.fluxoPassos.length-1){
        p.passoAtual++;
        p.status = "EM_COBRANCA";
        Store.log(p.obraId, "PENDENCIA_AVANCOU", `${p.categoria}: passo "${p.fluxoPassos[p.passoAtual]}"`);
      } else {
        Store.atualizarStatusPendencia(pendId, "RESOLVIDA");
        return;
      }
      emit();
    },
    atualizarStatusPendencia(pendId, status){
      const p = state.pendencias.find(x=>x.id===pendId); if(!p) return;
      const eraResolvida = p.status==="RESOLVIDA";
      p.status = status;
      if(status==="RESOLVIDA"){
        p.passoAtual = p.fluxoPassos ? p.fluxoPassos.length-1 : 0;
        const f = Store.findMovel(p.movelId);
        if(f && f.m.bloqueio) f.m.bloqueio = null;
        Store.log(p.obraId, "PENDENCIA_RESOLVIDA", `${p.categoria}: ${p.descricao}`);
      }
      if(status==="ABERTA" && eraResolvida){
        Store.log(p.obraId, "PENDENCIA_REABERTA", `${p.categoria}: ${p.descricao}`);
        Store.audit({categoria:"QUALIDADE", tipo:"PENDENCIA_REABERTA", obraId:p.obraId, movelId:p.movelId,
          descricao:`Pendência "${p.categoria}" reaberta — ${p.descricao}`});
      }
      emit();
    },
    reabrirPendencia(pendId){ Store.atualizarStatusPendencia(pendId, "ABERTA"); },

    // ---------- arquivos do projeto (por obra) ----------
    adicionarArquivo(obraId, arquivo){
      const o = Store.getObra(obraId); if(!o) return;
      o.arquivos = o.arquivos || [];
      const item = Object.assign({id:M.uid("arq"), enviadoEm:M.todayISO()}, arquivo);
      o.arquivos.unshift(item);
      Store.log(obraId, "ARQUIVO_ENVIADO", `Arquivo enviado: ${arquivo.nome}`);
      emit();
      return item;
    },
    removerArquivo(obraId, arquivoId){
      const o = Store.getObra(obraId); if(!o) return;
      o.arquivos = (o.arquivos||[]).filter(a=>a.id!==arquivoId);
      emit();
    },

    // ---------- lotes ----------
    criarLote(l){
      const item = Object.assign({id:M.uid("lote"), status:"PROGRAMADO", data:M.todayISO()}, l);
      state.lotes.unshift(item); emit(); return item;
    },

    // ---------- tarefas ----------
    criarTarefa(t){
      const item = Object.assign({id:M.uid("tsk"), status:"PLANEJADA", tipo:t.tipo||"PRODUCAO",
        obrigatorio:t.obrigatorio||"OPCIONAL", permiteAvancoExcepcional:t.permiteAvancoExcepcional!==false, data:M.todayISO()}, t);
      state.tarefas.push(item); emit(); return item;
    },
    // seção 13 — salvar tarefa também como padrão da biblioteca daquela etapa
    salvarTarefaComoPadrao(t){
      if(!t.etapa) return;
      state.tarefasPadrao[t.etapa] = state.tarefasPadrao[t.etapa] || [];
      const arr = state.tarefasPadrao[t.etapa];
      arr.push({
        id:M.uid("tskp"), ordem:arr.length, titulo:t.titulo, descricao:t.descricao||"",
        obrigatorio:t.obrigatorio||"OPCIONAL", responsavelPadrao:t.responsavelPlanejado,
        prazoPadraoDias:null, instrucoes:t.instrucoes||"", permiteAvancoExcepcional:t.permiteAvancoExcepcional!==false,
        exigeConferencia:!!t.exigeConferencia,
      });
      Store.audit({categoria:"GOVERNANCA", tipo:"ALTERACAO_PROCESSO", descricao:`Tarefa "${t.titulo}" adicionada à biblioteca padrão de ${Store.etapaById(t.etapa).nome}`});
      emit();
    },
    // ---------- biblioteca de tarefas padrão (Configurações → Processos) ----------
    criarTarefaPadrao(etapaId, dados){
      state.tarefasPadrao[etapaId] = state.tarefasPadrao[etapaId] || [];
      const arr = state.tarefasPadrao[etapaId];
      const item = Object.assign({id:M.uid("tskp"), ordem:arr.length, obrigatorio:"RECOMENDADO",
        permiteAvancoExcepcional:true, exigeConferencia:false, descricao:""}, dados);
      arr.push(item);
      Store.audit({categoria:"GOVERNANCA", tipo:"ALTERACAO_PROCESSO", descricao:`Tarefa padrão "${item.titulo}" criada em "${Store.etapaById(etapaId).nome}"`});
      emit();
      return item;
    },
    editarTarefaPadrao(etapaId, tarefaPadraoId, patch){
      const arr = state.tarefasPadrao[etapaId]||[];
      const t = arr.find(x=>x.id===tarefaPadraoId); if(!t) return;
      Object.assign(t, patch);
      Store.audit({categoria:"GOVERNANCA", tipo:"ALTERACAO_PROCESSO", descricao:`Tarefa padrão "${t.titulo}" editada`});
      emit();
    },
    moverTarefaPadraoParaEtapa(etapaId, tarefaPadraoId, novaEtapaId){
      if(etapaId===novaEtapaId) return;
      const arr = state.tarefasPadrao[etapaId]||[];
      const idx = arr.findIndex(x=>x.id===tarefaPadraoId); if(idx<0) return;
      const [t] = arr.splice(idx,1);
      state.tarefasPadrao[novaEtapaId] = state.tarefasPadrao[novaEtapaId] || [];
      t.ordem = state.tarefasPadrao[novaEtapaId].length;
      state.tarefasPadrao[novaEtapaId].push(t);
      Store.audit({categoria:"GOVERNANCA", tipo:"ALTERACAO_PROCESSO",
        descricao:`Tarefa padrão "${t.titulo}" movida de "${Store.etapaById(etapaId).nome}" para "${Store.etapaById(novaEtapaId).nome}"`});
      emit();
    },
    excluirTarefaPadrao(etapaId, tarefaPadraoId){
      state.tarefasPadrao[etapaId] = (state.tarefasPadrao[etapaId]||[]).filter(x=>x.id!==tarefaPadraoId);
      emit();
    },
    iniciarTarefa(tarefaId, executor){
      const t = state.tarefas.find(x=>x.id===tarefaId); if(!t) return;
      t.status = "EM_ANDAMENTO"; t.executadoPor = executor || t.responsavelPlanejado;
      t.inicio = new Date().toTimeString().slice(0,5);
      emit();
    },
    pausarTarefa(tarefaId){
      const t = state.tarefas.find(x=>x.id===tarefaId); if(!t) return;
      t.status = "PLANEJADA"; t.pausadaEm = new Date().toTimeString().slice(0,5);
      emit();
    },
    concluirTarefa(tarefaId, resultado, opts){
      opts = opts || {};
      const t = state.tarefas.find(x=>x.id===tarefaId); if(!t) return;
      t.status = "CONCLUIDA"; t.fim = new Date().toTimeString().slice(0,5); t.resultado = resultado || "OK";
      if(opts.conferidoPor) t.conferidoPor = opts.conferidoPor;
      if(resultado === "GEROU_REFACAO" && t.movelId){
        Store.criarTarefa({obraId:t.obraId, obraNome:t.obraNome, ambienteId:t.ambienteId, ambienteNome:t.ambienteNome,
          movelId:t.movelId, movelNome:t.movelNome, titulo:"Retrabalho: "+t.titulo, etapa:t.etapa,
          responsavelPlanejado:t.executadoPor, tipo:"REFACAO", obrigatorio:"OBRIGATORIO",
          motivoRefacao:opts.observacao||"Gerado a partir de: "+t.titulo, origemProblema:opts.origemProblema||"Não identificado",
          fotos:opts.fotos||[]});
        Store.audit({categoria:"QUALIDADE", tipo:"RETRABALHO", obraId:t.obraId, ambienteId:t.ambienteId, movelId:t.movelId,
          etapa:t.etapa, descricao:`Retrabalho gerado em "${t.titulo}"`, motivo:opts.observacao||"-"});
      }
      emit();
    },

    // ---------- assistências (seção 44-47) ----------
    criarAssistencia(a){
      const item = Object.assign({id:M.uid("asst"), status:"ABERTA", data:M.todayISO()}, a);
      state.assistencias.unshift(item);
      Store.audit({categoria:"QUALIDADE", tipo:"ASSISTENCIA_ABERTA", obraId:a.obraId,
        descricao:`Assistência aberta — ${a.categoria}: ${a.descricao}`, motivo:a.origem||"-"});
      emit();
      return item;
    },
    atualizarAssistencia(id, patch){
      const a = state.assistencias.find(x=>x.id===id); if(!a) return;
      Object.assign(a, patch);
      if(patch.status==="CONCLUIDA"){
        Store.audit({categoria:"QUALIDADE", tipo:"ASSISTENCIA_CONCLUIDA", obraId:a.obraId, descricao:`Assistência concluída — ${a.categoria}: ${a.descricao}`});
      }
      emit();
    },

    // ---------- usuário / permissões ----------
    setUsuarioAtual(nome){ state.usuarioAtual = nome; emit(); },

    // ---------- nova obra ----------
    criarObra(obra){
      const processed = obra;
      processed.fatorLiquido = processed.valorLiquido / processed.valorBruto;
      processed.desconto = processed.valorBruto - processed.valorLiquido;
      processed.descontoPct = processed.desconto / processed.valorBruto;
      processed.ambientes.forEach(a=>{
        a.valorBruto = Math.round(processed.valorBruto * a.valorBrutoPct);
        a.valorLiquido = Math.round(a.valorBruto * processed.fatorLiquido);
        a.obraId = processed.id;
        a.moveis.forEach(m=>{ m.ambienteId=a.id; m.obraId=processed.id; m.checklist=m.checklist||[]; m.componentesCriticos=m.componentesCriticos||[]; m.requisitosOverride={}; m.dataEntradaEtapa=M.todayISO(); });
      });
      state.obras.push(processed);
      Store.log(processed.id, "OBRA_CRIADA", `Obra ${processed.numeroOS} criada a partir da importação.`);
      emit();
      return processed;
    },

    // ---------- montagem: encerramento (seção 32) ----------
    // CORREÇÃO (auditoria funcional #82): antes, "tem pendências?" era só uma
    // caixinha que o próprio operador marcava de memória — nada checava o
    // estado real (bloqueio aberto, retrabalho/aguardando em componentes
    // críticos, tarefa obrigatória não concluída, pendência aberta vinculada
    // ao móvel, ressalva de liberação excepcional não resolvida). Dava pra
    // encerrar como "concluída" limpa mesmo com pendência real aberta.
    // Agora o sistema calcula essa lista sozinho (pendenciasReaisMovel) e ela
    // conta pra decidir o status, além do que o operador marcar manualmente.
    pendenciasReaisMovel(m){
      const itens = [];
      if(m.bloqueio) itens.push(`Bloqueio aberto: ${m.bloqueio.categoria} — ${m.bloqueio.descricao}`);
      if(m.ressalvaAberta) itens.push("Ressalva de liberação excepcional ainda não resolvida");
      (m.componentesCriticos||[]).forEach(c=>{
        if(c.status==="REFACAO") itens.push(`Retrabalho pendente: ${c.nome}`);
        if(c.status==="AGUARDANDO") itens.push(`Aguardando: ${c.nome}`);
      });
      Store.tarefasObrigatoriasAbertas(m).forEach(t=> itens.push(`Tarefa obrigatória em aberto: ${t.titulo}`));
      state.pendencias.filter(p=>p.movelId===m.id && p.status!=="RESOLVIDA").forEach(p=> itens.push(`Pendência aberta: ${p.categoria} — ${p.descricao}`));
      return itens;
    },
    concluirMontagem(movelId, checklistOk, temPendenciasInformado){
      const f = Store.findMovel(movelId); if(!f) return {ok:false};
      const pendReais = Store.pendenciasReaisMovel(f.m);
      const temPendencias = !!(temPendenciasInformado || pendReais.length);
      f.m.montagemEncerramento = {
        concluidaEm:M.todayISO(), checklistOk, status: temPendencias?"CONCLUIDA_COM_PENDENCIAS":"CONCLUIDA",
        itensPendentesReais: pendReais,
      };
      if(temPendencias){
        Store.audit({categoria:"QUALIDADE", tipo:"MONTAGEM_COM_PENDENCIA", obraId:f.o.id, movelId:f.m.id,
          descricao:`Montagem de "${f.m.nome}" encerrada com pendências em aberto${pendReais.length? ": "+pendReais.join("; ") : " (informado manualmente pelo responsável)"}`});
      }
      Store.moverEtapa(movelId, "FINALIZADA", {ignorarRequisitos:true});
      emit();
      return {ok:true, temPendencias, pendReais};
    },

    // ---------- configurações ----------
    setPesosDesempenho(novo){ state.pesosDesempenho = novo; Store.audit({categoria:"GOVERNANCA", tipo:"ALTERACAO_PROCESSO", descricao:"Pesos do índice de desempenho atualizados."}); emit(); },
    setNotificacoes(novo){ state.notificacoes = novo; emit(); },
    toggleTvWidget(id){
      state.tvWidgetsAtivos[id] = state.tvWidgetsAtivos[id]===false ? true : false;
      emit();
    },
    setMetaMensal(valor){ state.metaMensal.valor = valor; emit(); },
    setFluxoPadrao(fluxoTipo, passos){
      state.fluxosPadrao[fluxoTipo] = passos;
      Store.audit({categoria:"GOVERNANCA", tipo:"ALTERACAO_PROCESSO", descricao:`Fluxo padrão de pendência "${fluxoTipo}" atualizado.`});
      emit();
    },
  };

  M.Store = Store;
  // primeira gravação (local — instantânea)
  persist();
  // SUPABASE: dispara a sincronização em segundo plano (não bloqueia o boot)
  sincronizarComSupabase();
})();
