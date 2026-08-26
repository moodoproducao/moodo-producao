/* ============================================================
   PÁGINA: Assistências V2 (Fase 7) — fluxo operacional pós-entrega
   ============================================================
   "O que precisa ser atendido, por quem, quando, e o que ainda falta
   resolver" — NÃO é uma obra nova, pertence ao histórico da obra já
   entregue (§1 do pedido original). Duas telas compartilham o mesmo modelo
   e os mesmos Store/Calc já construídos pra este módulo:
     - M.Pages.assistenciasV2() — desktop, rota "#/assistencias": KPIs
       compactos + 3 colunas (Precisa de ação / Agendadas hoje / Aguardando)
       + lista completa filtrável.
     - M.Pages.atendimentos()  — mobile-first, rota "#/atendimentos": filtros
       rápidos + cards com botão de ação grande, sem tabela.
     - M.Pages.assistenciaDetail(id) — detalhe de UM chamado (Resumo/
       Visitas/Pendências/Fotos/Histórico), acessado das duas telas acima,
       da Agenda (evento derivado) e do bloco novo na Visão Geral da obra.
   Toda leitura de estado passa por M.Store.assistenciasVisiveis() (escopo
   por perfil, item 5 da aprovação) e M.Calc.* (visita efetiva, próxima
   visita agendada, retorno pendente — nenhuma regra duplicada aqui).
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  // ---------- dados compartilhados (filtro + agrupamento) ----------
  function listaFiltrada(){
    const f = M.UIState.atendFiltro;
    let list = M.Store.assistenciasVisiveis().slice();
    if(f.obraId) list = list.filter(a=>a.obraId===f.obraId);
    if(f.status) list = list.filter(a=>a.status===f.status);
    if(f.garantia) list = list.filter(a=>a.garantia===f.garantia);
    if(f.grupo) list = list.filter(a=>M.grupoAssistenciaDef(a.status)===f.grupo);
    if(f.busca){
      const q = f.busca.toLowerCase();
      list = list.filter(a=> (a.descricao||"").toLowerCase().indexOf(q)!==-1
        || (a.obraNome||a.cliente||"").toLowerCase().indexOf(q)!==-1
        || (a.categoria||"").toLowerCase().indexOf(q)!==-1);
    }
    return list.sort((x,y)=> (y.data||"").localeCompare(x.data||""));
  }
  // "precisa de ação" (§16/§17): nunca concluída/cancelada, e (nunca teve
  // visita ainda — precisa triar/agendar) OU (tem retorno necessário sem
  // próxima visita já agendada). Uma assistência com visita AGENDADA no
  // futuro ou em Aguardando (peça/cliente) já está "tratada" — some daqui.
  function precisaAcao(a){
    if(a.status==="CONCLUIDA" || a.status==="CANCELADA") return false;
    if(!a.visitas || !a.visitas.length) return true;
    return C.assistenciaComRetornoPendente(a);
  }
  function agendadaHoje(a){
    const v = C.proximaVisitaAgendada(a);
    return !!(v && v.data===M.todayISO());
  }
  function estaAguardando(a){ return M.grupoAssistenciaDef(a.status)==="AGUARDANDO"; }

  function obrasParaFiltro(){
    const ids = new Set(M.Store.assistenciasVisiveis().map(a=>a.obraId).filter(Boolean));
    return M.Store.state.obras.filter(o=>ids.has(o.id));
  }

  function filtrosHtml(){
    const f = M.UIState.atendFiltro;
    return `<div class="card pad" style="margin-bottom:14px;">
      <div class="flex-gap" style="flex-wrap:wrap;">
        <input type="text" placeholder="Buscar por descrição, obra, categoria..." value="${UI.esc(f.busca||"")}"
          style="min-width:220px;flex:1;" oninput="Act.setAtendFiltro('busca', this.value)">
        <select onchange="Act.setAtendFiltro('status',this.value)">
          <option value="">Todos os status</option>
          ${M.STATUS_ASSISTENCIA_FLOW.concat(["CANCELADA"]).map(s=>`<option value="${s}" ${f.status===s?'selected':''}>${M.STATUS_ASSISTENCIA_LABEL[s]}</option>`).join("")}
        </select>
        <select onchange="Act.setAtendFiltro('garantia',this.value)">
          <option value="">Toda cobertura</option>
          ${M.GARANTIA_DEF.map(g=>`<option value="${g.key}" ${f.garantia===g.key?'selected':''}>${g.label}</option>`).join("")}
        </select>
        <select onchange="Act.setAtendFiltro('obraId',this.value)">
          <option value="">Todas as obras</option>
          ${obrasParaFiltro().map(o=>`<option value="${o.id}" ${f.obraId===o.id?'selected':''}>${UI.esc(o.cliente)}</option>`).join("")}
        </select>
        ${(f.status||f.garantia||f.obraId||f.grupo||f.busca)? `<button class="btn sm ghost" onclick="Act.limparAtendFiltro()">${UI.icon('x',12)} Limpar</button>`:""}
      </div>
    </div>`;
  }

  // ---------- card compacto (usado nas 3 colunas e na lista completa) ----------
  function cardCompacto(a){
    const proxima = C.proximaVisitaAgendada(a);
    const retorno = C.assistenciaComRetornoPendente(a);
    const pendBloq = M.Store.state.pendencias.filter(p=>p.assistenciaId===a.id && p.status!=="RESOLVIDA");
    return `<div class="compact-row" onclick="Act.go('#/assistencia/${a.id}')">
      <div class="cr-main">
        <div class="cr-top">
          <span class="cr-title">${UI.esc(a.categoria)}</span>
          ${UI.assistenciaStatusChip(a.status)}${UI.garantiaChip(a.garantia)}
        </div>
        <div class="cr-sub">${UI.esc(a.obraNome||a.cliente||"—")}${a.ambienteNome?" · "+UI.esc(a.ambienteNome):""} · ${UI.esc(a.descricao)}</div>
        ${proxima? `<div class="small" style="margin-top:3px;color:var(--brand);font-weight:600;">${UI.icon('calendar',10)} próxima visita ${C.fmtDate(proxima.data)}${proxima.horaInicio?" "+proxima.horaInicio:""}</div>`
          : retorno? `<div class="cr-motivo">${UI.icon('clock',9)} retorno necessário — sem visita agendada</div>` : ""}
        ${pendBloq.length? `<div class="small muted" style="margin-top:2px;">${UI.icon('alert',10)} ${pendBloq.length} pendência${pendBloq.length>1?"s":""} vinculada${pendBloq.length>1?"s":""}</div>`:""}
      </div>
      <div class="cr-action" onclick="event.stopPropagation()">
        ${a.status!=="CONCLUIDA" && a.status!=="CANCELADA" ? `
          ${!proxima? `<button class="btn sm ghost" onclick="Act.abrirAgendarVisita('${a.id}')">${UI.icon('calendar',12)} Agendar</button>`:""}
          <button class="btn sm" onclick="Act.abrirRegistrarVisita('${a.id}')">${UI.icon('wrench',12)} Visita</button>
        ` : ""}
      </div>
    </div>`;
  }

  function coluna(titulo, icon, tone, itens, chaveExpand, vazio){
    const {itensHtml, toggleHtml} = UI.secaoComVerTodos({key:chaveExpand, itens:itens.map(cardCompacto), limite:6});
    return `<div class="col-group">
      ${UI.secHead({titulo, icon, count:itens.length, tone})}
      ${itens.length? itensHtml : `<div class="group-empty">${UI.esc(vazio)}</div>`}
      ${toggleHtml}
    </div>`;
  }

  // ============================================================
  // DESKTOP — rota "#/assistencias" (§15-17)
  // ============================================================
  M.Pages.assistenciasV2 = function(){
    const todasVisiveis = M.Store.assistenciasVisiveis();
    const resumo = C.assistenciasResumo(); // ainda lê state.assistencias inteiro — ok pro KPI global (perfis com verTodasObras)
    const abertasVisiveis = todasVisiveis.filter(a=>a.status!=="CONCLUIDA" && a.status!=="CANCELADA");
    const colPrecisaAcao = abertasVisiveis.filter(precisaAcao);
    const colHoje = abertasVisiveis.filter(agendadaHoje);
    const colAguardando = abertasVisiveis.filter(estaAguardando);
    const lista = listaFiltrada();

    const kpis = UI.kpiRow([
      UI.kpiTile({icon:'lifebuoy', label:'Em aberto', value:abertasVisiveis.length}),
      UI.kpiTile({icon:'alert', label:'Precisa de ação', value:colPrecisaAcao.length, tone: colPrecisaAcao.length?'critical':''}),
      UI.kpiTile({icon:'calendar', label:'Agendadas hoje', value:colHoje.length, tone: colHoje.length?'brand':''}),
      UI.kpiTile({icon:'clock', label:'Aguardando', value:colAguardando.length, tone: colAguardando.length?'warning':''}),
      UI.kpiTile({icon:'check', label:'Concluídas', value:resumo.concluidas}),
    ]);

    const corpoColunas = `<div class="cols-3-tight" style="margin-top:14px;">
      ${coluna("Precisa de ação","alert","critical",colPrecisaAcao,"atend:acao","Nada precisando de ação agora.")}
      ${coluna("Agendadas hoje","calendar","brand",colHoje,"atend:hoje","Nenhuma visita agendada para hoje.")}
      ${coluna("Aguardando","clock","warning",colAguardando,"atend:aguardando","Nada aguardando peça/cliente agora.")}
    </div>`;

    const listaCompleta = `
      <div class="hr" style="margin:18px 0;"></div>
      <div class="sec-head"><div class="sec-title"><b>Todos os atendimentos</b> <span class="chip neutral" style="margin-left:2px;">${lista.length}</span></div></div>
      ${filtrosHtml()}
      ${lista.length? `<div>${lista.map(cardCompacto).join("")}</div>` : `<p class="small muted">Nenhum atendimento encontrado com esses filtros.</p>`}
    `;

    return {title:"Assistências", crumb:"Atendimentos pós-entrega — o que precisa ser atendido, por quem e quando",
      html: `${kpis}${corpoColunas}${listaCompleta}`,
      actionsHtml: M.Store.pode("assistencia.criar")? `<button class="btn primary" onclick="Act.openAssistenciaForm(null)">${UI.icon('plus',14)} Nova assistência</button>` : ""};
  };

  // ============================================================
  // MOBILE — rota "#/atendimentos" (§19) — cards, filtros rápidos, sem tabela
  // ============================================================
  function chipFiltroRapido(key, label, ativo){
    return `<button class="btn sm ${ativo?'primary':'ghost'}" onclick="Act.setAtendFiltro('grupo','${ativo?'':key}')">${UI.esc(label)}</button>`;
  }
  function cardMobile(a){
    const proxima = C.proximaVisitaAgendada(a);
    const retorno = C.assistenciaComRetornoPendente(a);
    const obra = a.obraId ? M.Store.getObra(a.obraId) : null;
    const acaoPrincipal = (a.status==="CONCLUIDA"||a.status==="CANCELADA") ? "" :
      proxima ? `<button class="btn primary" style="width:100%;margin-top:10px;" onclick="Act.abrirRegistrarVisita('${a.id}','${proxima.id}')">${UI.icon('wrench',14)} Realizar visita de ${C.fmtDate(proxima.data)}</button>`
      : `<button class="btn primary" style="width:100%;margin-top:10px;" onclick="Act.abrirAgendarVisita('${a.id}')">${UI.icon('calendar',14)} Agendar visita</button>`;
    return `<div class="card pad" style="margin-bottom:10px;" onclick="Act.go('#/assistencia/${a.id}')">
      <div class="flex-between" style="flex-wrap:wrap;gap:6px;">
        <div><b>${UI.esc(a.obraNome||a.cliente||"—")}</b><div class="small muted">${UI.esc(a.ambienteNome||"")}${a.ambienteNome&&a.movelNome?" · ":""}${UI.esc(a.movelNome||"")}</div></div>
        ${UI.assistenciaStatusChip(a.status)}
      </div>
      ${obra&&obra.endereco? `<div class="small muted" style="margin-top:4px;">${UI.icon('map-pin',10)} ${UI.esc(obra.endereco)}</div>`:""}
      <div style="margin-top:6px;">${UI.esc(a.categoria)} — ${UI.esc(a.descricao)}</div>
      <div class="flex-gap" style="margin-top:8px;flex-wrap:wrap;">
        ${UI.garantiaChip(a.garantia)}
        ${proxima? `<span class="chip brand">${UI.icon('calendar',10)} ${C.fmtDate(proxima.data)}${proxima.horaInicio?" "+proxima.horaInicio:""}</span>` : ""}
        ${retorno? `<span class="chip warning">${UI.icon('clock',10)} retorno necessário</span>` : ""}
      </div>
      <div onclick="event.stopPropagation()">${acaoPrincipal}</div>
    </div>`;
  }
  M.Pages.atendimentos = function(){
    const f = M.UIState.atendFiltro;
    const todasVisiveis = M.Store.assistenciasVisiveis();
    const abertasVisiveis = todasVisiveis.filter(a=>a.status!=="CONCLUIDA" && a.status!=="CANCELADA");
    let base;
    if(f.grupo==="ABERTA") base = abertasVisiveis.filter(precisaAcao);
    else if(f.grupo==="AGENDADA") base = abertasVisiveis.filter(agendadaHoje);
    else if(f.grupo==="AGUARDANDO") base = abertasVisiveis.filter(estaAguardando);
    else if(f.grupo==="CONCLUIDA") base = todasVisiveis.filter(a=>a.status==="CONCLUIDA");
    else base = abertasVisiveis;
    if(f.busca){
      const q = f.busca.toLowerCase();
      base = base.filter(a=> (a.descricao||"").toLowerCase().indexOf(q)!==-1 || (a.obraNome||a.cliente||"").toLowerCase().indexOf(q)!==-1);
    }
    base = base.slice().sort((x,y)=>{
      const px = C.proximaVisitaAgendada(x), py = C.proximaVisitaAgendada(y);
      return (px?px.data:"9999") < (py?py.data:"9999") ? -1 : 1;
    });

    const quickFilters = `<div class="flex-gap" style="flex-wrap:wrap;margin-bottom:10px;">
      ${chipFiltroRapido("","Todos abertos",!f.grupo)}
      ${chipFiltroRapido("ABERTA","Precisa de ação",f.grupo==="ABERTA")}
      ${chipFiltroRapido("AGENDADA","Agendadas hoje",f.grupo==="AGENDADA")}
      ${chipFiltroRapido("AGUARDANDO","Aguardando",f.grupo==="AGUARDANDO")}
      ${chipFiltroRapido("CONCLUIDA","Concluídos",f.grupo==="CONCLUIDA")}
    </div>
    <input type="text" placeholder="Buscar..." value="${UI.esc(f.busca||"")}" style="margin-bottom:12px;" oninput="Act.setAtendFiltro('busca', this.value)">`;

    return {title:"Atendimentos", crumb:"Sua fila de atendimentos de assistência",
      html: `${quickFilters}${base.length? base.map(cardMobile).join("") : `<p class="small muted">Nenhum atendimento aqui agora.</p>`}`,
      actionsHtml: M.Store.pode("assistencia.criar")? `<button class="btn primary" onclick="Act.openAssistenciaForm(null)">${UI.icon('plus',14)} Nova</button>` : ""};
  };

  // ============================================================
  // DETALHE — rota "#/assistencia/:id" (§18) — Resumo/Visitas/Pendências/Fotos/Histórico
  // ============================================================
  M.Pages.assistenciaDetail = function(id){
    const a = M.Store.state.assistencias.find(x=>x.id===id);
    if(!a) return {title:"Assistência", crumb:"", html:`<p class="small muted">Assistência não encontrada.</p>`};
    // escopo (item 5/9): mesma visibilidade da lista — quem não teria essa
    // assistência na lista também não pode abrir o link direto.
    if(!M.Store.assistenciasVisiveis().some(x=>x.id===id)){
      return {title:"Acesso restrito", crumb:"", html:`<p class="small muted">Esta assistência não está no seu contexto.</p>`};
    }
    const obra = a.obraId ? M.Store.getObra(a.obraId) : null;
    const proxima = C.proximaVisitaAgendada(a);
    const pendVinculadas = M.Store.state.pendencias.filter(p=>p.assistenciaId===a.id);
    const pendBloqueantes = pendVinculadas.filter(p=>p.status!=="RESOLVIDA" && M.bloqueiaFechamento(p.impacto));
    const historico = M.Store.state.historico.filter(h=>h.assistenciaId===a.id).sort((x,y)=> (y.data||"").localeCompare(x.data||""));
    const fotos = (a.fotos||[]).concat((a.visitas||[]).flatMap(v=>v.fotos||[]));
    const podeEditar = M.Store.pode("assistencia.editar");
    const podeConcluir = M.Store.pode("assistencia.concluir");
    // AJUSTES FINAIS (item 2): permissão PRÓPRIA, decidida pelo usuário —
    // matriz definida em js/data.js (PERFIS). O botão só existe no DOM pra
    // quem tem "assistencia.cancelar" (não é renderizado desabilitado pros
    // demais — a checagem acontece aqui, antes do template).
    const podeCancelarAssistencia = M.Store.pode("assistencia.cancelar");
    const emAberto = a.status!=="CONCLUIDA" && a.status!=="CANCELADA";

    const acoesHtml = emAberto ? `<div class="flex-gap" style="flex-wrap:wrap;margin-top:12px;">
      ${podeEditar? `<button class="btn" onclick="Act.abrirAgendarVisita('${a.id}')">${UI.icon('calendar',13)} Agendar visita</button>`:""}
      ${podeEditar? `<button class="btn" onclick="Act.abrirRegistrarVisita('${a.id}'${proxima?`,'${proxima.id}'`:''})">${UI.icon('wrench',13)} ${proxima?'Realizar visita agendada':'Registrar visita'}</button>`:""}
      ${M.Store.pode("pendencia.criar")? `<button class="btn ghost" onclick="Act.abrirPendenciaDeAssistencia('${a.id}')">${UI.icon('alert',13)} Abrir pendência</button>`:""}
      ${podeConcluir? `<button class="btn primary" onclick="Act.abrirConcluirAssistencia('${a.id}')">${UI.icon('check-circle',13)} Concluir</button>`:""}
      <!-- AJUSTES FINAIS (itens 1/2): botão "Cancelar assistência" liberado —
           permissão "assistencia.cancelar" decidida pelo usuário (matriz em
           js/data.js), separada de "assistencia.editar" de propósito.
           Cancelar uma VISITA isolada continua atrás de "assistencia.editar"
           (botão dentro da seção "Visitas" abaixo, não aqui). -->
      ${podeCancelarAssistencia? `<button class="btn danger" onclick="Act.abrirCancelarAssistencia('${a.id}')">${UI.icon('x',13)} Cancelar assistência</button>`:""}
    </div>` : "";

    const resumoHtml = `<div class="card pad">
      <div class="flex-between" style="flex-wrap:wrap;gap:8px;">
        <div>
          <div class="small muted">${UI.esc(a.categoria)} · ${obra? `<a href="#/obra/${obra.id}">${UI.esc(obra.cliente)}</a>` : UI.esc(a.cliente||"cliente avulso")}${a.ambienteNome?" · "+UI.esc(a.ambienteNome):""}${a.movelNome?" · "+UI.esc(a.movelNome):""}</div>
          <h3 style="margin:4px 0;">${UI.esc(a.descricao)}</h3>
        </div>
        <div class="flex-gap">${UI.assistenciaStatusChip(a.status)}${UI.garantiaChip(a.garantia)}${UI.prioridadeChip(a.prioridade)}</div>
      </div>
      <div class="mcard-rows" style="margin-top:10px;">
        <div class="mcard-row"><span class="mcard-k">Responsável</span><span class="mcard-v">${UI.person(a.responsavel)}</span></div>
        <div class="mcard-row"><span class="mcard-k">Aberta em</span><span class="mcard-v">${C.fmtDate(a.data)}</span></div>
        ${proxima? `<div class="mcard-row"><span class="mcard-k">Próxima visita</span><span class="mcard-v">${C.fmtDate(proxima.data)}${proxima.horaInicio?" · "+proxima.horaInicio:""}${proxima.tecnico?" · "+UI.esc(proxima.tecnico):""}</span></div>`:""}
        ${a.resultado? `<div class="mcard-row"><span class="mcard-k">Resultado</span><span class="mcard-v">${UI.esc(a.resultado)}</span></div>`:""}
        ${a.status==="CANCELADA"? `<div class="mcard-row"><span class="mcard-k">Cancelada por</span><span class="mcard-v">${UI.person(a.canceladoPor)} em ${C.fmtDate(a.canceladoEm)}</span></div>
        <div class="mcard-row"><span class="mcard-k">Motivo do cancelamento</span><span class="mcard-v">${UI.esc(a.motivoCancelamento||"—")}</span></div>` : ""}
      </div>
      ${podeEditar ? `<div class="field" style="margin-top:10px;max-width:260px;">
        <label>Cobertura</label>
        <select onchange="Act.mudarGarantiaAssistencia('${a.id}', this.value)">
          ${M.GARANTIA_DEF.map(g=>`<option value="${g.key}" ${a.garantia===g.key?'selected':''}>${g.label}</option>`).join("")}
        </select>
      </div>` : ""}
      ${acoesHtml}
    </div>`;

    const visitasSecHtml = `<div class="card pad">
      <div class="card-title">${UI.icon('wrench',13)}Visitas</div>
      ${(a.visitas&&a.visitas.length)? a.visitas.map((v,i)=>{
        const statusV = C.statusEfetivoVisita(v);
        const def = M.visitaStatusDef(statusV);
        return `<div class="check-row" style="align-items:flex-start;">
          <span class="dot ${def.tone}" style="margin-top:6px;"></span>
          <div class="label">
            <b>Visita ${i+1}</b> <span class="small muted">· ${C.fmtDate(v.data)}${v.horaInicio?" "+v.horaInicio:""} · ${UI.esc(v.tecnico||"—")}</span>
            <div style="margin-top:3px;"><span class="chip ${def.tone}">${def.label}</span>
              ${statusV==="REALIZADA"? (v.desfecho==='RESOLVIDA'? ` <span class="chip good">Resolvida</span>` : ` <span class="chip warning">Retorno necessário</span>`) : ""}
              ${v.pendenciaGeradaId? ` <a href="#/pendencias" class="small">gerou pendência →</a>`:""}
            </div>
            ${v.diagnostico? `<div class="small muted" style="margin-top:2px;">${UI.esc(v.diagnostico)}</div>`:""}
            ${v.observacao? `<div class="small muted" style="margin-top:2px;">${UI.esc(v.observacao)}</div>`:""}
            ${statusV==="CANCELADA" && v.motivoCancelamento? `<div class="small muted" style="margin-top:2px;">Motivo: ${UI.esc(v.motivoCancelamento)}</div>`:""}
            ${v.fotos&&v.fotos.length? UI.fotosGaleriaHtml(v.fotos) : ""}
            ${statusV==="AGENDADA" && podeEditar? `<div class="flex-gap" style="margin-top:6px;">
              <button class="btn sm" onclick="Act.abrirRegistrarVisita('${a.id}','${v.id}')">${UI.icon('wrench',11)} Realizar</button>
              <button class="btn sm ghost" onclick="Act.abrirCancelarVisita('${a.id}','${v.id}')">${UI.icon('x',11)} Cancelar visita</button>
            </div>`:""}
          </div>
        </div>`;
      }).join("") : `<p class="small muted">Nenhuma visita registrada ainda.</p>`}
    </div>`;

    const pendenciasSecHtml = `<div class="card pad">
      <div class="card-title">${UI.icon('alert',13)}Pendências vinculadas${pendBloqueantes.length? ` <span class="chip critical" style="margin-left:4px;">${pendBloqueantes.length} bloqueando</span>`:""}</div>
      ${pendVinculadas.length? pendVinculadas.map(p=>`
        <div class="check-row" style="cursor:pointer;" onclick="Act.go('#/pendencias')">
          <span class="dot ${p.status==='RESOLVIDA'?'good':'warning'}"></span>
          <div class="label"><b>${UI.esc(p.categoria)}</b> <span class="small muted">— ${UI.esc(p.descricao)}</span>
            <div style="margin-top:2px;">${UI.statusPendenciaChip(p.status)} ${UI.impactoChip(p.impacto)}</div>
          </div>
        </div>`).join("") : `<p class="small muted">Nenhuma pendência vinculada a este chamado.</p>`}
    </div>`;

    const fotosSecHtml = `<div class="card pad">
      <div class="card-title">${UI.icon('image',13)}Fotos</div>
      ${fotos.length? UI.fotosGaleriaHtml(fotos) : `<p class="small muted">Nenhuma foto anexada ainda.</p>`}
    </div>`;

    const historicoSecHtml = `<div class="card pad">
      <div class="card-title">${UI.icon('clock',13)}Histórico</div>
      ${historico.length? historico.map(h=>`<div class="small" style="padding:6px 0;border-bottom:1px solid var(--border);">
        <b>${UI.esc((h.usuario||"").split(" ")[0]||"Alguém")}</b> — ${UI.esc(h.descricao)}
        <div class="muted" style="font-size:10.5px;">${new Date(h.data).toLocaleString("pt-BR")}</div>
      </div>`).join("") : `<p class="small muted">Sem eventos registrados no histórico da obra ainda.</p>`}
    </div>`;

    return {title:a.categoria||"Assistência", crumb:UI.esc(a.obraNome||a.cliente||""),
      html: `
        <div class="grid-2" style="align-items:start;">
          <div>${resumoHtml}<div class="hr" style="margin:14px 0;"></div>${visitasSecHtml}</div>
          <div>${pendenciasSecHtml}<div class="hr" style="margin:14px 0;"></div>${fotosSecHtml}<div class="hr" style="margin:14px 0;"></div>${historicoSecHtml}</div>
        </div>
      `,
      actionsHtml: `<a class="btn ghost" href="#/assistencias">${UI.icon('lifebuoy',13)} Voltar</a>`};
  };
})();
