/* ============================================================
   PÁGINA: Montagem V2 — "o que falta finalizar?" (Fase 5)
   ============================================================
   Objetivo (handoff Fase 5 §1): deixar muito claro o que está em montagem,
   o que está travado, o que está pronto para finalizar, o que realmente foi
   finalizado, o que falta para encerrar uma obra, e quem precisa agir.
   MACRO POR PADRÃO, MICRO POR EXCEÇÃO — isto não é um PCP de peça: a fila
   principal é por AMBIENTE (macro), a tabela de móveis (micro) fica
   deliberadamente por último, de tamanho reduzido, "por exceção".
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  const CHECKLIST_ENCERRAMENTO = [
    "Todos os móveis instalados","Portas reguladas","Gavetas reguladas","Ferragens conferidas",
    "Limpeza","Fotos finais","Conferência final","Pendências registradas",
  ];

  // ---------- cartão de ambiente (unidade central da fila — §12) ----------
  // Mostra sempre: obra · ambiente · estado · travamento (se houver) ·
  // pendências relevantes · UM próximo passo claro. Nunca um número solto
  // sem ação atrás.
  function proximoPassoHtml(o, a, sit){
    // AJUSTE (rodada de ajustes) — permissões granulares, uma por ação.
    // iniciar/travar/destravar não reaproveitam mais montagem.marcarPronto
    // (eram a mesma chave antes; agora são independentes — ver M.PERFIS).
    const podeIniciar = M.Store.pode("montagem.iniciar");
    const podeTravar = M.Store.pode("montagem.travar");
    const podeDestravar = M.Store.pode("montagem.destravar");
    const podeMarcarPronto = M.Store.pode("montagem.marcarPronto");
    const podeAprovar = M.Store.pode("montagem.aprovarFinalizacao");
    const btnPend = M.Store.pode("pendencia.criar")
      ? `<button class="btn sm ghost" onclick="Act.openPendenciaForm('${o.id}','${a.id}')">${UI.icon('alert',12)} + Pendência</button>` : "";
    if(sit.key==="TRAVADO"){
      if(sit.origem==="MANUAL" && podeDestravar){
        return `<button class="btn sm primary" onclick="Act.destravarAmbiente('${a.id}')">${UI.icon('lock',12)} Destravar</button>${btnPend}`;
      }
      // travado por pendência: a única saída real é resolver a pendência —
      // não existe "destravar" que não seja isso (senão o motivo mostrado
      // deixaria de ser verdade).
      return `<a class="btn sm" href="#/pendencias">${UI.icon('lock',12)} Ver pendência</a>${btnPend}`;
    }
    if(sit.key==="PRONTO_PARA_FINALIZAR"){
      // §5/§7.5 (rodada de ajustes): PRONTO ≠ FINALIZADO. Quem aprova vê a
      // ação; quem não aprova vê só o estado — nunca um botão desabilitado.
      if(podeAprovar) return `<button class="btn sm primary" onclick="Act.aprovarFinalizacaoAmbiente('${a.id}')">${UI.icon('check-circle',12)} Aprovar finalização</button>${btnPend}`;
      return `<span class="chip info">${UI.icon('clock',11)} Aguardando aprovação</span>${btnPend}`;
    }
    if(sit.key==="FINALIZADO" || sit.key==="FINALIZADO_COM_RESSALVA"){
      return `<button class="btn sm ghost" onclick="Act.reabrirAmbiente('${a.id}')">${UI.icon('refresh',12)} Reabrir</button>`;
    }
    if(sit.key==="NAO_INICIADO"){
      if(podeIniciar) return `<button class="btn sm primary" onclick="Act.iniciarMontagemAmbiente('${a.id}')">${UI.icon('wrench',12)} Iniciar montagem</button>${btnPend}`;
      return btnPend || `<span class="small muted">Não iniciado</span>`;
    }
    // EM_MONTAGEM
    if(sit.prontoParaMarcar && podeMarcarPronto){
      return `<button class="btn sm primary" onclick="Act.abrirFinalizarAmbiente('${a.id}')">${UI.icon('check-circle',12)} Marcar pronto para finalizar</button>
        ${podeTravar? `<button class="btn sm ghost" onclick="Act.abrirMarcarTravado('${a.id}')">${UI.icon('lock',12)} Marcar travado</button>`:""}${btnPend}`;
    }
    return `${podeTravar? `<button class="btn sm ghost" onclick="Act.abrirMarcarTravado('${a.id}')">${UI.icon('lock',12)} Marcar travado</button>`:""}${btnPend || `<span class="small muted">Em andamento</span>`}`;
  }
  // REFINO VISUAL V2 (§2 — Montagem Opção A): versão COMPACTA do card de
  // ambiente, usada nas 3 colunas do corpo prioritário. Mostra o essencial
  // (ambiente · estado · obra · % · motivo do travamento · 1 ação
  // principal) numa linha densa — a versão completa com todos os detalhes
  // continua acessível abrindo a obra (a própria linha já navega pra lá).
  // Mantém 100% a mesma leitura de estado (M.Calc.situacaoAmbiente) e as
  // mesmas ações/permissões de antes (proximoPassoHtml, não duplicado).
  function cardAmbienteCompacto(o, a){
    const sit = C.situacaoAmbiente(a);
    const prog = C.progressoAmbiente(a);
    const pendRelevantes = M.Store.state.pendencias.filter(p=>p.ambienteId===a.id && p.status!=="RESOLVIDA");
    return `<div class="compact-row" onclick="Act.irParaObra('${o.id}','${a.id}')">
      <div class="cr-main">
        <div class="cr-top"><span class="cr-title">${UI.esc(a.nome)}</span>${UI.situacaoAmbienteChip(sit)}</div>
        <div class="cr-sub">${UI.esc(o.cliente)} · ${o.numeroOS} · ${prog.pct}%${pendRelevantes.length? ` · ${pendRelevantes.length} pend.`:""}</div>
        ${sit.motivo? `<div class="cr-motivo">${UI.icon('lock',9)} ${UI.esc(sit.motivo)}</div>` : ""}
      </div>
      <div class="cr-action" onclick="event.stopPropagation()">${proximoPassoHtml(o,a,sit)}</div>
    </div>`;
  }

  // uma coluna do corpo prioritário — cabeçalho (título + contador) + até
  // "limite" linhas compactas + "Ver todos" quando sobra item (§8: macro
  // por padrão, micro por exceção — nunca lista tudo de cara).
  function colunaMontagem(o){
    if(!o.itens.length){
      return `<div class="col-group">
        ${UI.secHead({titulo:o.titulo, icon:o.icon, count:0, tone:"neutral"})}
        <div class="group-empty">${UI.esc(o.vazio)}</div>
      </div>`;
    }
    const itensHtml = o.itens.map(({o:obra,a})=> cardAmbienteCompacto(obra,a));
    const {itensHtml:html, toggleHtml} = UI.secaoComVerTodos({key:o.key, itens:itensHtml, limite:o.limite||6});
    return `<div class="col-group">
      ${UI.secHead({titulo:o.titulo, icon:o.icon, count:o.itens.length, tone:o.tone})}
      ${html}
      ${toggleHtml}
    </div>`;
  }

  // REFINO VISUAL V2 (§2): "planejamento por obra em formato compacto" —
  // era um card cheio por obra (fácil de estourar a dobra com muitas
  // obras); agora uma tabela densa, uma linha por obra, mesma informação.
  function planejamentoRowHtml(o){
    const p = o.planejamentoMontagem || {};
    const podeEditar = M.Store.pode("obra.editar");
    const duracaoTxt = p.duracaoEstimadaValor? `${p.duracaoEstimadaValor} ${p.duracaoEstimadaUnidade==="dias_uteis"?"d.úteis":p.duracaoEstimadaUnidade==="semanas"?"sem.":"d.corridos"}` : "";
    return `<tr>
      <td><b>${UI.esc(o.cliente)}</b><div class="small muted">${o.numeroOS}</div></td>
      <td class="small">${p.inicioPrevisto?C.fmtDate(p.inicioPrevisto):"—"} → ${p.fimPrevistoCalculado?C.fmtDate(p.fimPrevistoCalculado):"—"}${duracaoTxt?` (${duracaoTxt})`:""}</td>
      <td class="small">${p.inicioReal?C.fmtDate(p.inicioReal):"—"} → ${p.fimReal?C.fmtDate(p.fimReal):"—"}${p.duracaoRealDias!=null?` (${p.duracaoRealDias}d)`:""}</td>
      <td class="small muted">${UI.esc(p.equipePlanejada||"—")}</td>
      <td>${podeEditar? `<button class="btn sm ghost" onclick="Act.abrirPlanejamentoMontagem('${o.id}')">${UI.icon('calendar',12)} ${p.inicioPrevisto?'Editar':'Planejar'}</button>`:""}</td>
    </tr>`;
  }

  // REFINO VISUAL V2 (ajustes finais, §2): versão em cartão da mesma linha de
  // planejamento, só pro mobile (≤880px, via .mobile-only) — mesmos dados de
  // planejamentoRowHtml, sem tentar caber todas as colunas. Só: obra;
  // previsto; realizado; equipe; próximo marco/status. O "status" é um
  // RÓTULO DERIVADO (não um campo novo/persistido) puramente a partir de
  // inicioReal/fimReal/inicioPrevisto — mesmos campos já usados na linha
  // desktop, nenhuma regra de negócio nova.
  function statusPlanejamentoLabel(p){
    if(p.fimReal) return {label:"Concluída", tone:"good"};
    if(p.inicioReal) return {label:"Em andamento", tone:"info"};
    if(p.inicioPrevisto) return {label:"Planejada", tone:"neutral"};
    return {label:"Sem planejamento", tone:"neutral"};
  }
  function planejamentoCardMobileHtml(o){
    const p = o.planejamentoMontagem || {};
    const podeEditar = M.Store.pode("obra.editar");
    const duracaoTxt = p.duracaoEstimadaValor? `${p.duracaoEstimadaValor} ${p.duracaoEstimadaUnidade==="dias_uteis"?"d.úteis":p.duracaoEstimadaUnidade==="semanas"?"sem.":"d.corridos"}` : "";
    const st = statusPlanejamentoLabel(p);
    return `<div class="mcard">
      <div class="mcard-top">
        <div><div class="mcard-title">${UI.esc(o.cliente)}</div><div class="small muted">${o.numeroOS}</div></div>
        <span class="chip ${st.tone}">${st.label}</span>
      </div>
      <div class="mcard-rows">
        <div class="mcard-row"><span class="mcard-k">Previsto</span><span class="mcard-v">${p.inicioPrevisto?C.fmtDate(p.inicioPrevisto):"—"} → ${p.fimPrevistoCalculado?C.fmtDate(p.fimPrevistoCalculado):"—"}${duracaoTxt?` (${duracaoTxt})`:""}</span></div>
        <div class="mcard-row"><span class="mcard-k">Realizado</span><span class="mcard-v">${p.inicioReal?C.fmtDate(p.inicioReal):"—"} → ${p.fimReal?C.fmtDate(p.fimReal):"—"}${p.duracaoRealDias!=null?` (${p.duracaoRealDias}d)`:""}</span></div>
        <div class="mcard-row"><span class="mcard-k">Equipe</span><span class="mcard-v">${UI.esc(p.equipePlanejada||"—")}</span></div>
      </div>
      ${podeEditar? `<div style="margin-top:8px;"><button class="btn sm ghost" onclick="Act.abrirPlanejamentoMontagem('${o.id}')">${UI.icon('calendar',12)} ${p.inicioPrevisto?'Editar':'Planejar'}</button></div>`:""}
    </div>`;
  }

  // REFINO VISUAL V2 (última verificação antes do push, §2): versão em
  // cartão da linha de "Móveis em entrega/montagem", só pro mobile (≤880px,
  // via .mobile-only) — Montador é mobile-first, essa era a última tabela
  // ainda comprimindo. MESMOS dados/ações da linha desktop (checarRequisitos,
  // Abrir/Encerrar/Avançar/+Pendência) — nenhuma ação nova, nenhuma regra
  // nova. Só não repete TODAS as colunas: nome do móvel, obra, ambiente,
  // etapa, requisito/liberação, entrega prevista, responsável (só quando
  // tem), e as mesmas ações essenciais da tabela.
  function movelCardMobileHtml({o,a,m}, posMontagem){
    const check = M.Store.checarRequisitos(m);
    return `<div class="mcard">
      <div class="mcard-top">
        <div><div class="mcard-title">${UI.esc(m.nome)}</div><div class="small muted">${UI.esc(a.nome)} · ${UI.esc(o.cliente)}</div></div>
        <span class="chip brand">${UI.esc(M.Store.etapaById(m.etapa).nome)}</span>
      </div>
      <div class="mcard-rows">
        <div class="mcard-row"><span class="mcard-k">Requisitos</span><span class="mcard-v">${check.liberado? `<span class="chip good">liberado</span>` : `<span class="chip critical">${check.faltando.length} pendente(s)</span>`}</span></div>
        <div class="mcard-row"><span class="mcard-k">Entrega prevista</span><span class="mcard-v">${C.fmtDate(o.dataEntregaPrevista)}</span></div>
        ${m.responsavel? `<div class="mcard-row"><span class="mcard-k">Responsável</span><span class="mcard-v">${UI.person(m.responsavel)}</span></div>` : ""}
      </div>
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn sm" onclick="Act.openMovel('${m.id}')">Abrir</button>
        ${m.etapa==="MONTAGEM"? `<button class="btn sm primary" onclick="Act.abrirEncerramentoMontagem('${m.id}')">${UI.icon('check-circle',12)} Encerrar</button>`
          : M.Store.posicaoEtapa(m.etapa)<posMontagem? `<button class="btn sm primary" onclick="Act.moveStageBtn('${m.id}',1)">Avançar</button>`:""}
        ${M.Store.pode("pendencia.criar")? `<button class="btn sm ghost" onclick="Act.openPendenciaForm('${o.id}','${a.id}','${m.id}')">${UI.icon('alert',12)} + Pendência</button>` : ""}
      </div>
    </div>`;
  }

  M.Pages.montagem = function(){
    const posEntrega = M.Store.posicaoEtapa("ENTREGA"), posMontagem = M.Store.posicaoEtapa("MONTAGEM");

    // mesmo padrão de restrição por perfil já usado em Produção/Hoje (item 9):
    // sem verTodasObras, só entram obras onde a pessoa tem algo atribuído —
    // relevante aqui porque é a tela que o montador mais usa em campo.
    const restrito = !M.Store.pode("verTodasObras");
    const meuObraIds = restrito ? M.Store.obraIdsDoColaborador(M.Store.state.usuarioAtual) : null;
    // FASE 7.5: rascunho não entra em Montagem (item 7 do pedido).
    const obrasBaseMontagem = M.Store.obrasOperacionais();
    const obrasVisiveis = restrito ? obrasBaseMontagem.filter(o=>meuObraIds.has(o.id)) : obrasBaseMontagem;

    const agregado = C.agregarMontagem(obrasVisiveis);
    const contadores = C.contadoresMontagem(obrasVisiveis);

    // baldes por estado — cada ambiente aparece em EXATAMENTE um balde,
    // ordenado por proximidade do fechamento (menos itens faltando primeiro).
    const baldes = {TRAVADO:[], PRONTO_PARA_FINALIZAR:[], EM_MONTAGEM:[], NAO_INICIADO:[]};
    obrasVisiveis.forEach(o=>{
      o.ambientes.forEach(a=>{
        const sit = C.situacaoAmbiente(a);
        if(baldes[sit.key]) baldes[sit.key].push({o,a,sit,pct:C.progressoAmbiente(a).pct});
      });
    });
    Object.keys(baldes).forEach(k=> baldes[k].sort((x,y)=> y.pct - x.pct));

    const relevantes = M.Store.allMoveis().filter(({o,m})=>{
      if(restrito && !meuObraIds.has(o.id)) return false;
      const p = M.Store.posicaoEtapa(m.etapa);
      return p>=posEntrega && p<=posMontagem;
    });

    // REFINO VISUAL V2 (§2 — "Montagem Opção A", aprovada): topo em KPIs
    // compactos (físico/fechamento + os 4 baldes operacionais), corpo
    // prioritário em 3 colunas (Travados/Prontos/Em montagem), planejamento
    // por obra em tabela compacta, móveis em detalhe por exceção por
    // último. Mesmas regras funcionais da Fase 5, 100% inalteradas — só
    // reorganização visual de como os mesmos dados já calculados acima
    // (agregado/contadores/baldes/relevantes) são apresentados.
    const html = `
      ${restrito? `<div class="help-banner">${UI.icon('user',13)} Mostrando só as obras onde você tem tarefa, pendência ou assistência atribuída.</div>`:""}

      <div class="help-banner">${UI.icon('wrench',13)} Progresso físico e taxa de fechamento nunca são somados — a diferença entre os dois é o esforço espalhado (itens montados, mas ambiente ainda não finalizado formalmente).</div>

      ${UI.kpiRow([
        UI.kpiTile({icon:'wrench', label:'Progresso físico', value:agregado.fisico+'%', sub:`${agregado.ambientesIniciados}/${agregado.ambientesTotal} iniciados`}),
        UI.kpiTile({icon:'check-circle', label:'Taxa de fechamento', value:agregado.fechamento+'%', tone: agregado.fisico-agregado.fechamento>=30?'critical':'', sub:`${agregado.ambientesFinalizados} finalizado(s)`}),
        UI.kpiTile({icon:'lock', label:'Travados', value:contadores.travados, tone: contadores.travados?'blocked':''}),
        UI.kpiTile({icon:'check-circle', label:'Prontos p/ finalizar', value:contadores.prontosParaFinalizar, tone: contadores.prontosParaFinalizar?'warning':''}),
        UI.kpiTile({icon:'wrench', label:'Em montagem', value:contadores.emMontagem}),
        UI.kpiTile({icon:'circle', label:'Não iniciados', value:contadores.naoIniciados}),
      ])}

      <div class="cols-3-tight">
        ${colunaMontagem({key:'montagem:TRAVADO', titulo:'Travados', icon:'lock', tone:'blocked', itens:baldes.TRAVADO, vazio:'Nenhum ambiente travado.'})}
        ${colunaMontagem({key:'montagem:PRONTO', titulo:'Prontos p/ finalizar', icon:'check-circle', tone:'pronto', itens:baldes.PRONTO_PARA_FINALIZAR, vazio:'Nada aguardando aprovação.'})}
        ${colunaMontagem({key:'montagem:EM_MONTAGEM', titulo:'Em montagem', icon:'wrench', tone:'info', itens:baldes.EM_MONTAGEM, vazio:'Nenhum ambiente em montagem.'})}
      </div>
      ${baldes.NAO_INICIADO.length ? `
      <p class="small muted" style="margin-top:2px;"><b>${baldes.NAO_INICIADO.length} não iniciado(s):</b> ${baldes.NAO_INICIADO.map(({o,a})=>`${UI.esc(a.nome)} (${UI.esc(o.cliente)})`).join(" · ")}</p>
      ` : ""}
      ${!baldes.TRAVADO.length && !baldes.PRONTO_PARA_FINALIZAR.length && !baldes.EM_MONTAGEM.length && !baldes.NAO_INICIADO.length
        ? `<p class="small muted">Nenhum ambiente em aberto — tudo finalizado.</p>` : ""}

      ${UI.secHead({titulo:'Planejamento de montagem por obra', icon:'calendar'})}
      ${obrasVisiveis.length ? `
      <div class="desktop-only card pad">
        <div style="overflow-x:auto;">
        <table class="tbl">
          <thead><tr><th>Obra</th><th>Previsto</th><th>Real</th><th>Equipe</th><th></th></tr></thead>
          <tbody>${obrasVisiveis.map(planejamentoRowHtml).join("")}</tbody>
        </table>
        </div>
      </div>
      <div class="mobile-only">${obrasVisiveis.map(planejamentoCardMobileHtml).join("")}</div>
      ` : `<p class="small muted">Nenhuma obra visível.</p>`}

      ${UI.secHead({titulo:'Móveis em entrega / montagem', icon:'wrench', actionHtml:`<span class="small muted">detalhe por exceção</span>`})}
      ${relevantes.length ? (()=>{
        const linhas = relevantes.map(({o,a,m})=>{
          const check = M.Store.checarRequisitos(m);
          return `<tr>
              <td><b>${UI.esc(m.nome)}</b><div class="small muted">${UI.esc(a.nome)}</div></td>
              <td><a href="#/obra/${o.id}">${UI.esc(o.cliente)}</a></td>
              <td><span class="chip brand">${UI.esc(M.Store.etapaById(m.etapa).nome)}</span></td>
              <td>${check.liberado? `<span class="chip good">liberado</span>` : `<span class="chip critical">${check.faltando.length} pendente(s)</span>`}</td>
              <td>${UI.person(m.responsavel)}</td>
              <td>${C.fmtDate(o.dataEntregaPrevista)}</td>
              <td>
                <button class="btn sm" onclick="Act.openMovel('${m.id}')">Abrir</button>
                ${m.etapa==="MONTAGEM"? `<button class="btn sm primary" onclick="Act.abrirEncerramentoMontagem('${m.id}')">${UI.icon('check-circle',12)} Encerrar</button>`
                  : M.Store.posicaoEtapa(m.etapa)<posMontagem? `<button class="btn sm primary" onclick="Act.moveStageBtn('${m.id}',1)">Avançar</button>`:""}
                ${M.Store.pode("pendencia.criar")? `<button class="btn sm ghost" onclick="Act.openPendenciaForm('${o.id}','${a.id}','${m.id}')">${UI.icon('alert',12)} + Pendência</button>` : ""}
              </td>
            </tr>`;
        });
        const cards = relevantes.map(item=> movelCardMobileHtml(item, posMontagem));
        // REFINO VISUAL V2 (última verificação, §2): mesma chave de "Ver
        // todos" pras duas apresentações (tabela desktop / cartão mobile) —
        // um único estado de expansão (M.UIState.expandSections), nunca
        // dessincroniza entre as duas.
        const {itensHtml, toggleHtml} = UI.secaoComVerTodos({key:'montagem:MOVEIS', itens:linhas, limite:8});
        const {itensHtml:cardsHtml, toggleHtml:cardsToggleHtml} = UI.secaoComVerTodos({key:'montagem:MOVEIS', itens:cards, limite:8});
        return `<div class="desktop-only card pad">
        <div style="overflow-x:auto;">
        <table class="tbl">
          <thead><tr><th>Móvel</th><th>Obra</th><th>Etapa</th><th>Requisitos</th><th>Responsável</th><th>Entrega prevista</th><th></th></tr></thead>
          <tbody>${itensHtml}</tbody>
        </table>
        </div>
        ${toggleHtml}
      </div>
      <div class="mobile-only">
        ${cardsHtml}
        ${cardsToggleHtml}
      </div>`;
      })() : `<p class="small muted">Nenhum móvel em entrega ou montagem no momento.</p>`}
    `;

    return {title:"Montagem", crumb:"O que falta finalizar — travados, prontos para finalizar e em montagem, por ambiente", html};
  };

  // ---------- marcar pronto / finalizar com ressalva (Fase 4 — handoff; fluxo de 2 passos — Fase 5, rodada de ajustes) ----------
  // Este modal NUNCA finaliza direto — nem para quem tem
  // montagem.aprovarFinalizacao. O máximo que ele faz é marcar "pronto para
  // finalizar" (Store.marcarProntoAmbiente); aprovar é sempre uma ação
  // separada, feita depois, por outra pessoa (ou pela mesma, em outro
  // clique). A única saída que fecha por aqui é a ressalva explícita.
  M.Pages.finalizarAmbienteHtml = function(f){
    const {o,a} = f;
    const bloqueios = M.Store.bloqueiosAmbiente(a.id);
    const checklist = M.Store.checklistEncerramentoAmbiente(a);
    const naoMontados = a.moveis.filter(m=> M.Store.posicaoEtapa(m.etapa) < M.Store.posicaoEtapa("MONTAGEM"));
    const travamentoManual = !!a.travamentoManual;
    const pendente = bloqueios.length>0 || travamentoManual || checklist.some(c=>!c.feito) || naoMontados.length>0;
    // AJUSTE (últimos ajustes antes do push, item 1): permissão única e
    // exclusiva — liberarExcecao NÃO autoriza mais ressalva na Montagem V2
    // (era um bypass indesejado). Mesma regra que Store.finalizarComRessalva usa.
    const podeRessalva = M.Store.pode("montagem.finalizarComRessalva");
    const pendVinculaveis = M.Store.state.pendencias.filter(p=>p.ambienteId===a.id && p.status!=="RESOLVIDA");
    return `
      <div class="modal-head"><div><h2>Marcar ${UI.esc(a.nome)} como pronto?</h2><div class="meta">${UI.esc(o.cliente)} · ${o.numeroOS}</div></div><button class="modal-close" data-close>✕</button></div>
      <form id="formFinalizarAmbiente" data-bloqueios="${bloqueios.length}" data-nao-montados="${naoMontados.length}" data-travamento-manual="${travamentoManual?1:0}">
        <div class="modal-body">
          ${bloqueios.length? `<div class="help-banner" style="background:var(--critical-bg);border-color:var(--critical);color:var(--critical);">
            ${UI.icon('lock',13)} <b>Ambiente travado:</b> ${UI.esc(bloqueios[0].descricao||bloqueios[0].categoria)}${bloqueios.length>1?` · +${bloqueios.length-1} outra(s)`:''}.
            <a href="#/pendencias" data-close style="text-decoration:underline;">ver em Pendências →</a>
          </div>` : ""}
          ${travamentoManual? `<div class="help-banner" style="background:var(--critical-bg);border-color:var(--critical);color:var(--critical);">
            ${UI.icon('lock',13)} <b>Travado manualmente:</b> ${UI.esc(a.travamentoManual.motivo)}. <a href="javascript:void(0)" onclick="Act.destravarAmbiente('${a.id}');document.querySelector('.modal-close').click();" style="text-decoration:underline;">destravar primeiro →</a>
          </div>` : ""}
          <div class="help-banner">${UI.icon('clock',13)} Esta ação marca o ambiente como pronto — a finalização definitiva é sempre um passo separado, feito por quem tem permissão de aprovar.</div>
          ${naoMontados.length? `<div class="help-banner" style="background:var(--warning-bg);border-color:var(--warning);color:var(--warning);">
            ${UI.icon('alert',13)} ${naoMontados.length} móvel(is) ainda não chegaram na etapa Montagem: ${naoMontados.map(m=>UI.esc(m.nome)).join(", ")}
          </div>` : ""}
          <label id="faChecklistLabel" style="font-size:11.5px;font-weight:700;color:var(--ink-soft);">Checklist de finalização · ${checklist.filter(c=>c.feito).length}/${checklist.length}</label>
          <div style="margin:6px 0 4px;">${checklist.map((c,i)=>`
            <div class="check-row"><input type="checkbox" class="amb-check" data-item="${UI.esc(c.item)}" id="ac${i}" ${c.feito?'checked':''} onchange="Act.atualizarFinalizarAmbiente()"><label class="label" for="ac${i}">${UI.esc(c.item)}</label></div>
          `).join("")}</div>
          <div id="faPendenteSection" style="${pendente?'':'display:none;'}">
            <div class="field" style="margin-top:14px;">
              <label><input type="checkbox" id="ambRessalva" style="width:auto;margin-right:6px;" ${podeRessalva?'':'disabled'} onchange="document.getElementById('ambRessalvaFields').style.display=this.checked?'block':'none'">
                Finalizar com ressalva${podeRessalva?'':' — seu perfil não tem essa permissão'}</label>
            </div>
            <div id="ambRessalvaFields" style="display:none;">
              <div class="field"><label>Motivo</label><textarea name="motivo" placeholder="Descreva o que ficou pendente"></textarea></div>
              ${pendVinculaveis.length? `<div class="field"><label>Pendência vinculada (opcional)</label><select name="pendenciaVinculada"><option value="">—</option>${pendVinculaveis.map(p=>`<option value="${p.id}">${UI.esc(p.descricao||p.categoria)}</option>`).join("")}</select></div>` : ""}
            </div>
          </div>
          <p id="faProntoMsg" class="small" style="color:var(--good);margin-top:10px;${pendente?'display:none;':''}">${UI.icon('check',12)} Tudo pronto — pode marcar como pronto para finalizar.</p>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn" data-close>Cancelar</button>
          <button type="submit" class="btn primary" id="faSubmitBtn" ${travamentoManual?'disabled':''}>${pendente?'Finalizar com ressalva':'Marcar pronto para finalizar'}</button>
        </div>
      </form>
    `;
  };

  // ---------- marcar TRAVADO manualmente (Fase 5) ----------
  M.Pages.marcarTravadoHtml = function(f){
    const {o,a} = f;
    return `
      <div class="modal-head"><div><h2>Marcar ${UI.esc(a.nome)} como travado</h2><div class="meta">${UI.esc(o.cliente)} · ${o.numeroOS}</div></div><button class="modal-close" data-close>✕</button></div>
      <form id="formMarcarTravado">
        <div class="modal-body">
          <div class="help-banner">${UI.icon('alert',13)} Pendência não significa travado automaticamente — use isto só quando o ambiente realmente não consegue continuar por um motivo operacional (não uma pendência formal, que já trava sozinha).</div>
          <div class="field"><label>Motivo (obrigatório)</label><textarea name="motivo" placeholder="Ex.: aguardando liberação do síndico, equipe remanejada..." required></textarea></div>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn" data-close>Cancelar</button>
          <button type="submit" class="btn primary">${UI.icon('lock',12)} Marcar travado</button>
        </div>
      </form>
    `;
  };

  // ---------- planejamento de montagem (Fase 5, §10) ----------
  M.Pages.planejamentoMontagemHtml = function(o){
    const p = o.planejamentoMontagem || {};
    return `
      <div class="modal-head"><div><h2>Planejamento de montagem</h2><div class="meta">${UI.esc(o.cliente)} · ${o.numeroOS}</div></div><button class="modal-close" data-close>✕</button></div>
      <form id="formPlanejamentoMontagem">
        <div class="modal-body">
          <div class="field"><label>Início previsto</label><input type="date" name="inicioPrevisto" value="${p.inicioPrevisto||""}"></div>
          <div class="flex-gap">
            <div class="field" style="flex:1;"><label>Duração estimada</label><input type="number" min="0" name="duracaoEstimadaValor" value="${p.duracaoEstimadaValor||""}"></div>
            <div class="field" style="flex:1;"><label>Unidade</label>
              <select name="duracaoEstimadaUnidade">
                <option value="dias_uteis" ${(!p.duracaoEstimadaUnidade||p.duracaoEstimadaUnidade==="dias_uteis")?"selected":""}>Dias úteis</option>
                <option value="semanas" ${p.duracaoEstimadaUnidade==="semanas"?"selected":""}>Semanas</option>
                <option value="dias_corridos" ${p.duracaoEstimadaUnidade==="dias_corridos"?"selected":""}>Dias corridos</option>
              </select>
            </div>
          </div>
          <div class="field"><label>Equipe planejada</label><input type="text" name="equipePlanejada" placeholder="Ex.: Roberto Diniz, Fernanda Costa" value="${UI.esc(p.equipePlanejada||"")}"></div>
          <div class="field"><label>Observações</label><textarea name="observacoes" placeholder="Observações do planejamento">${UI.esc(p.observacoes||"")}</textarea></div>
          <p class="small muted">Fim previsto é calculado automaticamente a partir do início e da duração — é uma estimativa de apoio, não um compromisso rígido. Início/fim real são capturados sozinhos quando a montagem de fato começa e termina.</p>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn" data-close>Cancelar</button>
          <button type="submit" class="btn primary">Salvar planejamento</button>
        </div>
      </form>
    `;
  };

  // checklist de encerramento (seção 32)
  // CORREÇÃO (auditoria funcional #82): mostra ANTES de encerrar o que o
  // próprio sistema já sabe que está em aberto pra esse móvel (bloqueio,
  // retrabalho/aguardando, tarefa obrigatória, pendência vinculada, ressalva),
  // em vez de deixar tudo por conta da memória de quem está fechando.
  M.Pages.encerramentoMontagemHtml = function(f){
    const {o,a,m} = f;
    const pendReais = M.Store.pendenciasReaisMovel(m);
    return `
      <div class="modal-head"><div><h2>Encerrar montagem</h2><div class="meta">${UI.esc(m.nome)} · ${UI.esc(o.cliente)} · ${UI.esc(a.nome)}</div></div><button class="modal-close" data-close>✕</button></div>
      <div class="modal-body">
        ${pendReais.length? `<div class="help-banner" style="background:var(--warning-bg);border-color:var(--warning);color:var(--warning);">
          ${UI.icon('alert',13)} <b>O sistema encontrou ${pendReais.length} item(ns) ainda em aberto para este móvel:</b>
          <ul style="margin:6px 0 0 18px;">${pendReais.map(p=>`<li>${UI.esc(p)}</li>`).join("")}</ul>
          <div class="small" style="margin-top:6px;">A montagem vai ser encerrada como <b>"concluída com pendências"</b> — isso continua visível em Para Finalizar até ser resolvido.</div>
        </div>` : ""}
        ${CHECKLIST_ENCERRAMENTO.map((c,i)=>`
          <div class="check-row"><input type="checkbox" class="mont-check" id="mc${i}"><label class="label" for="mc${i}">${c}</label></div>
        `).join("")}
        <div class="field" style="margin-top:14px;">
          <label><input type="checkbox" id="temPendencias" style="width:auto;margin-right:6px;" ${pendReais.length?'checked disabled':''}>Ficaram pendências para depois (ex: peça em falta, ajuste futuro)${pendReais.length?' — marcado automaticamente pelos itens acima':''}</label>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn" data-close>Cancelar</button>
        <button class="btn primary" id="btnEncerrar">${pendReais.length?'Encerrar com pendências':'Encerrar montagem'}</button>
      </div>
    `;
  };
})();
