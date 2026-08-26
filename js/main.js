/* ============================================================
   MOODO PRODUÇÃO — bootstrap / shell
   ============================================================ */
(function(){
  "use strict";
  const M = window.M;
  const UI = M.UI;
  const APP_VERSION = "3.15.2";

  function usuarioAtualColab(){
    return M.colabByNome(M.Store.state.usuarioAtual) || M.COLABORADORES[9];
  }

  // FASE 2 (Navegação V2): a navegação inteira (desktop e mobile) vem de
  // M.Router.menuDoPerfil(perfilKey) — uma lista de itens JÁ na ordem e no
  // recorte certos pro perfil, definida em js/router.js (MENU_POR_PERFIL).
  // Não existe mais menu "cheio" vs. "reduzido" no código — cada perfil tem
  // a sua lista, ponto. O filtro de permissão continua existindo em cima
  // (defesa em profundidade: mesmo que um item apareça na lista do perfil,
  // só renderiza se M.Store.pode(perm) for true) — item sem "perm" é de
  // acesso universal, igual sempre foi.
  const filtraPorPermissao = (items)=> items.filter(it=>{
    if(!it.perm) return true;
    return Array.isArray(it.perm) ? it.perm.some(p=>M.Store.pode(p)) : M.Store.pode(it.perm);
  });

  // FASE 2 (ajuste pós-aprovação — checagem de mobile pequeno pedida antes do
  // publish): validado ao vivo em 375/360/320px. Até 6 itens (ex.: Gestor)
  // cabem soltos na barra sem precisar rolar. Com 7 (hoje só o Admin), o
  // último item ficava cortado bem na borda da tela, sem nenhuma pista
  // visual de que dava pra rolar até ele — "navegação desconfortável" de
  // verdade, não só teórica, então NÃO ficou como estava. Em vez de
  // redesenhar a barra pra todo mundo, só quem excede o limite ganha um
  // botão "Mais" no lugar do 6º item em diante — os 5 primeiros do perfil
  // continuam soltos, fixos, do jeito que já estavam. Ninguém perde item;
  // ninguém que já cabia (≤6) muda de comportamento.
  const MOBILE_LIMITE_SEM_MAIS = 6;
  const MOBILE_ITENS_FIXOS_COM_MAIS = 5;

  function navHtml(activeKey, mobile, colab){
    const itens = filtraPorPermissao(M.Router.menuDoPerfil(colab.perfil));
    const renderItem = (it, tam)=> `<a class="m-link ${it.key===activeKey?'active':''}" href="${it.route}">${UI.icon(it.icon,tam)}${it.label}</a>`;
    if(!mobile){
      const renderDesktop = (it)=> `<a class="nav-link ${it.key===activeKey?'active':''}" href="${it.route}">${UI.icon(it.icon,16)}${it.label}</a>`;
      return `<div class="nav-group">${itens.map(renderDesktop).join("")}</div>`;
    }
    if(itens.length <= MOBILE_LIMITE_SEM_MAIS){
      return itens.map(it=> renderItem(it,20)).join("");
    }
    const principais = itens.slice(0, MOBILE_ITENS_FIXOS_COM_MAIS);
    const extras = itens.slice(MOBILE_ITENS_FIXOS_COM_MAIS);
    const maisContemAtivo = extras.some(it=> it.key===activeKey);
    const painelAberto = !!(M.UIState && M.UIState.mobileMaisAberto);
    return `
      ${principais.map(it=> renderItem(it,20)).join("")}
      <button type="button" class="m-link m-mais ${maisContemAtivo||painelAberto?'active':''}" onclick="Act.toggleMobileMais()">
        ${UI.icon('more-horizontal',20)}Mais
      </button>
      ${painelAberto ? `
        <div class="mobile-mais-painel" onclick="event.stopPropagation()">
          ${extras.map(it=> `<a class="mobile-mais-item ${it.key===activeKey?'active':''}" href="${it.route}">${UI.icon(it.icon,18)}${it.label}</a>`).join("")}
        </div>
        <div class="mobile-mais-backdrop" onclick="Act.toggleMobileMais()"></div>
      ` : ""}
    `;
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
  // HOTFIX 3.13.2: qualquer <input>/<textarea> com `id` que dispare um
  // rerender completo a cada oninput (app.innerHTML = ...) perdia foco E
  // cursor a cada tecla digitada — só sobrava o último caractere (achado no
  // smoke test de produção da Fase 6: filtro "Equipe/responsável" da
  // Agenda). Mesmo princípio já documentado em Act.editarPassoFluxo
  // ("digitar não pode reabrir/re-renderizar, perderia o foco") — aqui é
  // genérico, direto no render(), pra cobrir qualquer campo assim (atual
  // ou futuro), sem precisar de um afterRender por página. Só reage se o
  // elemento focado no instante do render tiver id (assim dá pra
  // reencontrá-lo depois do innerHTML novo) — não afeta cliques em botão,
  // <select>, nem nada sem id.
  function capturarFocoParaRestaurar(){
    const el = document.activeElement;
    if(!el || !el.id) return null;
    if(el.tagName!=="INPUT" && el.tagName!=="TEXTAREA") return null;
    let selStart=null, selEnd=null;
    try{ selStart = el.selectionStart; selEnd = el.selectionEnd; }catch(e){ /* alguns tipos de <input> (ex.: number) não suportam seleção */ }
    return {id: el.id, selStart, selEnd};
  }
  function restaurarFoco(captura){
    if(!captura) return;
    const el = document.getElementById(captura.id);
    if(!el) return;
    el.focus();
    if(captura.selStart!=null && typeof el.setSelectionRange==="function"){
      try{ el.setSelectionRange(captura.selStart, captura.selEnd); }catch(e){ /* idem */ }
    }
  }

  function render(){
    const hashAtual = location.hash;
    const navegou = hashAtual !== ultimoHashRenderizado;
    ultimoHashRenderizado = hashAtual;
    // FASE 2 (ajuste pós-aprovação): painel "Mais" da barra mobile fecha
    // sozinho em toda navegação de verdade (clicar num item de dentro dele já
    // muda o hash, então isso cobre o caso comum; também cobre back/forward
    // do navegador). Re-render por mudança de estado na mesma tela (navegou
    // false) não mexe nisso — o toggle do próprio botão só muda UIState, não
    // o hash, então o painel abre/fecha normalmente por cima.
    if(navegou && M.UIState) M.UIState.mobileMaisAberto = false;
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
      const focoRestritoAntes = capturarFocoParaRestaurar();
      appRestrito.innerHTML = shell(key, page);
      restaurarFoco(focoRestritoAntes);
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
    const focoAntes = capturarFocoParaRestaurar();
    if(key==="chao-de-fabrica" || key==="tv"){
      app.innerHTML = page.html;
    }else{
      app.innerHTML = shell(key, page);
    }
    restaurarFoco(focoAntes);
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
    // FASE 2 (Navegação V2 — "Hoje contextual"): Hoje passa a ser o destino
    // inicial de TODO perfil, sem exceção — antes Produção/Montador caíam
    // direto em "Minha Produção" (#/meu-painel). Essa rota continua existindo
    // (alias legado, não some do app — só some do menu), só deixa de ser o
    // destino automático. O conteúdo de "Hoje" já se adapta por perfil
    // (ver js/pages/hoje.js, que já filtra por verTodasObras/contexto).
    if(!location.hash) location.hash = "#/hoje";
    render();
    M.Store.subscribe(render);
    // FASE 7.5 (Context Drawer — item 21): o drawer vive FORA de #app (igual
    // o modal), então sobrevive ao innerHTML novo de cada render() — mas
    // por isso também precisa da própria assinatura pra se atualizar sozinho
    // quando uma ação feita dentro dele (ex.: marcar resolvida) muda o estado.
    if(M.Drawer) M.Store.subscribe(M.Drawer.refresh);

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
