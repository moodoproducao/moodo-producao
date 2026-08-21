/* ============================================================
   MOODO PRODUÇÃO — cálculos derivados
   ============================================================ */
(function(){
  "use strict";
  const M = window.M;

  const fmtBRL = (v)=> (v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0});
  const fmtBRLk = (v)=>{
    if(v==null) return "R$ 0";
    const abs = Math.abs(v);
    if(abs>=1000000) return "R$ "+(v/1000000).toFixed(1).replace(".",",")+"M";
    if(abs>=1000) return "R$ "+(v/1000).toFixed(1).replace(".",",")+"k";
    return fmtBRL(v);
  };
  const fmtDate = (iso)=>{ if(!iso) return "—"; const [y,m,d]=iso.split("-"); return `${d}/${m}/${y}`; };
  const fmtPct = (v)=> Math.round(v*100)+"%";
  const daysBetween = (aIso,bIso)=>{
    const a = new Date(aIso+"T00:00:00"), b=new Date(bIso+"T00:00:00");
    return Math.round((b-a)/86400000);
  };
  const diasDesde = (iso)=> daysBetween(iso, M.todayISO());
  const diasAte = (iso)=> daysBetween(M.todayISO(), iso);

  // Chaves estáveis das etapas-marco usadas em cálculos. A ORDEM entre elas é
  // sempre recalculada em tempo real via Store.posicaoEtapa (nunca cacheada),
  // porque a posição de uma etapa pode mudar se ela for reordenada.
  const pos = (id)=> M.Store.posicaoEtapa(id);

  function movelConcluido(m){ return pos(m.etapa) >= pos("EMBALAGEM"); }

  function progressoGrupo(moveis){
    if(!moveis.length) return {pct:0, concluidos:0, total:0};
    const concluidos = moveis.filter(movelConcluido).length;
    return {pct: Math.round(100*concluidos/moveis.length), concluidos, total:moveis.length};
  }
  function progressoObra(o){ return progressoGrupo(o.ambientes.flatMap(a=>a.moveis)); }
  function progressoAmbiente(a){ return progressoGrupo(a.moveis); }

  function itemCriticoGrupo(moveis){
    const abertos = moveis.filter(m=>!movelConcluido(m));
    if(!abertos.length) return null;
    const bloqueados = abertos.filter(m=>M.Store.bloqueiosMovel(m.id).length);
    const pool = bloqueados.length ? bloqueados : abertos;
    pool.sort((x,y)=> pos(x.etapa) - pos(y.etapa));
    return pool[0];
  }

  function pendenciasAbertasDe(obraId){
    return M.Store.state.pendencias.filter(p=> p.obraId===obraId && p.status!=="RESOLVIDA");
  }
  // FASE 2 (handoff): só as que realmente travam algo (impacto deriva
  // bloqueia fechamento) — distinto de "toda pendência aberta" acima, que
  // inclui Informativo/Não impede (não bloqueiam nada, só ficam registradas).
  function pendenciasBloqueantesDe(obraId){
    return pendenciasAbertasDe(obraId).filter(p=> M.bloqueiaFechamento(p.impacto));
  }

  // FASE 3 (handoff — Hoje/Produção macro): sinal de obra "parada", distinto
  // de risco. Risco pode ser só prazo apertado sem nada travado; "parada" é
  // ter pendência bloqueante aberta há muitos dias sem se mover — mesmo
  // limiar (5 dias) já usado em alertasGlobais para "móvel parado".
  function obraParada(o){
    return pendenciasBloqueantesDe(o.id).some(p=> diasDesde(p.abertura) >= 5);
  }
  function diasParada(o){
    const dias = pendenciasBloqueantesDe(o.id).map(p=> diasDesde(p.abertura));
    return dias.length ? Math.max(...dias) : 0;
  }

  // ============================================================
  // FASE 3 — regra de risco formal ("FASE 3 — DECISÕES APROVADAS COM
  // AJUSTES"). Corrige o bug antigo: a versão anterior tinha
  // `prog.pct>=90 → "BAIXO"`, um atalho que silenciava prazo/pendência já
  // problemáticos assim que a obra ficava fisicamente perto do fim.
  // Progresso NUNCA entra nesta cascata — só viaja como dado informativo em
  // `dados.progresso` (e no campo de compatibilidade `progresso`, ver
  // abaixo). Cada sinal (prazo, pendência por impacto, obra parada) é
  // independente; o PIOR nível entre eles vence (cumulativo, nunca soma).
  // Só avalia se a fase macro da obra tiver impactaRisco:true (ver
  // Store.faseMacroDeObra) — do contrário retorna "N/A" direto, sem olhar
  // pra mais nada.
  //
  // Limiares (2/7 dias "muito próxima"/"próxima", 5 dias "obra parada") não
  // são novos: já existiam em Calc.alertasGlobais/Calc.obraParada,
  // reaproveitados aqui pra manter uma única régua de urgência no sistema
  // inteiro, em vez de inventar uma terceira escala.
  //
  // "Ambiente travado" NÃO é uma checagem própria aqui, de propósito: no
  // modelo atual ela é sempre DERIVADA de uma pendência com impacto
  // BLOQUEIA_AMBIENTE, IMPEDE_FINALIZAR ou BLOQUEIA_OBRA (mesma fonte que
  // M.bloqueiaFechamento(impacto) já lê pra decidir Store.bloqueiosAmbiente/
  // situacaoAmbiente===TRAVADO) — checar por impacto abaixo já cobre isso.
  // Checar "ambiente travado" separadamente duplicaria o mesmo motivo sob
  // dois nomes diferentes, o que a "FASE 3 — DECISÕES APROVADAS" pediu
  // explicitamente pra evitar.
  // ============================================================
  const NIVEL_RISCO_ORDEM = {BAIXO:0, MEDIO:1, ALTO:2};
  function riscoObra(o){
    const fase = M.Store.faseMacroDeObra(o);
    const prog = progressoObra(o);
    const diasEntregaBase = diasAte(o.dataEntregaPrevista);
    const pendAbertasBase = pendenciasAbertasDe(o.id);

    if(!fase.impactaRisco){
      return {
        nivel:"N/A",
        motivos:[`Fase "${fase.label}" não é avaliada por risco`],
        // campos de compatibilidade (mesmo formato que os consumidores já
        // existentes — Obras/ObraDetail/Hoje/Dashboard/Produção — leem hoje):
        diasEntrega: diasEntregaBase, pendencias: pendAbertasBase.length, progresso: prog.pct,
        dados: {diasEntrega:diasEntregaBase, progresso:prog.pct, pendAbertas:pendAbertasBase.length, fase:fase.key, legado: !!fase.legado},
      };
    }

    const dias = diasEntregaBase;
    const bloqueiaObraList     = pendAbertasBase.filter(p=> p.impacto==="BLOQUEIA_OBRA");
    const bloqueiaAmbienteList = pendAbertasBase.filter(p=> p.impacto==="BLOQUEIA_AMBIENTE");
    const impedeFinalizarList  = pendAbertasBase.filter(p=> p.impacto==="IMPEDE_FINALIZAR");
    const parada = obraParada(o);

    const motivos = [];
    let nivel = "BAIXO";
    const bump = (n)=>{ if(NIVEL_RISCO_ORDEM[n] > NIVEL_RISCO_ORDEM[nivel]) nivel = n; };

    // --- prazo ---
    if(dias < 0){
      motivos.push(`Entrega vencida há ${-dias} dia(s)`);
      bump("ALTO");
    } else if(dias <= 2){
      // 0-2 dias sozinho é MÉDIO; só escala pra ALTO combinado com bloqueio/
      // travamento aberto (BLOQUEIA_AMBIENTE ou IMPEDE_FINALIZAR) — regra
      // explícita da "FASE 3 — DECISÕES APROVADAS", item 5.
      const temBloqueioAberto = bloqueiaAmbienteList.length>0 || impedeFinalizarList.length>0;
      motivos.push(`Entrega em ${dias===0?"hoje":dias+" dia(s)"}`);
      bump(temBloqueioAberto ? "ALTO" : "MEDIO");
    } else if(dias <= 7){
      motivos.push(`Entrega em ${dias} dia(s)`);
      bump("MEDIO");
    }

    // --- pendências, ponderadas pelo impacto real (nunca contagem crua) ---
    if(bloqueiaObraList.length){
      motivos.push(`${bloqueiaObraList.length} pendência(s) bloqueiam a obra: ${bloqueiaObraList.map(p=>p.categoria).join(", ")}`);
      bump("ALTO");
    }
    if(bloqueiaAmbienteList.length){
      motivos.push(`${bloqueiaAmbienteList.length} ambiente(s) travado(s) por pendência: ${bloqueiaAmbienteList.map(p=>(p.ambienteNome?p.ambienteNome+" — ":"")+p.categoria).join(", ")}`);
      bump("MEDIO"); // sozinho é MÉDIO — a escalada pra ALTO já foi tratada acima, junto do prazo
    }
    if(impedeFinalizarList.length){
      motivos.push(`${impedeFinalizarList.length} pendência(s) impedem finalizar: ${impedeFinalizarList.map(p=>p.categoria).join(", ")}`);
      bump("MEDIO");
    }

    // --- obra parada (pendência bloqueante aberta há muitos dias, sem se mover) ---
    if(parada){
      motivos.push(`Obra parada há ${diasParada(o)} dia(s) sem movimentação (pendência bloqueante aberta)`);
      bump("ALTO");
    }

    return {
      nivel, motivos,
      // campos de compatibilidade (mesmo formato que os consumidores já
      // existentes leem hoje — risco.diasEntrega/pendencias/progresso):
      diasEntrega: dias, pendencias: pendAbertasBase.length, progresso: prog.pct,
      dados: {
        diasEntrega: dias, progresso: prog.pct, pendAbertas: pendAbertasBase.length,
        pendPorImpacto: {bloqueiaObra:bloqueiaObraList.length, bloqueiaAmbiente:bloqueiaAmbienteList.length, impedeFinalizar:impedeFinalizarList.length},
        obraParada: parada, fase: fase.key,
      },
    };
  }

  // ---------- situação centralizada (Fase 1 — Fundação) ----------
  // Único lugar que decide o "tom" (cor semântica) de um móvel/obra. Antes,
  // Dashboard, Produção e Obra calculavam essa mesma coisa cada um do seu
  // jeito (ex.: `bloqueios.length?'critical':movelConcluido?'good':'neutral'`
  // repetido em duas páginas, e o mapeamento de cor de risco duplicado entre
  // ui.js e o Dashboard). Fase 1 só ORGANIZA a leitura do que já existe hoje
  // — não muda o modelo de dados nem introduz o status "Travado" de verdade
  // (isso é Fase 4 · Montagem, com motivo obrigatório por ambiente). O tom
  // "blocked" já existe aqui e no CSS (.chip.blocked/.dot.blocked/hachura)
  // pronto pra quando essa fase chegar.
  function situacaoMovel(m){
    const bloqueios = M.Store.bloqueiosMovel(m.id);
    if(bloqueios.length){
      return {key:"BLOQUEADO", label:"Bloqueado", tone:"critical", detalhe:bloqueios[0].categoria};
    }
    if(movelConcluido(m)){
      return {key:"CONCLUIDO", label:"Concluído", tone:"good"};
    }
    if(!m.dataReal && m.dataPrevista && diasAte(m.dataPrevista) < 0){
      return {key:"ATRASADO", label:`Atrasado ${-diasAte(m.dataPrevista)}d`, tone:"warning"};
    }
    const etapa = M.Store.etapaById(m.etapa);
    return {key:"EM_ANDAMENTO", label: etapa? (etapa.nomeCurto||etapa.nome) : "Em andamento", tone:"neutral"};
  }

  function situacaoObra(o){
    const r = riscoObra(o); // reaproveita o cálculo de risco já existente — não duplica
    // FASE 3 (ajuste pós-publicação): "N/A" (fase sem impactaRisco —
    // Aguardando Início, Concluída, ou dado legado sem faseMacro) usa um
    // rótulo curto e genérico — NÃO o motivo detalhado de riscoObra. Isso é
    // pedido explícito: motivos[] fica disponível em `dados`/`motivos` pra
    // quem quiser consumir, mas a UI de hoje (chip de risco) não deve expor
    // texto de motivo nenhuma — nem pra N/A, nem pra ALTO/MEDIO/BAIXO. Isso
    // fica pra quando a UI de Obras V2 tratar isso de propósito.
    const tonePorNivel = {ALTO:"critical", MEDIO:"warning", BAIXO:"good", "N/A":"neutral"};
    const labelNA = (r.dados && r.dados.legado) ? "Sem fase definida (dado legado)" : "Sem avaliação de risco";
    const labelPorNivel = {ALTO:"Risco alto", MEDIO:"Risco médio", BAIXO:"Risco baixo", "N/A": labelNA};
    return Object.assign({}, r, {tone: tonePorNivel[r.nivel]||"neutral", label: labelPorNivel[r.nivel]||r.nivel});
  }

  // ---------- situação de ambiente / Montagem V2 (Fase 5 — "ESTADOS
  // APROVADOS") ----------
  // 6 estados: NAO_INICIADO, EM_MONTAGEM, TRAVADO, PRONTO_PARA_FINALIZAR,
  // FINALIZADO, FINALIZADO_COM_RESSALVA. Fluxo principal: NAO_INICIADO →
  // EM_MONTAGEM → PRONTO_PARA_FINALIZAR → (aprovação) → FINALIZADO. TRAVADO
  // pode acontecer durante a execução; FINALIZADO_COM_RESSALVA é exceção
  // autorizada (ver Store.finalizarAmbiente).
  //
  // TODOS os estados continuam DERIVADOS daqui — nenhum é lido de um campo
  // "estado" solto no ambiente. O que MUDOU na Fase 5 em relação à Fase 4
  // (handoff) é que dois desses estados agora têm um SINALIZADOR persistido
  // por trás (a.montagemStatus:"PRONTO_PARA_FINALIZAR", só setado por
  // Store.finalizarAmbiente/aprovarFinalizacaoAmbiente) em vez de serem
  // 100% calculados a partir do progresso físico — porque a Fase 5 pediu uma
  // aprovação de verdade antes de virar "pronto" contar como qualquer coisa
  // perto de fechado (ver princípio no handoff: "PRONTO_PARA_FINALIZAR ainda
  // NÃO conta como ambiente fechado").
  //
  // "Travado" tem DUAS origens possíveis, nunca misturadas sob o mesmo
  // motivo genérico:
  //   1) pendência aberta com impacto que bloqueia fechamento (mesmo
  //      M.bloqueiaFechamento(impacto) de sempre — Store.bloqueiosAmbiente).
  //   2) travamento MANUAL (a.travamentoManual, Fase 5 — Store.
  //      marcarAmbienteTravado/destravarAmbiente) pra motivo operacional que
  //      não é uma pendência formal (ex.: "aguardando liberação do síndico",
  //      "equipe remanejada") — só existe pra cobrir a exceção real que
  //      "pendência" não cobre, não é uma categoria nova inventada: é a
  //      mesma ideia de TRAVADO, só que a ORIGEM do motivo é outra.
  //   Pendência SEMPRE tem prioridade de exibição sobre o manual quando as
  //   duas coexistem (é a fonte "oficial"/rastreável em Pendências V2).
  function situacaoAmbiente(a){
    // AJUSTE (últimos ajustes antes do push, item 2): a.montagemStatus usa a
    // MESMA nomenclatura canônica do `key` retornado aqui — FINALIZADO /
    // FINALIZADO_COM_RESSALVA — desde a padronização desta rodada (antes,
    // o campo persistido usava FINALIZADA/FINALIZADA_RESSALVA, e só esta
    // função "traduzia" pro nome canônico). Estado salvo ANTES dessa
    // padronização é migrado de forma explícita e única em
    // Store.migrarMontagemStatusLegado() (chamado no boot e após sincronizar
    // com o Supabase) — não há, e não deve haver, nenhuma tradução/inferência
    // de nome legado aqui ou em qualquer outro lugar de leitura.
    if(a.montagemStatus==="FINALIZADO_COM_RESSALVA"){
      return {key:"FINALIZADO_COM_RESSALVA", label:"Finalizado com ressalva", tone:"warning",
        motivo: a.montagemRessalva && a.montagemRessalva.motivo};
    }
    if(a.montagemStatus==="FINALIZADO"){
      return {key:"FINALIZADO", label:"Finalizado", tone:"good"};
    }
    const bloqueios = M.Store.bloqueiosAmbiente(a.id);
    if(bloqueios.length){
      return {key:"TRAVADO", label:"Travado", tone:"blocked", motivo: bloqueios[0].descricao||bloqueios[0].categoria, origem:"PENDENCIA", pendenciaId: bloqueios[0].id};
    }
    if(a.travamentoManual){
      return {key:"TRAVADO", label:"Travado", tone:"blocked", motivo: a.travamentoManual.motivo, origem:"MANUAL"};
    }
    if(a.montagemStatus==="PRONTO_PARA_FINALIZAR"){
      // AJUSTE VISUAL (rodada de ajustes, §7.4/§7.5): tone dedicado "pronto"
      // (preenchimento cheio, não pálido) — precisa ficar MUITO mais
      // evidente que EM_MONTAGEM, porque PRONTO ≠ FINALIZADO e alguém
      // precisa agir (aprovar).
      return {key:"PRONTO_PARA_FINALIZAR", label:"Pronto para finalizar", tone:"pronto", aguardandoAprovacao:true};
    }
    const prog = progressoAmbiente(a);
    if(!prog.total) return {key:"NAO_INICIADO", label:"Não iniciado", tone:"neutral"};
    // "fisicamente pronto" (100% dos móveis, sem bloqueio) é só um SINAL —
    // não vira estado PRONTO_PARA_FINALIZAR sozinho; alguém com
    // montagem.marcarPronto precisa confirmar (Store.marcarProntoAmbiente),
    // porque o handoff pediu explicitamente que essa transição
    // não seja automática ("Montador pode... quando permitido por
    // montagem.marcarPronto" — é uma ação, não um cálculo).
    const prontoParaMarcar = prog.pct>=100 && !bloqueios.length && !a.travamentoManual;
    const iniciou = !!a.montagemInicioReal || a.moveis.some(m=> pos(m.etapa) >= pos("ENTREGA"));
    if(!iniciou) return {key:"NAO_INICIADO", label:"Não iniciado", tone:"neutral", prontoParaMarcar};
    // AJUSTE VISUAL: tone "info" (azul discreto) em vez de "neutral" —
    // §7.4 pede "azul/grafite discreto, sem grande bloco colorido" pra
    // diferenciar visualmente de NAO_INICIADO sem virar um bloco chamativo.
    return {key:"EM_MONTAGEM", label:"Em montagem", tone:"info", prontoParaMarcar};
  }

  // "Fim real da montagem" (Fase 5, §9): NÃO é quando todos estão
  // PRONTO_PARA_FINALIZAR — só quando todo ambiente está FINALIZADO ou
  // FINALIZADO_COM_RESSALVA (aprovação já concluída pra cada um). Sem
  // conceito de "ambiente opcional" no modelo hoje, então "obrigatórios" =
  // todos os ambientes da obra.
  function montagemFinalizadaObra(o){
    if(!o.ambientes.length) return {finalizada:false, abertos:[]};
    const abertos = o.ambientes.filter(a=>{
      const k = situacaoAmbiente(a).key;
      return k!=="FINALIZADO" && k!=="FINALIZADO_COM_RESSALVA";
    });
    return {finalizada: abertos.length===0, abertos: abertos.map(a=>a.nome)};
  }

  // Contadores operacionais (Fase 5, §8: "preferir contagens operacionais" a
  // gap de pontos) — pra UMA obra ou uma carteira, sempre os mesmos 6 baldes.
  function contadoresMontagem(obras){
    const c = {naoIniciados:0, emMontagem:0, travados:0, prontosParaFinalizar:0, finalizados:0, finalizadosComRessalva:0, total:0};
    obras.forEach(o=> o.ambientes.forEach(a=>{
      c.total++;
      const k = situacaoAmbiente(a).key;
      if(k==="NAO_INICIADO") c.naoIniciados++;
      else if(k==="EM_MONTAGEM") c.emMontagem++;
      else if(k==="TRAVADO") c.travados++;
      else if(k==="PRONTO_PARA_FINALIZAR") c.prontosParaFinalizar++;
      else if(k==="FINALIZADO") c.finalizados++;
      else if(k==="FINALIZADO_COM_RESSALVA") c.finalizadosComRessalva++;
    }));
    return c;
  }

  // "Progresso físico" × "taxa de fechamento" — SEMPRE dois números, nunca
  // somados (handoff: "a diferença entre os dois é o esforço espalhado").
  // Físico = fração dos MÓVEIS que já chegaram fisicamente na etapa Montagem
  // ou além (quanto já foi produzido/instalado). Fechamento = fração dos
  // AMBIENTES formalmente finalizados (Store.marcarProntoAmbiente +
  // Store.aprovarFinalizacaoAmbiente) — auditado,
  // não autodeclarado (handoff: "o montador solicita, o líder confirma").
  function progressoFisicoMontagem(o){
    const allM = o.ambientes.flatMap(a=>a.moveis);
    if(!allM.length) return 0;
    const posMontagem = pos("MONTAGEM");
    return Math.round(100*allM.filter(m=> pos(m.etapa) >= posMontagem).length/allM.length);
  }
  function taxaFechamento(o){
    if(!o.ambientes.length) return 0;
    const finalizados = o.ambientes.filter(a=> a.montagemStatus==="FINALIZADO"||a.montagemStatus==="FINALIZADO_COM_RESSALVA").length;
    return Math.round(100*finalizados/o.ambientes.length);
  }
  // agrega físico × fechamento pra uma CARTEIRA de obras (tela de Montagem,
  // que não é uma única obra) — soma itens/ambientes em vez de calcular a
  // média das porcentagens por obra, pra não distorcer obras pequenas.
  function agregarMontagem(obras){
    let totalM=0, montados=0, totalA=0, finalizados=0, iniciados=0;
    const posMontagem = pos("MONTAGEM");
    obras.forEach(o=> o.ambientes.forEach(a=>{
      totalA++;
      if(a.montagemStatus==="FINALIZADO"||a.montagemStatus==="FINALIZADO_COM_RESSALVA") finalizados++;
      if(situacaoAmbiente(a).key!=="NAO_INICIADO") iniciados++;
      a.moveis.forEach(m=>{ totalM++; if(pos(m.etapa)>=posMontagem) montados++; });
    }));
    return {
      fisico: totalM? Math.round(100*montados/totalM):0,
      fechamento: totalA? Math.round(100*finalizados/totalA):0,
      ambientesIniciados: iniciados, ambientesTotal: totalA, ambientesFinalizados: finalizados,
    };
  }

  // "Prioridade para finalizar" (handoff): ambientes ordenados por proximidade
  // do fechamento — poucos itens faltando primeiro. Ambientes com 3+ itens
  // faltando "não são candidatos hoje" (citação literal do handoff) e ficam de
  // fora; um ambiente TRAVADO continua na lista se estiver perto do fim — é
  // justamente o que precisa de decisão agora.
  function prioridadeParaFinalizar(obras){
    const linhas = [];
    obras.forEach(o=>{
      const gruposFalta = paraFinalizar(o);
      o.ambientes.forEach(a=>{
        const sit = situacaoAmbiente(a);
        if(sit.key==="NAO_INICIADO" || sit.key==="FINALIZADO" || sit.key==="FINALIZADO_COM_RESSALVA") return;
        const grupo = gruposFalta.find(g=>g.ambienteNome===a.nome);
        const itensFaltando = grupo ? grupo.itens.length : 0;
        if(itensFaltando>=3) return; // não é candidato hoje
        linhas.push({o, a, sit, itensFaltando, itens: grupo?grupo.itens:[], pct: progressoAmbiente(a).pct});
      });
    });
    linhas.sort((x,y)=> x.itensFaltando - y.itensFaltando || y.pct - x.pct);
    return linhas;
  }

  function wipPorEtapa(){
    const etapas = M.Store.etapasOrdenadas();
    const rows = etapas.map(e=>({etapa:e.id, label:e.nomeCurto||e.nome, qtd:0, valor:0}));
    const byId = {}; rows.forEach(r=> byId[r.etapa]=r);
    M.Store.allMoveis().forEach(({m})=>{
      if(m.etapa==="FINALIZADA") return;
      const r = byId[m.etapa];
      if(r){ r.qtd++; r.valor += (m.valorLiquido||0); }
    });
    return rows;
  }

  function indicadores(){
    let liberado=0, produzido=0, entregue=0, montado=0, emProducao=0, aguardandoMontagem=0;
    let moveisProduzidos=0;
    const pLiberada = pos("LIBERADA"), pEmbalagem = pos("EMBALAGEM"), pEntrega = pos("ENTREGA"),
          pMontagem = pos("MONTAGEM"), pCorte = pos("CORTE");
    M.Store.allMoveis().forEach(({m})=>{
      const v = m.valorLiquido||0;
      const pm = pos(m.etapa);
      if(pm>=pLiberada) liberado += v;
      if(pm>=pEmbalagem){ produzido += v; moveisProduzidos++; }
      if(pm>=pEntrega) entregue += v;
      if(pm>=pMontagem) montado += v;
      if(pm>=pCorte && pm<pEmbalagem) emProducao += v;
      if(m.etapa==="ENTREGA") aguardandoMontagem += v;
    });
    return {liberado, produzido, entregue, montado, emProducao, aguardandoMontagem, moveisProduzidos};
  }

  function parseHora(hhmm){ if(!hhmm) return null; const [h,m] = hhmm.split(":").map(Number); return h*60+m; }
  function duracaoHoras(t){
    const i = parseHora(t.inicio), f = parseHora(t.fim);
    if(i==null || f==null) return 0;
    return Math.max(0, (f-i)/60);
  }

  function valorProcessadoTarefa(t){
    if(t.status!=="CONCLUIDA" || !t.movelId || !t.etapa) return 0;
    const f = M.Store.findMovel(t.movelId); if(!f) return 0;
    const et = M.Store.etapaById(t.etapa);
    const peso = (et && et.pesoValorProcessado || 0)/100;
    return Math.round((f.m.valorLiquido||0) * peso);
  }

  function desempenhoColaborador(nome){
    const tarefas = M.Store.state.tarefas.filter(t=> (t.executadoPor===nome));
    const concluidas = tarefas.filter(t=>t.status==="CONCLUIDA");
    const obras = new Set(tarefas.map(t=>t.obraId));
    const ambientes = new Set(tarefas.filter(t=>t.ambienteId).map(t=>t.ambienteId));
    const valorProcessado = concluidas.reduce((s,t)=> s+valorProcessadoTarefa(t), 0);
    const horas = concluidas.reduce((s,t)=> s+duracaoHoras(t), 0);
    const refacoes = tarefas.filter(t=> t.tipo==="REFACAO" || t.resultado==="GEROU_REFACAO").length;
    const comRessalva = concluidas.filter(t=>t.resultado==="COM_RESSALVA").length;
    const ok = concluidas.filter(t=>t.resultado==="OK").length;
    const noPrazoPct = concluidas.length ? Math.round(100*(concluidas.length-comRessalva-refacoes>0?concluidas.length-comRessalva:concluidas.length)/Math.max(1,concluidas.length)) : 0;
    return {
      nome, tarefasConcluidas:concluidas.length, tarefasTotal:tarefas.length,
      obrasTrabalhadas:obras.size, ambientesTrabalhados:ambientes.size,
      valorProcessado, horas: Math.round(horas*10)/10, refacoes, comRessalva, ok,
      noPrazoPct: Math.min(100, Math.max(0, 100 - (refacoes*6) - (comRessalva*3))),
    };
  }

  // CORREÇÃO (auditoria UI/UX #78): antes retornava uma lista plana de frases
  // por obra — numa obra com vários ambientes ficava difícil saber ONDE cada
  // pendência estava. Agora agrupa OBRA (já é o parâmetro `o`) → AMBIENTE →
  // ITEM, como pedido na auditoria funcional, com frases executáveis (dizem
  // o que fazer, não só o que falta). Quem chama itera os grupos; use
  // paraFinalizarTotal(o) pra contar o total de itens (não o nº de grupos).
  function paraFinalizar(o){
    const grupos = [];
    o.ambientes.forEach(a=>{
      const itens = [];
      a.moveis.forEach(m=>{
        const bloqueiosM = M.Store.bloqueiosMovel(m.id);
        bloqueiosM.forEach(p=> itens.push(`Resolver pendência de "${m.nome}": ${p.descricao || p.categoria}`));
        if(m.ressalvaAberta && m.ressalva){
          const pend = (m.ressalva.itensPendentes||[]).join(", ") || "itens da liberação excepcional não resolvidos";
          itens.push(`Regularizar ressalva de "${m.nome}" (avançou para ${M.Store.etapaById(m.ressalva.etapa).nome} sem concluir): ${pend}`);
        }
        // plano "obra no centro": componente AGUARDANDO/REFACAO já tem pendência
        // real vinculada (Store.criarComponenteCritico) — essa pendência já apareceu
        // acima via bloqueiosM. Só entra aqui de novo o componente sem pendência
        // vinculada (não deveria mais acontecer, mas evita duplicar se acontecer).
        m.componentesCriticos.forEach(c=>{
          if(c.pendenciaId) return;
          if(c.status==="AGUARDANDO") itens.push(`Receber/liberar "${c.nome}" (${c.tipo.toLowerCase()}) de "${m.nome}"`);
          if(c.status==="REFACAO") itens.push(`Refazer "${c.nome}" de "${m.nome}" (retrabalho)`);
        });
        if(!movelConcluido(m) && !bloqueiosM.length){
          // checklist de componentes virou Tarefa (item 9) — o que falta aqui
          // agora é olhar as tarefas do móvel ainda não concluídas.
          const missing = M.Store.state.tarefas.filter(t=>t.movelId===m.id && t.status!=="CONCLUIDA");
          if(missing.length) itens.push(`Concluir em "${m.nome}": ${missing.map(x=>x.titulo).join(", ")}`);
        }
        // "concluída com pendências" continua aparecendo aqui até alguém
        // resolver de verdade — encerrar a montagem não some com a pendência.
        if(m.montagemEncerramento && m.montagemEncerramento.status==="CONCLUIDA_COM_PENDENCIAS"){
          const reais = m.montagemEncerramento.itensPendentesReais||[];
          itens.push(`Regularizar montagem de "${m.nome}" (encerrada com pendências): ${reais.length? reais.join("; ") : "verificar pendências registradas manualmente na conferência final"}`);
        }
      });
      if(itens.length) grupos.push({ambienteNome:a.nome, itens});
    });
    return grupos;
  }
  function paraFinalizarTotal(o){
    return paraFinalizar(o).reduce((s,g)=>s+g.itens.length, 0);
  }

  function alertasGlobais(){
    const alerts = [];
    M.Store.state.pendencias.filter(p=>p.status!=="RESOLVIDA").forEach(p=>{
      const dias = diasDesde(p.abertura);
      const atrasoPrazo = p.prazo ? diasAte(p.prazo) : null;
      const urgente = (atrasoPrazo!=null && atrasoPrazo<=0);
      alerts.push({tipo: urgente?"URGENTE":"PENDENCIA", sev: urgente?"critical":"warning",
        texto:`${p.categoria} — ${p.movelNome} (${p.obraNome})`,
        sub:`${p.descricao} · aberta há ${dias}d${p.prazo? " · prazo "+fmtDate(p.prazo):""}`,
        ordem: urgente? 0-dias : 50-dias});
    });
    M.Store.allMoveis().forEach(({o,a,m})=>{
      if(movelConcluido(m)) return;
      const dias = diasDesde(m.dataEntradaEtapa);
      if(dias>=5){
        const etAtual = M.Store.etapaById(m.etapa);
        alerts.push({tipo:"ATRASO", iconKey:"clock", texto:`${m.nome} parado há ${dias}d em "${etAtual.nome}"`, sub:`${o.cliente} · ${a.nome} · resp. ${m.responsavel}`, ordem:40-dias});
      }
      m.componentesCriticos.forEach(c=>{
        if(c.status==="REFACAO"){
          alerts.push({tipo:"REFACAO", iconKey:"wrench", texto:`${c.nome} precisa ser refeita — ${m.nome}`, sub:`${o.cliente} · motivo: ${c.motivo||"-"} · prazo ${c.prazo==M.todayISO()?"hoje":fmtDate(c.prazo)}`, ordem:-10});
        }
      });
    });
    state_entregas: {
      M.Store.state.obras.forEach(o=>{
        const dias = diasAte(o.dataEntregaPrevista);
        if(dias>=0 && dias<=7 && o.status!=="FINALIZADA"){
          alerts.push({tipo:"ENTREGA", sev: dias<=2?"critical":"warning", texto:`Entrega de ${o.cliente} em ${dias===0?"hoje":dias+" dia(s)"}`, sub:`${o.numeroOS}`, ordem:20-dias});
        }
      });
    }
    alerts.sort((x,y)=>x.ordem-y.ordem);
    return alerts;
  }

  // ---------- índice de desempenho + ranking (seções 35-37, 71) ----------
  function pendenciasDoColaborador(nome){
    const todas = M.Store.state.pendencias.filter(p=>p.responsavel===nome);
    const resolvidas = todas.filter(p=>p.status==="RESOLVIDA");
    const abertas = todas.filter(p=>p.status!=="RESOLVIDA");
    const atrasadas = abertas.filter(p=> p.prazo && diasAte(p.prazo)<0);
    const reabertasHist = M.Store.state.historico.filter(h=> h.tipo==="PENDENCIA_REABERTA" && h.descricao && todas.some(p=>h.descricao.includes(p.descricao))).length;
    const temposDias = resolvidas.map(p=> diasDesde(p.abertura)).filter(d=>d>=0);
    const tempoMedioDias = temposDias.length ? Math.round((temposDias.reduce((s,d)=>s+d,0)/temposDias.length)*10)/10 : null;
    return {
      pendTotal: todas.length, total: todas.length, pendResolvidas: resolvidas.length, pendAtrasadas: atrasadas.length,
      noPrazo: resolvidas.length, reincidencias: reabertasHist,
      tempoMedioDias, indiceResolucao: todas.length? Math.round(100*resolvidas.length/todas.length):0,
    };
  }

  function indiceDesempenho(nome){
    const base = desempenhoColaborador(nome);
    const pend = pendenciasDoColaborador(nome);
    const pesos = M.Store.state.pesosDesempenho;
    const normValorProc = Math.min(100, Math.round((base.valorProcessado/25000)*100));
    const normPontual = base.noPrazoPct;
    const normQualidade = base.tarefasConcluidas ? Math.round(100*base.ok/Math.max(1,base.tarefasConcluidas)) : 100;
    const normPendencias = pend.total ? Math.round(100*pend.pendResolvidas/Math.max(1,pend.total)) : 100;
    const normVelocidade = pend.tempoMedioDias!=null ? Math.max(0,Math.min(100, Math.round(100 - (pend.tempoMedioDias-1)*12))) : 100;
    const normParticipacao = Math.min(100, Math.round((base.obrasTrabalhadas/4)*100));
    const indice = Math.round(
      (normValorProc*pesos.valorProcessado + normPontual*pesos.pontualidade + normQualidade*pesos.qualidade +
       normPendencias*pesos.pendencias + normVelocidade*pesos.velocidadeResolucao + normParticipacao*pesos.participacao) / 100
    );
    return Object.assign({}, base, pend, {
      indice: Math.max(0, Math.min(100, indice)),
      normValorProc, normPontual, normQualidade, normPendencias, normVelocidade, normParticipacao,
    });
  }

  function rankingColaboradores(){
    const nomes = M.COLABORADORES.filter(c=>c.perfil==="OPERADOR"||c.perfil==="MONTADOR").map(c=>c.nome);
    return nomes.map(indiceDesempenho).sort((a,b)=> b.indice-a.indice);
  }

  // ---------- assistências (seção 44-47) ----------
  function assistenciasResumo(){
    const all = M.Store.state.assistencias;
    const abertas = all.filter(a=>a.status!=="CONCLUIDA");
    const vencidas = abertas.filter(a=> a.prazo && diasAte(a.prazo)<0);
    // Fase 5 (handoff, wireframe "3c Assistência — painel pós-entrega"):
    // "14 solicitações abertas / 3 atrasadas / 4 aguardando peça / 5 agendadas
    // esta semana" e "6 chamados ativos · 2 com retorno necessário".
    const aguardandoPeca = abertas.filter(a=>a.status==="AGUARDANDO_MATERIAL").length;
    const agendadas = abertas.filter(a=>a.status==="AGENDADA").length;
    const comRetorno = abertas.filter(a=>{
      const v = a.visitas && a.visitas.length? a.visitas[a.visitas.length-1] : null;
      return v && v.desfecho==="RETORNO_NECESSARIO";
    }).length;
    return {total:all.length, abertas:abertas.length, vencidas:vencidas.length, concluidas: all.length-abertas.length,
      aguardandoPeca, agendadas, comRetorno};
  }

  // ---------- auditoria (seção 48-52) ----------
  function auditoriaResumo(dias){
    dias = dias || 30;
    const limite = M.dOff(-dias);
    const eventos = M.Store.state.auditoria.filter(a=> a.data >= limite);
    const porTipo = (tipo)=> eventos.filter(e=>e.tipo===tipo).length;
    const pendVencidas = M.Store.state.pendencias.filter(p=> p.status!=="RESOLVIDA" && p.prazo && diasAte(p.prazo)<0).length;
    return {
      total: eventos.length,
      avancosRessalva: porTipo("AVANCO_COM_RESSALVA"),
      pendenciasVencidas: pendVencidas,
      pendenciasReabertas: porTipo("PENDENCIA_REABERTA"),
      retrabalhos: porTipo("RETRABALHO"),
      assistencias: porTipo("ASSISTENCIA_ABERTA"),
      alteracoesCriticas: eventos.filter(e=>e.categoria==="GOVERNANCA").length,
      eventos,
    };
  }

  // ---------- produção do dia por etapa (Dashboard · "Produção de hoje") ----------
  function producaoHoje(){
    const hoje = M.todayISO();
    const etapas = M.Store.etapasOrdenadas().filter(e=>e.id!=="FINALIZADA");
    const rows = etapas.map(e=>({etapa:e.id, label:e.nomeCurto||e.nome, total:0, concluidas:0}));
    const byId = {}; rows.forEach(r=> byId[r.etapa]=r);
    M.Store.state.tarefas.forEach(t=>{
      if(t.data!==hoje) return;
      const r = byId[t.etapa]; if(!r) return;
      r.total++;
      if(t.status==="CONCLUIDA") r.concluidas++;
    });
    const withData = rows.filter(r=>r.total>0).map(r=> Object.assign({}, r, {pct: r.total? Math.round(100*r.concluidas/r.total):0}));
    const totalConcl = withData.reduce((s,r)=>s+r.concluidas,0);
    const totalAll = withData.reduce((s,r)=>s+r.total,0);
    return {rows: withData, pctGeral: totalAll? Math.round(100*totalConcl/totalAll):0, totalConcl, totalAll};
  }

  // ---------- meta mensal (seção 67) ----------
  function metaMensalProgresso(){
    const meta = M.Store.state.metaMensal.valor;
    const realizado = indicadores().produzido;
    const pct = meta? Math.min(100, Math.round(100*realizado/meta)) : 0;
    return {meta, realizado, pct, restante: Math.max(0, meta-realizado)};
  }

  // ---------- origem do problema (seção 47/52) ----------
  function origemProblemaResumo(){
    const out = {};
    M.ORIGENS_PROBLEMA.forEach(o=> out[o]=0);
    M.Store.state.tarefas.forEach(t=>{ if(t.origemProblema) out[t.origemProblema]=(out[t.origemProblema]||0)+1; });
    M.Store.state.assistencias.forEach(a=>{ if(a.origem) out[a.origem]=(out[a.origem]||0)+1; });
    return Object.entries(out).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  }

  // ---------- TV da fábrica — 3 modos (Fase 6 — handoff) ----------
  // TV1 "Produção": os mesmos 5 números do painel macro de Produção (Fase 3),
  // recalculados aqui (não importados de pages/producao.js, que é local à
  // página) + "prioridades do dia" — até 4 obras que mais exigem ação agora.
  // Identifica obra por número de OS, nunca por nome do cliente — a TV fica
  // num painel de parede visível a qualquer um no chão de fábrica.
  function tvResumoProducao(){
    const obras = M.Store.state.obras;
    const emProducao = obras.filter(o=> o.status!=="FINALIZADA");
    // FASE 3: "N/A" (fase sem impactaRisco) não é risco — checa ALTO/MEDIO
    // explicitamente, em vez de "!=='BAIXO'" (que passaria a contar N/A como
    // risco também, o que não é o que "em risco" quer dizer).
    const emRisco = obras.filter(o=> ["ALTO","MEDIO"].includes(situacaoObra(o).nivel));
    const paradas = obras.filter(o=> obraParada(o));
    const bloqueios = obras.reduce((s,o)=> s + pendenciasBloqueantesDe(o.id).length, 0);
    const entregas7d = obras.filter(o=> o.status!=="FINALIZADA" && diasAte(o.dataEntregaPrevista)>=0 && diasAte(o.dataEntregaPrevista)<=7);
    const candidatas = obras.filter(o=> o.status!=="FINALIZADA" && (obraParada(o) || situacaoObra(o).nivel==="ALTO" ||
      (diasAte(o.dataEntregaPrevista)>=0 && diasAte(o.dataEntregaPrevista)<=7 && pendenciasAbertasDe(o.id).length)));
    candidatas.sort((x,y)=>{
      const px = obraParada(x)?diasParada(x):0, py = obraParada(y)?diasParada(y):0;
      if(px!==py) return py-px;
      return diasAte(x.dataEntregaPrevista) - diasAte(y.dataEntregaPrevista);
    });
    const prioridades = candidatas.slice(0,4).map(o=>{
      const dEntrega = diasAte(o.dataEntregaPrevista);
      let motivo;
      if(obraParada(o)){
        const bloq = pendenciasBloqueantesDe(o.id)[0];
        motivo = `Parada há ${diasParada(o)} dia(s)${bloq? " · "+bloq.categoria : ""}`;
      } else if(dEntrega<0){
        const travados = o.ambientes.filter(a=> situacaoAmbiente(a).key==="TRAVADO").length;
        motivo = `Atraso ${-dEntrega} dia(s)${travados? ` · ${travados} ambiente(s) travado(s)`:""}`;
      } else {
        const pend = pendenciasAbertasDe(o.id).length;
        motivo = `Entrega em ${dEntrega} dia(s)${pend? ` · ${pend} pendência(s) aberta(s)`:""}`;
      }
      return {obraId:o.id, numeroOS:o.numeroOS, motivo};
    });
    return {emProducao:emProducao.length, emRisco:emRisco.length, paradas:paradas.length, bloqueios, entregas7d:entregas7d.length, prioridades};
  }

  // TV3 "Atenção": até 4 itens que travam fechamento agora. Regra de
  // privacidade do handoff (citação literal): "Responsável aparece por
  // função (PCP, Compras, Projeto), não por pessoa — evita exposição no chão
  // de fábrica" + "Sem dado de cliente, valor ou contato nesta tela".
  function tvAtencaoItens(){
    const pend = M.Store.state.pendencias.filter(p=> p.status!=="RESOLVIDA" && M.bloqueiaFechamento(p.impacto));
    const comPrazo = pend.map(p=> Object.assign({_dias: p.prazo? diasAte(p.prazo) : 999}, p));
    comPrazo.sort((x,y)=> x._dias - y._dias);
    return comPrazo.slice(0,4).map(p=>{
      const obra = M.Store.getObra(p.obraId);
      const colab = M.colabByNome(p.responsavel);
      const funcao = colab? M.perfilDef(colab.perfil).label : "—";
      const prazoTxt = !p.prazo? "sem prazo" : p._dias<0? "Venceu" : p._dias===0? "Hoje" : p._dias===1? "Amanhã" : fmtDate(p.prazo);
      return {
        obraLabel: obra? obra.numeroOS : "—",
        local: [p.ambienteNome, p.movelNome].filter(Boolean).join(" · "),
        descricao: p.descricao||p.categoria,
        funcao, prazoTxt,
      };
    });
  }

  // FASE 4 (§8 handoff): ordem EXATA de prioridade — "a UI deve conseguir
  // explicar por que algo está no topo", nada de score obscuro. 5 critérios,
  // cada um só desempata o anterior:
  //   1. BLOQUEIA_OBRA  2. BLOQUEIA_AMBIENTE  3. IMPEDE_FINALIZAR
  //   4. antiguidade (mais dias em aberto primeiro)
  //   5. proximidade do prazo de entrega da OBRA (não da pendência)
  // NAO_IMPEDE/INFORMATIVO caem nos mesmos 3 primeiros critérios via
  // IMPACTO_SEVERIDADE (já ordenados depois de IMPEDE_FINALIZAR).
  // "Resolvidas por último" continua sendo aplicado por fora, como já era
  // (não é um dos 5 critérios do handoff, é convenção de exibição da lista).
  function compararPrioridadePendencia(a, b){
    const sa = M.IMPACTO_SEVERIDADE[a.impacto] ?? 9, sb = M.IMPACTO_SEVERIDADE[b.impacto] ?? 9;
    if(sa!==sb) return sa-sb;
    const da = diasDesde(a.abertura), db = diasDesde(b.abertura);
    if(da!==db) return db-da; // mais antiga primeiro
    const oa = M.Store.getObra(a.obraId), ob = M.Store.getObra(b.obraId);
    const pa = oa ? diasAte(oa.dataEntregaPrevista) : 9999, pb = ob ? diasAte(ob.dataEntregaPrevista) : 9999;
    return pa-pb; // prazo da obra mais próximo primeiro
  }

  M.Calc = {
    fmtBRL, fmtBRLk, fmtDate, fmtPct, daysBetween, diasDesde, diasAte,
    compararPrioridadePendencia,
    movelConcluido, progressoGrupo, progressoObra, progressoAmbiente,
    itemCriticoGrupo, pendenciasAbertasDe, pendenciasBloqueantesDe, riscoObra, obraParada, diasParada, situacaoMovel, situacaoObra, wipPorEtapa, indicadores,
    situacaoAmbiente, progressoFisicoMontagem, taxaFechamento, agregarMontagem, prioridadeParaFinalizar,
    montagemFinalizadaObra, contadoresMontagem,
    parseHora, duracaoHoras, valorProcessadoTarefa, desempenhoColaborador,
    paraFinalizar, paraFinalizarTotal, alertasGlobais,
    indiceDesempenho, pendenciasDoColaborador, rankingColaboradores,
    assistenciasResumo, auditoriaResumo, metaMensalProgresso, origemProblemaResumo,
    producaoHoje, tvResumoProducao, tvAtencaoItens,
  };
})();
