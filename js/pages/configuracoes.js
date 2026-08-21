/* ============================================================
   PÁGINA: Configurações (seção 68-72) — submenus completos
   ============================================================ */
(function(){
  "use strict";
  const M = window.M, UI = M.UI, C = M.Calc;
  M.Pages = M.Pages || {};

  const SUBS = [
    {key:"integracoes", label:"Integrações"},
    {key:"processos", label:"Processos"},
    {key:"indicadores", label:"Indicadores"},
    {key:"tv", label:"Modo TV"},
    {key:"permissoes", label:"Permissões"},
    {key:"notificacoes", label:"Notificações"},
    {key:"assistencias", label:"Assistências"},
    {key:"dados", label:"Dados de exemplo"},
  ];

  function secIntegracoes(){
    return `
      <div class="card pad">
        <div class="card-title">Integração SIS Marcenaria <span class="chip warning">EM BREVE</span></div>
        <p class="small" style="margin-bottom:10px;">
          Hoje a obra entra no Moodo Produção pela importação manual (simulada) do PDF da Ordem de Serviço e do Orçamento.
          No futuro, essa etapa poderá ser automática: o Moodo vai puxar direto da API do SIS Marcenaria os dados de
          <b>cliente, telefone, e-mail, endereço, orçamento, data de entrega, valor, ambientes e valores por ambiente</b> —
          sem precisar arrastar nenhum PDF.
        </p>
        <p class="small muted">
          Hoje a API pública do SIS expõe principalmente <b>clientes, orçamentos e ambientes</b>. Ela ainda não expõe, na documentação pública,
          <b>ordens de produção, móveis detalhados, peças, etapas de fabricação ou montagem</b> — por isso o Moodo Produção continua responsável
          por todo o chão de fábrica, e essa integração fica preparada apenas conceitualmente por enquanto.
        </p>
        <button class="btn sm" disabled style="margin-top:6px;">${UI.icon('link',13)||''} Conectar API SIS Marcenaria (em breve)</button>
      </div>`;
  }

  // ---------- Etapas do pipeline (configuráveis) — seção 68-72 ----------
  function secProcessos(){
    const etapas = M.Store.etapasOrdenadas();
    const fluxos = M.Store.state.fluxosPadrao;

    const etapasRows = etapas.map(e=>{
      const temHist = M.Store.etapaTemHistorico(e.id);
      return `
        <tr class="etapa-row ${e.ativa?'':'inativa'}" draggable="true"
          ondragstart="Act.etapaDragStart(event,'${e.id}')" ondragend="Act.etapaDragEnd(event)"
          ondragover="Act.etapaDragOver(event)" ondrop="Act.etapaDrop(event,'${e.id}')" style="${e.ativa?'':'opacity:.55;'}">
          <td style="width:22px;" class="grip-handle">${UI.icon('grip',14)}</td>
          <td>
            <b>${UI.esc(e.nome)}</b> <span class="chip ${e.cor}">${UI.esc(e.nomeCurto)}</span>
            ${!e.ativa? `<span class="chip neutral" style="margin-left:4px;">inativa</span>`:''}
          </td>
          <td class="small muted">${UI.esc(M.Store.grupoLabel(e.grupo))}</td>
          <td class="small">${e.tempoEsperadoDias}d</td>
          <td class="small">${e.pesoValorProcessado}%</td>
          <td class="small muted">${UI.esc(e.responsavelPadrao||"—")}</td>
          <td>${e.exigeConferencia? `<span class="chip warning">sim</span>`:`<span class="chip neutral">não</span>`}</td>
          <td>
            <div class="flex-gap" style="flex-wrap:wrap;gap:4px;">
              <button class="btn sm" onclick="Act.moverEtapaOrdem('${e.id}','up')" title="Mover para cima">${UI.icon('chevron-up',12)}</button>
              <button class="btn sm" onclick="Act.moverEtapaOrdem('${e.id}','down')" title="Mover para baixo">${UI.icon('chevron-down',12)}</button>
              <button class="btn sm" onclick="Act.editarEtapaForm('${e.id}')" title="Editar">${UI.icon('edit',12)}</button>
              <button class="btn sm" onclick="Act.duplicarEtapa('${e.id}')" title="Duplicar">Duplicar</button>
              ${e.ativa
                ? `<button class="btn sm" onclick="Act.desativarEtapa('${e.id}')" title="Desativar">Desativar</button>`
                : `<button class="btn sm" onclick="Act.ativarEtapa('${e.id}')" title="Reativar">Ativar</button>`}
              ${temHist
                ? `<button class="btn sm" disabled title="Já tem histórico — só pode ser desativada, nunca excluída">${UI.icon('trash',12)}</button>`
                : `<button class="btn sm danger" onclick="Act.excluirEtapaConfirm('${e.id}')" title="Excluir definitivamente">${UI.icon('trash',12)}</button>`}
            </div>
          </td>
        </tr>`;
    }).join("");

    const etapasBlocos = etapas.map(e=>{
      const tarefas = (M.Store.state.tarefasPadrao[e.id]||[]).slice().sort((a,b)=>a.ordem-b.ordem);
      const reqs = M.Store.requisitosDe(e.id);
      return `
        <details class="card pad" style="margin-bottom:12px;">
          <summary style="cursor:pointer;font-weight:700;">${UI.esc(e.nome)} <span class="small muted" style="font-weight:400;">— ${tarefas.length} tarefa(s) padrão · ${reqs.length} requisito(s)</span></summary>
          <div class="grid-2" style="margin-top:14px;">
            <div>
              <div class="flex-between" style="margin-bottom:8px;"><b class="small">Tarefas padrão</b><button class="btn sm" onclick="Act.novaTarefaPadraoForm('${e.id}')">${UI.icon('plus',12)} Nova</button></div>
              ${tarefas.length? `<table class="tbl">
                <thead><tr><th>Tarefa</th><th>Obrigatoriedade</th><th>Resp.</th><th></th></tr></thead>
                <tbody>${tarefas.map(t=>`
                  <tr><td>${UI.esc(t.titulo)}</td>
                    <td><span class="chip ${t.obrigatorio==='OBRIGATORIO'?'critical':t.obrigatorio==='RECOMENDADO'?'warning':'neutral'}">${t.obrigatorio}</span></td>
                    <td class="small muted">${UI.esc(t.responsavelPadrao||"—")}</td>
                    <td><div class="flex-gap" style="gap:4px;">
                      <button class="btn sm" onclick="Act.editarTarefaPadraoForm('${e.id}','${t.id}')" title="Editar">${UI.icon('edit',12)}</button>
                      <button class="btn sm" onclick="Act.moverTarefaPadraoForm('${e.id}','${t.id}')" title="Mover para outra etapa">${UI.icon('arrow-up-right',12)}</button>
                      <button class="btn sm danger" onclick="Act.excluirTarefaPadrao('${e.id}','${t.id}')" title="Excluir">${UI.icon('trash',12)}</button>
                    </div></td>
                  </tr>`).join("")}</tbody>
              </table>` : `<p class="small muted">Nenhuma tarefa padrão nesta etapa ainda.</p>`}
            </div>
            <div>
              <div class="flex-between" style="margin-bottom:8px;"><b class="small">Requisitos</b><button class="btn sm" onclick="Act.novoRequisitoForm('${e.id}')">${UI.icon('plus',12)} Novo</button></div>
              ${reqs.length? `<table class="tbl">
                <thead><tr><th>Requisito</th><th>Obrigatoriedade</th><th></th></tr></thead>
                <tbody>${reqs.map(r=>`
                  <tr class="req-row" draggable="true" ondragstart="Act.etapaDragStart(event,'${r.id}')" ondragend="Act.etapaDragEnd(event)" ondragover="Act.etapaDragOver(event)" ondrop="Act.reqDrop(event,'${e.id}','${r.id}')">
                    <td>${UI.esc(r.nome)}${r.exigeEvidencia? ` <span class="chip neutral">anexo</span>`:''}</td>
                    <td><span class="chip ${r.obrigatorio==='OBRIGATORIO'?'critical':r.obrigatorio==='RECOMENDADO'?'warning':'neutral'}">${r.obrigatorio}</span></td>
                    <td><div class="flex-gap" style="gap:4px;">
                      <button class="btn sm" onclick="Act.editarRequisitoForm('${e.id}','${r.id}')" title="Editar">${UI.icon('edit',12)}</button>
                      <button class="btn sm danger" onclick="Act.excluirRequisito('${e.id}','${r.id}')" title="Excluir">${UI.icon('trash',12)}</button>
                    </div></td>
                  </tr>`).join("")}</tbody>
              </table>` : `<p class="small muted">Nenhum requisito configurado para esta etapa.</p>`}
            </div>
          </div>
        </details>`;
    }).join("");

    return `
      <div class="card pad" style="margin-bottom:16px;">
        <div class="flex-between" style="margin-bottom:10px;">
          <div class="card-title" style="margin:0;">Etapas do pipeline</div>
          <button class="btn primary sm" onclick="Act.novaEtapaForm()">${UI.icon('plus',13)} Nova etapa</button>
        </div>
        <p class="small muted" style="margin-bottom:10px;">Arraste pelas linhas (ou use as setas) para reordenar — o Kanban, as tarefas, a auditoria, os indicadores e as regras de bloqueio seguem essa configuração automaticamente, sem precisar mexer em código. Etapas que já têm histórico (algum móvel ou tarefa já passou por elas) só podem ser desativadas, nunca excluídas — o histórico antigo continua exibindo o nome original da etapa.</p>
        <table class="tbl">
          <thead><tr><th></th><th>Etapa</th><th>Grupo</th><th>Tempo esperado</th><th>Peso no valor</th><th>Resp. padrão</th><th>Confere?</th><th>Ações</th></tr></thead>
          <tbody>${etapasRows}</tbody>
        </table>
      </div>

      <div style="margin-bottom:16px;">
        <div class="card-title" style="margin-bottom:8px;">Tarefas padrão e requisitos por etapa</div>
        <p class="small muted" style="margin-bottom:10px;">Essas tarefas são criadas automaticamente quando um móvel entra na etapa; requisitos obrigatórios bloqueiam o avanço até serem atendidos (ou liberados com ressalva, se permitirem).</p>
        ${etapasBlocos}
      </div>

      <div class="card pad">
        <div class="card-title">Fluxos padrão de pendência</div>
        <p class="small muted" style="margin-bottom:10px;">O caminho operacional que cada categoria de pendência segue, do início até resolvida. Editar aqui só afeta pendências novas — as que já estão em andamento mantêm o fluxo que tinham quando foram abertas.</p>
        ${Object.keys(fluxos).map(k=>`
          <div class="flex-between" style="margin-bottom:12px;align-items:flex-start;gap:10px;">
            <div style="flex:1;min-width:0;">
              <b class="small">${k.replace(/_/g," ")}</b>
              <div class="small muted">${fluxos[k].join(" → ")}</div>
            </div>
            <button class="btn sm" style="flex-shrink:0;" onclick="Act.editarFluxoPadrao('${k}')">${UI.icon('edit',12)} Editar</button>
          </div>`).join("")}
      </div>`;
  }

  // ---------- formulários (modais) — etapas / requisitos / tarefas padrão ----------
  const CORES_ETAPA = ["neutral","brand","gold","good","warning","critical"];

  M.Pages.etapaFormHtml = function(etapa){
    const editing = !!etapa;
    const e = etapa || {id:null, nome:"", nomeCurto:"", grupo:M.STAGE_GROUPS[0].key, cor:"neutral",
      tempoEsperadoDias:1, responsavelPadrao:"", pesoValorProcessado:0, exigeConferencia:false, permiteAvancoExcepcional:true};
    return `
      <div class="modal-head"><h2>${editing?'Editar etapa':'Nova etapa'}</h2><button class="modal-close" data-close>✕</button></div>
      <form id="formEtapa">
        <div class="modal-body">
          ${editing? `<p class="small muted" style="margin-bottom:10px;">Id interno: <code>${UI.esc(e.id)}</code> — não muda depois de criado. O histórico antigo continua exibindo o nome desta etapa mesmo que você o altere aqui.</p>`:''}
          <div class="field-row">
            <div class="field"><label>Nome</label><input name="nome" required value="${UI.esc(e.nome)}" placeholder="Ex: Conferência Final"></div>
            <div class="field"><label>Nome curto (aparece no Kanban)</label><input name="nomeCurto" value="${UI.esc(e.nomeCurto)}" placeholder="Ex: Confer. Final"></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Grupo</label>
              <select name="grupo">${M.STAGE_GROUPS.map(g=>`<option value="${g.key}" ${e.grupo===g.key?'selected':''}>${UI.esc(g.label)}</option>`).join("")}</select>
            </div>
            <div class="field"><label>Cor / status visual</label>
              <select name="cor">${CORES_ETAPA.map(c=>`<option value="${c}" ${e.cor===c?'selected':''}>${c}</option>`).join("")}</select>
            </div>
          </div>
          <div class="field-row">
            <div class="field"><label>Tempo esperado (dias)</label><input type="number" min="0" name="tempoEsperadoDias" value="${e.tempoEsperadoDias}"></div>
            <div class="field"><label>Responsável padrão</label>
              <select name="responsavelPadrao"><option value="">—</option>${M.COLABORADORES.map(c=>`<option ${c.nome===e.responsavelPadrao?'selected':''}>${UI.esc(c.nome)}</option>`).join("")}</select>
            </div>
          </div>
          <div class="field"><label>Peso no valor processado (%)</label><input type="number" min="0" max="100" name="pesoValorProcessado" value="${e.pesoValorProcessado}"></div>
          <div class="check-row"><input type="checkbox" name="exigeConferencia" id="chkEtExigeConf" ${e.exigeConferencia?'checked':''}><label class="label" for="chkEtExigeConf">Exige conferência para concluir</label></div>
          <div class="check-row"><input type="checkbox" name="permiteAvancoExcepcional" id="chkEtPermiteAv" ${e.permiteAvancoExcepcional!==false?'checked':''}><label class="label" for="chkEtPermiteAv">Permite avanço excepcional (liberação com ressalva)</label></div>
        </div>
        <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">${editing?'Salvar':'Criar etapa'}</button></div>
      </form>`;
  };

  M.Pages.requisitoFormHtml = function(etapaId, req){
    const editing = !!req;
    const r = req || {nome:"", obrigatorio:"OBRIGATORIO", permiteOverride:true, exigeEvidencia:false};
    return `
      <div class="modal-head"><h2>${editing?'Editar requisito':'Novo requisito'}</h2><button class="modal-close" data-close>✕</button></div>
      <form id="formRequisito">
        <div class="modal-body">
          <p class="small muted" style="margin-bottom:10px;">Etapa: <b>${UI.esc(M.Store.etapaById(etapaId).nome)}</b></p>
          <div class="field"><label>Nome do requisito</label><input name="nome" required value="${UI.esc(r.nome)}" placeholder="Ex: Ferragens separadas"></div>
          <div class="field"><label>Obrigatoriedade</label>
            <select name="obrigatorio">
              <option value="OBRIGATORIO" ${r.obrigatorio==='OBRIGATORIO'?'selected':''}>Obrigatório</option>
              <option value="RECOMENDADO" ${r.obrigatorio==='RECOMENDADO'?'selected':''}>Recomendado</option>
              <option value="OPCIONAL" ${r.obrigatorio==='OPCIONAL'?'selected':''}>Opcional</option>
            </select>
          </div>
          <div class="check-row"><input type="checkbox" name="permiteOverride" id="chkReqOverride" ${r.permiteOverride!==false?'checked':''}><label class="label" for="chkReqOverride">Permite avanço excepcional (liberar mesmo sem este requisito)</label></div>
          <div class="check-row"><input type="checkbox" name="exigeEvidencia" id="chkReqEvid" ${r.exigeEvidencia?'checked':''}><label class="label" for="chkReqEvid">Exige evidência/anexo</label></div>
        </div>
        <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">${editing?'Salvar':'Criar requisito'}</button></div>
      </form>`;
  };

  M.Pages.tarefaPadraoFormHtml = function(etapaId, t){
    const editing = !!t;
    const item = t || {titulo:"", descricao:"", obrigatorio:"RECOMENDADO", responsavelPadrao:"",
      prazoPadraoDias:null, permiteAvancoExcepcional:true, exigeConferencia:false, instrucoes:""};
    return `
      <div class="modal-head"><h2>${editing?'Editar tarefa padrão':'Nova tarefa padrão'}</h2><button class="modal-close" data-close>✕</button></div>
      <form id="formTarefaPadrao">
        <div class="modal-body">
          <p class="small muted" style="margin-bottom:10px;">Etapa: <b>${UI.esc(M.Store.etapaById(etapaId).nome)}</b></p>
          <div class="field"><label>Título</label><input name="titulo" required value="${UI.esc(item.titulo)}"></div>
          <div class="field"><label>Descrição</label><textarea name="descricao">${UI.esc(item.descricao||"")}</textarea></div>
          <div class="field-row">
            <div class="field"><label>Obrigatoriedade</label>
              <select name="obrigatorio">
                <option value="OBRIGATORIO" ${item.obrigatorio==='OBRIGATORIO'?'selected':''}>Obrigatória</option>
                <option value="RECOMENDADO" ${item.obrigatorio==='RECOMENDADO'?'selected':''}>Recomendada</option>
                <option value="OPCIONAL" ${item.obrigatorio==='OPCIONAL'?'selected':''}>Opcional</option>
              </select>
            </div>
            <div class="field"><label>Responsável padrão</label>
              <select name="responsavelPadrao"><option value="">—</option>${M.COLABORADORES.map(c=>`<option ${c.nome===item.responsavelPadrao?'selected':''}>${UI.esc(c.nome)}</option>`).join("")}</select>
            </div>
          </div>
          <div class="field"><label>Prazo esperado (dias após entrar na etapa)</label><input type="number" min="0" name="prazoPadraoDias" value="${item.prazoPadraoDias==null?'':item.prazoPadraoDias}"></div>
          <div class="field"><label>Instruções (opcional)</label><textarea name="instrucoes">${UI.esc(item.instrucoes||"")}</textarea></div>
          <div class="check-row"><input type="checkbox" name="permiteAvancoExcepcional" id="chkTpAv" ${item.permiteAvancoExcepcional!==false?'checked':''}><label class="label" for="chkTpAv">Permite avanço excepcional</label></div>
          <div class="check-row"><input type="checkbox" name="exigeConferencia" id="chkTpConf" ${item.exigeConferencia?'checked':''}><label class="label" for="chkTpConf">Exige conferência</label></div>
        </div>
        <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">${editing?'Salvar':'Criar tarefa padrão'}</button></div>
      </form>`;
  };

  M.Pages.moverTarefaPadraoFormHtml = function(etapaId, tarefaPadraoId){
    const t = (M.Store.state.tarefasPadrao[etapaId]||[]).find(x=>x.id===tarefaPadraoId);
    const outras = M.Store.etapasOrdenadas().filter(e=>e.id!==etapaId);
    return `
      <div class="modal-head"><h2>Mover tarefa padrão</h2><button class="modal-close" data-close>✕</button></div>
      <form id="formMoverTarefaPadrao">
        <div class="modal-body">
          <p class="small muted" style="margin-bottom:10px;">Mover "<b>${UI.esc(t?t.titulo:"")}</b>" de "<b>${UI.esc(M.Store.etapaById(etapaId).nome)}</b>" para:</p>
          <div class="field"><label>Nova etapa</label>
            <select name="novaEtapaId" required>${outras.map(e=>`<option value="${e.id}">${UI.esc(e.nome)}${e.ativa?'':' (inativa)'}</option>`).join("")}</select>
          </div>
        </div>
        <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Mover</button></div>
      </form>`;
  };

  // ---------- editor de fluxo padrão de pendência (item 12) ----------
  // Trabalha em cima de um rascunho (M.UIState.fluxoDraft) que só vira de
  // verdade no Store quando a pessoa clica em Salvar — cada clique em
  // adicionar/mover/excluir passo só reabre o modal com o rascunho atualizado.
  M.Pages.fluxoPadraoFormHtml = function(){
    const draft = M.UIState.fluxoDraft;
    if(!draft) return "";
    const passos = draft.passos;
    return `
      <div class="modal-head"><h2>Fluxo padrão — ${UI.esc(draft.tipo.replace(/_/g," "))}</h2><button class="modal-close" data-close>✕</button></div>
      <div class="modal-body">
        <p class="small muted" style="margin-bottom:12px;">Esses são os passos que uma pendência nova dessa categoria segue, na ordem. Não afeta pendências já abertas.</p>
        ${passos.map((p,i)=>`
          <div class="flex-gap" style="margin-bottom:8px;align-items:center;">
            <span class="small muted" style="width:18px;flex-shrink:0;">${i+1}.</span>
            <input value="${UI.esc(p)}" style="flex:1;" oninput="Act.editarPassoFluxo(${i}, this.value)">
            <button class="btn sm" ${i===0?'disabled':''} onclick="Act.moverPassoFluxo(${i},-1)" title="Mover para cima">${UI.icon('chevron-up',12)}</button>
            <button class="btn sm" ${i===passos.length-1?'disabled':''} onclick="Act.moverPassoFluxo(${i},1)" title="Mover para baixo">${UI.icon('chevron-down',12)}</button>
            <button class="btn sm danger" ${passos.length<=1?'disabled':''} onclick="Act.excluirPassoFluxo(${i})" title="Excluir passo">${UI.icon('trash',12)}</button>
          </div>`).join("")}
        <button class="btn sm" style="margin-top:6px;" onclick="Act.adicionarPassoFluxo()">${UI.icon('plus',12)} Adicionar passo</button>
      </div>
      <div class="modal-foot">
        <button class="btn" data-close onclick="Act.cancelarEdicaoFluxo()">Cancelar</button>
        <button class="btn primary" onclick="Act.salvarFluxoPadrao()">Salvar fluxo</button>
      </div>`;
  };

  function secIndicadores(){
    const etapas = M.Store.etapasOrdenadas();
    const somaPesoEtapas = etapas.reduce((s,e)=>s+(e.pesoValorProcessado||0),0);
    const pd = M.Store.state.pesosDesempenho;
    const somaPd = Object.values(pd).reduce((s,v)=>s+v,0);
    return `
      <div class="card pad" style="margin-bottom:16px;">
        <div class="card-title">Meta mensal</div>
        <div class="field" style="max-width:240px;">
          <label>Meta do mês (R$)</label>
          <input type="number" step="1000" value="${M.Store.state.metaMensal.valor}" onchange="Act.salvarMeta(this)">
        </div>
      </div>

      <div class="help-banner" style="margin-bottom:16px;">
        ${UI.icon('settings',13)} O peso de cada etapa no valor processado agora é editado direto na etapa, em
        <a href="#/configuracoes/processos" style="text-decoration:underline;">Configurações → Processos → Etapas do pipeline</a>
        (botão Editar de cada etapa). Soma atual entre todas as etapas: <b style="${somaPesoEtapas===100?'color:var(--good)':'color:var(--critical);'}">${somaPesoEtapas}%</b> (o ideal é fechar em 100%).
      </div>

      <div class="card pad">
        <div class="card-title">Peso de cada critério no índice de desempenho</div>
        <form id="formPesosDes" onsubmit="event.preventDefault(); Act.salvarPesosDesempenho(this);">
          <div class="grid-3">
            <div class="field"><label>Valor processado (%)</label><input type="number" name="valorProcessado" value="${pd.valorProcessado}"></div>
            <div class="field"><label>Pontualidade (%)</label><input type="number" name="pontualidade" value="${pd.pontualidade}"></div>
            <div class="field"><label>Qualidade (%)</label><input type="number" name="qualidade" value="${pd.qualidade}"></div>
            <div class="field"><label>Pendências (%)</label><input type="number" name="pendencias" value="${pd.pendencias}"></div>
            <div class="field"><label>Velocidade de resolução (%)</label><input type="number" name="velocidadeResolucao" value="${pd.velocidadeResolucao}"></div>
            <div class="field"><label>Participação (%)</label><input type="number" name="participacao" value="${pd.participacao}"></div>
          </div>
          <div class="flex-between" style="margin-top:6px;">
            <span class="small" style="${somaPd===100?'color:var(--good)':'color:var(--critical);font-weight:700;'}">Soma atual: ${somaPd}%</span>
            <button class="btn primary" type="submit">Salvar pesos</button>
          </div>
        </form>
      </div>`;
  }

  function secTv(){
    const widgets = [
      {id:"producao-hoje", nome:"Produção hoje", tipo:"FIXO", tamanho:"GRANDE", cat:"Operação"},
      {id:"corte", nome:"Corte", tipo:"FIXO", tamanho:"MEDIO", cat:"Operação"},
      {id:"usinagem", nome:"Usinagem", tipo:"FIXO", tamanho:"MEDIO", cat:"Operação"},
      {id:"fitagem", nome:"Fitagem", tipo:"FIXO", tamanho:"MEDIO", cat:"Operação"},
      {id:"pre-montagem", nome:"Pré-montagem", tipo:"FIXO", tamanho:"MEDIO", cat:"Operação"},
      {id:"meta-mensal", nome:"Meta mensal", tipo:"FIXO", tamanho:"GRANDE", cat:"Gestão"},
      {id:"wip", nome:"WIP por etapa", tipo:"FIXO", tamanho:"HORIZONTAL", cat:"Gestão"},
      {id:"atencao-rotativo", nome:"Atenção da equipe", tipo:"ROTATIVO", tamanho:"HORIZONTAL", cat:"Atenção"},
      {id:"entregas", nome:"Próximas entregas", tipo:"CONDICIONAL", tamanho:"HORIZONTAL", cat:"Logística"},
    ];
    const ativos = M.Store.state.tvWidgetsAtivos || widgets.reduce((o,w)=>(o[w.id]=true,o),{});
    return `
      <div class="help-banner">${UI.icon('tv',13)} Editor simplificado nesta versão do protótipo: ative/desative widgets e ajuste a ordem com as setas. Um editor com arraste-e-solte livre de posição/tamanho é evolução natural quando o Modo TV tiver um backend real por trás.</div>
      <div class="card pad">
        <div class="card-title">Biblioteca de widgets</div>
        <div class="widget-lib">
          ${widgets.map(w=>`
            <div class="widget-card">
              <div class="winfo"><div class="wname">${w.nome}</div><div class="wtype"><span>${w.cat} · ${w.tipo}</span> <span class="size-pill">${w.tamanho}</span></div></div>
              <button class="switch ${ativos[w.id]!==false?'on':''}" onclick="Act.toggleTvWidget('${w.id}')"></button>
            </div>`).join("")}
        </div>
      </div>`;
  }

  function permCheck(v){ return `<span class="perm-dot ${v?'on':'off'}"></span>`; }
  // item 10: permissões agora são editáveis de verdade (state.permissoes,
  // via Store.pode/setPermissao) — só quem tem "editarPermissoes" vê
  // checkbox; os outros continuam vendo a bolinha somente-leitura de sempre.
  // FASE 1 (V2 — permissões por ação): mesma tabela de sempre, agora com
  // duas mudanças aditivas —
  // 1) duas colunas novas (GESTOR, ASSISTENCIA — os dois perfis novos, hoje
  //    sem nenhum colaborador atribuído);
  // 2) linhas novas com as chaves de ação granulares (obra.*, pendencia.*,
  //    montagem.*, assistencia.*, agenda.*, admin.*, tv.configurar),
  //    agrupadas por recurso, além das 10 flags antigas que continuam no
  //    topo intactas. valorDe() ganhou uma checagem defensiva a mais:
  //    antes ela quebrava (TypeError) se state.permissoes[perfilKey] não
  //    existisse — o que aconteceria pra qualquer perfil novo num estado
  //    salvo antes desta fase, se Store.load() não tivesse sido corrigido
  //    junto (ver mergePermissoes em js/store.js). Deixamos a checagem aqui
  //    também, redundante de propósito — não custa nada e blinda esta tela
  //    mesmo se o dado chegar de outro jeito no futuro.
  function secPermissoes(){
    const cols = ["ADMIN","PCP","LIDERANCA","OPERADOR","MONTADOR","TV","GESTOR","ASSISTENCIA"];
    const linhas = [
      ["Ver valores das obras","verValores"], ["Ver indicadores financeiros","verIndicadores"],
      ["Ver desempenho / ranking completo","verDesempenho"], ["Ver ranking (próprio + colegas)","verRanking"],
      ["Ver auditoria","verAuditoria"], ["Ver todas as obras","verTodasObras"],
      ["Acessar configurações","verConfiguracoes"], ["Liberar avanço excepcional","liberarExcecao"],
      ["Editar processos (tarefas/fluxos/requisitos)","editarProcesso"], ["Editar permissões","editarPermissoes"],
      ["— Obra: ver (lista)","obra.ver"], ["— Obra: criar","obra.criar"], ["— Obra: editar","obra.editar"],
      ["— Obra: arquivar","obra.arquivar"], ["— Obra: cancelar","obra.cancelar"],
      ["— Obra: ver todas (detalhe, amplo)","obra.verTodas"], ["— Obra: ver atribuídas (detalhe)","obra.verAtribuidas"], ["— Obra: ver contexto (detalhe)","obra.verContexto"],
      ["— Pendência: ver","pendencia.ver"], ["— Pendência: criar","pendencia.criar"], ["— Pendência: editar","pendencia.editar"],
      ["— Pendência: atribuir","pendencia.atribuir"], ["— Pendência: resolver","pendencia.resolver"],
      ["— Montagem: ver","montagem.ver"],
      ["— Montagem: iniciar montagem","montagem.iniciar"], ["— Montagem: marcar travado","montagem.travar"], ["— Montagem: destravar","montagem.destravar"],
      ["— Montagem: marcar pronto p/ finalizar","montagem.marcarPronto"],
      ["— Montagem: aprovar finalização","montagem.aprovarFinalizacao"], ["— Montagem: finalizar com ressalva","montagem.finalizarComRessalva"],
      ["— Assistência: ver","assistencia.ver"], ["— Assistência: criar","assistencia.criar"],
      ["— Assistência: editar","assistencia.editar"], ["— Assistência: concluir","assistencia.concluir"],
      ["— Agenda: ver","agenda.ver"], ["— Agenda: criar","agenda.criar"], ["— Agenda: editar","agenda.editar"],
      ["— Admin: ver","admin.ver"], ["— Admin: indicadores","admin.indicadores"], ["— Admin: auditoria","admin.auditoria"],
      ["— Admin: equipe","admin.equipe"], ["— Admin: configurações","admin.configuracoes"], ["— Admin: usuários","admin.usuarios"],
      ["— Produção: ver (quadro)","producao.ver"], ["— TV: configurar","tv.configurar"],
    ];
    const podeEditar = M.Store.pode("editarPermissoes");
    const valorDe = (perfilKey,acao)=>{
      const overrides = M.Store.state.permissoes && M.Store.state.permissoes[perfilKey];
      if(overrides && Object.prototype.hasOwnProperty.call(overrides,acao)) return overrides[acao];
      return M.perfilDef(perfilKey).pode[acao];
    };
    return `
      <p class="small muted" style="margin-bottom:12px;">Nesta versão os perfis são fixos (Administrador, PCP/Gestão, Líder, Produção, Montador, Consulta/TV, Gestor, Assistência) — a regra de menor acesso já está ativa na navegação e agora também bloqueia acesso direto por link, não só esconde o menu. ${podeEditar? 'Clique numa caixinha pra ligar/desligar.' : 'Só quem tem "Editar permissões" pode alterar esta tabela.'} As linhas com "—" são as permissões novas por ação (Fase 1) — mais granulares que as de cima, e ainda ajustáveis aqui, perfil por perfil.</p>
      <div class="perm-grid-wrap">
        <div class="perm-grid" style="--perm-cols:${cols.length};">
          <div class="perm-head" style="text-align:left;">Permissão</div>
          ${cols.map(c=>`<div class="perm-head">${M.perfilDef(c).label}</div>`).join("")}
          ${linhas.map(([label,key])=>`
            <div class="perm-row-label">${label}</div>
            ${cols.map(c=> podeEditar
              ? `<div class="perm-check"><input type="checkbox" ${valorDe(c,key)?'checked':''} onchange="Act.togglePermissao('${c}','${key}',this.checked)"></div>`
              : `<div class="perm-check">${permCheck(valorDe(c,key))}</div>`
            ).join("")}
          `).join("")}
        </div>
      </div>`;
  }

  function secNotificacoes(){
    const n = M.Store.state.notificacoes;
    const items = [
      ["pendenciaVencendo","Pendência vencendo"], ["tarefaAtrasada","Tarefa atrasada"], ["obraEmRisco","Obra em risco"],
      ["entregaProxima","Entrega próxima"], ["assistenciaVencida","Assistência vencida"], ["fornecedorAtrasado","Fornecedor atrasado"],
    ];
    return `
      <div class="card pad">
        <div class="card-title">Alertas ativos</div>
        <p class="small muted" style="margin-bottom:10px;">Evite excesso de alertas — ative só o que a equipe realmente precisa ver.</p>
        <form id="formNotif" onsubmit="event.preventDefault();Act.salvarNotificacoes(this);">
          ${items.map(([key,label])=>`
            <div class="check-row"><input type="checkbox" name="${key}" ${n[key]?'checked':''}><label class="label">${label}</label></div>`).join("")}
          <button class="btn primary" type="submit" style="margin-top:12px;">Salvar</button>
        </form>
      </div>`;
  }

  function secAssistencias(){
    return `
      <div class="card pad">
        <div class="card-title">Categorias de assistência</div>
        <div class="flex-gap" style="flex-wrap:wrap;">${M.CATEGORIAS_ASSISTENCIA.map(c=>`<span class="chip neutral">${c}</span>`).join("")}</div>
        <div class="hr"></div>
        <div class="card-title">Status do fluxo</div>
        <p class="small muted">Aberta → Em triagem → Agendada → Em execução → Aguardando material / Aguardando cliente → Concluída.</p>
      </div>`;
  }

  function secDados(){
    return `
      <div class="card pad">
        <div class="card-title">Dados de exemplo</div>
        <p class="small muted" style="margin-bottom:10px;">Este protótipo guarda os dados no navegador (localStorage). Use o botão abaixo para restaurar os dados de exemplo originais a qualquer momento.</p>
        <button class="btn danger" onclick="Act.restaurarDados()">${UI.icon('refresh',13)} Restaurar dados de exemplo</button>
      </div>`;
  }

  // CORREÇÃO (item 10 da lista): antes o link "Configurações" só sumia do
  // rodapé pra quem não tinha permissão — quem soubesse o endereço
  // #/configuracoes acessava (e editava) processos, tarefas padrão, fluxos
  // etc. mesmo sem permissão. Agora a página bloqueia de verdade.
  M.Pages.configuracoes = function(sub){
    if(!M.Store.pode("verConfiguracoes")){
      return {title:"Configurações", html:`<div class="card pad"><p>Seu perfil (<b>${UI.esc(M.Store.perfilAtual().label)}</b>) não tem acesso a Configurações.</p></div>`};
    }
    sub = sub || "integracoes";
    const secs = {integracoes:secIntegracoes, processos:secProcessos, indicadores:secIndicadores, tv:secTv,
      permissoes:secPermissoes, notificacoes:secNotificacoes, assistencias:secAssistencias, dados:secDados};
    const fn = secs[sub] || secIntegracoes;
    const html = `
      <div class="tabs">${SUBS.map(s=>`<a href="#/configuracoes/${s.key}" class="tab ${s.key===sub?'active':''}" style="text-decoration:none;">${s.label}</a>`).join("")}</div>
      ${fn()}
    `;
    return {title:"Configurações", crumb:"Processos, indicadores, TV, permissões e notificações", html};
  };
})();
