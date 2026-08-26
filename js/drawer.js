/* ============================================================
   FASE 7.5 — Context Drawer ("Detalhe Rápido", Parte C)

   Componente único e reutilizável (item 21 do pedido): 1 clique numa
   Pendência, em QUALQUER lugar do app (Hoje, Pendências lista, Pendências
   Kanban, Obra, Montagem, Assistência), abre este MESMO painel — nunca
   navega automaticamente. Ação explícita altera algo; "Abrir completo"
   navega. Desktop = painel fixo do lado direito; mobile = overlay de
   altura confortável (ver .drawer-* em css/styles.css).

   Escopo desta entrega: só Pendência (item 34 — "não espalhar antes de
   validar Pendência primeiro"). Tarefa/Assistência/Montagem ficam pra
   depois (item 28/29/30), reaproveitando exatamente este mesmo shell —
   por isso o mecanismo de abrir/fechar/atualizar já é genérico por
   `tipo`, só o renderizador de conteúdo é específico de Pendência por
   enquanto.
   ============================================================ */
(function(){
  "use strict";
  const M = window.M;
  M.Drawer = M.Drawer || {};

  let estadoAtual = null; // {tipo:"pendencia", id:"..."} | null

  function ensureDom(){
    let ov = document.getElementById("drawerOverlay");
    if(!ov){
      ov = document.createElement("div");
      ov.id = "drawerOverlay";
      ov.className = "drawer-overlay";
      ov.innerHTML = `<div class="drawer-panel" id="drawerPanel"></div>`;
      document.body.appendChild(ov);
      ov.addEventListener("click", (e)=>{ if(e.target===ov) M.Drawer.fechar(); });
    }
    return ov;
  }

  // Item 22: campo só aparece se existir de verdade (nunca inventa dado
  // faltante) — helper genérico pra não repetir `campo? ... : ""` em cada
  // linha do template.
  function linha(label, valorHtml){
    if(valorHtml==null || valorHtml==="") return "";
    return `<div class="drawer-section"><div class="lbl">${M.UI.esc(label)}</div><div>${valorHtml}</div></div>`;
  }

  function renderPendenciaHtml(id){
    const UI = M.UI, C = M.Calc;
    const p = M.Store.state.pendencias.find(x=>x.id===id);
    if(!p) return null;
    const o = p.obraId ? M.Store.getObra(p.obraId) : null;
    const dias = C.diasDesde(p.abertura);
    const impDef = M.impactoDef(p.impacto);
    const proximaAcao = p.status!=="RESOLVIDA" && p.fluxoPassos ? p.fluxoPassos[p.passoAtual] : null;
    const hist = M.Store.historicoDaPendencia(p.id).slice(0,3);
    const fotosAbertura = (p.fotosAbertura&&p.fotosAbertura.length) ? p.fotosAbertura : (p.fotos||[]);
    // Cliente → Obra → Ambiente → Móvel (item 5/22 — hierarquia estrita,
    // sem granularidade de peça/operação, isso é DinaBox).
    const breadcrumb = [o? (o.cliente||null) : null, o? (o.nome||null) : (p.obraNome||null), p.ambienteNome||null, p.movelNome||null]
      .filter((v,i,arr)=> v && arr.indexOf(v)===i) // remove vazio e duplicata direta (ex.: nome da obra == cliente)
      .map(v=>UI.esc(v)).join(" → ");

    const podeAtribuir = M.Store.pode("pendencia.atribuir");
    const podeEditar = M.Store.pode("pendencia.editar");
    const podeResolver = M.Store.pode("pendencia.resolver");
    const naoResolvida = p.status!=="RESOLVIDA";

    const acoes = [];
    if(naoResolvida && podeEditar) acoes.push(`<button class="btn sm primary" onclick="Act.avancarFluxo('${p.id}')">${UI.icon('chevron-right',12)} Continuar fluxo</button>`);
    if(naoResolvida && podeResolver) acoes.push(`<button class="btn sm" onclick="Act.setPendenciaStatus('${p.id}','RESOLVIDA')">${UI.icon('check',12)} Marcar resolvida</button>`);
    if(p.status==="RESOLVIDA" && podeEditar) acoes.push(`<button class="btn sm" onclick="Act.reabrirPendencia('${p.id}')">${UI.icon('refresh',12)} Reabrir</button>`);
    if(podeEditar) acoes.push(`<button class="btn sm ghost" onclick="Act.adicionarFotosPendencia('${p.id}','${naoResolvida?'abertura':'resolucao'}')">${UI.icon('camera',12)} Adicionar foto</button>`);
    if(p.obraId) acoes.push(`<button class="btn sm ghost" onclick="M.Drawer.fechar();Act.go('#/obra/${p.obraId}')">${UI.icon('building',12)} Abrir obra</button>`);
    acoes.push(`<button class="btn sm ghost" onclick="M.Drawer.abrirCompletoPendencia('${p.id}')">${UI.icon('arrow-up-right',12)} Abrir completo</button>`);

    return `
      <div class="drawer-head">
        <div>
          <div class="small muted">${UI.tipoChip(p.tipo)} ${UI.esc(p.categoria)}</div>
          <h2 style="font-size:16px;margin-top:4px;">${UI.esc(p.descricao||p.categoria)}</h2>
        </div>
        <button class="drawer-close" onclick="M.Drawer.fechar()">✕</button>
      </div>
      <div class="drawer-body">
        ${breadcrumb? `<div class="drawer-breadcrumb">${breadcrumb}</div>`:""}
        <div class="flex-gap" style="gap:6px;flex-wrap:wrap;margin-bottom:16px;">
          ${UI.statusPendenciaChip(p.status)} ${UI.impactoChip(p.impacto)}
          <span class="chip ${dias>=5?'critical':dias>=2?'warning':'neutral'}">${dias}d em aberto</span>
        </div>

        ${linha("Descrição", p.descricao? `<p class="small" style="margin:0;">${UI.esc(p.descricao)}</p>` : "")}
        ${linha("Próxima ação", proximaAcao? UI.esc(proximaAcao) : "")}
        ${linha("Responsável atual", p.responsavel? UI.person(p.responsavel) : "")}
        ${linha("Prazo", p.prazo? C.fmtDate(p.prazo) : "")}
        ${linha("Origem", p.origem? UI.esc(p.origem) : "")}
        ${linha("Observações", p.observacoes? `<p class="small" style="margin:0;">${UI.esc(p.observacoes)}</p>` : "")}
        ${linha("Criada em", p.abertura? `${C.fmtDate(p.abertura)}${p.criadoPor? " · "+UI.person(p.criadoPor) : ""}` : "")}
        ${linha("Última atualização", p.atualizadoEm? `${C.fmtDate(String(p.atualizadoEm).slice(0,10))}${p.atualizadoPor? " · "+UI.person(p.atualizadoPor) : ""}` : "")}
        ${linha("Fotos de abertura", fotosAbertura.length? UI.fotosGaleriaHtml(fotosAbertura) : "")}
        ${linha("Fotos de resolução", (p.fotosResolucao&&p.fotosResolucao.length)? UI.fotosGaleriaHtml(p.fotosResolucao) : "")}
        ${linha("Histórico recente", hist.length? `
          <ul style="margin:0 0 0 16px;font-size:12px;line-height:1.9;color:var(--ink-soft);">
            ${hist.map(h=>`<li>${C.fmtDate(h.data.slice(0,10))} — <b>${UI.esc(h.usuario||"—")}</b>: ${UI.esc(h.descricao)}</li>`).join("")}
          </ul>
          <a href="javascript:void(0)" class="small" onclick="M.Drawer.abrirHistoricoCompletoPendencia('${p.id}')">Ver histórico completo</a>
        ` : "")}
      </div>
      <div class="drawer-actions">${acoes.join("")}</div>
    `;
  }

  function renderConteudoAtual(){
    if(!estadoAtual) return null;
    if(estadoAtual.tipo==="pendencia") return renderPendenciaHtml(estadoAtual.id);
    return null; // outros tipos chegam nas próximas fases (item 34-F)
  }

  M.Drawer.abrirPendencia = function(pendId){
    estadoAtual = {tipo:"pendencia", id:pendId};
    // item 22: registra a primeira visualização deste usuário nesta
    // pendência — idempotente, silencioso, sem afetar o conteúdo mostrado.
    M.Store.registrarPrimeiraVisualizacaoPendencia(pendId);
    const ov = ensureDom();
    const html = renderConteudoAtual();
    if(html==null){ M.Drawer.fechar(); return; }
    document.getElementById("drawerPanel").innerHTML = html;
    ov.classList.add("open");
  };

  M.Drawer.fechar = function(){
    const ov = document.getElementById("drawerOverlay");
    if(ov) ov.classList.remove("open");
    estadoAtual = null;
  };

  // Chamado pelo Store.subscribe (ver js/main.js) toda vez que o estado
  // muda — mantém o drawer "vivo": ação feita nele mesmo (ex.: marcar
  // resolvida) já reflete sem precisar fechar/reabrir. Se o item some do
  // estado, fecha sozinho em vez de mostrar um painel quebrado.
  M.Drawer.refresh = function(){
    if(!estadoAtual) return;
    const painel = document.getElementById("drawerPanel");
    if(!painel) return;
    const html = renderConteudoAtual();
    if(html==null){ M.Drawer.fechar(); return; }
    painel.innerHTML = html;
  };

  // "Abrir completo" (item 24): não existe uma tela de detalhe full-page
  // separada pra Pendência — o caminho de "mais completo que o drawer" é a
  // Lista de Pendências, filtrada pra essa obra pra facilitar achar o item
  // em meio às outras (item 34: não inventar tela nova).
  M.Drawer.abrirCompletoPendencia = function(pendId){
    const p = M.Store.state.pendencias.find(x=>x.id===pendId);
    M.Drawer.fechar();
    if(p && p.obraId) M.UIState.pendFiltro.obraId = p.obraId;
    M.Act.go("#/pendencias");
  };
  M.Drawer.abrirHistoricoCompletoPendencia = function(pendId){
    const p = M.Store.state.pendencias.find(x=>x.id===pendId);
    M.Drawer.fechar();
    if(p && p.obraId){ M.UIState.obraTab[p.obraId] = "historico"; M.Act.go("#/obra/"+p.obraId); }
  };
})();
