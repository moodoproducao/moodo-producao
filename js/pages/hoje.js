/* ============================================================
   PÁGINA: Hoje — substitui o Dashboard (handoff — Fase 3)
   ============================================================
   "Hoje nunca lista peça nem operação. Ele só reúne o que já existe como
   exceção em Produção, Pendências e Montagem." / "Hoje tinha virado
   dashboard... removi. Hoje abre direto nos itens que exigem ação."
   (ui-telas-piloto.txt). Por isso esta tela NÃO tem faixa de KPI — quem
   quiser números de produção/meta do mês encontra em Indicadores, que já
   cobria isso. Aqui é fila de ação: Decidir/Aprovar/Cobrar/Resolver/Revisar,
   Obras em risco, Minhas pendências, Próximas entregas, Montagens da semana.
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  function saudacao(){
    const h = new Date().getHours();
    return h<12 ? "Bom dia" : h<18 ? "Boa tarde" : "Boa noite";
  }

  // classifica uma pendência aberta num verbo de ação — a lógica é derivada
  // dos campos do handoff (tipo/origem/status/impacto), já que o handoff não
  // documentou uma regra mecânica de classificação (as telas-piloto mostram
  // o resultado, não a fórmula). Cada pendência cai em UM verbo só (primeira
  // regra que bater), pra não duplicar contagem entre seções. Decisão
  // registrada no relatório de entrega da Fase 3.
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
  function esc(s){ return UI.esc(s); }

  M.Pages.hoje = function(){
    const nome = M.Store.state.usuarioAtual;
    const primeiroNome = (nome||"").split(" ")[0];
    const colab = M.colabByNome(nome);
    const cargo = colab ? colab.cargo : "";

    const restrito = !M.Store.pode("verTodasObras");
    const meuObraIds = restrito ? M.Store.obraIdsDoColaborador(nome) : null;
    const obras = restrito ? M.Store.state.obras.filter(o=>meuObraIds.has(o.id)) : M.Store.state.obras;

    // ---------- "Precisa da sua atenção" ----------
    const pendAbertas = M.Store.state.pendencias.filter(p=> p.status!=="RESOLVIDA" && (!restrito || meuObraIds.has(p.obraId)));
    const emAtencao = pendAbertas.filter(p=> M.bloqueiaFechamento(p.impacto) || (p.prazo && C.diasAte(p.prazo)<=0));
    // ordena por severidade de impacto e depois por prazo — mesmo critério de
    // ordenação já usado em Pendências (Fase 2), pra não inventar um segundo.
    emAtencao.sort((a,b)=> (M.IMPACTO_SEVERIDADE[a.impacto]??9) - (M.IMPACTO_SEVERIDADE[b.impacto]??9)
      || C.diasAte(a.prazo||"2099-01-01") - C.diasAte(b.prazo||"2099-01-01"));
    const atencaoTop = emAtencao.slice(0,6);

    // ---------- obras em risco (não-baixo, ordenadas por prazo) ----------
    const riscoRows = obras.map(o=>({o, sit:C.situacaoObra(o), parada:C.obraParada(o)}))
      .filter(r=> r.sit.nivel!=="BAIXO")
      .sort((a,b)=> ({ALTO:0,MEDIO:1,BAIXO:2}[a.sit.nivel]) - ({ALTO:0,MEDIO:1,BAIXO:2}[b.sit.nivel]) || a.sit.diasEntrega - b.sit.diasEntrega)
      .slice(0,6);

    // ---------- minhas pendências ----------
    const minhasPend = M.Store.state.pendencias.filter(p=>p.responsavel===nome && p.status!=="RESOLVIDA")
      .sort((a,b)=> C.diasAte(a.prazo||"2099-01-01") - C.diasAte(b.prazo||"2099-01-01")).slice(0,6);

    // ---------- próximas entregas (7 dias) ----------
    const proximasEntregas = obras.filter(o=> o.status!=="FINALIZADA" && C.diasAte(o.dataEntregaPrevista)>=0 && C.diasAte(o.dataEntregaPrevista)<=7)
      .sort((a,b)=> C.diasAte(a.dataEntregaPrevista) - C.diasAte(b.dataEntregaPrevista));

    // ---------- montagens da semana ----------
    const montagens = M.Store.allMoveis().filter(({m})=> m.etapa==="MONTAGEM")
      .filter(({o})=> !restrito || meuObraIds.has(o.id));

    const totalEntregam = proximasEntregas.length;
    const html = `
      <p class="small muted" style="margin-bottom:4px;">${esc(saudacao())}, ${esc(primeiroNome)}${cargo? " · "+esc(cargo):""}.</p>
      <p class="small" style="margin-bottom:18px;font-weight:700;">
        ${atencaoTop.length? `${atencaoTop.length} ${atencaoTop.length===1?'item trava':'itens travam'} fechamento e esperam por você.` : "Nada travando fechamento no momento."}
        ${totalEntregam? ` ${totalEntregam} obra${totalEntregam>1?'s':''} entrega${totalEntregam>1?'m':''} esta semana.` : ""}
      </p>

      <div class="grid-2">
        ${UI.card({
          title:`Precisa da sua atenção`,
          right: atencaoTop.length? `<span class="chip critical">${emAtencao.length}</span>` : "",
          body: atencaoTop.length
            ? atencaoTop.map(itemAtencaoHtml).join("")
            : `<p class="small muted">Nenhuma pendência crítica no momento.</p>`
        })}
        <div class="card pad">
          <div class="card-title"><span style="flex:1;">Obras em risco</span><a href="#/producao" class="btn ghost sm">ver produção</a></div>
          ${riscoRows.length ? riscoRows.map(({o,sit,parada})=>`
            <div class="risk-card" style="margin-bottom:10px;">
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
            </div>
          `).join("") : `<p class="small muted">Nenhuma obra em risco agora.</p>`}
        </div>
      </div>

      <div class="hr"></div>

      <div class="grid-2">
        <div class="card pad">
          <div class="card-title"><span style="flex:1;">Minhas pendências</span>${minhasPend.length? `<span class="chip critical">${minhasPend.length}</span>`:""}</div>
          ${minhasPend.length ? minhasPend.map(p=>`
            <div class="alert-item" style="cursor:pointer;" onclick="Act.abrirPendenciaEm('${p.id}')">
              ${UI.tipoChip(p.tipo)}
              <div><div>${esc(p.descricao||p.categoria)}</div><div class="alert-sub">${esc(p.obraNome)}${p.movelNome? " · "+esc(p.movelNome):""} · ${p.prazo? (C.diasAte(p.prazo)<=0?"vencida":"prazo "+C.fmtDate(p.prazo)) : "sem prazo"}</div></div>
            </div>`).join("") : `<p class="small muted">Nenhuma pendência sob sua responsabilidade.</p>`}
        </div>
        <div class="card pad">
          <div class="card-title"><span style="flex:1;">Próximas entregas</span><a href="#/calendario" class="btn ghost sm">calendário</a></div>
          ${proximasEntregas.length ? proximasEntregas.map(o=>{
            const bloqueantes = C.pendenciasBloqueantesDe(o.id).length;
            const dias = C.diasAte(o.dataEntregaPrevista);
            const statusTxt = bloqueantes ? `${bloqueantes} pendência(s) abertas` : (dias<=1 ? "sem impedimento — entrega iminente" : "sem impedimento");
            return `<div class="alert-item" style="cursor:pointer;" onclick="Act.go('#/obra/${o.id}')">
              <div><div><b>${esc(o.cliente)}</b> — ${C.fmtDate(o.dataEntregaPrevista)}${dias===0?" (hoje)":dias===1?" (amanhã)":""}</div>
              <div class="alert-sub">${o.numeroOS} · <span style="color:${bloqueantes?"var(--critical)":"var(--good)"};font-weight:700;">${esc(statusTxt)}</span></div></div>
            </div>`;
          }).join("") : `<p class="small muted">Nenhuma entrega prevista nos próximos 7 dias.</p>`}
        </div>
      </div>

      <div class="hr"></div>

      <div class="card pad">
        <div class="card-title"><span style="flex:1;">Montagens da semana</span><a href="#/montagem" class="btn ghost sm">ver montagem</a></div>
        ${montagens.length ? montagens.map(({o,a,m})=>{
          const bloqueiosM = M.Store.bloqueiosMovel(m.id);
          return `<div class="alert-item" style="cursor:pointer;" onclick="Act.irParaObra('${o.id}','${a.id}')">
            ${UI.person(m.responsavel)}
            <div><div>${esc(o.cliente)} · ${esc(a.nome)}</div>
            <div class="alert-sub">${esc(m.nome)}${bloqueiosM.length? ` · <span style="color:var(--critical);">${UI.icon('lock',11)} ${esc(bloqueiosM[0].descricao||bloqueiosM[0].categoria)}</span>`:""}</div></div>
          </div>`;
        }).join("") : `<p class="small muted">Nenhum móvel em montagem no momento.</p>`}
      </div>
    `;
    return {title:"Hoje", crumb:"O que exige você, hoje", html,
      actionsHtml:`${UI.pageSearchInput({id:'hojeSearch', placeholder:'Buscar obra, cliente, OS...'})} <a href="#/nova-obra" class="btn primary">${UI.icon('plus',14)} Nova Obra</a> <button class="btn" onclick="Act.openPendenciaForm(null,null,null)">${UI.icon('alert',14)} Registrar pendência</button>`,
      afterRender(){
        UI.attachQuickSearch('hojeSearch', M.Store.state.obras.map(o=>({label:o.cliente, sub:o.numeroOS, href:`#/obra/${o.id}`})));
      }
    };
  };
})();
