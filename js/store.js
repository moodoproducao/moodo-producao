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

  // ---------- Montagem V2 (Fase 5) — helpers privados de planejamento ----------
  // "Fim real" capturado automaticamente quando o ÚLTIMO ambiente obrigatório
  // fecha (Finalizado/Finalizado com ressalva) — reusa M.Calc.
  // montagemFinalizadaObra (mesma leitura que o resto do app usa pra saber
  // se a obra "realmente" encerrou a montagem, ver §9). Idempotente — só
  // grava se ainda não tinha sido gravado, e só se existir início real
  // registrado (senão não dá pra calcular duração real com sentido).
  function marcarFimRealSeObraFechou(o){
    if(!M.Calc || !M.Calc.montagemFinalizadaObra) return; // Calc pode não estar carregado em contexto de teste isolado
    const r = M.Calc.montagemFinalizadaObra(o);
    if(!r.finalizada) return;
    o.planejamentoMontagem = o.planejamentoMontagem || {};
    if(o.planejamentoMontagem.fimReal) return;
    o.planejamentoMontagem.fimReal = M.todayISO();
    if(o.planejamentoMontagem.inicioReal){
      const a = new Date(o.planejamentoMontagem.inicioReal+"T00:00:00"), b = new Date(o.planejamentoMontagem.fimReal+"T00:00:00");
      o.planejamentoMontagem.duracaoRealDias = Math.max(0, Math.round((b-a)/86400000));
    }
  }
  // Estimativa simples de fim previsto — nunca autoritativa, só um cálculo de
  // apoio (§10: "sem KPI sofisticado"). dias_uteis aproxima 5/7; semanas usa
  // 7 dias corridos por semana; dias_corridos soma direto.
  function calcularFimPrevisto(planejamento){
    if(!planejamento.inicioPrevisto || !planejamento.duracaoEstimadaValor) return null;
    const dias = planejamento.duracaoEstimadaUnidade==="semanas" ? planejamento.duracaoEstimadaValor*7
      : planejamento.duracaoEstimadaUnidade==="dias_uteis" ? Math.ceil(planejamento.duracaoEstimadaValor*7/5)
      : planejamento.duracaoEstimadaValor;
    const d = new Date(planejamento.inicioPrevisto+"T00:00:00");
    d.setDate(d.getDate()+dias);
    return d.toISOString().slice(0,10);
  }

  // ---------- semente de etapas / requisitos / tarefas padrão com ids/ordem ----------
  function seedEtapas(){ return deepClone(M.ETAPAS_SEED); }
  // FASE 3 — catálogo de fases macro da obra (distinto das etapas de móvel
  // acima). Mesmo padrão: semente deep-clonada, editável depois via
  // state.fasesMacro, nunca a constante direta.
  function seedFasesMacro(){ return deepClone(M.FASES_MACRO_SEED); }
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
      // FASE 6 (Agenda V2, §4) — só os eventos MANUAIS (RETORNO/VISITA/
      // MEDICAO/OUTRO) viram registro próprio aqui. MONTAGEM e ASSISTENCIA
      // nunca entram nesta lista — são computados ao vivo a partir de
      // obra.planejamentoMontagem e state.assistencias (ver M.Agenda em
      // js/pages/agenda.js), pra não duplicar a fonte de verdade da data.
      // Nenhum dado de exemplo semeado aqui de propósito (§25 — "não fazer
      // migração manual de eventos antigos"; o app nasce sem compromisso
      // manual nenhum, exatamente como nasceu sem assistência antes de
      // alguém abrir uma).
      eventos: [],
      etapas: seedEtapas(),
      // FASE 3 — catálogo de fases macro (config, não dado de obra). Obras
      // existentes NÃO ganham faseMacro automaticamente aqui — isso é só o
      // catálogo de fases disponíveis, igual "etapas" acima é só o catálogo
      // de etapas de móvel, não o valor de m.etapa de cada móvel.
      fasesMacro: seedFasesMacro(),
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
      // FASE 7.5 (Detalhe Rápido, item 22) — auditoria de primeira
      // visualização: {pendenciaId, usuario, visualizadoEm}, um registro por
      // par (pendência, usuário) — idempotente, nunca duplica quando a
      // mesma pessoa abre o drawer de novo. Array SEPARADO de historico/
      // auditoria de propósito (não é evento de negócio nem trilha de
      // governança — é telemetria de UI, preparada pra um futuro consumo em
      // Admin → Auditoria; não aparece em nenhuma tela ainda).
      visualizacoesPendencia: [],
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
            // FASE 6 (Agenda V2) — estado salvo de antes desta fase não tem
            // `eventos` nenhum: usa lista vazia (fresh.eventos), nunca
            // undefined — o resto do código (Store.criarEvento etc.) sempre
            // assume array.
            eventos: parsed.eventos || fresh.eventos,
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
            // FASE 3 — estado salvo de antes desta implementação não tem
            // fasesMacro nenhum: usa a semente atual (só o catálogo — não
            // mexe em nenhuma obra já salva, que continua sem faseMacro
            // até alguém mover ela manualmente).
            fasesMacro: (parsed.fasesMacro && parsed.fasesMacro.length) ? parsed.fasesMacro : fresh.fasesMacro,
            requisitosPorEtapa: parsed.requisitosPorEtapa || fresh.requisitosPorEtapa,
            // FASE 7.5 — estado salvo de antes desta fase não tem essa chave.
            visualizacoesPendencia: parsed.visualizacoesPendencia || fresh.visualizacoesPendencia,
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

  // ---------- migração: nomenclatura canônica de a.montagemStatus (últimos
  // ajustes antes do push, item 2) ----------
  // Antes desta rodada, a.montagemStatus usava os nomes internos FINALIZADA /
  // FINALIZADA_RESSALVA, enquanto M.Calc.situacaoAmbiente() já expunha pra
  // tela os nomes canônicos FINALIZADO / FINALIZADO_COM_RESSALVA (traduzindo
  // um pro outro toda vez que alguém lia a situação do ambiente). Isso foi
  // unificado: agora a.montagemStatus grava DIRETO o nome canônico — sem
  // tradução nenhuma no caminho de leitura (nem aqui, nem em Calc, nem em
  // lugar nenhum: só esta função sabe que o nome antigo um dia existiu).
  //
  // Esta é a ÚNICA função do app que ainda conhece FINALIZADA/
  // FINALIZADA_RESSALVA — mapeamento explícito e determinístico de exatamente
  // dois valores literais antigos pros dois novos, nunca inferência (não
  // adivinha nada a partir de outro campo; só troca a string se o valor
  // salvo for EXATAMENTE um dos dois nomes antigos). PRONTO_PARA_FINALIZAR,
  // TRAVADO (via bloqueio/travamentoManual) e ambiente não iniciado (null)
  // não mudam de nome nesta rodada, então não precisam de nenhum mapeamento.
  // Idempotente: se não sobrar nenhum a.montagemStatus com o nome antigo, não
  // faz nada (não emite, não grava de novo).
  const MONTAGEM_STATUS_LEGADO = {FINALIZADA:"FINALIZADO", FINALIZADA_RESSALVA:"FINALIZADO_COM_RESSALVA"};
  function migrarMontagemStatusLegado(){
    let mudou = false;
    (state.obras||[]).forEach(o=>{
      (o.ambientes||[]).forEach(a=>{
        const novo = MONTAGEM_STATUS_LEGADO[a.montagemStatus];
        if(novo){ a.montagemStatus = novo; mudou = true; }
      });
    });
    if(mudou) emit();
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
  // HOTFIX 3.1 (correção de ordem de inicialização): antes, persistSupabase()
  // só checava M.Supa.habilitado (true desde o boot, só indica "configurado")
  // e chamava M.Supa.salvarEstado() direto depois de 400ms — se o cliente
  // Supabase (M.Supa.client) ainda não tivesse terminado de inicializar
  // (M.Supa.ready ainda pendente — depende de baixar o SDK via CDN, tempo
  // variável), a gravação explodia com "Cannot read properties of null
  // (reading 'from')". Agora espera M.Supa.ready antes de gravar de verdade.
  //
  // Coalescimento (fila de tamanho 1, sem lista ilimitada): supaSaveGeracao é
  // um contador que sobe a cada novo pedido de gravação. Cada chamada guarda
  // "de qual geração" ela é; quando o cliente finalmente fica pronto, só
  // grava se ainda for a geração MAIS RECENTE — se um emit() mais novo já
  // aconteceu enquanto esta esperava, esta desiste em silêncio (o estado dela
  // já está superado) e é a mais nova quem grava o estado atual de verdade.
  // Isso garante que nunca um snapshot antigo sobrescreva um mais novo,
  // mesmo com vários emit() em sequência durante a espera do Supabase ficar
  // pronto — sem acumular fila nenhuma, só "qual foi o último pedido".
  let supaSaveGeracao = 0;
  function persistSupabase(){
    if(!(M.Supa && M.Supa.habilitado)) return;
    // debounce curto: ações em sequência rápida (ex.: digitando) viram 1 gravação só
    clearTimeout(supaSaveTimer);
    const minhaGeracao = ++supaSaveGeracao;
    supaSaveTimer = setTimeout(()=>{
      M.Supa.ready.then(pronto=>{
        if(!pronto) return; // Supabase indisponível/config inválida: localStorage já é a cópia local segura, não tenta gravar sem cliente
        if(minhaGeracao !== supaSaveGeracao) return; // já existe um pedido de gravação mais novo — este ficou obsoleto, quem vai gravar é o mais recente
        M.Supa.salvarEstado(state, ultimoAtualizadoEmConhecido).then(processarResultadoSalvar);
      }, erro=>{
        // M.Supa.ready, hoje, já resolve false em vez de rejeitar (ver
        // supabase-client.js) — mas se algum dia rejeitar mesmo assim, isto
        // evita um unhandled rejection e uma tentativa de gravar com cliente
        // inexistente; não é a falha real de rede pós-cliente-pronto (essa
        // continua tratada normalmente por avisarFalhaNuvem/avisarConflito).
        console.error("[Moodo] Supa.ready rejeitou inesperadamente:", erro);
      });
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
    // HOTFIX 3.13.1: estado salvo na nuvem de antes da Fase 6 (Agenda V2)
    // não tem a chave `eventos` — sem esta defesa, o Object.assign acima
    // deixa state.eventos undefined e quebra toda leitura da Agenda
    // (M.Agenda.todosEventosBrutos faz `state.eventos.concat(...)`, e o
    // resto do código — Store.criarEvento etc. — sempre assume array).
    // Mesma defesa que load() já fazia pro caminho local (`parsed.eventos
    // || fresh.eventos`) — só faltava espelhar aqui pro caminho remoto.
    if(!Array.isArray(state.eventos)) state.eventos = [];
    // FASE 7.5 — mesma defesa, mesmo motivo: estado remoto de antes desta
    // fase não tem `visualizacoesPendencia`.
    if(!Array.isArray(state.visualizacoesPendencia)) state.visualizacoesPendencia = [];
    // HOTFIX 3.15.3 — achado no smoke test de produção da Fase 7.5: ativar a
    // PRIMEIRA obra com faseMacro de verdade (Store.ativarObra grava
    // faseMacro="AGUARDANDO_INICIO") quebrou a tela da obra com "Cannot read
    // properties of undefined (reading 'find')" em Store.faseMacroById, que
    // faz state.fasesMacro.find(...). Causa: load() (caminho local, linha
    // ~236) já tinha a defesa certa pra isso desde a Fase 3 — "estado salvo
    // de antes desta implementação não tem fasesMacro nenhum: usa a semente
    // atual" — mas essa MESMA defesa nunca foi espelhada aqui em
    // aplicarEstadoRemoto (caminho Supabase). O documento salvo na nuvem é
    // de antes de fasesMacro existir (nenhuma das 9 obras legadas atuais
    // tem faseMacro — por isso isto nunca quebrou até agora: NENHUMA obra
    // real, em produção, jamais tinha lido este campo). Mesmo problema
    // existia, silenciosamente, pra todo o resto da lista de migração de
    // load() que nunca foi espelhada aqui — replicando TODAS agora (não só
    // fasesMacro), pra fechar a classe inteira do bug, não só o sintoma
    // que apareceu primeiro.
    const fresh = seedState();
    if(!state.assistencias) state.assistencias = fresh.assistencias;
    if(!Array.isArray(state.auditoria)) state.auditoria = fresh.auditoria;
    if(!state.tarefasPadrao) state.tarefasPadrao = fresh.tarefasPadrao;
    if(!state.fluxosPadrao) state.fluxosPadrao = fresh.fluxosPadrao;
    state.permissoes = mergePermissoes(state.permissoes, fresh.permissoes);
    if(!state.pesosDesempenho) state.pesosDesempenho = fresh.pesosDesempenho;
    if(!state.notificacoes) state.notificacoes = fresh.notificacoes;
    if(!state.metaMensal) state.metaMensal = fresh.metaMensal;
    if(!Array.isArray(state.etapas) || !state.etapas.length) state.etapas = fresh.etapas;
    if(!Array.isArray(state.fasesMacro) || !state.fasesMacro.length) state.fasesMacro = fresh.fasesMacro;
    if(!state.requisitosPorEtapa) state.requisitosPorEtapa = fresh.requisitosPorEtapa;
    // estado vindo da nuvem pode ter sido salvo por uma versão anterior do
    // app (antes da Fase 2) — mesma migração leve do boot local.
    migrarPendenciasParaModeloHandoff();
    // HOTFIX 3.1: se o estado que acabou de chegar da nuvem ainda tiver
    // checklist legado (por exemplo: a gravação da migração de outro
    // carregamento falhou por causa da causa raiz nº 1, então o que está na
    // nuvem ainda é a versão antiga), reaplica a mesma migração do boot
    // aqui. migrarChecklistLegado() já é idempotente (só mexe em quem ainda
    // não migrou) e só chama emit() se realmente mudou algo — se o remoto já
    // vier migrado, isto não faz nada e não grava nada de novo. É isto que
    // fecha o loop: com a causa raiz nº 1 corrigida acima, quando ela migrar
    // e emitir aqui, a gravação de volta pro Supabase agora tem chance real
    // de vingar, em vez de o checklist antigo "renascer" a cada sincronização.
    migrarChecklistLegado();
    // mesma lógica: se o remoto ainda tiver montagemStatus com nome antigo
    // (FINALIZADA/FINALIZADA_RESSALVA), reaplica a migração explícita aqui.
    migrarMontagemStatusLegado();
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
    // FASE 7.5: exclui obra RASCUNHO — usada por cálculo de risco/atraso
    // (Calc.alertasHoje) e por várias telas operacionais; rascunho não pode
    // gerar alerta de atraso porque ele nunca entrou no pipeline de verdade
    // (item 7 do pedido).
    allMoveis(){
      const out=[];
      Store.obrasOperacionais().forEach(o=>o.ambientes.forEach(a=>a.moveis.forEach(m=>out.push({o,a,m}))));
      return out;
    },

    // ---------- histórico ----------
    // `extra` é opcional e mesclado por cima do registro base — usado por ex.
    // pra anotar {pendenciaId} sem duplicar o histórico central em outra
    // estrutura. 100% compatível com as chamadas antigas de 3 argumentos.
    log(obraId, tipo, descricao, extra){
      state.historico.unshift(Object.assign({id:M.uid("hist"), obraId, tipo, descricao, data:new Date().toISOString(), usuario:state.usuarioAtual}, extra||{}));
    },

    // histórico central filtrado por pendência — não duplica armazenamento,
    // só lê do mesmo state.historico já existente.
    historicoDaPendencia(pendId){
      return state.historico.filter(h=>h.pendenciaId===pendId);
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
      return Store.podePerfil(Store.perfilAtual().key, acao);
    },
    // FASE 8 (Admin V2): mesma leitura efetiva de `pode`, mas pra QUALQUER
    // perfil informado — não só o do usuário atual. Extraído de `pode` (que
    // agora só chama isto com o próprio perfil) porque a matriz de
    // permissões de Configurações→Permissões já precisava disso pra montar a
    // tabela (uma coluna por perfil), e a Fase 8 (Equipe/Usuários "principais
    // permissões" + Admin→Permissões) precisa da mesma leitura — sem duplicar
    // a lógica de override numa segunda função.
    podePerfil(perfilKey, acao){
      const perfil = M.perfilDef(perfilKey);
      const overrides = state.permissoes && state.permissoes[perfilKey];
      if(overrides && Object.prototype.hasOwnProperty.call(overrides, acao)) return !!overrides[acao];
      return !!(perfil && perfil.pode[acao]);
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
    // FASE 8 (Admin V2, item 13): registra troca de perfil de colaborador na
    // auditoria (quem/colaborador/perfil anterior/perfil novo/quando). Existe
    // como método próprio (em vez de o chamador montar o `Store.audit` direto)
    // porque `emit()` é fechamento privado deste arquivo — actions.js não tem
    // como persistir um `Store.audit(...)` sozinho, precisa de um método
    // público que faça as duas coisas, igual `setPermissao` já faz.
    auditarAlteracaoPerfilColaborador(nomeColaborador, perfilAnterior, perfilNovo){
      if(!nomeColaborador || perfilAnterior===perfilNovo) return;
      const autor = Store.perfilAtual();
      Store.audit({categoria:"GOVERNANCA", tipo:"ALTERACAO_PROCESSO",
        descricao:`Perfil de "${nomeColaborador}" alterado de "${(M.perfilDef(perfilAnterior)||{}).label||perfilAnterior}" para "${(M.perfilDef(perfilNovo)||{}).label||perfilNovo}" (por ${state.usuarioAtual||"?"}, perfil ${autor.label}).`,
        colaborador: nomeColaborador, perfilAnterior, perfilNovo});
      emit();
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

    // FASE 4 (AJUSTE — "Minhas/Todas não pode ampliar o acesso dos perfis
    // operacionais"): escopo REAL de quais pendências o usuário ATUAL pode
    // ver, aplicado aqui no Store — não só escondendo o toggle "Todas" na
    // tela. Quem chama a tela (Pendências, Hoje) sempre parte desta lista,
    // nunca de state.pendencias cru, então nenhuma manipulação de UI/estado
    // consegue devolver pendência fora do escopo:
    //   - sem "verTodasObras" (Produção/Montador/Assistência/TV): só
    //     pendências de obras onde a pessoa tem algo atribuído — reusa
    //     obraIdsDoColaborador, o MESMO vínculo já usado em Hoje/Montagem/
    //     Produção/Obras/Calendário, nenhum vínculo novo inventado.
    //   - Produção (perfil OPERADOR) especificamente: "somente Minhas" não é
    //     preferência de tela, é regra — mesmo dentro das próprias obras,
    //     só enxerga pendência vinculada a ela mesma (responsavel===nome).
    //     Isso NÃO é uma permissão nova: é a mesma leitura de "somente
    //     Minhas" que a Fase 3 já cravava fixo pro perfil, só que agora
    //     também reforçada aqui embaixo, não só na tela.
    pendenciasVisiveis(){
      const nome = state.usuarioAtual;
      let out = state.pendencias;
      if(!Store.pode("verTodasObras")){
        const meuObraIds = Store.obraIdsDoColaborador(nome);
        out = out.filter(p=> meuObraIds.has(p.obraId));
      }
      if(Store.perfilAtual().key==="OPERADOR"){
        out = out.filter(p=> p.responsavel===nome);
      }
      return out;
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

    // ============================================================
    // FASE 3 — FASES MACRO DA OBRA (faseMacro). Catálogo configurável, mesmo
    // padrão de ETAPAS acima (chave estável, nunca índice numérico) — mas
    // representa o estágio operacional da OBRA como um todo ("macro"), não
    // do móvel individual ("micro"). "Macro por padrão, micro por exceção":
    // um móvel isolado atrasado não deve puxar a faseMacro da obra pra trás
    // — isso é decisão manual de quem move a obra, não inferência
    // automática (nenhuma função aqui infere/decide faseMacro sozinha).
    // ============================================================
    fasesMacroOrdenadas(){ return state.fasesMacro.slice().sort((a,b)=>a.ordem-b.ordem); },
    faseMacroById(key){ return state.fasesMacro.find(f=>f.key===key) || null; },
    posicaoFaseMacro(key){
      const ord = Store.fasesMacroOrdenadas();
      const i = ord.findIndex(f=>f.key===key);
      return i<0 ? ord.length : i;
    },
    // FASE 3 — compatibilidade de DESENVOLVIMENTO, não migração definitiva:
    // obra criada antes desta implementação (todas as 9 obras reais de hoje,
    // que são dado de desenvolvimento/modelo, não operacional — ver
    // RELATORIO-FASE-3.md) não tem o campo faseMacro. Em vez de quebrar a
    // tela ou tratar "sem fase" como um nível de risco desconhecido, resolve
    // pra um objeto de fase neutro, SÓ PRA LEITURA/EXIBIÇÃO —
    // impactaRisco:false (mesmo efeito prático de "Aguardando início"),
    // marcado com legado:true pra quem quiser distinguir na UI de uma obra
    // que está de fato em Aguardando Início por decisão de alguém. ESTA
    // FUNÇÃO NUNCA GRAVA NADA em o.faseMacro — é só leitura derivada, toda
    // vez que é chamada; se a obra ainda não tiver o campo amanhã, continua
    // caindo aqui de novo.
    faseMacroDeObra(o){
      if(o && o.faseMacro){
        const f = Store.faseMacroById(o.faseMacro);
        if(f) return f;
      }
      return {key:"_LEGADO_SEM_FASE", label:"Sem fase definida (dado legado)", ordem:-1, impactaRisco:false, legado:true};
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
      Store.log(p.obraId, "PENDENCIA_ABERTA", `${p.categoria}: ${p.descricao}`, {pendenciaId:item.id});
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
        Store.log(p.obraId, "PENDENCIA_AVANCOU", `${p.categoria}: passo "${p.fluxoPassos[p.passoAtual]}"`, {pendenciaId:p.id});
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
        Store.log(p.obraId, "PENDENCIA_RESOLVIDA", `${p.categoria}: ${p.descricao}`, {pendenciaId:p.id});
        // pendência vinculada a um componente crítico: resolver a pendência aqui
        // (tela de Pendências) também resolve o componente — senão os dois saem
        // de sincronia, o mesmo tipo de bug corrigido na fase 4 (bloqueio duplicado).
        if(p.componenteCriticoId) Store._sincronizarComponenteDaPendencia(p, "RESOLVIDO");
      }
      if(status==="ABERTA" && eraResolvida){
        p.resolvidoPor = null; p.resolvidoEm = null;
        Store.log(p.obraId, "PENDENCIA_REABERTA", `${p.categoria}: ${p.descricao}`, {pendenciaId:p.id});
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
      const agora = new Date().toISOString();
      const autor = state.usuarioAtual||null;
      p.fotosResolucao = (p.fotosResolucao||[]).concat((fotosResolucao||[]).map(url=>
        (typeof url === "string" ? {url, autor, data:agora, principal:false} : url)));
      if(observacao) p.observacaoResolucao = observacao;
      return Store.atualizarStatusPendencia(pendId, "RESOLVIDA");
    },
    reabrirPendencia(pendId){ return Store.atualizarStatusPendencia(pendId, "ABERTA"); },
    // FASE 4 (§10 handoff): "pendencia.atribuir" já existia na matriz de
    // permissões desde a Fase 1 (todos os 8 perfis), mas nenhuma função usava
    // essa ação — reassignar responsável exigia editar o campo por fora, sem
    // guard e sem log. Aqui, mesmo padrão de atualizarStatusPendencia.
    atribuirPendencia(pendId, novoResponsavel){
      if(!Store.pode("pendencia.atribuir")) return {ok:false, motivo:"SEM_PERMISSAO"};
      const p = state.pendencias.find(x=>x.id===pendId); if(!p) return {ok:false, motivo:"NAO_ENCONTRADA"};
      const responsavelAnterior = p.responsavel;
      p.responsavel = novoResponsavel||null;
      p.atualizadoPor = state.usuarioAtual||null; p.atualizadoEm = M.todayISO();
      Store.log(p.obraId, "PENDENCIA_ATRIBUIDA", `${p.categoria}: ${responsavelAnterior||"—"} → ${p.responsavel||"—"}`, {pendenciaId:p.id});
      emit();
      return {ok:true};
    },
    // FASE 4 (§2 handoff): "possibilidade de adicionar [fotos] depois" — sem
    // precisar reabrir/editar status. destino: "abertura" ou "resolucao".
    adicionarFotosPendencia(pendId, fotos, destino){
      if(!Store.pode("pendencia.editar")) return {ok:false, motivo:"SEM_PERMISSAO"};
      const p = state.pendencias.find(x=>x.id===pendId); if(!p) return {ok:false, motivo:"NAO_ENCONTRADA"};
      const campo = destino==="resolucao" ? "fotosResolucao" : "fotosAbertura";
      const agora = new Date().toISOString();
      const autor = state.usuarioAtual||null;
      // mesmo padrão de resolverPendencia: string vira objeto com defaults;
      // objeto (já vindo pronto do upload, com enviadoPor/data/tamanho/etc.)
      // passa direto, sem reescrever campos que ele já preencheu certo.
      p[campo] = (p[campo]||[]).concat((fotos||[]).map(f=>
        (typeof f === "string" ? {url:f, autor, data:agora, principal:false} : f)));
      p.atualizadoPor = autor; p.atualizadoEm = M.todayISO();
      Store.log(p.obraId, "PENDENCIA_FOTOS_ADICIONADAS", `${p.categoria}: +${(fotos||[]).length} foto(s) (${campo})`, {pendenciaId:p.id});
      emit();
      return {ok:true};
    },
    // grava o novo status diretamente no componente vinculado, sem passar de
    // novo por Store.mudarStatusComponente (evitaria ida-e-volta infinita entre
    // pendência↔componente — aqui é só espelhar o campo, não gerar/fechar pendência).
    _sincronizarComponenteDaPendencia(p, novoStatusComponente){
      if(!p.movelId || !p.componenteCriticoId) return;
      const f = Store.findMovel(p.movelId); if(!f) return;
      const comp = (f.m.componentesCriticos||[]).find(c=>c.id===p.componenteCriticoId);
      if(comp) comp.status = novoStatusComponente;
    },

    // FASE 7.5 (Detalhe Rápido, item 22) — registra que ESTE usuário abriu o
    // detalhe desta pendência pela primeira vez. Idempotente por (pendenciaId,
    // usuario): reabrir o mesmo drawer de novo não duplica registro. Sem
    // permissão nenhuma exigida de propósito (é telemetria de leitura, não
    // uma ação de negócio) e sem `Store.log`/`Store.audit` — array próprio
    // (`visualizacoesPendencia`), não visível em nenhuma tela hoje; existe
    // só como base pronta pra uma futura tela Admin → Auditoria (item 22:
    // "não implementar 'Ciente'/'Assumir' ainda — só 'visualizou'").
    //
    // AVISO IMPORTANTE (correção pós-entrega, item 5) — até existir Auth
    // real neste app, `usuario` vem de `state.usuarioAtual`, que é um
    // seletor de perfil compartilhado/trocável por qualquer pessoa na
    // mesma sessão (ver Act.trocarUsuario), não uma sessão autenticada.
    // Ou seja: este array é TELEMETRIA DE DESENVOLVIMENTO, não evidência
    // forte de identidade/autoria — não deve ser tratado como prova de que
    // "a pessoa X" de fato viu a pendência, só de que "o perfil selecionado
    // como X" esteve com o drawer aberto. Quando Auth for implementado, a
    // origem de `usuario` aqui deve ser trocada pelo usuário autenticado de
    // verdade — nenhum comportamento muda agora, isto é só documentação.
    registrarPrimeiraVisualizacaoPendencia(pendId){
      const usuario = state.usuarioAtual || null;
      if(!pendId || !usuario) return {ok:false};
      const jaExiste = state.visualizacoesPendencia.some(v=> v.pendenciaId===pendId && v.usuario===usuario);
      if(jaExiste) return {ok:true, jaVisualizado:true};
      state.visualizacoesPendencia.push({pendenciaId:pendId, usuario, visualizadoEm:new Date().toISOString()});
      emit();
      return {ok:true};
    },
    visualizacoesDaPendencia(pendId){
      return state.visualizacoesPendencia.filter(v=>v.pendenciaId===pendId);
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

    // ---------- assistências (seção 44-47; V2 — Fase 7) ----------
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
      // FASE 7 (item 9 da aprovação — fechar a lacuna disclosed no design):
      // Store.log alimenta o Histórico DA OBRA (aba Histórico do detalhe de
      // obra) — mecanismo diferente de Store.audit (site-wide, Admin>
      // Auditoria). Até aqui só o audit existia; abertura/atendimento de
      // assistência nunca aparecia no histórico da própria obra. Só loga
      // quando há obra vinculada (cliente avulso não tem histórico de obra).
      if(a.obraId) Store.log(a.obraId, "ASSISTENCIA_ABERTA", `Assistência aberta — ${a.categoria}: ${a.descricao}`, {assistenciaId:item.id});
      emit();
      return {ok:true, assistencia:item};
    },
    // FASE 7 (item 9): conclusão passa a ter REGRA PRÓPRIA (ver
    // Store.concluirAssistencia abaixo) — nunca mais um `Object.assign`
    // direto pra CONCLUIDA sem checar nada. atualizarAssistencia continua
    // servindo pra qualquer OUTRA transição de status/campo (triagem,
    // agendada→execução, aguardando peça/cliente etc.), mas recusa
    // explicitamente a transição pra CONCLUIDA — quem tenta isso precisa
    // passar por concluirAssistencia, que aplica o gate.
    //
    // AJUSTES FINAIS (item 3): mesmo raciocínio agora vale pra CANCELADA —
    // só Store.cancelarAssistencia (abaixo) pode gravar esse status, com sua
    // própria permissão ("assistencia.cancelar", separada de
    // "assistencia.editar") e seu próprio gate (motivo obrigatório, não pode
    // cancelar já concluída). Sem essa checagem aqui, qualquer perfil com
    // "assistencia.editar" (ASSISTENCIA/PCP/LIDERANCA/GESTOR/ADMIN) poderia
    // contornar a trava de permissão nova só chamando
    // atualizarAssistencia(id,{status:"CANCELADA"}) direto — testado
    // explicitamente (ver "bypass" na suíte).
    atualizarAssistencia(id, patch){
      if(patch && patch.status==="CONCLUIDA") return {ok:false, motivo:"USE_CONCLUIR_ASSISTENCIA"};
      if(patch && patch.status==="CANCELADA") return {ok:false, motivo:"USE_CANCELAR_ASSISTENCIA"};
      if(!Store.pode("assistencia.editar")) return {ok:false, motivo:"SEM_PERMISSAO"};
      const a = state.assistencias.find(x=>x.id===id); if(!a) return {ok:false, motivo:"NAO_ENCONTRADA"};
      Object.assign(a, patch);
      emit();
      return {ok:true};
    },
    // ---------- assistência: N visitas por chamado (Fase 5 — handoff; Fase 7 — status próprio da visita) ----------
    // "N visitas por assistência; cada visita termina em resolvida ou retorno
    // necessário." "Retorno necessário → volta para Aguardando (peça,
    // fornecedor, cliente) e agenda a próxima visita." "Peça necessária vira
    // pendência tipo Assistência."
    //
    // FASE 7 (item 3 da aprovação — rejeitado "resultado vazio = agendada"):
    // toda visita agora carrega um `status` PRÓPRIO e explícito (AGENDADA/
    // REALIZADA/CANCELADA — M.VISITA_STATUS_DEF, js/data.js), nunca inferido
    // só pela presença/ausência de `desfecho`. Duas entradas agora existem
    // pro histórico de visitas de um chamado:
    //   - Store.agendarVisitaAssistencia — cria a visita já como AGENDADA,
    //     sem resultado nenhum ainda (marca só quando/quem vai atender).
    //   - Store.registrarVisitaAssistencia — comportamento 100%
    //     RETROCOMPATÍVEL quando chamado SEM opts.visitaId (cria e já
    //     REALIZA uma visita no mesmo passo, exatamente como a Fase 5
    //     sempre fez); COM opts.visitaId, em vez de empurrar uma visita
    //     nova, COMPLETA a visita pré-agendada correspondente (transição
    //     AGENDADA→REALIZADA), sem duplicar a mesma visita.
    agendarVisitaAssistencia(assistId, opts){
      opts = opts || {};
      if(!Store.pode("assistencia.editar")) return {ok:false, motivo:"SEM_PERMISSAO"};
      const a = state.assistencias.find(x=>x.id===assistId); if(!a) return {ok:false, motivo:"NAO_ENCONTRADA"};
      if(!opts.data) return {ok:false, motivo:"DATA_OBRIGATORIA"};
      a.visitas = a.visitas || [];
      const agora = M.todayISO();
      const usuario = state.usuarioAtual || null;
      const visita = {
        id:M.uid("visit"), status:"AGENDADA",
        data:opts.data, horaInicio:opts.horaInicio||null, horaFim:opts.horaFim||null,
        tecnico:opts.tecnico||null, diagnostico:"", fotos:[], desfecho:null,
        observacao:opts.observacao||"",
        criadoPor:usuario, criadoEm:agora,
      };
      a.visitas.push(visita);
      // §4 (correção 4, aprovada): agendar uma visita É o sinal de que o
      // chamado está "Agendada" — mesmo status legado de sempre, só que
      // agora a fonte de verdade de QUANDO é a própria visita, não mais um
      // `prazo` solto sem relação com nenhuma visita real.
      a.status = "AGENDADA";
      const nomeAtual = usuario ? usuario.split(" ")[0] : "Alguém";
      Store.audit({categoria:"QUALIDADE", tipo:"ASSISTENCIA_VISITA_AGENDADA", obraId:a.obraId,
        descricao:`${nomeAtual} agendou visita de assistência para ${visita.data}${visita.horaInicio? " às "+visita.horaInicio:""}`});
      if(a.obraId) Store.log(a.obraId, "ASSISTENCIA_VISITA_AGENDADA", `Visita de assistência agendada para ${visita.data} — ${a.categoria}: ${a.descricao}`, {assistenciaId:a.id, visitaId:visita.id});
      emit();
      return {ok:true, visita};
    },
    registrarVisitaAssistencia(assistId, opts){
      opts = opts || {};
      // mesma régua de antes: visita que resolve = "concluir" a VISITA (não
      // a assistência — ver item 9/gate de conclusão em concluirAssistencia);
      // visita que só registra retorno necessário = "editar". Checado antes
      // de tudo, igual ao resto do arquivo.
      const acaoNecessaria = opts.desfecho==="RESOLVIDA" ? "assistencia.concluir" : "assistencia.editar";
      if(!Store.pode(acaoNecessaria)) return {ok:false, motivo:"SEM_PERMISSAO"};
      const a = state.assistencias.find(x=>x.id===assistId); if(!a) return {ok:false, motivo:"NAO_ENCONTRADA"};
      if(!opts.desfecho) return {ok:false, motivo:"DESFECHO_OBRIGATORIO"};
      a.visitas = a.visitas || [];
      const agora = M.todayISO();
      const usuario = state.usuarioAtual || null;
      let visita, numero, criandoNova;
      if(opts.visitaId){
        // completa uma visita PRÉ-AGENDADA (Fase 7) — nunca cria uma segunda
        // entrada pra mesma visita.
        visita = a.visitas.find(v=>v.id===opts.visitaId);
        if(!visita) return {ok:false, motivo:"VISITA_NAO_ENCONTRADA"};
        if(M.Calc.statusEfetivoVisita(visita)!=="AGENDADA") return {ok:false, motivo:"VISITA_NAO_ESTA_AGENDADA"};
        numero = a.visitas.indexOf(visita)+1;
        criandoNova = false;
      } else {
        // caminho 100% retrocompatível (Fase 5): cria e já realiza no mesmo passo.
        numero = a.visitas.length + 1;
        visita = {id:M.uid("visit"), criadoPor:usuario, criadoEm:agora};
        a.visitas.push(visita);
        criandoNova = true;
      }
      visita.status = "REALIZADA";
      visita.data = opts.data || visita.data || agora;
      if(opts.horaInicio!==undefined) visita.horaInicio = opts.horaInicio||null;
      if(opts.horaFim!==undefined) visita.horaFim = opts.horaFim||null;
      visita.tecnico = opts.tecnico || visita.tecnico || usuario || null;
      visita.diagnostico = opts.diagnostico || "";
      visita.fotos = opts.fotos || visita.fotos || [];
      visita.desfecho = opts.desfecho;
      visita.registradoEm = agora; // mantido por compatibilidade — "quando este registro foi salvo"
      visita.realizadoPor = opts.tecnico || usuario || null;
      visita.realizadoEm = agora;
      let pendenciaGerada = null;
      if(opts.pecaNecessaria && opts.pecaNecessaria.descricao){
        pendenciaGerada = Store.criarPendencia({
          obraId:a.obraId, ambienteNome:a.ambienteNome, movelNome:a.movelNome, obraNome:a.obraNome,
          tipo:"Assistência", categoria: opts.pecaNecessaria.categoria || "Peça para refazer",
          descricao: opts.pecaNecessaria.descricao, responsavel: opts.tecnico||a.responsavel,
          prazo: opts.pecaNecessaria.prazo||null, prioridade:"ALTA", impacto:"IMPEDE_FINALIZAR",
          // FASE 7 (item 6, aprovado): pendência nascida de uma assistência
          // herda origem="ASSISTENCIA" (campo já existia, sempre null até
          // aqui) e o novo campo assistenciaId (necessário pra achar "quais
          // pendências bloqueiam ESTE chamado" no gate de conclusão — ver
          // concluirAssistencia). `impacto` continua sendo a ÚNICA fonte de
          // verdade de bloqueio (M.bloqueiaFechamento) — nenhum booleano novo.
          origem:"ASSISTENCIA", assistenciaId:a.id,
        });
        // ACHADO (pré-existente à Fase 7, corrigido de passagem aqui):
        // Store.criarPendencia devolve {ok, pendencia}, não a pendência
        // direto — o código antigo (Fase 5) lia `.id` do objeto errado
        // (`{ok,pendencia}.id`, sempre undefined), então `pendenciaGeradaId`
        // nunca era gravado de verdade e o link "gerou pendência →" da
        // visita nunca aparecia. Corrigido aqui; guard extra pro caso raro
        // de pendencia.criar estar desligado pra este perfil (não deve
        // acontecer hoje — os perfis com assistencia.editar/concluir também
        // têm pendencia.criar=true na matriz atual — mas não trava a visita
        // inteira se acontecer).
        if(pendenciaGerada.ok) { pendenciaGerada = pendenciaGerada.pendencia; visita.pendenciaGeradaId = pendenciaGerada.id; }
        else pendenciaGerada = null;
      }
      a.ultimaVisitaEm = visita.data;
      // FASE 7 (item 9/§12 — regra dura mantida do pedido original):
      // registrar uma visita RESOLVIDA nunca conclui a assistência
      // sozinha — quem decide "está concluída" é sempre uma ação própria e
      // explícita (Store.concluirAssistencia, com resultado final e
      // cobertura decididos, e sem bloqueio pendente). Aqui a visita só
      // sai da lista de "precisa de retorno"; se não sobrar nenhuma
      // visita AGENDADA nem pendência bloqueante, a assistência fica livre
      // pra ser concluída (mas alguém ainda precisa concluir de verdade).
      if(opts.desfecho!=="RESOLVIDA"){
        // "retorno necessário" sem já ter a próxima visita agendada — volta
        // pra Aguardando (peça/fornecedor/cliente); se quem registrou já
        // informou a próxima visita (opts.proximoStatus==="AGENDADA"), quem
        // agenda de fato é sempre agendarVisitaAssistencia (aqui só guarda o
        // status "aguardando" mais adequado, nunca finge que já agendou).
        a.status = (opts.proximoStatus && opts.proximoStatus!=="AGENDADA") ? opts.proximoStatus : "AGUARDANDO_MATERIAL";
      } else if(a.status!=="CONCLUIDA"){
        // resolvida, mas ainda não é "Concluída" enquanto ninguém confirmar
        // pelo gate — fica "Em execução" pra deixar claro que falta o passo
        // final, em vez de continuar mostrando "Agendada" ou "Aguardando".
        a.status = "EM_EXECUCAO";
      }
      // formato do evento de auditoria segue a citação literal do handoff:
      // "Elias registrou a 2ª visita de assistência · resultado: retorno necessário"
      const nomeAtual = usuario ? usuario.split(" ")[0] : "Alguém";
      Store.audit({categoria:"QUALIDADE", tipo:"ASSISTENCIA_VISITA_REGISTRADA", obraId:a.obraId, ambienteId:a.ambienteId||null,
        descricao:`${nomeAtual} registrou a ${numero}ª visita de assistência · resultado: ${opts.desfecho==="RESOLVIDA"?"resolvida":"retorno necessário"}`,
        motivo: pendenciaGerada? `Gerou pendência ${pendenciaGerada.id}` : undefined});
      if(a.obraId) Store.log(a.obraId, "ASSISTENCIA_VISITA_REGISTRADA",
        `${nomeAtual} registrou a ${numero}ª visita de assistência · resultado: ${opts.desfecho==="RESOLVIDA"?"resolvida":"retorno necessário"}`,
        {assistenciaId:a.id, visitaId:visita.id});
      emit();
      return {ok:true, visita, pendenciaGerada, criandoNova};
    },
    // FASE 7 (item 3 — "não criar entidade paralela"; confirmado na rodada
    // de ajustes finais, item 4): cancelar uma VISITA agendada (ex.: cliente
    // remarcou) é uma ação bem menor que cancelar a assistência inteira —
    // usuário decidiu explicitamente MANTER "assistencia.editar" como gate
    // (não criar uma terceira permissão só pra isso). Cancelar uma visita
    // NUNCA cancela a assistência — só remove aquele compromisso específico
    // (a assistência continua com o status que já tinha).
    //
    // AJUSTES FINAIS (item 4): motivo agora é OBRIGATÓRIO (antes era
    // opcional) — mesmo padrão de exigência que Store.cancelarAssistencia.
    cancelarVisitaAssistencia(assistId, visitaId, motivo){
      if(!Store.pode("assistencia.editar")) return {ok:false, motivo:"SEM_PERMISSAO"};
      if(!motivo || !String(motivo).trim()) return {ok:false, motivo:"MOTIVO_OBRIGATORIO"};
      const a = state.assistencias.find(x=>x.id===assistId); if(!a) return {ok:false, motivo:"NAO_ENCONTRADA"};
      const visita = (a.visitas||[]).find(v=>v.id===visitaId); if(!visita) return {ok:false, motivo:"VISITA_NAO_ENCONTRADA"};
      if(M.Calc.statusEfetivoVisita(visita)!=="AGENDADA") return {ok:false, motivo:"VISITA_NAO_ESTA_AGENDADA"};
      visita.status = "CANCELADA";
      visita.canceladoPor = state.usuarioAtual||null; visita.canceladoEm = M.todayISO();
      visita.motivoCancelamento = motivo;
      Store.audit({categoria:"QUALIDADE", tipo:"ASSISTENCIA_VISITA_CANCELADA", obraId:a.obraId,
        descricao:`Visita de assistência de ${visita.data} cancelada — ${a.categoria}: ${a.descricao}`, motivo});
      if(a.obraId) Store.log(a.obraId, "ASSISTENCIA_VISITA_CANCELADA", `Visita de assistência de ${visita.data} cancelada — motivo: ${motivo}`, {assistenciaId:a.id, visitaId:visita.id});
      emit();
      return {ok:true, visita};
    },
    // AJUSTES FINAIS (itens 1/2/3) — cancelamento da ASSISTÊNCIA INTEIRA.
    // Permissão PRÓPRIA ("assistencia.cancelar", nunca "assistencia.editar")
    // — nenhum perfil é checado por nome aqui, só Store.pode(...). Regras,
    // na ordem:
    //   - exige "assistencia.cancelar" (SEM_PERMISSAO);
    //   - exige opts.motivo não-vazio (MOTIVO_OBRIGATORIO) — cancelar um
    //     chamado sem dizer por quê não é aceitável nesta ação;
    //   - já CANCELADA → retorno idempotente {ok:true, jaCancelada:true}
    //     (chamar de novo não é erro, mesmo padrão do gate de conclusão);
    //   - já CONCLUIDA → recusa (ASSISTENCIA_CONCLUIDA) — não existe
    //     "desfazer conclusão" cancelando por cima;
    //   - senão grava status=CANCELADA + canceladoPor/canceladoEm/
    //     motivoCancelamento, audita e loga no histórico da obra.
    // Nunca toca faseMacro da obra, nunca mexe em Produção/Montagem, nunca
    // remove/apaga visitas, fotos, histórico ou pendências vinculadas — só
    // muda o status da própria assistência (Object.assign não é usado de
    // propósito; só os 4 campos abaixo são gravados).
    cancelarAssistencia(assistId, opts){
      opts = opts || {};
      if(!Store.pode("assistencia.cancelar")) return {ok:false, motivo:"SEM_PERMISSAO"};
      const motivo = opts.motivo && String(opts.motivo).trim();
      if(!motivo) return {ok:false, motivo:"MOTIVO_OBRIGATORIO"};
      const a = state.assistencias.find(x=>x.id===assistId); if(!a) return {ok:false, motivo:"NAO_ENCONTRADA"};
      if(a.status==="CANCELADA") return {ok:true, jaCancelada:true};
      if(a.status==="CONCLUIDA") return {ok:false, motivo:"ASSISTENCIA_CONCLUIDA"};
      a.status = "CANCELADA";
      a.canceladoPor = state.usuarioAtual||null;
      a.canceladoEm = M.todayISO();
      a.motivoCancelamento = motivo;
      Store.audit({categoria:"QUALIDADE", tipo:"ASSISTENCIA_CANCELADA", obraId:a.obraId,
        descricao:`Assistência cancelada — ${a.categoria}: ${a.descricao}`, motivo});
      if(a.obraId) Store.log(a.obraId, "ASSISTENCIA_CANCELADA", `Assistência cancelada — ${a.categoria}: ${a.descricao} — motivo: ${motivo}`, {assistenciaId:a.id});
      emit();
      return {ok:true};
    },
    // "Cortesia" é decisão comercial da Moodo — gate de permissão igual ao
    // usado pra ressalva (Fase 4) e pra impacto "bloqueia" (Fase 2): reaproveita
    // M.Store.pode("liberarExcecao") como proxy simplificado de "Líder ou acima".
    definirGarantiaAssistencia(assistId, garantia){
      const a = state.assistencias.find(x=>x.id===assistId); if(!a) return {ok:false, motivo:"NAO_ENCONTRADA"};
      if(garantia==="CORTESIA" && !Store.pode("liberarExcecao")) return {ok:false, motivo:"SEM_PERMISSAO"};
      const anterior = a.garantia;
      a.garantia = garantia;
      Store.audit({categoria:"QUALIDADE", tipo:"ASSISTENCIA_GARANTIA_DEFINIDA", obraId:a.obraId,
        descricao:`Garantia de "${a.descricao}" definida como ${M.garantiaDef(garantia).label}`, motivo: anterior!==garantia? `Era: ${M.garantiaDef(anterior).label}`:undefined});
      if(a.obraId) Store.log(a.obraId, "ASSISTENCIA_GARANTIA_DEFINIDA", `Cobertura de "${a.descricao}" definida como ${M.garantiaDef(garantia).label}`, {assistenciaId:a.id});
      emit();
      return {ok:true};
    },
    // FASE 7 (item 9/§12 — regras de conclusão): conclusão passa a ser um
    // GATE explícito, nunca um Object.assign cego pra CONCLUIDA. Bloqueia
    // quando:
    //   - a cobertura (garantia) ainda não foi decidida (EM_ANALISE — "ainda
    //     sem definição", pela própria descrição de M.GARANTIA_DEF);
    //   - não veio um resultado final (opts.resultado, nem já tinha um
    //     a.resultado salvo antes);
    //   - existe visita AGENDADA pendente (retorno obrigatório ainda não
    //     atendido);
    //   - existe pendência vinculada a este chamado (assistenciaId) cujo
    //     impacto BLOQUEIA fechamento (M.bloqueiaFechamento, a MESMA função
    //     usada por toda regra de bloqueio de ambiente/obra no resto do
    //     app) e que ainda não foi resolvida.
    concluirAssistencia(assistId, opts){
      opts = opts || {};
      if(!Store.pode("assistencia.concluir")) return {ok:false, motivo:"SEM_PERMISSAO"};
      const a = state.assistencias.find(x=>x.id===assistId); if(!a) return {ok:false, motivo:"NAO_ENCONTRADA"};
      if(a.status==="CONCLUIDA") return {ok:true, jaConcluida:true};
      if(a.status==="CANCELADA") return {ok:false, motivo:"ASSISTENCIA_CANCELADA"};
      if(!a.garantia || a.garantia==="EM_ANALISE") return {ok:false, motivo:"COBERTURA_NAO_DEFINIDA"};
      const resultado = opts.resultado || a.resultado;
      if(!resultado) return {ok:false, motivo:"RESULTADO_OBRIGATORIO"};
      const visitaAgendadaPendente = M.Calc.proximaVisitaAgendada(a);
      if(visitaAgendadaPendente) return {ok:false, motivo:"VISITA_AGENDADA_PENDENTE", visita:visitaAgendadaPendente};
      const pendenciasBloqueantes = state.pendencias.filter(p=> p.assistenciaId===assistId && p.status!=="RESOLVIDA" && M.bloqueiaFechamento(p.impacto));
      if(pendenciasBloqueantes.length) return {ok:false, motivo:"PENDENCIA_BLOQUEANTE", pendencias:pendenciasBloqueantes};
      a.status = "CONCLUIDA";
      a.resultado = resultado;
      a.resolvidoPor = state.usuarioAtual||null; a.resolvidoEm = M.todayISO();
      Store.audit({categoria:"QUALIDADE", tipo:"ASSISTENCIA_CONCLUIDA", obraId:a.obraId,
        descricao:`Assistência concluída — ${a.categoria}: ${a.descricao}`, motivo:resultado});
      if(a.obraId) Store.log(a.obraId, "ASSISTENCIA_CONCLUIDA", `Assistência concluída — ${a.categoria}: ${a.descricao}`, {assistenciaId:a.id});
      emit();
      return {ok:true};
    },
    // FASE 7 (item 5, aprovado): reaproveita o MESMO vínculo já usado por
    // Store.obraIdsDoColaborador (nenhuma regra nova de escopo) — espelha o
    // padrão de Store.pendenciasVisiveis (Fase 4). Sem verTodasObras, só
    // enxerga assistências das obras onde a pessoa já tem algo atribuído.
    assistenciasVisiveis(){
      const nome = state.usuarioAtual;
      let out = state.assistencias;
      if(!Store.pode("verTodasObras")){
        const meuObraIds = Store.obraIdsDoColaborador(nome);
        out = out.filter(a=> a.obraId && meuObraIds.has(a.obraId));
      }
      return out;
    },

    // ---------- agenda (Fase 6 — Agenda V2) ----------
    // §2/§4: a Agenda CONSOME informação dos módulos de origem. Só os 4
    // tipos sem módulo dono (RETORNO/VISITA/MEDICAO/OUTRO) podem virar
    // registro MANUAL aqui — MONTAGEM e ASSISTENCIA são sempre recusados
    // (TIPO_NAO_MANUAL): eles nunca são gravados como entidade própria,
    // são computados ao vivo a partir de obra.planejamentoMontagem e
    // state.assistencias (ver M.Agenda.todosEventosRaw, js/pages/agenda.js)
    // — assim não existem duas fontes de verdade pra mesma data.
    criarEvento(dados){
      if(!Store.pode("agenda.criar")) return {ok:false, motivo:"SEM_PERMISSAO"};
      dados = dados || {};
      if(!dados.tipo || !dados.data) return {ok:false, motivo:"DADOS_OBRIGATORIOS"};
      if(!M.tipoEventoDef(dados.tipo).manual) return {ok:false, motivo:"TIPO_NAO_MANUAL"};
      const agora = M.todayISO();
      const usuario = state.usuarioAtual || null;
      const obra = dados.obraId ? Store.getObra(dados.obraId) : null;
      const item = {
        id: M.uid("evt"), tipo: dados.tipo,
        titulo: dados.titulo || M.tipoEventoDef(dados.tipo).label,
        obraId: dados.obraId || null,
        obraNome: obra ? obra.cliente : (dados.obraNome || null),
        cliente: obra ? obra.cliente : (dados.cliente || null),
        endereco: dados.endereco || (obra ? obra.endereco : "") || "",
        data: dados.data, horaInicio: dados.horaInicio || null, horaFim: dados.horaFim || null,
        equipe: dados.equipe || "", observacao: dados.observacao || "",
        origem: "MANUAL", origemRefId: null,
        status: dados.status || "AGENDADO",
        criadoPor: usuario, criadoEm: agora, atualizadoPor: usuario, atualizadoEm: agora,
      };
      state.eventos.push(item);
      // §23: "registrar criação/edição/cancelamento no histórico/auditoria
      // já existente" — Store.log é o mesmo histórico central usado por
      // toda ação do app, nenhum sistema paralelo.
      Store.log(item.obraId, "AGENDA_EVENTO_CRIADO", `Compromisso criado na Agenda — ${M.tipoEventoDef(item.tipo).label}: ${item.titulo}`, {eventoId:item.id});
      emit();
      return {ok:true, evento:item};
    },
    // Evento derivado (origem MONTAGEM/ASSISTENCIA) nunca chega aqui como
    // edição de verdade — §15: "não editar dados principais diretamente na
    // Agenda... a ação de editar deve levar ao contexto de origem." A
    // própria tela (js/pages/agenda.js) não oferece "Editar" pra evento
    // derivado, mas o guard abaixo também nega no Store, pra nenhum caminho
    // (nem um onclick esquecido) conseguir gravar por cima de um evento que
    // não é dono do seu próprio dado.
    atualizarEvento(id, patch){
      if(!Store.pode("agenda.editar")) return {ok:false, motivo:"SEM_PERMISSAO"};
      const e = state.eventos.find(x=>x.id===id); if(!e) return {ok:false, motivo:"NAO_ENCONTRADA"};
      if(e.origem!=="MANUAL") return {ok:false, motivo:"ORIGEM_NAO_EDITAVEL"};
      patch = patch || {};
      const obraMudou = Object.prototype.hasOwnProperty.call(patch, "obraId");
      const obra = obraMudou ? (patch.obraId ? Store.getObra(patch.obraId) : null) : null;
      Object.assign(e, patch);
      if(obraMudou){
        e.obraNome = obra ? obra.cliente : (patch.obraNome || null);
        if(obra && !patch.endereco) e.endereco = obra.endereco || e.endereco;
      }
      e.atualizadoPor = state.usuarioAtual || null; e.atualizadoEm = M.todayISO();
      Store.log(e.obraId, "AGENDA_EVENTO_EDITADO", `Compromisso da Agenda editado — ${e.titulo}`, {eventoId:e.id});
      emit();
      return {ok:true, evento:e};
    },
    cancelarEvento(id){
      if(!Store.pode("agenda.editar")) return {ok:false, motivo:"SEM_PERMISSAO"};
      const e = state.eventos.find(x=>x.id===id); if(!e) return {ok:false, motivo:"NAO_ENCONTRADA"};
      if(e.origem!=="MANUAL") return {ok:false, motivo:"ORIGEM_NAO_EDITAVEL"};
      e.status = "CANCELADO";
      e.atualizadoPor = state.usuarioAtual || null; e.atualizadoEm = M.todayISO();
      Store.log(e.obraId, "AGENDA_EVENTO_CANCELADO", `Compromisso da Agenda cancelado — ${e.titulo}`, {eventoId:e.id});
      emit();
      return {ok:true, evento:e};
    },

    // ---------- usuário / permissões ----------
    setUsuarioAtual(nome){ state.usuarioAtual = nome; emit(); },

    // ---------- nova obra ----------
    // FASE 7.5 (Nova Obra V2): criarObra continua sendo o único ponto que
    // insere uma obra em state.obras — tanto vindo do wizard (import OU
    // manual) quanto de RASCUNHO. status:"RASCUNHO" é o único valor que pula
    // o seeding operacional (componentes críticos → pendência automática +
    // tarefas padrão da etapa inicial) — item 7 do pedido: rascunho não pode
    // gerar Pendência operacional automática nem entrar no pipeline de
    // produção. Qualquer outro status (inclusive o legado "EM_PRODUCAO")
    // segue exatamente o comportamento de sempre — nada regride pra
    // obras/testes das Fases 0-7. O seeding adiado do rascunho acontece em
    // Store.ativarObra, no momento em que a obra vira operacional de fato.
    criarObra(obra){
      const processed = obra;
      const ehRascunho = processed.status === "RASCUNHO";
      // AJUSTE (Fase 7.5): antes dividia direto (valorLiquido/valorBruto), o
      // que dava NaN pra obra criada manualmente sem PDF/valores. Rascunho e
      // criação manual sem preço agora só zeram fatorLiquido/desconto em vez
      // de propagar NaN pelo resto do objeto.
      processed.fatorLiquido = processed.valorBruto>0 ? processed.valorLiquido/processed.valorBruto : 0;
      processed.desconto = (processed.valorBruto||0) - (processed.valorLiquido||0);
      processed.descontoPct = processed.valorBruto>0 ? processed.desconto/processed.valorBruto : 0;
      // FASE 3 — toda obra nova nasce em AGUARDANDO_INICIO (impactaRisco:
      // false, não gera alerta de atraso/risco até alguém mover ela pra
      // frente de propósito). Só obra criada a partir daqui ganha isso —
      // obras já existentes não são tocadas por esta linha.
      processed.faseMacro = "AGUARDANDO_INICIO";
      // FASE 7.5 — auditoria de criação (item 8 do pedido: criadoPor/criadoEm).
      // Só preenche se o chamador não tiver passado já (ex.: ativarObra nunca
      // reescreve isso — a obra já existe).
      // CORREÇÃO PÓS-ENTREGA (item 4) — timestamp completo (data+hora), não
      // só a data: histórico/auditoria precisam distinguir duas obras
      // criadas no mesmo dia. Obras antigas (sem esse campo) não são
      // migradas — continuam lidas normalmente onde quer que apareçam.
      processed.criadoPor = processed.criadoPor || state.usuarioAtual || null;
      processed.criadoEm = processed.criadoEm || new Date().toISOString();
      (processed.ambientes||[]).forEach(a=>{
        a.valorBruto = Math.round((processed.valorBruto||0) * (a.valorBrutoPct||0));
        a.valorLiquido = Math.round(a.valorBruto * processed.fatorLiquido);
        a.obraId = processed.id;
        (a.moveis||[]).forEach(m=>{
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
          m.checklist = [];
          m.componentesCriticos = m.componentesCriticos || [];
          if(ehRascunho){
            // não deleta m.componentesCriticosIniciais aqui — fica guardado no
            // móvel até Store.ativarObra processar (item 7: rascunho não gera
            // pendência automática ainda).
          } else {
            // fase seguinte do plano "obra no centro": cada item especial já nasce
            // com a pendência real vinculada (mesmo caminho de Store.criarComponenteCritico),
            // em vez de ficar decorativo até alguém mexer nele manualmente.
            // Aceita string solta (nome, tipo genérico "Material especial" — entrada
            // manual) ou {nome, tipo} (leitor de PDF já sabe o tipo específico —
            // Vidro/Serralheria/etc. — porque detectou por palavra-chave no texto,
            // o que dá uma categoria de pendência mais precisa que "Material especial").
            const especiais = m.componentesCriticosIniciais || [];
            delete m.componentesCriticosIniciais;
            especiais.forEach(especial=>{
              const dados = typeof especial === "string" ? {nome:especial, tipo:"Material especial"} : especial;
              criarComponenteEmMovel({o:processed, a, m}, dados);
            });
            Store.criarTarefasPadraoParaEtapa({o:processed, a, m}, primeiraEtapa.id);
          }
        });
      });
      state.obras.push(processed);
      Store.log(processed.id, ehRascunho ? "OBRA_RASCUNHO_CRIADO" : "OBRA_CRIADA",
        ehRascunho ? `Rascunho de obra criado — ${processed.nome||processed.cliente||"sem nome ainda"}.`
                   : `Obra ${processed.numeroOS||processed.nome||processed.cliente} criada.`);
      emit();
      return processed;
    },

    // FASE 7.5 — base pra qualquer tela/cálculo que NÃO deve considerar
    // rascunho: Hoje, risco (Calc), Montagem, Produção, Agenda, Indicadores,
    // TV, Chão de Fábrica, Para Finalizar, seletor de obra em
    // Pendência/Tarefa/Assistência/Agenda manual. Obra sem `status` (todo o
    // legado pré-Fase-7.5, inclusive "EM_PRODUCAO") conta como operacional —
    // só "RASCUNHO" é excluído. A tela Obras é a única que usa state.obras
    // "cru" (ela é o único lugar que a Fase 7.5 pede pra rascunho aparecer,
    // atrás de um filtro/status dedicado).
    obrasOperacionais(){ return state.obras.filter(o=>o.status!=="RASCUNHO"); },
    obrasRascunho(){ return state.obras.filter(o=>o.status==="RASCUNHO"); },
    // Item 9 do pedido — nunca existiu (RELATORIO-FASE-0-V2 já documentava a
    // ausência). Comparação por número de OS normalizado (trim + minúsculas)
    // pra não deixar "OS 2026/336" e "os 2026/336 " passarem como diferentes.
    // FASE 7.5 (correção pós-entrega, item 1) — `excluirObraId` ignora a
    // própria obra sendo editada: um rascunho retomado (ou qualquer edição)
    // já tem obraId, mas ainda precisa saber se ALGUMA OUTRA obra tem o
    // mesmo número de OS. A obra sendo editada nunca conflita com ela mesma.
    getObraByNumeroOS(numeroOS, excluirObraId){
      const alvo = String(numeroOS||"").trim().toLowerCase();
      if(!alvo) return null;
      return state.obras.find(o=> o.id!==excluirObraId && String(o.numeroOS||"").trim().toLowerCase()===alvo) || null;
    },

    // FASE 7.5 — ativarObra(): a única transição RASCUNHO → ATIVA. Reaplica
    // a validação mínima (item 6 do pedido) mesmo que a UI já tenha
    // desabilitado o botão — mesma defesa em profundidade usada em
    // Store.cancelarAssistencia/atualizarAssistencia na Fase 7. É AQUI (não
    // na criação do rascunho) que o seeding operacional roda pela primeira
    // vez — tarefas-padrão da etapa inicial + componentes críticos/pendência
    // automática dos itens especiais guardados em m.componentesCriticosIniciais.
    ativarObra(obraId){
      const o = Store.getObra(obraId); if(!o) return {ok:false, motivo:"NAO_ENCONTRADA"};
      if(o.status!=="RASCUNHO") return {ok:true, jaAtiva:true};
      const faltando = [];
      if(!String(o.nome||"").trim()) faltando.push("nome da obra");
      if(!String(o.cliente||"").trim()) faltando.push("cliente");
      if(!String(o.responsavel||"").trim()) faltando.push("responsável");
      if(!(o.ambientes||[]).length) faltando.push("pelo menos 1 ambiente");
      const totalMoveis = (o.ambientes||[]).reduce((s,a)=>s+(a.moveis||[]).length, 0);
      if(!totalMoveis) faltando.push("pelo menos 1 móvel");
      if(faltando.length) return {ok:false, motivo:"CAMPOS_OBRIGATORIOS", faltando};
      o.status = "ATIVA";
      o.ativadoPor = state.usuarioAtual || null;
      // CORREÇÃO PÓS-ENTREGA (item 4) — timestamp completo, mesmo motivo de
      // processed.criadoEm acima (distinguir data E hora na auditoria).
      o.ativadoEm = new Date().toISOString();
      const primeiraEtapa = M.Store.etapasAtivas()[0];
      o.ambientes.forEach(a=>{
        (a.moveis||[]).forEach(m=>{
          const especiais = m.componentesCriticosIniciais || [];
          delete m.componentesCriticosIniciais;
          especiais.forEach(especial=>{
            const dados = typeof especial === "string" ? {nome:especial, tipo:"Material especial"} : especial;
            criarComponenteEmMovel({o, a, m}, dados);
          });
          Store.criarTarefasPadraoParaEtapa({o, a, m}, m.etapa || primeiraEtapa.id);
        });
      });
      Store.log(o.id, "OBRA_ATIVADA", `Obra ativada — ${o.nome||o.cliente}.`);
      emit();
      return {ok:true, obra:o};
    },

    // FASE 7.5 (Edição V2) ----------------------------------------------
    // "fase operacional relevante" (item 15 do pedido) — a partir de qual
    // faseMacro uma alteração estrutural passa a marcar REVISÃO PCP
    // NECESSÁRIA em vez de só acontecer normal. LIBERACAO é o primeiro
    // estágio em que o PCP já está de fato engajado no plano de corte —
    // antes disso (Aguardando início/Medição/Projeto executivo) a obra
    // ainda está em desenho, editar é normal. A PARTIR de LIBERACAO
    // (inclusive) e em todas as fases seguintes, marca revisão PCP.
    //
    // CORREÇÃO PÓS-ENTREGA (última correção antes do push) — antes disto
    // o limiar era o número mágico "3" hardcoded. Funcionalmente já dava
    // o resultado certo (LIBERACAO tem ordem:3 no catálogo oficial de
    // M.FASES_MACRO_SEED — ver js/data.js), mas dependia de ninguém nunca
    // reordenar/inserir uma fase no catálogo sem lembrar de atualizar este
    // "3" em algum outro lugar do código. Agora o limiar é lido direto do
    // catálogo oficial pela CHAVE ("LIBERACAO"), nunca por número — se a
    // ordem oficial mudar (nova fase inserida antes/depois), esta função
    // acompanha sozinha, sem precisar tocar aqui.
    _obraEmFaseOperacionalRelevante(o){
      const fm = Store.faseMacroDeObra(o);
      if(fm.legado) return false;
      const liberacao = Store.faseMacroById("LIBERACAO");
      return !!liberacao && fm.ordem >= liberacao.ordem;
    },

    // Edições simples (item 14): nome, cliente, responsável, entrega,
    // endereço, observações, telefone, email. Correção de numeroOS depois da
    // obra já ter saído de AGUARDANDO_INICIO/MEDICAO/PROJETO_EXECUTIVO exige
    // motivo (item 16) — antes disso é edição normal, sem motivo obrigatório
    // (mesma régua do item 15). Nunca mexe em faseMacro/status/ambientes/
    // moveis — isso é papel de ativarObra/adicionarAmbiente&co, não deste.
    atualizarObra(obraId, patch, opts){
      opts = opts || {};
      const o = Store.getObra(obraId); if(!o) return {ok:false, motivo:"NAO_ENCONTRADA"};
      patch = patch || {};
      const CAMPOS_SIMPLES = ["nome","cliente","responsavel","dataEntregaPrevista","endereco","observacoes","telefone","email"];
      const alterados = [];
      CAMPOS_SIMPLES.forEach(campo=>{
        if(!(campo in patch)) return;
        const novo = patch[campo];
        if(novo === o[campo]) return;
        alterados.push(campo);
        o[campo] = novo;
      });
      let osAlterada = false;
      if("numeroOS" in patch && patch.numeroOS !== o.numeroOS){
        const precisaMotivo = Store._obraEmFaseOperacionalRelevante(o);
        if(precisaMotivo && !(opts.motivo && String(opts.motivo).trim())){
          return {ok:false, motivo:"MOTIVO_OBRIGATORIO_OS"};
        }
        o.numeroOS = patch.numeroOS;
        osAlterada = true;
        alterados.push("numeroOS");
        if(precisaMotivo){
          o.revisaoPCPNecessaria = true;
          Store.log(o.id, "OBRA_OS_CORRIGIDA", `Número de OS corrigido para "${patch.numeroOS}" — motivo: ${opts.motivo}.`);
        }
      }
      if(!alterados.length) return {ok:true, semAlteracao:true};
      o.atualizadoPor = state.usuarioAtual || null;
      o.atualizadoEm = M.todayISO();
      if(!(osAlterada && Store._obraEmFaseOperacionalRelevante(o))){
        // já logou um evento mais específico (OBRA_OS_CORRIGIDA) acima —
        // não duplica com um genérico também.
        Store.log(o.id, "OBRA_EDITADA", `Dados da obra atualizados — ${alterados.join(", ")}.`);
      }
      emit();
      return {ok:true, obra:o, alterados};
    },

    // Alterações estruturais (item 15) — Ambiente/Móvel. Nenhuma delas exige
    // motivo (só a correção de OS exige, item 16) — só marcam "revisão PCP
    // necessária" quando a obra já passou de LIBERACAO, sem bloquear.
    adicionarAmbiente(obraId, dados){
      const o = Store.getObra(obraId); if(!o) return {ok:false, motivo:"NAO_ENCONTRADA"};
      const nome = String((dados&&dados.nome)||"").trim();
      if(!nome) return {ok:false, motivo:"NOME_OBRIGATORIO"};
      const ambiente = {id:M.uid("amb"), nome, valorBrutoPct:0, valorBruto:0, valorLiquido:0, obraId:o.id, moveis:[]};
      o.ambientes = o.ambientes || [];
      o.ambientes.push(ambiente);
      const relevante = Store._obraEmFaseOperacionalRelevante(o);
      if(relevante) o.revisaoPCPNecessaria = true;
      Store.log(o.id, "OBRA_AMBIENTE_ADICIONADO", `Ambiente "${nome}" adicionado.${relevante?" (revisão PCP necessária)":""}`);
      emit();
      return {ok:true, ambiente};
    },
    // Bloqueia remoção se o ambiente (ou algum móvel dele) já tiver vínculo
    // operacional real — item 17: "não apagar silenciosamente Pendências,
    // histórico, Montagem, Assistência, arquivos". Se não for seguro,
    // bloqueia e orienta (não tenta decidir sozinho o que descartar).
    removerAmbiente(obraId, ambienteId){
      const o = Store.getObra(obraId); if(!o) return {ok:false, motivo:"NAO_ENCONTRADA"};
      const ambiente = (o.ambientes||[]).find(a=>a.id===ambienteId);
      if(!ambiente) return {ok:false, motivo:"NAO_ENCONTRADO"};
      const movelIds = new Set((ambiente.moveis||[]).map(m=>m.id));
      const vinculos = [];
      const pend = state.pendencias.filter(p=>p.ambienteId===ambienteId || movelIds.has(p.movelId));
      if(pend.length) vinculos.push(`${pend.length} pendência(s)`);
      const tar = (state.tarefas||[]).filter(t=>movelIds.has(t.movelId));
      if(tar.length) vinculos.push(`${tar.length} tarefa(s)`);
      const assist = state.assistencias.filter(a=>a.ambienteNome===ambiente.nome && a.obraId===o.id);
      if(assist.length) vinculos.push(`${assist.length} assistência(s)`);
      const movelComProgresso = (ambiente.moveis||[]).some(m=>{
        const primeiraEtapa = M.Store.etapasAtivas()[0];
        return (m.etapa && primeiraEtapa && m.etapa!==primeiraEtapa.id) || (m.componentesCriticos||[]).length;
      });
      if(movelComProgresso) vinculos.push("móvel com progresso/componente registrado");
      if(vinculos.length) return {ok:false, motivo:"VINCULOS_EXISTENTES", vinculos};
      o.ambientes = o.ambientes.filter(a=>a.id!==ambienteId);
      const relevante = Store._obraEmFaseOperacionalRelevante(o);
      if(relevante) o.revisaoPCPNecessaria = true;
      Store.log(o.id, "OBRA_AMBIENTE_REMOVIDO", `Ambiente "${ambiente.nome}" removido (sem vínculos).${relevante?" (revisão PCP necessária)":""}`);
      emit();
      return {ok:true};
    },
    adicionarMovel(obraId, ambienteId, dados){
      const o = Store.getObra(obraId); if(!o) return {ok:false, motivo:"NAO_ENCONTRADA"};
      const ambiente = (o.ambientes||[]).find(a=>a.id===ambienteId);
      if(!ambiente) return {ok:false, motivo:"AMBIENTE_NAO_ENCONTRADO"};
      const nome = String((dados&&dados.nome)||"").trim();
      if(!nome) return {ok:false, motivo:"NOME_OBRIGATORIO"};
      const primeiraEtapa = M.Store.etapasAtivas()[0];
      const movel = {
        id:M.uid("mov"), nome, ambienteId:ambiente.id, obraId:o.id,
        etapa: primeiraEtapa? primeiraEtapa.id : null,
        responsavel: (dados&&dados.responsavel) || o.responsavel || null,
        valorLiquido:0, dataPrevista:o.dataEntregaPrevista||null, dataReal:null,
        requisitosOverride:{}, dataEntradaEtapa:M.todayISO(), checklist:[], componentesCriticos:[],
      };
      ambiente.moveis = ambiente.moveis || [];
      ambiente.moveis.push(movel);
      const relevante = Store._obraEmFaseOperacionalRelevante(o);
      // Móvel adicionado numa obra RASCUNHO ainda não entra no pipeline
      // (mesma régua de criarObra/ativarObra — item 7: sem seeding
      // operacional antes da ativação). Numa obra já ATIVA, ganha as
      // tarefas padrão da etapa inicial imediatamente, como qualquer móvel.
      if(o.status!=="RASCUNHO" && primeiraEtapa){
        Store.criarTarefasPadraoParaEtapa({o, a:ambiente, m:movel}, primeiraEtapa.id);
      }
      if(relevante) o.revisaoPCPNecessaria = true;
      Store.log(o.id, "OBRA_MOVEL_ADICIONADO", `Móvel "${nome}" adicionado em "${ambiente.nome}".${relevante?" (revisão PCP necessária)":""}`);
      emit();
      return {ok:true, movel};
    },
    removerMovel(obraId, ambienteId, movelId){
      const o = Store.getObra(obraId); if(!o) return {ok:false, motivo:"NAO_ENCONTRADA"};
      const ambiente = (o.ambientes||[]).find(a=>a.id===ambienteId);
      if(!ambiente) return {ok:false, motivo:"AMBIENTE_NAO_ENCONTRADO"};
      const movel = (ambiente.moveis||[]).find(m=>m.id===movelId);
      if(!movel) return {ok:false, motivo:"NAO_ENCONTRADO"};
      const vinculos = [];
      const pend = state.pendencias.filter(p=>p.movelId===movelId);
      if(pend.length) vinculos.push(`${pend.length} pendência(s)`);
      const tar = (state.tarefas||[]).filter(t=>t.movelId===movelId);
      if(tar.length) vinculos.push(`${tar.length} tarefa(s)`);
      const assist = state.assistencias.filter(a=>a.movelNome===movel.nome && a.obraId===o.id);
      if(assist.length) vinculos.push(`${assist.length} assistência(s)`);
      const primeiraEtapa = M.Store.etapasAtivas()[0];
      if((movel.etapa && primeiraEtapa && movel.etapa!==primeiraEtapa.id) || (movel.componentesCriticos||[]).length){
        vinculos.push("progresso/componente registrado");
      }
      if(vinculos.length) return {ok:false, motivo:"VINCULOS_EXISTENTES", vinculos};
      ambiente.moveis = ambiente.moveis.filter(m=>m.id!==movelId);
      const relevante = Store._obraEmFaseOperacionalRelevante(o);
      if(relevante) o.revisaoPCPNecessaria = true;
      Store.log(o.id, "OBRA_MOVEL_REMOVIDO", `Móvel "${movel.nome}" removido de "${ambiente.nome}" (sem vínculos).${relevante?" (revisão PCP necessária)":""}`);
      emit();
      return {ok:true};
    },
    // Mover não é remoção — não passa pelo guard de vínculos (só muda de
    // ambiente dentro da mesma obra, histórico/pendência/tarefa continuam
    // válidos porque continuam apontando pro mesmo movelId).
    moverMovel(obraId, movelId, novoAmbienteId){
      const o = Store.getObra(obraId); if(!o) return {ok:false, motivo:"NAO_ENCONTRADA"};
      const origem = (o.ambientes||[]).find(a=>(a.moveis||[]).some(m=>m.id===movelId));
      const destino = (o.ambientes||[]).find(a=>a.id===novoAmbienteId);
      if(!origem) return {ok:false, motivo:"NAO_ENCONTRADO"};
      if(!destino) return {ok:false, motivo:"AMBIENTE_DESTINO_NAO_ENCONTRADO"};
      if(origem.id===destino.id) return {ok:true, semAlteracao:true};
      const movel = origem.moveis.find(m=>m.id===movelId);
      origem.moveis = origem.moveis.filter(m=>m.id!==movelId);
      movel.ambienteId = destino.id;
      destino.moveis = destino.moveis || [];
      destino.moveis.push(movel);
      const relevante = Store._obraEmFaseOperacionalRelevante(o);
      if(relevante) o.revisaoPCPNecessaria = true;
      Store.log(o.id, "OBRA_MOVEL_MOVIDO", `Móvel "${movel.nome}" movido de "${origem.nome}" para "${destino.nome}".${relevante?" (revisão PCP necessária)":""}`);
      emit();
      return {ok:true};
    },

    // FASE 7.5 (Nova Obra V2) — substitui a estrutura inteira (ambientes +
    // móveis) de uma obra ainda RASCUNHO, num só passo, vinda do editor
    // manual do wizard. Só funciona pra RASCUNHO — deliberado: uma obra
    // RASCUNHO nunca pode ter pendência/tarefa/assistência vinculada (todos
    // os pontos de criação disso já filtram por obrasOperacionais()), então
    // não existe vínculo pra perder ao substituir a estrutura inteira — o
    // guard de vínculos de removerAmbiente/removerMovel é desnecessário
    // aqui, e recriar tudo do zero é muito mais simples que fazer diff.
    // Preserva o id de ambiente/móvel que já existia (reaproveitado pelo
    // wizard ao reabrir um rascunho salvo), só gera id novo pro que é
    // genuinamente novo nesta edição.
    atualizarEstruturaRascunho(obraId, ambientesNovos){
      const o = Store.getObra(obraId); if(!o) return {ok:false, motivo:"NAO_ENCONTRADA"};
      if(o.status!=="RASCUNHO") return {ok:false, motivo:"OBRA_NAO_E_RASCUNHO"};
      o.ambientes = (ambientesNovos||[]).map(a=>{
        const ambId = a.id && String(a.id).indexOf("amb-")===0 ? a.id : M.uid("amb");
        return {
          id: ambId, nome: String(a.nome||"").trim(), valorBrutoPct:0, valorBruto:0, valorLiquido:0, obraId:o.id,
          moveis: (a.moveis||[]).map(m=>({
            id: m.id && String(m.id).indexOf("mov-")===0 ? m.id : M.uid("mov"),
            nome: String(m.nome||"").trim(), ambienteId:ambId, obraId:o.id,
            etapa:null, responsavel:o.responsavel||null, valorLiquido:0,
            dataPrevista:o.dataEntregaPrevista||null, dataReal:null,
            requisitosOverride:{}, dataEntradaEtapa:null, checklist:[], componentesCriticos:[],
          })),
        };
      });
      o.atualizadoPor = state.usuarioAtual || null;
      o.atualizadoEm = M.todayISO();
      Store.log(o.id, "OBRA_RASCUNHO_ATUALIZADO", `Estrutura do rascunho atualizada — ${o.ambientes.length} ambiente(s).`);
      emit();
      return {ok:true, obra:o};
    },

    // FASE 7.5 (Edição V2, item 15) — "não bloqueia necessariamente, mas
    // flag REVISÃO PCP NECESSÁRIA" implica alguém precisar poder marcar como
    // resolvida depois de revisar de verdade, senão o aviso nunca sai da
    // tela. Ação separada e simples de propósito — não inventa nenhum fluxo
    // de aprovação formal do PCP (isso é DinaBox/fase futura).
    limparRevisaoPCP(obraId){
      const o = Store.getObra(obraId); if(!o) return {ok:false, motivo:"NAO_ENCONTRADA"};
      if(!o.revisaoPCPNecessaria) return {ok:true, semAlteracao:true};
      o.revisaoPCPNecessaria = false;
      Store.log(o.id, "OBRA_REVISAO_PCP_CONCLUIDA", "Revisão de PCP marcada como concluída.");
      emit();
      return {ok:true};
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
    // ---------- Montagem V2 (Fase 5, rodada de ajustes) — máquina de estados por ambiente ----------
    // AJUSTE OBRIGATÓRIO (pós-relatório): cada ação tem sua própria chave de
    // permissão — nenhum perfil hardcoded, nenhuma ação decidindo "se tem
    // permissão A faz uma coisa, se tem B faz outra". iniciar/travar/destravar
    // usam montagem.iniciar/montagem.travar/montagem.destravar (chaves
    // próprias — ver M.PERFIS em data.js). marcarPronto e aprovarFinalizacao
    // continuam com suas permissões já existentes, mas agora como
    // ENTRY-POINTS SEPARADOS (Store.marcarProntoAmbiente / Store.aprovarFinalizacaoAmbiente)
    // — nenhum dos dois pula estado, mesmo que quem chame tenha as duas
    // permissões ao mesmo tempo (ex.: ADMIN). O único jeito de fechar um
    // ambiente sem passar por PRONTO_PARA_FINALIZAR é a exceção explícita
    // (Store.finalizarComRessalva), que exige motivo e permissão própria.
    iniciarMontagemAmbiente(ambienteId){
      if(!Store.pode("montagem.iniciar")) return {ok:false, motivo:"SEM_PERMISSAO"};
      const f = Store.findAmbiente(ambienteId); if(!f) return {ok:false, motivo:"NAO_ENCONTRADO"};
      const {o,a} = f;
      if(a.montagemInicioReal) return {ok:true, jaIniciado:true};
      a.montagemInicioReal = new Date().toISOString();
      // captura "início real" da MONTAGEM DA OBRA também, na primeira vez que
      // qualquer ambiente dela é iniciado (planejamento §10 — início real/fim
      // real/duração real) — não exige que alguém tenha preenchido o
      // planejamento antes; o campo nasce sozinho no primeiro ambiente.
      o.planejamentoMontagem = o.planejamentoMontagem || {};
      if(!o.planejamentoMontagem.inicioReal) o.planejamentoMontagem.inicioReal = M.todayISO();
      Store.log(o.id, "AMBIENTE_MONTAGEM_INICIADA", `${a.nome}: montagem iniciada.`);
      emit();
      return {ok:true};
    },
    // Travamento MANUAL — distinto do travamento por pendência (que continua
    // 100% automático via M.bloqueiaFechamento). Motivo é sempre obrigatório
    // (handoff §7: "TRAVADO precisa sempre mostrar motivo" / "não permitir
    // ressalva silenciosa" — mesmo princípio aplicado aqui pro travamento).
    marcarAmbienteTravado(ambienteId, motivo){
      if(!Store.pode("montagem.travar")) return {ok:false, motivo:"SEM_PERMISSAO"};
      if(!motivo || !motivo.trim()) return {ok:false, motivo:"MOTIVO_OBRIGATORIO"};
      const f = Store.findAmbiente(ambienteId); if(!f) return {ok:false, motivo:"NAO_ENCONTRADO"};
      const {o,a} = f;
      if(a.montagemStatus==="FINALIZADO" || a.montagemStatus==="FINALIZADO_COM_RESSALVA") return {ok:false, motivo:"JA_FINALIZADO"};
      a.travamentoManual = {motivo: motivo.trim(), autor: state.usuarioAtual, data: new Date().toISOString()};
      Store.log(o.id, "AMBIENTE_TRAVADO_MANUAL", `${a.nome}: travado — ${motivo.trim()}`);
      emit();
      return {ok:true};
    },
    // "Destravar" só se aplica ao travamento MANUAL. Se o ambiente está
    // travado por pendência aberta, a única forma real de destravar é
    // resolver a pendência (Pendências V2, Fase 4) — não existe um botão
    // que "force" isso aqui, senão o motivo mostrado deixaria de ser
    // verdade (o ambiente continuaria travado de fato).
    destravarAmbiente(ambienteId){
      if(!Store.pode("montagem.destravar")) return {ok:false, motivo:"SEM_PERMISSAO"};
      const f = Store.findAmbiente(ambienteId); if(!f) return {ok:false, motivo:"NAO_ENCONTRADO"};
      const {o,a} = f;
      if(Store.bloqueiosAmbiente(ambienteId).length) return {ok:false, motivo:"TRAVADO_POR_PENDENCIA"};
      if(!a.travamentoManual) return {ok:false, motivo:"NAO_ESTA_TRAVADO"};
      a.travamentoManual = null;
      Store.log(o.id, "AMBIENTE_DESTRAVADO", `${a.nome}: destravado.`);
      emit();
      return {ok:true};
    },
    // helper privado — checklist + móveis não montados, usado por
    // marcarProntoAmbiente e finalizarComRessalva (as duas únicas ações que
    // olham pro checklist de encerramento).
    _checklistInfoAmbiente(a, checklistOverride){
      const checklistState = checklistOverride || a.montagemChecklist || {};
      const checklist = M.CHECKLIST_ENCERRAMENTO_AMBIENTE.map(item=>({item, feito: !!checklistState[item]}));
      const itensChecklistFaltando = checklist.filter(c=>!c.feito).map(c=>c.item);
      const naoMontados = a.moveis.filter(m=> Store.posicaoEtapa(m.etapa) < Store.posicaoEtapa("MONTAGEM")).length;
      return {checklistState, itensChecklistFaltando, naoMontados};
    },
    // Primeiro passo do fluxo oficial: EM_MONTAGEM → PRONTO_PARA_FINALIZAR.
    // Só funciona a partir de EM_MONTAGEM — mesmo quem também tem
    // montagem.aprovarFinalizacao (ex.: ADMIN) não pula pra FINALIZADO por
    // aqui. Fechar puxando ressalva é outra ação (finalizarComRessalva),
    // não um bypass escondido dentro desta.
    marcarProntoAmbiente(ambienteId, opts){
      opts = opts || {};
      if(!Store.pode("montagem.marcarPronto")) return {ok:false, motivo:"SEM_PERMISSAO"};
      const f = Store.findAmbiente(ambienteId); if(!f) return {ok:false, motivo:"NAO_ENCONTRADO"};
      const {o,a} = f;
      const situacao = M.Calc && M.Calc.situacaoAmbiente ? M.Calc.situacaoAmbiente(a) : null;
      if(situacao && situacao.key==="PRONTO_PARA_FINALIZAR"){
        return {ok:true, status:"PRONTO_PARA_FINALIZAR", aguardandoAprovacao:true, jaEstavaPronto:true};
      }
      if(!situacao || situacao.key!=="EM_MONTAGEM"){
        return {ok:false, motivo:"TRANSICAO_INVALIDA", estadoAtual: situacao? situacao.key : null};
      }
      const {checklistState, itensChecklistFaltando, naoMontados} = Store._checklistInfoAmbiente(a, opts.checklist);
      if(itensChecklistFaltando.length>0 || naoMontados>0){
        return {ok:false, motivo:"PENDENTE", itensChecklistFaltando, naoMontados};
      }
      a.montagemChecklist = checklistState;
      a.montagemStatus = "PRONTO_PARA_FINALIZAR";
      Store.log(o.id, "AMBIENTE_PRONTO_PARA_FINALIZAR", `${a.nome}: marcado como pronto para finalizar, aguardando aprovação.`);
      emit();
      return {ok:true, status:"PRONTO_PARA_FINALIZAR", aguardandoAprovacao:true};
    },
    // Segundo passo do fluxo oficial: PRONTO_PARA_FINALIZAR → FINALIZADO.
    // Não aceita nenhum outro estado de origem — quem chama com o ambiente
    // ainda EM_MONTAGEM recebe erro de transição, mesmo tendo a permissão.
    aprovarFinalizacaoAmbiente(ambienteId){
      if(!Store.pode("montagem.aprovarFinalizacao")) return {ok:false, motivo:"SEM_PERMISSAO"};
      const f = Store.findAmbiente(ambienteId); if(!f) return {ok:false, motivo:"NAO_ENCONTRADO"};
      const {o,a} = f;
      if(a.montagemStatus!=="PRONTO_PARA_FINALIZAR"){
        const situacao = M.Calc && M.Calc.situacaoAmbiente ? M.Calc.situacaoAmbiente(a) : null;
        return {ok:false, motivo:"TRANSICAO_INVALIDA", estadoAtual: situacao? situacao.key : null};
      }
      // AJUSTE (últimos ajustes antes do push, item 3): não reexige checklist
      // (já validado em marcarProntoAmbiente) — mas o campo bruto
      // a.montagemStatus continua "PRONTO_PARA_FINALIZAR" mesmo se um bloqueio
      // NOVO surgiu depois (pendência aberta com impacto de bloqueio, ou
      // travamento manual), porque nenhuma dessas duas coisas mexe nesse
      // campo. situacaoAmbiente() já dá prioridade a TRAVADO sobre
      // PRONTO_PARA_FINALIZAR quando há bloqueio — aqui a aprovação usa a
      // mesma prioridade explicitamente, pra não fechar por cima de um
      // bloqueio incompatível que apareceu depois de marcar pronto.
      const bloqueios = Store.bloqueiosAmbiente(ambienteId);
      if(bloqueios.length || a.travamentoManual){
        return {ok:false, motivo:"BLOQUEIO_SURGIU_APOS_PRONTO", estadoAtual:"TRAVADO"};
      }
      a.montagemStatus = "FINALIZADO";
      a.finalizadoPor = state.usuarioAtual || null;
      a.finalizadoEm = M.todayISO();
      Store.log(o.id, "AMBIENTE_FINALIZADO_APROVADO", `${a.nome}: finalização aprovada.`);
      marcarFimRealSeObraFechou(o);
      emit();
      return {ok:true};
    },
    // Exceção explícita e única saída que NÃO passa por PRONTO_PARA_FINALIZAR
    // → APROVAÇÃO. Só a partir de EM_MONTAGEM / TRAVADO / PRONTO_PARA_FINALIZAR
    // — nunca a partir de NAO_INICIADO (não existe "ressalva" pra um ambiente
    // que nem começou) nem de um ambiente já finalizado. Se o travamento vier
    // de pendência (bloqueio automático), a pendência é registrada no
    // histórico mesmo que quem chamou não a tenha informado explicitamente.
    // AJUSTE (últimos ajustes antes do push, item 1): permissão ÚNICA e
    // exclusiva — só montagem.finalizarComRessalva autoriza esta transição.
    // liberarExcecao NÃO é mais aceito aqui como alternativa (era um bypass
    // indesejado); liberarExcecao continua valendo normalmente nos fluxos
    // legados onde já era usado (garantia CORTESIA, travar pendência em
    // pages/pendencias.js) — só deixou de valer para fechar com ressalva
    // na Montagem V2.
    finalizarComRessalva(ambienteId, opts){
      opts = opts || {};
      if(!Store.pode("montagem.finalizarComRessalva")) return {ok:false, motivo:"SEM_PERMISSAO"};
      const f = Store.findAmbiente(ambienteId); if(!f) return {ok:false, motivo:"NAO_ENCONTRADO"};
      const {o,a} = f;
      const situacao = M.Calc && M.Calc.situacaoAmbiente ? M.Calc.situacaoAmbiente(a) : null;
      const ORIGENS_PERMITIDAS = ["EM_MONTAGEM","TRAVADO","PRONTO_PARA_FINALIZAR"];
      if(!situacao || !ORIGENS_PERMITIDAS.includes(situacao.key)){
        return {ok:false, motivo:"TRANSICAO_INVALIDA", estadoAtual: situacao? situacao.key : null};
      }
      if(!opts.motivo || !String(opts.motivo).trim()) return {ok:false, motivo:"MOTIVO_OBRIGATORIO"};
      const bloqueios = Store.bloqueiosAmbiente(ambienteId);
      const pendenciaVinculada = opts.pendenciaVinculada || (bloqueios.length? bloqueios[0].id : null);
      const {checklistState} = Store._checklistInfoAmbiente(a, opts.checklist);
      a.montagemChecklist = checklistState;
      a.montagemStatus = "FINALIZADO_COM_RESSALVA";
      a.travamentoManual = null;
      a.finalizadoPor = state.usuarioAtual || null;
      a.finalizadoEm = M.todayISO();
      a.montagemRessalva = {motivo:opts.motivo, autorizadoPor: state.usuarioAtual, pendenciaVinculada, data:M.todayISO()};
      const viaPendencia = bloqueios.length? ` — travamento vinculado à pendência "${bloqueios[0].descricao||bloqueios[0].categoria}"` : "";
      Store.log(o.id, "AMBIENTE_FINALIZADO_RESSALVA", `${a.nome} finalizado com ressalva: ${opts.motivo}${viaPendencia}`);
      Store.audit({categoria:"GOVERNANCA", tipo:"AVANCO_COM_RESSALVA", obraId:o.id, ambienteId:a.id,
        descricao:`${a.nome} finalizado com ressalva — ${opts.motivo}${viaPendencia}`, motivo:opts.motivo});
      marcarFimRealSeObraFechou(o);
      emit();
      return {ok:true, ressalva:true, status:"FINALIZADO_COM_RESSALVA", pendenciaVinculada};
    },
    reabrirAmbiente(ambienteId){
      const f = Store.findAmbiente(ambienteId); if(!f) return;
      const eraRessalva = f.a.montagemStatus==="FINALIZADO_COM_RESSALVA";
      f.a.montagemStatus = null;
      Store.log(f.o.id, "AMBIENTE_REABERTO", `${f.a.nome} reaberto${eraRessalva?" (estava finalizado com ressalva)":""}.`);
      Store.audit({categoria:"QUALIDADE", tipo:"PENDENCIA_REABERTA", obraId:f.o.id, ambienteId:f.a.id,
        descricao:`${f.a.nome} reaberto depois de finalizado.`});
      if(f.o.planejamentoMontagem) f.o.planejamentoMontagem.fimReal = null;
      emit();
    },
    // ---------- planejamento de montagem (Fase 5, §10) ----------
    // Vive na OBRA (não no ambiente) — "início/fim previsto" é um
    // compromisso de obra inteira, não por cômodo. Gatilho: obra.editar
    // (já existente — PCP/Líder/Gestor/Admin; não Montador/Produção) —
    // planejar é decisão de quem edita a obra, não de quem executa.
    setPlanejamentoMontagem(obraId, dados){
      if(!Store.pode("obra.editar")) return {ok:false, motivo:"SEM_PERMISSAO"};
      const o = Store.getObra(obraId); if(!o) return {ok:false, motivo:"NAO_ENCONTRADA"};
      o.planejamentoMontagem = Object.assign({}, o.planejamentoMontagem, {
        inicioPrevisto: dados.inicioPrevisto||null,
        duracaoEstimadaValor: dados.duracaoEstimadaValor? Number(dados.duracaoEstimadaValor) : null,
        duracaoEstimadaUnidade: dados.duracaoEstimadaUnidade || "dias_uteis",
        equipePlanejada: dados.equipePlanejada || "",
        observacoes: dados.observacoes || "",
      });
      o.planejamentoMontagem.fimPrevistoCalculado = calcularFimPrevisto(o.planejamentoMontagem);
      Store.log(o.id, "OBRA_PLANEJAMENTO_MONTAGEM_DEFINIDO", `Planejamento de montagem atualizado (início previsto ${o.planejamentoMontagem.inicioPrevisto||"—"}).`);
      emit();
      return {ok:true};
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
  migrarMontagemStatusLegado();
  // primeira gravação (local — instantânea)
  persist();
  // SUPABASE: dispara a sincronização em segundo plano (não bloqueia o boot)
  sincronizarComSupabase();
})();
