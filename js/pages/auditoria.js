/* ============================================================
   PÁGINA: Auditoria (seções 48-52) — exceções e alterações críticas
   FASE 6 (handoff "UI · Admin/Auditoria"): "frase legível por gestor, não
   linha de log" — cada evento vira uma frase única (hora — ator · o quê),
   com marcador geométrico por TIPO de objeto afetado (não só por
   categoria), tabs de área (Tudo/Pendência/Montagem/Assistência/Acesso),
   filtro por usuário/obra e 3 modos de visão (Cronológico/Por obra/Por
   usuário). Mantém como estava (aditivo): o escopo continua "exceções e
   alterações críticas", não um log geral — ver disclosure no commit.
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  const TIPO_LABEL = {
    AVANCO_COM_RESSALVA:"Avanço com ressalva", MUDANCA_RESPONSAVEL:"Mudança de responsável",
    PENDENCIA_REABERTA:"Pendência reaberta", RETRABALHO:"Retrabalho", ASSISTENCIA_ABERTA:"Assistência aberta",
    ASSISTENCIA_CONCLUIDA:"Assistência concluída", ALTERACAO_PROCESSO:"Alteração de processo",
    MONTAGEM_COM_PENDENCIA:"Montagem com pendência", RESSALVA_RESOLVIDA:"Ressalva resolvida",
    ASSISTENCIA_VISITA_REGISTRADA:"Visita de assistência registrada",
    ASSISTENCIA_GARANTIA_DEFINIDA:"Garantia definida",
  };

  // área (tabs "Tudo/Pendência/Montagem/Assistência/Acesso" do handoff)
  const TIPO_AREA = {
    PENDENCIA_REABERTA:"Pendência",
    AVANCO_COM_RESSALVA:"Montagem", RESSALVA_RESOLVIDA:"Montagem", MUDANCA_RESPONSAVEL:"Montagem",
    RETRABALHO:"Montagem", MONTAGEM_COM_PENDENCIA:"Montagem",
    ASSISTENCIA_ABERTA:"Assistência", ASSISTENCIA_CONCLUIDA:"Assistência",
    ASSISTENCIA_VISITA_REGISTRADA:"Assistência", ASSISTENCIA_GARANTIA_DEFINIDA:"Assistência",
    ALTERACAO_PROCESSO:"Acesso",
  };
  const AREAS = ["Pendência","Montagem","Assistência","Acesso"];

  // marcador por TIPO de objeto afetado (handoff, citação literal): "pendência
  // aberta em vermelho, finalização em verde, travamento hachurado, ressalva
  // em verde riscado, assistência em marrom, ação administrativa em contorno
  // cinza". "Aberta" e "travamento" ficam sem tipo mapeado hoje porque a
  // Auditoria (exceções/críticas) não registra abertura nem travamento como
  // eventos próprios — só ressalva, resolução, assistência e administração.
  // Tipo sem marcador aqui cai no marcador antigo por categoria (fallback,
  // nunca quebra).
  const TIPO_MARCADOR = {
    ASSISTENCIA_ABERTA:"assistencia", ASSISTENCIA_CONCLUIDA:"assistencia",
    ASSISTENCIA_VISITA_REGISTRADA:"assistencia", ASSISTENCIA_GARANTIA_DEFINIDA:"assistencia",
    AVANCO_COM_RESSALVA:"ressalva",
    RESSALVA_RESOLVIDA:"finalizacao",
    ALTERACAO_PROCESSO:"administrativa",
  };

  function primeiroNome(nome){ return (nome||"Alguém").split(" ")[0]; }

  // lead-in curto por tipo, pra compor "Fulano <lead-in> · <descrição>" numa
  // frase só (handoff: "frase legível por gestor, não linha de log").
  const TIPO_FRASE_PREFIXO = {
    ALTERACAO_PROCESSO:"fez uma alteração de processo",
    AVANCO_COM_RESSALVA:"liberou um avanço com ressalva",
    RESSALVA_RESOLVIDA:"resolveu uma ressalva",
    PENDENCIA_REABERTA:"reabriu",
    RETRABALHO:"gerou um retrabalho",
    ASSISTENCIA_ABERTA:"abriu uma assistência",
    ASSISTENCIA_CONCLUIDA:"concluiu uma assistência",
    MONTAGEM_COM_PENDENCIA:"encerrou uma montagem com pendência",
  };
  // prefixos já embutidos na descrição (escritos no Store.audit() de origem)
  // que ficariam redundantes se repetidos no lead-in — remove antes de compor.
  const PREFIXO_REDUNDANTE = {
    ASSISTENCIA_ABERTA:"Assistência aberta — ",
    ASSISTENCIA_CONCLUIDA:"Assistência concluída — ",
  };

  function auditoriaFrase(e){
    const nome = primeiroNome(e.usuario);
    // Fase 5 já constrói a frase inteira (com ator embutido) pra visita/garantia — usa direto.
    if(e.tipo==="ASSISTENCIA_VISITA_REGISTRADA" || e.tipo==="ASSISTENCIA_GARANTIA_DEFINIDA"){
      return e.descricao;
    }
    if(e.tipo==="MUDANCA_RESPONSAVEL"){
      const obj = (e.descricao.match(/"([^"]+)"/)||[])[1] || "item";
      return `${nome} reatribuiu "${obj}"${e.responsavelAnterior&&e.novoResponsavel? ` — de ${e.responsavelAnterior} para ${e.novoResponsavel}`:""}`;
    }
    let desc = e.descricao||"";
    const redundante = PREFIXO_REDUNDANTE[e.tipo];
    if(redundante && desc.startsWith(redundante)) desc = desc.slice(redundante.length);
    const prefixo = TIPO_FRASE_PREFIXO[e.tipo];
    if(!prefixo) return `${nome} · ${desc}`; // fallback genérico — nunca quebra pra tipo novo/desconhecido
    return `${nome} ${prefixo} · ${desc}`;
  }

  function marcadorHtml(e){
    const m = TIPO_MARCADOR[e.tipo];
    if(m) return `<span class="audit-marker ${m}" title="${UI.esc(TIPO_LABEL[e.tipo]||e.tipo)}"></span>`;
    return `<span class="audit-cat ${e.categoria}" title="${UI.esc(TIPO_LABEL[e.tipo]||e.tipo)}"></span>`;
  }

  function exportarCsv(eventos){
    const linhas = [["Data","Hora","Usuário","Área","Tipo","Descrição","Obra"].join(";")];
    eventos.forEach(e=>{
      const obra = e.obraId? (M.Store.getObra(e.obraId)||{}).cliente||"" : "";
      linhas.push([e.data, e.hora||"", e.usuario||"", TIPO_AREA[e.tipo]||"", TIPO_LABEL[e.tipo]||e.tipo, (e.descricao||"").replace(/;/g,","), obra].join(";"));
    });
    return linhas.join("\n");
  }
  // filtragem compartilhada — usada tanto pela tela quanto pelo Exportar,
  // pra exportar sempre exatamente o que está na tela (mesmo filtro ativo).
  function eventosFiltrados(){
    const filtro = M.UIState.auditoriaFiltro;
    const resumo = C.auditoriaResumo(filtro.periodo);
    let eventos = resumo.eventos;
    if(filtro.categoria) eventos = eventos.filter(e=>e.categoria===filtro.categoria);
    if(filtro.somenteExcecoes) eventos = eventos.filter(e=> e.categoria!=="OPERACIONAL");
    if(filtro.area) eventos = eventos.filter(e=> TIPO_AREA[e.tipo]===filtro.area);
    if(filtro.usuario) eventos = eventos.filter(e=> e.usuario===filtro.usuario);
    if(filtro.obraId) eventos = eventos.filter(e=> e.obraId===filtro.obraId);
    return eventos;
  }
  M.Pages._auditoriaExportarCsv = ()=> exportarCsv(eventosFiltrados()); // exposto pra Act.exportarAuditoria

  M.Pages.auditoria = function(){
    if(!M.Store.pode("verAuditoria")){
      return {title:"Auditoria", html:`<div class="card pad"><p>Seu perfil (<b>${UI.esc(M.Store.perfilAtual().label)}</b>) não tem acesso à Auditoria.</p></div>`};
    }
    const filtro = M.UIState.auditoriaFiltro;
    const resumo = C.auditoriaResumo(filtro.periodo);
    const eventos = eventosFiltrados();

    const usuarios = Array.from(new Set(resumo.eventos.map(e=>e.usuario).filter(Boolean))).sort();
    const obrasComEvento = Array.from(new Set(resumo.eventos.map(e=>e.obraId).filter(Boolean)))
      .map(id=>M.Store.getObra(id)).filter(Boolean);

    function linhaHtml(e){
      return `<div class="audit-row">
        ${marcadorHtml(e)}
        <div style="flex:1;">
          <div class="flex-between">
            <b>${UI.esc(auditoriaFrase(e))}</b>
            <span class="audit-time">${C.fmtDate(e.data)} ${e.hora||""}</span>
          </div>
          <div class="small muted">${e.obraId? `<a href="#/obra/${e.obraId}">${UI.esc((M.Store.getObra(e.obraId)||{}).cliente||"")}</a> · `:""}${UI.esc(TIPO_LABEL[e.tipo]||e.tipo)}${e.motivo && e.motivo!=="-" ? " · motivo: "+UI.esc(e.motivo):""}${e.novoPrazo? " · novo prazo: "+C.fmtDate(e.novoPrazo):""}</div>
        </div>
      </div>`;
    }

    let corpoHtml;
    if(!eventos.length){
      corpoHtml = `<p class="small muted">Nenhum evento de auditoria no período/filtro selecionado.</p>`;
    } else if(filtro.view==="obra"){
      const grupos = {};
      eventos.forEach(e=>{ const k = e.obraId? ((M.Store.getObra(e.obraId)||{}).cliente||"Obra") : "Sem obra"; (grupos[k]=grupos[k]||[]).push(e); });
      corpoHtml = Object.keys(grupos).sort().map(k=>`
        <div class="small" style="font-weight:700;color:var(--ink-soft);margin:10px 0 2px;">${UI.esc(k)} <span class="muted" style="font-weight:400;">(${grupos[k].length})</span></div>
        ${grupos[k].map(linhaHtml).join("")}`).join("");
    } else if(filtro.view==="usuario"){
      const grupos = {};
      eventos.forEach(e=>{ const k = e.usuario||"Sistema"; (grupos[k]=grupos[k]||[]).push(e); });
      corpoHtml = Object.keys(grupos).sort().map(k=>`
        <div class="small" style="font-weight:700;color:var(--ink-soft);margin:10px 0 2px;">${UI.person(k)} <span class="muted" style="font-weight:400;">(${grupos[k].length})</span></div>
        ${grupos[k].map(linhaHtml).join("")}`).join("");
    } else {
      corpoHtml = eventos.map(linhaHtml).join("");
    }

    const html = `
      <div class="help-banner">${UI.icon('shield',13)} Registra exceções e alterações críticas — avanços com ressalva, overrides, retrabalhos, assistências e mudanças de processo. O objetivo é identificar falhas de processo, não culpar indivíduos.</div>

      <div class="stat-row">
        <div class="stat-tile"><div class="label">Exceções no período</div><div class="value">${resumo.total}</div></div>
        <div class="stat-tile"><div class="label">Avanços com ressalva</div><div class="value">${resumo.avancosRessalva}</div></div>
        <div class="stat-tile"><div class="label">Pendências vencidas</div><div class="value ${resumo.pendenciasVencidas?'critical':''}">${resumo.pendenciasVencidas}</div></div>
        <div class="stat-tile"><div class="label">Retrabalhos</div><div class="value">${resumo.retrabalhos}</div></div>
        <div class="stat-tile"><div class="label">Assistências abertas</div><div class="value">${resumo.assistencias}</div></div>
        <div class="stat-tile"><div class="label">Alterações críticas (governança)</div><div class="value">${resumo.alteracoesCriticas}</div></div>
      </div>

      <div class="card pad" style="margin-bottom:14px;">
        <div class="flex-gap" style="flex-wrap:wrap;margin-bottom:10px;">
          <div class="segmented">
            <button class="${(!filtro.view||filtro.view==='cronologico')?'active':''}" onclick="Act.setAuditoriaFiltro('view','cronologico')">Cronológico</button>
            <button class="${filtro.view==='obra'?'active':''}" onclick="Act.setAuditoriaFiltro('view','obra')">Por obra</button>
            <button class="${filtro.view==='usuario'?'active':''}" onclick="Act.setAuditoriaFiltro('view','usuario')">Por usuário</button>
          </div>
          <button class="btn sm" onclick="Act.exportarAuditoria()">${UI.icon('download',12)} Exportar</button>
        </div>
        <div class="flex-gap" style="flex-wrap:wrap;">
          <select onchange="Act.setAuditoriaFiltro('periodo', Number(this.value))">
            <option value="7" ${filtro.periodo===7?'selected':''}>Últimos 7 dias</option>
            <option value="30" ${filtro.periodo===30?'selected':''}>Últimos 30 dias</option>
            <option value="90" ${filtro.periodo===90?'selected':''}>Últimos 90 dias</option>
          </select>
          <select onchange="Act.setAuditoriaFiltro('categoria', this.value)">
            <option value="">Todas as categorias</option>
            <option value="OPERACIONAL" ${filtro.categoria==='OPERACIONAL'?'selected':''}>Operacional</option>
            <option value="QUALIDADE" ${filtro.categoria==='QUALIDADE'?'selected':''}>Qualidade</option>
            <option value="GOVERNANCA" ${filtro.categoria==='GOVERNANCA'?'selected':''}>Governança</option>
          </select>
          <select onchange="Act.setAuditoriaFiltro('usuario', this.value)">
            <option value="">+ Usuário</option>
            ${usuarios.map(u=>`<option value="${UI.esc(u)}" ${filtro.usuario===u?'selected':''}>${UI.esc(u)}</option>`).join("")}
          </select>
          <select onchange="Act.setAuditoriaFiltro('obraId', this.value)">
            <option value="">+ Obra</option>
            ${obrasComEvento.map(o=>`<option value="${o.id}" ${filtro.obraId===o.id?'selected':''}>${o.numeroOS} — ${UI.esc(o.cliente)}</option>`).join("")}
          </select>
          <label class="chip ${filtro.somenteExcecoes?'brand':'neutral'}" style="cursor:pointer;" onclick="Act.toggleSomenteExcecoes()">Somente exceções (qualidade/governança)</label>
        </div>
        <div class="flex-gap" style="flex-wrap:wrap;margin-top:10px;">
          <label class="chip ${!filtro.area?'brand':'neutral'}" style="cursor:pointer;" onclick="Act.setAuditoriaFiltro('area','')">Tudo</label>
          ${AREAS.map(a=>`<label class="chip ${filtro.area===a?'brand':'neutral'}" style="cursor:pointer;" onclick="Act.setAuditoriaFiltro('area','${a}')">${a}</label>`).join("")}
        </div>
      </div>

      <div class="card pad">
        <div class="card-title">${eventos.length} evento${eventos.length===1?"":"s"} ${filtro.periodo? `nos últimos ${filtro.periodo} dias`:""}</div>
        ${corpoHtml}
      </div>
    `;
    return {title:"Auditoria", crumb:"Exceções, overrides e alterações críticas", html};
  };
})();
