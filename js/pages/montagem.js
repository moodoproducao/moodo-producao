/* ============================================================
   PÁGINA: Montagem — entrega + montagem final + encerramento
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  const CHECKLIST_ENCERRAMENTO = [
    "Todos os móveis instalados","Portas reguladas","Gavetas reguladas","Ferragens conferidas",
    "Limpeza","Fotos finais","Conferência final","Pendências registradas",
  ];

  // FASE 4 (handoff): "prioridade para finalizar" tem fundo próprio e botão
  // direto — incentiva o comportamento, não é só mais uma lista.
  function linhaPrioridade(l){
    const {o,a,sit,itensFaltando,itens,pct} = l;
    return `<div class="card pad" style="background:var(--surface-alt);margin-bottom:8px;">
      <div class="flex-between">
        <div>
          <b>${UI.esc(a.nome)}</b> <span class="small muted">${UI.esc(o.cliente)} · ${o.numeroOS}</span>
          <div class="small muted" style="margin-top:2px;">${itensFaltando? `Falta ${itensFaltando} item${itensFaltando>1?'ns':''} · ${UI.esc(itens[0])}` : "Pronta para finalizar"}</div>
        </div>
        <div style="text-align:right;">
          <b>${pct}%</b>
          ${UI.situacaoAmbienteChip(sit)}
        </div>
      </div>
      ${UI.progressBar(pct, sit.key==="TRAVADO"?"blocked":(pct>=100?"good":""))}
      <div style="margin-top:8px;display:flex;gap:8px;">
        <button class="btn sm primary" onclick="Act.abrirFinalizarAmbiente('${a.id}')">${UI.icon(sit.key==="TRAVADO"?'lock':'check-circle',12)} ${sit.key==="TRAVADO"?'Destravar':'Finalizar'}</button>
        <a class="btn sm ghost" href="#/obra/${o.id}">Abrir obra</a>
        ${M.Store.pode("pendencia.criar")? `<button class="btn sm ghost" onclick="Act.openPendenciaForm('${o.id}','${a.id}')">${UI.icon('alert',12)} + Pendência</button>` : ""}
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
    const obrasVisiveis = restrito ? M.Store.state.obras.filter(o=>meuObraIds.has(o.id)) : M.Store.state.obras;

    const agregado = C.agregarMontagem(obrasVisiveis);
    const prioridade = C.prioridadeParaFinalizar(obrasVisiveis);

    const relevantes = M.Store.allMoveis().filter(({o,m})=>{
      if(restrito && !meuObraIds.has(o.id)) return false;
      const p = M.Store.posicaoEtapa(m.etapa);
      return p>=posEntrega && p<=posMontagem;
    });

    const html = `
      ${restrito? `<div class="help-banner">${UI.icon('user',13)} Mostrando só as obras onde você tem tarefa, pendência ou assistência atribuída.</div>`:""}

      <div class="help-banner">${UI.icon('wrench',13)} Progresso físico e taxa de fechamento nunca são somados — a diferença entre os dois é o esforço espalhado (itens montados, mas ambiente ainda não finalizado formalmente).</div>

      <div class="stat-row">
        ${UI.statTile({icon:'wrench', label:'Progresso físico', value:agregado.fisico+'%', sub:`${agregado.ambientesIniciados} ambiente(s) iniciados de ${agregado.ambientesTotal} previstos`})}
        ${UI.statTile({icon:'check-circle', label:'Taxa de fechamento', value:agregado.fechamento+'%', critical: agregado.fisico-agregado.fechamento>=30, sub:`${agregado.ambientesFinalizados} finalizado(s) · ${agregado.ambientesTotal-agregado.ambientesFinalizados} aguardando fechamento`})}
      </div>

      <div class="card-title" style="margin:18px 0 8px;"><span style="flex:1;">Prioridade para finalizar</span><span class="chip ${prioridade.length?'critical':'good'}">${prioridade.length}</span></div>
      ${prioridade.length ? prioridade.map(linhaPrioridade).join("") : `<p class="small muted">Nenhum ambiente perto do fechamento agora — ou faltam 3+ itens em todos, ou já estão todos finalizados.</p>`}

      <div class="card-title" style="margin:22px 0 8px;">Móveis em entrega / montagem</div>
      ${relevantes.length ? `
      <div class="card pad">
        <table class="tbl">
          <thead><tr><th>Móvel</th><th>Obra</th><th>Etapa</th><th>Requisitos</th><th>Responsável</th><th>Entrega prevista</th><th></th></tr></thead>
          <tbody>${relevantes.map(({o,a,m})=>{
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
          }).join("")}</tbody>
        </table>
      </div>
      ` : `<p class="small muted">Nenhum móvel em entrega ou montagem no momento.</p>`}
    `;

    return {title:"Montagem", crumb:"Físico × fechamento, prioridade para finalizar e itens em campo", html};
  };

  // ---------- finalizar AMBIENTE (Fase 4 — handoff, distinto do encerramento por móvel abaixo) ----------
  M.Pages.finalizarAmbienteHtml = function(f){
    const {o,a} = f;
    const bloqueios = M.Store.bloqueiosAmbiente(a.id);
    const checklist = M.Store.checklistEncerramentoAmbiente(a);
    const naoMontados = a.moveis.filter(m=> M.Store.posicaoEtapa(m.etapa) < M.Store.posicaoEtapa("MONTAGEM"));
    const pendente = bloqueios.length>0 || checklist.some(c=>!c.feito) || naoMontados.length>0;
    const podeRessalva = M.Store.pode("liberarExcecao");
    const pendVinculaveis = M.Store.state.pendencias.filter(p=>p.ambienteId===a.id && p.status!=="RESOLVIDA");
    return `
      <div class="modal-head"><div><h2>Finalizar ${UI.esc(a.nome)}?</h2><div class="meta">${UI.esc(o.cliente)} · ${o.numeroOS}</div></div><button class="modal-close" data-close>✕</button></div>
      <form id="formFinalizarAmbiente" data-bloqueios="${bloqueios.length}" data-nao-montados="${naoMontados.length}">
        <div class="modal-body">
          ${bloqueios.length? `<div class="help-banner" style="background:var(--critical-bg);border-color:var(--critical);color:var(--critical);">
            ${UI.icon('lock',13)} <b>Ambiente travado:</b> ${UI.esc(bloqueios[0].descricao||bloqueios[0].categoria)}${bloqueios.length>1?` · +${bloqueios.length-1} outra(s)`:''}.
            <a href="#/pendencias" data-close style="text-decoration:underline;">ver em Pendências →</a>
          </div>` : ""}
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
                Finalizar com ressalva${podeRessalva?'':' — requer PCP, Liderança ou Administrador'}</label>
            </div>
            <div id="ambRessalvaFields" style="display:none;">
              <div class="field"><label>Motivo</label><textarea name="motivo" placeholder="Descreva o que ficou pendente"></textarea></div>
              ${pendVinculaveis.length? `<div class="field"><label>Pendência vinculada (opcional)</label><select name="pendenciaVinculada"><option value="">—</option>${pendVinculaveis.map(p=>`<option value="${p.id}">${UI.esc(p.descricao||p.categoria)}</option>`).join("")}</select></div>` : ""}
            </div>
          </div>
          <p id="faProntoMsg" class="small" style="color:var(--good);margin-top:10px;${pendente?'display:none;':''}">${UI.icon('check',12)} Tudo pronto — pode finalizar.</p>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn" data-close>Cancelar</button>
          <button type="submit" class="btn primary" id="faSubmitBtn">${pendente?'Finalizar com ressalva':'Finalizar ambiente'}</button>
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
