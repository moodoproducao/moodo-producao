/* ============================================================
   PÁGINA: Minha Produção — tela inicial mobile do colaborador (seções 29, 74)
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  function saudacao(){
    const h = new Date().getHours();
    return h<12 ? "Bom dia" : h<18 ? "Boa tarde" : "Boa noite";
  }

  M.Pages.meuPainel = function(){
    const nome = M.Store.state.usuarioAtual;
    const primeiroNome = nome.split(" ")[0];
    const minhas = M.Store.state.tarefas.filter(t=>t.responsavelPlanejado===nome || t.executadoPor===nome);
    const emAndamento = minhas.find(t=>t.status==="EM_ANDAMENTO");
    const proximas = minhas.filter(t=>t.status==="PLANEJADA").slice(0,5);
    const concluidasHoje = minhas.filter(t=>t.status==="CONCLUIDA" && t.data===M.todayISO());
    const atrasadas = minhas.filter(t=> t.status!=="CONCLUIDA" && t.prazo && C.diasAte(t.prazo)<0).length;
    const pend = M.Store.state.pendencias.filter(p=>p.responsavel===nome && p.status!=="RESOLVIDA")
      .sort((a,b)=> C.diasAte(a.prazo||"2099-01-01") - C.diasAte(b.prazo||"2099-01-01"));

    // CORREÇÃO (auditoria funcional #81): "Minha Produção" mostrava a tarefa
    // atual/próxima sem avisar se o móvel dela está com uma obra/pendência
    // bloqueando o avanço — o colaborador só descobria isso ao tentar avançar
    // a etapa lá na Produção. Agora avisa direto aqui, no painel dele.
    function bloqueioDoMovel(t){
      if(!t || !t.movelId) return null;
      const f = M.Store.findMovel(t.movelId);
      return f && f.m.bloqueio ? f.m.bloqueio : null;
    }
    const bloqueioAtual = bloqueioDoMovel(emAndamento) || (!emAndamento ? bloqueioDoMovel(proximas[0]) : null);
    const bloqueioHtml = bloqueioAtual ? `
      <div class="help-banner" style="background:var(--critical-bg);border-color:var(--critical);color:var(--critical);margin-top:10px;">
        ${UI.icon('lock',13)} <b>Móvel bloqueado:</b> ${UI.esc(bloqueioAtual.categoria)} — ${UI.esc(bloqueioAtual.descricao)}. Responsável: ${UI.esc(bloqueioAtual.responsavel)}.
      </div>` : "";

    const agoraHtml = emAndamento ? `
      <div class="mp-now">
        <div class="eyebrow">Agora</div>
        <div class="os">${UI.esc(emAndamento.obraNome)}${emAndamento.movelNome? " · "+UI.esc(emAndamento.movelNome):""}</div>
        <div class="titulo">${UI.esc(emAndamento.titulo)}</div>
        <div class="etapa">${emAndamento.etapa? M.Store.etapaById(emAndamento.etapa).nome : "Tarefa complementar"} · desde ${emAndamento.inicio||"—"}</div>
        <div class="actions">
          <button class="btn" onclick="Act.pausarTarefa('${emAndamento.id}')">${UI.icon('pause',15)} Pausar</button>
          <button class="btn primary" onclick="Act.pedirResultado('${emAndamento.id}')">${UI.icon('check',15)} Concluir</button>
        </div>
        ${bloqueioHtml}
      </div>
    ` : (proximas[0] ? `
      <div class="mp-now">
        <div class="eyebrow">Próxima</div>
        <div class="os">${UI.esc(proximas[0].obraNome)}${proximas[0].movelNome? " · "+UI.esc(proximas[0].movelNome):""}</div>
        <div class="titulo">${UI.esc(proximas[0].titulo)}</div>
        <div class="etapa">${proximas[0].etapa? M.Store.etapaById(proximas[0].etapa).nome : "Tarefa complementar"}</div>
        <div class="actions">
          <button class="btn primary" onclick="Act.iniciarTarefa('${proximas[0].id}')">${UI.icon('play',15)} Iniciar</button>
        </div>
        ${bloqueioHtml}
      </div>
    ` : `
      <div class="mp-now">
        <div class="eyebrow">Agora</div>
        <div class="titulo">Nenhuma tarefa no momento</div>
        <div class="etapa">Você está em dia! Confira Pendências ou fale com o PCP.</div>
      </div>
    `);

    const proximasListHtml = proximas.slice(emAndamento?0:1).map((t,i)=>`
      <div class="mp-list-item">
        <span class="n">${i+1}</span>
        <div style="flex:1;"><b>${UI.esc(t.titulo)}</b><div class="small muted">${UI.esc(t.obraNome)}${t.movelNome?" · "+UI.esc(t.movelNome):""}</div></div>
        <button class="btn sm" onclick="Act.iniciarTarefa('${t.id}')">${UI.icon('play',12)}</button>
      </div>`).join("") || `<p class="small muted">Sem outras tarefas planejadas.</p>`;

    const pendHtml = pend.length ? pend.slice(0,4).map(p=>{
      const proximaAcao = p.fluxoPassos ? p.fluxoPassos[p.passoAtual] : "Resolver";
      const urgente = p.prazo && C.diasAte(p.prazo)<=0;
      return `<div class="${urgente?'pending-urgent':'card pad'}" style="margin-bottom:8px;" onclick="Act.go('#/pendencias')">
        ${urgente?`<div class="eyebrow">Urgente</div>`:""}
        <b>${UI.esc(p.categoria)}</b> — ${UI.esc(p.obraNome)}
        <div class="next-action" style="margin-top:6px;"><div class="lbl">Próxima ação</div><div class="txt">${UI.esc(proximaAcao)}</div></div>
        <div class="small muted" style="margin-top:6px;">Prazo: ${p.prazo? (C.diasAte(p.prazo)===0?"hoje":C.fmtDate(p.prazo)) : "sem prazo"}</div>
        <button class="btn sm primary" style="margin-top:8px;" onclick="event.stopPropagation();Act.avancarFluxo('${p.id}')">Continuar</button>
      </div>`;
    }).join("") : `<p class="small muted">Nenhuma pendência sob sua responsabilidade.</p>`;

    const html = `
      <p class="small muted" style="margin-bottom:14px;">${saudacao()}, ${UI.esc(primeiroNome)}.</p>

      ${agoraHtml}

      <div class="section-title" style="margin-top:22px;">Próximas</div>
      <div class="card pad">${proximasListHtml}</div>

      <div class="section-title">Minhas pendências ${pend.length? `<span class="chip critical">${pend.length}</span>`:''}</div>
      ${pendHtml}

      <div class="mp-quick">
        <div class="qtile"><div class="n">${atrasadas}</div><div class="l">Atrasadas</div></div>
        <div class="qtile"><div class="n">${concluidasHoje.length}</div><div class="l">Concluídas hoje</div></div>
      </div>

      <div class="card pad" style="margin-top:4px;">
        <button class="btn" style="width:100%;justify-content:center;" onclick="Act.reportarProblema('${emAndamento?emAndamento.id:(proximas[0]?proximas[0].id:'')}')" ${(!emAndamento && !proximas[0])?'disabled':''}>
          ${UI.icon('camera',14)} Reportar problema
        </button>
      </div>
    `;
    return {title:"Minha Produção", crumb:"Painel do colaborador", html};
  };
})();
