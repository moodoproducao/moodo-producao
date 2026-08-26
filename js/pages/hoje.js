/* ============================================================
   PÁGINA: Hoje — substitui o Dashboard (handoff — Fase 3)
   ============================================================
   "Hoje nunca lista peça nem operação. Ele só reúne o que já existe como
   exceção em Produção, Pendências e Montagem." / "Hoje tinha virado
   dashboard... removi. Hoje abre direto nos itens que exigem ação."
   (ui-telas-piloto.txt).

   REFINO VISUAL V2 (ajustes finais, §1) — decisão revista: Hoje passou a ter
   uma faixa de KPI compacta (UI.kpiRow/UI.kpiTile) no topo de cada grupo de
   perfil, mas ela responde só "qual a escala do que precisa de mim agora"
   (contagens de exceção — obras em risco, pendências críticas, ambientes
   travados etc.), NUNCA indicadores administrativos/de meta do mês — isso
   continua existindo só em Indicadores. Cada perfil tem seu próprio
   conjunto de KPIs (nunca os mesmos tiles pra todos), montado só com
   M.Calc/M.Store já existentes, sem nenhuma regra de contagem nova.

   FASE 4 (handoff — §9/§10/§11): "Hoje V2 contextual por perfil". A tela
   deixa de ser uma versão única com só um filtro de "restrito" e passa a
   ter um conjunto de blocos DIFERENTE por grupo de perfil (7 grupos, exatos
   do handoff: Admin, PCP, Líder, Produção, Montador, Assistência, Gestor).
   Regras que valem pra TODOS os grupos:
     - "Poucos blocos" — cada grupo mostra só o que o handoff pediu pra ele,
       nada de reaproveitar tudo em todo lugar.
     - Nunca duplica número decorativo/KPI/ranking (§11) — todo bloco aqui
       é lista de itens acionáveis, nunca um número sozinho sem ação atrás.
     - Nada de módulo novo: todo bloco é filtro/reagrupamento de dados que já
       existem em Pendências/Produção/Montagem/Assistências/Calendário — ver
       M.Calc, M.Store, M.Calendario reusados abaixo, nada recalculado do zero.
     - Risco: só ALTO/MEDIO entram como "obra em risco" — "N/A não é risco"
       (regra da Fase 3, não mexida aqui).
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  function esc(s){ return UI.esc(s); }

  function saudacao(){
    const h = new Date().getHours();
    return h<12 ? "Bom dia" : h<18 ? "Boa tarde" : "Boa noite";
  }

  // classifica uma pendência aberta num verbo de ação — mantido da Fase 3
  // (mesma regra, mesmo comentário original preservado abaixo).
  // A lógica é derivada dos campos do handoff (tipo/origem/status/impacto),
  // já que o handoff não documentou uma regra mecânica de classificação.
  // Cada pendência cai em UM verbo só (primeira regra que bater), pra não
  // duplicar contagem entre seções.
  function classificarAcao(p){
    if(p.tipo==="Decisão") return "DECIDIR";
    if(p.tipo==="Projeto") return "APROVAR";
    if(p.origem==="Fornecedor" && p.prazo && C.diasAte(p.prazo)<=0) return "COBRAR";
    if(p.status==="AGUARDANDO") return "REVISAR";
    return "RESOLVER";
  }
  const VERBOS = {
    DECIDIR: {tag:"Decidir", tone:"critical"},
    APROVAR: {tag:"Aprovar", tone:"warning"},
    COBRAR:  {tag:"Cobrar",  tone:"warning"},
    RESOLVER:{tag:"Resolver",tone:"critical"},
    REVISAR: {tag:"Revisar", tone:"info"},
  };

  function itemAtencaoHtml(p){
    const v = VERBOS[classificarAcao(p)];
    const dias = C.diasDesde(p.abertura);
    const prazoTxt = p.prazo ? (C.diasAte(p.prazo)<=0 ? "vencida" : `prazo ${C.fmtDate(p.prazo)}`) : `aberta há ${dias}d`;
    return `<div class="attention-item ${v.tone}" style="cursor:pointer;" onclick="Act.abrirPendenciaEm('${p.id}')">
      <div class="ai-tag">${esc(v.tag)} · ${M.impactoDef(p.impacto).label}</div>
      <div class="ai-title">${esc(p.obraNome)}${p.ambienteNome? " · "+esc(p.ambienteNome):""}</div>
      <div class="ai-sub">${esc(p.descricao||p.categoria)} · ${esc(prazoTxt)}</div>
    </div>`;
  }

  // item de pendência em estilo "alert-item" (usado nos blocos "minhas
  // pendências" / "pendências operacionais" / etc. — mais compacto que o
  // attention-item, que carrega o verbo de ação).
  function alertItemPendenciaHtml(p){
    return `<div class="alert-item" style="cursor:pointer;" onclick="Act.abrirPendenciaEm('${p.id}')">
      ${UI.tipoChip(p.tipo)}
      <div><div>${esc(p.descricao||p.categoria)}</div><div class="alert-sub">${esc(p.obraNome)}${p.movelNome? " · "+esc(p.movelNome):""} · ${p.prazo? (C.diasAte(p.prazo)<=0?"vencida":"prazo "+C.fmtDate(p.prazo)) : "sem prazo"}</div></div>
    </div>`;
  }

  function riscoCardHtml({o,sit,parada}){
    return `<div class="risk-card" style="margin-bottom:10px;">
      <div class="flex-between">
        <div><b>${esc(o.cliente)}</b><div class="small muted">${o.numeroOS}</div></div>
        ${UI.riscoChip(sit)}
      </div>
      <div class="risk-bar"><div style="width:${sit.progresso}%;height:100%;background:var(--${sit.tone});border-radius:var(--radius-sm);"></div></div>
      <div class="flex-between small muted">
        <span>${sit.progresso}% concluído${parada? ` · <span style="color:var(--critical);font-weight:700;">parada há ${C.diasParada(o)}d</span>`:""}</span>
        <span>${sit.pendencias} pendência(s) · ${sit.diasEntrega<0? `${-sit.diasEntrega}d atrasada`: `entrega em ${sit.diasEntrega}d`}</span>
      </div>
      <a href="#/obra/${o.id}" class="btn ghost sm" style="margin-top:8px;">Abrir obra →</a>
    </div>`;
  }

  // ambiente travado (FASE 4 — reusa M.Calc.situacaoAmbiente, a mesma
  // definição de "travado" já usada em Montagem/Obra, não uma nova).
  function ambienteTravadoHtml({o,a}){
    const bloqueios = M.Store.bloqueiosAmbiente(a.id);
    return `<div class="alert-item" style="cursor:pointer;" onclick="Act.irParaObra('${o.id}','${a.id}')">
      ${UI.icon('lock',13)}
      <div><div><b>${esc(o.cliente)}</b> · ${esc(a.nome)}</div>
      <div class="alert-sub">${bloqueios.length? esc(bloqueios[0].descricao||bloqueios[0].categoria) : "travado"}</div></div>
    </div>`;
  }

  // FASE 5 (Montagem V2, §1: "quem precisa agir"): ambientes marcados como
  // prontos por Montador/PCP/Líder/Gestor, aguardando quem tem
  // montagem.aprovarFinalizacao aprovar. Condicional na PERMISSÃO de quem
  // está vendo a tela (Store.pode), não no perfil — hoje só Admin tem essa
  // permissão por padrão, mas se isso mudar em Configurações → Permissões
  // este bloco aparece sozinho pra quem passar a ter, sem precisar tocar
  // neste arquivo de novo.
  function ambientePendenteAprovacaoHtml({o,a}){
    return `<div class="alert-item" style="cursor:pointer;" onclick="Act.irParaObra('${o.id}','${a.id}')">
      ${UI.icon('check-circle',13)}
      <div><div><b>${esc(o.cliente)}</b> · ${esc(a.nome)}</div>
      <div class="alert-sub">pronto para finalizar — aguardando aprovação</div></div>
    </div>`;
  }
  function blocoAguardandoAprovacaoMontagem(ctx){
    if(!M.Store.pode("montagem.aprovarFinalizacao")) return "";
    const itens = ctx.obras.flatMap(o=> o.ambientes.filter(a=> C.situacaoAmbiente(a).key==="PRONTO_PARA_FINALIZAR").map(a=>({o,a})));
    return blocoLista({titulo:"Aguardando aprovação de finalização", icon:"check-circle", total:itens.length, tone: itens.length?"warning":undefined, href:"#/montagem",
      itens: itens.map(ambientePendenteAprovacaoHtml), vazio:"Nenhum ambiente aguardando aprovação agora."});
  }

  // FASE 6 (Agenda V2, §21): compromisso real da Agenda (M.Agenda —
  // js/pages/agenda.js) — mesma fonte que a tela Agenda usa, nunca
  // reimplementa a agregação de eventos aqui. Substitui o antigo
  // compromissoHtml (que lia do M.Calendario legado, com outro formato de
  // evento — {iso,label,tipo,tab} — incompatível com os 6 tipos aprovados
  // da Agenda V2).
  function compromissoAgendaHtml(e){
    const acao = e.origem==="MONTAGEM" ? `Act.abrirPlanejamentoMontagem('${e.obraId}')`
      : e.origem==="ASSISTENCIA" ? `Act.abrirAssistenciaDaAgenda('${e.origemRefId}')`
      : e.obraId ? `Act.go('#/obra/${e.obraId}')` : `Act.go('#/agenda')`;
    const dias = C.diasAte(e.data);
    const quando = dias===0?"hoje":dias===1?"amanhã":C.fmtDate(e.data);
    const hora = e.horaInicio? ` · ${e.horaInicio}` : "";
    return `<div class="alert-item" style="cursor:pointer;" onclick="${acao}">
      <div><div>${esc(e.titulo)}</div><div class="alert-sub">${esc(quando)}${hora} · ${esc(M.tipoEventoDef(e.tipo).label)}</div></div>
    </div>`;
  }

  function blocoLista(o){
    // wrapper genérico — título + contador + lista de itens já em HTML,
    // ou uma mensagem "vazio" quando não há nada (nunca esconde o bloco
    // inteiro: mostrar "nada aqui" também é informação).
    // REFINO VISUAL V2 (§8/§9 — "Ver todos"): quando o bloco tem um destino
    // natural (Pendências/Montagem/Assistências, já filtráveis lá por
    // conta própria), `href` mostra o link — mesmo padrão que "Obras em
    // risco"/"Assistência" já usavam antes desta rodada, agora disponível
    // pra todo blocoLista sem repetir o <a> em cada grupo.
    const verTodos = o.href? `<a href="${o.href}" class="btn ghost sm">ver todos</a>` : "";
    const right = (o.total || verTodos) ? `<span class="flex-gap" style="gap:6px;">${o.total? `<span class="chip ${o.tone||'critical'}">${o.total}</span>` : ""}${verTodos}</span>` : "";
    return UI.card({
      title: o.titulo,
      icon: o.icon,
      right,
      body: o.itens.length ? o.itens.join("") : `<p class="small muted">${esc(o.vazio||"Nada aqui agora.")}</p>`,
    });
  }

  // ============================================================
  // Blocos por GRUPO de perfil (§10 handoff — 7 grupos exatos)
  // Cada grupo recebe o "ctx" comum (calculado uma vez em M.Pages.hoje) e
  // devolve só o HTML do corpo — nada de recalcular obras/pendências aqui.
  // ============================================================

  // ---- ADMIN e GESTOR: "visão parecida com Admin operacional, mas sem
  // áreas administrativas indevidas" (§10). Mesmo conjunto de blocos pros
  // dois — nenhum dos blocos abaixo é uma "área administrativa" (não é
  // Configurações/Equipe/Auditoria), então não há nada pra tirar do Gestor;
  // a diferença entre os dois perfis já é decidida em outro lugar (menu/
  // rotas — Fase 2), não aqui dentro do Hoje.
  function grupoAdminGestor(ctx){
    // REFINO VISUAL V2 (ajustes finais, §3): "Exceções críticas" usa a mesma
    // fonte única M.Calc.pendenciaCritica de Pendências — nunca mais uma
    // regra própria aqui (antes só olhava BLOQUEIA_OBRA/BLOQUEIA_AMBIENTE,
    // deixando de fora IMPEDE_FINALIZAR vencido/envelhecido; a função
    // compartilhada já cobre os dois casos).
    const excecoes = ctx.pendAbertas.filter(C.pendenciaCritica).sort(C.compararPrioridadePendencia);
    // FASE 7 (Assistências V2): critério trocado de "prazo vencido" (campo
    // solto, sem relação com visita real) pra "retorno necessário sem
    // próxima visita já agendada" (C.assistenciaComRetornoPendente — mesma
    // função usada pela tela V2/Hoje-Assistência, nenhuma regra paralela).
    const assistCriticas = M.Store.state.assistencias.filter(a=> a.status!=="CONCLUIDA" && a.status!=="CANCELADA"
      && (a.prazo && C.diasAte(a.prazo)<0 || C.assistenciaComRetornoPendente(a)));

    // REFINO VISUAL V2 (ajustes finais, §1): faixa de KPI — responde "qual a
    // escala do que precisa de mim agora", nunca um dashboard administrativo.
    // Todo número abaixo reusa cálculo já existente, nada novo.
    const agregadoMontagem = C.agregarMontagem(ctx.obras);
    const entregas7d = ctx.obras.filter(o=> C.diasAte(o.dataEntregaPrevista)>=0 && C.diasAte(o.dataEntregaPrevista)<=7).length;
    const kpis = UI.kpiRow([
      UI.kpiTile({icon:'alert', label:'Obras em risco', value:ctx.riscoRows.length, tone: ctx.riscoRows.length?'critical':''}),
      UI.kpiTile({icon:'lock', label:'Pendências críticas', value:excecoes.length, tone: excecoes.length?'critical':''}),
      UI.kpiTile({icon:'lock', label:'Ambientes travados', value:ctx.ambientesTravados.length, tone: ctx.ambientesTravados.length?'warning':''}),
      UI.kpiTile({icon:'wrench', label:'Montagem / Fechamento', value:`${agregadoMontagem.fisico}% / ${agregadoMontagem.fechamento}%`}),
      UI.kpiTile({icon:'calendar', label:'Próximas entregas (7d)', value:entregas7d, tone: entregas7d?'warning':''}),
    ]);

    return `
      ${kpis}
      <div class="grid-2">
        ${blocoLista({titulo:"Exceções críticas", icon:"alert", total:excecoes.length, href:"#/pendencias",
          itens:excecoes.slice(0,6).map(itemAtencaoHtml), vazio:"Nenhuma pendência bloqueando obra/ambiente agora."})}
        <div class="card pad">
          <div class="card-title"><span style="flex:1;">Obras em risco</span><a href="#/producao" class="btn ghost sm">ver produção</a></div>
          ${ctx.riscoRows.length ? ctx.riscoRows.slice(0,6).map(riscoCardHtml).join("") : `<p class="small muted">Nenhuma obra em risco agora.</p>`}
        </div>
      </div>
      <div class="hr"></div>
      <div class="grid-2">
        ${blocoLista({titulo:"Montagem travada", icon:"lock", total:ctx.ambientesTravados.length, href:"#/montagem",
          itens:ctx.ambientesTravados.slice(0,6).map(ambienteTravadoHtml), vazio:"Nenhum ambiente travado agora."})}
        ${blocoLista({titulo:"Assistência crítica", icon:"alert", total:assistCriticas.length, tone:"warning",
          itens:assistCriticas.slice(0,6).map(a=>`<div class="alert-item" style="cursor:pointer;" onclick="Act.go('#/assistencias')">
            <div><div>${esc(a.categoria)} — ${esc(a.obraNome||a.cliente||"")}</div>
            <div class="alert-sub">${a.prazo&&C.diasAte(a.prazo)<0? "prazo vencido":"retorno necessário"}</div></div></div>`),
          vazio:"Nenhuma assistência crítica agora."})}
      </div>
      ${(()=>{ const b=blocoAguardandoAprovacaoMontagem(ctx); return b? `<div class="hr"></div>${b}` : ""; })()}
      <div class="hr"></div>
      ${blocoLista({titulo:"Próximos compromissos", icon:"calendar", tone:"neutral", href:"#/agenda",
        itens:ctx.compromissos.slice(0,6).map(compromissoAgendaHtml), vazio:"Nada nos próximos 7 dias."})}
    `;
  }

  // ---- PCP: pré-produção, liberações, obras entrando em produção, prazos.
  // "Liberações" e "bloqueios de projeto/material" são a mesma pendência
  // vista de dois jeitos (uma pendência de Material/Projeto bloqueada É a
  // liberação pendente) — um bloco só, ordenado por prioridade, evita
  // mostrar a mesma pendência duas vezes em duas seções diferentes.
  function grupoPCP(ctx){
    const preProducao = ctx.pendAbertas.filter(p=> p.tipo==="Material" || p.tipo==="Projeto")
      .sort(C.compararPrioridadePendencia);
    // AJUSTE (pós-revisão): "obras entrando em produção" usa faseMacro (Fase
    // 3), não mais progresso físico como proxy — faseMacro responde ONDE a
    // obra está; progresso físico não substitui fase operacional. Leitura
    // via M.Store.faseMacroDeObra(o) (nunca o campo cru) — é a mesma função
    // que riscoObra/situacaoObra já usam, e ela devolve "_LEGADO_SEM_FASE"
    // pra obra sem faseMacro, SEM inferir nada — então obra legada
    // simplesmente não entra em nenhum dos dois blocos abaixo, de propósito.
    const liberadas = ctx.obras.filter(o=> M.Store.faseMacroDeObra(o).key==="LIBERADA_PARA_PRODUCAO")
      .sort((a,b)=> C.diasAte(a.dataEntregaPrevista)-C.diasAte(b.dataEntregaPrevista));
    // "PCP_PLANO_DE_CORTE" mostrado separado, nunca junto de LIBERADA_PARA_PRODUCAO
    // — são situações diferentes (uma já pode ir pra fábrica, a outra ainda
    // está sendo preparada), não misturar as duas sob um único corte.
    const emPreparacao = ctx.obras.filter(o=> M.Store.faseMacroDeObra(o).key==="PCP_PLANO_DE_CORTE")
      .sort((a,b)=> C.diasAte(a.dataEntregaPrevista)-C.diasAte(b.dataEntregaPrevista));
    function obraFaseItemHtml(o){
      return `<div class="alert-item" style="cursor:pointer;" onclick="Act.go('#/obra/${o.id}')">
        <div><div><b>${esc(o.cliente)}</b></div><div class="alert-sub">${o.numeroOS} · entrega ${C.fmtDate(o.dataEntregaPrevista)}</div></div>
      </div>`;
    }
    // FASE 6 (Agenda V2, §21 — ajuste necessário): "prazos próximos" do PCP
    // antes lia do M.Calendario legado (tipos "obra"/"movel"/pendências com
    // prazo — deadlines genéricos, não compromissos de campo). Os 6 tipos
    // aprovados da Agenda V2 (Montagem/Assistência/Retorno/Visita/Medição/
    // Outro) não cobrem "prazo de pendência de pré-produção" — não é um
    // compromisso de "quem precisa estar onde e quando", é prazo de
    // documento/material. Por isso este KPI passa a ler direto da MESMA
    // lista `preProducao` já calculada acima (nenhuma consulta nova),
    // filtrada pelos próximos 7 dias — mantém o significado original do
    // handoff ("prazos relevantes de pré-produção que estão perto") sem
    // inventar um 7º tipo de evento pra caber na Agenda.
    const prazosProximos = preProducao.filter(p=> p.prazo && C.diasAte(p.prazo)>=0 && C.diasAte(p.prazo)<=7);
    // REFINO VISUAL V2 (ajustes finais, §1): "bloqueios relevantes de
    // projeto/material" = dentre a pré-produção já calculada acima, os que
    // também bloqueiam fechamento (M.bloqueiaFechamento — mesma função usada
    // em Pendências/Obras, nenhuma regra nova).
    const bloqueiosProjetoMaterial = preProducao.filter(p=> M.bloqueiaFechamento(p.impacto)).length;
    const kpis = UI.kpiRow([
      UI.kpiTile({icon:'alert', label:'Pendências de pré-produção', value:preProducao.length, tone: preProducao.length?'warning':''}),
      UI.kpiTile({icon:'clock', label:'Em plano de corte', value:emPreparacao.length}),
      UI.kpiTile({icon:'check-circle', label:'Liberadas p/ produção', value:liberadas.length}),
      UI.kpiTile({icon:'calendar', label:'Prazos próximos', value:prazosProximos.length, tone: prazosProximos.length?'warning':''}),
      UI.kpiTile({icon:'lock', label:'Bloqueios proj./material', value:bloqueiosProjetoMaterial, tone: bloqueiosProjetoMaterial?'critical':''}),
    ]);

    return `
      ${kpis}
      ${blocoLista({titulo:"Pendências de pré-produção", icon:"alert", total:preProducao.length, href:"#/pendencias",
        itens:preProducao.slice(0,8).map(itemAtencaoHtml), vazio:"Nenhuma pendência de Material/Projeto em aberto."})}
      <div class="hr"></div>
      <div class="grid-2">
        ${blocoLista({titulo:"Obras liberadas para produção", icon:"check-circle", tone:"neutral",
          itens:liberadas.slice(0,6).map(obraFaseItemHtml), vazio:"Nenhuma obra liberada para produção agora."})}
        ${blocoLista({titulo:"Em preparação para liberação", icon:"clock", tone:"neutral",
          itens:emPreparacao.slice(0,6).map(obraFaseItemHtml), vazio:"Nenhuma obra em plano de corte agora."})}
      </div>
      ${(()=>{ const b=blocoAguardandoAprovacaoMontagem(ctx); return b? `<div class="hr"></div>${b}` : ""; })()}
      <div class="hr"></div>
      ${blocoLista({titulo:"Prazos próximos", icon:"calendar", tone:"neutral", href:"#/pendencias",
        itens:prazosProximos.slice(0,6).map(itemAtencaoHtml),
        vazio:"Nada nos próximos 7 dias."})}
    `;
  }

  // ---- LÍDER: "pendências operacionais" e "o que precisa destravar hoje"
  // são o mesmo tipo de item (pendência aberta pedindo ação) — um bloco só,
  // priorizado (§8), evita duplicar a mesma lista sob dois títulos.
  function grupoLider(ctx){
    const destravar = ctx.pendAbertas.slice().sort(C.compararPrioridadePendencia);
    const contadores = C.contadoresMontagem(ctx.obras);
    const kpis = UI.kpiRow([
      UI.kpiTile({icon:'lock', label:'Ambientes travados', value:ctx.ambientesTravados.length, tone: ctx.ambientesTravados.length?'critical':''}),
      UI.kpiTile({icon:'check-circle', label:'Prontos p/ finalizar', value:contadores.prontosParaFinalizar, tone: contadores.prontosParaFinalizar?'warning':''}),
      UI.kpiTile({icon:'alert', label:'Pendências operacionais', value:destravar.length, tone: destravar.length?'warning':''}),
      UI.kpiTile({icon:'wrench', label:'Obras perto do fechamento', value:ctx.prioridadeFechamento.length}),
    ]);
    return `
      ${kpis}
      ${blocoLista({titulo:"Precisa destravar hoje", icon:"alert", total:destravar.length, href:"#/pendencias",
        itens:destravar.slice(0,8).map(itemAtencaoHtml), vazio:"Nada pedindo ação agora."})}
      <div class="hr"></div>
      <div class="grid-2">
        ${blocoLista({titulo:"Ambientes travados", icon:"lock", total:ctx.ambientesTravados.length,
          itens:ctx.ambientesTravados.slice(0,6).map(ambienteTravadoHtml), vazio:"Nenhum ambiente travado agora."})}
        <div class="card pad">
          <div class="card-title"><span style="flex:1;">Obras próximas do fechamento</span><a href="#/montagem" class="btn ghost sm">ver montagem</a></div>
          ${ctx.prioridadeFechamento.length ? ctx.prioridadeFechamento.slice(0,6).map(l=>`
            <div class="alert-item" style="cursor:pointer;" onclick="Act.irParaObra('${l.o.id}','${l.a.id}')">
              <div><div><b>${esc(l.a.nome)}</b> — ${l.pct}%</div>
              <div class="alert-sub">${esc(l.o.cliente)} · ${l.itensFaltando? `falta ${l.itensFaltando} item(ns)` : "pronta para finalizar"}</div></div>
            </div>`).join("") : `<p class="small muted">Nenhum ambiente perto do fechamento agora.</p>`}
        </div>
      </div>
      ${(()=>{ const b=blocoAguardandoAprovacaoMontagem(ctx); return b? `<div class="hr"></div>${b}` : ""; })()}
    `;
  }

  // ---- PRODUÇÃO (OPERADOR): "menu já é Hoje+Pendências" — tela simples.
  // Contexto/foto/ação rápida acontecem no destino (Act.abrirPendenciaEm já
  // abre a pendência expandida em Pendências, com obra/ambiente/móvel,
  // fotos e "+fotos" — não duplica isso aqui dentro de Hoje.
  function grupoProducao(ctx){
    const minhas = ctx.pendAbertas.filter(p=>p.responsavel===ctx.nome).sort(C.compararPrioridadePendencia);
    // AJUSTE (último ajuste antes da publicação): "itens que precisam de
    // ação agora" mostrava qualquer pendência da(s) obra(s) com
    // responsavel !== usuário — ou seja, também pendência de OUTRA pessoa,
    // só por estar na mesma obra. Hoje responde "o que EU preciso fazer
    // agora", não "o que está acontecendo na obra inteira" — então esse
    // bloco não pode incluir pendência atribuída a outro colaborador.
    // A única exceção aceita: pendência SEM responsável explícito, mas
    // comprovadamente ligada (via movelId) a uma tarefa deste usuário
    // (responsavelPlanejado/executadoPor) — o MESMO vínculo que
    // obraIdsDoColaborador já usa pra "obra", só que aqui restrito ao
    // móvel específico da pendência, não a obra inteira. Nenhuma
    // permissão nova, nenhum campo novo — reuso de state.tarefas.
    const acionaveisSemResponsavel = ctx.pendAbertas.filter(p=>
      !p.responsavel && p.movelId &&
      M.Store.state.tarefas.some(t=> t.movelId===p.movelId &&
        (t.responsavelPlanejado===ctx.nome || t.executadoPor===ctx.nome))
    ).sort(C.compararPrioridadePendencia);
    // REFINO VISUAL V2 (ajustes finais, §1): Produção é o único perfil com
    // KPI deliberadamente mínimo (2-3 tiles) — nada administrativo/global,
    // só a escala do que é dela agora. O 3º (obras/contextos ativos) só
    // entra quando já é derivável sem nova consulta (obraIdsDoColaborador
    // já existe, usado em "restrito" acima).
    const kpis = UI.kpiRow([
      UI.kpiTile({icon:'alert', label:'Minhas pendências', value:minhas.length, tone: minhas.length?'warning':''}),
      UI.kpiTile({icon:'clock', label:'Exigem ação agora', value:acionaveisSemResponsavel.length, tone: acionaveisSemResponsavel.length?'critical':''}),
      UI.kpiTile({icon:'check-circle', label:'Obras ativas', value:M.Store.obraIdsDoColaborador(ctx.nome).size}),
    ]);
    return `
      ${kpis}
      ${blocoLista({titulo:"Minhas pendências", icon:"alert", total:minhas.length, href:"#/pendencias",
        itens:minhas.map(alertItemPendenciaHtml), vazio:"Nenhuma pendência sob sua responsabilidade."})}
      <div class="hr"></div>
      ${blocoLista({titulo:"Itens que precisam de ação agora", icon:"clock", tone:"warning",
        itens:acionaveisSemResponsavel.slice(0,6).map(alertItemPendenciaHtml), vazio:"Nada mais pedindo ação nas suas obras agora."})}
    `;
  }

  // FASE 5 (Montagem V2, §12/§13): próximo passo compacto por ambiente, pra
  // uso em campo (mobile-first) — mesma decisão de js/pages/montagem.js e
  // js/pages/obraDetail.js (permissão + estado), versão de UMA ação principal
  // (não duas), porque aqui o objetivo é "o que eu faço agora nesta obra",
  // não uma tela de gestão.
  function acaoRapidaAmbienteHtml(a, sit){
    // AJUSTE (rodada de ajustes): permissões granulares — iniciar/travar/
    // destravar não reaproveitam mais montagem.marcarPronto. Aprovar não
    // aparece aqui de propósito (§7.6/§13 — Montador nunca vê "Aprovar",
    // mesmo que o perfil dele algum dia ganhasse a permissão por engano na
    // matriz; esta é a tela de ação rápida em campo, não a de gestão).
    const podeIniciar = M.Store.pode("montagem.iniciar");
    const podeTravar = M.Store.pode("montagem.travar");
    const podeDestravar = M.Store.pode("montagem.destravar");
    const podeMarcarPronto = M.Store.pode("montagem.marcarPronto");
    if(sit.key==="TRAVADO"){
      if(sit.origem==="MANUAL" && podeDestravar) return `<button class="btn sm" onclick="Act.destravarAmbiente('${a.id}')">${UI.icon('lock',12)} Destravar</button>`;
      return `<a class="btn sm ghost" href="#/pendencias">${UI.icon('lock',12)} Ver pendência</a>`;
    }
    if(sit.key==="PRONTO_PARA_FINALIZAR") return `<span class="chip info">${UI.icon('clock',11)} Aguardando aprovação</span>`;
    if(sit.key==="NAO_INICIADO") return podeIniciar? `<button class="btn sm" onclick="Act.iniciarMontagemAmbiente('${a.id}')">${UI.icon('wrench',12)} Iniciar montagem</button>` : "";
    if(sit.prontoParaMarcar && podeMarcarPronto) return `<button class="btn sm primary" onclick="Act.abrirFinalizarAmbiente('${a.id}')">${UI.icon('check-circle',12)} Marcar pronto</button>`;
    return podeTravar? `<button class="btn sm ghost" onclick="Act.abrirMarcarTravado('${a.id}')">${UI.icon('lock',12)} Marcar travado</button>` : "";
  }
  // ---- MONTADOR: obra(s) do dia (qualquer obra com ambiente ainda não
  // finalizado — não mais só quem tem móvel na etapa MONTAGEM, porque agora
  // "iniciar montagem" é uma ação explícita, não só derivada da etapa do
  // móvel), ambientes com estado + pendências + ação rápida (§12/§13).
  function grupoMontador(ctx){
    const obrasDoDia = ctx.obras.filter(o=> o.ambientes.some(a=>{
      const k = C.situacaoAmbiente(a).key;
      return k!=="FINALIZADO" && k!=="FINALIZADO_COM_RESSALVA";
    }));
    // FASE 6 (Agenda V2, §21): "Obras do dia" continua sendo a MESMA seleção
    // da Fase 5 (obra com ambiente ainda aberto — regra de Montagem V2, não
    // mexida aqui) — trocar esse critério por "data agendada" seria mudar
    // regra de negócio de Montagem, fora do escopo desta fase. O que integra
    // com a Agenda é aditivo: se a obra tem um compromisso de MONTAGEM
    // (M.Agenda, derivado do planejamento) agendado para HOJE, mostra esse
    // horário/equipe no card — mesma fonte real da Agenda, sem duplicar
    // cálculo (M.Agenda.eventosDoDia já aplica o mesmo escopo por perfil).
    const agendaHojeMontagem = M.Agenda.eventosDoDia(M.todayISO(), ["MONTAGEM"]);
    const agendaPorObra = {};
    agendaHojeMontagem.forEach(e=>{ agendaPorObra[e.obraId] = e; });
    // REFINO VISUAL V2 (ajustes finais, §1): os 3 últimos tiles vêm de UMA
    // chamada a C.contadoresMontagem (mesma função da faixa de KPI de
    // Montagem) — nenhuma contagem nova/duplicada.
    const contadores = C.contadoresMontagem(ctx.obras);
    const kpis = UI.kpiRow([
      UI.kpiTile({icon:'calendar', label:'Obras do dia', value:obrasDoDia.length}),
      UI.kpiTile({icon:'lock', label:'Ambientes travados', value:contadores.travados, tone: contadores.travados?'critical':''}),
      UI.kpiTile({icon:'check-circle', label:'Prontos p/ finalizar', value:contadores.prontosParaFinalizar, tone: contadores.prontosParaFinalizar?'warning':''}),
      UI.kpiTile({icon:'wrench', label:'Em montagem', value:contadores.emMontagem}),
    ]);
    return `
      ${kpis}
      ${obrasDoDia.length ? obrasDoDia.map(o=>{
        const ambientesAbertos = o.ambientes.filter(a=>{
          const k = C.situacaoAmbiente(a).key;
          return k!=="FINALIZADO" && k!=="FINALIZADO_COM_RESSALVA";
        });
        return `<div class="card pad" style="margin-bottom:10px;">
          <div class="flex-between"><b>${esc(o.cliente)}</b><span class="small muted">${o.numeroOS}</span></div>
          ${o.endereco? `<div class="small muted" style="margin-top:2px;">${UI.icon('map-pin',11)} ${esc(o.endereco)}</div>`:""}
          ${agendaPorObra[o.id]? `<div class="chip brand" style="margin-top:6px;">${UI.icon('calendar',11)} Agenda hoje${agendaPorObra[o.id].equipe? " · "+esc(agendaPorObra[o.id].equipe):""}</div>`:""}
          <div style="margin-top:8px;">
            ${ambientesAbertos.map(a=>{
              const sit = C.situacaoAmbiente(a);
              const pend = M.Store.state.pendencias.filter(p=>p.ambienteId===a.id && p.status!=="RESOLVIDA").length;
              return `<div class="check-row" style="align-items:flex-start;">
                <div style="flex:1;">
                  <div class="flex-gap" style="align-items:center;"><b>${esc(a.nome)}</b>${UI.situacaoAmbienteChip(sit)}</div>
                  ${sit.motivo? `<div class="small" style="color:var(--critical);margin-top:2px;">${UI.icon('lock',10)} ${esc(sit.motivo)}</div>`:""}
                  ${pend? `<div class="small muted" style="margin-top:2px;">${pend} pendência(s) neste ambiente</div>`:""}
                </div>
                <div>${acaoRapidaAmbienteHtml(a, sit)}</div>
              </div>`;
            }).join("")}
          </div>
          <div style="margin-top:8px;display:flex;gap:8px;">
            <a class="btn sm ghost" href="#/obra/${o.id}">Abrir obra</a>
            ${M.Store.pode("pendencia.criar")? `<button class="btn sm ghost" onclick="Act.openPendenciaForm('${o.id}',null)">${UI.icon('alert',12)} + Pendência</button>`:""}
          </div>
        </div>`;
      }).join("") : `<p class="small muted">Nenhuma obra com ambiente em aberto atribuída a você hoje.</p>`}
    `;
  }

  // ---- ASSISTÊNCIA: atendimentos do dia, pendências dos atendimentos,
  // retornos, próximos compromissos.
  // FASE 7 (Assistências V2, §20): consome o modelo novo — próxima visita
  // AGENDADA em vez de `prazo` solto, C.assistenciaComRetornoPendente em vez
  // de reler `visitas[última].desfecho` na mão — nenhuma regra duplicada em
  // relação à tela V2/Agenda. Links agora vão pro Atendimentos V2
  // (#/atendimentos) e pro detalhe (#/assistencia/:id), não mais a lista V1.
  function grupoAssistencia(ctx){
    const meusAtendimentos = M.Store.state.assistencias.filter(a=> a.responsavel===ctx.nome && a.status!=="CONCLUIDA" && a.status!=="CANCELADA")
      .sort((a,b)=>{
        const da = C.proximaVisitaAgendada(a), db = C.proximaVisitaAgendada(b);
        return (da?da.data:"9999") < (db?db.data:"9999") ? -1 : 1;
      });
    const pendAtendimentos = ctx.pendAbertas.filter(p=>p.tipo==="Assistência").sort(C.compararPrioridadePendencia);
    const retornos = M.Store.state.assistencias.filter(a=> a.status!=="CONCLUIDA" && a.status!=="CANCELADA"
      && C.assistenciaComRetornoPendente(a) && (!ctx.restrito || a.responsavel===ctx.nome));

    const kpis = UI.kpiRow([
      UI.kpiTile({icon:'calendar', label:'Atendimentos do dia', value:meusAtendimentos.length}),
      UI.kpiTile({icon:'alert', label:'Pendências dos atendimentos', value:pendAtendimentos.length, tone: pendAtendimentos.length?'warning':''}),
      UI.kpiTile({icon:'clock', label:'Retornos necessários', value:retornos.length, tone: retornos.length?'critical':''}),
      UI.kpiTile({icon:'calendar', label:'Próximos compromissos', value:ctx.compromissosAssistencia.length}),
    ]);

    return `
      ${kpis}
      <div class="card pad">
        <div class="card-title"><span style="flex:1;">Atendimentos do dia</span><a href="#/atendimentos" class="btn ghost sm">ver todos</a></div>
        ${meusAtendimentos.length ? meusAtendimentos.slice(0,6).map(a=>{
          const proxima = C.proximaVisitaAgendada(a);
          return `
          <div class="alert-item" style="cursor:pointer;" onclick="Act.go('#/assistencia/${a.id}')">
            ${UI.assistenciaStatusChip(a.status)}
            <div><div>${esc(a.categoria)} — ${esc(a.obraNome||a.cliente||"")}</div>
            <div class="alert-sub">${proxima? "próxima visita "+C.fmtDate(proxima.data) : "sem visita agendada"}</div></div>
          </div>`;
        }).join("") : `<p class="small muted">Nenhum atendimento seu em aberto.</p>`}
      </div>
      <div class="hr"></div>
      <div class="grid-2">
        ${blocoLista({titulo:"Pendências dos atendimentos", icon:"alert", total:pendAtendimentos.length, href:"#/pendencias",
          itens:pendAtendimentos.slice(0,6).map(alertItemPendenciaHtml), vazio:"Nenhuma pendência de assistência em aberto."})}
        ${blocoLista({titulo:"Retornos necessários", icon:"clock", tone:"warning", total:retornos.length,
          itens:retornos.slice(0,6).map(a=>`<div class="alert-item" style="cursor:pointer;" onclick="Act.go('#/assistencia/${a.id}')">
            <div><div>${esc(a.categoria)} — ${esc(a.obraNome||a.cliente||"")}</div>
            <div class="alert-sub">retorno necessário — sem visita agendada</div></div></div>`),
          vazio:"Nenhum retorno pendente."})}
      </div>
      <div class="hr"></div>
      ${blocoLista({titulo:"Próximos compromissos", icon:"calendar", tone:"neutral", href:"#/agenda",
        itens:ctx.compromissosAssistencia.slice(0,6).map(compromissoAgendaHtml), vazio:"Nada nos próximos 7 dias."})}
    `;
  }

  M.Pages.hoje = function(){
    const nome = M.Store.state.usuarioAtual;
    const primeiroNome = (nome||"").split(" ")[0];
    const colab = M.colabByNome(nome);
    const cargo = colab ? colab.cargo : "";
    const perfil = colab ? colab.perfil : null;

    const restrito = !M.Store.pode("verTodasObras");
    const meuObraIds = restrito ? M.Store.obraIdsDoColaborador(nome) : null;
    const obras = restrito ? M.Store.state.obras.filter(o=>meuObraIds.has(o.id)) : M.Store.state.obras;
    const pendAbertas = M.Store.state.pendencias.filter(p=> p.status!=="RESOLVIDA" && (!restrito || meuObraIds.has(p.obraId)));

    // ---------- dados comuns entre grupos (calculados uma vez) ----------
    // REFINO VISUAL V2 (ajustes finais, §1/§2): estas listas ficam INTEIRAS
    // aqui (sem .slice de exibição) — cada grupo aplica o corte só na hora
    // de renderizar a lista. Isso é o que permite os KPIs de topo mostrarem
    // a contagem REAL (ex.: "Obras em risco: 9"), não o tamanho já cortado
    // pra exibição (que antes deixava o número preso em 6). Nenhuma regra
    // de negócio muda aqui — só onde o corte é aplicado.
    const riscoRows = obras.map(o=>({o, sit:C.situacaoObra(o), parada:C.obraParada(o)}))
      .filter(r=> r.sit.nivel==="ALTO" || r.sit.nivel==="MEDIO")
      .sort((a,b)=> ({ALTO:0,MEDIO:1,BAIXO:2,"N/A":3}[a.sit.nivel]) - ({ALTO:0,MEDIO:1,BAIXO:2,"N/A":3}[b.sit.nivel]) || a.sit.diasEntrega - b.sit.diasEntrega);
    // ambientes travados — mesma definição de M.Calc.situacaoAmbiente usada
    // em Montagem/Obra (§13/reuso), não uma nova regra de "travado".
    const ambientesTravados = obras.flatMap(o=> o.ambientes.map(a=>({o,a,sit:C.situacaoAmbiente(a)})))
      .filter(x=> x.sit.key==="TRAVADO");
    const prioridadeFechamento = C.prioridadeParaFinalizar(obras);
    // FASE 6 (Agenda V2, §21): "próximos compromissos" (7 dias) agora vem da
    // Agenda de verdade (M.Agenda — js/pages/agenda.js), não mais do
    // M.Calendario legado — mesma fonte que a tela Agenda usa, respeitando a
    // mesma restrição de escopo por perfil que o resto da tela já aplica
    // (M.Agenda.todosEventosRaw já filtra por dentro — nenhuma lógica de
    // calendário duplicada aqui, só a chamada).
    const compromissos = M.Agenda.proximosEventos(7);
    const compromissosAssistencia = M.Agenda.proximosEventos(7, ["ASSISTENCIA"]);

    const ctx = {nome, restrito, meuObraIds, obras, pendAbertas, riscoRows, ambientesTravados, prioridadeFechamento, compromissos, compromissosAssistencia};

    let corpo;
    switch(perfil){
      case "ADMIN": case "GESTOR": corpo = grupoAdminGestor(ctx); break;
      case "PCP": corpo = grupoPCP(ctx); break;
      case "LIDERANCA": corpo = grupoLider(ctx); break;
      case "OPERADOR": corpo = grupoProducao(ctx); break;
      case "MONTADOR": corpo = grupoMontador(ctx); break;
      case "ASSISTENCIA": corpo = grupoAssistencia(ctx); break;
      // sem colaborador mapeado pro usuário atual (ex.: sessão de teste) —
      // cai no conjunto mais abrangente, nunca quebra a tela.
      default: corpo = grupoAdminGestor(ctx);
    }

    const totalAtencao = ctx.pendAbertas.filter(p=> M.bloqueiaFechamento(p.impacto) || (p.prazo && C.diasAte(p.prazo)<=0)).length;
    const html = `
      <p class="small muted" style="margin-bottom:4px;">${esc(saudacao())}, ${esc(primeiroNome)}${cargo? " · "+esc(cargo):""}.</p>
      <p class="small" style="margin-bottom:18px;font-weight:700;">
        ${totalAtencao? `${totalAtencao} ${totalAtencao===1?'item trava':'itens travam'} fechamento e esperam por você.` : "Nada travando fechamento no momento."}
      </p>
      ${corpo}
    `;
    return {title:"Hoje", crumb:"O que exige você, hoje", html,
      actionsHtml:`${UI.pageSearchInput({id:'hojeSearch', placeholder:'Buscar obra, cliente, OS...'})} ${UI.botaoNovaObraHtml()} <button class="btn" onclick="Act.openPendenciaForm(null,null,null)">${UI.icon('alert',14)} Registrar pendência</button>`,
      afterRender(){
        UI.attachQuickSearch('hojeSearch', M.Store.state.obras.map(o=>({label:o.cliente, sub:o.numeroOS, href:`#/obra/${o.id}`})));
      }
    };
  };
})();
