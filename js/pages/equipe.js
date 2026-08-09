/* ============================================================
   PÁGINA: Equipe
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  M.Pages.equipe = function(){
    const podeVerDesempenho = M.Store.pode("verDesempenho");
    const podeGerenciar = M.Store.pode("verConfiguracoes");
    const nuvemOk = !!(M.Supa && M.Supa.habilitado);
    const lista = M.COLABORADORES.slice().sort((a,b)=> (a.ativo===false?1:0) - (b.ativo===false?1:0));
    const html = `
      ${podeGerenciar && !nuvemOk? `<div class="help-banner">${UI.icon('alert',13)} Cadastro de equipe precisa da nuvem conectada (Supabase) — sem isso dá pra ver a equipe, mas não pra incluir ou editar.</div>`:""}
      <div class="grid-3">
        ${lista.map(c=>{
          const perf = C.desempenhoColaborador(c.nome);
          const emAndamento = M.Store.state.tarefas.filter(t=>t.executadoPor===c.nome && t.status==="EM_ANDAMENTO");
          const inativo = c.ativo===false;
          return `<div class="card pad" style="${inativo?'opacity:.55;':''}">
            <div class="flex-between">
              <div class="flex-gap"><span class="avatar lg">${UI.initials(c.nome)}</span>
                <div><b>${UI.esc(c.nome)}</b><div class="small muted">${UI.esc(c.cargo||"")}</div></div>
              </div>
              ${podeGerenciar && nuvemOk ? `<button class="btn-icon" title="Editar" onclick="Act.openColaboradorForm('${c.id}')">${UI.icon('edit',15)}</button>`:""}
            </div>
            <div class="flex-gap" style="margin-top:8px;flex-wrap:wrap;">
              ${UI.perfilChip(c.perfil)}
              ${inativo? `<span class="chip neutral">inativo</span>`:""}
              ${c.telefone? `<span class="small muted">${UI.icon('phone',11)} ${UI.esc(c.telefone)}</span>`:""}
            </div>
            <div class="hr"></div>
            ${podeVerDesempenho ? `<div class="small"><b>${perf.tarefasConcluidas}</b> tarefas concluídas · <b>${C.fmtBRLk(perf.valorProcessado)}</b> processados</div>` : ""}
            ${emAndamento.length? `<div class="small muted" style="margin-top:6px;">Agora: ${UI.esc(emAndamento[0].titulo)}</div>`: `<div class="small muted" style="margin-top:6px;">Sem tarefa em andamento</div>`}
            ${podeGerenciar && nuvemOk ? `<div class="flex-gap" style="margin-top:10px;">
              ${inativo? `<button class="btn sm" onclick="Act.reativarColaborador('${c.id}')">${UI.icon('check',12)} Reativar</button>`
                        : `<button class="btn sm" onclick="Act.desativarColaborador('${c.id}')">${UI.icon('x',12)} Desativar</button>`}
            </div>`:""}
          </div>`;
        }).join("")}
      </div>
    `;
    return {title:"Equipe", crumb:"Colaboradores, cargo e perfil de acesso", html,
      actionsHtml: podeGerenciar? `<button class="btn primary" onclick="Act.openColaboradorForm(null)">${UI.icon('plus',14)} Novo colaborador</button>` : ""};
  };

  M.Pages.colaboradorFormHtml = function(c){
    const editando = !!c;
    return `
      <div class="modal-head"><h2>${editando? "Editar colaborador" : "Novo colaborador"}</h2><button class="modal-close" data-close>✕</button></div>
      <form id="formColaborador">
        <div class="modal-body">
          <div class="field"><label>Nome</label><input name="nome" required value="${editando?UI.esc(c.nome):''}"></div>
          <div class="field-row">
            <div class="field"><label>Cargo</label><input name="cargo" placeholder="Ex: Montador" value="${editando?UI.esc(c.cargo||''):''}"></div>
            <div class="field"><label>Telefone</label><input name="telefone" placeholder="(11) 90000-0000" value="${editando?UI.esc(c.telefone||''):''}"></div>
          </div>
          <div class="field"><label>Perfil de acesso</label>
            <select name="perfil">${M.PERFIS.map(p=>`<option value="${p.key}" ${editando&&c.perfil===p.key?'selected':''}>${p.label}</option>`).join("")}</select>
          </div>
        </div>
        <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">${editando?"Salvar":"Criar colaborador"}</button></div>
      </form>`;
  };
})();
