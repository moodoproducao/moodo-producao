/* ============================================================
   PÁGINA: Para Finalizar — "o que falta para terminar cada obra?"
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  M.Pages.paraFinalizar = function(){
    // AJUSTE (rodada 3, item 1): mesmo padrão de restrição já usado em
    // Produção/Hoje/Montagem/Obras/Calendário (item 9) — sem verTodasObras,
    // só entram obras onde a pessoa tem algo atribuído. Antes esta tela
    // mostrava todas as obras pra qualquer perfil com montagem.ver (inclui
    // Montador, que é restrito) e o link "Abrir obra →" sempre funcionava
    // porque a rota de detalhe não tinha guard nenhum; agora que
    // Store.podeAbrirObra() verifica o contexto de verdade, deixar esta
    // lista sem o mesmo filtro criaria links "mortos" (aparecem, mas caem
    // em "Acesso restrito") — corrigido aqui pra manter a lista coerente
    // com o que a pessoa pode de fato abrir, não pra mudar regra de negócio.
    const restrito = !M.Store.pode("verTodasObras");
    const meuObraIds = restrito ? M.Store.obraIdsDoColaborador(M.Store.state.usuarioAtual) : null;
    // FASE 7.5: rascunho não entra em Para Finalizar (item 7 do pedido).
    const obrasBaseFinalizar = M.Store.obrasOperacionais();
    const obras = (restrito ? obrasBaseFinalizar.filter(o=>meuObraIds.has(o.id)) : obrasBaseFinalizar)
      .slice().sort((a,b)=> C.progressoObra(b).pct - C.progressoObra(a).pct);
    const html = `
      ${restrito? `<div class="help-banner">${UI.icon('user',13)} Mostrando só as obras onde você tem tarefa, pendência ou assistência atribuída.</div>`:""}
      <div class="help-banner">${UI.icon('check-circle',13)} Pergunta que esta tela responde: "o que falta para terminar cada obra?"</div>
      <div class="grid-2">
        ${obras.map(o=>{
          const prog = C.progressoObra(o);
          const faltam = C.paraFinalizar(o);
          return `<div class="card pad">
            <div class="flex-between"><b>${UI.esc(o.cliente)}</b><b>${prog.pct}%</b></div>
            <div class="small muted" style="margin-bottom:6px;">${o.numeroOS} · entrega ${C.fmtDate(o.dataEntregaPrevista)}</div>
            ${UI.progressBar(prog.pct)}
            <div style="margin-top:10px;">
              ${faltam.length? `<div class="small" style="font-weight:700;margin-bottom:4px;">FALTA:</div>` + faltam.map(g=>`
                <div style="margin-bottom:8px;">
                  <div class="small muted" style="font-weight:700;">${UI.esc(g.ambienteNome)}</div>
                  <ul style="margin:2px 0 0 18px;font-size:12.5px;line-height:1.9;">${g.itens.map(f=>`<li>${UI.esc(f)}</li>`).join("")}</ul>
                </div>`).join("")
                : `<p class="small" style="color:var(--good);font-weight:700;">${UI.icon('check',12)} Nada pendente — pronta para finalizar!</p>`}
            </div>
            <a class="btn sm" href="#/obra/${o.id}" style="margin-top:10px;">Abrir obra →</a>
          </div>`;
        }).join("")}
      </div>
    `;
    return {title:"Para Finalizar", crumb:"O que falta, obra por obra", html};
  };
})();
