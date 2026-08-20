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

  // ---------- componentes críticos ↔ pendência (plano "obra no centro") ----------
  // Um componente crítico AGUARDANDO/REFACAO precisa de uma pendência real por
  // trás (senão fica só decorativo: não bloqueia etapa, não aparece em
  // Pendências, não tem próxima ação). Essas funções ficam fora do objeto Store
  // porque são usadas tanto por Store.criarComponenteCritico (criação ao vivo,
  // via UI) quanto por Store.criarObra (itens especiais da Nova Obra) — um único
  // lugar monta o objeto de pendência, não duplicado nos dois.
  // novaPendenciaObj NÃO chama emit()/Store.log() — só monta e devolve o objeto,
  // igual criarTarefasPadraoParaEtapa faz com tarefa. Quem chama decide quando
  // dar o emit() (uma única vez por ação do usuário, nunca no meio de um laço).
  function novaPendenciaObj(p){
    const def = M.categoriaDef(p.categoria);
    const passos = (state.fluxosPadrao[def.fluxo]||["Resolver"]).slice();
    // FASE 2 (handoff): tipo/impacto são os campos novos. Se quem chamou não
    // informou tipo, deriva de categoria (CATEGORIA_TO_TIPO); impacto default
    // "Impede finalizar" — nem passa despercebido (Informativo) nem já nasce
    // travando ambiente/obra sem o usuário ter escolhido isso de propósito.
    const tipo = p.tipo || M.derivarTipoDeCategoria(p.categoria);
    const impacto = p.impacto || "IMPEDE_FINALIZAR";
    const agora = M.todayISO();
    const usuario = state.usuarioAtual || null;
    return Object.assign({id:M.uid("pnd"), status:"ABERTA", anexo:false, abertura:agora,
      fluxoTipo:def.fluxo, fluxoPassos:passos, passoAtual:0, origem:p.origem||null,
      fotosAbertura: p.fotos||p.fotosAbertura||[], fotosResolucao:[],
      // rastreabilidade preparada mesmo sem Auth real (usa o usuário ativo atual)
      criadoPor:usuario, criadoEm:agora, atualizadoPor:usuario, atualizadoEm:agora,
      resolvidoPor:null, resolvidoEm:null,
    }, p, {tipo, impacto});
  }
  function criarPendenciaDoComponente(f, comp){
    const categoria = M.TIPO_COMPONENTE_TO_CATEGORIA[comp.tipo] || "Outro";
    const pend = novaPendenciaObj({
      obraId:f.o.id, ambienteId:f.a.id, movelId:f.m.id,
      obraNome:f.o.cliente, ambienteNome:f.a.nome, movelNome:f.m.nome,
      categoria, descricao: comp.nome + (comp.observacao? " — "+comp.observacao : (comp.motivo? " — "+comp.motivo : "")),
      responsavel: comp.responsavel || f.o.responsavel, fornecedor: comp.fornecedor||"",
      prazo: comp.prazo||null, prioridade:"ALTA", componenteCriticoId: comp.id,
    });
    state.pendencias.push(pend);
    comp.pendenciaId = pend.id;
    return pend;
  }
  function criarComponenteEmMovel(f, dados){
    const comp = Object.assign({id:M.uid("comp"), status:"AGUARDANDO", fornecedor:"", motivo:"", observacao:""}, dados);
    f.m.componentesCriticos = f.m.componentesCriticos || [];
    f.m.componentesCriticos.push(comp);
    if(comp.status==="AGUARDANDO" || comp.status==="REFACAO") criarPendenciaDoComponente(f, comp);
    return comp;
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
      // permissões (item 10): ponto único de verdade — cada perfil começa com o
      // "pode" padrão de M.PERFIS, mas a partir daqui vive aqui, editável e
      // persistida/sincronizada, não mais fixa no código.
      permissoes: M.PERFIS.reduce((acc,p)=>{ acc[p.key] = Object.assign({}, p.pode); return acc; }, {}),
      notificacoes: Object.assign({}, M.NOTIFICACOES_DEFAULT),
      metaMensal: Object.assign({}, M.META_MENSAL),
      tvWidgetsAtivos: {},
      historico: [],
      auditoria: [],
      usuarioAtual: "Paulo Henrique",
      criadoEm: new Date().toISOString(),
    };
  }

  // FASE 1 (V2 — permissões por ação): antes esta migração era um "OU" cru
  // (parsed.permissoes || fresh.permissoes) — um estado salvo antigo simplesmente
  // MANTINHA seu objeto de permissões inteiro, sem nunca ganhar as chaves novas
  // (perfis GESTOR/ASSISTENCIA recém-criados, ou as novas ações granulares tipo
  // "obra.criar") que só existem em `fresh` (semente atual de M.PERFIS). Isso
  // não quebrava Store.pode() (ele já cai no padrão de M.PERFIS quando a chave
  // não existe em state.permissoes), mas quebraria a tela de edição de
  // permissões (Configurações → Permissões), que lê state.permissoes[perfilKey]
  // diretamente. Corrigido aqui: mescla de verdade, por perfil e por ação —
  // toda chave nova (perfil novo ou ação nova) de `fresh` aparece com seu
  // padrão, e qualquer valor já customizado em `saved` continua valendo
  // (nunca se perde uma edição feita por um administrador).
  function mergePermissoes(saved, fresh){
    const out = {};
    Object.keys(fresh).forEach(perfilKey=>{
      out[perfilKey] = Object.assign({}, fresh[perfilKey], (saved && saved[perfilKey]) || {});
    });
    // preserva perfil eventualmente salvo que não exista mais na semente atual
    // (não deveria acontecer hoje, mas não descarta dado por segurança)
    if(saved){
      Object.keys(saved).forEach(perfilKey=>{
        if(!out[perfilKey]) out[perfilKey] = Object.assign({}, saved[perfilKey]);
      });
    }
    return out;
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
            permissoes: mergePermissoes(parsed.permissoes, fresh.permissoes),
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

  // ---------- migração: checklist de componentes (dado antigo) vira Tarefa real ----------
  // Antes desta versão, o "checklist de componentes" do móvel (Corpo MDF, Ferragens,
  // materiais especiais) era uma lista de checkbox isolada, sem Iniciar/Concluir e sem
  // aparecer em Tarefas — um dos 3 lugares diferentes que faziam a mesma coisa (item 9
  // do backlog de melhorias). Obras já salvas (localStorage/Supabase) de antes dessa
  // mudança ainda têm esse checklist antigo — esta função roda uma vez por carregamento,
  // converte cada item num registro real em state.tarefas (preservando o que já estava
  // marcado como concluído) e esvazia m.checklist. É idempotente: se já rodou antes
  // (não sobra item em m.checklist), não faz nada.
  function migrarChecklistLegado(){
    let mudou = false;
    (state.obras||[]).forEach(o=>{
      (o.ambientes||[]).forEach(a=>{
        (a.moveis||[]).forEach(m=>{
          if(m.checklist && m.checklist.length){
            m.checklist.forEach(c=>{
              const jaExiste = state.tarefas.some(t=>t.movelId===m.id && t.titulo===c.nome && t.origemChecklist);
              if(!jaExiste){ Store.criarTarefaDeChecklist({o,a,m}, c.nome, {concluida: !!c.concluido}); mudou = true; }
            });
            m.checklist = [];
            mudou = true;
          }
          // fase 4 do plano "obra no centro": m.bloqueio (objeto único, podia
          // sobrescrever/perder pendência) não existe mais — os bloqueios reais
          // agora vêm sempre de Store.bloqueiosMovel(m.id), derivados direto de
          // state.pendencias. Limpa o campo antigo se ele sobrou de uma versão
          // anterior (dado morto, mas sem sentido deixar por aí).
          if(m.bloqueio !== undefined){ delete m.bloqueio; mudou = true; }
          // fase seguinte do plano "obra no centro": componente crítico
          // AGUARDANDO/REFACAO sem pendência vinculada (obras/componentes
          // criados antes desta correção) ficava só decorativo. Se já existe
          // uma pendência aberta pra esse móvel com a mesma descrição (era o
          // caso dos dados de demonstração, gerados à parte por coletarPendencias),
          // liga nela em vez de duplicar; senão cria uma pendência nova agora.
          (m.componentesCriticos||[]).forEach(c=>{
            if((c.status==="AGUARDANDO" || c.status==="REFACAO") && !c.pendenciaId){
              const pendAberta = state.pendencias.find(p=> p.movelId===m.id && p.status!=="RESOLVIDA"
                && p.descricao && p.descricao.indexOf(c.nome)===0 && !p.componenteCriticoId);
              if(pendAberta){ pendAberta.componenteCriticoId = c.id; c.pendenciaId = pendAberta.id; }
              else criarPendenciaDoComponente({o,a,m}, c);
              mudou = true;
            }
          });
        });
      });
    });
    if(mudou) emit();
  }

  // FASE 2 (handoff) — migração de dado legado do modelo de Pendência: dá
  // tipo/impacto/status novo pra pendência salva ANTES desta versão, sem
  // mudar o que a pessoa já via na tela. Regra: pendência antiga sem impacto
  // ganha "Bloqueia o ambiente" (o modelo antigo tratava QUALQUER pendência
  // aberta como bloqueio — isso preserva esse comportamento visual pra dado
  // já existente); pendência criada a partir de agora usa o default mais
  // moderado definido em novaPendenciaObj ("Impede finalizar"). Idempotente:
  // roda toda vez que o app carrega, mas só mexe em quem ainda não migrou.
  function migrarPendenciasParaModeloHandoff(){
    (state.pendencias||[]).forEach(p=>{
      if(!p.tipo) p.tipo = M.derivarTipoDeCategoria(p.categoria);
      if(!p.impacto) p.impacto = "BLOQUEIA_AMBIENTE";
      if(p.status==="EM_COBRANCA") p.status = "EM_TRATAMENTO";
      if(!p.fotosAbertura) p.fotosAbertura = p.fotos || [];
      if(!p.fotosResolucao) p.fotosResolucao = [];
      if(p.criadoEm===undefined) p.criadoEm = p.abertura || null;
      if(p.criadoPor===undefined) p.criadoPor = null;
      if(p.atualizadoEm===undefined) p.atualizadoEm = p.abertura || null;
      if(p.atualizadoPor===undefined) p.atualizadoPor = null;
      if(p.resolvidoEm===undefined) p.resolvidoEm = p.status==="RESOLVIDA" ? (p.atualizadoEm||p.abertura||null) : null;
      if(p.resolvidoPor===undefined) p.resolvidoPor = null;
    });
  }

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
  // RISCO ENCONTRADO NA AUDITORIA (sincronização multiusuário): o app inteiro
  // (obras, tarefas, pendências) é gravado como um blob único no Supabase.
  // Sem controle de concorrência, se dois aparelhos gravassem quase juntos,
  // quem gravasse por último apagava silenciosamente a mudança do outro — sem
  // aviso nenhum pra ninguém. ultimoAtualizadoEmConhecido guarda o carimbo
  // atualizado_em da última versão que ESTE aparelho leu/gravou; Supa.salvarEstado
  // só grava se o banco ainda estiver nesse carimbo (ver supabase-client.js).
  // Quando não estiver (conflito:true), NÃO sobrescreve — avisarConflito() traz
  // a versão mais recente e avisa, em vez de apagar a mudança de outra pessoa
  // de forma invisível.
  let ultimoAtualizadoEmConhecido = null;
  let avisandoConflito = false;
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
        M.Supa.salvarEstado(state, ultimoAtualizadoEmConhecido).then(processarResultadoSalvar);
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
  // outra pessoa gravou entre a última leitura deste aparelho e agora: em vez
  // de tentar de novo e arriscar apagar a mudança dela, busca a versão mais
  // recente e avisa — quem estava editando aqui precisa conferir/refazer.
  function avisarConflito(){
    if(avisandoConflito) return;
    avisandoConflito = true;
    if(M.UI && M.UI.toast) M.UI.toast("⚠️ Outra pessoa salvou uma mudança agora mesmo — atualizando com a versão mais recente. Se você tinha acabado de mexer em algo, confira e refaça se precisar.");
    M.Supa.carregarEstado().then(remoto=>{
      avisandoConflito = false;
      if(remoto){ ultimoAtualizadoEmConhecido = remoto.atualizadoEm; aplicarEstadoRemoto(remoto.dados); }
    });
  }
  function processarResultadoSalvar(res){
    if(res && res.ok){ ultimoAtualizadoEmConhecido = res.atualizadoEm; avisarNuvemOk(); }
    else if(res && res.conflito) avisarConflito();
    else avisarFalhaNuvem();
  }
  function persistSupabase(){
    if(!(M.Supa && M.Supa.habilitado)) return;
    // debounce curto: ações em sequência rápida (ex.: digitando) viram 1 gravação só
    clearTimeout(supaSaveTimer);
    supaSaveTimer = setTimeout(()=>{
      M.Supa.salvarEstado(state, ultimoAtualizadoEmConhecido).then(processarResultadoSalvar);
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
    // estado vindo da nuvem pode ter sido salvo por uma versão anterior do
    // app (antes da Fase 2) — mesma migração leve do boot local.
    migrarPendenciasParaModeloHandoff();
    persist();
    listeners.forEach(fn=>fn());
  }
  function sincronizarComSupabase(){
    if(!(M.Supa && M.Supa.habilitado)) return;
    M.Supa.ready.then(ok=>{
      if(!ok) return;
      M.Supa.carregarEstado().then(remoto=>{
        if(remoto){
          ultimoAtualizadoEmConhecido = remoto.atualizadoEm;
          aplicarEstadoRemoto(remoto.dados);
        } else {
          // tabela vazia: primeiro acesso de todos — semeia a nuvem com o
          // estado local (de exemplo ou já salvo neste aparelho).
          M.Supa.salvarEstado(state, null).then(processarResultadoSalvar);
        }
        // a partir daqui, mudanças feitas em QUALQUER outro aparelho chegam aqui
        // — atualiza o carimbo conhecido junto, senão a próxima gravação local
        // acharia (errado) que houve conflito.
        M.Supa.assinarMudancas((dados, atualizadoEm)=>{
          ultimoAtualizadoEmConhecido = atualizadoEm;
          aplicarEstadoRemoto(dados);
        });
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
    // bloqueios reais do móvel = pendências abertas vinculadas a ele. Fase 4 do
    // plano "obra no centro": antes disso existia m.bloqueio, um objeto único
    // guardado à parte no móvel — criarPendencia sobrescrevia ele a cada pendência
    // nova (perdendo a anterior) e atualizarStatusPendencia zerava ele ao resolver
    // QUALQUER pendência do móvel, mesmo com outra ainda aberta. Removido o campo
    // duplicado: agora deriva sempre de state.pendencias (a única fonte de verdade),
    // então nunca fica desatualizado.
    // FASE 2 (handoff): bloqueio real = pendência aberta cujo IMPACTO derive
    // "bloqueia fechamento" (Impede finalizar / Bloqueia o ambiente / Bloqueia
    // a obra) — não mais "qualquer pendência aberta". Pendência Informativo ou
    // Não impede aparece na obra mas não trava nada (handoff · wireframes 3b).
    bloqueiosMovel(movelId){
      return state.pendencias.filter(p=>p.movelId===movelId && p.status!=="RESOLVIDA" && M.bloqueiaFechamento(p.impacto));
    },
    // FASE 4 (handoff — Montagem): "Travado" no nível de AMBIENTE é o mesmo
    // mecanismo do bloqueio de móvel (Fase 2) — pendência aberta cujo impacto
    // deriva "bloqueia fechamento" — só que filtrada por ambienteId em vez de
    // movelId (pendência avulsa de ambiente, sem móvel específico, também trava).
    bloqueiosAmbiente(ambienteId){
      return state.pendencias.filter(p=>p.ambienteId===ambienteId && p.status!=="RESOLVIDA" && M.bloqueiaFechamento(p.impacto));
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

    // ---------- permissões (item 10: editáveis de verdade) ----------
    perfilAtual(){
      const c = M.colabByNome(state.usuarioAtual);
      return M.perfilDef(c? c.perfil : "OPERADOR");
    },
    // lê de state.permissoes (editável/persistida) — cai no padrão fixo de
    // M.PERFIS só se essa chave ainda não existir (estado antigo migrando,
    // ou perfil/ação nova que a semente ainda não tinha quando foi salva).
    pode(acao){
      const perfil = Store.perfilAtual();
      const overrides = state.permissoes && state.permissoes[perfil.key];
      if(overrides && Object.prototype.hasOwnProperty.call(overrides, acao)) return !!overrides[acao];
      return !!perfil.pode[acao];
    },
    setPermissao(perfilKey, acao, valor){
      if(!Store.pode("editarPermissoes")) return {ok:false, motivo:"SEM_PERMISSAO"};
      // rede de segurança: ninguém consegue tirar de si mesmo o acesso a
      // Configurações/Permissões por essa tela — evitaria se autotrancar fora
      // sem ter como reverter (só outro perfil com editarPermissoes resolveria).
      if(perfilKey===Store.perfilAtual().key && (acao==="verConfiguracoes"||acao==="editarPermissoes") && !valor){
        return {ok:false, motivo:"AUTOBLOQUEIO"};
      }
      state.permissoes = state.permissoes || {};
      state.permissoes[perfilKey] = Object.assign({}, state.permissoes[perfilKey]);
      state.permissoes[perfilKey][acao] = !!valor;
      Store.audit({categoria:"GOVERNANCA", tipo:"ALTERACAO_PROCESSO",
        descricao:`Permissão "${acao}" do perfil "${M.perfilDef(perfilKey).label}" alterada para ${valor?"permitido":"bloqueado"}.`});
      emit();
      return {ok:true};
    },
    // item 9: obras onde a pessoa tem alguma tarefa/pendência/assistência
    // atribuída — não existe (nem deve existir) um vínculo direto "obra do
    // fulano", então isso é sempre derivado na hora a partir do que já existe.
    obraIdsDoColaborador(nome){
      const ids = new Set();
      state.tarefas.forEach(t=>{ if(t.responsavelPlanejado===nome || t.executadoPor===nome) ids.add(t.obraId); });
      state.pendencias.forEach(p=>{ if(p.responsavel===nome) ids.add(p.obraId); });
      state.assistencias.forEach(a=>{ if(a.responsavel===nome) ids.add(a.obraId); });
      return ids;
    },

    // AJUSTE (rodada 3, item 1) — guard contextual REAL da rota de detalhe
    // de obra ("obra/:id"). Até aqui, obra.verTodas/verAtribuidas/
    // verContexto só precisavam EXISTIR (ver comentário em js/router.js e
    // no topo de js/data.js) — não conferia se a obra pedida na URL era
    // realmente do contexto da pessoa. Isso deixava aberta a possibilidade
    // de, por exemplo, um Montador digitar na mão o ID de uma obra que não
    // é dele e abrir do mesmo jeito. Agora:
    //  - obra.verTodas      -> abre qualquer obra (hoje: Admin/PCP/Líder/
    //                          Gestor/TV).
    //  - obra.verAtribuidas -> só abre se obraId ∈ obraIdsDoColaborador(
    //                          usuário atual) — o MESMO cálculo já usado em
    //                          Hoje/Produção/Montagem/Obras/Calendário pra
    //                          "minhas obras" (tarefa responsavelPlanejado/
    //                          executadoPor, pendência responsavel,
    //                          assistência responsavel — cobre tarefa
    //                          vinculada, pendência vinculada, assistência
    //                          vinculada e atividade de montagem atribuída,
    //                          já que montagem usa a mesma tabela de
    //                          tarefas). Não inventamos um cálculo novo.
    //  - obra.verContexto   -> mesma verificação (é exatamente o conjunto
    //                          de vínculos reais que o pedido de ajuste
    //                          pediu pra cobrir: pendência/tarefa/
    //                          assistência ligada à pessoa).
    // Se a pessoa não tem NENHUMA das 3 chaves, ou tem alguma mas o obraId
    // não está no conjunto dela, NEGA por padrão — nunca libera "todas"
    // como fallback só porque algum contexto ainda não é comprovável.
    podeAbrirObra(obraId){
      if(Store.pode("obra.verTodas")) return true;
      if(!obraId) return false;
      const temAtribuidas = Store.pode("obra.verAtribuidas");
      const temContexto = Store.pode("obra.verContexto");
      if(!temAtribuidas && !temContexto) return false;
      const meuContexto = Store.obraIdsDoColaborador(state.usuarioAtual);
      return meuContexto.has(obraId);
    },

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
        // CORREÇÃO: toda pendência aberta vinculada ao móvel também precisa travar
        // o avanço normal, igual a um requisito — antes disto era só decorativo no
        // card, dava pra avançar a etapa com o móvel bloqueado. (fase 4 do plano
        // "obra no centro": Store.bloqueiosMovel deriva direto de state.pendencias,
        // não de um campo m.bloqueio guardado à parte — ver comentário na função.)
        const faltandoBloqueio = Store.bloqueiosMovel(f.m.id)
          .map(p=>({nome:`Pendência aberta: ${p.categoria} — ${p.descricao}`, obrigatorio:true, bloqueio:true, permiteAvancoExcepcional:true}));
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

    setResponsavel(movelId, nome){
      const f = Store.findMovel(movelId); if(!f) return;
      const anterior = f.m.responsavel;
      f.m.responsavel = nome;
      Store.audit({categoria:"OPERACIONAL", tipo:"MUDANCA_RESPONSAVEL", obraId:f.o.id, ambienteId:f.a.id, movelId:f.m.id,
        etapa:f.m.etapa, descricao:`Responsável de "${f.m.nome}" alterado`, responsavelAnterior:anterior, novoResponsavel:nome});
      emit();
    },

    // ---------- pendências (com fluxo operacional — seção 24) ----------
    // FASE 1 (V2 — permissões por ação, camada AÇÃO, rodada 2): inventário
    // das mutações de Pendência pedido pelo handoff — nenhuma delas tinha
    // guard nenhum até aqui (nem a antiga, nem a nova). Guard colocado no
    // próprio Store (não só no Act do actions.js) — assim vale mesmo pra
    // quem chamar Store.criarPendencia/etc. direto, sem passar pela tela.
    // Contrato: como nada aqui usava {ok,...} antes, e nenhum chamador (ver
    // js/actions.js) lia o valor de retorno de sucesso, mudar pra {ok:true,...}
    // no caminho feliz é seguro — só o caminho de erro é novo de verdade.
    criarPendencia(p){
      if(!Store.pode("pendencia.criar")) return {ok:false, motivo:"SEM_PERMISSAO"};
      const item = novaPendenciaObj(p);
      state.pendencias.push(item);
      Store.log(p.obraId, "PENDENCIA_ABERTA", `${p.categoria}: ${p.descricao}`);
      emit();
      return {ok:true, pendencia:item};
    },
    avancarFluxoPendencia(pendId){
      if(!Store.pode("pendencia.editar")) return {ok:false, motivo:"SEM_PERMISSAO"};
      const p = state.pendencias.find(x=>x.id===pendId); if(!p) return {ok:false, motivo:"NAO_ENCONTRADA"};
      if(p.passoAtual < p.fluxoPassos.length-1){
        p.passoAtual++;
        p.status = "EM_TRATAMENTO";
        p.atualizadoPor = state.usuarioAtual||null; p.atualizadoEm = M.todayISO();
        Store.log(p.obraId, "PENDENCIA_AVANCOU", `${p.categoria}: passo "${p.fluxoPassos[p.passoAtual]}"`);
      } else {
        // último passo do fluxo = resolve de vez — delega pra
        // atualizarStatusPendencia, que já checa "pendencia.resolver" (mais
        // restrita que "pendencia.editar") por conta própria.
        return Store.atualizarStatusPendencia(pendId, "RESOLVIDA");
      }
      emit();
      return {ok:true};
    },
    atualizarStatusPendencia(pendId, status){
      // resolver é mais sensível que só mudar status (reabrir/avançar fluxo)
      // — ganha permissão própria; o resto usa "pendencia.editar".
      const acaoNecessaria = status==="RESOLVIDA" ? "pendencia.resolver" : "pendencia.editar";
      if(!Store.pode(acaoNecessaria)) return {ok:false, motivo:"SEM_PERMISSAO"};
      const p = state.pendencias.find(x=>x.id===pendId); if(!p) return {ok:false, motivo:"NAO_ENCONTRADA"};
      const eraResolvida = p.status==="RESOLVIDA";
      p.status = status;
      p.atualizadoPor = state.usuarioAtual||null; p.atualizadoEm = M.todayISO();
      if(status==="RESOLVIDA"){
        p.passoAtual = p.fluxoPassos ? p.fluxoPassos.length-1 : 0;
        p.resolvidoPor = state.usuarioAtual||null; p.resolvidoEm = M.todayISO();
        Store.log(p.obraId, "PENDENCIA_RESOLVIDA", `${p.categoria}: ${p.descricao}`);
        // pendência vinculada a um componente crítico: resolver a pendência aqui
        // (tela de Pendências) também resolve o componente — senão os dois saem
        // de sincronia, o mesmo tipo de bug corrigido na fase 4 (bloqueio duplicado).
        if(p.componenteCriticoId) Store._sincronizarComponenteDaPendencia(p, "RESOLVIDO");
      }
      if(status==="ABERTA" && eraResolvida){
        p.resolvidoPor = null; p.resolvidoEm = null;
        Store.log(p.obraId, "PENDENCIA_REABERTA", `${p.categoria}: ${p.descricao}`);
        Store.audit({categoria:"QUALIDADE", tipo:"PENDENCIA_REABERTA", obraId:p.obraId, movelId:p.movelId,
          descricao:`Pendência "${p.categoria}" reaberta — ${p.descricao}`});
        if(p.componenteCriticoId) Store._sincronizarComponenteDaPendencia(p, "AGUARDANDO");
      }
      emit();
      return {ok:true};
    },
    // FASE 2 (handoff): "serão exigidas [fotos] ao marcar como resolvida" —
    // fluxo dedicado (Act.abrirResolverPendencia) pra anexar fotosResolucao
    // (autor+data próprios, separadas das fotosAbertura) na hora de resolver.
    resolverPendencia(pendId, {fotosResolucao, observacao} = {}){
      if(!Store.pode("pendencia.resolver")) return {ok:false, motivo:"SEM_PERMISSAO"};
      const p = state.pendencias.find(x=>x.id===pendId); if(!p) return {ok:false, motivo:"NAO_ENCONTRADA"};
      const agora = M.todayISO();
      const autor = state.usuarioAtual||null;
      p.fotosResolucao = (p.fotosResolucao||[]).concat((fotosResolucao||[]).map(url=>
        (typeof url === "string" ? {url, autor, data:agora, principal:false} : url)));
      if(observacao) p.observacaoResolucao = observacao;
      return Store.atualizarStatusPendencia(pendId, "RESOLVIDA");
    },
    reabrirPendencia(pendId){ return Store.atualizarStatusPendencia(pendId, "ABERTA"); },
    // grava o novo status diretamente no componente vinculado, sem passar de
    // novo por Store.mudarStatusComponente (evitaria ida-e-volta infinita entre
    // pendência↔componente — aqui é só espelhar o campo, não gerar/fechar pendência).
    _sincronizarComponenteDaPendencia(p, novoStatusComponente){
      if(!p.movelId || !p.componenteCriticoId) return;
      const f = Store.findMovel(p.movelId); if(!f) return;
      const comp = (f.m.componentesCriticos||[]).find(c=>c.id===p.componenteCriticoId);
      if(comp) comp.status = novoStatusComponente;
    },

    // ---------- componentes críticos / exceções (vidro, serralheria, pintura...) ----------
    // AGUARDANDO/REFACAO já nascem com pendência real vinculada (criarComponenteEmMovel);
    // RESOLVIDO é o único status "não bloqueante" hoje reconhecido pelo resto do app.
    criarComponenteCritico(movelId, dados){
      const f = Store.findMovel(movelId); if(!f) return null;
      const comp = criarComponenteEmMovel(f, dados);
      Store.log(f.o.id, "COMPONENTE_CRIADO", `${comp.tipo}: ${comp.nome} — ${f.m.nome}`);
      emit();
      return comp;
    },
    mudarStatusComponente(movelId, componenteId, novoStatus){
      const f = Store.findMovel(movelId); if(!f) return;
      const comp = (f.m.componentesCriticos||[]).find(c=>c.id===componenteId); if(!comp) return;
      const statusAnterior = comp.status;
      const bloqueante = novoStatus==="AGUARDANDO" || novoStatus==="REFACAO";
      if(bloqueante){
        const pendExistente = comp.pendenciaId ? state.pendencias.find(p=>p.id===comp.pendenciaId) : null;
        if(pendExistente && pendExistente.status==="RESOLVIDA") Store.atualizarStatusPendencia(pendExistente.id, "ABERTA");
        else if(!pendExistente) criarPendenciaDoComponente(f, comp);
      } else if(comp.pendenciaId){
        const pend = state.pendencias.find(p=>p.id===comp.pendenciaId);
        if(pend && pend.status!=="RESOLVIDA") Store.atualizarStatusPendencia(pend.id, "RESOLVIDA");
      }
      // atribuído por último de propósito: reabrir uma pendência resolvida (acima)
      // sincroniza o componente de volta pra "AGUARDANDO" via _sincronizarComponenteDaPendencia
      // — se o status pedido aqui for "REFACAO", essa atribuição garante que o valor
      // final seja o certo, não o genérico que a sincronização escreveu.
      comp.status = novoStatus;
      Store.log(f.o.id, "COMPONENTE_STATUS", `${comp.nome}: ${statusAnterior} → ${novoStatus} (${f.m.nome})`);
      emit();
    },

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
    // FASE 1 (V2 — permissões por ação, rodada 2): "criar/editar/concluir
    // assistência" do inventário pedido — mesmo raciocínio de pendência:
    // guard no próprio Store, contrato {ok,...} igual ao resto.
    criarAssistencia(a){
      if(!Store.pode("assistencia.criar")) return {ok:false, motivo:"SEM_PERMISSAO"};
      // Fase 5 (handoff): toda assistência nasce com garantia (default "Em
      // análise" — não é nem coberto nem não-coberto até alguém decidir) e
      // com o histórico de visitas vazio (N visitas por chamado).
      const item = Object.assign({id:M.uid("asst"), status:"ABERTA", data:M.todayISO(),
        garantia:a.garantia||"EM_ANALISE", visitas:a.visitas||[]}, a);
      state.assistencias.unshift(item);
      Store.audit({categoria:"QUALIDADE", tipo:"ASSISTENCIA_ABERTA", obraId:a.obraId,
        descricao:`Assistência aberta — ${a.categoria}: ${a.descricao}`, motivo:a.origem||"-"});
      emit();
      return {ok:true, assistencia:item};
    },
    atualizarAssistencia(id, patch){
      // concluir é mais sensível que só editar status/campos — ganha
      // permissão própria ("assistencia.concluir"), igual ao par
      // pendencia.editar/pendencia.resolver acima.
      const acaoNecessaria = patch.status==="CONCLUIDA" ? "assistencia.concluir" : "assistencia.editar";
      if(!Store.pode(acaoNecessaria)) return {ok:false, motivo:"SEM_PERMISSAO"};
      const a = state.assistencias.find(x=>x.id===id); if(!a) return {ok:false, motivo:"NAO_ENCONTRADA"};
      Object.assign(a, patch);
      if(patch.status==="CONCLUIDA"){
        Store.audit({categoria:"QUALIDADE", tipo:"ASSISTENCIA_CONCLUIDA", obraId:a.obraId, descricao:`Assistência concluída — ${a.categoria}: ${a.descricao}`});
      }
      emit();
      return {ok:true};
    },
    // ---------- assistência: N visitas por chamado (Fase 5 — handoff) ----------
    // "N visitas por assistência; cada visita termina em resolvida ou retorno
    // necessário." "Retorno necessário → volta para Aguardando (peça,
    // fornecedor, cliente) e agenda a próxima visita." "Peça necessária vira
    // pendência tipo Assistência." Aditivo: não mexe em criarAssistencia/
    // atualizarAssistencia acima, só acrescenta o histórico de visitas.
    registrarVisitaAssistencia(assistId, opts){
      opts = opts || {};
      // mesma régua de atualizarAssistencia: visita que resolve = "concluir";
      // visita que só registra retorno necessário = "editar". Checado antes
      // de tudo (mesmo de achar a assistência) igual ao resto do arquivo.
      const acaoNecessaria = opts.desfecho==="RESOLVIDA" ? "assistencia.concluir" : "assistencia.editar";
      if(!Store.pode(acaoNecessaria)) return {ok:false, motivo:"SEM_PERMISSAO"};
      const a = state.assistencias.find(x=>x.id===assistId); if(!a) return {ok:false};
      if(!opts.desfecho) return {ok:false, motivo:"DESFECHO_OBRIGATORIO"};
      a.visitas = a.visitas || [];
      const numero = a.visitas.length + 1;
      const visita = {id:M.uid("visit"), data: opts.data||M.todayISO(), tecnico: opts.tecnico||state.usuarioAtual||null,
        diagnostico: opts.diagnostico||"", fotos: opts.fotos||[], desfecho: opts.desfecho, registradoEm:M.todayISO()};
      let pendenciaGerada = null;
      if(opts.pecaNecessaria && opts.pecaNecessaria.descricao){
        pendenciaGerada = Store.criarPendencia({
          obraId:a.obraId, ambienteNome:a.ambienteNome, movelNome:a.movelNome, obraNome:a.obraNome,
          tipo:"Assistência", categoria: opts.pecaNecessaria.categoria || "Peça para refazer",
          descricao: opts.pecaNecessaria.descricao, responsavel: opts.tecnico||a.responsavel,
          prazo: opts.pecaNecessaria.prazo||null, prioridade:"ALTA", impacto:"IMPEDE_FINALIZAR",
        });
        visita.pendenciaGeradaId = pendenciaGerada.id;
      }
      a.visitas.push(visita);
      a.ultimaVisitaEm = visita.data;
      if(opts.desfecho==="RESOLVIDA"){
        a.status = "CONCLUIDA";
        a.resolvidoPor = state.usuarioAtual||null; a.resolvidoEm = M.todayISO();
        Store.audit({categoria:"QUALIDADE", tipo:"ASSISTENCIA_CONCLUIDA", obraId:a.obraId,
          descricao:`Assistência concluída — ${a.categoria}: ${a.descricao}`});
      } else {
        // "retorno necessário" — volta pra Aguardando (peça/fornecedor/
        // cliente) ou já agenda a próxima visita, conforme o que faltar.
        a.status = opts.proximoStatus || "AGUARDANDO_MATERIAL";
      }
      // formato do evento de auditoria segue a citação literal do handoff:
      // "Elias registrou a 2ª visita de assistência · resultado: retorno necessário"
      const nomeAtual = state.usuarioAtual ? state.usuarioAtual.split(" ")[0] : "Alguém";
      Store.audit({categoria:"QUALIDADE", tipo:"ASSISTENCIA_VISITA_REGISTRADA", obraId:a.obraId, ambienteId:a.ambienteId||null,
        descricao:`${nomeAtual} registrou a ${numero}ª visita de assistência · resultado: ${opts.desfecho==="RESOLVIDA"?"resolvida":"retorno necessário"}`,
        motivo: pendenciaGerada? `Gerou pendência ${pendenciaGerada.id}` : undefined});
      emit();
      return {ok:true, visita, pendenciaGerada};
    },
    // "Cortesia" é decisão comercial da Moodo — gate de permissão igual ao
    // usado pra ressalva (Fase 4) e pra impacto "bloqueia" (Fase 2): reaproveita
    // M.Store.pode("liberarExcecao") como proxy simplificado de "Líder ou acima".
    definirGarantiaAssistencia(assistId, garantia){
      const a = state.assistencias.find(x=>x.id===assistId); if(!a) return {ok:false};
      if(garantia==="CORTESIA" && !Store.pode("liberarExcecao")) return {ok:false, motivo:"SEM_PERMISSAO"};
      const anterior = a.garantia;
      a.garantia = garantia;
      Store.audit({categoria:"QUALIDADE", tipo:"ASSISTENCIA_GARANTIA_DEFINIDA", obraId:a.obraId,
        descricao:`Garantia de "${a.descricao}" definida como ${M.garantiaDef(garantia).label}`, motivo: anterior!==garantia? `Era: ${M.garantiaDef(anterior).label}`:undefined});
      emit();
      return {ok:true};
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
        a.moveis.forEach(m=>{
          m.ambienteId=a.id; m.obraId=processed.id;
          // CORREÇÃO: o móvel nascia com etapa:0 (índice numérico do formato antigo,
          // nunca convertido pro id de verdade) e nunca ganhava as ações padrão da
          // sua etapa inicial — só quando avançava pela primeira vez (moverEtapa é
          // o único lugar que chamava criarTarefasPadraoParaEtapa). Resultado: toda
          // obra nova nascia com a etapa atual sem nenhuma ação da etapa. Corrigido
          // aqui: etapa inicial de verdade + ações padrão geradas já na criação.
          const primeiraEtapa = M.Store.etapasAtivas()[0];
          m.etapa = primeiraEtapa.id;
          m.requisitosOverride={}; m.dataEntradaEtapa=M.todayISO();
          // fase 2 do plano "obra no centro": sem checklist genérico (Corpo MDF,
          // Ferragens) — o trabalho real da etapa já vem de TAREFAS_PADRAO_ETAPA.
          // Só material especial vira componente crítico (exceção, não checklist).
          const especiais = m.componentesCriticosIniciais || [];
          delete m.componentesCriticosIniciais;
          m.checklist = [];
          m.componentesCriticos = m.componentesCriticos || [];
          // fase seguinte do plano "obra no centro": cada item especial já nasce
          // com a pendência real vinculada (mesmo caminho de Store.criarComponenteCritico),
          // em vez de ficar decorativo até alguém mexer nele manualmente.
          // Aceita string solta (nome, tipo genérico "Material especial" — entrada
          // manual) ou {nome, tipo} (leitor de PDF já sabe o tipo específico —
          // Vidro/Serralheria/etc. — porque detectou por palavra-chave no texto,
          // o que dá uma categoria de pendência mais precisa que "Material especial").
          especiais.forEach(especial=>{
            const dados = typeof especial === "string" ? {nome:especial, tipo:"Material especial"} : especial;
            criarComponenteEmMovel({o:processed, a, m}, dados);
          });
          Store.criarTarefasPadraoParaEtapa({o:processed, a, m}, primeiraEtapa.id);
        });
      });
      state.obras.push(processed);
      Store.log(processed.id, "OBRA_CRIADA", `Obra ${processed.numeroOS} criada a partir da importação.`);
      emit();
      return processed;
    },
    // tarefa gerada a partir de um item de checklist de componente (ver criarObra
    // e migrarChecklistLegado) — não é obrigatória para avançar de etapa (nunca foi,
    // como checklist também não bloqueava), só precisa aparecer e poder ser concluída.
    criarTarefaDeChecklist(f, titulo, opts){
      opts = opts || {};
      state.tarefas.push({
        id:M.uid("tsk"), obraId:f.o.id, obraNome:f.o.cliente, ambienteId:f.a.id, ambienteNome:f.a.nome,
        movelId:f.m.id, movelNome:f.m.nome, titulo, etapa:null, tipo:"PRODUCAO",
        obrigatorio:"RECOMENDADO", responsavelPlanejado:f.m.responsavel,
        executadoPor: opts.concluida? f.m.responsavel : null, conferidoPor:null, instrucoes:"",
        prazo:null, permiteAvancoExcepcional:true, exigeConferencia:false, origemChecklist:true,
        inicio:null, fim: opts.concluida? M.todayISO(): null, data:M.todayISO(),
        status: opts.concluida? "CONCLUIDA":"PLANEJADA", resultado: opts.concluida? "OK": null,
      });
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
      // bloqueiosMovel já é TODA pendência aberta desse móvel (inclusive a que
      // um componente crítico gera automaticamente) — por isso o componente só
      // entra na lista de novo se, por algum motivo, ainda não tiver pendência
      // vinculada (senão duplicava a mesma coisa duas vezes na lista).
      Store.bloqueiosMovel(m.id).forEach(p=> itens.push(`Bloqueio aberto: ${p.categoria} — ${p.descricao}`));
      if(m.ressalvaAberta) itens.push("Ressalva de liberação excepcional ainda não resolvida");
      (m.componentesCriticos||[]).forEach(c=>{
        if(c.pendenciaId) return;
        if(c.status==="REFACAO") itens.push(`Retrabalho pendente: ${c.nome}`);
        if(c.status==="AGUARDANDO") itens.push(`Aguardando: ${c.nome}`);
      });
      Store.tarefasObrigatoriasAbertas(m).forEach(t=> itens.push(`Tarefa obrigatória em aberto: ${t.titulo}`));
      return itens;
    },
    // FASE 1 (V2 — permissões por ação, rodada 2): esta é a ação real de
    // "marcar pronto" a nível de móvel (item 4 do pedido de ajuste) —
    // mapeamento direto pra "montagem.marcarPronto", sem inventar nada novo.
    concluirMontagem(movelId, checklistOk, temPendenciasInformado){
      if(!Store.pode("montagem.marcarPronto")) return {ok:false, motivo:"SEM_PERMISSAO"};
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

    // ---------- montagem: finalizar AMBIENTE (Fase 4 — handoff) ----------
    // Distinto de concluirMontagem (acima, por MÓVEL/etapa de fábrica): esta é
    // a ação nova de nível de ambiente que o handoff descreve — "Finalizar
    // Cozinha?", checklist de 11 itens, e "Finalizar com ressalva" só com
    // motivo + permissão. Aditivo: não mexe no concluirMontagem existente.
    checklistEncerramentoAmbiente(a){
      const feito = a.montagemChecklist || {};
      return M.CHECKLIST_ENCERRAMENTO_AMBIENTE.map(item=>({item, feito: !!feito[item]}));
    },
    finalizarAmbiente(ambienteId, opts){
      opts = opts || {};
      const f = Store.findAmbiente(ambienteId); if(!f) return {ok:false};
      const {o,a} = f;
      const bloqueios = Store.bloqueiosAmbiente(ambienteId);
      // usa o checklist recém-marcado no formulário (opts.checklist), não o
      // que já estava salvo antes — senão marcar tudo agora e enviar nunca
      // seria suficiente pra fechar sem ressalva (o "salvo" só é atualizado
      // depois deste próprio cálculo, mais abaixo).
      const checklistState = opts.checklist || a.montagemChecklist || {};
      const checklist = M.CHECKLIST_ENCERRAMENTO_AMBIENTE.map(item=>({item, feito: !!checklistState[item]}));
      const itensChecklistFaltando = checklist.filter(c=>!c.feito).map(c=>c.item);
      const naoMontados = a.moveis.filter(m=> Store.posicaoEtapa(m.etapa) < Store.posicaoEtapa("MONTAGEM")).length;
      const pendente = bloqueios.length>0 || itensChecklistFaltando.length>0 || naoMontados>0;
      if(pendente && !opts.ressalva){
        return {ok:false, motivo:"PENDENTE", bloqueios, itensChecklistFaltando, naoMontados};
      }
      if(opts.ressalva){
        // FASE 1 (V2): aceita a permissão antiga (liberarExcecao) OU a nova
        // ("montagem.finalizarComRessalva", que hoje espelha liberarExcecao
        // pra cada perfil — ver M.PERFIS) — aditivo, não tira acesso de
        // ninguém que já podia fazer isso antes.
        if(!Store.pode("liberarExcecao") && !Store.pode("montagem.finalizarComRessalva")) return {ok:false, motivo:"SEM_PERMISSAO"};
        if(!opts.motivo) return {ok:false, motivo:"MOTIVO_OBRIGATORIO"};
      }
      a.montagemChecklist = checklistState;
      a.montagemStatus = opts.ressalva ? "FINALIZADA_RESSALVA" : "FINALIZADA";
      a.finalizadoPor = state.usuarioAtual || null;
      a.finalizadoEm = M.todayISO();
      if(opts.ressalva){
        a.montagemRessalva = {motivo:opts.motivo, autorizadoPor: state.usuarioAtual, pendenciaVinculada: opts.pendenciaVinculada||null, data:M.todayISO()};
        Store.log(o.id, "AMBIENTE_FINALIZADO_RESSALVA", `${a.nome} finalizado com ressalva: ${opts.motivo}`);
        Store.audit({categoria:"GOVERNANCA", tipo:"AVANCO_COM_RESSALVA", obraId:o.id, ambienteId:a.id,
          descricao:`${a.nome} finalizado com ressalva — ${opts.motivo}`, motivo:opts.motivo});
      } else {
        a.montagemRessalva = null;
        Store.log(o.id, "AMBIENTE_FINALIZADO", `${a.nome} finalizado.`);
      }
      emit();
      return {ok:true, ressalva: !!opts.ressalva};
    },
    reabrirAmbiente(ambienteId){
      const f = Store.findAmbiente(ambienteId); if(!f) return;
      const eraRessalva = f.a.montagemStatus==="FINALIZADA_RESSALVA";
      f.a.montagemStatus = null;
      Store.log(f.o.id, "AMBIENTE_REABERTO", `${f.a.nome} reaberto${eraRessalva?" (estava finalizado com ressalva)":""}.`);
      Store.audit({categoria:"QUALIDADE", tipo:"PENDENCIA_REABERTA", obraId:f.o.id, ambienteId:f.a.id,
        descricao:`${f.a.nome} reaberto depois de finalizado.`});
      emit();
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
  // upgrade transparente de dados antigos (ver função acima) — precisa rodar
  // depois que Store existe (usa Store.criarTarefaDeChecklist).
  migrarChecklistLegado();
  migrarPendenciasParaModeloHandoff();
  // primeira gravação (local — instantânea)
  persist();
  // SUPABASE: dispara a sincronização em segundo plano (não bloqueia o boot)
  sincronizarComSupabase();
})();
