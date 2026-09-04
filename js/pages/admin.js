/* ============================================================
   PÁGINA: Admin V2 (FASE 8) — área de gestão do sistema
   ------------------------------------------------------------
   Responde "como está a operação como um todo, o que mudou, quem está
   fazendo o quê, e onde preciso intervir como gestor?" — Hoje continua
   sendo "o que precisa de atenção agora"; isto aqui é panorama/análise/
   gestão/auditoria/configuração, num nível de leitura diferente (ver §6
   do pedido: tendência/distribuição/envelhecimento/concentração, não os
   mesmos números crus de Hoje).

   Estrutura: UMA rota (#/admin/:sub) com subnavegação interna por tabs —
   PANORAMA · INDICADORES · DESEMPENHO · EQUIPE/USUÁRIOS · AUDITORIA · TV ·
   CONFIGURAÇÕES. Nenhum item novo no sidebar (continua só "Admin").

   Permissões: 100% reaproveitadas (admin.ver/indicadores/auditoria/equipe/
   configuracoes/usuarios, tv.configurar) — nenhuma permissão nova criada
   pra esta fase. Cada tab checa a sua própria permissão, então acessar uma
   sub-rota direta por link sem a permissão certa cai no aviso de acesso
   negado daquela seção (nunca esconde só no menu, igual o resto do app já
   faz desde a Fase 1).

   Fonte de dados: 100% Store/Calc/helpers já existentes — nenhum cache
   paralelo, nenhuma segunda regra de contagem, nenhuma inferência de fase
   nova. state.historico e state.auditoria continuam sendo as DUAS únicas
   fontes de auditoria (nunca uma terceira) — este arquivo só normaliza os
   dois num formato comum pra exibição (ver mergeEventos()), sem persistir
   nada novo.
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  function esc(s){ return UI.esc(s); }

  // ============================================================
  // SUBNAV — 7 tabs, cada uma com a permissão que já existia (Fase 1/2).
  // "panorama" usa admin.ver (só ADMIN/GESTOR têm hoje — ver M.PERFIS);
  // as demais reaproveitam a MESMA chave que a rota legada correspondente
  // já usava em ROUTE_PERMS (router.js) — nenhuma permissão nova.
  // ============================================================
  const TABS = [
    {key:"panorama",     label:"Panorama",         icon:"home",     perm:"admin.ver"},
    {key:"indicadores",  label:"Indicadores",      icon:"bar-chart",perm:"admin.indicadores"},
    {key:"desempenho",   label:"Desempenho",       icon:"trophy",   perm:"admin.indicadores"},
    {key:"equipe",       label:"Equipe / Usuários",icon:"users",    perm:"admin.equipe"},
    {key:"auditoria",    label:"Auditoria",        icon:"shield",   perm:"admin.auditoria"},
    {key:"tv",           label:"TV",               icon:"tv",       perm:"admin.ver"},
    {key:"configuracoes",label:"Configurações",    icon:"settings", perm:"admin.configuracoes"},
  ];

  function tabsPermitidas(){ return TABS.filter(t=> M.Store.pode(t.perm)); }

  function semAcessoHtml(rotulo){
    return `<div class="card pad"><p>Seu perfil (<b>${esc(M.Store.perfilAtual().label)}</b>) não tem acesso a ${esc(rotulo)}.</p></div>`;
  }

  // ============================================================
  // PERÍODO (§8) — 7/30/90/Personalizado, sempre com período+base visíveis.
  // Mesmo formato de estado usado por Indicadores e Desempenho
  // (M.UIState.adminIndicadoresPeriodo / adminDesempenhoPeriodo): Number
  // (dias) OU {ini,fim} (personalizado).
  // ============================================================
  function periodoRange(val){
    if(val && typeof val==="object"){
      return {inicio: val.ini || M.dOff(-30), fim: val.fim || M.todayISO()};
    }
    const dias = Number(val)||30;
    return {inicio: M.dOff(-dias), fim: M.todayISO()};
  }
  function periodoLabelTexto(val){
    if(val && typeof val==="object") return `${C.fmtDate(val.ini)} — ${C.fmtDate(val.fim)}`;
    return `Últimos ${Number(val)||30} dias`;
  }
  function periodoSeletorHtml(valorAtual, actionSetter, actionCustom){
    const isCustom = valorAtual && typeof valorAtual==="object";
    const r = periodoRange(valorAtual);
    return `
      <div class="flex-gap" style="flex-wrap:wrap;align-items:center;gap:8px;">
        <div class="segmented">
          <button class="${!isCustom&&Number(valorAtual)===7?'active':''}" onclick="${actionSetter}(7)">7 dias</button>
          <button class="${!isCustom&&Number(valorAtual)===30?'active':''}" onclick="${actionSetter}(30)">30 dias</button>
          <button class="${!isCustom&&Number(valorAtual)===90?'active':''}" onclick="${actionSetter}(90)">90 dias</button>
          <button class="${isCustom?'active':''}" onclick="${actionSetter}('custom')">Personalizado</button>
        </div>
        ${isCustom? `
          <input type="date" value="${r.inicio}" onchange="${actionCustom}('ini', this.value)" style="max-width:150px;">
          <span class="small muted">até</span>
          <input type="date" value="${r.fim}" onchange="${actionCustom}('fim', this.value)" style="max-width:150px;">
        ` : ""}
      </div>`;
  }

  // ============================================================
  // PANORAMA (§4-6, §23)
  // ============================================================
  function secPanorama(){
    if(!M.Store.pode("admin.ver")) return semAcessoHtml("o Panorama");
    const obras = M.Store.obrasOperacionais(); // rascunho fica de fora (item 27 — nenhum dado que não é operacional vira KPI)
    const riscos = obras.map(o=> ({o, r: C.situacaoObra(o)}));
    const obrasRisco = riscos.filter(x=> x.r.nivel==="MEDIO"||x.r.nivel==="ALTO");
    const obrasAltoRisco = riscos.filter(x=> x.r.nivel==="ALTO");
    const obrasAtrasadas = obras.filter(o=> C.diasAte(o.dataEntregaPrevista)<0 && o.status!=="FINALIZADA");
    const pendAbertas = M.Store.state.pendencias.filter(p=>p.status!=="RESOLVIDA");
    const pendCriticas = pendAbertas.filter(C.pendenciaCritica);
    const contMont = C.contadoresMontagem(obras);
    const agMont = C.agregarMontagem(obras);
    const asst = C.assistenciasResumo();
    const entregas7 = obras.filter(o=>{ const d=C.diasAte(o.dataEntregaPrevista); return d>=0 && d<=7 && o.status!=="FINALIZADA"; });

    // Ordem do array = ordem visual (kpi-row flui em linhas) — nas telas
    // estreitas (mobile) as primeiras entradas aparecem primeiro na tela
    // (§24: "mostrar primeiro obras em risco/pendências críticas/travados/
    // atrasos/assistências abertas" — os 5 primeiros aqui são exatamente
    // esses, nessa ordem; o resto é secundário, vem depois).
    const kpis = [
      {label:"Em risco", value:obrasRisco.length, tone:obrasRisco.length?"warning":"good", icon:"alert"},
      {label:"Pendências críticas", value:pendCriticas.length, tone:pendCriticas.length?"critical":"good", icon:"alert"},
      {label:"Ambientes travados", value:contMont.travados, tone:contMont.travados?"warning":"good", icon:"wrench"},
      {label:"Atrasadas", value:obrasAtrasadas.length, tone:obrasAtrasadas.length?"critical":"good", icon:"clock"},
      {label:"Assistências abertas", value:asst.abertas, tone:asst.abertas?"warning":"good", icon:"lifebuoy"},
      {label:"Obras ativas", value:obras.length, icon:"building"},
      {label:"Montagens em andamento", value:contMont.emMontagem, icon:"wrench"},
      {label:"Entregas em 7 dias", value:entregas7.length, icon:"calendar"},
    ];

    // ---- Bloco 1 (esquerda): exceções operacionais — concentração/envelhecimento, não a mesma contagem crua de Hoje (§6) ----
    const idadeMediaCriticas = pendCriticas.length
      ? Math.round(pendCriticas.reduce((s,p)=>s+C.diasDesde(p.abertura),0)/pendCriticas.length) : 0;
    const porObraCritica = {};
    pendCriticas.forEach(p=>{ const k=p.obraNome||"Sem obra"; (porObraCritica[k]=porObraCritica[k]||[]).push(p); });
    const concentracaoObras = Object.keys(porObraCritica).map(k=>({obra:k, qtd:porObraCritica[k].length,
      idadeMax: Math.max(...porObraCritica[k].map(p=>C.diasDesde(p.abertura)))})).sort((a,b)=>b.qtd-a.qtd).slice(0,5);

    const travadosList = [];
    obras.forEach(o=> o.ambientes.forEach(a=>{ const sit=C.situacaoAmbiente(a); if(sit.key==="TRAVADO") travadosList.push({o,a,sit}); }));

    const bloco1 = `
      ${UI.secHead({titulo:"Exceções operacionais", icon:"alert"})}
      <div class="card pad" style="margin-bottom:10px;">
        <div class="small muted" style="margin-bottom:6px;">Obras em risco alto (${obrasAltoRisco.length})</div>
        ${obrasAltoRisco.length? obrasAltoRisco.slice(0,5).map(x=>`
          <div class="compact-row" onclick="Act.go('#/obra/${x.o.id}')">
            <div class="cr-main"><div class="cr-top"><span class="cr-title">${esc(x.o.cliente)}</span>${UI.riscoChip(x.r)}</div>
            <div class="cr-sub">${esc(x.o.numeroOS||"")} · entrega em ${C.diasAte(x.o.dataEntregaPrevista)}d</div></div>
          </div>`).join("") : `<p class="small muted">Nenhuma obra em risco alto agora.</p>`}
      </div>
      <div class="card pad" style="margin-bottom:10px;">
        <div class="small muted" style="margin-bottom:6px;">Concentração de pendências críticas por obra (idade média geral: ${idadeMediaCriticas}d)</div>
        ${concentracaoObras.length? `<table class="tbl"><tbody>
          ${concentracaoObras.map(c=>`<tr><td>${esc(c.obra)}</td><td class="right"><b class="critical">${c.qtd}</b></td><td class="right small muted">mais antiga: ${c.idadeMax}d</td></tr>`).join("")}
        </tbody></table>` : `<p class="small muted">Nenhuma pendência crítica em aberto.</p>`}
      </div>
      <div class="card pad">
        <div class="small muted" style="margin-bottom:6px;">Ambientes travados (${travadosList.length})</div>
        ${travadosList.length? travadosList.slice(0,5).map(x=>`
          <div class="compact-row" onclick="Act.go('#/obra/${x.o.id}')">
            <div class="cr-main"><div class="cr-top"><span class="cr-title">${esc(x.a.nome)}</span><span class="chip blocked">${x.sit.origem==="MANUAL"?"travamento manual":"pendência"}</span></div>
            <div class="cr-sub">${esc(x.o.cliente)}${x.sit.motivo? " · "+esc(x.sit.motivo):""}</div></div>
          </div>`).join("") : `<p class="small muted">Nenhum ambiente travado agora.</p>`}
      </div>`;

    // ---- Bloco 2+3+4 (direita): fluxo por fase · montagem/fechamento · assistências ----
    const fasesOrdenadas = M.Store.fasesMacroOrdenadas();
    const totalFluxo = obras.length || 1;
    const contagemFase = fasesOrdenadas.map(f=> ({f, qtd: obras.filter(o=>o.faseMacro===f.key).length}));
    const semFase = obras.filter(o=> !fasesOrdenadas.some(f=>f.key===o.faseMacro)).length;

    const obrasPertoDeConcluir = obras.filter(o=>{ const tf=C.taxaFechamento(o); return tf>=80 && tf<100; });

    const bloco234 = `
      ${UI.secHead({titulo:"Fluxo de obras (por fase macro)", icon:"kanban"})}
      <div class="card pad" style="margin-bottom:10px;">
        ${contagemFase.map(x=>`
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
            <div style="width:130px;font-size:11px;color:var(--ink-mute);text-align:right;flex-shrink:0;">${esc(x.f.label)}</div>
            <div style="flex:1;background:var(--surface-alt);border-radius:4px;height:12px;"><div style="width:${Math.round(100*x.qtd/totalFluxo)}%;height:12px;background:var(--brand);border-radius:4px;"></div></div>
            <div style="width:30px;font-size:11px;text-align:right;color:var(--ink-soft);">${x.qtd}</div>
          </div>`).join("")}
        ${semFase? `<p class="small muted" style="margin-top:4px;">${semFase} obra(s) sem fase definida (dado legado) — não tratadas como nenhuma fase específica.</p>` : ""}
      </div>

      ${UI.secHead({titulo:"Montagem / fechamento", icon:"wrench"})}
      <div class="card pad" style="margin-bottom:10px;">
        <div class="kpi-row" style="margin-bottom:8px;">
          ${UI.kpiTile({label:"Físico", value:agMont.fisico+"%"})}
          ${UI.kpiTile({label:"Fechamento", value:agMont.fechamento+"%"})}
          ${UI.kpiTile({label:"Travados", value:contMont.travados, tone:contMont.travados?"warning":""})}
          ${UI.kpiTile({label:"Prontos p/ finalizar", value:contMont.prontosParaFinalizar})}
        </div>
        <div class="small muted">Perto de concluir (fechamento ≥80%, ainda não 100%): ${obrasPertoDeConcluir.length}</div>
        ${obrasPertoDeConcluir.slice(0,4).map(o=>`
          <div class="compact-row" onclick="Act.go('#/obra/${o.id}')"><div class="cr-main"><span class="cr-title">${esc(o.cliente)}</span> <span class="small muted">— ${C.taxaFechamento(o)}% fechado</span></div></div>
        `).join("")}
      </div>

      ${UI.secHead({titulo:"Assistências", icon:"lifebuoy"})}
      <div class="card pad">
        <div class="kpi-row">
          ${UI.kpiTile({label:"Abertas", value:asst.abertas, tone:asst.abertas?"warning":""})}
          ${UI.kpiTile({label:"Vencidas", value:asst.vencidas, tone:asst.vencidas?"critical":""})}
          ${UI.kpiTile({label:"Aguard. material", value:asst.aguardandoPeca})}
          ${UI.kpiTile({label:"Com retorno pendente", value:asst.comRetorno, tone:asst.comRetorno?"warning":""})}
        </div>
      </div>`;

    // ---- Bloco 5: agenda/capacidade (largura total, abaixo das 2 colunas) ----
    const eventos7 = M.Agenda.proximosEventos(7);
    const conflitos7 = C.conflitosAgenda(M.Agenda.todosEventosRaw().filter(e=> C.diasAte(e.data)>=0 && C.diasAte(e.data)<=7));
    const cargaPorPessoa = {};
    eventos7.forEach(e=> C.pessoasDoEvento(e).forEach(p=>{ cargaPorPessoa[p]=(cargaPorPessoa[p]||0)+1; }));
    const cargaTop = Object.keys(cargaPorPessoa).map(p=>({pessoa:p,qtd:cargaPorPessoa[p]})).sort((a,b)=>b.qtd-a.qtd).slice(0,5);

    const bloco5 = `
      ${UI.secHead({titulo:"Agenda / capacidade — próximos 7 dias", icon:"calendar"})}
      <div class="card pad">
        <div class="kpi-row" style="margin-bottom:10px;">
          ${UI.kpiTile({label:"Compromissos", value:eventos7.length})}
          ${UI.kpiTile({label:"Conflitos de agenda", value:conflitos7.length, tone:conflitos7.length?"warning":""})}
          ${UI.kpiTile({label:"Pessoas com compromisso", value:Object.keys(cargaPorPessoa).length})}
        </div>
        ${cargaTop.length? `<div class="small muted" style="margin-bottom:6px;">Maior carga de agenda (7 dias) — informativo, sem roteirização automática</div>
        <table class="tbl"><tbody>${cargaTop.map(c=>`<tr><td>${UI.person(c.pessoa)}</td><td class="right"><b>${c.qtd}</b> compromisso(s)</td></tr>`).join("")}</tbody></table>` : `<p class="small muted">Nenhum compromisso nos próximos 7 dias.</p>`}
      </div>`;

    return `
      <div class="kpi-row">${kpis.map(k=>UI.kpiTile(k)).join("")}</div>
      <div class="grid-2" style="align-items:start;">
        <div>${bloco1}</div>
        <div>${bloco234}</div>
      </div>
      ${bloco5}
      <div class="sec-head" style="margin-top:20px;"><div class="sec-title"><b>Atalhos administrativos</b></div></div>
      <div class="flex-gap" style="flex-wrap:wrap;">
        <a class="btn sm" href="#/obras">${UI.icon('building',13)} Obras</a>
        <a class="btn sm" href="#/pendencias">${UI.icon('alert',13)} Pendências</a>
        <a class="btn sm" href="#/montagem">${UI.icon('wrench',13)} Montagem</a>
        <a class="btn sm" href="#/assistencias">${UI.icon('lifebuoy',13)} Assistências</a>
        <a class="btn sm" href="#/agenda">${UI.icon('calendar',13)} Agenda</a>
      </div>`;
  }

  // ============================================================
  // INDICADORES (§7-8) — consolidação por categoria, "dados insuficientes"
  // em vez de fabricar tendência onde não há histórico confiável.
  // ============================================================
  function chipInsuficiente(){ return `<span class="chip neutral">dados insuficientes</span>`; }

  function secIndicadores(){
    if(!M.Store.pode("admin.indicadores")) return semAcessoHtml("os Indicadores");
    const periodoVal = M.UIState.adminIndicadoresPeriodo;
    const {inicio, fim} = periodoRange(periodoVal);
    const obras = M.Store.obrasOperacionais();
    const riscos = obras.map(o=>C.situacaoObra(o));
    const emRisco = riscos.filter(r=>r.nivel==="MEDIO"||r.nivel==="ALTO").length;
    const atrasadas = obras.filter(o=>C.diasAte(o.dataEntregaPrevista)<0 && o.status!=="FINALIZADA").length;
    const fasesOrdenadas = M.Store.fasesMacroOrdenadas();
    const porFase = fasesOrdenadas.map(f=>({f, qtd: obras.filter(o=>o.faseMacro===f.key).length}));

    const pendTodas = M.Store.state.pendencias;
    const pendAbertas = pendTodas.filter(p=>p.status!=="RESOLVIDA");
    const pendCriticas = pendAbertas.filter(C.pendenciaCritica);
    const pendVencidas = pendAbertas.filter(p=>p.prazo && C.diasAte(p.prazo)<0);
    const idadeMedia = pendAbertas.length ? Math.round(pendAbertas.reduce((s,p)=>s+C.diasDesde(p.abertura),0)/pendAbertas.length) : 0;
    const pendResolvidasPeriodo = pendTodas.filter(p=>p.status==="RESOLVIDA" && p.resolvidoEm && p.resolvidoEm>=inicio && p.resolvidoEm<=fim);
    const porImpacto = {}; pendAbertas.forEach(p=>{ porImpacto[p.impacto]=(porImpacto[p.impacto]||0)+1; });
    const porOrigem = {}; pendAbertas.forEach(p=>{ const k=p.origem||"—"; porOrigem[k]=(porOrigem[k]||0)+1; });

    const agMont = C.agregarMontagem(obras);
    const contMont = C.contadoresMontagem(obras);

    const asst = C.assistenciasResumo();
    const visitasPeriodo = M.Store.state.assistencias.reduce((s,a)=> s + C.visitasComStatus(a,"REALIZADA").filter(v=>v.data>=inicio&&v.data<=fim).length, 0);
    const porGarantia = {}; M.Store.state.assistencias.forEach(a=>{ const g=a.garantia||"EM_ANALISE"; porGarantia[g]=(porGarantia[g]||0)+1; });

    const eventosAgenda = M.Agenda.proximosEventos(Number(periodoVal)&&!isNaN(Number(periodoVal)) ? Number(periodoVal) : 30);
    const conflitosAgendaN = C.conflitosAgenda(M.Agenda.todosEventosRaw().filter(e=>{ const d=C.diasAte(e.data); return d>=0 && d<= (Number(periodoVal)||30); })).length;
    const cargaEquipe = {}; eventosAgenda.forEach(e=> C.pessoasDoEvento(e).forEach(p=>{ cargaEquipe[p]=(cargaEquipe[p]||0)+1; }));

    return `
      <div class="card pad" style="margin-bottom:16px;">
        <div class="flex-between" style="flex-wrap:wrap;gap:10px;">
          ${periodoSeletorHtml(periodoVal, "Act.setAdminIndicadoresPeriodo", "Act.setAdminIndicadoresPeriodoCustom")}
        </div>
        <p class="small muted" style="margin-top:8px;">Período usado nas métricas "no período": <b>${esc(periodoLabelTexto(periodoVal))}</b> (${inicio} a ${fim}). Métricas "agora" (abertas/atrasadas/travados) são sempre a fotografia atual, independente do período.</p>
      </div>

      <div class="sec-head"><div class="sec-title"><b>Obras</b></div></div>
      <div class="card pad" style="margin-bottom:16px;">
        <div class="kpi-row" style="margin-bottom:10px;">
          ${UI.kpiTile({label:"Ativas (agora)", value:obras.length})}
          ${UI.kpiTile({label:"Em risco (agora)", value:emRisco, tone:emRisco?"warning":""})}
          ${UI.kpiTile({label:"Atrasadas (agora)", value:atrasadas, tone:atrasadas?"critical":""})}
        </div>
        <table class="tbl"><thead><tr><th>Fase</th><th class="right">Qtd.</th></tr></thead><tbody>
          ${porFase.map(x=>`<tr><td>${esc(x.f.label)}</td><td class="right">${x.qtd}</td></tr>`).join("")}
        </tbody></table>
        <div class="flex-between" style="margin-top:10px;"><span class="small muted">Tempo médio por fase</span>${chipInsuficiente()}</div>
      </div>

      <div class="sec-head"><div class="sec-title"><b>Pendências</b></div></div>
      <div class="card pad" style="margin-bottom:16px;">
        <div class="kpi-row" style="margin-bottom:10px;">
          ${UI.kpiTile({label:"Abertas (agora)", value:pendAbertas.length})}
          ${UI.kpiTile({label:"Críticas (agora)", value:pendCriticas.length, tone:pendCriticas.length?"critical":""})}
          ${UI.kpiTile({label:"Vencidas (agora)", value:pendVencidas.length, tone:pendVencidas.length?"critical":""})}
          ${UI.kpiTile({label:"Idade média (dias, agora)", value:idadeMedia})}
          ${UI.kpiTile({label:"Resolvidas no período", value:pendResolvidasPeriodo.length, tone:"good"})}
        </div>
        <div class="grid-2">
          <div><div class="small muted" style="margin-bottom:4px;">Por impacto (abertas)</div>
            <table class="tbl"><tbody>${Object.keys(porImpacto).map(k=>`<tr><td>${esc(M.impactoDef(k).label)}</td><td class="right">${porImpacto[k]}</td></tr>`).join("")||"<tr><td class=\"small muted\">—</td></tr>"}</tbody></table></div>
          <div><div class="small muted" style="margin-bottom:4px;">Por origem (abertas)</div>
            <table class="tbl"><tbody>${Object.keys(porOrigem).map(k=>`<tr><td>${esc(k)}</td><td class="right">${porOrigem[k]}</td></tr>`).join("")||"<tr><td class=\"small muted\">—</td></tr>"}</tbody></table></div>
        </div>
      </div>

      <div class="sec-head"><div class="sec-title"><b>Montagem</b></div></div>
      <div class="card pad" style="margin-bottom:16px;">
        <div class="kpi-row" style="margin-bottom:6px;">
          ${UI.kpiTile({label:"Física (agora)", value:agMont.fisico+"%"})}
          ${UI.kpiTile({label:"Fechamento (agora)", value:agMont.fechamento+"%"})}
          ${UI.kpiTile({label:"Travamentos (agora)", value:contMont.travados, tone:contMont.travados?"warning":""})}
        </div>
        <div class="flex-between"><span class="small muted">Tempo até finalizar</span>${chipInsuficiente()}</div>
      </div>

      <div class="sec-head"><div class="sec-title"><b>Assistência</b></div></div>
      <div class="card pad" style="margin-bottom:16px;">
        <div class="kpi-row" style="margin-bottom:10px;">
          ${UI.kpiTile({label:"Abertas (agora)", value:asst.abertas, tone:asst.abertas?"warning":""})}
          ${UI.kpiTile({label:"Concluídas (total)", value:asst.concluidas})}
          ${UI.kpiTile({label:"Aguard. material (agora)", value:asst.aguardandoPeca})}
          ${UI.kpiTile({label:"Visitas realizadas no período", value:visitasPeriodo})}
        </div>
        <div class="small muted" style="margin-bottom:4px;">Cobertura (por garantia, todas)</div>
        <table class="tbl"><tbody>${Object.keys(porGarantia).map(k=>`<tr><td>${esc(M.garantiaDef(k).label)}</td><td class="right">${porGarantia[k]}</td></tr>`).join("")}</tbody></table>
      </div>

      <div class="sec-head"><div class="sec-title"><b>Agenda</b></div></div>
      <div class="card pad">
        <p class="small muted" style="margin-bottom:8px;">Agenda é sempre olhar pra frente — as métricas abaixo usam os próximos ${Number(periodoVal)||30} dias a partir de hoje, não os últimos ${Number(periodoVal)||30}.</p>
        <div class="kpi-row">
          ${UI.kpiTile({label:"Compromissos", value:eventosAgenda.length})}
          ${UI.kpiTile({label:"Conflitos", value:conflitosAgendaN, tone:conflitosAgendaN?"warning":""})}
          ${UI.kpiTile({label:"Pessoas com carga", value:Object.keys(cargaEquipe).length})}
        </div>
      </div>`;
  }

  // ============================================================
  // DESEMPENHO (§9-10) — acompanhar execução, NUNCA ranking/nota geral.
  // Todos os colaboradores ativos, ordem alfabética (não por performance).
  // Reusa C.desempenhoColaborador/C.pendenciasDoColaborador diretamente —
  // nunca C.indiceDesempenho/C.rankingColaboradores (esses compõem um
  // índice ponderado único e ordenam por ele, exatamente o padrão tóxico
  // que o pedido pede pra evitar — ver js/pages/desempenho.js, mantida
  // intocada como rota legada).
  // ============================================================
  function secDesempenho(){
    if(!M.Store.pode("admin.indicadores")) return semAcessoHtml("o Desempenho");
    const periodoVal = M.UIState.adminDesempenhoPeriodo;
    const {inicio, fim} = periodoRange(periodoVal);
    const ativos = M.COLABORADORES.filter(c=>c.ativo!==false).slice().sort((a,b)=> a.nome.localeCompare(b.nome,"pt-BR"));

    function linhaColaborador(c){
      const base = C.desempenhoColaborador(c.nome);
      const pendPeriodo = M.Store.state.pendencias.filter(p=> p.responsavel===c.nome && p.abertura>=inicio && p.abertura<=fim);
      const pendResolvidasPeriodo = pendPeriodo.filter(p=>p.status==="RESOLVIDA");
      const pendAtrasadasAgora = M.Store.state.pendencias.filter(p=> p.responsavel===c.nome && p.status!=="RESOLVIDA" && p.prazo && C.diasAte(p.prazo)<0);
      const tempos = pendResolvidasPeriodo.map(p=>C.diasDesde(p.abertura)).filter(d=>d>=0);
      const tempoMedio = tempos.length? Math.round((tempos.reduce((s,d)=>s+d,0)/tempos.length)*10)/10 : null;
      const taxaResolucao = pendPeriodo.length? Math.round(100*pendResolvidasPeriodo.length/pendPeriodo.length) : null;
      return `
        <div class="card pad" style="margin-bottom:10px;">
          <div class="flex-between">
            <div class="flex-gap"><span class="avatar">${UI.initials(c.nome)}</span><div><b>${esc(c.nome)}</b><div class="small muted">${esc(c.cargo||"")}</div></div></div>
            ${UI.perfilChip(c.perfil)}
          </div>
          <div class="hr"></div>
          <div class="grid-3" style="row-gap:10px;">
            <div><div class="small muted">Tarefas concluídas (acumulado)</div><b>${base.tarefasConcluidas}</b> <span class="small muted">/ ${base.tarefasTotal}</span></div>
            <div><div class="small muted">Valor processado (acumulado)</div><b>${C.fmtBRLk(base.valorProcessado)}</b></div>
            <div><div class="small muted">Obras / ambientes trabalhados</div><b>${base.obrasTrabalhadas}</b> / ${base.ambientesTrabalhados}</div>
            <div><div class="small muted">Pendências atribuídas no período</div><b>${pendPeriodo.length}</b></div>
            <div><div class="small muted">Resolvidas no período</div><b>${pendResolvidasPeriodo.length}</b></div>
            <div><div class="small muted">Atrasadas (agora)</div><b class="${pendAtrasadasAgora.length?'critical':''}">${pendAtrasadasAgora.length}</b></div>
            <div><div class="small muted">Taxa de resolução no período</div><b>${taxaResolucao==null?"—":taxaResolucao+"%"}</b></div>
            <div><div class="small muted">Tempo médio até resolver (período)</div><b>${tempoMedio==null?"—":tempoMedio+"d"}</b></div>
            <div><div class="small muted">Retrabalhos (acumulado)</div><b class="${base.refacoes?'critical':''}">${base.refacoes}</b></div>
          </div>
          ${pendPeriodo.length<3 ? `<p class="small muted" style="margin-top:8px;">Poucos registros no período — números baixos aqui não significam baixo desempenho, só pouco volume atribuído.</p>` : ""}
        </div>`;
    }

    return `
      <div class="help-banner">${UI.icon('shield',13)} Acompanha execução — não é um ranking. Não existe nota geral automática nem posição colorida entre pessoas; volume baixo é contexto, não conclusão de desempenho ruim.</div>
      <div class="card pad" style="margin-bottom:16px;">
        ${periodoSeletorHtml(periodoVal, "Act.setAdminDesempenhoPeriodo", "Act.setAdminIndicadoresPeriodoCustom")}
        <p class="small muted" style="margin-top:8px;">Pendências/resolução usam o período selecionado (<b>${esc(periodoLabelTexto(periodoVal))}</b>, ${inicio} a ${fim}). Tarefas e valor processado ainda não têm filtro de período disponível nesta versão — mostrados acumulados desde o início do uso do sistema.</p>
      </div>
      ${ativos.map(linhaColaborador).join("") || `<p class="small muted">Nenhum colaborador ativo cadastrado.</p>`}
    `;
  }

  // ============================================================
  // EQUIPE / USUÁRIOS (§11-14)
  // ============================================================
  const PERFIS_OFICIAIS = ["ADMIN","GESTOR","PCP","LIDERANCA","OPERADOR","MONTADOR","ASSISTENCIA"];
  // "principais permissões" — recorte curto (não a matriz de 40+ linhas),
  // pensado pra caber numa linha de card. Reusa Store.podePerfil (mesma
  // leitura efetiva usada pela matriz completa de Configurações→Permissões).
  const PERMISSOES_PRINCIPAIS = [
    ["Ver valores", "verValores"], ["Ver indicadores", "verIndicadores"], ["Acessar Admin", "admin.ver"],
    ["Editar permissões", "editarPermissoes"], ["Resolver pendência", "pendencia.resolver"],
  ];

  function secEquipe(){
    if(!M.Store.pode("admin.equipe")) return semAcessoHtml("Equipe / Usuários");
    const podeGerenciar = M.Store.pode("verConfiguracoes");
    const nuvemOk = !!(M.Supa && M.Supa.habilitado);
    const busca = (M.UIState.adminEquipeBusca||"").toLowerCase();
    let lista = M.COLABORADORES.slice().sort((a,b)=> (a.ativo===false?1:0)-(b.ativo===false?1:0) || a.nome.localeCompare(b.nome,"pt-BR"));
    if(busca) lista = lista.filter(c=> c.nome.toLowerCase().includes(busca) || (c.cargo||"").toLowerCase().includes(busca));

    const linhas = lista.map(c=>{
      const inativo = c.ativo===false;
      const obraIds = M.Store.obraIdsDoColaborador(c.nome);
      return `<div class="mcard" style="${inativo?'opacity:.6;':''}">
        <div class="mcard-top">
          <div class="flex-gap"><span class="avatar">${UI.initials(c.nome)}</span><div class="mcard-title">${esc(c.nome)}</div></div>
          ${podeGerenciar && nuvemOk ? `<button class="btn-icon" title="Editar" onclick="Act.openColaboradorForm('${c.id}')">${UI.icon('edit',14)}</button>`:""}
        </div>
        <div class="flex-gap" style="flex-wrap:wrap;margin:6px 0;">
          ${UI.perfilChip(c.perfil)}
          <span class="chip ${inativo?'neutral':'good'}">${inativo?'inativo':'ativo'}</span>
          ${obraIds.size? `<span class="chip neutral">${obraIds.size} obra(s) no contexto</span>`:""}
        </div>
        <div class="mcard-rows">
          ${PERMISSOES_PRINCIPAIS.map(([label,key])=>`<div class="mcard-row"><span class="mcard-k">${esc(label)}</span><span class="mcard-v">${M.Store.podePerfil(c.perfil,key)?'Permitido':'Negado'}</span></div>`).join("")}
        </div>
      </div>`;
    }).join("");

    const matrizHtml = (M.Pages._configSecoes && M.Pages._configSecoes.permissoes) ? M.Pages._configSecoes.permissoes() : "";

    return `
      <div class="help-banner">${UI.icon('alert',13)} <b>Importante:</b> o "usuário atual" hoje é só um seletor compartilhado (modo de desenvolvimento) — <b>não é autenticação real</b>. Qualquer pessoa pode trocar de usuário na barra superior. Não há login, senha nem verificação de identidade nesta versão. Autenticação real fica para uma fase dedicada de Segurança/Hardening (ver Configurações → Segurança).</div>

      <div class="flex-between" style="flex-wrap:wrap;gap:10px;margin-bottom:12px;">
        <input type="text" placeholder="Buscar por nome ou cargo..." value="${esc(M.UIState.adminEquipeBusca||"")}" oninput="Act.setAdminEquipeBusca(this.value)" style="max-width:280px;">
        ${podeGerenciar? `<button class="btn primary" onclick="Act.openColaboradorForm(null)">${UI.icon('plus',14)} Novo colaborador</button>` : ""}
      </div>
      ${podeGerenciar && !nuvemOk? `<div class="help-banner">${UI.icon('alert',13)} Cadastro de equipe precisa da nuvem conectada (Supabase) — sem isso dá pra ver, mas não pra incluir/editar.</div>`:""}

      <div class="kpi-row" style="margin-bottom:16px;">
        ${PERFIS_OFICIAIS.map(k=> UI.kpiTile({label:M.perfilDef(k).label, value: M.COLABORADORES.filter(c=>c.perfil===k && c.ativo!==false).length})).join("")}
      </div>

      <div class="grid-2">
        ${linhas || `<p class="small muted">Nenhum colaborador encontrado.</p>`}
      </div>

      <div class="sec-head" style="margin-top:20px;"><div class="sec-title"><b>Matriz de permissões efetivas por perfil</b></div></div>
      <p class="small muted" style="margin-bottom:10px;">Troca de perfil de um colaborador fica registrada na Auditoria (quem alterou, colaborador, perfil anterior/novo, quando) — nunca só num toast.</p>
      ${matrizHtml}
    `;
  }

  // ============================================================
  // AUDITORIA (§15-18) — merge de apresentação de state.historico +
  // state.auditoria (NENHUMA estrutura nova persistida). Ver comentário
  // no topo do arquivo.
  // ============================================================
  const TIPO_LABEL_OVERRIDES = {
    OBRA_CRIADA:"Obra criada", OBRA_RASCUNHO_CRIADO:"Rascunho de obra criado", OBRA_ATIVADA:"Obra ativada",
    OBRA_EDITADA:"Obra editada", OBRA_RASCUNHO_ATUALIZADO:"Rascunho atualizado", OBRA_OS_CORRIGIDA:"OS corrigida",
    OBRA_REVISAO_PCP_CONCLUIDA:"Revisão PCP concluída", OBRA_PLANEJAMENTO_MONTAGEM_DEFINIDO:"Planejamento de montagem definido",
    OBRA_AMBIENTE_ADICIONADO:"Ambiente adicionado", OBRA_AMBIENTE_REMOVIDO:"Ambiente removido",
    OBRA_MOVEL_ADICIONADO:"Móvel adicionado", OBRA_MOVEL_MOVIDO:"Móvel movido", OBRA_MOVEL_REMOVIDO:"Móvel removido",
    MUDANCA_ETAPA:"Fase do móvel alterada", LIBERACAO_FORCADA:"Avanço com ressalva (liberação forçada)",
    RESSALVA_RESOLVIDA:"Ressalva resolvida", AMBIENTE_TRAVADO_MANUAL:"Ambiente travado manualmente",
    AMBIENTE_DESTRAVADO:"Ambiente destravado", AMBIENTE_MONTAGEM_INICIADA:"Montagem iniciada",
    AMBIENTE_PRONTO_PARA_FINALIZAR:"Ambiente pronto para finalizar", AMBIENTE_FINALIZADO_APROVADO:"Ambiente finalizado (aprovado)",
    AMBIENTE_FINALIZADO_RESSALVA:"Ambiente finalizado com ressalva", AMBIENTE_REABERTO:"Ambiente reaberto",
    COMPONENTE_CRIADO:"Componente crítico criado", COMPONENTE_STATUS:"Status de componente alterado",
    PENDENCIA_ABERTA:"Pendência aberta", PENDENCIA_ATRIBUIDA:"Pendência atribuída", PENDENCIA_AVANCOU:"Pendência avançou no fluxo",
    PENDENCIA_RESOLVIDA:"Pendência resolvida", PENDENCIA_REABERTA:"Pendência reaberta", PENDENCIA_FOTOS_ADICIONADAS:"Fotos adicionadas à pendência",
    ASSISTENCIA_ABERTA:"Assistência aberta", ASSISTENCIA_CANCELADA:"Assistência cancelada", ASSISTENCIA_CONCLUIDA:"Assistência concluída",
    ASSISTENCIA_VISITA_AGENDADA:"Visita agendada", ASSISTENCIA_VISITA_REGISTRADA:"Visita registrada", ASSISTENCIA_VISITA_CANCELADA:"Visita cancelada",
    ASSISTENCIA_GARANTIA_DEFINIDA:"Cobertura de garantia definida", MUDANCA_RESPONSAVEL:"Mudança de responsável",
    RETRABALHO:"Retrabalho", MONTAGEM_COM_PENDENCIA:"Montagem encerrada com pendência", ARQUIVO_ENVIADO:"Arquivo enviado",
    ALTERACAO_PROCESSO:"Alteração de processo/permissão", AVANCO_COM_RESSALVA:"Avanço com ressalva",
    AGENDA_EVENTO_CRIADO:"Evento de agenda criado", AGENDA_EVENTO_EDITADO:"Evento de agenda editado", AGENDA_EVENTO_CANCELADO:"Evento de agenda cancelado",
  };
  function tipoLabel(tipo){ return TIPO_LABEL_OVERRIDES[tipo] || (tipo||"").replace(/_/g," ").toLowerCase().replace(/^./,c=>c.toUpperCase()); }

  const ENTIDADES = ["Obra","Montagem/Ambiente","Pendência","Assistência","Agenda","Processo/Governança"];
  function entidadeDoEvento(tipo){
    if(/^OBRA_|^ARQUIVO_ENVIADO/.test(tipo)) return "Obra";
    if(/^AMBIENTE_|^COMPONENTE_|^MUDANCA_ETAPA|^LIBERACAO_FORCADA|^RESSALVA_|^AVANCO_COM_RESSALVA|^MONTAGEM_COM_PENDENCIA|^RETRABALHO|^MUDANCA_RESPONSAVEL/.test(tipo)) return "Montagem/Ambiente";
    if(/^PENDENCIA_/.test(tipo)) return "Pendência";
    if(/^ASSISTENCIA_/.test(tipo)) return "Assistência";
    if(/^AGENDA_/.test(tipo)) return "Agenda";
    if(/^ALTERACAO_PROCESSO/.test(tipo)) return "Processo/Governança";
    return "Outro";
  }

  // Normaliza state.historico + state.auditoria num formato comum — SÓ
  // PARA EXIBIÇÃO. `extra` guarda o registro original completo, pra quem
  // precisar de um campo específico (drawer de detalhe usa alguns).
  function mergeEventos(){
    const hist = M.Store.state.historico.map(h=> ({
      id:"h_"+h.id, data:(h.data||"").slice(0,10), hora:(h.data||"").slice(11,16), ts:new Date(h.data).getTime()||0,
      usuario:h.usuario, tipo:h.tipo, tipoLabel:tipoLabel(h.tipo), categoria:null, descricao:h.descricao,
      obraId:h.obraId, origem:"HISTORICO", extra:h,
    }));
    const aud = M.Store.state.auditoria.map(a=> ({
      id:"a_"+a.id, data:a.data, hora:a.hora, ts:new Date(a.data+"T"+(a.hora||"00:00")+":00").getTime()||0,
      usuario:a.usuario, tipo:a.tipo, tipoLabel:tipoLabel(a.tipo), categoria:a.categoria, descricao:a.descricao,
      obraId:a.obraId, origem:"AUDITORIA", extra:a,
    }));
    return hist.concat(aud).sort((x,y)=> y.ts-x.ts);
  }
  // exposto pro Context Drawer (js/drawer.js) — não duplica a normalização lá.
  M.Pages._adminAuditoriaEventoPorId = function(id){ return mergeEventos().find(e=>e.id===id) || null; };

  function secAuditoria(){
    if(!M.Store.pode("admin.auditoria")) return semAcessoHtml("a Auditoria");
    const f = M.UIState.adminAuditoriaFiltro;
    const {inicio} = periodoRange(f.periodo);
    let eventos = mergeEventos().filter(e=> e.data>=inicio);
    if(f.usuario) eventos = eventos.filter(e=>e.usuario===f.usuario);
    if(f.tipo) eventos = eventos.filter(e=>e.tipo===f.tipo);
    if(f.obraId) eventos = eventos.filter(e=>e.obraId===f.obraId);
    if(f.entidade) eventos = eventos.filter(e=> entidadeDoEvento(e.tipo)===f.entidade);
    if(f.busca) { const q=f.busca.toLowerCase(); eventos = eventos.filter(e=> (e.descricao||"").toLowerCase().includes(q) || (e.usuario||"").toLowerCase().includes(q)); }

    const todosNoPeriodo = mergeEventos().filter(e=> e.data>=inicio);
    const usuarios = Array.from(new Set(todosNoPeriodo.map(e=>e.usuario).filter(Boolean))).sort();
    const tipos = Array.from(new Set(todosNoPeriodo.map(e=>e.tipo))).sort();
    const obrasComEvento = Array.from(new Set(todosNoPeriodo.map(e=>e.obraId).filter(Boolean))).map(id=>M.Store.getObra(id)).filter(Boolean);

    function linhaHtml(e){
      const marcador = e.origem==="AUDITORIA" ? `<span class="audit-cat ${e.categoria}" title="${esc(e.tipoLabel)}"></span>` : `<span class="audit-cat OPERACIONAL" title="${esc(e.tipoLabel)}"></span>`;
      return `<div class="audit-row" style="cursor:pointer;" onclick="M.Drawer.abrirEventoAuditoria('${e.id}')">
        ${marcador}
        <div style="flex:1;">
          <div class="flex-between"><b>${esc(e.usuario||"Sistema")} · ${esc(e.tipoLabel)}</b><span class="audit-time">${C.fmtDate(e.data)} ${e.hora||""}</span></div>
          <div class="small muted">${e.obraId? `${esc((M.Store.getObra(e.obraId)||{}).cliente||"")} · `:""}${esc(e.descricao||"")}</div>
        </div>
      </div>`;
    }

    // ---- visualizações de pendência (§16) — SÓ AQUI o aviso de identidade provisória aparece ----
    const visualizacoes = M.Store.state.visualizacoesPendencia.slice().sort((a,b)=> new Date(b.visualizadoEm)-new Date(a.visualizadoEm));

    return `
      <div class="help-banner">${UI.icon('shield',13)} "Quem fez o quê e quando" — combina o histórico operacional por obra e a auditoria de exceções/governança já existentes. Nenhum dado novo foi criado; isto é só uma leitura conjunta das duas fontes.</div>

      <div class="card pad" style="margin-bottom:14px;">
        <div class="flex-gap" style="flex-wrap:wrap;">
          <select onchange="Act.setAdminAuditoriaFiltro('periodo', Number(this.value))">
            <option value="7" ${f.periodo===7?'selected':''}>Últimos 7 dias</option>
            <option value="30" ${f.periodo===30?'selected':''}>Últimos 30 dias</option>
            <option value="90" ${f.periodo===90?'selected':''}>Últimos 90 dias</option>
          </select>
          <select onchange="Act.setAdminAuditoriaFiltro('usuario', this.value)">
            <option value="">+ Usuário</option>${usuarios.map(u=>`<option value="${esc(u)}" ${f.usuario===u?'selected':''}>${esc(u)}</option>`).join("")}
          </select>
          <select onchange="Act.setAdminAuditoriaFiltro('tipo', this.value)">
            <option value="">+ Tipo de evento</option>${tipos.map(t=>`<option value="${t}" ${f.tipo===t?'selected':''}>${esc(tipoLabel(t))}</option>`).join("")}
          </select>
          <select onchange="Act.setAdminAuditoriaFiltro('obraId', this.value)">
            <option value="">+ Obra</option>${obrasComEvento.map(o=>`<option value="${o.id}" ${f.obraId===o.id?'selected':''}>${o.numeroOS} — ${esc(o.cliente)}</option>`).join("")}
          </select>
          <select onchange="Act.setAdminAuditoriaFiltro('entidade', this.value)">
            <option value="">+ Entidade</option>${ENTIDADES.map(e=>`<option value="${e}" ${f.entidade===e?'selected':''}>${e}</option>`).join("")}
          </select>
        </div>
        <input type="text" placeholder="Busca textual (descrição, usuário)..." value="${esc(f.busca||"")}" oninput="Act.setAdminAuditoriaFiltro('busca', this.value)" style="margin-top:10px;max-width:340px;">
      </div>

      <div class="card pad" style="margin-bottom:16px;">
        <div class="card-title">${eventos.length} evento${eventos.length===1?"":"s"} — ${esc(periodoLabelTexto(f.periodo))}</div>
        ${eventos.slice(0,200).map(linhaHtml).join("") || `<p class="small muted">Nenhum evento no período/filtro selecionado.</p>`}
      </div>

      <div class="sec-head"><div class="sec-title"><b>Visualizações de pendência</b></div></div>
      <div class="help-banner">${UI.icon('alert',13)} Enquanto Auth real não estiver implementado, a identidade vem do usuário atual de desenvolvimento e não representa evidência forte de autoria.</div>
      <div class="card pad">
        <table class="tbl"><thead><tr><th>Pendência</th><th>Usuário</th><th>Primeira visualização</th></tr></thead><tbody>
          ${visualizacoes.slice(0,100).map(v=>{
            const p = M.Store.state.pendencias.find(x=>x.id===v.pendenciaId);
            const dt = new Date(v.visualizadoEm);
            return `<tr><td>${p? esc(p.categoria+" — "+(p.descricao||"")) : esc(v.pendenciaId)}</td><td>${esc(v.usuario)}</td><td class="small muted">${dt.toLocaleDateString("pt-BR")} ${dt.toTimeString().slice(0,5)}</td></tr>`;
          }).join("") || `<tr><td class="small muted">Nenhuma visualização registrada ainda.</td></tr>`}
        </tbody></table>
      </div>
    `;
  }

  // ============================================================
  // TV (§21) — só resumo/acesso nesta fase; edição completa é Fase 9.
  //
  // HOTFIX (auditoria de navegação pós-Fase 8): o botão "Configuração
  // resumida (widgets)" navegava pra #/configuracoes/tv — saía do Admin V2
  // de vez e caía nas 8 abas da tela antiga de Configurações (Integrações/
  // Processos/Indicadores/Modo TV/Permissões/Notificações/Assistências/
  // Dados), quebrando a experiência do V2. Correção: em vez de navegar,
  // renderiza INLINE, aqui dentro, a mesma função que já existe e já está
  // exportada pra isso — M.Pages._configSecoes.tv() (configuracoes.js) —
  // que é quem tem os switches ligados a Act.toggleTvWidget de verdade.
  // Nenhuma lógica nova: nem Store novo, nem rota nova, nem duplicação de
  // Act.toggleTvWidget — é a MESMA função de sempre, só chamada de outro
  // lugar. #/configuracoes/tv continua existindo, intacta, só como
  // compatibilidade técnica — nenhum fluxo novo do V2 aponta mais pra ela.
  //
  // Gate desta configuração inline é tv.configurar (a mesma permissão que
  // já decide se o botão aparecia) — de propósito NÃO usa admin.configuracoes,
  // pra não criar uma dependência artificial entre as duas permissões (ver
  // achado da auditoria: elas são editáveis independentemente uma da outra
  // na matriz de Permissões). Sem tv.configurar: só resumo/preview, igual
  // sempre foi.
  //
  // HOTFIX (contagem "Widgets ativos"): a contagem antiga só olhava as
  // chaves JÁ SALVAS em state.tvWidgetsAtivos (Object.keys(...).length) —
  // então com o estado ainda "limpo" (nenhum toggle salvo) mostrava 0,
  // mesmo com todo widget aparecendo ligado nos switches (que tratam chave
  // ausente como ativo por padrão). Corrigido reaproveitando
  // M.Pages._configSecoes.tvWidgetsAtivosEfetivo() — a MESMA função/regra
  // que os switches usam (configuracoes.js) — em vez de uma segunda leitura
  // inventada aqui.
  // ============================================================
  function tvResumoHtml(){
    const podeConfigurar = M.Store.pode("tv.configurar");
    const quemPodeConfigurar = PERFIS_OFICIAIS.concat(["TV"]).map(k=>M.perfilDef(k)).filter(p=>p && M.Store.podePerfil(p.key,"tv.configurar")).map(p=>p.label);
    const configSecs = M.Pages._configSecoes;
    const ativos = (configSecs && configSecs.tvWidgetsAtivosEfetivo) ? configSecs.tvWidgetsAtivosEfetivo().length : 0;
    const configuracaoInlineHtml = (podeConfigurar && configSecs && configSecs.tv) ? configSecs.tv() : "";
    return `
      <div class="card pad">
        <div class="card-title">${UI.icon('tv',15)} Modo TV — status</div>
        <table class="tbl"><tbody>
          <tr><td>Status</td><td class="right"><span class="chip good">Ativo</span></td></tr>
          <tr><td>Widgets ativos</td><td class="right"><b>${ativos}</b></td></tr>
          <tr><td>Quem pode configurar</td><td class="right small">${quemPodeConfigurar.join(", ")||"—"}</td></tr>
        </tbody></table>
        <div class="flex-gap" style="margin-top:12px;">
          <a class="btn sm" href="#/chao-de-fabrica">${UI.icon('tv',13)} Ver painel (preview)</a>
        </div>
        <p class="small muted" style="margin-top:10px;">Edição completa do Modo TV (layout livre, novo editor) é escopo da Fase 9 — não antecipada aqui.</p>
      </div>
      ${configuracaoInlineHtml ? `
      <div class="sec-head" style="margin-top:16px;"><div class="sec-title"><b>Configuração resumida (widgets)</b></div></div>
      ${configuracaoInlineHtml}` : ""}`;
  }
  function secTv(){
    if(!M.Store.pode("admin.ver")) return semAcessoHtml("a TV");
    return tvResumoHtml();
  }

  // ============================================================
  // CONFIGURAÇÕES (§19-20) — reorganiza seções JÁ existentes
  // (M.Pages._configSecoes, ver js/pages/configuracoes.js) em 5 categorias
  // novas. Nenhuma seção é reescrita; só reagrupada. GERAL fica
  // deliberadamente enxuta — não existe hoje "nome do sistema"/tema
  // configurável de verdade no app, então não inventamos esse campo
  // (§20: "Admin vazio e correto é melhor do que configuração falsa").
  // ============================================================
  const CONFIG_CATS = [
    {key:"geral", label:"Geral"}, {key:"operacao", label:"Operação"}, {key:"permissoes", label:"Permissões"},
    {key:"tv", label:"TV"}, {key:"seguranca", label:"Segurança"},
  ];

  function secConfigGeral(){
    return `
      <div class="card pad">
        <div class="card-title">Sistema</div>
        <table class="tbl"><tbody>
          <tr><td>Nome do sistema</td><td class="right"><b>Moodo Produção</b></td></tr>
          <tr><td>Versão</td><td class="right"><b>${esc(M.APP_VERSION||"—")}</b></td></tr>
          <tr><td>Ambiente</td><td class="right"><span class="chip warning">Desenvolvimento</span></td></tr>
        </tbody></table>
        <p class="small muted" style="margin-top:10px;">Preferências visuais e comportamento padrão configuráveis ainda não existem nesta versão do app — nada foi inventado aqui só para preencher a tela.</p>
      </div>`;
  }
  function secConfigSeguranca(){
    const nuvemOk = !!(M.Supa && M.Supa.habilitado);
    return `
      <div class="card pad">
        <div class="card-title">${UI.icon('lock',15)} Status de segurança</div>
        <table class="tbl"><tbody>
          <tr><td>Autenticação real (login/senha)</td><td class="right"><span class="chip warning">Pendente</span></td></tr>
          <tr><td>RLS (Row Level Security) no banco</td><td class="right"><span class="chip warning">Pendente</span></td></tr>
          <tr><td>Storage privado (arquivos/fotos)</td><td class="right"><span class="chip warning">Pendente</span></td></tr>
          <tr><td>Conexão com a nuvem (Supabase)</td><td class="right"><span class="chip ${nuvemOk?'good':'neutral'}">${nuvemOk?'Conectado':'Não conectado'}</span></td></tr>
        </tbody></table>
        <p class="small muted" style="margin-top:10px;">Nada de segurança é implementado nesta fase — só o status é exibido, de forma honesta, para não passar falsa sensação de segurança. Auth/RLS/Storage privado ficam para uma fase dedicada de Segurança/Hardening.</p>
      </div>`;
  }
  function secConfiguracoes(sub){
    if(!M.Store.pode("admin.configuracoes")) return semAcessoHtml("Configurações");
    const cat = M.UIState.adminConfigCategoria || "geral";
    const secs = M.Pages._configSecoes || {};
    let corpo;
    if(cat==="geral") corpo = secConfigGeral();
    else if(cat==="operacao") corpo = secs.processos ? secs.processos() : "";
    else if(cat==="permissoes") corpo = secs.permissoes ? secs.permissoes() : "";
    else if(cat==="tv") corpo = tvResumoHtml();
    else if(cat==="seguranca") corpo = secConfigSeguranca();
    else corpo = secConfigGeral();
    return `
      <div class="tabs">${CONFIG_CATS.map(c=>`<a href="javascript:void(0)" class="tab ${c.key===cat?'active':''}" onclick="Act.setAdminConfigCategoria('${c.key}')">${c.label}</a>`).join("")}</div>
      ${corpo}
    `;
  }

  // ============================================================
  // ENTRY POINT
  // ============================================================
  M.Pages.admin = function(sub){
    const permitidas = tabsPermitidas();
    if(!permitidas.length){
      return {title:"Admin", html:semAcessoHtml("nenhuma área administrativa")};
    }
    sub = sub || permitidas[0].key;
    const tabDef = TABS.find(t=>t.key===sub) || permitidas[0];
    const fns = {
      panorama: secPanorama, indicadores: secIndicadores, desempenho: secDesempenho,
      equipe: secEquipe, auditoria: secAuditoria, tv: secTv, configuracoes: secConfiguracoes,
    };
    const fn = fns[tabDef.key] || secPanorama;
    const html = `
      <div class="tabs">${permitidas.map(t=>`<a href="#/admin/${t.key}" class="tab ${t.key===sub?'active':''}" style="text-decoration:none;display:flex;align-items:center;gap:5px;">${UI.icon(t.icon,13)}${t.label}</a>`).join("")}</div>
      ${fn(sub)}
    `;
    return {title:"Admin", crumb:"Panorama, indicadores, equipe, auditoria e configurações do sistema", html};
  };
})();
