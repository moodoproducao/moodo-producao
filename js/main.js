/* ============================================================
   MOODO PRODUÇÃO — bootstrap / shell
   ============================================================ */
(function(){
  "use strict";
  const M = window.M;
  const UI = M.UI;
  const APP_VERSION = "3.0.3";

  function usuarioAtualColab(){
    return M.colabByNome(M.Store.state.usuarioAtual) || M.COLABORADORES[9];
  }
  function isOperador(colab){ return colab && (colab.perfil==="OPERADOR" || colab.perfil==="MONTADOR"); }

  function navHtml(activeKey, mobile, colab){
    const op = isOperador(colab);
    const renderItem = (it)=> mobile
      ? `<a class="m-link ${it.key===activeKey?'active':''}" href="${it.route}">${UI.icon(it.icon,20)}${it.label}</a>`
      : `<a class="nav-link ${it.key===activeKey?'active':''}" href="${it.route}">${UI.icon(it.icon,16)}${it.label}</a>`;
    if(mobile){
      const flat = op ? M.Router.MOBILE_NAV_OPERADOR : [
        {key:"dashboard",label:"Início",icon:"home",route:"#/dashboard"},
        {key:"producao",label:"Produção",icon:"kanban",route:"#/producao"},
        {key:"pendencias",label:"Pendências",icon:"alert",route:"#/pendencias"},
        {key:"tarefas",label:"Tarefas",icon:"list",route:"#/tarefas"},
        {key:"meu-painel",label:"Eu",icon:"user",route:"#/meu-painel"}];
      return flat.map(renderItem).join("");
    }
    const menu = op ? M.Router.MENU_OPERADOR : M.Router.MENU;
    return menu.map(g=> `
      ${g.group? `<div class="nav-label">${g.group}</div>`:""}
      <div class="nav-group">${g.items.map(renderItem).join("")}</div>
    `).join("");
  }
  function footerHtml(activeKey, colab){
    const op = isOperador(colab);
    const footer = op ? M.Router.FOOTER_OPERADOR : M.Router.FOOTER;
    return footer.map(it=> `<a class="nav-link ${it.key===activeKey?'active':''}" href="${it.route}">${UI.icon(it.icon,16)}${it.label}</a>`).join("");
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
    const fn = M.Router.ROUTES[key] || M.Router.ROUTES["dashboard"];
    let page;
    try{
      page = fn(params) || {html:"<p>Página não encontrada.</p>"};
    }catch(e){
      console.error(e);
      page = {title:"Erro", html:`<div class="card pad"><b>Ocorreu um erro ao renderizar esta página.</b><pre style="white-space:pre-wrap;font-size:11px;color:#a33">${UI.esc(e.message)}\n${UI.esc(e.stack||"")}</pre></div>`};
    }
    document.body.classList.toggle("tv-mode", key==="chao-de-fabrica");
    const app = document.getElementById("app");
    if(key==="chao-de-fabrica"){
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
      location.hash = isOperador(colab) ? "#/meu-painel" : "#/dashboard";
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
