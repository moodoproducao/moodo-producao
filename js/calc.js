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

  function riscoObra(o){
    const prog = progressoObra(o);
    const diasEntrega = diasAte(o.dataEntregaPrevista);
    const pend = pendenciasAbertasDe(o.id).length;
    let nivel;
    if(diasEntrega < 0 || pend >= 4) nivel = "ALTO";
    else if(prog.pct >= 90) nivel = "BAIXO";
    else if(pend >= 2 || diasEntrega <= 7) nivel = "MEDIO";
    else nivel = "BAIXO";
    return {nivel, diasEntrega, pendencias:pend, progresso:prog.pct};
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

  function periodoMesAtual(){
    const inicio = M.todayISO().slice(0,7) + "-01";
    const [ano, mes] = inicio.split("-").map(Number);
    const proximo = new Date(ano, mes, 1);
    const fim = `${proximo.getFullYear()}-${String(proximo.getMonth()+1).padStart(2,"0")}-01`;
    return {inicio, fim};
  }
  function dataPrimeiraPassagem(m, etapaMarco){
    const marco = pos(etapaMarco);
    const historico = Array.isArray(m.historicoEtapas) && m.historicoEtapas.length
      ? m.historicoEtapas
      : [{de:null, para:m.etapa, data:m.dataEntradaEtapa}];
    return historico
      .filter(h=>h && h.data && pos(h.para)>=marco)
      .slice()
      .sort((a,b)=>`${a.data} ${a.hora||""}`.localeCompare(`${b.data} ${b.hora||""}`))[0]?.data || null;
  }
  function dentroDoPeriodo(data, periodo){
    return !!data && data>=periodo.inicio && data<periodo.fim;
  }

  function indicadores(periodo){
    periodo = periodo || periodoMesAtual();
    let liberado=0, produzido=0, entregue=0, montado=0, emProducao=0, aguardandoMontagem=0;
    let moveisProduzidos=0;
    const pLiberada = pos("LIBERADA"), pEmbalagem = pos("EMBALAGEM"), pEntrega = pos("ENTREGA"),
          pMontagem = pos("MONTAGEM"), pCorte = pos("CORTE");
    M.Store.allMoveis().forEach(({m})=>{
      const v = m.valorLiquido||0;
      const pm = pos(m.etapa);
      if(dentroDoPeriodo(dataPrimeiraPassagem(m,"LIBERADA"), periodo)) liberado += v;
      if(dentroDoPeriodo(dataPrimeiraPassagem(m,"EMBALAGEM"), periodo)){ produzido += v; moveisProduzidos++; }
      if(dentroDoPeriodo(dataPrimeiraPassagem(m,"ENTREGA"), periodo)) entregue += v;
      if(dentroDoPeriodo(dataPrimeiraPassagem(m,"MONTAGEM"), periodo)) montado += v;
      if(pm>=pCorte && pm<pEmbalagem) emProducao += v;
      if(m.etapa==="ENTREGA") aguardandoMontagem += v;
    });
    return {liberado, produzido, entregue, montado, emProducao, aguardandoMontagem, moveisProduzidos, periodo};
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
    return {total:all.length, abertas:abertas.length, vencidas:vencidas.length, concluidas: all.length-abertas.length};
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

  M.Calc = {
    fmtBRL, fmtBRLk, fmtDate, fmtPct, daysBetween, diasDesde, diasAte,
    movelConcluido, progressoGrupo, progressoObra, progressoAmbiente,
    itemCriticoGrupo, pendenciasAbertasDe, riscoObra, wipPorEtapa, indicadores,
    parseHora, duracaoHoras, valorProcessadoTarefa, desempenhoColaborador,
    paraFinalizar, paraFinalizarTotal, alertasGlobais,
    indiceDesempenho, pendenciasDoColaborador, rankingColaboradores,
    assistenciasResumo, auditoriaResumo, metaMensalProgresso, origemProblemaResumo, periodoMesAtual,
    producaoHoje,
  };
})();
