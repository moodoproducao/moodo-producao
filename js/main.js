/* ============================================================
   MOODO PRODUÇÃO — bootstrap / shell
   ============================================================ */
(function(){
  "use strict";
  const M = window.M;
  const UI = M.UI;
  const APP_VERSION = "3.6.1";

  function usuarioAtualColab(){
    return M.colabByNome(M.Store.state.usuarioAtual) || M.COLABORADORES[9];
  }
  function isOperador(colab){ return colab && (colab.perfil==="OPERADOR" || colab.perfil==="MONTADOR"); }

  // FASE 1 (V2 — permissões por ação, camada MENU): item com "perm" só entra
  // se M.Store.pode(perm) for verdadeiro; item sem "perm" continua sempre
  // visível (comportamento inalterado). Aditivo sobre a troca binária
  // MENU/MENU_OPERADOR que já existia — não substitui, só filtra em cima.
  const filtraPorPermissao = (items)=> items.filter(it=> !it.perm || M.Store.pode(it.perm));

  function navHtml(activeKey, mobile, colab){
    const op = isOperador(colab);
    const renderItem = (it)=> mobile
      ? `<a class="m-link ${it.key===activeKey?'active':''}" href="${it.route}">${UI.icon(it.icon,20)}${it.label}</a>`
      : `<a class="nav-link ${it.key===activeKey?'active':''}" href="${it.route}">${UI.icon(it.icon,16)}${it.label}</a>`;
    if(mobile){
      const flat = op ? M.Router.MOBILE_NAV_OPERADOR : [
        {key:"hoje",label:"Hoje",icon:"home",route:"#/hoje"},
        {key:"producao",label:"Produção",icon:"kanban",route:"#/producao"},
        {key:"pendencias",label:"Pendências",icon:"alert",route:"#/pendencias"},
        {key:"tarefas",label:"Tarefas",icon:"list",route:"#/tarefas"},
        {key:"meu-painel",label:"Eu",icon:"user",route:"#/meu-painel"}];
      return filtraPorPermissao(flat).map(renderItem).join("");
    }
    const menu = op ? M.Router.MENU_OPERADOR : M.Router.MENU;
    return menu.map(g=> `
      ${g.group? `<div class="nav-label">${g.group}</div>`:""}
      <div class="nav-group">${filtraPorPermissao(g.items).map(renderItem).join("")}</div>
    `).join("");
  }
  function footerHtml(activeKey, colab){
    const op = isOperador(colab);
    const footer = filtraPorPermissao(op ? M.Router.FOOTER_OPERADOR : M.Router.FOOTER);
    const links = footer.map(it=> `<a class="nav-link ${it.key===activeKey?'active':''}" href="${it.route}">${UI.icon(it.icon,16)}${it.label}</a>`).join("");
    // regrupamento visual (Fase 6 — handoff): rótulo "Administração" sobre os
    // mesmos links Equipe/Configurações já existentes — não muda visibilidade
    // nem permissão (OPERADOR/MONTADOR continuam só com FOOTER_OPERADOR, sem
    // o rótulo, igual hoje), é só o mesmo padrão .nav-label usado no menu.
    return op ? links : `<div class="nav-label">Administração</div>${links}`;
  }

  function perfilSwitcherHtml(colab){
    const options = M.COLABORADORES.map(c=> `<option value="${UI.esc(c.nome)}" ${c.nome===colab.nome?'selected':''}>${UI.esc(c.nome)} — ${UI.esc(M.perfilDef(c.perfil).label)}</option>`).join("");
    return `
      <div class="flex-gap" style="padding:10px 12px 4px;">
        ${UI.avatar(colab.nome,"sm")}
        <select onchange="Act.trocarUsuario(this.value)" style="flex:1; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.14); color:#fff; border-radius:7px; padding:5px 6px; font-size:11px;">
          ${options}
        </select>
      </div>
      <div style="padding:2px 12px 10px;"><span class="chip brand" style="background:rgba(255,255,255,0.1); color:#e7e8ea;">${UI.esc(M.perfilDef(colab.perfil).label)}</span></div>
    `;
  }

  function connBadgeHtml(){
    const online = navigator.onLine!==false;
    return `<span class="conn-badge ${online?'':'offline'}" id="connBadge">${UI.icon(online?'wifi':'wifi-off',13)}${online?'Online':'Sem conexão'}</span>`;
  }

  function shell(activeKey, page){
    const colab = usuarioAtualColab();
    return `
      <div class="shell">
        <aside class="sidebar">
          <div class="brand">
            <img class="brand-logo" src="icons/brand/moodo-mark-white.png" alt="Moodo">
            <div class="tag">Produção</div>
          </div>
          <div style="flex:1; overflow-y:auto;">${navHtml(activeKey,false,colab)}</div>
          <div class="sidebar-footer">
            ${perfilSwitcherHtml(colab)}
            ${footerHtml(activeKey,colab)}
          </div>
        </aside>
        <div class="main">
          <div class="topbar">
            <div>
              <h1>${page.title||""}</h1>
              ${page.crumb? `<div class="crumb">${page.crumb}</div>`:""}
            </div>
            <div class="topbar-actions">${connBadgeHtml()} ${page.actionsHtml||""}</div>
          </div>
          <div class="content ${page.narrow?'narrow':''}">${page.html||""}</div>
        </div>
      </div>
      <nav class="mobile-nav">${navHtml(activeKey,true,colab)}</nav>
      <div id="pwaBannerSlot"></div>
    `;
  }

  // CORREÇÃO (auditoria): render() é chamado tanto em navegação real (troca de
  // hash) quanto toda vez que o estado muda (Store.subscribe(render) — ex.:
  // marcar um item de checklist, mover uma etapa). Antes, TODA chamada dava
  // window.scrollTo(0,0), então marcar um checklist no fim de uma lista longa
  // jogava a tela de volta pro topo. Agora só reseta o scroll quando o hash
  // realmente mudou (navegação de verdade); re-render por mudança de estado
  // na mesma página mantém a posição de rolagem.
  let ultimoHashRenderizado = null;
  function render(){
    const hashAtual = location.hash;
    const navegou = hashAtual !== ultimoHashRenderizado;
    ultimoHashRenderizado = hashAtual;
    const {key, params} = M.Router.parseHash();
    const fn = M.Router.ROUTES[key] || M.Router.ROUTES["hoje"];
    let page;
    // FASE 1 (V2 — permissões por ação, camada ROTA): "não basta esconder
    // botão" — se a rota exige uma ação (M.Router.ROUTE_PERMS) e o perfil
    // atual não pode fazer essa ação, a função de página de verdade nem é
    // chamada, mesmo que a pessoa tenha chegado aqui digitando a URL direto
    // (não só pelo menu). Ex. obrigatório da Fase 1: Montador em "#/nova-obra"
    // cai aqui, não em M.Pages.novaObra(). O valor em ROUTE_PERMS pode ser
    // uma string (uma permissão) ou um array (BASTA UMA das listadas —
    // usado por "obra", que aceita qualquer um dos 3 tipos de acesso
    // contextual: ver comentário em js/router.js).
    //
    // AJUSTE (rodada 3, item 1): "obra" (detalhe) é caso especial — não
    // basta ter uma das 3 permissões, tem que ser dono do CONTEXTO daquela
    // obra específica pedida na URL (params[0] = obraId). Isso é decidido
    // por M.Store.podeAbrirObra(obraId), não pelo check genérico de
    // string/array — ver comentário completo em js/store.js.
    const permNecessaria = M.Router.ROUTE_PERMS && M.Router.ROUTE_PERMS[key];
    const temPermissaoDaRota = key==="obra"
      ? M.Store.podeAbrirObra(params[0])
      : (!permNecessaria || (Array.isArray(permNecessaria)
          ? permNecessaria.some(p=> M.Store.pode(p))
          : M.Store.pode(permNecessaria)));
    if(permNecessaria && !temPermissaoDaRota){
      const msgObra = `Esta obra não está no seu contexto (nenhuma tarefa, pendência ou assistência atribuída a você nela).`;
      const msgPadrao = `Seu perfil (<b>${UI.esc(M.Store.perfilAtual().label)}</b>) não tem acesso a esta área.`;
      page = {title:"Acesso restrito",
        html:`<div class="card pad"><p>${key==="obra" ? msgObra : msgPadrao}</p></div>`};
      document.body.classList.toggle("tv-mode", false);
      const appRestrito = document.getElementById("app");
      appRestrito.innerHTML = shell(key, page);
      if(navegou) window.scrollTo(0,0);
      renderPwaBanner();
      return;
    }
    try{
      page = fn(params) || {html:"<p>Página não encontrada.</p>"};
    }catch(e){
      console.error(e);
      page = {title:"Erro", html:`<div class="card pad"><b>Ocorreu um erro ao renderizar esta página.</b><pre style="white-space:pre-wrap;font-size:11px;color:#a33">${UI.esc(e.message)}\n${UI.esc(e.stack||"")}</pre></div>`};
    }
    document.body.classList.toggle("tv-mode", key==="chao-de-fabrica" || key==="tv");
    const app = document.getElementById("app");
    if(key==="chao-de-fabrica" || key==="tv"){
      app.innerHTML = page.html;
    }else{
      app.innerHTML = shell(key, page);
    }
    if(typeof page.afterRender === "function") page.afterRender();
    if(navegou) window.scrollTo(0,0);
    renderPwaBanner();
  }

  // ---------- PWA: online/offline + banner de nova versão ----------
  function renderPwaBanner(){
    const slot = document.getElementById("pwaBannerSlot");
    if(!slot) return;
    if(M.UIState && M.UIState.novaVersaoDisponivel){
      slot.innerHTML = `
        <div class="pwa-banner">
          <div>${UI.icon('refresh',16)} <b>Nova versão disponível</b><div class="muted" style="margin-top:2px;">Atualize quando terminar a tarefa atual.</div></div>
          <button class="btn sm primary" onclick="location.reload()">Atualizar</button>
        </div>`;
    } else {
      slot.innerHTML = "";
    }
  }
  window.addEventListener("online", ()=>{ const b=document.getElementById("connBadge"); if(b){ b.classList.remove("offline"); b.innerHTML = UI.icon('wifi',13)+'Online'; } UI.toast("Conexão restabelecida."); });
  window.addEventListener("offline", ()=>{ const b=document.getElementById("connBadge"); if(b){ b.classList.add("offline"); b.innerHTML = UI.icon('wifi-off',13)+'Sem conexão'; } UI.toast("Sem conexão — as ações serão sincronizadas quando a internet voltar."); });

  window.addEventListener("hashchange", render);
  window.addEventListener("DOMContentLoaded", ()=>{
    if(!location.hash){
      const colab = usuarioAtualColab();
      location.hash = isOperador(colab) ? "#/meu-painel" : "#/hoje";
    }
    render();
    M.Store.subscribe(render);

    // PWA: registra service worker (cache básico do shell) e escuta atualização
    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("service-worker.js?v="+APP_VERSION).then(reg=>{
        reg.addEventListener("updatefound", ()=>{
          const nw = reg.installing;
          if(!nw) return;
          nw.addEventListener("statechange", ()=>{
            if(nw.state==="installed" && navigator.serviceWorker.controller){
              M.UIState.novaVersaoDisponivel = true;
              renderPwaBanner();
            }
          });
        });
      }).catch(()=>{ /* PWA é opcional — segue sem cache offline se falhar */ });
    }
  });
  M.render = render;
  M.APP_VERSION = APP_VERSION;
})();
