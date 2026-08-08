/* ============================================================
   PÁGINA: Desempenho da equipe — ranking (seções 35-38)
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  M.Pages.desempenho = function(){
    const podeVerTudo = M.Store.pode("verDesempenho");
    const nome = M.Store.state.usuarioAtual;
    let ranking = C.rankingColaboradores();
    if(!podeVerTudo){
      // regra de menor acesso: operador só vê a própria linha + posição (seção 57)
      const idx = ranking.findIndex(r=>r.nome===nome);
      const minha = ranking[idx];
      ranking = minha ? [minha] : [];
      return {title:"Meu Desempenho", crumb:"Seus indicadores — pergunte ao PCP sobre o ranking completo", html: rankingTable(ranking, idx+1, true)};
    }
    const sel = M.UIState.desempenhoSel;

    const html = `
      ${rankingTable(ranking, null, false, sel)}

      <div class="card pad" style="margin-top:16px;">
        <div class="flex-between"><div class="card-title" style="margin-bottom:0;">Bonificação <span class="chip warning">BETA / EM DEFINIÇÃO</span></div></div>
        <p class="small muted" style="margin-top:8px;">Esta tela ainda não calcula folha ou pagamento real — por enquanto só acumula os dados que uma futura régua de bonificação vai considerar: valor processado, produtividade física, pontualidade, qualidade, velocidade de resolução, retrabalho e participação. Nada aqui deve ser usado como cálculo definitivo de bônus.</p>
      </div>
    `;
    return {title:"Desempenho", crumb:"Índice geral, ranking e valor processado por colaborador", html};
  };

  function rankingTable(ranking, posicaoFixa, simples, sel){
    return `
      <div class="card pad">
        <div class="rank-row head">
          <span></span><span>Colaborador</span>
          <span class="rk-hide">Tarefas</span><span>Valor proc.</span><span class="rk-hide">Pontual.</span>
          <span class="rk-hide">Pendências</span><span class="rk-hide">Retrabalhos</span><span>Qualidade</span><span>Índice</span>
        </div>
        ${ranking.map((r,i)=>{
          const pos = posicaoFixa || (i+1);
          return `
          <div class="rank-row" style="cursor:${simples?'default':'pointer'};" ${simples?'':`onclick="Act.setDesempenhoSel('${r.nome}')"`}>
            <span class="rank-pos">${pos}º</span>
            <span>${UI.person(r.nome)}</span>
            <span class="rk-hide">${r.tarefasConcluidas}</span>
            <span><b>${C.fmtBRLk(r.valorProcessado)}</b></span>
            <span class="rk-hide"><span class="chip ${r.normPontual>=90?'good':r.normPontual>=70?'warning':'critical'}">${r.normPontual}%</span></span>
            <span class="rk-hide">${r.pendResolvidas}/${r.pendTotal}</span>
            <span class="rk-hide">${r.refacoes? `<span class="chip critical">${r.refacoes}</span>`:`<span class="chip good">0</span>`}</span>
            <span><span class="chip ${r.normQualidade>=90?'good':r.normQualidade>=70?'warning':'critical'}">${r.normQualidade}%</span></span>
            <span class="rank-idx">${r.indice}</span>
          </div>
          ${sel===r.nome? `<div style="padding:12px;background:var(--surface-alt);border-radius:8px;margin:4px 0 10px;">
            <div class="grid-3">
              <div><div class="small muted">Tarefas totais</div><b>${r.tarefasTotal}</b></div>
              <div><div class="small muted">Ambientes trabalhados</div><b>${r.ambientesTrabalhados}</b></div>
              <div><div class="small muted">Horas registradas</div><b>${r.horas}h</b></div>
              <div><div class="small muted">Tempo médio de resolução</div><b>${r.tempoMedioDias!=null? r.tempoMedioDias+"d":"—"}</b></div>
              <div><div class="small muted">Reincidências</div><b>${r.reincidencias}</b></div>
              <div><div class="small muted">Resultado OK / com ressalva</div><b>${r.ok} / ${r.comRessalva}</b></div>
            </div>
          </div>`:""}
        `;}).join("") || `<p class="small muted">Sem dados de desempenho ainda.</p>`}
      </div>
    `;
  }
})();
